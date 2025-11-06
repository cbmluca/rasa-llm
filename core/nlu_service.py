"""Offer fast heuristics for Tier-1 NLU before involving the LLM stack.

The Tier-1 assistant keeps latency low by checking for obvious intents using
keyword sets. This module houses those heuristics plus the confidence gate that
protects downstream components from noisy matches.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Any
import re


@dataclass
class NLUResult:
    intent: str
    confidence: float
    entities: Dict[str, Any] = field(default_factory=dict)


class NLUService:
    """Minimal rule-based NLU used for Tier 1 orchestration."""

    WEATHER_KEYWORDS = {"weather", "temperature", "forecast", "vejret", "vejrudsigten", "vejr"}
    NEWS_KEYWORDS = {"news", "headline", "headlines", "stories", "nyheder"}
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

    def __init__(self, threshold: float) -> None:
        self._threshold = threshold

    # --- Keyword scan: cheap signals that prevent unnecessary LLM calls
    def parse(self, message: str) -> NLUResult:
        original = message or ""
        text = original.strip()
        lowered = text.lower()
        if not text:
            return NLUResult(intent="nlu_fallback", confidence=0.0)

        if self._contains_keyword(lowered, self.WEATHER_KEYWORDS):
            entities = self._extract_weather_entities(original)
            confidence = 0.9 if entities.get("city") else 0.55
            return NLUResult(intent="ask_weather", confidence=confidence, entities=entities)
        if self._contains_keyword(lowered, self.NEWS_KEYWORDS):
            entities = self._extract_news_entities(original)
            return NLUResult(intent="get_news", confidence=0.85, entities=entities)

        return NLUResult(intent="nlu_fallback", confidence=0.4)

    # --- Confidence gate: only surface deterministic matches to the orchestrator
    def is_confident(self, result: NLUResult) -> bool:
        return result.confidence >= self._threshold

    # --- Payload helper: allow Tier-1 to forward structured info downstream
    def build_payload(self, result: NLUResult, message: str) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"intent": result.intent, "message": message}
        payload.update(result.entities or {})
        return payload

    # --- Keyword scan utility -------------------------------------------------
    @staticmethod
    def _contains_keyword(text: str, keywords: set[str]) -> bool:
        return any(keyword in text for keyword in keywords)

    # --- Entity extraction helpers -------------------------------------------
    def _extract_weather_entities(self, message: str) -> Dict[str, Any]:
        entities: Dict[str, Any] = {}
        city = self._extract_city(message)
        if city:
            entities["city"] = city

        time_hint = self._extract_time_hint(message)
        if time_hint:
            entities["time"] = time_hint

        return entities

    def _extract_news_entities(self, message: str) -> Dict[str, Any]:
        topic = self._extract_news_topic(message)
        if topic:
            return {"topic": topic}
        return {}

    def _extract_city(self, message: str) -> str | None:
        for pattern in (self._CITY_PREP_PATTERN, self._CITY_BEFORE_KEYWORD_PATTERN):
            match = pattern.search(message)
            if not match:
                continue
            candidate = match.group("city").strip()
            cleaned = self._strip_city_stop_words(candidate)
            if cleaned:
                if cleaned.lower() in self._CITY_BLOCKLIST:
                    return None
                return cleaned
        return None

    def _strip_city_stop_words(self, candidate: str) -> str | None:
        chunk = candidate.strip(" ,;:!?")
        if not chunk:
            return None

        for stop_word in sorted(self._CITY_STOP_WORDS, key=len, reverse=True):
            pattern = re.compile(rf"\b{re.escape(stop_word)}\b", re.IGNORECASE)
            split = pattern.split(chunk, maxsplit=1)
            if len(split) > 1:
                chunk = split[0]

        chunk = self._remove_trailing_phrases(chunk)
        chunk = chunk.strip(" ,;:!?")
        return chunk or None

    def _remove_trailing_phrases(self, value: str) -> str:
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
            if not lowered.endswith(phrase):
                continue
            idx = len(stripped) - len(phrase)
            trimmed = stripped[:idx].rstrip(" ,;:!?")
            if trimmed:
                return trimmed
        return value

    def _extract_time_hint(self, message: str) -> Dict[str, Any] | None:
        lowered = message.lower()
        rel_match = self._RELATIVE_TIME_PATTERN.search(lowered)
        time_match = self._TIME_PATTERN.search(lowered)

        if not rel_match and not time_match:
            return None

        hint: Dict[str, Any] = {}
        raw_segments = []
        if rel_match:
            hint["day"] = rel_match.group(1).lower()
            raw_segments.append(rel_match.group(0))

        if time_match:
            hour, minute = self._parse_time_components(time_match.group(1), time_match.group(2))
            hint["hour"] = hour
            hint["minute"] = minute
            raw_segments.append(time_match.group(0))

        hint["raw"] = " ".join(seg.strip() for seg in raw_segments if seg).strip()
        return hint

    @staticmethod
    def _parse_time_components(time_value: str, ampm: str | None) -> tuple[int | None, int | None]:
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

    def _extract_news_topic(self, message: str) -> str:
        lowered = message.lower()
        triggers = [
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
        for trigger in triggers:
            idx = lowered.find(trigger)
            if idx == -1:
                continue
            start = idx + len(trigger)
            topic = message[start:].strip(" .!?,")
            topic = self._truncate_topic(topic)
            if topic:
                return topic
        # fallback: strip leading prompts like "any headlines on"
        cleaned = message.strip()
        for prefix in ["any headlines", "headlines", "latest headlines"]:
            if cleaned.lower().startswith(prefix):
                return cleaned[len(prefix):].strip(" :.!?,")
        return ""

    def _truncate_topic(self, topic: str) -> str:
        for delimiter in ["?", "!", ".", ",", " and "]:
            parts = topic.split(delimiter, 1)
            if len(parts) > 1:
                topic = parts[0]
        topic = topic.strip()
        return topic
