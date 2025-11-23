"""Kitchen tip intent parsing."""

from __future__ import annotations

import re
from typing import Dict, Optional

from core.parser_utils import extract_after_keywords, extract_json_array_after_keyword
from core.text_parsing import extract_title_from_text
from core.parsers.types import CommandResult


def matches(lowered: str) -> bool:
    return "kitchen" in lowered and "tip" in lowered


def parse(message: str, lowered: str) -> Optional[CommandResult]:
    payload: Dict[str, object] = {"message": message, "domain": "kitchen"}

    if re.search(r"add\s+(?:a\s+)?kitchen tip", lowered) or "create kitchen tip" in lowered or "via the form" in lowered:
        payload["action"] = "create"
        title = extract_title_from_text(message)
        if not title and ":" in message:
            title = message.split(":", 1)[1].strip()
        if not title:
            title = message
        payload["title"] = title
        payload["content"] = title
        tags = extract_json_array_after_keyword(message, "tags")
        if not tags:
            tag_match = re.search(r"tags?\s+([A-Za-z0-9 ,/]+)", message, re.IGNORECASE)
            if tag_match:
                tags = [tag.strip() for tag in tag_match.group(1).split(",") if tag.strip()]
        if tags:
            payload["keywords"] = tags
        link_match = re.search(r"link\s+(https?://\S+)", message, re.IGNORECASE)
        if link_match:
            payload["link"] = link_match.group(1).strip()
        return CommandResult(tool="kitchen_tips", payload=payload)

    if any(keyword in lowered for keyword in ("list kitchen", "kitchen tips list", "show kitchen tips")):
        payload["action"] = "list"
        return CommandResult(tool="kitchen_tips", payload=payload)

    if ("share a kitchen tip" in lowered or ("kitchen tip" in lowered and "about" in lowered)) or (
        "search" in lowered and "kitchen" in lowered
    ):
        payload["action"] = "find"
        query = extract_after_keywords(message, ["about", "for"]) or extract_title_from_text(message) or message
        payload["keywords"] = query.strip(' "')
        return CommandResult(tool="kitchen_tips", payload=payload)

    if "get kitchen" in lowered or ("kitchen tip" in lowered and "list" not in lowered):
        payload["action"] = "find"
        title = extract_title_from_text(message) or message
        payload["id"] = title
        return CommandResult(tool="kitchen_tips", payload=payload)

    if "delete kitchen tip" in lowered or "remove kitchen tip" in lowered:
        payload["action"] = "delete"
        target = extract_title_from_text(message) or extract_after_keywords(message, ["tip", "about", "called"]) or message
        payload["target_title"] = target.strip(' "')
        return CommandResult(tool="kitchen_tips", payload=payload)

    if "update kitchen tip" in lowered or "edit kitchen tip" in lowered:
        payload["action"] = "update"
        target = extract_title_from_text(message) or extract_after_keywords(message, ["tip", "about", "called"]) or message
        payload["target_title"] = target.strip(' "')
        return CommandResult(tool="kitchen_tips", payload=payload)

    return None


__all__ = ["matches", "parse"]
