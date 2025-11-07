"""Command parser that extracts structured tool calls from free-form text."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import time
from typing import Dict, List, Optional

from core.text_parsing import (
    extract_notes_from_text,
    extract_title_from_text,
    parse_date_hint,
    parse_datetime_hint,
    extract_quoted_strings,
)

WEATHER_KEYWORDS = {"weather", "temperature", "forecast", "vejret", "vejrudsigten", "vejr"}
NEWS_KEYWORDS = {"news", "headline", "headlines", "stories", "nyheder"}
LANGUAGE_MARKERS = ("english", "engelsk")
_RELATIVE_TIME_PATTERN = re.compile(
    r"\b(today|tonight|tomorrow|this\s(?:morning|afternoon|evening|weekend)|next\s(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|i\s?morgen|imorgen|i\s?aften|iaften|i\s?nat|inat|i\s?weekenden|i\s?weekend)\b",
    re.IGNORECASE,
)
_TIME_PATTERN = re.compile(
    r"\b(?:at|kl\.?|kl)?\s*((?:[01]?\d|2[0-3])(?::[0-5]\d)?)\s*(am|pm)?\b",
    re.IGNORECASE,
)
_CITY_PREP_PATTERN = re.compile(
    r"\b(?:in|i|on|at|på|for|til)\s+(?P<city>[A-Za-zÀ-ÖØ-öø-ÿ' .-]+)",
    re.IGNORECASE,
)
_CITY_BEFORE_KEYWORD_PATTERN = re.compile(
    r"(?P<city>[A-Za-zÀ-ÖØ-öø-ÿ' .-]+)\s+(?:weather|forecast|temperature|vejret|vejr|vejrudsigten)",
    re.IGNORECASE,
)
_CITY_BLOCKLIST = {"mars", "moon", "venus", "jupiter", "saturn", "mercury", "neptune", "pluto"}
_CITY_STOP_WORDS = {
    "weather",
    "forecast",
    "temperature",
    "vejret",
    "vejr",
    "vejrudsigten",
    "today",
    "tonight",
    "tomorrow",
    "imorgen",
    "i morgen",
    "nu",
    "now",
    "kl",
    "kl.",
    "at",
    "this",
    "right",
    "evening",
    "morning",
    "afternoon",
    "aften",
    "formiddag",
    "eftermiddag",
}
_NEWS_TRIGGERS = [
    "news about",
    "news on",
    "news regarding",
    "nyheder om",
    "nyheder omkring",
    "headlines about",
    "headlines on",
    "headlines for",
    "any headlines on",
    "any headlines about",
]
_TODO_DIRECTIVE_TOKENS = ("notes", "note", "deadline", "due", "reminder")


@dataclass
class CommandResult:
    tool: str
    payload: Dict[str, object]
    confidence: float = 0.95


def parse_command(message: str) -> Optional[CommandResult]:
    if not message:
        return None
    lowered = message.lower()
    if _contains_keyword(lowered, WEATHER_KEYWORDS):
        result = _parse_weather_command(message)
        if result:
            return result
    if _contains_keyword(lowered, NEWS_KEYWORDS):
        result = _parse_news_command(message)
        if result:
            return result
    if "todo" in lowered or lowered.startswith("remember"):
        result = _parse_todo_command(message, lowered)
        if result:
            return result
    if "kitchen" in lowered and "tip" in lowered:
        result = _parse_kitchen_command(message, lowered)
        if result:
            return result
    if "calendar" in lowered or "event" in lowered:
        result = _parse_calendar_command(message, lowered)
        if result:
            return result
    if "app guide" in lowered or "knowledge" in lowered:
        result = _parse_app_guide_command(message, lowered)
        if result:
            return result
    return None


def _parse_weather_command(message: str) -> Optional[CommandResult]:
    payload: Dict[str, object] = {"message": message, "domain": "weather"}
    city = _extract_city(message)
    if city:
        payload["city"] = city

    time_hint = _extract_time_hint(message)
    if time_hint:
        payload["time"] = time_hint

    confidence = 0.9 if city else 0.55
    return CommandResult(tool="weather", payload=payload, confidence=confidence)


def _parse_news_command(message: str) -> Optional[CommandResult]:
    payload: Dict[str, object] = {"message": message, "domain": "news"}
    cleaned_message, language = _strip_language_markers(message)
    if language:
        payload["language"] = language
    topic = _extract_news_topic(cleaned_message)
    if topic:
        payload["topic"] = topic
    return CommandResult(tool="news", payload=payload, confidence=0.85)


def _parse_app_guide_command(message: str, lowered: str) -> Optional[CommandResult]:
    payload: Dict[str, object] = {"message": message, "domain": "knowledge"}
    quotes = extract_quoted_strings(message)

    if "list" in lowered:
        payload["action"] = "list"
    elif "delete" in lowered:
        payload["action"] = "delete"
        if quotes:
            payload["section_id"] = quotes[0]
    elif any(word in lowered for word in ("update", "create", "add", "upsert")):
        payload["action"] = "upsert"
        if quotes:
            payload["section_id"] = quotes[0]
        if len(quotes) > 1:
            payload["title"] = quotes[1]
        if len(quotes) > 2:
            payload["content"] = quotes[2]
    elif "get" in lowered or ("section" in lowered and "list" not in lowered):
        payload["action"] = "get"
        if quotes:
            payload["section_id"] = quotes[0]
    else:
        payload["action"] = "list"

    return CommandResult(tool="app_guide", payload=payload)


def _parse_todo_command(message: str, lowered: str) -> Optional[CommandResult]:
    action = "create"
    if any(keyword in lowered for keyword in ("list todo", "todos list", "show todos", "todo list")):
        action = "list"
    elif any(keyword in lowered for keyword in ("delete todo", "remove todo", "complete todo", "finish todo")):
        action = "delete"
    elif lowered.startswith("update todo") or " status " in lowered:
        action = "update"
    elif "remember" in lowered:
        action = "create"

    payload: Dict[str, object] = {"action": action, "message": message, "domain": "todo"}
    cleaned_for_title = _strip_command_directives(message)

    if action in {"update", "delete"}:
        trimmed_message = re.sub(
            r"^(?:update|delete|remove|complete)\s+todo\s+",
            "",
            message,
            count=1,
            flags=re.IGNORECASE,
        ).strip()
        title = extract_title_from_text(trimmed_message)
        if title:
            title = re.split(r"\s+to\b", title, 1)[0].strip(' "\'')
        if not title:
            title = _extract_after_keywords(
                trimmed_message,
                ["update todo", "delete todo", "remove todo", "complete todo"],
                terminators=[" status", " notes", " note", " deadline", " due", "."],
            )
            if title:
                title = title.strip('" ').strip()
        if not title:
            match = re.search(r"update todo\s+(.+?)\s+to\b", message, re.IGNORECASE)
            if match:
                title = match.group(1).strip(' "\'')
        if not title and trimmed_message:
            normalized = re.split(r"\s+to\b", trimmed_message, 1)[0].strip(' "\'')
            if normalized:
                title = normalized
        if title:
            payload["target_title"] = title
    else:
        title = extract_title_from_text(cleaned_for_title)
        if not title and cleaned_for_title:
            title = cleaned_for_title.strip()
        if title:
            payload["title"] = title

    notes = extract_notes_from_text(message)
    if notes:
        payload["notes"] = notes

    deadline = _find_date_in_text(message)
    if deadline:
        payload["deadline"] = deadline

    status_match = re.search(r"status\s+(completed|done|finished|pending)", lowered)
    if status_match:
        payload["status"] = "completed" if status_match.group(1) in {"completed", "done", "finished"} else "pending"

    return CommandResult(tool="todo_list", payload=payload)


def _parse_kitchen_command(message: str, lowered: str) -> Optional[CommandResult]:
    payload: Dict[str, object] = {"message": message, "domain": "kitchen"}
    if "add kitchen tip" in lowered or "create kitchen tip" in lowered:
        payload["action"] = "create"
        title = extract_title_from_text(message)
        if title:
            payload["title"] = title
            payload["body"] = title
        tags = _extract_json_array_after_keyword(message, "tags")
        if tags:
            payload["tags"] = tags
        link_match = re.search(r"link\s+(https?://\S+)", message, re.IGNORECASE)
        if link_match:
            payload["link"] = link_match.group(1).strip()
        return CommandResult(tool="kitchen_tips", payload=payload)

    if any(keyword in lowered for keyword in ("list kitchen", "kitchen tips list", "show kitchen tips")):
        payload["action"] = "list"
        return CommandResult(tool="kitchen_tips", payload=payload)

    if "search" in lowered and "kitchen" in lowered:
        payload["action"] = "search"
        query = extract_title_from_text(message) or message
        if query:
            payload["query"] = query
        return CommandResult(tool="kitchen_tips", payload=payload)

    if "get kitchen" in lowered or "kitchen tip" in lowered and "list" not in lowered:
        payload["action"] = "get"
        title = extract_title_from_text(message)
        if title:
            payload["id"] = title
        return CommandResult(tool="kitchen_tips", payload=payload)

    return None


def _parse_calendar_command(message: str, lowered: str) -> Optional[CommandResult]:
    payload: Dict[str, object] = {"message": message, "domain": "calendar"}

    if "calendar list" in lowered or lowered.strip().endswith("calendar"):
        payload["action"] = "list"
        return CommandResult(tool="calendar_edit", payload=payload)

    if "calendar delete" in lowered or "delete event" in lowered:
        payload["action"] = "delete"
        title = extract_title_from_text(message)
        if title:
            payload["title"] = title
        return CommandResult(tool="calendar_edit", payload=payload)

    if "calendar update" in lowered or "update event" in lowered:
        payload["action"] = "update"
    elif "calendar create" in lowered or "add calendar" in lowered or "create event" in lowered:
        payload["action"] = "create"
    else:
        return None

    title = extract_title_from_text(message)
    if title:
        if payload["action"] in {"update", "delete"}:
            payload["target_title"] = title
        else:
            payload["title"] = title

    start_text = _extract_after_keywords(message, ["start", "at"])
    if start_text:
        start_dt = _parse_datetime_hint(start_text)
        if start_dt:
            payload["start"] = start_dt

    end_text = _extract_after_keywords(message, ["end", "ending", "til", "until"])
    if end_text:
        end_dt = _parse_datetime_hint(end_text)
        if end_dt:
            payload["end"] = end_dt

    notes = extract_notes_from_text(message)
    if not notes:
        notes_match = re.search(r"notes?\s*[:=]\s*([^.;]+)", message, re.IGNORECASE)
        if notes_match:
            notes = [notes_match.group(1).strip()]
    if notes:
        payload["notes"] = notes[-1]

    location_match = re.search(r"location\s+\"([^\"]+)\"", message, re.IGNORECASE)
    if not location_match:
        location_match = re.search(r"location\s+([A-Za-z0-9 .-]+)", message, re.IGNORECASE)
    if location_match:
        payload["location"] = location_match.group(1).strip(' "')

    link_match = re.search(r"link\s+(https?://\S+)", message, re.IGNORECASE)
    if link_match:
        payload["link"] = link_match.group(1).strip()

    return CommandResult(tool="calendar_edit", payload=payload)


def _extract_after_keywords(message: str, keywords: List[str], terminators: Optional[List[str]] = None) -> Optional[str]:
    terminators = terminators or [" end", " ending", " til", " until", " notes", " location", " link"]
    for keyword in keywords:
        pattern = re.compile(rf"{keyword}\s+(.+)", re.IGNORECASE)
        match = pattern.search(message)
        if not match:
            continue
        segment = match.group(1)
        lower_segment = segment.lower()
        cut_index = len(segment)
        for stopper in terminators:
            idx = lower_segment.find(stopper)
            if idx != -1:
                cut_index = min(cut_index, idx)
        segment = segment[:cut_index]
        for separator in (",", ";", "."):
            if separator in segment:
                segment = segment.split(separator)[0]
        return segment.strip().strip(' "\'')
    return None


def _extract_json_array_after_keyword(message: str, keyword: str) -> Optional[List[str]]:
    pattern = re.compile(rf"{keyword}\s*(\[[^\]]+\])", re.IGNORECASE)
    match = pattern.search(message)
    if not match:
        return None
    try:
        values = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    if isinstance(values, list):
        return [str(value).strip() for value in values if str(value).strip()]
    return None


def _find_date_in_text(message: str) -> Optional[str]:
    for token in re.findall(r"\d{1,2}[./-]\d{1,2}[./-]\d{2,4}", message):
        parsed = parse_date_hint(token)
        if parsed:
            return parsed.isoformat()
    for token in re.findall(r"\d{1,2}\s*[A-Za-zÆØÅæøå]+\s+\d{2,4}", message):
        parsed = parse_date_hint(token)
        if parsed:
            return parsed.isoformat()
    for word in message.split():
        parsed = parse_date_hint(word)
        if parsed:
            return parsed.isoformat()
    return None


def _parse_datetime_hint(text: str) -> Optional[str]:
    dt_value = parse_datetime_hint(text, default_time=time(0, 0))
    return dt_value.isoformat() if dt_value else None


def _contains_keyword(text: str, keywords: set[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def _extract_city(message: str) -> Optional[str]:
    for pattern in (_CITY_PREP_PATTERN, _CITY_BEFORE_KEYWORD_PATTERN):
        match = pattern.search(message)
        if not match:
            continue
        candidate = match.group("city").strip()
        cleaned = _strip_city_stop_words(candidate)
        if cleaned:
            lowered = cleaned.lower()
            if lowered in _CITY_BLOCKLIST:
                return None
            if lowered.startswith(("what", "hvad")):
                return None
            return cleaned
    return None


def _strip_city_stop_words(candidate: str) -> Optional[str]:
    chunk = candidate.strip(" ,;:!?")
    if not chunk:
        return None

    for stop_word in sorted(_CITY_STOP_WORDS, key=len, reverse=True):
        pattern = re.compile(rf"\b{re.escape(stop_word)}\b", re.IGNORECASE)
        parts = pattern.split(chunk, maxsplit=1)
        if len(parts) > 1:
            chunk = parts[0]

    chunk = _remove_trailing_phrases(chunk)
    chunk = chunk.strip(" ,;:!?")
    return chunk or None


def _remove_trailing_phrases(value: str) -> str:
    phrases = (
        "right now",
        "right",
        "this evening",
        "this afternoon",
        "this morning",
        "tonight",
        "tomorrow",
        "i morgen",
        "imorgen",
        "i aften",
        "iaften",
        "i nat",
        "inat",
        "i weekenden",
        "i weekend",
        "weekend",
    )
    stripped = value.rstrip()
    lowered = stripped.lower()
    for phrase in phrases:
        if lowered.endswith(phrase):
            idx = len(stripped) - len(phrase)
            trimmed = stripped[:idx].rstrip(" ,;:!?")
            if trimmed:
                return trimmed
    return value


def _strip_command_directives(message: str) -> str:
    lowered = message.lower()
    cut_index = len(message)
    for token in _TODO_DIRECTIVE_TOKENS:
        idx = lowered.find(token)
        if idx != -1:
            cut_index = min(cut_index, idx)
    return message[:cut_index].strip()


def _extract_time_hint(message: str) -> Optional[Dict[str, object]]:
    lowered = message.lower()
    rel_match = _RELATIVE_TIME_PATTERN.search(lowered)
    time_match = _TIME_PATTERN.search(lowered)

    if not rel_match and not time_match:
        return None

    hint: Dict[str, object] = {}
    if rel_match:
        hint["day"] = rel_match.group(0).strip()
    if time_match:
        time_value = time_match.group(1)
        ampm = time_match.group(2)
        hour, minute = _parse_time_components(time_value, ampm)
        if hour is not None:
            hint["hour"] = hour
        if minute is not None:
            hint["minute"] = minute
    raw_segments = []
    if rel_match:
        raw_segments.append(rel_match.group(0))
    if time_match:
        raw_segments.append(time_match.group(0))
    hint["raw"] = " ".join(seg.strip() for seg in raw_segments if seg).strip()
    return hint


def _parse_time_components(time_value: str, ampm: Optional[str]) -> tuple[Optional[int], Optional[int]]:
    if not time_value:
        return None, None

    if ":" in time_value:
        hour_str, minute_str = time_value.split(":", 1)
    else:
        hour_str, minute_str = time_value, "0"

    try:
        hour = int(hour_str)
        minute = int(minute_str)
    except ValueError:
        return None, None

    if ampm:
        ampm_lower = ampm.lower()
        if ampm_lower == "pm" and hour < 12:
            hour += 12
        if ampm_lower == "am" and hour == 12:
            hour = 0

    hour = hour if 0 <= hour <= 23 else None
    minute = minute if 0 <= minute <= 59 else None
    return hour, minute


def _strip_language_markers(message: str) -> tuple[str, Optional[str]]:
    lowered = message.lower()
    language: Optional[str] = None
    cleaned = message
    for marker in LANGUAGE_MARKERS:
        if marker in lowered:
            language = "en"
            pattern = re.compile(re.escape(marker), re.IGNORECASE)
            cleaned = pattern.sub("", cleaned)
    return cleaned.strip(), language


def _extract_news_topic(message: str) -> str:
    lowered = message.lower()
    for trigger in _NEWS_TRIGGERS:
        idx = lowered.find(trigger)
        if idx == -1:
            continue
        start = idx + len(trigger)
        topic = message[start:].strip(" .!?,")
        topic = _truncate_topic(topic)
        if topic:
            return topic
    cleaned = message.strip()
    for prefix in ["any headlines", "headlines", "latest headlines"]:
        if cleaned.lower().startswith(prefix):
            return cleaned[len(prefix):].strip(" :.!?,")
    return ""


def _truncate_topic(topic: str) -> str:
    for delimiter in ["?", "!", ".", ",", " and "]:
        parts = topic.split(delimiter, 1)
        if len(parts) > 1:
            topic = parts[0]
    return topic.strip()
