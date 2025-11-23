"""Structured logging utilities for Tier-2 observability.

This module centralizes the JSONL-based logging used across the runtime.  It
exposes a minimal wrapper that the orchestrator can call after each turn to
persist both the conversational flow (``TurnRecord``) and any follow-up review
items (``ReviewItem``) that downstream tiers can process.  The records rely on
dataclasses so schema evolution remains easy to track in code while still
producing UI-friendly JSON objects.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, IO, Iterable, Optional, Pattern

from core.governance import GovernancePolicy


_KNOWN_PATTERNS: Dict[str, Pattern[str]] = {
    "email": re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE),
    "phone": re.compile(r"(?:\+?\d[\d\s\-().]{6,}\d)"),
    "credit_card": re.compile(r"\b(?:\d[ -]*){13,19}\b"),
    "gov_id": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "url": re.compile(r"https?://[^\s]+", re.IGNORECASE),
}
_PATTERN_PRIORITY: Dict[str, int] = {
    "credit_card": 0,
    "gov_id": 1,
    "email": 2,
    "phone": 3,
    "url": 4,
}
_REDACT_FIELDS = {
    "user_text",
    "response_text",
    "response_summary",
    "entities",
    "parser_payload",
    "tool_payload",
    "metadata",
    "extras",
    "reason",
}


def _utc_now() -> str:
    """WHAT: produce ISO-8601 UTC timestamps for log records.

    WHY: turn/review entries rely on consistent timestamps for ordering,
    cross-service correlation, and UI display.
    HOW: wrap ``datetime.now(tz=UTC).isoformat()`` so call sites stay concise.
    """

    return datetime.now(tz=timezone.utc).isoformat()


@dataclass
class TurnRecord:
    """WHAT: structured schema for a single orchestrated turn.

    WHY: Tier‑2 logs must capture intent/confidence/entities/tools/extras so
    Tier‑5 reviewers and analytics scripts can replay any decision.
    HOW: dataclass storing immutable turn attributes, plus ``new`` factory to
    auto-populate timestamps without leaking ``datetime`` to call sites.
    """

    timestamp: str
    user_text: str
    intent: str
    confidence: float
    entities: Dict[str, Any] = field(default_factory=dict)
    tool_name: str | None = None
    tool_payload: Dict[str, Any] | None = None
    tool_success: bool | None = None
    response_text: str = ""
    response_summary: str | None = None
    resolution_status: str = "unknown"
    latency_ms: int | None = None
    fallback_triggered: bool = False
    metadata: Dict[str, Any] | None = None
    extras: Dict[str, Any] | None = None

    @classmethod
    def new(
        cls,
        *,
        user_text: str,
        intent: str,
        confidence: float,
        entities: Dict[str, Any] | None = None,
        tool_name: str | None = None,
        tool_payload: Dict[str, Any] | None = None,
        tool_success: bool | None = None,
        response_text: str = "",
        response_summary: str | None = None,
        resolution_status: str = "unknown",
        latency_ms: int | None = None,
        fallback_triggered: bool = False,
        metadata: Dict[str, Any] | None = None,
        extras: Dict[str, Any] | None = None,
    ) -> "TurnRecord":
        """WHAT: convenience constructor that injects timestamps + defaults.

        WHY: orchestrator callers only know the runtime data; adding consistent
        timestamps centrally keeps logging uniform.
        HOW: call the dataclass constructor with ``_utc_now`` outputs and
        fallback dicts for optional fields.
        """

        return cls(
            timestamp=_utc_now(),
            user_text=user_text,
            intent=intent,
            confidence=confidence,
            entities=entities or {},
            tool_name=tool_name,
            tool_payload=tool_payload,
            tool_success=tool_success,
            response_text=response_text,
            response_summary=response_summary,
            resolution_status=resolution_status,
            latency_ms=latency_ms,
            fallback_triggered=fallback_triggered,
            metadata=metadata,
            extras=extras,
        )


@dataclass
class ReviewItem:
    """WHAT: schema for pending review items generated per turn.

    WHY: only a subset of turns enter the Tier‑5 queue; capturing intent,
    reason, payload, and metadata lets reviewers triage quickly.
    HOW: dataclass similar to ``TurnRecord`` with an auxiliary ``new`` helper
    that stamps timestamps automatically.
    """

    timestamp: str
    user_text: str
    intent: str
    confidence: float
    reason: str
    tool_name: str | None = None
    metadata: Dict[str, Any] | None = None
    extras: Dict[str, Any] | None = None
    prompt_id: Optional[str] = None
    parser_payload: Dict[str, Any] | None = None

    @classmethod
    def new(
        cls,
        *,
        user_text: str,
        intent: str,
        confidence: float,
        reason: str,
        tool_name: str | None = None,
        metadata: Dict[str, Any] | None = None,
        extras: Dict[str, Any] | None = None,
        prompt_id: Optional[str] = None,
        parser_payload: Dict[str, Any] | None = None,
    ) -> "ReviewItem":
        """WHAT: helper constructor mirroring ``TurnRecord.new`` semantics.

        WHY: orchestrator code should stay declarative when emitting review
        items; this keeps timestamp formatting centralized.
        HOW: instantiate ``ReviewItem`` with ``_utc_now`` + provided payloads.
        """

        return cls(
            timestamp=_utc_now(),
            user_text=user_text,
            intent=intent,
            confidence=confidence,
            reason=reason,
            tool_name=tool_name,
            metadata=metadata,
            extras=extras,
            prompt_id=prompt_id,
            parser_payload=parser_payload,
        )


class LearningLogger:
    """WHAT: central JSONL logger for turns + review items.

    WHY: Tier‑1/Tier‑5 observability hinges on consistent JSON schema, redacted
    PII, and bounded log files.
    HOW: accept file paths + redaction/rotation settings, expose ``log_turn``
    and ``log_review_item`` helpers, and encapsulate write/rotation logic.
    """

    def __init__(
        self,
        *,
        turn_log_path: Path,
        review_log_path: Path,
        enabled: bool = True,
        redact: bool = True,
        patterns: Iterable[str] | None = None,
        max_bytes: int = 0,
        backup_count: int = 0,
        governance_policy: Optional[GovernancePolicy] = None,
    ) -> None:
        self._turn_log_path = turn_log_path
        self._review_log_path = review_log_path
        self._enabled = enabled
        self._redact = redact
        self._max_bytes = max_bytes
        self._backup_count = backup_count
        self._governance_policy = governance_policy
        self._policy_version = governance_policy.policy_version if governance_policy else None
        selected = tuple(patterns) if patterns else _KNOWN_PATTERNS.keys()
        self._redaction_patterns = [
            (key, _KNOWN_PATTERNS[key])
            for key in selected
            if key in _KNOWN_PATTERNS
        ]
        self._redaction_patterns.sort(key=lambda item: _PATTERN_PRIORITY.get(item[0], 10))

    def log_turn(self, record: TurnRecord) -> None:
        """WHAT: persist a turn record to ``turn_log_path``.

        WHY: every turn should be traceable for audits; logging is gated by
        ``enabled`` so dev/test runs can disable it.
        HOW: exit early when disabled, otherwise serialize the dataclass and
        delegate to ``_append_json_line`` (which handles redaction/rotation).
        """

        if not self._enabled:
            return
        self._append_json_line(self._turn_log_path, asdict(record))

    def log_review_item(self, review: ReviewItem) -> None:
        """WHAT: persist review queue rows to ``review_log_path``.

        WHY: the pending queue importer scans this file to seed Tier‑5 tickets.
        HOW: same as ``log_turn``—skip when disabled, otherwise append JSONL.
        """

        if not self._enabled:
            return
        self._append_json_line(self._review_log_path, asdict(review))

    def _append_json_line(self, path: Path, payload: Dict[str, Any]) -> None:
        """WHAT: write payloads as newline-delimited JSON with rotation.

        WHY: centralizing the write ensures redaction + log rotation happen for
        every record regardless of caller.
        HOW: ensure directories exist, scrub/redact fields, encode to UTF-8,
        rotate if size limits are exceeded, and append to the file.
        """

        path.parent.mkdir(parents=True, exist_ok=True)
        working = dict(payload)
        if self._policy_version:
            working.setdefault("governance_policy_version", self._policy_version)
        prepared = self._prepare_payload(working)
        line = json.dumps(prepared, ensure_ascii=False)
        encoded = line.encode("utf-8")
        self._rotate_if_needed(path, len(encoded) + 1)
        with self._open_file(path) as handle:
            handle.write(line)
            handle.write("\n")

    @staticmethod
    def _open_file(path: Path) -> IO[str]:
        return path.open("a", encoding="utf-8")

    @property
    def enabled(self) -> bool:
        """WHAT: report whether logging is currently enabled.

        WHY: orchestrator callers occasionally skip expensive prep when logging
        is off; this property gives them a cheap check.
        HOW: return the stored boolean flag.
        """

        return self._enabled

    def _prepare_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """WHAT: redact sensitive fields before writing to disk.

        WHY: logs may leave the machine for analytics; removing emails/IDs keeps
        us compliant with storage policies.
        HOW: walk the payload dict, scrubbing configured fields recursively via
        ``_scrub_value`` when redaction is enabled.
        """
        payload = self._apply_policy_mask(payload)
        if not self._redact or not self._redaction_patterns:
            return payload

        redacted: Dict[str, Any] = {}
        for key, value in payload.items():
            if key in _REDACT_FIELDS:
                redacted[key] = self._scrub_value(value)
            else:
                redacted[key] = value
        return redacted

    def _apply_policy_mask(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Apply governance-driven PII masking before optional redaction."""
        if not self._governance_policy:
            return payload
        return self._governance_policy.mask_pii(payload)

    def _scrub_value(self, value: Any) -> Any:
        """WHAT: recursively redact nested values (dict/list/tuple/str).

        WHY: sensitive data can be nested inside payloads; recursion ensures we
        don't miss fields hidden inside extras/tool payloads.
        HOW: branch on container types and delegate to ``_scrub_string`` for
        leaf strings, returning the value unchanged otherwise.
        """
        if isinstance(value, dict):
            return {key: self._scrub_value(val) for key, val in value.items()}
        if isinstance(value, list):
            return [self._scrub_value(item) for item in value]
        if isinstance(value, tuple):
            return tuple(self._scrub_value(item) for item in value)
        if isinstance(value, str):
            return self._scrub_string(value)
        return value

    def _scrub_string(self, value: str) -> str:
        """WHAT: replace sensitive substrings (emails, cards) with tokens.

        WHY: PII often lives in user prompts/responses; replacing patterns with
        `[REDACTED_*]` keeps structure while hiding details.
        HOW: iterate configured regex patterns by priority and run ``sub`` with
        deterministic token names.
        """
        sanitized = value
        for key, pattern in self._redaction_patterns:
            token = f"[REDACTED_{key.upper()}]"
            sanitized = pattern.sub(token, sanitized)
        return sanitized

    def _rotate_if_needed(self, path: Path, incoming_bytes: int) -> None:
        """WHAT: enforce max log sizes with optional rotation.

        WHY: Tier‑1 can run indefinitely; unbounded JSONL files would exhaust
        disk space and slow downstream tooling.
        HOW: compare file size + incoming bytes against the configured limit,
        delete or rotate to numbered backups based on ``backup_count``.
        """
        if self._max_bytes <= 0:
            return
        if not path.exists():
            return

        current_size = path.stat().st_size
        if current_size + incoming_bytes <= self._max_bytes:
            return

        if self._backup_count <= 0:
            path.unlink()
            return

        for index in range(self._backup_count - 1, 0, -1):
            src = Path(f"{path}.{index}")
            dst = Path(f"{path}.{index + 1}")
            if src.exists():
                dst.parent.mkdir(parents=True, exist_ok=True)
                src.replace(dst)

        rotated = Path(f"{path}.1")
        if rotated.exists():
            rotated.unlink()
        path.replace(rotated)
