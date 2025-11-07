"""Shared news search utilities used by Tier-1 tools.

This module consolidates the RSS / NewsAPI fetching logic that previously
lived in the Rasa action layer so the standalone Python runtime can reuse it
without importing legacy packages.
"""

from __future__ import annotations

import datetime as dt
import os
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
        # Encountered a consent/interstitial page.
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
    """Expose the default search limit for callers that want a fallback."""

    return _NEWS_SEARCH_LIMIT


def _filter_allowed_sources(items: List[Dict[str, str]]) -> List[Dict[str, str]]:
    allowed: List[Dict[str, str]] = []
    for item in items:
        url = (item.get("url") or "").lower()
        if ".no" in url:
            continue
        allowed.append(item)
    return allowed
