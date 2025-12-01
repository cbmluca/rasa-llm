"""FastAPI application powering the Tier-5 web UI and admin panel."""

from __future__ import annotations

import hmac
import io
import json
import os
import tempfile
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

import logging
import re

from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.config import (
    get_corrected_prompts_path,
    get_default_reviewer_id,
    get_governance_path,
    get_labeled_queue_path,
    get_llm_api_key,
    get_review_queue_path,
    get_reviewer_token,
    get_speech_to_text_model,
    get_turn_log_path,
    get_voice_daily_minutes_budget,
    get_voice_inbox_max_entries,
    get_voice_inbox_path,
)
from app.main import build_orchestrator
from core import auth
from core.data_views import (
    iter_jsonl,
    iter_pending_prompts,
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
from core.voice_inbox import (
    append_voice_inbox_entry,
    build_voice_entry,
    delete_voice_entry,
    estimate_voice_minutes,
    find_voice_entry,
    read_voice_inbox_entries,
    VoiceInboxEntry,
)

REVIEWER_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{2,64}$")
logger = logging.getLogger(__name__)
PURGE_STATE_PATH = Path("reports/purge_state.json")
EVAL_RESULTS_PATH = Path("reports/eval_results.json")
CLASSIFIER_REPORT_PATH = Path("reports/intent_classifier.json")


STATIC_DIR = Path("web/static")
EXPORT_DIR = Path("data_pipeline/nlu_training_bucket/exports")
VOICE_UPLOAD_DIR = Path("data_pipeline/voice_uploads")


class SpeechServiceError(Exception):
    """Raised when a speech transcription request cannot complete."""


_CONTENT_TYPE_EXTENSIONS = {
    "audio/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
}


def _infer_extension(filename: Optional[str], content_type: Optional[str]) -> str:
    suffix = Path(filename or "").suffix if filename else ""
    if suffix:
        return suffix.lower()
    if content_type:
        return _CONTENT_TYPE_EXTENSIONS.get(content_type.lower(), ".webm")
    return ".webm"


def _transcribe_audio_bytes(payload: bytes, filename: str) -> str:
    """Call OpenAI Whisper (or equivalent) and return the transcript text."""

    api_key = get_llm_api_key()
    if not api_key:
        raise SpeechServiceError("OPENAI_API_KEY is required for speech uploads.")
    try:
        from openai import OpenAI  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise SpeechServiceError("OpenAI package is not installed.") from exc

    model = get_speech_to_text_model()
    client = OpenAI(api_key=api_key)
    buffer = io.BytesIO(payload)
    buffer.name = filename
    try:
        response = client.audio.transcriptions.create(model=model, file=buffer)
    except Exception as exc:  # pragma: no cover - network/SDK errors
        raise SpeechServiceError(f"Transcription request failed: {exc}") from exc

    text: Optional[str]
    if isinstance(response, dict):  # legacy client
        text = response.get("text")
    else:
        text = getattr(response, "text", None)
    if not text:
        raise SpeechServiceError("Transcription response did not include text.")
    return str(text).strip()


class ChatRequest(BaseModel):
    message: str


class LoginPayload(BaseModel):
    username: str
    password: str


class VoiceInboxActionPayload(BaseModel):
    entry_id: str


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


def _summarize_voice_inbox_entries(path: Path) -> Dict[str, Any]:
    """Return usage totals plus the raw entries for voice inbox tooling."""

    entries = read_voice_inbox_entries(path) if path.exists() else []
    now = datetime.now(tz=timezone.utc)
    total_minutes = 0.0
    today_minutes = 0.0
    for entry in entries:
        minutes = float(entry.voice_minutes or 0.0)
        total_minutes += minutes
        entry_ts = _parse_timestamp(entry.timestamp)
        if entry_ts and entry_ts.date() == now.date():
            today_minutes += minutes
    return {
        "entries": entries,
        "total_minutes": round(total_minutes, 3),
        "today_minutes": round(today_minutes, 3),
    }


def _sort_voice_entries(entries: List[VoiceInboxEntry]) -> List[VoiceInboxEntry]:
    """Return entries ordered by timestamp (newest first)."""

    def _key(entry: VoiceInboxEntry) -> float:
        ts = _parse_timestamp(entry.timestamp)
        return ts.timestamp() if ts else 0.0

    return sorted(entries, key=_key, reverse=True)


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
    voice_inbox_path: Optional[Path] = None,
    voice_upload_dir: Optional[Path] = None,
    reviewer_token: Optional[str] = None,
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
    inbox_path = voice_inbox_path or get_voice_inbox_path()
    uploads_dir = voice_upload_dir or VOICE_UPLOAD_DIR
    policy = governance_policy or GovernancePolicy(get_governance_path())
    purge_state = purge_state_path or PURGE_STATE_PATH
    token = reviewer_token if reviewer_token is not None else get_reviewer_token()

    rehydrate_labeled_prompts(labeled_path=labeled, pending_path=pending)
    dedupe_pending_prompts(pending)

    static_root.mkdir(parents=True, exist_ok=True)
    exports_root.mkdir(parents=True, exist_ok=True)
    inbox_path.parent.mkdir(parents=True, exist_ok=True)
    if not inbox_path.exists():
        inbox_path.write_text("[]", encoding="utf-8")
    uploads_dir.mkdir(parents=True, exist_ok=True)

    app = FastAPI(title="Tier-5 Web API", version="1.0.0")
    app.state.orchestrator = orch
    app.state.pending_path = pending
    app.state.labeled_path = labeled
    app.state.corrected_path = corrected
    app.state.turn_log_path = turn_log
    app.state.static_root = static_root
    app.state.export_root = exports_root
    app.state.voice_inbox_path = inbox_path
    app.state.voice_upload_dir = uploads_dir
    app.state.governance_policy = policy
    app.state.default_reviewer_id = get_default_reviewer_id()
    app.state.reviewer_token = token
    app.state.purge_state_path = purge_state
    app.state.session_manager = auth.SessionManager()
    app.state.quota_manager = auth.QuotaManager()
    app.state.default_admin_user = auth.DEFAULT_ADMIN_USERNAME

    app.mount("/static", StaticFiles(directory=static_root, check_dir=False), name="static")
    app.mount("/exports", StaticFiles(directory=exports_root, check_dir=False), name="exports")

    def _require_reviewer_token(request: Request) -> None:
        """Enforce the shared reviewer token when configured."""

        expected = app.state.reviewer_token
        if not expected:
            return
        provided = request.headers.get("x-reviewer-token") or request.query_params.get("reviewer_token")
        if not provided or not provided.strip():
            raise HTTPException(status_code=401, detail="Reviewer token missing. Include X-Reviewer-Token.")
        candidate = provided.strip()
        if not hmac.compare_digest(candidate, expected):
            raise HTTPException(status_code=403, detail="Reviewer token is invalid.")

    def _require_authenticated_user(request: Request) -> auth.UserRecord:
        """Return the user tied to the active session or fallback reviewer token."""

        session_token = request.cookies.get(auth.SESSION_COOKIE_NAME)
        if session_token:
            session_user = app.state.session_manager.get_user(session_token)
            if session_user:
                return session_user
        if app.state.reviewer_token:
            _require_reviewer_token(request)
            fallback_user = auth.get_user(app.state.default_admin_user)
            if fallback_user:
                return fallback_user
        raise HTTPException(status_code=401, detail="Authentication required.")

    def _require_admin_user(request: Request) -> auth.UserRecord:
        user = _require_authenticated_user(request)
        if not user.is_admin():
            raise HTTPException(status_code=403, detail="Admin access required.")
        return user

    def _filter_records_for_user(records: list[dict], user: auth.UserRecord) -> list[dict]:
        if user.is_admin():
            return records
        return [record for record in records if auth.record_owner(record) == user.username]

    def _summarize_records(records: list[dict]) -> dict:
        total = len(records)
        by_intent: Dict[str, int] = {}
        for record in records:
            intent = record.get("intent") or record.get("parser_intent") or "nlu_fallback"
            by_intent[intent] = by_intent.get(intent, 0) + 1
        return {"total": total, "by_intent": by_intent}

    def _filter_store_result(data: Dict[str, Any], user: auth.UserRecord) -> Dict[str, Any]:
        if user.is_admin():
            return data
        filtered = dict(data)
        for key, value in data.items():
            if isinstance(value, list):
                filtered[key] = [item for item in value if auth.record_owner(item) == user.username]
        if "todos" in filtered:
            filtered["count"] = len(filtered["todos"])
        return filtered

    def _handle_chat_submission(message: str, user: auth.UserRecord, *, submission_reason: str) -> Dict[str, Any]:
        """Run a chat message through the orchestrator + pending queue plumbing."""

        clean = (message or "").strip()
        if not clean:
            raise HTTPException(status_code=400, detail="Message is required.")
        try:
            app.state.quota_manager.consume_prompt(user)
        except auth.QuotaExceededError as exc:
            raise HTTPException(status_code=429, detail=str(exc))
        result = app.state.orchestrator.handle_message_with_details(clean)
        formatted = _format_response(result)
        policy_version = app.state.governance_policy.policy_version
        formatted_extras = dict(formatted.get("extras") or {})
        formatted_extras.setdefault("policy_version", policy_version)
        formatted_extras.setdefault("reviewer_id", user.username)
        formatted_extras.setdefault("user_id", user.username)
        formatted["extras"] = formatted_extras
        formatted["policy_version"] = policy_version
        formatted["reviewer_id"] = user.username
        formatted["user_id"] = user.username
        review_reason = formatted.get("review_reason") or submission_reason or "chat_submission"
        formatted["review_reason"] = review_reason
        history_prompts = [
            entry.get("user_text", "")
            for entry in formatted_extras.get("conversation_history") or []
            if isinstance(entry, dict) and entry.get("user_text")
        ]
        try:
            pending_result = append_pending_prompt(
                pending_path=app.state.pending_path,
                message=clean,
                intent=result.nlu_result.intent,
                parser_payload=result.nlu_result.entities,
                confidence=result.nlu_result.confidence,
                reason=review_reason,
                extras=formatted_extras,
                tool_name=formatted.get("tool", {}).get("name"),
                staged=formatted_extras.get("staged", False),
                related_prompts=history_prompts,
                conversation_entry_id=formatted_extras.get("conversation_entry_id"),
                reviewer_id=user.username,
                user_id=user.username,
            )
            if pending_result.get("record"):
                formatted["pending_record"] = pending_result["record"]
        except Exception:
            pass
        return formatted

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

    @app.post("/api/login")
    def login(payload: LoginPayload, response: Response) -> Dict[str, Any]:
        normalized = payload.username.strip()
        if not normalized:
            raise HTTPException(status_code=400, detail="Username is required.")
        user = auth.authenticate(normalized, payload.password or "")
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials.")
        session_token = app.state.session_manager.create_session(user.username)
        response.set_cookie(
            auth.SESSION_COOKIE_NAME,
            session_token,
            httponly=True,
            secure=False,
            samesite="lax",
            max_age=auth.SESSION_MAX_AGE_SECONDS,
        )
        return {
            "username": user.username,
            "roles": sorted(user.roles),
            "usage": app.state.quota_manager.get_usage(user),
        }

    @app.post("/api/logout")
    def logout(request: Request, response: Response) -> Dict[str, str]:
        session_token = request.cookies.get(auth.SESSION_COOKIE_NAME)
        if session_token:
            app.state.session_manager.destroy_session(session_token)
        response.delete_cookie(auth.SESSION_COOKIE_NAME)
        return {"status": "ok"}

    @app.get("/api/me")
    def me(request: Request) -> Dict[str, Any]:
        user = _require_authenticated_user(request)
        return {
            "username": user.username,
            "roles": sorted(user.roles),
            "usage": app.state.quota_manager.get_usage(user),
        }

    @app.post("/api/chat")
    def chat(request: Request, payload: ChatRequest) -> Dict[str, Any]:
        reviewer = _require_authenticated_user(request)
        return _handle_chat_submission(payload.message, reviewer, submission_reason="chat_submission")

    @app.post("/api/speech")
    async def speech(request: Request, audio: UploadFile = File(...)) -> Dict[str, Any]:
        """WHAT: accept short recordings, transcribe them, and reuse chat flow."""

        user = _require_authenticated_user(request)
        if audio is None:
            raise HTTPException(status_code=400, detail="Audio file is required.")
        payload = await audio.read()
        if not payload:
            raise HTTPException(status_code=400, detail="Audio file cannot be empty.")
        entry_id = uuid4().hex
        ext = _infer_extension(audio.filename, audio.content_type)
        upload_dir: Path = app.state.voice_upload_dir
        upload_dir.mkdir(parents=True, exist_ok=True)
        audio_path = upload_dir / f"{entry_id}{ext}"
        audio_path.write_bytes(payload)

        transcription_status = "error"
        transcription_text = ""
        pending_id: Optional[str] = None
        chat_payload: Optional[Dict[str, Any]] = None
        error_detail: Optional[str] = None

        try:
            transcription_text = _transcribe_audio_bytes(payload, audio_path.name)
            transcription_status = "completed"
            chat_payload = _handle_chat_submission(
                transcription_text,
                user,
                submission_reason="voice_submission",
            )
            pending_record = chat_payload.get("pending_record") or {}
            pending_id = pending_record.get("prompt_id") or pending_record.get("id")
        except SpeechServiceError as exc:
            error_detail = str(exc)
            transcription_text = ""
            transcription_status = "error"

        voice_entry = append_voice_inbox_entry(
            app.state.voice_inbox_path,
            build_voice_entry(
                entry_id=entry_id,
                audio_path=audio_path,
                text=transcription_text,
                status=transcription_status,
                reviewer_id=user.username,
                pending_id=pending_id,
                voice_minutes=estimate_voice_minutes(len(payload)),
            ),
            max_entries=get_voice_inbox_max_entries(),
        )

        response: Dict[str, Any] = {
            "transcription_status": transcription_status,
            "text": transcription_text,
            "pending_id": pending_id,
            "voice_entry": voice_entry.to_dict(),
        }
        if chat_payload is not None:
            response["chat"] = chat_payload
        if error_detail:
            response["error"] = error_detail
        return response

    @app.get("/api/voice_inbox")
    def voice_inbox(request: Request, limit: int = 25, page: int = 1) -> Dict[str, Any]:
        """WHAT: expose stored voice submissions for Tier-7 reviewers."""

        _require_authenticated_user(request)
        capped_limit = max(1, min(limit, 100))
        page = max(page, 1)
        summary = _summarize_voice_inbox_entries(app.state.voice_inbox_path)
        entries = _sort_voice_entries(summary["entries"])
        total_entries = len(entries)
        start = (page - 1) * capped_limit
        page_entries = entries[start : start + capped_limit]
        has_more = start + len(page_entries) < total_entries
        budget = get_voice_daily_minutes_budget()
        remaining = round(max(0.0, budget - summary["today_minutes"]), 3)
        return {
            "items": [entry.to_dict() for entry in page_entries],
            "total_entries": total_entries,
            "limit": capped_limit,
            "page": page,
            "has_more": has_more,
            "voice_minutes_total": summary["total_minutes"],
            "voice_minutes_today": summary["today_minutes"],
            "voice_minutes_budget": budget,
            "voice_minutes_remaining": remaining,
            "max_entries": get_voice_inbox_max_entries(),
        }

    @app.post("/api/voice_inbox/rerun")
    def voice_inbox_rerun(payload: VoiceInboxActionPayload, request: Request) -> Dict[str, Any]:
        """WHAT: rerun the stored transcription through the chat flow."""

        user = _require_authenticated_user(request)
        summary = _summarize_voice_inbox_entries(app.state.voice_inbox_path)
        entry = find_voice_entry(summary["entries"], payload.entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Voice inbox entry not found.")
        if not entry.transcribed_text:
            raise HTTPException(status_code=400, detail="Entry has no transcription to rerun.")
        chat_payload = _handle_chat_submission(
            entry.transcribed_text,
            user,
            submission_reason="voice_rerun",
        )
        extras = chat_payload.setdefault("extras", {})
        extras.setdefault("correction_note", f"Voice rerun from inbox {entry.id}")
        extras["voice_rerun_entry"] = entry.id
        chat_payload["review_reason"] = "voice_rerun"
        return {"chat": chat_payload, "voice_entry": entry.to_dict()}

    @app.post("/api/voice_inbox/delete")
    def voice_inbox_delete(payload: VoiceInboxActionPayload, request: Request) -> Dict[str, Any]:
        """WHAT: remove a voice entry and its uploaded audio."""

        _require_authenticated_user(request)
        deleted = delete_voice_entry(app.state.voice_inbox_path, payload.entry_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Voice inbox entry not found.")
        audio_path = Path(deleted.audio_path)
        try:
            if audio_path.exists():
                audio_path.unlink()
        except OSError:
            logger.warning("Failed to delete voice upload %s.", audio_path)
        return {"deleted_entry_id": deleted.id}

    @app.get("/api/logs/pending")
    def pending_logs(request: Request, limit: int = 25, page: int = 1) -> Dict[str, Any]:
        """WHAT: fetch paginated pending prompts for Tier‑5 reviewers.

        WHY: the queue drives the dashboard cards; exposing pagination keeps the
        HTTP payload manageable while surfacing per-intent summaries.
        HOW: cap page/limit inputs, call ``list_pending_with_hashes`` to ensure
        prompt ids/hashes exist, and augment response with queue summary/flags.
        """
        _require_authenticated_user(request)
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
    def classifier_logs(request: Request, limit: int = 25, intent: Optional[str] = None) -> Dict[str, Any]:
        """WHAT: surface classifier mistakes/misses for manual QA.

        WHY: reviewers triage low-confidence or incorrect classifier turns to
        keep the model aligned with real chat distribution.
        HOW: delegate to ``review_classifier_predictions`` which filters the
        turn log plus labeled file for interesting entries.
        """
        user = _require_admin_user(request)
        findings = review_classifier_predictions(
            turn_log=app.state.turn_log_path,
            labeled_path=app.state.labeled_path,
            intent=intent,
            limit=max(1, min(limit, 200)),
        )
        return {"items": findings}

    @app.get("/api/logs/labeled")
    def labeled_logs(request: Request, limit: int = 25, intent: Optional[str] = None) -> Dict[str, Any]:
        """WHAT: provide labeled samples for the Training tab.

        WHY: analysts export batches of reviewer labels when retraining NLU
        and need intent filters to drill into problem areas.
        HOW: call ``load_labeled_prompts`` with limit/intent filters and return
        the resulting list.
        """
        _require_admin_user(request)
        records = load_labeled_prompts(app.state.labeled_path, limit=max(1, min(limit, 200)), intent=intent)
        return {"items": records}

    @app.get("/api/logs/corrected")
    def corrected_logs(request: Request, limit: int = 25, page: int = 1, intent: Optional[str] = None) -> Dict[str, Any]:
        """WHAT: paginate the corrected prompts JSONL for dashboard tables.

        WHY: Tier‑5 needs to browse reviewer corrections chronologically and
        filter by intent/tool to reconcile training stats.
        HOW: rely on ``load_corrected_prompts`` for pagination/filtering and
        return its structured dict (items + counts).
        """
        _require_admin_user(request)
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
    def delete_corrected(record_id: str, request: Request) -> Dict[str, Any]:
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
        reviewer = _require_admin_user(request)
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
                reviewer_id=reviewer.username,
                user_id=reviewer.username,
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
            "reviewer_id": reviewer.username,
        }

    @app.delete("/api/logs/pending/{prompt_id}")
    def delete_pending(prompt_id: str, request: Request) -> Dict[str, Any]:
        """WHAT: discard pending queue entries without labeling them.

        WHY: some prompts are OOD or duplicates; reviewers need to drop them so
        the queue reflects only actionable records.
        HOW: call ``delete_pending_entry`` with the provided id/hash and return
        a confirmation or 404 when nothing matched.
        """
        _require_admin_user(request)
        if not prompt_id:
            raise HTTPException(status_code=400, detail="prompt_id is required.")
        removed = delete_pending_entry(app.state.pending_path, prompt_id)
        if not removed:
            raise HTTPException(status_code=404, detail="Pending intent not found.")
        return {"deleted": True}

    @app.get("/api/intents")
    def list_intents(request: Request) -> Dict[str, Any]:
        """WHAT: expose current intent/action definitions for the UI.

        WHY: dropdowns in the Pending card and correction forms need canonical
        names to avoid drift with server-side validation.
        HOW: load ``intent_config`` and return both the string list and action
        per intent map.
        """
        _require_authenticated_user(request)
        config = load_intent_config()
        return {
            "intents": config.names(),
            "actions": {definition.name: definition.actions for definition in config.definitions()},
        }

    @app.post("/api/logs/export")
    def export_prompts(request: Request, fmt: str = "csv", dedupe: bool = True) -> Dict[str, Any]:
        """WHAT: snapshot pending prompts for offline analysis.

        WHY: analysts need to copy the queue into spreadsheets for audits or
        bulk labeling and require dedupe controls for repeated prompts.
        HOW: validate format, call ``export_pending`` into a timestamped folder,
        and translate output paths into mount-relative URLs for download.
        """
        _require_admin_user(request)
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
    async def import_labels(request: Request, file: UploadFile = File(...), fmt: str = Form("csv"), dedupe: bool = Form(True)) -> Dict[str, Any]:
        """WHAT: bulk ingest CSV/JSON labels exported from spreadsheets.

        WHY: Tier‑5 reviewers may label prompts offline; importing batches keeps
        the labeled JSONL in sync and dedupes against existing hashes.
        HOW: persist upload to a temp file, call ``append_labels`` with format
        metadata, and delete the temp file regardless of success.
        """
        _require_admin_user(request)
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
    def list_store(store_id: str, request: Request) -> Dict[str, Any]:
        """WHAT: expose tool-backed list actions for the Data Stores tab.

        WHY: reviewers preview current JSON stores (todos, calendar, etc.)
        without writing custom scripts, ensuring the UI mirrors backend state.
        HOW: map ``store_id`` to a tool via ``DATA_STORE_TO_TOOL`` and run the
        orchestrator with its list payload.
        """
        user = _require_authenticated_user(request)
        config = DATA_STORE_TO_TOOL.get(store_id)
        if not config:
            raise HTTPException(status_code=404, detail="Unknown data store.")
        payload = dict(config.get("list_payload", {"action": "list"}))
        result = app.state.orchestrator.run_tool(config["tool"], payload)
        return _filter_store_result(result, user)

    @app.post("/api/data/{store_id}")
    def mutate_store(store_id: str, payload: Dict[str, Any], request: Request) -> Dict[str, Any]:
        """WHAT: allow direct CRUD mutations from the Data Stores tab.

        WHY: admins occasionally fix data without walkthrough prompts; this
        endpoint lets them run tool commands directly.
        HOW: validate payload shape, ensure the store is known, forward the
        request to the corresponding tool, and bubble up tool errors as HTTP 400.
        """
        _require_admin_user(request)
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
    def stats(request: Request) -> Dict[str, Any]:
        """WHAT: aggregate pending/labeled stats for dashboard cards.

        WHY: reviewers rely on the home view to gauge queue health and model
        progress without opening each tab.
        HOW: call ``summarize_pending_queue``, count corrected rows, sample
        recent pending entries, and optionally include the classifier report.
        """
        user = _require_authenticated_user(request)
        pending_summary = (
            summarize_pending_queue(app.state.pending_path)
            if user.is_admin()
            else _summarize_records(
                _filter_records_for_user(list(iter_pending_prompts(app.state.pending_path)), user)
            )
        )
        corrected_count = count_jsonl_rows(app.state.corrected_path)
        classifier_report = _read_json_if_exists(CLASSIFIER_REPORT_PATH)
        policy: GovernancePolicy = app.state.governance_policy
        turn_metrics = _summarize_turn_log(app.state.turn_log_path)
        purge_state = _read_purge_state(app.state.purge_state_path)
        eval_report = _read_json_if_exists(EVAL_RESULTS_PATH)
        voice_summary = _summarize_voice_inbox_entries(app.state.voice_inbox_path)
        voice_budget = get_voice_daily_minutes_budget()
        voice_remaining = round(max(0.0, voice_budget - voice_summary["today_minutes"]), 3)
        return {
            "pending": pending_summary,
            "labeled_count": corrected_count,
            "corrected_count": corrected_count,
            "pending_sample": _filter_records_for_user(list_recent_pending(app.state.pending_path, limit=25), user),
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
            "voice_stats": {
                "total_minutes": voice_summary["total_minutes"],
                "today_minutes": voice_summary["today_minutes"],
                "daily_budget_minutes": voice_budget,
                "minutes_remaining": voice_remaining,
                "total_entries": len(voice_summary["entries"]),
                "max_entries": get_voice_inbox_max_entries(),
            },
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
