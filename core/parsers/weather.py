"""Weather intent parsing."""

from __future__ import annotations

import re
from typing import Dict, Optional

from core.parser_utils import contains_keyword
from core.text_parsing import parse_datetime_hint
from core.parsers.types import CommandResult

WEATHER_KEYWORDS = {"weather", "temperature", "forecast", "vejret", "vejrudsigten", "vejr"}
_RELATIVE_TIME_PATTERN = re.compile(
    r"\b(today|tonight|tomorrow|this\s(?:morning|afternoon|evening|weekend)|next\s(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|i\s?morgen|imorgen|i\s?aften|iaften|i\s?nat|inat|i\s?weekenden|i\s?weekend)\b",
    re.IGNORECASE,
)
_TIME_PATTERN = re.compile(r"\b(?:at|kl\.?|kl)?\s*((?:[01]?\d|2[0-3])(?::[0-5]\d)?)\s*(am|pm)?\b", re.IGNORECASE)
_CITY_PREP_PATTERN = re.compile(r"\b(?:in|i|on|at|på|for|til)\s+(?P<city>[A-Za-zÀ-ÖØ-öø-ÿ' .-]+)", re.IGNORECASE)
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


def matches(lowered: str) -> bool:
    """Return True when the utterance clearly references weather terms."""
    return contains_keyword(lowered, WEATHER_KEYWORDS)


def parse(message: str) -> Optional[CommandResult]:
    """Extract city/time hints so the weather tool can run deterministically."""
    payload: Dict[str, object] = {"message": message, "domain": "weather"}
    city = _extract_city(message)
    if city:
        payload["city"] = city

    time_hint = _extract_time_hint(message)
    if time_hint:
        payload["time"] = time_hint

    confidence = 0.9 if city else 0.55
    return CommandResult(tool="weather", payload=payload, confidence=confidence)


def _extract_city(message: str) -> Optional[str]:
    """Scan for city tokens after prepositions or before "weather" keywords."""
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
    """Remove trailing stop words ("weather", day names) from city guesses."""
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
    """Trim phrases like "right now" from the city fragment."""
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


def _extract_time_hint(message: str) -> Optional[Dict[str, object]]:
    """Return structured time info (day/hour/minute) when present."""
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
    """Normalize "10", "10:30pm" etc. into 24h components."""
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


__all__ = ["matches", "parse", "WEATHER_KEYWORDS"]
