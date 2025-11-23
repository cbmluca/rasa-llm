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


    # WHAT: check if the lowered utterance references news-related keywords.
    # WHY: avoids running the news parser when the prompt clearly isn’t about news.
    # HOW: reuse `contains_keyword` against `NEWS_KEYWORDS`.
def matches(lowered: str) -> bool:
    return contains_keyword(lowered, NEWS_KEYWORDS)


    # WHAT: extract topic and language hints for the news tool.
    # WHY: deterministic parsing lets Tier‑1 skip the router when prompts explicitly ask for news.
    # HOW: strip language markers, infer the topic after triggers, and return a `CommandResult`.
def parse(message: str) -> Optional[CommandResult]:
    payload: Dict[str, object] = {"message": message, "domain": "news"}
    cleaned_message, language = _strip_language_markers(message)
    if language:
        payload["language"] = language
    topic = _extract_news_topic(cleaned_message)
    if topic:
        payload["topic"] = topic
    return CommandResult(tool="news", payload=payload, confidence=0.85)


    # WHAT: detect manual language hints (“english news”) and remove them from the topic string.
    # WHY: the news tool can switch sources/languages but needs a clean topic.
    # HOW: search for known markers, strip them via regex, and return both the cleaned text and the inferred language code.
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


    # WHAT: derive the news topic from the free-form prompt.
    # WHY: router/NLU often receives “news about electric vehicles” and we only need the topic portion.
    # HOW: look for `NEWS_TRIGGERS`, trim punctuation/clauses, and fallback to the raw message when no trigger exists.
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
    for prefix in ["any headlines", "headlines", "latest headlines", "news"]:
        if cleaned.lower().startswith(prefix):
            return cleaned[len(prefix) :].strip(" :.!?,")
    return cleaned


    # WHAT: shorten the extracted topic by removing trailing punctuation or conjunctions.
    # WHY: keeps the query string concise for NewsAPI/RSS searches.
    # HOW: split on punctuation/connectors and trim whitespace.
def _truncate_topic(topic: str) -> str:
    for delimiter in ["?", "!", ".", ",", " and "]:
        parts = topic.split(delimiter, 1)
        if len(parts) > 1:
            topic = parts[0]
    return topic.strip()


__all__ = ["matches", "parse", "NEWS_KEYWORDS"]
