"""Shared helpers for list/find style tool actions."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Callable, Iterable, List, Sequence

from core.text_utils import normalize_text

_TOKEN_SANITIZER = re.compile(r"[^a-z0-9]+")
_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "at",
    "be",
    "can",
    "do",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "make",
    "me",
    "my",
    "of",
    "on",
    "or",
    "should",
    "the",
    "to",
    "what",
    "why",
    "with",
}


@dataclass
class QueryResult:
    """Representation of a list/find response."""

    entries: List[dict]
    query: str | None = None


def tokenize_keywords(text: str | None) -> List[str]:
    if not text:
        return []
    tokens: List[str] = []
    for raw in normalize_text(text).split():
        cleaned = _TOKEN_SANITIZER.sub("", raw)
        if not cleaned:
            continue
        if cleaned in _STOPWORDS:
            continue
        if len(cleaned) <= 2:
            continue
        tokens.append(cleaned)
    return tokens


def best_effort_keywords(payload: dict, keys: Sequence[str] = ("keywords", "query", "title")) -> str:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list):
            joined = ", ".join(str(item).strip() for item in value if str(item).strip())
            if joined.strip():
                return joined.strip()
    message = payload.get("message")
    if isinstance(message, str):
        return message.strip()
    return ""


def keyword_score(entry: dict[str, Any], tokens: Iterable[str], fields: Sequence[str]) -> int:
    if not tokens:
        return 0
    haystack_parts: List[str] = []
    for field in fields:
        value = entry.get(field)
        if isinstance(value, str):
            haystack_parts.append(normalize_text(value))
        elif isinstance(value, list):
            haystack_parts.extend(normalize_text(str(item)) for item in value if item is not None)
    haystack = " ".join(part for part in haystack_parts if part)
    return sum(1 for token in tokens if token and token in haystack)


def rank_entries(entries: Iterable[dict[str, Any]], tokens: List[str], *, key: Callable[[dict[str, Any]], Any]) -> List[dict]:
    entries_list = list(entries)
    if not tokens:
        return sorted(entries_list, key=key)
    return sorted(entries_list, key=lambda entry: (-keyword_score(entry, tokens, entry.get("_search_fields", [])), key(entry)))


__all__ = [
    "QueryResult",
    "tokenize_keywords",
    "best_effort_keywords",
    "keyword_score",
    "rank_entries",
]
