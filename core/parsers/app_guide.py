"""Notes intent parsing."""

from __future__ import annotations

from typing import Dict, Optional

from core.parser_utils import extract_after_keywords
from core.text_parsing import extract_quoted_strings
from core.parsers.types import CommandResult


    # WHAT: ensure prompts mention “notes”/“app guide” or “knowledge” before parsing.
    # WHY: avoids extra work when the utterance clearly targets another tool.
    # HOW: simple substring checks.
def matches(lowered: str) -> bool:
    return "notes" in lowered or "app guide" in lowered or "knowledge" in lowered


    # WHAT: map knowledge prompts to list/find/create/update/delete actions.
    # WHY: Notes entries are managed via chat, so we need deterministic parsing.
    # HOW: look for verbs (delete/update/create/find), use quoted strings or “section …” phrasing to populate ids/titles/content.
def parse(message: str, lowered: str) -> Optional[CommandResult]:
    payload: Dict[str, object] = {"message": message, "domain": "knowledge"}
    quotes = extract_quoted_strings(message)

    if "delete" in lowered:
        payload["action"] = "delete"
        if quotes:
            payload["id"] = quotes[0]
        else:
            entry_id = _extract_section_identifier(message)
            if entry_id:
                payload["id"] = entry_id
        return CommandResult(tool="app_guide", payload=payload)

    if any(word in lowered for word in ("update", "edit", "change", "upsert")):
        payload["action"] = "update"
        if quotes:
            payload["id"] = quotes[0]
            if len(quotes) > 1:
                payload["title"] = quotes[1]
            if len(quotes) > 2:
                payload["content"] = quotes[2]
        else:
            entry_id = _extract_section_identifier(message)
            if entry_id:
                payload["id"] = entry_id
        return CommandResult(tool="app_guide", payload=payload)

    if any(word in lowered for word in ("create", "add", "new", "write")):
        payload["action"] = "create"
        payload["insert_mode"] = "bottom" if any(
            phrase in lowered for phrase in ("append", "bottom", "at the end")
        ) else "top"
        if quotes:
            payload["id"] = quotes[0]
            if len(quotes) > 1:
                payload["title"] = quotes[1]
            if len(quotes) > 2:
                payload["content"] = quotes[2]
        else:
            entry_id = _extract_section_identifier(message)
            if entry_id:
                payload["id"] = entry_id
        return CommandResult(tool="app_guide", payload=payload)

    if any(word in lowered for word in ("find", "search", "get")) or ("section" in lowered and "list" not in lowered):
        payload["action"] = "find"
        entry_id = None
        if quotes:
            payload["id"] = quotes[0]
            entry_id = quotes[0]
        else:
            entry_id = _extract_section_identifier(message)
            if entry_id:
                payload["id"] = entry_id
        if not entry_id:
            payload["keywords"] = quotes[0] if quotes else message
        return CommandResult(tool="app_guide", payload=payload)

    payload["action"] = "list"
    return CommandResult(tool="app_guide", payload=payload)


    # WHAT: pull a section identifier when the user didn’t quote it.
    # WHY: `find`/`delete` commands often refer to “section Budget sync” without quotes.
    # HOW: use `extract_after_keywords` and return the first token.
def _extract_section_identifier(message: str) -> Optional[str]:
    section = extract_after_keywords(message, ["for", "about", "section"])
    if section:
        tokens = section.split()
        return tokens[0].strip(' "')
    return None


__all__ = ["matches", "parse"]
