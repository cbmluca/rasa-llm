"""News tool with embedded RSS/NewsAPI helpers."""

from __future__ import annotations

import datetime as dt
import os
import re
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote
from xml.etree import ElementTree as ET

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


# ---------------------------------------------------------------------------
# Configuration (environment driven)
# ---------------------------------------------------------------------------
_NEWS_API_KEY = os.getenv("NEWS_API_KEY", "").strip()
_NEWS_SEARCH_LIMIT = int(os.getenv("NEWS_SEARCH_LIMIT", "5"))
_NEWS_SEARCH_DAYS = int(os.getenv("NEWS_SEARCH_DAYS", "3"))
_NEWS_LOCAL_DAYS = int(os.getenv("NEWS_LOCAL_DAYS", str(_NEWS_SEARCH_DAYS)))
_NEWS_USER_AGENT = os.getenv("NEWS_USER_AGENT", "Mozilla/5.0")
_TOPIC_SUFFIX_KEYWORDS = ("news", "headlines", "headline", "stories", "updates", "update")
_TOPIC_LEADING_PHRASES = [
    "catch me up on",
    "catch me up",
    "update me on",
    "give me the latest",
    "give me latest",
    "give me",
    "show me the latest",
    "show me latest",
    "show me",
    "bring me up to speed on",
    "bring me up to speed",
    "i need",
    "need",
    "i want",
    "want",
    "can you give me",
    "please give me",
    "please show me",
    "please",
    "tell me about",
    "tell me",
    "any",
    "some",
    "the latest",
    "latest",
    "current",
    "recent",
    "top",
]
_TOPIC_PREPOSITIONS = ("about", "on", "regarding", "around", "over")


# ---------------------------------------------------------------------------
# HTTP session with retry/backoff suitable for news APIs
# ---------------------------------------------------------------------------
_session = requests.Session()
_session.headers.update({
    "User-Agent": _NEWS_USER_AGENT or "Mozilla/5.0",
    "Accept": "*/*",
})
_retry = Retry(total=3, backoff_factor=0.2, status_forcelist=[429, 500, 502, 503, 504])
_session.mount("https://", HTTPAdapter(max_retries=_retry))
_session.mount("http://", HTTPAdapter(max_retries=_retry))


def _http_get(url: str, **kwargs) -> requests.Response:
    kwargs.setdefault("timeout", 8)
    return _session.get(url, **kwargs)


# ---------------------------------------------------------------------------
# News search helpers (Google News RSS + NewsAPI)
# ---------------------------------------------------------------------------
def looks_danish(text: str) -> bool:
    candidate = (text or "").lower()
    if any(ch in candidate for ch in "æøå"):
        return True
    keywords = {
        "hvad",
        "nyheder",
        "seneste",
        "lov",
        "folketinget",
        "danmark",
        "dansk",
        "dr",
        "politik",
        "aftale",
        "sygehusvæsenet",
        "valg",
        "regeringen",
    }
    return any(word in candidate for word in keywords)


def _google_news_rss(query: str, *, lang: str, country: str, limit: int, days: int) -> List[Dict[str, str]]:
    hl = lang.lower()
    gl = country.upper()
    ceid = f"{gl}:{hl}"
    url = (
        "https://news.google.com/rss/search?q="
        f"{quote(query)}&hl={hl}&gl={gl}&ceid={ceid}"
    )

    cutoff = dt.datetime.utcnow() - dt.timedelta(days=max(1, int(days)))
    try:
        response = _http_get(url, allow_redirects=True)
        response.raise_for_status()
    except Exception:
        return []

    text = response.text
    if "<rss" not in text and "<feed" not in text:
        return []

    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return []

    items: List[Dict[str, str]] = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub = item.findtext("pubDate")

        recent = True
        if pub:
            try:
                parsed = parsedate_to_datetime(pub)
                if parsed.tzinfo is not None:
                    parsed = parsed.astimezone(dt.timezone.utc).replace(tzinfo=None)
                recent = parsed >= cutoff
            except Exception:
                recent = True

        if title and recent:
            items.append({"title": title, "url": link})

        if len(items) >= limit:
            break

    return items


