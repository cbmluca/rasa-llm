"""Tier-3 kitchen tips tool for quick lookups from editable knowledge."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.json_storage import atomic_write_json, read_json

_DEFAULT_STORAGE_PATH = Path("data_pipeline/kitchen_tips.json")


@dataclass
class KitchenTip:
    """Represent a single kitchen tip entry."""

    id: str
    title: str
    body: str
    tags: List[str]
    link: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        data = {
            "id": self.id,
            "title": self.title,
            "body": self.body,
            "tags": list(self.tags),
        }
        if self.link:
            data["link"] = self.link
        return data


class KitchenTipsStore:
    """Read-only store for kitchen tips until Tier-4 editing workflows land."""

    def __init__(self, storage_path: Path | None = None) -> None:
        self._storage_path = storage_path or _DEFAULT_STORAGE_PATH

    def list_tips(self) -> List[Dict[str, Any]]:
        entries = self._load_entries()
        entries.sort(key=lambda tip: tip.title.lower())
        return [entry.to_dict() for entry in entries]

    def search(self, query: str) -> List[Dict[str, Any]]:
        if not query:
            return []
        term = query.lower()
        matches = [
            tip.to_dict()
            for tip in self._load_entries()
            if term in tip.title.lower() or term in tip.body.lower() or any(term in tag.lower() for tag in tip.tags)
        ]
        matches.sort(key=lambda tip: tip["title"].lower())
        return matches

    def create_tip(self, title: str, body: Optional[str], tags: List[str], link: Optional[str]) -> Dict[str, Any]:
        entries = self._load_entries()
        tip = KitchenTip(
            id=uuid.uuid4().hex,
            title=title,
            body=body or title,
            tags=tags,
            link=link,
        )
        entries.append(tip)
        self._write_entries(entries)
        return tip.to_dict()

    def update_tip(
        self,
        *,
        tip_id: Optional[str],
        title_lookup: Optional[str],
        new_title: Optional[str] = None,
        body: Optional[str] = None,
        tags: Optional[List[str]] = None,
        link: Any = None,
        link_provided: bool = False,
    ) -> Dict[str, Any]:
        entries = self._load_entries()
        title_norm = title_lookup.strip().lower() if title_lookup else None
        match: Optional[KitchenTip] = None
        for entry in entries:
            if tip_id and entry.id == tip_id:
                match = entry
                break
            if title_norm and entry.title.strip().lower() == title_norm:
                match = entry
                break
        if not match:
            raise ValueError("not_found")
        if new_title:
            match.title = new_title
        if body is not None:
            match.body = body
        if tags is not None:
            match.tags = tags
        if link_provided:
            match.link = link or None
        self._write_entries(entries)
        return match.to_dict()

    def delete_tip(self, *, tip_id: Optional[str], title_lookup: Optional[str]) -> bool:
        entries = self._load_entries()
        title_norm = title_lookup.strip().lower() if title_lookup else None
        remaining: List[KitchenTip] = []
        deleted = False
        for entry in entries:
            if not deleted and (
                (tip_id and entry.id == tip_id)
                or (title_norm and entry.title.strip().lower() == title_norm)
            ):
                deleted = True
                continue
            remaining.append(entry)
        if not deleted:
            return False
        self._write_entries(remaining)
        return True

    def _load_entries(self) -> List[KitchenTip]:
        payload = read_json(self._storage_path, {"tips": []})
        raw = payload.get("tips", [])
        if not isinstance(raw, list):
            raise ValueError("Invalid kitchen tips format: 'tips' must be a list")

        entries: List[KitchenTip] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            tip_id = str(item.get("id", "")).strip()
            if not tip_id:
                continue
            tags_raw = item.get("tags") or []
            tags = [str(tag).strip() for tag in tags_raw if isinstance(tag, str) and tag.strip()]
            entries.append(
                KitchenTip(
                    id=tip_id,
                    title=str(item.get("title", "")).strip(),
                    body=str(item.get("body", "")).strip(),
                    tags=tags,
                    link=str(item.get("link", "")).strip() or None,
                )
            )
        return entries

    def _write_entries(self, entries: List[KitchenTip]) -> None:
        payload = {"tips": [entry.to_dict() for entry in entries]}
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_json(self._storage_path, payload)

    def find_by_id(self, tip_id: str) -> Optional[Dict[str, Any]]:
        for entry in self._load_entries():
            if entry.id == tip_id:
                return entry.to_dict()
        return None

    def find_by_title(self, title: str) -> Optional[Dict[str, Any]]:
        title_norm = title.strip().lower()
        for entry in self._load_entries():
            if entry.title.strip().lower() == title_norm:
                return entry.to_dict()
        return None


def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle kitchen tip lookup commands."""

    action = str(payload.get("action", "list")).strip().lower() or "list"
    store = KitchenTipsStore()

    if action == "list":
        tips = store.list_tips()
        return {
            "type": "kitchen_tips",
            "domain": "kitchen",
            "action": "list",
            "tips": tips,
            "count": len(tips),
        }

    if action == "create":
        title = str(payload.get("title", "")).strip()
        if not title:
            return _error_response("create", "missing_title", "A title is required to add a kitchen tip.")
        body = str(payload.get("body", "")).strip() or None
        tags = payload.get("tags") or []
        if not isinstance(tags, list):
            tags = []
        tags_clean = [str(tag).strip() for tag in tags if str(tag).strip()]
        link = payload.get("link")
        if link:
            link = str(link).strip()
        tip = store.create_tip(title=title, body=body, tags=tags_clean, link=link or None)
        return {"type": "kitchen_tips", "domain": "kitchen", "action": "create", "tip": tip}

    if action == "get":
        tip_id = str(payload.get("id") or payload.get("tip_id") or "").strip()
        title_lookup = payload.get("title")
        if not tip_id and not title_lookup:
            return _error_response("get", "missing_id", "A tip ID or title is required to fetch details.")
        tip = store.find_by_id(tip_id) if tip_id else None
        if not tip and title_lookup:
            tip = store.find_by_title(str(title_lookup))
        if not tip:
            missing = tip_id or str(title_lookup or "tip")
            return _error_response("get", "not_found", f"Tip '{missing}' was not found.")
        return {"type": "kitchen_tips", "domain": "kitchen", "action": "get", "tip": tip}

    if action == "search":
        query = str(payload.get("query", "")).strip()
        if not query:
            return _error_response("search", "missing_query", "Provide a search phrase to filter tips.")
        tips = store.search(query)
        return {
            "type": "kitchen_tips",
            "domain": "kitchen",
            "action": "search",
            "query": query,
            "tips": tips,
            "count": len(tips),
        }

    if action == "update":
        tip_id = str(payload.get("id") or payload.get("tip_id") or "").strip()
        target_title = str(payload.get("target_title") or "").strip()
        if not tip_id and not target_title:
            return _error_response("update", "missing_id", "Provide a tip id or title to update.")
        new_title = str(payload.get("title") or payload.get("new_title") or "").strip() or None
        body_value = payload.get("body")
        body = str(body_value).strip() if isinstance(body_value, str) else body_value
        tags = payload.get("tags") if "tags" in payload else None
        if tags is not None:
            if not isinstance(tags, list):
                return _error_response("update", "invalid_tags", "Tags must be provided as a list.")
            tags = [str(tag).strip() for tag in tags if str(tag).strip()]
        link_provided = "link" in payload
        link_value: Any = payload.get("link")
        link_str = str(link_value).strip() if isinstance(link_value, str) else link_value
        try:
            updated = store.update_tip(
                tip_id=tip_id or None,
                title_lookup=target_title or None,
                new_title=new_title,
                body=body,
                tags=tags,
                link=link_str,
                link_provided=link_provided,
            )
        except ValueError as exc:
            if str(exc) == "not_found":
                return _error_response("update", "not_found", "The requested tip was not found.")
            raise
        return {"type": "kitchen_tips", "domain": "kitchen", "action": "update", "tip": updated}

    if action == "delete":
        tip_id = str(payload.get("id") or payload.get("tip_id") or "").strip()
        target_title = str(payload.get("target_title") or payload.get("title") or "").strip()
        if not tip_id and not target_title:
            return _error_response("delete", "missing_id", "Provide a tip id or title to delete.")
        deleted = store.delete_tip(tip_id=tip_id or None, title_lookup=target_title or None)
        if not deleted:
            return _error_response("delete", "not_found", "The requested tip was not found.")
        return {"type": "kitchen_tips", "domain": "kitchen", "action": "delete", "deleted": True}

    return _error_response(action, "unsupported_action", f"Unsupported kitchen tips action '{action}'.")


