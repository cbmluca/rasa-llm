"""Reusable datetime helpers for parsers."""

from __future__ import annotations

import re
from typing import Optional

from core.text_parsing import parse_date_hint, parse_datetime_hint

_DATE_PATTERN = re.compile(r"\d{1,2}[./-]\d{1,2}[./-]\d{2,4}")
_DATE_TEXT_PATTERN = re.compile(r"\d{1,2}\s*[A-Za-zÆØÅæøå]+\s+\d{2,4}", re.IGNORECASE)


def find_date_in_text(message: str) -> Optional[str]:
    """Extract the first recognized date from ``message`` as ISO string."""

    if not message:
        return None
    for token in _DATE_PATTERN.findall(message):
        parsed = parse_date_hint(token)
        if parsed:
            return parsed.isoformat()
    for token in _DATE_TEXT_PATTERN.findall(message):
        parsed = parse_date_hint(token)
        if parsed:
            return parsed.isoformat()
    for word in message.split():
        parsed = parse_date_hint(word)
        if parsed:
            return parsed.isoformat()
    return None


def parse_datetime_hint_local(text: str) -> Optional[str]:
    """Convert casual datetime phrases into ISO timestamps for local use."""
    dt_value = parse_datetime_hint(text, default_time=None)
    return dt_value.isoformat() if dt_value else None


__all__ = ["find_date_in_text", "parse_datetime_hint_local"]
