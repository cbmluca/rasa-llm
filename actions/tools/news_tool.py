# Tools for retrieving topical news articles
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote
from xml.etree import ElementTree as ET

from ..conf import (
    NEWS_API_KEY, 
    NEWS_SEARCH_LIMIT, 
    NEWS_SEARCH_DAYS, 
    NEWS_LOCAL_DAYS,
)
from ..http import get
from .registry import register, register_alias

def _google_news_rss(
        query: str, 
        lang: str, 
        country: str, 
        limit: int, 
        days: int
) -> List[Dict[str, str]]:
    # Google News RSS with proper User-Agent + recency filter (FIX #1 & #2)
    hl = lang.lower()
    gl = country.upper()
    ceid = f"{gl}:{hl}"
    url = (
        "https://news.google.com/rss/search?q="
        f"{quote(query)}&hl={hl}&gl={gl}&ceid={ceid}"
    )

    cutoff = _dt.datetime.utcnow() - _dt.timedelta(days=max(1, int(days)))
    try:
        response = get(url, allow_redirects=True)
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
                dt = parsedate_to_datetime(pub)
                if dt.tzinfo is not None:
                    dt = dt.astimezone(_dt.timezone.utc).replace(tzinfo=None)
                recent = dt >= cutoff
            except Exception:
                recent = True

        if title and recent:
            items.append({"title": title, "url": link})

        if len(items) >= limit:
            break

    return items


def _newsapi_search(
    query: str,
    *,
    limit: int,
    days: int,
    language: Optional[str],
) -> List[Dict[str, str]]:
    # Search NewsAPI if credentials are available

    if not NEWS_API_KEY:
        return []
    
    from_date = (
        _dt.datetime.utcnow() - _dt.timedelta(days=max(1, int(days)))
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
        response = get(
            "https://newsapi.org/v2/everything",
            headers={"X-Api-Key": NEWS_API_KEY},
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

def _looks_danish(text: str) -> bool:
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

def topic_news_search(query: str, *, limit: int) -> List[Dict[str, str]]:
    # Find relevant news for a topic with Danish-first heuristics

    global_days = NEWS_SEARCH_DAYS
    local_days = NEWS_LOCAL_DAYS

    if _looks_danish(query):
        items = _google_news_rss(
            query,
            lang="da",
            country="DK",
            limit=limit,
            days=local_days,
        )
        if items:
            return items

        items = _newsapi_search(
            query,
            limit=limit,
            days=local_days,
            language="da",
        )
        if items:
            return items

        return _google_news_rss(
            query,
            lang="en",
            country="US",
            limit=limit,
            days=global_days,
        )

    items = _newsapi_search(
        query,
        limit=limit,
        days=global_days,
        language="en",
    )
    if items:
        return items

    return _google_news_rss(
        query,
        lang="en",
        country="US",
        limit=limit,
        days=global_days,
    )

@dataclass
class NewsSearchTool:
    name: str = "news_search"

    def run(self, args: Dict[str, Any]) -> str:
        query = (args.get("query") or "").strip()
        limit = int(args.get("limit", NEWS_SEARCH_LIMIT))
        if not query:
            return "Which topic should I look up?"
        
        items = topic_news_search(query, limit=limit)
        if not items:
            return f"No news found for '{query}'."

        lines = [
            f"- {item['title']}" + (f" ({item['url']})" if item.get("url") else "")
            for item in items
        ]
        return f"Top results for '{query}':\n" + "\n".join(lines)

# register on import
register(NewsSearchTool())
register_alias("topic_news", "news_search")