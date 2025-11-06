"""News tool for returning curated sample headlines and formatting summaries."""

from __future__ import annotations
from typing import Dict, List

# --- Sample data -----------------------------------------------------------
_SAMPLE_STORIES = [
    {"title": "AI assistant tier rollout begins", "url": "https://example.com/ai-assistant"},
    {"title": "Weather patterns stabilize across regions", "url": "https://example.com/weather"},
    {"title": "Local tech conference announces speakers", "url": "https://example.com/conference"},
]

# --- Execution logic -------------------------------------------------------
def run(payload: Dict[str, object]) -> Dict[str, object]:
        # Return stories that loosely match the requested ``topic``
    topic = str(payload.get("topic", "top stories")).lower()

    stories = [story for story in _SAMPLE_STORIES if topic in story["title"].lower()]
    if not stories:
        stories = _SAMPLE_STORIES[:2]

    return {
        "type": "news",
        "topic": topic,
        "stories": stories,
    }

# --- Formatting helpers ----------------------------------------------------
def format_news_list(result: Dict[str, object]) -> str:
        # Format a human-readable list of stories for presentation
    stories: List[Dict[str, str]] = result.get("stories", [])
    if not stories:
        return "I couldn't find any relevant news right now."

    lines = ["Here are the latest headlines:"]
    for story in stories:
        title = story.get("title", "Untitled story")
        url = story.get("url", "#")
        lines.append(f"- {title} ({url})")
    return "\n".join(lines)