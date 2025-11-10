"""App Guide intent parsing."""

from __future__ import annotations

from typing import Dict, Optional

from core.parser_utils import extract_after_keywords
from core.text_parsing import extract_quoted_strings
from core.parsers.types import CommandResult


def matches(lowered: str) -> bool:
    return "app guide" in lowered or "knowledge" in lowered


def parse(message: str, lowered: str) -> Optional[CommandResult]:
    payload: Dict[str, object] = {"message": message, "domain": "knowledge"}
    quotes = extract_quoted_strings(message)

    if "list" in lowered or ("sections" in lowered and any(term in lowered for term in ("what", "have", "available"))):
        payload["action"] = "list"
    elif "delete" in lowered:
        payload["action"] = "delete"
        if quotes:
            payload["section_id"] = quotes[0]
    elif any(word in lowered for word in ("update", "create", "add", "upsert")):
        payload["action"] = "upsert"
        if quotes:
            payload["section_id"] = quotes[0]
            if len(quotes) > 1:
                payload["title"] = quotes[1]
            if len(quotes) > 2:
                payload["content"] = quotes[2]
        else:
            section_id = _extract_section_id(message)
            if section_id:
                payload["section_id"] = section_id
    elif "get" in lowered or ("section" in lowered and "list" not in lowered):
        payload["action"] = "get"
        if quotes:
            payload["section_id"] = quotes[0]
        else:
            section_id = _extract_section_id(message)
            if section_id:
                payload["section_id"] = section_id
    else:
        payload["action"] = "list"

    return CommandResult(tool="app_guide", payload=payload)


def _extract_section_id(message: str) -> Optional[str]:
    section = extract_after_keywords(message, ["for", "about", "section"])
    if section:
        tokens = section.split()
        return tokens[0].strip(' "')
    return None


__all__ = ["matches", "parse"]
