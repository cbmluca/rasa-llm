"""FastAPI application powering the Tier-5 web UI and admin panel."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.config import (
    get_corrected_prompts_path,
    get_labeled_queue_path,
    get_review_queue_path,
    get_turn_log_path,
)
from app.main import build_orchestrator
from core.data_views import (
    append_correction_entry,
    append_labels,
    append_pending_prompt,
    count_jsonl_rows,
    dedupe_pending_prompts,
    delete_pending_entry,
    export_pending,
    list_pending_with_hashes,
    list_recent_pending,
    load_labeled_prompts,
    load_corrected_prompts,
    rehydrate_labeled_prompts,
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

TOOL_TO_STORE = {config["tool"]: store_id for store_id, config in DATA_STORE_TO_TOOL.items()}
STORE_MUTATING_ACTIONS = {
    "todos": {"create", "update", "delete"},
    "kitchen_tips": {"create"},
    "calendar": {"create", "update", "delete"},
    "app_guide": {"upsert", "delete"},
}


class ChatRequest(BaseModel):
    message: str


class CorrectionPayload(BaseModel):
    prompt_id: str
    prompt_text: str
    tool: str
    parser_intent: str = "nlu_fallback"
    reviewer_intent: str
    action: Optional[str] = None
    predicted_payload: Dict[str, Any] = Field(default_factory=dict)
    corrected_payload: Dict[str, Any]


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
    corrected_path: Optional[Path] = None,
    turn_log_path: Optional[Path] = None,
    static_dir: Optional[Path] = None,
    export_dir: Optional[Path] = None,
) -> FastAPI:
    orch = orchestrator or build_orchestrator()
    pending = pending_path or get_review_queue_path()
    labeled = labeled_path or get_labeled_queue_path()
    corrected = corrected_path or get_corrected_prompts_path()
    turn_log = turn_log_path or get_turn_log_path()
    static_root = static_dir or STATIC_DIR
    exports_root = export_dir or EXPORT_DIR

    rehydrate_labeled_prompts(labeled_path=labeled, pending_path=pending)
    dedupe_pending_prompts(pending)

    static_root.mkdir(parents=True, exist_ok=True)
    exports_root.mkdir(parents=True, exist_ok=True)

    app = FastAPI(title="Tier-5 Web API", version="1.0.0")
    app.state.orchestrator = orch
    app.state.pending_path = pending
    app.state.labeled_path = labeled
    app.state.corrected_path = corrected
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
        formatted = _format_response(result)
        try:
            pending_result = append_pending_prompt(
                pending_path=app.state.pending_path,
                message=message,
                intent=result.nlu_result.intent,
                parser_payload=result.nlu_result.entities,
                confidence=result.nlu_result.confidence,
                reason=formatted.get("review_reason") or "chat_submission",
                extras=formatted.get("extras"),
                tool_name=formatted.get("tool", {}).get("name"),
            )
            if pending_result.get("record"):
                formatted["pending_record"] = pending_result["record"]
        except Exception:
            pass
        return formatted

    @app.get("/api/logs/pending")
    def pending_logs(limit: int = 25, page: int = 1) -> Dict[str, Any]:
        capped_limit = max(1, min(limit, 200))
        page = max(page, 1)
        items = list_pending_with_hashes(app.state.pending_path, limit=capped_limit, page=page)
        for item in items:
            parser_payload = item.get("parser_payload") or {}
            item.setdefault("predicted_payload", parser_payload)
        summary = summarize_pending_queue(app.state.pending_path)
        has_more = page * capped_limit < summary.get("total", 0)
        return {
            "items": items,
            "summary": summary,
            "page": page,
            "limit": capped_limit,
            "has_more": has_more,
        }

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

    @app.get("/api/logs/corrected")
    def corrected_logs(limit: int = 25, page: int = 1, intent: Optional[str] = None) -> Dict[str, Any]:
        capped_limit = max(1, min(limit, 200))
        page = max(page, 1)
        data = load_corrected_prompts(
            app.state.corrected_path,
            limit=capped_limit,
            page=page,
            intent=intent,
        )
        return data

    @app.post("/api/logs/label")
    def label_prompt(payload: CorrectionPayload) -> Dict[str, Any]:
        reviewer_action = payload.action or str(payload.corrected_payload.get("action", "")).strip()
        corrected_payload = dict(payload.corrected_payload or {})
        if reviewer_action:
            corrected_payload["action"] = reviewer_action
        corrected_payload.setdefault("intent", payload.reviewer_intent)
        corrected_payload.setdefault("message", payload.prompt_text)

        predicted_payload = dict(payload.predicted_payload or {})
        updated_stores: List[str] = []
        tool_result: Optional[Dict[str, Any]] = None

        store_id = TOOL_TO_STORE.get(payload.tool)
        action_value = str(corrected_payload.get("action") or "").strip().lower()
        should_mutate = bool(store_id and action_value in STORE_MUTATING_ACTIONS.get(store_id, set()))

        if should_mutate:
            try:
                tool_result = app.state.orchestrator.run_tool(payload.tool, corrected_payload)
            except KeyError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            if isinstance(tool_result, dict) and tool_result.get("error"):
                raise HTTPException(status_code=400, detail=tool_result)
            updated_stores.append(store_id)  # refresh this tab client-side

        try:
            record = append_correction_entry(
                prompt_id=payload.prompt_id,
                prompt_text=payload.prompt_text,
                tool=payload.tool,
                parser_intent=payload.parser_intent,
                reviewer_intent=payload.reviewer_intent,
                reviewer_action=reviewer_action,
                predicted_payload=predicted_payload,
                corrected_payload=corrected_payload,
                corrected_path=app.state.corrected_path,
                updated_stores=updated_stores,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        delete_pending_entry(app.state.pending_path, payload.prompt_id)

        return {"record": record, "updated_stores": updated_stores, "latest_tool_result": tool_result}

    @app.delete("/api/logs/pending/{prompt_id}")
    def delete_pending(prompt_id: str) -> Dict[str, Any]:
        if not prompt_id:
            raise HTTPException(status_code=400, detail="prompt_id is required.")
        removed = delete_pending_entry(app.state.pending_path, prompt_id)
        if not removed:
            raise HTTPException(status_code=404, detail="Pending prompt not found.")
        return {"deleted": True}

    @app.get("/api/intents")
    def list_intents() -> Dict[str, Any]:
        config = load_intent_config()
        return {
            "intents": config.names(),
            "actions": {definition.name: definition.actions for definition in config.definitions()},
        }

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
        corrected_count = count_jsonl_rows(app.state.corrected_path)
        classifier_report = _read_json_if_exists(Path("reports/intent_classifier.json"))
        return {
            "pending": pending_summary,
            "labeled_count": corrected_count,
            "corrected_count": corrected_count,
            "pending_sample": list_recent_pending(app.state.pending_path, limit=25),
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
