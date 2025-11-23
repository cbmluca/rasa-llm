"""Command parser that extracts structured tool calls from free-form text."""

from __future__ import annotations

from typing import Optional

from core.parsers import app_guide, calendar, kitchen, news, todo, weather
from core.parsers.types import CommandResult


def parse_command(message: str) -> Optional[CommandResult]:
    """Try each domain parser until one claims the utterance.

    WHAT: run intent-specific regex/token heuristics for weather/news/todo/etc.
    WHY: deterministic parsing keeps Tier‑1 auditable and faster than the LLM
    router when rules are clear.
    HOW: fan-out across parser modules in priority order, passing both the
    original text and a lowered cache to avoid repeated allocations.
    """
    if not message:
        return None
    lowered = message.lower()

    if weather.matches(lowered):
        result = weather.parse(message)
        if result:
            return result

    if news.matches(lowered):
        result = news.parse(message)
        if result:
            return result

    if "todo" in lowered or "task" in lowered or lowered.startswith("remember") or lowered.startswith("remind") or "remind me" in lowered:
        result = todo.parse(message, lowered)
        if result:
            return result

    if kitchen.matches(lowered):
        result = kitchen.parse(message, lowered)
        if result:
            return result

    if calendar.matches(lowered):
        result = calendar.parse(message, lowered)
        if result:
            return result

    if app_guide.matches(lowered):
        result = app_guide.parse(message, lowered)
        if result:
            return result

    return None


__all__ = ["parse_command", "CommandResult"]
