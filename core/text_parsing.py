"""Shared natural language parsing helpers for Tier-3 tools."""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta, timezone
from typing import List, Optional

_DANISH_MONTHS = {
    "januar": 1,
    "februar": 2,
    "marts": 3,
    "april": 4,
    "maj": 5,
    "juni": 6,
    "juli": 7,
    "august": 8,
    "september": 9,
    "oktober": 10,
    "november": 11,
    "december": 12,
}

_RELATIVE_KEYWORDS = {
    "today": 0,
    "i dag": 0,
    "idag": 0,
    "tomorrow": 1,
    "i morgen": 1,
    "imorgen": 1,
    "yesterday": -1,
    "i går": -1,
    "igår": -1,
}

_DATE_PATTERN = re.compile(r"(?P<day>\d{1,2})[./-](?P<month>\d{1,2})[./-](?P<year>\d{2,4})")
_DATE_TEXT_PATTERN = re.compile(
    r"(?P<day>\d{1,2})\s*(?:\.|)\s*(?P<month_name>[A-Za-zÆØÅæøå]+)\s+(?P<year>\d{2,4})",
    re.IGNORECASE,
)
_DATETIME_NUMERIC_PATTERN = re.compile(
    r"(?P<day>\d{1,2})[./-](?P<month>\d{1,2})[./-](?P<year>\d{2,4})(?:\s+(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?)?",
    re.IGNORECASE,
)


def extract_quoted_strings(text: str) -> List[str]:
    return [value.strip() for value in re.findall(r'"([^"]+)"', text or "") if value.strip()]


def parse_date_hint(text: str, reference: Optional[datetime] = None) -> Optional[date]:
    """Parse Danish or relative date strings into ``date``."""

    if not text:
        return None
    text = text.strip()
    lowered = text.lower()
    reference = reference or datetime.now(timezone.utc)

    if lowered in _RELATIVE_KEYWORDS:
        return (reference + timedelta(days=_RELATIVE_KEYWORDS[lowered])).date()

    weekday = _parse_weekday(lowered, reference)
    if weekday:
        return weekday

    numeric_match = _DATE_PATTERN.fullmatch(text)
    if numeric_match:
        return _parse_numeric_date(numeric_match)

    textual_match = _DATE_TEXT_PATTERN.fullmatch(text)
    if textual_match:
        return _parse_textual_date(textual_match)

    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        return None


def parse_datetime_hint(text: str, default_time: Optional[time] = None) -> Optional[datetime]:
    """Return a ``datetime`` for ISO or Danish-like inputs."""

    default_time = default_time or time(0, 0)
    text = (text or "").strip()
    if not text:
        return None

    try:
        return datetime.fromisoformat(text)
    except ValueError:
        pass

    numeric_match = _DATETIME_NUMERIC_PATTERN.fullmatch(text)
    if numeric_match:
        day = int(numeric_match.group("day"))
        month = int(numeric_match.group("month"))
        year = int(numeric_match.group("year"))
        if year < 100:
            year += 2000
        hour = default_time.hour
        minute = default_time.minute
        if numeric_match.group("hour") is not None:
            try:
                hour = int(numeric_match.group("hour"))
                minute = int(numeric_match.group("minute") or 0)
            except ValueError:
                hour = default_time.hour
                minute = default_time.minute
        try:
            return datetime(year, month, day, hour, minute)
        except ValueError:
            return None

    date_value = parse_date_hint(text)
    if date_value:
        return datetime.combine(date_value, default_time)
    return None


def extract_notes_from_text(text: str) -> List[str]:
    """Return quoted note segments following ``notes`` keywords."""

    if not text:
        return []
    segment = ""
    match = re.search(r"notes?\s*[:=]?\s*(.*)", text, re.IGNORECASE)
    if match:
        segment = match.group(1)
    else:
        segment = text
    quoted = extract_quoted_strings(segment)
    if quoted:
        return quoted
    list_match = re.search(r"\[(.*?)\]", segment)
    if list_match:
        items = [item.strip().strip('"\'') for item in list_match.group(1).split(",")]
        return [item for item in items if item]
    return []


def extract_title_from_text(text: str) -> Optional[str]:
    if not text:
        return None
    quoted = extract_quoted_strings(text)
    if quoted:
        return quoted[0]
    text = text.strip()
    return text or None


def parse_relative_keyword(keyword: str, reference: Optional[datetime] = None) -> Optional[date]:
    reference = reference or datetime.now(timezone.utc)
    keyword = (keyword or "").strip().lower()
    if keyword in _RELATIVE_KEYWORDS:
        return (reference + timedelta(days=_RELATIVE_KEYWORDS[keyword])).date()
    return None


def _parse_numeric_date(match: re.Match[str]) -> Optional[date]:
    day = int(match.group("day"))
    month = int(match.group("month"))
    year = int(match.group("year"))
    if year < 100:
        year += 2000
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _parse_textual_date(match: re.Match[str]) -> Optional[date]:
    day = int(match.group("day"))
    month_name = match.group("month_name").lower()
    year = int(match.group("year"))
    if year < 100:
        year += 2000
    month = _DANISH_MONTHS.get(month_name)
    if not month:
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _parse_weekday(text: str, reference: datetime) -> Optional[date]:
    weekdays = {
        "monday": 0,
        "tuesday": 1,
        "wednesday": 2,
        "thursday": 3,
        "friday": 4,
        "saturday": 5,
        "sunday": 6,
        "mandag": 0,
        "tirsdag": 1,
        "onsdag": 2,
        "torsdag": 3,
        "fredag": 4,
        "lørdag": 5,
        "søndag": 6,
    }
    for name, idx in weekdays.items():
        if name in text:
            current_idx = reference.weekday()
            delta = (idx - current_idx) % 7
            return (reference + timedelta(days=delta)).date()
    return None
