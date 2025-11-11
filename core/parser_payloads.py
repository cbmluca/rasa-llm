"""Helpers for normalizing parser payloads before logging or storage."""

from __future__ import annotations

from typing import Any, Dict

FIELD_ALIASES = {
    "start_time": "start",
    "start_at": "start",
    "start_datetime": "start",
    "end_time": "end",
    "end_at": "end",
    "end_datetime": "end",
    "due": "deadline",
    "due_at": "deadline",
    "due_date": "deadline",
    "deadline_at": "deadline",
    "location_name": "location",
    "notes_text": "notes",
    "note": "notes",
    "status_text": "status",
}

_DROP_FIELDS = {"message"}


def normalize_parser_payload(payload: Dict[str, Any] | None) -> Dict[str, Any]:
    """Return a shallow copy with canonical field names for downstream tools."""

    if not payload:
        return {}
    normalized: Dict[str, Any] = {}
    for key, value in payload.items():
        if key in _DROP_FIELDS:
            continue
        target = FIELD_ALIASES.get(key, key)
        normalized[target] = value
    return normalized


__all__ = ["normalize_parser_payload"]
