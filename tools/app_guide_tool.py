"""Tool wrapper around the Notes knowledge base."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from knowledge.app_guide import AppGuideStore
from core.tooling.query_helpers import best_effort_keywords, rank_entries, tokenize_keywords

    # WHAT: handle list/find/create/update/delete for the Notes knowledge store.
    # WHY: keeping RAG-style knowledge in one tool prevents drift between router flows and reviewer corrections.
    # HOW: normalize action aliases, resolve ids/titles/keywords, validate inputs, and call `AppGuideStore` with dry-run support.
def run(payload: Dict[str, Any], *, dry_run: bool = False) -> Dict[str, Any]:

    raw_action = str(payload.get("action", "list")).strip().lower() or "list"
    store = AppGuideStore()
    action = _resolve_action(raw_action, payload, store)

    if action == "list":
        sections = store.list_sections()
        return {
            "type": "app_guide",
            "domain": "knowledge",
            "action": "list",
            "sections": sections,
            "count": len(sections),
        }

    if action == "find":
        entry_id = _resolve_entry_id(payload, store)
        if entry_id:
            section = store.get_section(entry_id)
            if not section:
                return _error("find", "not_found", f"Section '{entry_id}' was not found.")
            return {
                "type": "app_guide",
                "domain": "knowledge",
                "action": "find",
                "sections": [section],
                "count": 1,
                "query": entry_id,
                "exact_match": True,
            }
        keywords = _coerce_keywords(payload)
        if not keywords:
            return _error("find", "missing_keywords", "Provide keywords or a section id to search the knowledge base.")
        tokens = tokenize_keywords(keywords)
        sections = store.list_sections()
        for section in sections:
            section['_search_fields'] = [section.get('title', ''), section.get('content', ''), section.get('id', '')]
        ranked = rank_entries(sections, tokens, key=lambda entry: entry.get('id', ''))
        for section in ranked:
            section.pop('_search_fields', None)
        return {
            "type": "app_guide",
            "domain": "knowledge",
            "action": "find",
            "sections": ranked,
            "query": keywords,
            "count": len(ranked),
            "exact_match": False,
        }

    if action == "create":
        entry_id = _coerce_id(payload)
        title = str(payload.get("title") or "").strip()
        note = str(payload.get("content") or "").strip()
        link = payload.get("link")
        keywords = payload.get("keywords")
        if not title:
            return _error("create", "missing_title", "Notes require a section name.")
        if not note:
            return _error("create", "missing_content", "Notes require content.")
        existing_section = None
        if not entry_id:
            existing_section = store.find_by_title(title)
            if existing_section:
                entry_id = existing_section["id"]
        if not entry_id:
            entry_id = _generate_entry_id(title, store)
        insert_mode = str(payload.get("insert_mode") or "top").strip().lower()
        position = "bottom" if insert_mode in {"bottom", "append", "end"} else "top"
        entry = store.insert_note(
            entry_id,
            title or entry_id,
            note,
            position=position,
            keywords=_parse_keywords(keywords) if keywords is not None else None,
            link=_coerce_link(payload),
            dry_run=dry_run,
        )
        return {
            "type": "app_guide",
            "domain": "knowledge",
            "action": "create",
            "section": entry,
            "insert_position": position,
        }

    if action == "update":
        entry_id = _resolve_entry_id(payload, store)
        if not entry_id:
            return _error("update", "missing_id", "Section ID or title is required to update an entry.")
        existing = store.get_section(entry_id)
        if not existing:
            return _error("update", "not_found", f"Section '{entry_id}' was not found.")
        title_raw = payload.get("title")
        content_raw = payload.get("content")
        link_raw = _coerce_link(payload)
        keywords_raw = payload.get("keywords")
        if title_raw is None and content_raw is None:
            return _error("update", "missing_fields", "Provide a new section title and/or content to update.")
        title = str(title_raw).strip() if title_raw is not None else existing.get("title", "")
        content = str(content_raw).strip() if content_raw is not None else existing.get("content", "")
        keywords = (
            _parse_keywords(keywords_raw)
            if keywords_raw is not None
            else existing.get("keywords", [])
        )
        if not title:
            return _error("update", "missing_title", "Notes sections require a title.")
        entry = store.upsert_section(
            entry_id,
            title,
            content,
            keywords=keywords,
            link=link_raw if link_raw is not None else existing.get("link"),
            dry_run=dry_run,
        )
        return {
            "type": "app_guide",
            "domain": "knowledge",
            "action": "update",
            "section": entry,
        }

    if action == "overwrite":
        entry_id = _resolve_entry_id(payload, store)
        if not entry_id:
            return _error("overwrite", "missing_id", "Section ID or title is required.")
        content = str(payload.get("content") or "").strip()
        if content:
            section = store.overwrite_section(
                entry_id,
                str(payload.get("title") or ""),
                content,
                keywords=_parse_keywords(payload.get("keywords")) if payload.get("keywords") is not None else None,
                link=_coerce_link(payload),
                dry_run=dry_run,
            )
        else:
            section = store.overwrite_section(
                entry_id,
                str(payload.get("title") or ""),
                "",
                keywords=_parse_keywords(payload.get("keywords")) if payload.get("keywords") is not None else None,
                link=_coerce_link(payload),
                dry_run=dry_run,
            )
        return {
            "type": "app_guide",
            "domain": "knowledge",
            "action": "overwrite",
            "section": section,
        }

    if action == "delete":
        entry_id = _resolve_entry_id(payload, store)
        if not entry_id:
            return _error("delete", "missing_id", "Section ID or title is required to delete an entry.")
        removed = store.delete_section(entry_id, dry_run=dry_run)
        if not removed:
            return _error("delete", "not_found", f"Section '{entry_id}' was not found.")
        return {
            "type": "app_guide",
            "domain": "knowledge",
            "action": "delete",
            "deleted": True,
            "id": entry_id,
        }

    return _error(action, "unsupported_action", f"Notes action '{action}' is not supported.")


    # WHAT: turn structured Notes tool payloads into reviewer-facing text.
    # WHY: ensures list/find/create/update/delete replies remain consistent across CLI, router, and Tier‑5.
    # HOW: branch on action, include IDs/titles/content snippets, and fall back to friendly errors.
def format_app_guide_response(result: Dict[str, Any]) -> str:

    if "error" in result:
        return result.get("message", "Notes command failed.")

    action = result.get("action")
    if action == "list":
        sections = result.get("sections") or []
        if not sections:
            return "Notes are empty."
        lines = [f"- {entry['id']}: {entry['title']}" for entry in sections]
        return "Notes sections:\n" + "\n".join(lines)

    if action == "find":
        sections = result.get("sections") or []
        if not sections:
            return f"No sections match '{result.get('query', 'your search')}'."
        if result.get("exact_match"):
            section = sections[0]
            message = f"Section '{section.get('id')}' — {section.get('title')}\n{section.get('content', '').strip()}"
            if section.get("link"):
                message += f"\nLink: {section['link']}"
            return message
        lines = [f"- {entry.get('id')}: {entry.get('title')}" for entry in sections]
        return f"Matches for '{result.get('query')}':\n" + "\n".join(lines)

    if action == "create":
        section = result.get("section") or {}
        position = result.get("insert_position")
        if position == "bottom":
            return f"Appended note to section '{section.get('id')}'."
        return f"Added note to section '{section.get('id')}'."

    if action == "update":
        section = result.get("section") or {}
        return f"Updated section '{section.get('id')}'."

    if action == "delete":
        return f"Deleted section '{result.get('id')}'."

    return "Notes request completed."


def _resolve_action(action: str, payload: Dict[str, Any], store: AppGuideStore) -> str:
    if action in {"get", "search"}:
        return "find"
    if action == "overwrite":
        return "overwrite"
    if action == "upsert":
        entry_id = _coerce_id(payload)
        if entry_id:
            return "update" if store.get_section(entry_id) else "create"
        return "create"
    return action


def _error(action: str, code: str, message: str) -> Dict[str, Any]:
    return {
        "type": "app_guide",
        "domain": "knowledge",
        "action": action,
        "error": code,
        "message": message,
    }


def _coerce_id(payload: Dict[str, Any]) -> str:
    return str(payload.get("id") or payload.get("section_id") or "").strip()


def _coerce_title_lookup(payload: Dict[str, Any]) -> str:
    return str(
        payload.get("lookup_title")
        or payload.get("title_lookup")
        or payload.get("target_title")
        or ""
    ).strip()


def _resolve_entry_id(payload: Dict[str, Any], store: AppGuideStore) -> str:
    entry_id = _coerce_id(payload)
    if entry_id:
        return entry_id
    lookup_title = _coerce_title_lookup(payload) or str(payload.get("title") or "").strip()
    if lookup_title:
        match = store.find_by_title(lookup_title)
        if match:
            return match.get("id", "")
    return ""


def _coerce_keywords(payload: Dict[str, Any]) -> str:
    raw = payload.get("keywords")
    if not raw:
        raw = payload.get("query") or payload.get("title") or payload.get("content")
    return str(raw or "").strip()


def _parse_keywords(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value).strip()
    if not text:
        return []
    return [segment.strip() for segment in text.split(",") if segment.strip()]


def _coerce_link(payload: Dict[str, Any]) -> Optional[str]:
    link = payload.get("link")
    if link is None:
        return None
    text = str(link).strip()
    return text or None


def _generate_entry_id(title: str, store: AppGuideStore) -> str:
    base = _slugify(title)
    if not base:
        base = "note"
    sections = {section["id"] for section in store.list_sections()}
    candidate = base
    suffix = 2
    while candidate in sections:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


__all__ = ["run", "format_app_guide_response"]
