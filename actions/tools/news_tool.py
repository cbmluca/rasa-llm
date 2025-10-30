from dataclasses import dataclass
from typing import Any, Dict, List
from urllib.parse import quote
from xml.etree import ElementTree as ET
import datetime as _dt
from email.utils import parsedate_to_datetime

from ..http import get
from ..conf import (
    NEWS_API_KEY, NEWS_SEARCH_LIMIT, NEWS_SEARCH_DAYS, NEWS_LOCAL_DAYS
)
from .registry import register

def _google_news_rss(query: str, lang: str, country: str, limit: int, days: int) -> List[Dict[str, str]]:
    """Google News RSS with proper User-Agent + recency filter (FIX #1 & #2)."""
    hl, gl, ceid = lang.lower(), country.upper(), f"{country.upper()}:{lang.lower()}"
    url = f"https://news.google.com/rss/search?q={quote(query)}&hl={hl}&gl={gl}&ceid={ceid}"

    cutoff = _dt.datetime.utcnow() - _dt.timedelta(days=max(1, int(days)))
    try:
        r = get(url, allow_redirects=True)
        r.raise_for_status()
        txt = r.text
        if "<rss" not in txt and "<feed" not in txt:
            return []  # consent/interstitial or unexpected
        root = ET.fromstring(txt)

        items: List[Dict[str, str]] = []
        for item in root.findall(".//item"):
            title = (item.findtext("title") or "").strip()
            link  = (item.findtext("link") or "").strip()
            pub   = item.findtext("pubDate")
            recent = True
            if pub:
                try:
                    dt = parsedate_to_datetime(pub).astimezone(_dt.timezone.utc).replace(tzinfo=None)
                    recent = dt >= cutoff
                except Exception:
                    recent = True
            if title and recent:
                items.append({"title": title, "url": link})
        return items[:limit]
    except Exception:
        return []

def _newsapi_search(query: str, limit: int, days: int, language: str | None) -> List[Dict[str, str]]:
    if not NEWS_API_KEY:
        return []
    from_date = (_dt.datetime.utcnow() - _dt.timedelta(days=max(1, int(days)))).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        r = get(
            "https://newsapi.org/v2/everything",
            headers={"X-Api-Key": NEWS_API_KEY},
            params={"q": query, "sortBy": "publishedAt", "pageSize": limit, "from": from_date, **({"language": language} if language else {})},
        )
        r.raise_for_status()
        arts = r.json().get("articles", [])[:limit]
        out = []
        for a in arts:
            title = (a.get("title") or "").strip()
            url   = (a.get("url") or "").strip()
            if title:
                out.append({"title": title, "url": url})
        return out
    except Exception:
        return []

def _looks_danish(text: str) -> bool:
    t = (text or "").lower()
    if any(ch in t for ch in "æøå"):
        return True
    dk = ["hvad","nyheder","seneste","lov","folketinget","danmark","dansk","dr","politik","aftale","sygehusvæsenet","valg","regeringen"]
    return any(w in t for w in dk)

def topic_news_search(query: str, limit: int) -> List[Dict[str, str]]:
    global_days = NEWS_SEARCH_DAYS
    local_days  = NEWS_LOCAL_DAYS

    if _looks_danish(query):
        items = _google_news_rss(query, lang="da", country="DK", limit=limit, days=local_days)
        if items: return items
        # optional: try NewsAPI da
        items = _newsapi_search(query, limit=limit, days=local_days, language="da")
        if items: return items
        return _google_news_rss(query, lang="en", country="US", limit=limit, days=global_days)

    items = _newsapi_search(query, limit=limit, days=global_days, language="en")
    if items: return items
    return _google_news_rss(query, lang="en", country="US", limit=limit, days=global_days)

@dataclass
class NewsSearchTool:
    name: str = "news_search"
    def run(self, args: Dict[str, Any]) -> str:
        q = (args.get("query") or "").strip()
        limit = int(args.get("limit", NEWS_SEARCH_LIMIT))
        if not q:
            return "Which topic should I look up?"
        items = topic_news_search(q, limit=limit)
        if not items:
            return f"No news found for '{q}'."
        lines = [f"- {it['title']}" + (f" ({it['url']})" if it.get('url') else "") for it in items]
        return f"Top results for '{q}':\n" + "\n".join(lines)

# register on import
register(NewsSearchTool())