"""FastAPI application powering the Tier-5 web UI and admin panel."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.config import (
    get_labeled_queue_path,
    get_review_queue_path,
    get_turn_log_path,
)
from app.main import build_orchestrator
from core.data_views import (
    append_label_entry,
    append_labels,
    count_jsonl_rows,
    export_pending,
    list_pending_with_hashes,
    load_labeled_prompts,
    review_classifier_predictions,
    summarize_pending_queue,
)
from core.orchestrator import Orchestrator, OrchestratorResponse
from core.intent_config import load_intent_config


STATIC_DIR = Path("web/static")
EXPORT_DIR = Path("data_pipeline/nlu_training_bucket/exports")


DATA_STORE_TO_TOOL = {
    "todos": {"tool": "todo_list", "list_payload": {"action": "list"}},
    "kitchen_tips": {"tool": "kitchen_tips", "list_payload": {"action": "list"}},
    "calendar": {"tool": "calendar_edit", "list_payload": {"action": "list"}},
    "app_guide": {"tool": "app_guide", "list_payload": {"action": "list"}},
}


class ChatRequest(BaseModel):
    message: str


class LabelPayload(BaseModel):
    text: str
    reviewer_intent: str
    parser_intent: str = "nlu_fallback"


def _format_response(result: OrchestratorResponse) -> Dict[str, Any]:
    return {
        "reply": result.text,
        "user_text": result.user_text,
        "intent": result.nlu_result.intent,
        "confidence": result.nlu_result.confidence,
        "entities": result.nlu_result.entities,
        "extras": result.extras,
        "tool": {
            "name": result.tool_name,
            "payload": result.tool_payload,
            "result": result.tool_result,
            "success": result.tool_success,
        },
        "resolution_status": result.resolution_status,
        "latency_ms": result.latency_ms,
        "review_reason": result.review_reason,
    }


def _read_json_if_exists(path: Path) -> Any:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        try:
            return json.load(handle)
        except json.JSONDecodeError:
            return None


def create_app(
    orchestrator: Optional[Orchestrator] = None,
    *,
    pending_path: Optional[Path] = None,
    labeled_path: Optional[Path] = None,
    turn_log_path: Optional[Path] = None,
    static_dir: Optional[Path] = None,
    export_dir: Optional[Path] = None,
) -> FastAPI:
    orch = orchestrator or build_orchestrator()
    pending = pending_path or get_review_queue_path()
    labeled = labeled_path or get_labeled_queue_path()
    turn_log = turn_log_path or get_turn_log_path()
    static_root = static_dir or STATIC_DIR
    exports_root = export_dir or EXPORT_DIR

    static_root.mkdir(parents=True, exist_ok=True)
    exports_root.mkdir(parents=True, exist_ok=True)

    app = FastAPI(title="Tier-5 Web API", version="1.0.0")
    app.state.orchestrator = orch
    app.state.pending_path = pending
    app.state.labeled_path = labeled
    app.state.turn_log_path = turn_log
    app.state.static_root = static_root
    app.state.export_root = exports_root

    app.mount("/static", StaticFiles(directory=static_root, check_dir=False), name="static")
    app.mount("/exports", StaticFiles(directory=exports_root, check_dir=False), name="exports")

    @app.get("/", response_class=HTMLResponse)
    def root() -> str:
        index_path = app.state.static_root / "index.html"
        if not index_path.exists():
            raise HTTPException(status_code=404, detail="Web UI assets are missing. Run Tier-5 build.")
        return index_path.read_text(encoding="utf-8")

    @app.get("/api/health")
    def health_check() -> Dict[str, Any]:
        return {
            "status": "ok",
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }

    @app.post("/api/chat")
    def chat(payload: ChatRequest) -> Dict[str, Any]:
        message = payload.message.strip()
        if not message:
            raise HTTPException(status_code=400, detail="Message is required.")
        result = app.state.orchestrator.handle_message_with_details(message)
        return _format_response(result)

    @app.get("/api/logs/pending")
    def pending_logs(limit: int = 25) -> Dict[str, Any]:
        items = list_pending_with_hashes(app.state.pending_path, limit=max(1, min(limit, 200)))
        summary = summarize_pending_queue(app.state.pending_path)
        return {"items": items, "summary": summary}

    @app.get("/api/logs/classifier")
    def classifier_logs(limit: int = 25, intent: Optional[str] = None) -> Dict[str, Any]:
        findings = review_classifier_predictions(
            turn_log=app.state.turn_log_path,
            labeled_path=app.state.labeled_path,
            intent=intent,
            limit=max(1, min(limit, 200)),
        )
        return {"items": findings}

    @app.get("/api/logs/labeled")
    def labeled_logs(limit: int = 25, intent: Optional[str] = None) -> Dict[str, Any]:
        records = load_labeled_prompts(app.state.labeled_path, limit=max(1, min(limit, 200)), intent=intent)
        return {"items": records}

    @app.post("/api/logs/label")
    def label_prompt(payload: LabelPayload) -> Dict[str, Any]:
        try:
            result = append_label_entry(
                text=payload.text,
                parser_intent=payload.parser_intent,
                reviewer_intent=payload.reviewer_intent,
                labeled_path=app.state.labeled_path,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return result

    @app.get("/api/intents")
    def list_intents() -> Dict[str, Any]:
        config = load_intent_config()
        return {"intents": config.names()}

    @app.post("/api/logs/export")
    def export_prompts(fmt: str = "csv", dedupe: bool = True) -> Dict[str, Any]:
        fmt = fmt.lower()
        if fmt not in {"csv", "json"}:
            raise HTTPException(status_code=400, detail="Format must be csv or json.")
        timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d-%H%M%S")
        target_dir = app.state.export_root / timestamp
        summary = export_pending(
            pending_path=app.state.pending_path,
            output_dir=target_dir,
            fmt=fmt,
            dedupe=dedupe,
        )
        files = []
        for file_path in summary.get("files", []):
            rel_path = Path(file_path)
            if rel_path.is_absolute():
                try:
                    rel_path = rel_path.relative_to(app.state.export_root)
                except ValueError:
                    pass
            files.append({"path": f"/exports/{rel_path.as_posix()}"})
        base_summary = {k: v for k, v in summary.items() if k not in {"files"}}
        return {"summary": base_summary, "files": files}

    @app.post("/api/logs/import")
    async def import_labels(file: UploadFile = File(...), fmt: str = Form("csv"), dedupe: bool = Form(True)) -> Dict[str, Any]:
        fmt_value = fmt.lower()
        if fmt_value not in {"csv", "json"}:
            raise HTTPException(status_code=400, detail="Format must be csv or json.")
        suffix = ".csv" if fmt_value == "csv" else ".json"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            contents = await file.read()
            tmp.write(contents)
            tmp_path = Path(tmp.name)
        try:
            outcome = append_labels(
                input_path=tmp_path,
                fmt=fmt_value,
                labeled_path=app.state.labeled_path,
                dedupe=dedupe,
            )
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        return outcome

    @app.get("/api/data/{store_id}")
    def list_store(store_id: str) -> Dict[str, Any]:
        config = DATA_STORE_TO_TOOL.get(store_id)
        if not config:
            raise HTTPException(status_code=404, detail="Unknown data store.")
        payload = dict(config.get("list_payload", {"action": "list"}))
        result = app.state.orchestrator.run_tool(config["tool"], payload)
        return result

    @app.post("/api/data/{store_id}")
    def mutate_store(store_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        config = DATA_STORE_TO_TOOL.get(store_id)
        if not config:
            raise HTTPException(status_code=404, detail="Unknown data store.")
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="Payload must be a JSON object.")
        payload = dict(payload)
        payload.setdefault("action", "list")
        result = app.state.orchestrator.run_tool(config["tool"], payload)
        if isinstance(result, dict) and result.get("error"):
            raise HTTPException(status_code=400, detail=result)
        return result

    @app.get("/api/stats")
    def stats() -> Dict[str, Any]:
        pending_summary = summarize_pending_queue(app.state.pending_path)
        labeled_count = count_jsonl_rows(app.state.labeled_path)
        classifier_report = _read_json_if_exists(Path("reports/intent_classifier.json"))
        return {
            "pending": pending_summary,
            "labeled_count": labeled_count,
            "classifier_report": classifier_report,
        }

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    from app.config import get_web_ui_host, get_web_ui_port

    uvicorn.run(
        "app.web_api:app",
        host=get_web_ui_host(),
        port=get_web_ui_port(),
        reload=False,
    )
