"""News tool backed by the shared topic search helpers."""

from __future__ import annotations

from typing import Any, Dict, List

from core.news_service import looks_danish, news_search_limit, topic_news_search


# --- Execution logic -------------------------------------------------------
def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Return curated headlines for the requested ``topic``."""

    topic_raw = str(payload.get("topic") or payload.get("message") or "").strip()
    topic_display = topic_raw or "top stories"
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
            lines.append(f"- {title} ({url})")
        else:
            lines.append(f"- {title}")
    return "\n".join(lines)
