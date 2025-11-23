"""Reusable datetime helpers for parsers."""

from __future__ import annotations

import re
from typing import Optional

from core.text_parsing import parse_date_hint, parse_datetime_hint

_DATE_PATTERN = re.compile(r"\d{1,2}[./-]\d{1,2}[./-]\d{2,4}")
_DATE_TEXT_PATTERN = re.compile(r"\d{1,2}\s*[A-Za-zÆØÅæøå]+\s+\d{2,4}", re.IGNORECASE)


    # WHAT: scan a free-form message for the first recognizable date.
    # WHY: many parsers (todo/calendar) infer deadlines from whatever date appears in the text.
    # HOW: try dotted/slashed numeric patterns, textual dates, then fallback to token-by-token parsing via `parse_date_hint`.
def find_date_in_text(message: str) -> Optional[str]:

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


    # WHAT: convert “tomorrow at 15” phrases into ISO timestamps.
    # WHY: calendar/todo parsers need structured timestamps but users speak casually.
    # HOW: call `parse_datetime_hint` and return the ISO string when successful.
def parse_datetime_hint_local(text: str) -> Optional[str]:
    dt_value = parse_datetime_hint(text, default_time=None)
    return dt_value.isoformat() if dt_value else None


__all__ = ["find_date_in_text", "parse_datetime_hint_local"]