def format_kitchen_tips_response(result: Dict[str, Any]) -> str:
    """Render a friendly description of the kitchen tip lookup."""

    if "error" in result:
        return _with_raw_output(result.get("message", "Kitchen tips request failed."), result, include_raw=False)

    action = result.get("action")
    if action == "list":
        tips = result.get("tips") or []
        if not tips:
            return _with_raw_output("No kitchen tips are available yet.", result)
        lines = [f"- {tip.get('title', 'Untitled')} (#{tip.get('id')})" for tip in tips]
        return _with_raw_output("Kitchen tips:\n" + "\n".join(lines), result)

    if action == "get":
        tip = result.get("tip") or {}
        message = f"{tip.get('title', 'Tip')}:\n{tip.get('body', 'No details provided.')}"
        return _with_raw_output(message, result)

    if action == "search":
        tips = result.get("tips") or []
        if not tips:
            return _with_raw_output(f"No kitchen tips found for '{result.get('query')}'.", result)
        lines = [f"- {tip.get('title', 'Untitled')} (#{tip.get('id')})" for tip in tips]
        return _with_raw_output(f"Matches for '{result.get('query')}':\n" + "\n".join(lines), result)

    if action == "update":
        tip = result.get("tip") or {}
        message = f"Updated kitchen tip '{tip.get('title', 'Tip')}'."
        return _with_raw_output(message, result)

    if action == "delete":
        if result.get("deleted"):
            return _with_raw_output("Kitchen tip deleted.", result)
        return _with_raw_output("Kitchen tip delete failed.", result)

    return _with_raw_output("Kitchen tips request completed.", result)


def _error_response(action: str, code: str, message: str) -> Dict[str, Any]:
    return {"type": "kitchen_tips", "domain": "kitchen", "action": action, "error": code, "message": message}


def _with_raw_output(message: str, payload: Dict[str, Any], include_raw: bool = False) -> str:
    if not include_raw:
        return message
    return f"{message}\nRaw:\n{json.dumps(payload, indent=2, ensure_ascii=False)}"


__all__ = ["run", "format_kitchen_tips_response", "KitchenTipsStore", "KitchenTip"]
