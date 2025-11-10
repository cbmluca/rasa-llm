"""Tool wrapper around the App Guide knowledge base."""

from __future__ import annotations

from typing import Any, Dict

from knowledge.app_guide import AppGuideStore, _DEFAULT_STORAGE_PATH as _STORE_DEFAULT_PATH

_DEFAULT_STORAGE_PATH = _STORE_DEFAULT_PATH


def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle knowledge base commands (list/get/upsert/delete)."""

    action = str(payload.get("action", "list")).strip().lower() or "list"
    store = AppGuideStore(storage_path=_DEFAULT_STORAGE_PATH)

    if action == "list":
        sections = store.list_sections()
        return {
            "type": "app_guide",
            "domain": "knowledge",
            "action": "list",
            "sections": sections,
            "count": len(sections),
        }

    if action == "get":
        section_id = str(payload.get("section_id") or payload.get("id") or "").strip()
        if not section_id:
            return _error("get", "missing_id", "Section ID is required to fetch a knowledge entry.")
        section = store.get_section(section_id)
        if not section:
            return _error("get", "not_found", f"Section '{section_id}' was not found.")
        return {
            "type": "app_guide",
            "domain": "knowledge",
            "action": "get",
            "section": section,
        }

    if action in {"upsert", "update", "create"}:
        section_id = str(payload.get("section_id") or payload.get("id") or "").strip()
        title = str(payload.get("title") or "").strip()
        content = str(payload.get("content") or "").strip()
        if not section_id:
            return _error("upsert", "missing_id", "Provide a section_id to update or create an entry.")
        if not title:
            return _error("upsert", "missing_title", "Knowledge entries require a title.")
        entry = store.upsert_section(section_id, title, content)
        return {
            "type": "app_guide",
            "domain": "knowledge",
            "action": "upsert",
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

    if action == "get":
        section = result.get("section") or {}
        return f"Section '{section.get('section_id')}' — {section.get('title')}" \
            f"\n{section.get('content', '').strip()}"

    if action == "upsert":
        section = result.get("section") or {}
        return f"Saved knowledge section '{section.get('section_id')}'."

    if action == "delete":
        return f"Deleted knowledge section '{result.get('section_id')}'."

    return "Knowledge request completed."


def _error(action: str, code: str, message: str) -> Dict[str, Any]:
    return {
        "type": "app_guide",
        "domain": "knowledge",
        "action": action,
        "error": code,
        "message": message,
    }


__all__ = ["run", "format_app_guide_response"]