def _newsapi_search(query: str, *, limit: int, days: int, language: Optional[str]) -> List[Dict[str, str]]:
    if not _NEWS_API_KEY:
        return []

    from_date = (
        dt.datetime.utcnow() - dt.timedelta(days=max(1, int(days)))
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    params: Dict[str, Any] = {
        "q": query,
        "sortBy": "publishedAt",
        "pageSize": limit,
        "from": from_date,
    }
    if language:
        params["language"] = language

    try:
        response = _http_get(
            "https://newsapi.org/v2/everything",
            headers={"X-Api-Key": _NEWS_API_KEY},
            params=params,
        )
        response.raise_for_status()
    except Exception:
        return []

    articles = response.json().get("articles", [])[:limit]
    results: List[Dict[str, str]] = []
    for article in articles:
        title = (article.get("title") or "").strip()
        url = (article.get("url") or "").strip()
        if title:
            results.append({"title": title, "url": url})
    return results


def topic_news_search(
    query: str,
    *,
    limit: Optional[int] = None,
    language_override: Optional[str] = None,
    allow_global_fallback: bool = True,
) -> List[Dict[str, str]]:
    """Return recent headlines for ``query`` with optional language overrides."""

    limit = int(limit or _NEWS_SEARCH_LIMIT)
    global_days = _NEWS_SEARCH_DAYS
    local_days = _NEWS_LOCAL_DAYS

    attempts: List[Dict[str, Any]] = []

    if language_override == "en":
        attempts = [
            {"type": "newsapi", "language": "en", "days": global_days},
            {"type": "rss", "lang": "en", "country": "US", "days": global_days},
        ]
    elif language_override == "da":
        attempts = [
            {"type": "rss", "lang": "da", "country": "DK", "days": local_days},
            {"type": "newsapi", "language": "da", "days": local_days},
        ]
    else:
        if looks_danish(query):
            attempts = [
                {"type": "rss", "lang": "da", "country": "DK", "days": local_days},
                {"type": "newsapi", "language": "da", "days": local_days},
            ]
        else:
            attempts = [
                {"type": "newsapi", "language": "en", "days": global_days},
                {"type": "rss", "lang": "en", "country": "US", "days": global_days},
            ]

    for attempt in attempts:
        if attempt["type"] == "newsapi":
            items = _newsapi_search(
                query,
                limit=limit,
                days=attempt["days"],
                language=attempt["language"],
            )
        else:
            items = _google_news_rss(
                query,
                lang=attempt["lang"],
                country=attempt["country"],
                limit=limit,
                days=attempt["days"],
            )
        if items:
            return _filter_allowed_sources(items)

    if (
        allow_global_fallback
        and language_override is None
        and looks_danish(query)
    ):
        fallback_chain = [
            {"type": "newsapi", "language": "en", "days": global_days},
            {"type": "rss", "lang": "en", "country": "US", "days": global_days},
        ]
        for attempt in fallback_chain:
            if attempt["type"] == "newsapi":
                items = _newsapi_search(
                    query,
                    limit=limit,
                    days=attempt["days"],
                    language=attempt["language"],
                )
            else:
                items = _google_news_rss(
                    query,
                    lang=attempt["lang"],
                    country=attempt["country"],
                    limit=limit,
                    days=attempt["days"],
                )
            if items:
                return _filter_allowed_sources(items)

    return []


def news_search_limit() -> int:
    return _NEWS_SEARCH_LIMIT


def _filter_allowed_sources(items: List[Dict[str, str]]) -> List[Dict[str, str]]:
    allowed: List[Dict[str, str]] = []
    for item in items:
        url = (item.get("url") or "").lower()
        if ".no" in url:
            continue
        allowed.append(item)
    return allowed


# --- Execution logic -------------------------------------------------------
def run(payload: Dict[str, Any], *, dry_run: bool = False) -> Dict[str, Any]:
    """Aggregate breaking news articles for the requested topic.

    WHAT: query upstream providers (NewsAPI/Google) and summarize findings.
    WHY: deterministic tool responses keep Tier‑1 reviewable and allow the
    router to reuse the same path when a prompt is escalated.
    HOW: normalize the topic, call the provider clients, and return both
    formatted markdown + raw article payloads.
    """
    """Return curated headlines for the requested ``topic``."""

    message_text = payload.get("message")
    topic_raw = str(payload.get("topic") or "").strip()
    topic_display = topic_raw or _clean_topic_query(message_text) or (str(message_text).strip() if isinstance(message_text, str) else "")
    topic_display = topic_display or "top stories"
    limit = news_search_limit()
    language_override = payload.get("language")
    if isinstance(language_override, str):
        language_override = language_override.strip().lower() or None
    if language_override not in {None, "en", "da"}:
        language_override = None

    query_is_danish = looks_danish(topic_display)
    allow_global_fallback = not (language_override is None and query_is_danish)

    stories = topic_news_search(
        topic_display,
        limit=limit,
        language_override=language_override,
        allow_global_fallback=allow_global_fallback,
    )

    suggest_english = not stories and language_override is None and query_is_danish

    return {
        "type": "news",
        "topic": topic_display,
        "stories": stories,
        "language": language_override or ("da" if query_is_danish else "en"),
        "suggest_english": suggest_english,
    }


# --- Formatting helpers ----------------------------------------------------
def format_news_list(result: Dict[str, Any]) -> str:
    """Format a list of stories returned by :func:`run`."""

    stories: List[Dict[str, str]] = result.get("stories", [])
    topic = result.get("topic", "the requested topic")
    suggest_english = bool(result.get("suggest_english"))

    if not stories:
        if suggest_english:
            return (
                f"I couldn't find recent Danish news for '{topic}'. "
                "Reply with `search english news about {topic}` if you'd like me to try English sources."
            )
        return f"I couldn't find recent news for '{topic}'."

    lines = [f"Top results for '{topic}':"]
    for story in stories:
        title = story.get("title", "Untitled story")
        url = story.get("url", "#")
        if url:
            lines.append(f"- [{title}]({url})")
        else:
            lines.append(f"- {title}")
    return "\n".join(lines)


# Keep this sanitizer so topic searches never include the entire user prompt.
# Removing it reintroduces noisy RSS/API queries and degrades precision.
def _clean_topic_query(message: Any) -> str:
    if not isinstance(message, str):
        return ""
    text = message.strip()
    if not text:
        return ""

    stripped = text.strip(" \t\n\r?.!\"'“””")
    lowered = stripped.lower()
    for keyword in _TOPIC_SUFFIX_KEYWORDS:
        idx = lowered.rfind(keyword)
        if idx == -1:
            continue
        before = stripped[:idx].strip()
        after = stripped[idx + len(keyword):].strip()
        candidate = after or before
        candidate = _strip_topic_leading(candidate)
        if candidate:
            return candidate
    return _strip_topic_leading(stripped)


def _strip_topic_leading(text: str) -> str:
    if not text:
        return ""
    cleaned = text.strip(" \t\n\r,.!?\"'")
    lowered = cleaned.lower()
    for phrase in sorted(_TOPIC_LEADING_PHRASES, key=len, reverse=True):
        if lowered.startswith(phrase):
            cleaned = cleaned[len(phrase):].lstrip(" \t\n\r,.!?\"'")
            lowered = cleaned.lower()
            break
    lowered = cleaned.lower()
    for prep in _TOPIC_PREPOSITIONS:
        if lowered.startswith(prep + " "):
            cleaned = cleaned[len(prep):].lstrip(" \t\n\r,.!?\"'")
            lowered = cleaned.lower()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()
