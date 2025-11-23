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


    # WHAT: detect whether a lowered utterance contains weather keywords.
    # WHY: the orchestrator calls this before running the weather parser to avoid unnecessary work.
    # HOW: use `contains_keyword` against the predefined keyword set.
def matches(lowered: str) -> bool:
    return contains_keyword(lowered, WEATHER_KEYWORDS)


    # WHAT: produce a `CommandResult` with city/time hints for the weather tool.
    # WHY: keeps routing deterministic by extracting structured entities before hitting the LLM.
    # HOW: populate the payload with message/domain, call `_extract_city` and `_extract_time_hint`, and set confidence based on city detection.
def parse(message: str) -> Optional[CommandResult]:
    payload: Dict[str, object] = {"message": message, "domain": "weather"}
    city = _extract_city(message)
    if city:
        payload["city"] = city

    time_hint = _extract_time_hint(message)
    if time_hint:
        payload["time"] = time_hint

    confidence = 0.9 if city else 0.55
    return CommandResult(tool="weather", payload=payload, confidence=confidence)


    # WHAT: pull a probable city name out of the free-form message.
    # WHY: allows prompts like “weather in Berlin” to resolve without structured entities.
    # HOW: run regexes for prepositions/keywords, strip stop words, and block obviously invalid targets.
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


    # WHAT: clean trailing weather/time words from the city fragment.
    # WHY: geocoding fails when the city string includes “weather” or “today”.
    # HOW: iteratively remove configured stop words and phrases, then trim punctuation.
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


    # WHAT: trim phrases like “right now” or “this evening” from the candidate.
    # WHY: `_strip_city_stop_words` needs help with multi-word endings.
    # HOW: check known phrases and slice them off when present.
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


    # WHAT: detect relative day/time hints in the utterance.
    # WHY: the weather tool can only choose forecast slots when it knows the target time.
    # HOW: use regexes for “tomorrow”, “at 9pm”, etc., parse hours/minutes, and stash a `raw` field for reference.
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


    # WHAT: convert HH[:MM][AM/PM] strings into 24-hour integers.
    # WHY: downstream parsing needs clean numbers to build ISO timestamps.
    # HOW: split on “:”, cast to ints, and adjust for AM/PM when present.
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


__all__ = ["matches", "parse", "WEATHER_KEYWORDS"]
