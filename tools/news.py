"""News tool backed by the shared topic search helpers."""

from __future__ import annotations

from typing import Dict, List, Any

from core.news_service import news_search_limit, topic_news_search


# --- Execution logic -------------------------------------------------------
def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Return curated headlines for the requested ``topic``."""

    topic_raw = str(payload.get("topic") or payload.get("message") or "").strip()
    topic_display = topic_raw or "top stories"
    limit = news_search_limit()

    stories = topic_news_search(topic_display, limit=limit)

    return {
        "type": "news",
        "topic": topic_display,
        "stories": stories,
    }


# --- Formatting helpers ----------------------------------------------------
def format_news_list(result: Dict[str, Any]) -> str:
    """Format a list of stories returned by :func:`run`."""

    stories: List[Dict[str, str]] = result.get("stories", [])
    topic = result.get("topic", "the requested topic")
    if not stories:
        return f"I couldn't find recent news for '{topic}'."

    lines = [f"Top results for '{topic}':"]
    for story in stories:
        title = story.get("title", "Untitled story")
        url = story.get("url", "#")
        if url:
            lines.append(f"- {title} ({url})")
        else:
            lines.append(f"- {title}")
    return "\n".join(lines)
