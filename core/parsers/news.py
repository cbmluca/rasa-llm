"""News intent parsing."""

from __future__ import annotations

import re
from typing import Dict, Optional

from core.parser_utils import contains_keyword
from core.parsers.types import CommandResult

NEWS_KEYWORDS = {"news", "headline", "headlines", "stories", "nyheder"}
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
LANGUAGE_MARKERS = ("english", "engelsk")


def matches(lowered: str) -> bool:
    """Guard to skip parsing when no news keywords are present."""
    return contains_keyword(lowered, NEWS_KEYWORDS)


def parse(message: str) -> Optional[CommandResult]:
    """Extract news topic/language hints for the news tool."""
    payload: Dict[str, object] = {"message": message, "domain": "news"}
    cleaned_message, language = _strip_language_markers(message)
    if language:
        payload["language"] = language
    topic = _extract_news_topic(cleaned_message)
    if topic:
        payload["topic"] = topic
    return CommandResult(tool="news", payload=payload, confidence=0.85)


def _strip_language_markers(message: str) -> tuple[str, Optional[str]]:
    """Remove language hints ("english", "engelsk") and return ISO code."""
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
    """Heuristically pull the topic requested after "news/headlines" keywords."""
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
    for prefix in ["any headlines", "headlines", "latest headlines", "news"]:
        if cleaned.lower().startswith(prefix):
            return cleaned[len(prefix) :].strip(" :.!?,")
    return cleaned


def _truncate_topic(topic: str) -> str:
    """Trim trailing clauses so the topic stays concise."""
    for delimiter in ["?", "!", ".", ",", " and "]:
        parts = topic.split(delimiter, 1)
        if len(parts) > 1:
            topic = parts[0]
    return topic.strip()


__all__ = ["matches", "parse", "NEWS_KEYWORDS"]
