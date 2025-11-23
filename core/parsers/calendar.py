"""Calendar intent parsing."""

from __future__ import annotations

import re
from datetime import date, datetime, time
from typing import Dict, Optional, Tuple

from core.parser_utils import extract_after_keywords
from core.parser_utils.datetime import find_date_in_text, parse_datetime_hint_local
from core.parsers.types import CommandResult
from core.text_parsing import extract_notes_from_text, extract_title_from_text, parse_date_hint

_CALENDAR_TIME_RANGE_PATTERN = re.compile(
    r"(?P<context>(?:next|this|coming|on)?\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}))?\s*(?P<start>\d{1,2}(?::\d{2})?)\s*(?:to|[-\u2013\u2014])\s*(?P<end>\d{1,2}(?::\d{2})?)",
    re.IGNORECASE,
)
_CALENDAR_PART_OF_DAY_PATTERN = re.compile(
    r"(?P<context>(?:next|this|coming|on)?\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}))\s+(?P<part>morning|afternoon|evening|night)",
    re.IGNORECASE,
)
_PART_OF_DAY_DEFAULTS = {"morning": "09:00", "afternoon": "15:00", "evening": "19:00", "night": "21:00"}
_TIME_TOKEN_PATTERN = re.compile(r"\d{1,2}(:\d{2})?|\bmorning\b|\bafternoon\b|\bevening\b|\bnight\b", re.IGNORECASE)
_TIME_ONLY_PATTERN = re.compile(r"^\s*(\d{1,2})(?::(\d{2}))?\s*$")
_CALENDAR_CREATE_VERBS = ("create", "add", "schedule", "set up", "setup", "plan", "organize", "arrange", "set-up")
_CALENDAR_DELETE_VERBS = ("delete", "remove", "cancel")
_CALENDAR_UPDATE_VERBS = ("update", "reschedule", "move", "shift", "change")


def matches(lowered: str) -> bool:
    """Fast keyword guard before running heavy calendar parsing heuristics."""
    return "calendar" in lowered or "event" in lowered or "meeting" in lowered


def parse(message: str, lowered: str) -> Optional[CommandResult]:
    """Extract calendar CRUD payloads from natural language prompts."""
    payload: Dict[str, object] = {"message": message, "domain": "calendar"}

    action = _detect_action(lowered)
    if action is None:
        return None
    payload["action"] = action

    if action == "find":
        payload["keywords"] = _extract_find_keywords(message)

    title = _extract_calendar_title(message)
    if title:
        if action in {"update", "delete"}:
            payload["target_title"] = title
            payload.setdefault("title", title)
        else:
            payload["title"] = title

    start_text = extract_after_keywords(message, ["start", "at"])
    if start_text and _looks_like_time_expression(start_text):
        start_dt = parse_datetime_hint_local(start_text)
        if start_dt:
            payload["start"] = start_dt

    end_text = extract_after_keywords(message, ["end", "ending", "til", "until"])
    if end_text:
        end_dt = parse_datetime_hint_local(end_text)
        if end_dt:
            payload["end"] = end_dt

    if "start" not in payload or "end" not in payload:
        inferred_start, inferred_end = _infer_calendar_times(message)
        if inferred_start and "start" not in payload:
            payload["start"] = inferred_start
        if inferred_end and "end" not in payload:
            payload["end"] = inferred_end

    notes = extract_notes_from_text(message)
    if notes:
        payload["notes"] = notes[-1]

    location_match = re.search(r"location\s+\"([^\"]+)\"", message, re.IGNORECASE)
    if not location_match:
        location_match = re.search(r"location\s+([A-Za-z0-9 .-]+)", message, re.IGNORECASE)
    if location_match:
        payload["location"] = location_match.group(1).strip(' "')
    elif "location" not in payload:
        location_hint = _extract_location_hint(message)
        if location_hint:
            payload["location"] = location_hint

    link_match = re.search(r"link\s+(https?://\S+)", message, re.IGNORECASE)
    if link_match:
        payload["link"] = link_match.group(1).strip()

    if action == "create":
        if "start" not in payload or not payload["start"]:
            payload["start"] = _current_time_iso()
    if payload.get("start") and payload.get("end"):
        normalized_end = _normalize_end_datetime(str(payload["start"]), str(payload["end"]))
        if normalized_end:
            payload["end"] = normalized_end

    return CommandResult(tool="calendar_edit", payload=payload)


def _detect_action(lowered: str) -> Optional[str]:
    """Choose between list/find/create/update/delete verbs."""
    if "calendar list" in lowered or lowered.strip().endswith("calendar") or (
        "list" in lowered and ("calendar" in lowered or "event" in lowered)
    ):
        return "list"
    if "find" in lowered and ("calendar" in lowered or "event" in lowered or "meeting" in lowered):
        return "find"
    if any(verb in lowered for verb in _CALENDAR_DELETE_VERBS) and (
        "calendar" in lowered or "event" in lowered or "meeting" in lowered
    ):
        return "delete"
    if any(verb in lowered for verb in _CALENDAR_UPDATE_VERBS) and (
        "calendar" in lowered or "event" in lowered or "meeting" in lowered
    ):
        return "update"
    if (("calendar" in lowered and any(keyword in lowered for keyword in ("create", "add"))) or any(
        verb in lowered for verb in _CALENDAR_CREATE_VERBS
    ) and ("event" in lowered or "meeting" in lowered)):
        return "create"
    return None


