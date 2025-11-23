"""FastAPI application powering the Tier-5 web UI and admin panel."""

from __future__ import annotations

import json
import os
import tempfile
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import logging
import re

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.config import (
    get_corrected_prompts_path,
    get_default_reviewer_id,
    get_governance_path,
    get_labeled_queue_path,
    get_review_queue_path,
    get_turn_log_path,
)
from app.main import build_orchestrator
from core.data_views import (
    iter_jsonl,
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
    get_pending_entry,
)
from core.orchestrator import Orchestrator, OrchestratorResponse
from core.intent_config import load_intent_config
from core.tooling.store_config import DATA_STORE_TO_TOOL, TOOL_TO_STORE, is_mutating_action
from core.text_utils import hash_text
from core.governance import GovernancePolicy, GovernancePolicyViolation

REVIEWER_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{2,64}$")
logger = logging.getLogger(__name__)
PURGE_STATE_PATH = Path("reports/purge_state.json")
EVAL_RESULTS_PATH = Path("reports/eval_results.json")
CLASSIFIER_REPORT_PATH = Path("reports/intent_classifier.json")


STATIC_DIR = Path("web/static")
EXPORT_DIR = Path("data_pipeline/nlu_training_bucket/exports")



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
    training_duplicate: bool = False


def _format_response(result: OrchestratorResponse) -> Dict[str, Any]:
    """WHAT: reshape ``OrchestratorResponse`` into the UI schema.

    WHY: the FastAPI layer and frontend agreed on a single contract so every
    route/test can rely on consistent keys (tool payload, extras, timing).
    HOW: pull structured fields off the orchestrator result, wrapping tool
    metadata into a nested dict that mirrors the dashboard panels.
    """
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
    """WHAT: helper for optional JSON reads (reports, stats caches).

    WHY: the dashboard probes several optional files during startup; a missing
    or partially-written file should not crash the service.
    HOW: check existence first, then attempt ``json.load`` and swallow decode
    errors by returning ``None`` so callers can provide defaults.
    """
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        try:
            return json.load(handle)
        except json.JSONDecodeError:
            return None


def _parse_timestamp(value: object) -> Optional[datetime]:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text.replace("Z", "+00:00")
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _summarize_turn_log(path: Path, *, days: int = 7, sample_limit: int = 5) -> Dict[str, Any]:
    summary = {
        "daily_intent_counts": {},
        "avg_latency_ms": None,
        "policy_violation_count": 0,
        "policy_violation_samples": [],
    }
    if not path.exists():
        return summary
    now = datetime.now(tz=timezone.utc)
    cutoff = now - timedelta(days=days)
    daily: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))  # type: ignore[var-annotated]
    latencies: List[float] = []
    violation_samples: List[dict] = []
    violation_count = 0
    for row in iter_jsonl(path):
        ts = _parse_timestamp(row.get("timestamp"))
        if ts and ts < cutoff:
            continue
        day_key = ts.strftime("%Y-%m-%d") if ts else "unknown"
        intent = row.get("intent")
        if isinstance(intent, str) and intent:
            daily[day_key][intent] += 1
        latency = row.get("latency_ms")
        if isinstance(latency, (int, float)):
            latencies.append(float(latency))
        extras = row.get("extras") or {}
        violation_meta = extras.get("policy_violation")
        if violation_meta or row.get("resolution_status") == "policy_violation":
            violation_count += 1
            if len(violation_samples) < sample_limit:
                violation_samples.append(
                    {
                        "timestamp": ts.isoformat() if ts else row.get("timestamp"),
                        "reason": (violation_meta or {}).get("reason") or "policy_violation",
                        "tool": (violation_meta or {}).get("tool") or row.get("tool_name"),
                        "user_text": row.get("user_text"),
                    }
                )
    if daily:
        ordered = {
            day: dict(intents)
            for day, intents in sorted(daily.items(), key=lambda item: item[0], reverse=True)
        }
        summary["daily_intent_counts"] = ordered
    if latencies:
        summary["avg_latency_ms"] = sum(latencies) / len(latencies)
    summary["policy_violation_count"] = violation_count
    summary["policy_violation_samples"] = violation_samples
    return summary


