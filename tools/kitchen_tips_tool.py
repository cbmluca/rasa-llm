"""Tier-3 kitchen tips tool for quick lookups from editable knowledge."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.json_storage import atomic_write_json, read_json
from core.tooling.query_helpers import best_effort_keywords, keyword_score, rank_entries, tokenize_keywords

_DEFAULT_STORAGE_PATH = Path("data_pipeline/kitchen_tips.json")


@dataclass
class KitchenTip:
    """Represent a single kitchen tip entry."""

    id: str
    title: str
    content: str
    keywords: List[str]
    link: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        data = {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "keywords": list(self.keywords),
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

    def search(self, keywords: str) -> List[Dict[str, Any]]:
        tokens = tokenize_keywords(keywords)
        if not tokens:
            return []
        entries = [entry.to_dict() for entry in self._load_entries()]
        for entry in entries:
            entry['_search_fields'] = ['title', 'content', 'keywords']
        ranked = rank_entries(entries, tokens, key=lambda tip: tip['title'].lower())
        filtered: List[Dict[str, Any]] = []
        for entry in ranked:
            fields = entry.get('_search_fields', [])
            if tokens:
                score = keyword_score(entry, tokens, fields)
                if score <= 0:
                    continue
            entry.pop('_search_fields', None)
            filtered.append(entry)
        return filtered

    def create_tip(
        self,
        title: str,
        content: Optional[str],
        keywords: List[str],
        link: Optional[str],
        *,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        entries = self._load_entries()
        tip = KitchenTip(
            id="pending" if dry_run else uuid.uuid4().hex,
            title=title,
            content=content or title,
            keywords=keywords,
            link=link,
        )
        if not dry_run:
            entries.append(tip)
            self._write_entries(entries)
        return tip.to_dict()

    def update_tip(
        self,
        *,
        tip_id: Optional[str],
        title_lookup: Optional[str],
        new_title: Optional[str] = None,
        content: Optional[str] = None,
        keywords: Optional[List[str]] = None,
        link: Any = None,
        link_provided: bool = False,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        entries = self._load_entries()
        title_norm = title_lookup.strip().lower() if title_lookup else None
        match: Optional[KitchenTip] = None
        match_index: Optional[int] = None
        for entry in entries:
            if tip_id and entry.id == tip_id:
                match = entry
                match_index = entries.index(entry)
                break
            if title_norm and entry.title.strip().lower() == title_norm:
                match = entry
                match_index = entries.index(entry)
                break
        if not match:
            raise ValueError("not_found")
        if new_title:
            match.title = new_title
        if content is not None:
            match.content = content
        if keywords is not None:
            match.keywords = keywords
        if link_provided:
            match.link = link or None
        if not dry_run and match_index is not None:
            entries[match_index] = match
            self._write_entries(entries)
        return match.to_dict()

    def delete_tip(self, *, tip_id: Optional[str], title_lookup: Optional[str], dry_run: bool = False) -> bool:
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
        if not dry_run:
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
            keywords_raw = item.get("keywords")
            if keywords_raw is None:
                keywords_raw = item.get("tags")
            keywords = [str(tag).strip() for tag in (keywords_raw or []) if isinstance(tag, str) and tag.strip()]
            content_value = str(item.get("content", "")).strip()
            if not content_value:
                content_value = str(item.get("body", "")).strip()
            entries.append(
                KitchenTip(
                    id=tip_id,
                    title=str(item.get("title", "")).strip(),
                    content=content_value,
                    keywords=keywords,
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


def run(payload: Dict[str, Any], *, dry_run: bool = False) -> Dict[str, Any]:
    """Handle kitchen tip lookup commands."""

    action = str(payload.get("action", "list")).strip().lower() or "list"
    if action in {"search", "get"}:
        action = "find"
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

    if action == "find":
        tip_id = str(payload.get("id") or payload.get("tip_id") or "").strip()
        title_lookup = _coerce_lookup_title(payload)
        if tip_id or title_lookup:
            tip = store.find_by_id(tip_id) if tip_id else None
            if not tip and title_lookup:
                tip = store.find_by_title(title_lookup)
            if not tip:
                missing = tip_id or title_lookup
                return _error_response("find", "not_found", f"Tip '{missing}' was not found.")
            return {
                "type": "kitchen_tips",
                "domain": "kitchen",
                "action": "find",
                "tips": [tip],
                "count": 1,
                "query": tip_id or title_lookup,
                "exact_match": True,
            }
        search_term = best_effort_keywords(payload, keys=("keywords",))
        if not search_term.strip():
            return _error_response("find", "missing_keywords", "Provide keywords or a tip id/title to search your tips.")
        tips = store.search(search_term)
        return {
            "type": "kitchen_tips",
            "domain": "kitchen",
            "action": "find",
            "tips": tips,
            "query": search_term,
            "count": len(tips),
            "exact_match": False,
        }

    if action == "create":
        title = str(payload.get("title", "")).strip()
        if not title:
            return _error_response("create", "missing_title", "A title is required to add a kitchen tip.")
        content = str(payload.get("content") or payload.get("body") or "").strip() or None
        keywords = _normalize_keywords(payload.get("keywords"))
        link = _coerce_link(payload.get("link"))
        tip = store.create_tip(title=title, content=content, keywords=keywords, link=link, dry_run=dry_run)
        return {"type": "kitchen_tips", "domain": "kitchen", "action": "create", "tip": tip}

    if action == "update":
        tip_id = str(payload.get("id") or payload.get("tip_id") or "").strip()
        lookup_title = _coerce_lookup_title(payload)
        if not tip_id and not lookup_title:
            return _error_response("update", "missing_id", "Provide a tip id or title to update.")
        new_title = str(payload.get("title") or payload.get("new_title") or "").strip() or None
        content_value = payload.get("content")
        if content_value is None and "body" in payload:
            content_value = payload.get("body")
        content = str(content_value).strip() if isinstance(content_value, str) else content_value
        keywords = None
        if "keywords" in payload:
            keywords = _normalize_keywords(payload.get("keywords"))
        link_provided = "link" in payload
        link_value: Any = payload.get("link")
        link_str = _coerce_link(link_value) if link_provided else None
        try:
            updated = store.update_tip(
                tip_id=tip_id or None,
                title_lookup=lookup_title or None,
                new_title=new_title,
                content=content,
                keywords=keywords,
                link=link_str,
                link_provided=link_provided,
                dry_run=dry_run,
            )
        except ValueError as exc:
            if str(exc) == "not_found":
                return _error_response("update", "not_found", "The requested tip was not found.")
            raise
        return {"type": "kitchen_tips", "domain": "kitchen", "action": "update", "tip": updated}

    if action == "delete":
        tip_id = str(payload.get("id") or payload.get("tip_id") or "").strip()
        lookup_title = _coerce_lookup_title(payload)
        if not tip_id and not lookup_title:
            return _error_response("delete", "missing_id", "Provide a tip id or title to delete.")
        deleted = store.delete_tip(tip_id=tip_id or None, title_lookup=lookup_title or None, dry_run=dry_run)
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

    if action == "find":
        tips = result.get("tips") or []
        query = result.get("query")
        if not tips:
            return _with_raw_output(f"No kitchen tips found for '{query or 'your search'}'.", result)
        if result.get("exact_match"):
            tip = tips[0]
            message = f"{tip.get('title', 'Tip')}:\n{tip.get('content', 'No details provided.')}"
            return _with_raw_output(message, result)
        lines = [f"- {tip.get('title', 'Untitled')} (#{tip.get('id')})" for tip in tips]
        return _with_raw_output(f"Matches for '{query}':\n" + "\n".join(lines), result)

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


def _coerce_lookup_title(payload: Dict[str, Any]) -> Optional[str]:
    for key in ("lookup_title", "title_lookup", "target_title"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    title_value = payload.get("title")
    if isinstance(title_value, str) and title_value.strip():
        return title_value.strip()
    return None


def _normalize_keywords(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value).strip()
    if not text:
        return []
    if "," in text:
        return [part.strip() for part in text.split(",") if part.strip()]
    return [text]


def _coerce_link(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


__all__ = ["run", "format_kitchen_tips_response", "KitchenTipsStore", "KitchenTip"]
