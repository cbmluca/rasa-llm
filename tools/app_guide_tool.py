"""Tool wrapper around the App Guide knowledge base."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from knowledge.app_guide import AppGuideStore
from core.tooling.query_helpers import best_effort_keywords, rank_entries, tokenize_keywords

def run(payload: Dict[str, Any], *, dry_run: bool = False) -> Dict[str, Any]:
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
        content = str(payload.get("content") or "").strip()
        link = _coerce_link(payload)
        keywords = _parse_keywords(payload.get("keywords"))
        if not entry_id:
            return _error("create", "missing_id", "Provide an id to create an entry.")
        if not title:
            return _error("create", "missing_title", "Knowledge entries require a title.")
        if store.get_section(entry_id):
            return _error("create", "already_exists", f"Section '{entry_id}' already exists.")
        entry = store.upsert_section(entry_id, title, content, keywords=keywords, link=link, dry_run=dry_run)
        return {
            "type": "app_guide",
            "domain": "knowledge",
            "action": "create",
            "section": entry,
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
            return _error("update", "missing_fields", "Provide a new title and/or content to update the entry.")
        title = str(title_raw).strip() if title_raw is not None else existing.get("title", "")
        content = str(content_raw).strip() if content_raw is not None else existing.get("content", "")
        keywords = (
            _parse_keywords(keywords_raw)
            if keywords_raw is not None
            else existing.get("keywords", [])
        )
        if not title:
            return _error("update", "missing_title", "Knowledge entries require a title.")
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
        lines = [f"- {entry['id']}: {entry['title']}" for entry in sections]
        return "Knowledge sections:\n" + "\n".join(lines)

    if action == "find":
        sections = result.get("sections") or []
        if not sections:
            return f"No knowledge sections match '{result.get('query', 'your search')}'."
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
        return f"Created knowledge section '{section.get('id')}'."

    if action == "update":
        section = result.get("section") or {}
        return f"Updated knowledge section '{section.get('id')}'."

    if action == "delete":
        return f"Deleted knowledge section '{result.get('id')}'."

    return "Knowledge request completed."


def _resolve_action(action: str, payload: Dict[str, Any], store: AppGuideStore) -> str:
    if action in {"get", "search"}:
        return "find"
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


__all__ = ["run", "format_app_guide_response"]
