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
    """Return an ISO-8601 string for the current UTC timestamp."""

    return datetime.now(tz=timezone.utc).isoformat()


@dataclass
class TurnRecord:
    """Capture the structured details of a single conversational turn."""

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
        """Factory helper that auto-populates the timestamp."""

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
    """Flag a turn that needs manual review or future retraining."""

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
        """Factory helper that auto-populates the timestamp."""

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
    """JSONL writer for turn transcripts and review queues."""

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
    ) -> None:
        self._turn_log_path = turn_log_path
        self._review_log_path = review_log_path
        self._enabled = enabled
        self._redact = redact
        self._max_bytes = max_bytes
        self._backup_count = backup_count
        selected = tuple(patterns) if patterns else _KNOWN_PATTERNS.keys()
        self._redaction_patterns = [
            (key, _KNOWN_PATTERNS[key])
            for key in selected
            if key in _KNOWN_PATTERNS
        ]
        self._redaction_patterns.sort(key=lambda item: _PATTERN_PRIORITY.get(item[0], 10))

    def log_turn(self, record: TurnRecord) -> None:
        """Persist a turn record if logging is enabled."""

        if not self._enabled:
            return
        self._append_json_line(self._turn_log_path, asdict(record))

    def log_review_item(self, review: ReviewItem) -> None:
        """Persist a review queue item if logging is enabled."""

        if not self._enabled:
            return
        self._append_json_line(self._review_log_path, asdict(review))

    def _append_json_line(self, path: Path, payload: Dict[str, Any]) -> None:
        """Serialize a payload as newline-delimited JSON."""

        path.parent.mkdir(parents=True, exist_ok=True)
        prepared = self._prepare_payload(payload)
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
        """Expose the logger state for callers that need quick checks."""

        return self._enabled

    def _prepare_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not self._redact or not self._redaction_patterns:
            return payload

        redacted: Dict[str, Any] = {}
        for key, value in payload.items():
            if key in _REDACT_FIELDS:
                redacted[key] = self._scrub_value(value)
            else:
                redacted[key] = value
        return redacted

    def _scrub_value(self, value: Any) -> Any:
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
        sanitized = value
        for key, pattern in self._redaction_patterns:
            token = f"[REDACTED_{key.upper()}]"
            sanitized = pattern.sub(token, sanitized)
        return sanitized

    def _rotate_if_needed(self, path: Path, incoming_bytes: int) -> None:
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