def _extract_calendar_title(message: str) -> Optional[str]:
    """Try several patterns to recover the event title."""
    fancy_quotes = re.findall(r"[“\"]([^”\"]+)[”\"]", message)
    if fancy_quotes:
        return fancy_quotes[0].strip()
    called_match = re.search(r"(?:called|named)\s+([A-Za-z0-9 .'-]+)", message, re.IGNORECASE)
    if called_match:
        return called_match.group(1).strip(' ".,')
    for_match = re.search(
        r"\bfor\s+([A-Za-z0-9 .'-]+?)(?=\s+(?:next|this|coming|on|at|in|with|by|from|every|tomorrow|today)\b)",
        message,
        re.IGNORECASE,
    )
    if for_match:
        title = for_match.group(1).strip(' ".,')
        if title.lower().startswith("the "):
            title = title[4:]
        return title
    quoted = extract_title_from_text(message)
    if quoted:
        return quoted.strip()
    return None


def _looks_like_time_expression(value: str) -> bool:
    """Return True if the snippet contains recognizable time tokens."""
    if not value:
        return False
    return bool(_TIME_TOKEN_PATTERN.search(value))


def _infer_calendar_times(message: str) -> Tuple[Optional[str], Optional[str]]:
    """Infer start/end datetimes from ranges or part-of-day hints."""
    if not message:
        return None, None
    range_match = _CALENDAR_TIME_RANGE_PATTERN.search(message)
    if range_match:
        context = _clean_calendar_context(range_match.group("context") or "")
        if not context:
            context = find_date_in_text(message) or ""
        start_dt = _build_datetime_from_parts(context, range_match.group("start"))
        end_dt = _build_datetime_from_parts(context, range_match.group("end"), fallback_iso=start_dt)
        return start_dt, end_dt
    part_match = _CALENDAR_PART_OF_DAY_PATTERN.search(message)
    if part_match:
        context = _clean_calendar_context(part_match.group("context"))
        if not context:
            context = find_date_in_text(message) or ""
        part = part_match.group("part").lower()
        default_time = _PART_OF_DAY_DEFAULTS.get(part)
        if default_time:
            start_dt = _build_datetime_from_parts(context, default_time)
            return start_dt, None
    return None, None


def _clean_calendar_context(text: str) -> str:
    """Strip leading prepositions so date parsing works."""
    if not text:
        return ""
    return re.sub(r"^(?:on|at|for)\s+", "", text.strip(), flags=re.IGNORECASE)


def _extract_location_hint(message: str) -> Optional[str]:
    """Guess event location from "at <place>" phrases."""
    match = re.search(r"at\s+((?:the\s+)?[A-Za-z0-9 .'-]+)", message, re.IGNORECASE)
    if not match:
        return None
    candidate = match.group(1).strip(' ".,')
    if not candidate or re.fullmatch(r"\d{1,2}(?::\d{2})?", candidate):
        return None
    if re.search(r"\d", candidate) and ":" in candidate:
        return None
    return candidate


def _extract_find_keywords(message: str) -> str:
    """Return raw text after "find" to drive keyword searches."""
    match = re.search(r"find\s+(?:calendar\s+|event\s+|meeting\s+)?(.+)", message, re.IGNORECASE)
    if not match:
        return message.strip()
    return match.group(1).strip()


def _parse_time_fragment(value: Optional[str]) -> Optional[time]:
    if not value:
        return None
    text = value.strip()
    match = _TIME_ONLY_PATTERN.match(text)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    if hour >= 24 or minute >= 60:
        return None
    return time(hour, minute)


def _iso_to_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except ValueError:
        return None


def _build_datetime_from_parts(context: str, time_text: Optional[str], fallback_iso: Optional[str] = None) -> Optional[str]:
    context = (context or "").strip()
    date_value = parse_date_hint(context) if context else None
    fallback_date = _iso_to_date(fallback_iso)
    if not date_value:
        date_value = fallback_date
    time_value = _parse_time_fragment(time_text)
    if not date_value and not time_value:
        return None
    if not date_value:
        date_value = datetime.now().date()
    if not time_value:
        time_value = time(0, 0)
    return datetime.combine(date_value, time_value).isoformat()


def _current_time_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat()


def _normalize_end_datetime(start_iso: str, end_value: str) -> Optional[str]:
    try:
        datetime.fromisoformat(end_value)
        return end_value
    except ValueError:
        pass
    end_time = _parse_time_fragment(end_value)
    if not end_time:
        return None
    start_date = _iso_to_date(start_iso) or datetime.now().date()
    return datetime.combine(start_date, end_time).isoformat()