def _read_purge_state(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
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
    governance_policy: Optional[GovernancePolicy] = None,
    purge_state_path: Optional[Path] = None,
) -> FastAPI:
    """WHAT: instantiate FastAPI + Tier‑1 orchestrator wiring for reviewers.

    WHY: Tier‑5 tooling reuses the same orchestration stack as the CLI so every
    correction reflects actual runtime behavior while still exposing queue/file
    utilities for admin workflows.
    HOW: accept dependency overrides (tests), hydrate queue paths, run
    migrations (rehydrate/dedupe), cache directories on ``app.state``, and
    mount the static/export directories before registering routes.
    """
    orch = orchestrator or build_orchestrator()
    pending = pending_path or get_review_queue_path()
    labeled = labeled_path or get_labeled_queue_path()
    corrected = corrected_path or get_corrected_prompts_path()
    turn_log = turn_log_path or get_turn_log_path()
    static_root = static_dir or STATIC_DIR
    exports_root = export_dir or EXPORT_DIR
    policy = governance_policy or GovernancePolicy(get_governance_path())
    purge_state = purge_state_path or PURGE_STATE_PATH

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
    app.state.governance_policy = policy
    app.state.default_reviewer_id = get_default_reviewer_id()
    app.state.purge_state_path = purge_state

    app.mount("/static", StaticFiles(directory=static_root, check_dir=False), name="static")
    app.mount("/exports", StaticFiles(directory=exports_root, check_dir=False), name="exports")

    def _resolve_reviewer_id(request: Request) -> str:
        """Extract or default the reviewer identifier for the current request."""
        raw = request.headers.get("x-reviewer-id") or request.query_params.get("reviewer_id")
        default_id = app.state.default_reviewer_id
        if raw:
            candidate = raw.strip()
            if not candidate:
                raise HTTPException(status_code=400, detail="Reviewer ID cannot be blank.")
            if not REVIEWER_ID_PATTERN.fullmatch(candidate):
                raise HTTPException(
                    status_code=400,
                    detail="Reviewer ID must be 2-64 characters (letters, numbers, dot, underscore, or hyphen).",
                )
            return candidate
        logger.warning("Reviewer ID missing on %s; defaulting to '%s'.", request.url.path, default_id)
        return default_id

    @app.get("/", response_class=HTMLResponse)
    def root() -> str:
        """WHAT: deliver the built reviewer UI.

        WHY: Tier‑5 deploys the compiled SPA under ``web/static`` and expects
        this endpoint to inline the HTML when operators hit the root.
        HOW: read ``index.html`` from the configured static root and raise a
        404 with guidance when assets are missing.
        """
        index_path = app.state.static_root / "index.html"
        if not index_path.exists():
            raise HTTPException(status_code=404, detail="Web UI assets are missing. Run Tier-5 build.")
        return index_path.read_text(encoding="utf-8")

    @app.get("/api/health")
    def health_check() -> Dict[str, Any]:
        """WHAT: inexpensive uptime probe for orchestrator + FastAPI.

        WHY: CI and container monitors hit this endpoint to ensure the process
        is alive without triggering expensive chat/tool logic.
        HOW: return an OK status plus current UTC timestamp to aid log merges.
        """
        return {
            "status": "ok",
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }

    @app.post("/api/chat")
    def chat(payload: ChatRequest, request: Request) -> Dict[str, Any]:
        """WHAT: bridge user chat to Tier‑1 and seed the pending queue.

        WHY: every dashboard submission should run through the orchestrator so
        logging, probes, and dry-run semantics mirror the CLI/session behavior.
        HOW: run ``handle_message_with_details``, normalize extras/history, and
        persist a pending record (with conversation metadata) for reviewers.
        """
        message = payload.message.strip()
        if not message:
            raise HTTPException(status_code=400, detail="Message is required.")
        reviewer_id = _resolve_reviewer_id(request)
        result = app.state.orchestrator.handle_message_with_details(message)
        formatted = _format_response(result)
        policy_version = app.state.governance_policy.policy_version
        formatted_extras = dict(formatted.get("extras") or {})
        formatted_extras.setdefault("policy_version", policy_version)
        formatted_extras.setdefault("reviewer_id", reviewer_id)
        formatted["extras"] = formatted_extras
        formatted["policy_version"] = policy_version
        formatted["reviewer_id"] = reviewer_id
        history_prompts = [
            entry.get("user_text", "")
            for entry in formatted_extras.get("conversation_history") or []
            if isinstance(entry, dict) and entry.get("user_text")
        ]
        try:
            pending_result = append_pending_prompt(
                pending_path=app.state.pending_path,
                message=message,
                intent=result.nlu_result.intent,
                parser_payload=result.nlu_result.entities,
                confidence=result.nlu_result.confidence,
                reason=formatted.get("review_reason") or "chat_submission",
                extras=formatted_extras,
                tool_name=formatted.get("tool", {}).get("name"),
                staged=formatted_extras.get("staged", False),
                related_prompts=history_prompts,
                conversation_entry_id=formatted_extras.get("conversation_entry_id"),
                reviewer_id=reviewer_id,
            )
            if pending_result.get("record"):
                formatted["pending_record"] = pending_result["record"]
        except Exception:
            pass
        return formatted

    @app.get("/api/logs/pending")
    def pending_logs(limit: int = 25, page: int = 1) -> Dict[str, Any]:
        """WHAT: fetch paginated pending prompts for Tier‑5 reviewers.

        WHY: the queue drives the dashboard cards; exposing pagination keeps the
        HTTP payload manageable while surfacing per-intent summaries.
        HOW: cap page/limit inputs, call ``list_pending_with_hashes`` to ensure
        prompt ids/hashes exist, and augment response with queue summary/flags.
        """
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
        """WHAT: surface classifier mistakes/misses for manual QA.

        WHY: reviewers triage low-confidence or incorrect classifier turns to
        keep the model aligned with real chat distribution.
        HOW: delegate to ``review_classifier_predictions`` which filters the
        turn log plus labeled file for interesting entries.
        """
        findings = review_classifier_predictions(
            turn_log=app.state.turn_log_path,
            labeled_path=app.state.labeled_path,
            intent=intent,
            limit=max(1, min(limit, 200)),
        )
        return {"items": findings}

    @app.get("/api/logs/labeled")
    def labeled_logs(limit: int = 25, intent: Optional[str] = None) -> Dict[str, Any]:
        """WHAT: provide labeled samples for the Training tab.

        WHY: analysts export batches of reviewer labels when retraining NLU
        and need intent filters to drill into problem areas.
        HOW: call ``load_labeled_prompts`` with limit/intent filters and return
        the resulting list.
        """
        records = load_labeled_prompts(app.state.labeled_path, limit=max(1, min(limit, 200)), intent=intent)
        return {"items": records}

    @app.get("/api/logs/corrected")
    def corrected_logs(limit: int = 25, page: int = 1, intent: Optional[str] = None) -> Dict[str, Any]:
        """WHAT: paginate the corrected prompts JSONL for dashboard tables.

        WHY: Tier‑5 needs to browse reviewer corrections chronologically and
        filter by intent/tool to reconcile training stats.
        HOW: rely on ``load_corrected_prompts`` for pagination/filtering and
        return its structured dict (items + counts).
        """
        capped_limit = max(1, min(limit, 200))
        page = max(page, 1)
        data = load_corrected_prompts(
            app.state.corrected_path,
            limit=capped_limit,
            page=page,
            intent=intent,
        )
        return data

    @app.delete("/api/logs/corrected/{record_id}")
    def delete_corrected(record_id: str) -> Dict[str, Any]:
        """WHAT: remove corrected prompt rows that are no longer needed.

        WHY: experiments occasionally seed synthetic or duplicate labels; this
        endpoint lets admins prune them without editing files manually.
        HOW: stream the JSONL file, drop the matching row, rewrite the file,
        and raise 404s for unknown ids.
        """
        if not record_id:
            raise HTTPException(status_code=400, detail="record_id is required.")
        corrected_path = app.state.corrected_path
        if not corrected_path.exists():
            raise HTTPException(status_code=404, detail="No labeled prompts found.")
        removed = False
        remaining: List[dict] = []
        for row in iter_jsonl(corrected_path):
            if row.get("id") == record_id or row.get("correction_id") == record_id:
                removed = True
                continue
            remaining.append(row)
        if not removed:
            raise HTTPException(status_code=404, detail="Labeled prompt not found.")
        corrected_path.parent.mkdir(parents=True, exist_ok=True)
        with corrected_path.open("w", encoding="utf-8") as handle:
            for row in remaining:
                handle.write(json.dumps(row, ensure_ascii=False))
                handle.write("\n")
        return {"deleted": True}

    @app.post("/api/logs/label")
    def label_prompt(payload: CorrectionPayload, request: Request) -> Dict[str, Any]:
        """WHAT: persist reviewer corrections + trigger tool mutations.

        WHY: Tier‑5 workflows need both the audited corrected payloads and the
        ability to push changes into JSON stores when reviewers approve.
        HOW: normalize reviewer payload/action, run the target tool if the
        action mutates data, append a correction entry, drop pending rows (plus
        related prompts), and update conversation memory when available.
        """
        reviewer_id = _resolve_reviewer_id(request)
        reviewer_action = payload.action or str(payload.corrected_payload.get("action", "")).strip()
        corrected_payload = dict(payload.corrected_payload or {})
        if reviewer_action:
            corrected_payload["action"] = reviewer_action
        corrected_payload.setdefault("intent", payload.reviewer_intent)
        corrected_payload.setdefault("message", payload.prompt_text)

        predicted_payload = dict(payload.predicted_payload or {})
        updated_stores: List[str] = []
        tool_result: Optional[Dict[str, Any]] = None
        pending_record = get_pending_entry(app.state.pending_path, payload.prompt_id)

        store_id = TOOL_TO_STORE.get(payload.tool)
        action_value = str(corrected_payload.get("action") or "").strip().lower()
        should_mutate = is_mutating_action(payload.tool, action_value) and not payload.training_duplicate

        if should_mutate:
            try:
                tool_result = app.state.orchestrator.run_tool(payload.tool, corrected_payload)
            except GovernancePolicyViolation as exc:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": exc.user_message,
                        "policy_version": exc.policy_version,
                        "policy_violation": exc.to_metadata(),
                    },
                ) from exc
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
                reviewer_id=reviewer_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        delete_pending_entry(app.state.pending_path, payload.prompt_id)
        related_prompts = corrected_payload.get("related_prompts") or []
        for prompt_text in related_prompts:
            text_value = (prompt_text or "").strip()
            if not text_value:
                continue
            prompt_hash = hash_text(text_value)
            if prompt_hash:
                delete_pending_entry(app.state.pending_path, prompt_hash)
        if pending_record:
            conversation_entry_id = pending_record.get("conversation_entry_id")
            app.state.orchestrator.update_conversation_payload(conversation_entry_id, corrected_payload)

        return {
            "record": record,
            "updated_stores": updated_stores,
            "latest_tool_result": tool_result,
            "reviewer_id": reviewer_id,
        }

    @app.delete("/api/logs/pending/{prompt_id}")
    def delete_pending(prompt_id: str) -> Dict[str, Any]:
        """WHAT: discard pending queue entries without labeling them.

        WHY: some prompts are OOD or duplicates; reviewers need to drop them so
        the queue reflects only actionable records.
        HOW: call ``delete_pending_entry`` with the provided id/hash and return
        a confirmation or 404 when nothing matched.
        """
        if not prompt_id:
            raise HTTPException(status_code=400, detail="prompt_id is required.")
        removed = delete_pending_entry(app.state.pending_path, prompt_id)
        if not removed:
            raise HTTPException(status_code=404, detail="Pending intent not found.")
        return {"deleted": True}

    @app.get("/api/intents")
    def list_intents() -> Dict[str, Any]:
        """WHAT: expose current intent/action definitions for the UI.

        WHY: dropdowns in the Pending card and correction forms need canonical
        names to avoid drift with server-side validation.
        HOW: load ``intent_config`` and return both the string list and action
        per intent map.
        """
        config = load_intent_config()
        return {
            "intents": config.names(),
            "actions": {definition.name: definition.actions for definition in config.definitions()},
        }

    @app.post("/api/logs/export")
    def export_prompts(fmt: str = "csv", dedupe: bool = True) -> Dict[str, Any]:
        """WHAT: snapshot pending prompts for offline analysis.

        WHY: analysts need to copy the queue into spreadsheets for audits or
        bulk labeling and require dedupe controls for repeated prompts.
        HOW: validate format, call ``export_pending`` into a timestamped folder,
        and translate output paths into mount-relative URLs for download.
        """
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
        """WHAT: bulk ingest CSV/JSON labels exported from spreadsheets.

        WHY: Tier‑5 reviewers may label prompts offline; importing batches keeps
        the labeled JSONL in sync and dedupes against existing hashes.
        HOW: persist upload to a temp file, call ``append_labels`` with format
        metadata, and delete the temp file regardless of success.
        """
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
        """WHAT: expose tool-backed list actions for the Data Stores tab.

        WHY: reviewers preview current JSON stores (todos, calendar, etc.)
        without writing custom scripts, ensuring the UI mirrors backend state.
        HOW: map ``store_id`` to a tool via ``DATA_STORE_TO_TOOL`` and run the
        orchestrator with its list payload.
        """
        config = DATA_STORE_TO_TOOL.get(store_id)
        if not config:
            raise HTTPException(status_code=404, detail="Unknown data store.")
        payload = dict(config.get("list_payload", {"action": "list"}))
        result = app.state.orchestrator.run_tool(config["tool"], payload)
        return result

    @app.post("/api/data/{store_id}")
    def mutate_store(store_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """WHAT: allow direct CRUD mutations from the Data Stores tab.

        WHY: admins occasionally fix data without walkthrough prompts; this
        endpoint lets them run tool commands directly.
        HOW: validate payload shape, ensure the store is known, forward the
        request to the corresponding tool, and bubble up tool errors as HTTP 400.
        """
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
        """WHAT: aggregate pending/labeled stats for dashboard cards.

        WHY: reviewers rely on the home view to gauge queue health and model
        progress without opening each tab.
        HOW: call ``summarize_pending_queue``, count corrected rows, sample
        recent pending entries, and optionally include the classifier report.
        """
        pending_summary = summarize_pending_queue(app.state.pending_path)
        corrected_count = count_jsonl_rows(app.state.corrected_path)
        classifier_report = _read_json_if_exists(CLASSIFIER_REPORT_PATH)
        policy: GovernancePolicy = app.state.governance_policy
        turn_metrics = _summarize_turn_log(app.state.turn_log_path)
        purge_state = _read_purge_state(app.state.purge_state_path)
        eval_report = _read_json_if_exists(EVAL_RESULTS_PATH)
        return {
            "pending": pending_summary,
            "labeled_count": corrected_count,
            "corrected_count": corrected_count,
            "pending_sample": list_recent_pending(app.state.pending_path, limit=25),
            "classifier_report": classifier_report,
            "policy_version": policy.policy_version,
            "allowed_tools": list(policy.allowed_tools),
            "allowed_models": list(policy.allowed_models),
            "retention_limits": policy.retention_limits,
            "last_purge_timestamp": purge_state.get("last_run") if purge_state else None,
            "avg_latency_ms": turn_metrics["avg_latency_ms"],
            "daily_intent_counts": turn_metrics["daily_intent_counts"],
            "policy_violation_count": turn_metrics["policy_violation_count"],
            "policy_violation_samples": turn_metrics["policy_violation_samples"],
            "eval_results": eval_report,
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
