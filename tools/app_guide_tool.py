"""Tool wrapper around the App Guide knowledge base."""

from __future__ import annotations

from typing import Any, Dict

from knowledge.app_guide import AppGuideStore
from core.tooling.query_helpers import best_effort_keywords, rank_entries, tokenize_keywords

def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle knowledge base commands (list/find/create/update/delete)."""

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
        section_id = str(payload.get("section_id") or payload.get("id") or "").strip()
        if section_id:
            section = store.get_section(section_id)
            if not section:
                return _error("find", "not_found", f"Section '{section_id}' was not found.")
            return {
                "type": "app_guide",
                "domain": "knowledge",
                "action": "find",
                "sections": [section],
                "count": 1,
                "query": section_id,
                "exact_match": True,
            }
        keywords = best_effort_keywords(payload, keys=("keywords", "query", "title", "content"))
        if not keywords.strip():
            return _error(
                "find",
                "missing_keywords",
                "Provide keywords or a section id to search the knowledge base.",
            )
        tokens = tokenize_keywords(keywords)
        sections = store.list_sections()
        for section in sections:
            section['_search_fields'] = ['title', 'content', 'section_id']
        ranked = rank_entries(sections, tokens, key=lambda entry: entry.get('section_id', ''))
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
        section_id = str(payload.get("section_id") or payload.get("id") or "").strip()
        title = str(payload.get("title") or "").strip()
        content = str(payload.get("content") or "").strip()
        if not section_id:
            return _error("create", "missing_id", "Provide a section_id to create an entry.")
        if not title:
            return _error("create", "missing_title", "Knowledge entries require a title.")
        if store.get_section(section_id):
            return _error("create", "already_exists", f"Section '{section_id}' already exists.")
        entry = store.upsert_section(section_id, title, content)
        return {
            "type": "app_guide",
            "domain": "knowledge",
            "action": "create",
            "section": entry,
        }

    if action == "update":
        section_id = str(payload.get("section_id") or payload.get("id") or "").strip()
        if not section_id:
            return _error("update", "missing_id", "Section ID is required to update an entry.")
        existing = store.get_section(section_id)
        if not existing:
            return _error("update", "not_found", f"Section '{section_id}' was not found.")
        title_raw = payload.get("title")
        content_raw = payload.get("content")
        if title_raw is None and content_raw is None:
            return _error("update", "missing_fields", "Provide a new title and/or content to update the entry.")
        title = str(title_raw).strip() if title_raw is not None else existing.get("title", "")
        content = str(content_raw).strip() if content_raw is not None else existing.get("content", "")
        if not title:
            return _error("update", "missing_title", "Knowledge entries require a title.")
        entry = store.upsert_section(section_id, title, content)
        return {
            "type": "app_guide",
            "domain": "knowledge",
            "action": "update",
            "section": entry,
        }

    if action == "delete":
        section_id = str(payload.get("section_id") or payload.get("id") or "").strip()
        if not section_id:
            return _error("delete", "missing_id", "Section ID is required to delete an entry.")
        removed = store.delete_section(section_id)
        if not removed:
            return _error("delete", "not_found", f"Section '{section_id}' was not found.")
        return {
            "type": "app_guide",
            "domain": "knowledge",
            "action": "delete",
            "deleted": True,
            "section_id": section_id,
        }

    return _error(action, "unsupported_action", f"Knowledge action '{action}' is not supported.")


def format_app_guide_response(result: Dict[str, Any]) -> str:
    """Render user-visible responses for knowledge commands."""

    if "error" in result:
        return result.get("message", "Knowledge command failed.")

    action = result.get("action")
    if action == "list":
        sections = result.get("sections") or []
        if not sections:
            return "Knowledge base is empty."
        lines = [f"- {entry['section_id']}: {entry['title']}" for entry in sections]
        return "Knowledge sections:\n" + "\n".join(lines)

    if action == "find":
        sections = result.get("sections") or []
        if not sections:
            return f"No knowledge sections match '{result.get('query', 'your search')}'."
        if result.get("exact_match"):
            section = sections[0]
            return f"Section '{section.get('section_id')}' — {section.get('title')}\n{section.get('content', '').strip()}"
        lines = [f"- {entry.get('section_id')}: {entry.get('title')}" for entry in sections]
        return f"Matches for '{result.get('query')}':\n" + "\n".join(lines)

    if action == "create":
        section = result.get("section") or {}
        return f"Created knowledge section '{section.get('section_id')}'."

    if action == "update":
        section = result.get("section") or {}
        return f"Updated knowledge section '{section.get('section_id')}'."

    if action == "delete":
        return f"Deleted knowledge section '{result.get('section_id')}'."

    return "Knowledge request completed."


def _resolve_action(action: str, payload: Dict[str, Any], store: AppGuideStore) -> str:
    if action in {"get", "search"}:
        return "find"
    if action == "upsert":
        section_id = str(payload.get("section_id") or payload.get("id") or "").strip()
        if section_id:
            return "update" if store.get_section(section_id) else "create"
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


__all__ = ["run", "format_app_guide_response"]
