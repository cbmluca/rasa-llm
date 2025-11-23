"""Tier-3 todo list tool providing CRUD operations with JSON persistence."""

from __future__ import annotations

import re
import uuid
from dataclasses import asdict, dataclass, replace
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.json_storage import atomic_write_json, read_json
from core.text_parsing import (
    extract_notes_from_text,
    extract_title_from_text,
    parse_date_hint,
)

_DEFAULT_STORAGE_PATH = Path("data_pipeline/todos.json")
_STATUS_MAP = {
    "pending": "pending",
    "todo": "pending",
    "open": "pending",
    "incomplete": "pending",
    "in-progress": "pending",
    "in_progress": "pending",
    "completed": "completed",
    "complete": "completed",
    "done": "completed",
    "finished": "completed",
}
_ACTION_ALIASES = {
    "": "list",
    "list": "list",
    "show": "list",
    "display": "list",
    "find": "find",
    "search": "find",
    "lookup": "find",
    "create": "create",
    "add": "create",
    "new": "create",
    "make": "create",
    "remember": "create",
    "update": "update",
    "edit": "update",
    "modify": "update",
    "delete": "delete",
    "remove": "delete",
    "del": "delete",
}
_DEADLINE_KEYS = ("deadline", "due", "date", "reminder")
_DANISH_MONTHS = {
    "januar": 1,
    "februar": 2,
    "marts": 3,
    "april": 4,
    "maj": 5,
    "juni": 6,
    "juli": 7,
    "august": 8,
    "september": 9,
    "oktober": 10,
    "november": 11,
    "december": 12,
}
_DATE_PATTERN = re.compile(r"\d{1,2}[./-]\d{1,2}[./-]\d{2,4}")
_DATE_TEXT_PATTERN = re.compile(r"\d{1,2}\s*[A-Za-zÆØÅæøå]+\s+\d{2,4}", re.IGNORECASE)
_TITLE_PREFIX_PATTERNS = [
    re.compile(r"^(?:please\s+)?add\s+(?:a\s+)?todo\s+(?:reminding\s+me\s+to\s+)?", re.IGNORECASE),
    re.compile(r"^(?:please\s+)?create\s+(?:a\s+)?todo\s+(?:reminding\s+me\s+to\s+)?", re.IGNORECASE),
    re.compile(r"^(?:please\s+)?add\s+(?:a\s+)?task\s+", re.IGNORECASE),
    re.compile(r"^(?:please\s+)?create\s+(?:a\s+)?task\s+", re.IGNORECASE),
    re.compile(r"^remind\s+me\s+to\s+", re.IGNORECASE),
    re.compile(r"^reminding\s+me\s+to\s+", re.IGNORECASE),
    re.compile(r"^remember\s+to\s+", re.IGNORECASE),
    re.compile(r"^remember\s+", re.IGNORECASE),
    re.compile(r"^todo\s*[:=-]?\s*", re.IGNORECASE),
    re.compile(r"^task\s*[:=-]?\s*", re.IGNORECASE),
    re.compile(r"^add\s+a?\s+todo\s+from\s+this\s+form\s*[:,-]?\s*", re.IGNORECASE),
    re.compile(r"^from\s+this\s+form\s*[:,-]?\s*", re.IGNORECASE),
    re.compile(r"^titled\s+", re.IGNORECASE),
]
_TITLE_KEYWORD_PATTERNS = [
    re.compile(r"\btitled?\s+([^.,;]+)", re.IGNORECASE),
    re.compile(r"\btitle\s+([^.,;]+)", re.IGNORECASE),
    re.compile(r"\bcalled\s+([^.,;]+)", re.IGNORECASE),
    re.compile(r"\bnamed\s+([^.,;]+)", re.IGNORECASE),
]
_ISO_DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")
_PRIORITY_MAP = {
    "urgent": "high",
    "high": "high",
    "high priority": "high",
    "critical": "high",
    "medium": "medium",
    "normal": "normal",
    "standard": "normal",
    "low": "low",
    "low priority": "low",
    "not urgent": "low",
}


@dataclass
class TodoItem:
    """Represent a single todo list entry."""

    id: str
    title: str
    status: str
    created_at: str
    updated_at: str
    notes: Optional[List[str]] = None
    deadline: Optional[str] = None
    priority: Optional[str] = None
    link: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        return _clean_dict(data)


class TodoStore:
    """File-backed storage wrapper for todo items."""

    def __init__(self, storage_path: Path | None = None) -> None:
        self._storage_path = storage_path or _DEFAULT_STORAGE_PATH

    def list_todos(self) -> List[Dict[str, Any]]:
        entries = self._load_items()
        entries.sort(key=_sort_key_for_entry)
        todos: List[Dict[str, Any]] = []
        for entry in entries:
            todo_dict = entry.to_dict()
            _augment_deadline_metadata(todo_dict)
            todos.append(todo_dict)
        return todos

    def find_todos(self, keywords: str) -> List[Dict[str, Any]]:
        tokens = _tokenize_keywords(keywords)
        if not tokens:
            return []
        entries = self._load_items()
        matches: List[Dict[str, Any]] = []
        for entry in entries:
            haystack_parts = [entry.title, entry.status, entry.priority or "", entry.id]
            if entry.notes:
                haystack_parts.extend(entry.notes)
            haystack = " ".join(part.lower() for part in haystack_parts if isinstance(part, str))
            if all(token in haystack for token in tokens):
                todo_dict = entry.to_dict()
                _augment_deadline_metadata(todo_dict)
                matches.append(todo_dict)
        matches.sort(key=_sort_key_for_entry_dict)
        return matches

    def create_todo(
        self,
        title: str,
        notes: Optional[List[str]],
        status: str,
        deadline: Optional[str],
        priority: Optional[str],
        link: Optional[str] = None,
        *,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        now = _utc_timestamp()
        entries = self._load_items()
        normalized_title = title.strip().lower()
        if any(entry.title.strip().lower() == normalized_title for entry in entries):
            raise ValueError("duplicate_title")
        item = TodoItem(
            id="pending" if dry_run else uuid.uuid4().hex,
            title=title,
            status=status,
            created_at=now,
            updated_at=now,
            notes=notes,
            deadline=deadline,
            priority=priority,
            link=link,
        )
        if not dry_run:
            entries.append(item)
            self._write_items(entries)
        return item.to_dict()

    def update_todo(
        self,
        todo_id: str,
        *,
        title: Optional[str] = None,
        status: Optional[str] = None,
        notes: Optional[List[str]] = None,
        clear_notes: bool = False,
        deadline: Optional[str] = None,
        clear_deadline: bool = False,
        priority: Optional[str] = None,
        link: Optional[str] = None,
        link_provided: bool = False,
        dry_run: bool = False,
    ) -> Optional[Dict[str, Any]]:
        entries = self._load_items()
        updated: Optional[TodoItem] = None
        updated_index: Optional[int] = None
        for idx, entry in enumerate(entries):
            if entry.id != todo_id:
                continue
            if clear_deadline:
                new_deadline = None
            elif deadline is not None:
                new_deadline = deadline
            else:
                new_deadline = entry.deadline
            new_notes = None
            if clear_notes:
                new_notes = None
            elif notes is not None:
                new_notes = notes
            else:
                new_notes = entry.notes
            new_priority = priority if priority is not None else entry.priority
            new_link = entry.link
            if link_provided:
                new_link = link

            new_entry = replace(
                entry,
                title=title if title is not None else entry.title,
                status=status if status is not None else entry.status,
                notes=new_notes,
                updated_at=_utc_timestamp(),
                deadline=new_deadline,
                priority=new_priority,
                link=new_link,
            )
            updated = new_entry
            updated_index = idx
            break

        if not updated:
            return None
        if not dry_run and updated_index is not None:
            entries[updated_index] = updated
            self._write_items(entries)
        return updated.to_dict()

    def delete_todo(self, todo_id: str, *, dry_run: bool = False) -> bool:
        entries = self._load_items()
        filtered = [entry for entry in entries if entry.id != todo_id]
        if len(filtered) == len(entries):
            return False
        if not dry_run:
            self._write_items(filtered)
        return True

    def get_entry(self, todo_id: str) -> Optional[TodoItem]:
        for entry in self._load_items():
            if entry.id == todo_id:
                return entry
        return None

    def find_entry_by_title(self, title: str) -> Optional[TodoItem]:
        title_norm = title.strip().lower()
        for entry in self._load_items():
            if entry.title.strip().lower() == title_norm:
                return entry
        return None

    def _load_items(self) -> List[TodoItem]:
        payload = read_json(self._storage_path, {"todos": []})
        raw_items = payload.get("todos", [])
        if not isinstance(raw_items, list):
            raise ValueError("Invalid todos format: 'todos' must be a list")

        entries: List[TodoItem] = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            todo_id = str(item.get("id", "")).strip()
            if not todo_id:
                continue
            entries.append(
                TodoItem(
                    id=todo_id,
                    title=str(item.get("title", "")).strip(),
                    status=_coerce_status(item.get("status")),
                    notes=_coerce_notes(item.get("notes")),
                    created_at=str(item.get("created_at", "")).strip() or _utc_timestamp(),
                    updated_at=str(item.get("updated_at", "")).strip() or _utc_timestamp(),
                    deadline=_normalize_deadline(str(item.get("deadline", "")).strip() or None),
                    priority=_coerce_priority(item.get("priority")),
                    link=_coerce_link(item.get("link")),
                )
            )
        return entries

    def _write_items(self, items: List[TodoItem]) -> None:
        payload = {"todos": [item.to_dict() for item in items]}
        atomic_write_json(self._storage_path, payload)


    # WHAT: perform list/find/create/update/delete operations on the todo store.
    # WHY: keeping all CRUD logic in one place prevents the UI/router/probes from duplicating behavior.
    # HOW: normalize the action + payload, validate required fields, call `TodoStore`, and honor dry_run for staged corrections.
def run(payload: Dict[str, Any], *, dry_run: bool = False) -> Dict[str, Any]:

    action = _normalize_action(payload.get("action"))
    store = TodoStore()

    if action == "list":
        todos = store.list_todos()
        return {
            "type": "todo_list",
            "domain": "todo",
            "action": "list",
            "todos": todos,
            "count": len(todos),
        }
    if action == "find":
        keywords = _extract_search_keywords(payload)
        if not keywords:
            return _error_response("find", "missing_keywords", "Please include at least one keyword in your search.")
        matches = store.find_todos(keywords)
        return {
            "type": "todo_list",
            "domain": "todo",
            "action": "find",
            "keywords": keywords,
            "todos": matches,
            "count": len(matches),
        }

    if action == "create":
        title = _extract_title(payload)
        if not title:
            return _error_response("create", "missing_title", "Todo title is required.")
        notes_input = payload.get("notes")
        if notes_input is None and payload.get("content") is not None:
            notes_input = payload.get("content")
        notes = _normalize_notes(notes_input) or _extract_notes_from_message(payload)
        try:
            status = _normalize_status(payload.get("status"))
        except ValueError as exc:
            return _error_response("create", "invalid_status", str(exc))

        try:
            deadline_value, _provided, _cleared = _extract_deadline_from_fields(payload)
        except ValueError as exc:
            return _error_response("create", "invalid_deadline", str(exc))
        message_deadline = _extract_deadline_from_message(payload) if not deadline_value else None
        deadline_iso = deadline_value or message_deadline
        if not deadline_iso:
            return _error_response("create", "missing_deadline", "Todo deadline is required.")
        priority = _extract_priority(payload)
        link = _coerce_link(payload.get("link"))

        try:
            todo = store.create_todo(
                title=title,
                notes=notes,
                status=status,
                deadline=deadline_iso,
                priority=priority,
                link=link,
                dry_run=dry_run,
            )
        except ValueError as exc:
            if str(exc) == "duplicate_title":
                return _error_response("create", "duplicate_title", f"Todo '{title}' already exists.")
            raise
        _augment_deadline_metadata(todo)
        return {"type": "todo_list", "domain": "todo", "action": "create", "todo": todo}

    if action == "update":
        todo_id = str(payload.get("id", "")).strip()
        lookup_title = _coerce_lookup_title(payload)
        if not todo_id and lookup_title:
            entry = store.find_entry_by_title(lookup_title)
            if not entry:
                return _error_response("update", "not_found", f"Todo '{lookup_title}' was not found.")
            todo_id = entry.id
        if not todo_id and isinstance(payload.get("message"), str):
            implicit_title = _extract_title_from_message(payload["message"])
            if implicit_title:
                entry = store.find_entry_by_title(implicit_title)
                if entry:
                    todo_id = entry.id
        if not todo_id:
            return _error_response("update", "missing_id", "Todo ID or title is required to update an item.")

        title_value = None
        if "new_title" in payload:
            title_value = str(payload.get("new_title") or "").strip()

        status_value: Optional[str]
        if "status" in payload:
            try:
                status_value = _normalize_status(payload.get("status"))
            except ValueError as exc:
                return _error_response("update", "invalid_status", str(exc))
        else:
            status_value = None

        notes_field_present = "notes" in payload or "content" in payload
        notes_source = None
        if "notes" in payload:
            notes_source = payload.get("notes")
        elif "content" in payload:
            notes_source = payload.get("content")
        if notes_field_present:
            notes_value = _normalize_notes(notes_source)
        else:
            notes_value = _extract_notes_from_message(payload)
            if notes_value:
                notes_field_present = True

        try:
            deadline_field_value, field_provided, deadline_cleared = _extract_deadline_from_fields(payload)
        except ValueError as exc:
            return _error_response("update", "invalid_deadline", str(exc))
        message_deadline = _extract_deadline_from_message(payload) if not field_provided else None
        deadline_value = deadline_field_value or message_deadline
        deadline_requested = field_provided or message_deadline is not None
        priority_value = _extract_priority(payload)
        link_provided = "link" in payload
        link_value = _coerce_link(payload.get("link"))

        if (
            title_value is None
            and status_value is None
            and not notes_field_present
            and not deadline_requested
            and priority_value is None
        ):
            return _error_response("update", "missing_updates", "Provide at least one field (title, status, notes, deadline, priority) to update.")

        updated = store.update_todo(
            todo_id,
            title=title_value,
            status=status_value,
            notes=notes_value,
            clear_notes=notes_field_present and notes_value is None,
            deadline=deadline_value,
            clear_deadline=deadline_cleared,
            priority=priority_value,
            link=link_value,
            link_provided=link_provided,
            dry_run=dry_run,
        )
        if not updated:
            return _error_response("update", "not_found", f"Todo '{todo_id}' was not found.")
        _augment_deadline_metadata(updated)
        return {"type": "todo_list", "domain": "todo", "action": "update", "todo": updated}

    if action == "delete":
        todo_id = str(payload.get("id", "")).strip()
        lookup_title = _coerce_lookup_title(payload)
        if not todo_id and lookup_title:
            entry = store.find_entry_by_title(lookup_title)
            if entry:
                todo_id = entry.id
        if not todo_id:
            return _error_response("delete", "missing_id", "Todo ID or title is required to delete an item.")
        removed = store.delete_todo(todo_id, dry_run=dry_run)
        if not removed:
            return _error_response("delete", "not_found", f"Todo '{todo_id}' was not found.")
        return {"type": "todo_list", "domain": "todo", "action": "delete", "deleted": True, "id": todo_id}

    return _error_response(action, "unsupported_action", f"Unsupported todo action '{action}'.")


    # WHAT: convert structured todo tool results into short user-facing text.
    # WHY: CLI/chat/routers reuse this summary instead of crafting their own strings.
    # HOW: switch on the action, mention counts/matches, and include relevant fields (deadline/status/priority) where applicable.
def format_todo_response(result: Dict[str, Any]) -> str:
    """Render a human-friendly summary for todo operations."""

    if "error" in result:
        return result.get("message", "Todo action failed.")

    action = result.get("action")
    if action == "list":
        todos = result.get("todos") or []
        if not todos:
            return "Your todo list is empty."
        lines = [_format_todo_line(item) for item in todos]
        return "Todos:\n" + "\n".join(lines)
    if action == "find":
        todos = result.get("todos") or []
        keywords = result.get("keywords")
        if not todos:
            return f"No todos matched '{keywords}'." if keywords else "No todos matched those keywords."
        tokens = _tokenize_keywords(keywords)
        if tokens:
            todos = sorted(
                todos,
                key=lambda item: (-_score_todo_match(item, tokens), _sort_key_for_entry_dict(item)),
            )
        lines = [_format_todo_line(item, include_done_tag=True) for item in todos]
        prefix = f"Found {len(todos)} todo(s)"
        if keywords:
            prefix += f" for '{keywords}'"
        return prefix + ":\n" + "\n".join(lines)

    if action == "create":
        todo = result.get("todo") or {}
        message = f"Added todo '{todo.get('title', 'Untitled')}'."
        if todo.get("deadline"):
            message += f" Due {todo['deadline']}."
        if todo.get("priority"):
            message += f" Marked as {todo['priority'].capitalize()} priority."
        return message

    if action == "update":
        todo = result.get("todo") or {}
        message = f"Updated todo '{todo.get('title', 'Untitled')}'."
        updates: List[str] = []
        if todo.get("deadline"):
            updates.append(f"deadline set to {todo['deadline']}")
        if todo.get("status") == "completed":
            updates.append("marked as completed")
        priority_label = _format_priority_label(todo.get("priority"))
        if priority_label:
            updates.append(f"priority {priority_label.lower()}")
        if updates:
            message += " " + ", ".join(updates).capitalize() + "."
        return message

    if action == "delete":
        if result.get("deleted"):
            return f"Deleted todo '{result.get('id')}'."
        return result.get("message", "Todo delete failed.")

    return result.get("message", "Todo action completed.")


def _normalize_status(raw_status: Any) -> str:
    if raw_status is None:
        return "pending"
    value = str(raw_status).strip().lower()
    if not value:
        return "pending"
    normalized = _STATUS_MAP.get(value)
    if not normalized:
        raise ValueError(f"Unsupported status '{raw_status}'. Use 'pending' or 'completed'.")
    return normalized


def _coerce_status(raw_status: Any) -> str:
    try:
        return _normalize_status(raw_status)
    except ValueError:
        return "pending"


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _error_response(action: str, code: str, message: str) -> Dict[str, Any]:
    return {
        "type": "todo_list",
        "domain": "todo",
        "action": action,
        "error": code,
        "message": message,
    }


def _normalize_action(raw_action: Any) -> str:
    value = str(raw_action or "").strip().lower()
    if not value:
        return "list"
    return _ACTION_ALIASES.get(value, value)


def _extract_title(payload: Dict[str, Any]) -> str:
    candidates = ("title", "todo", "item", "text")
    for key in candidates:
        if key not in payload:
            continue
        value = payload.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text

    message = payload.get("message")
    if isinstance(message, str):
        inferred = _extract_title_from_message(message)
        if inferred:
            return inferred
    return ""


def _sanitize_title_candidate(text: str) -> str:
    cleaned = _strip_known_prefixes(text)
    cleaned = _strip_trailing_modifiers(cleaned)
    return cleaned


def _extract_deadline_from_fields(payload: Dict[str, Any]) -> Tuple[Optional[str], bool, bool]:
    for key in _DEADLINE_KEYS:
        if key not in payload:
            continue
        raw_value = payload.get(key)
        provided = True
        if raw_value is None:
            return None, provided, True
        text = _normalize_deadline_text(str(raw_value))
        if not text:
            return None, provided, True
        parsed = parse_date_hint(text)
        if not parsed:
            raise ValueError(f"Could not parse deadline '{text}'. Use Danish date formats like 1/7/2026.")
        return parsed.isoformat(), provided, False
    return None, False, False


def _extract_deadline_from_message(payload: Dict[str, Any]) -> Optional[str]:
    message = payload.get("message")
    if not isinstance(message, str):
        return None
    iso_match = _ISO_DATE_PATTERN.search(message)
    if iso_match:
        parsed = parse_date_hint(_normalize_deadline_text(iso_match.group(0)))
        if parsed:
            return parsed.isoformat()
    for pattern in (_DATE_PATTERN, _DATE_TEXT_PATTERN):
        for match in pattern.finditer(message):
            parsed = parse_date_hint(_normalize_deadline_text(match.group(0)))
            if parsed:
                return parsed.isoformat()
    for token in re.split(r"\s+", message):
        parsed = parse_date_hint(_normalize_deadline_text(token))
        if parsed:
            return parsed.isoformat()
    return None


def _extract_notes_from_message(payload: Dict[str, Any]) -> Optional[List[str]]:
    message = payload.get("message")
    if not isinstance(message, str):
        return None
    notes = extract_notes_from_text(message)
    return notes or None


def _coerce_lookup_title(payload: Dict[str, Any]) -> Optional[str]:
    for key in ("lookup_title", "title_lookup", "target_title"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    title_value = payload.get("title")
    if isinstance(title_value, str) and title_value.strip():
        return title_value.strip()
    return None


def _extract_search_keywords(payload: Dict[str, Any]) -> str:
    if "keywords" in payload:
        value = payload.get("keywords")
        if isinstance(value, list):
            return ", ".join(str(item).strip() for item in value if str(item).strip())
        return str(value).strip() if value is not None else ""
    message = payload.get("message")
    if isinstance(message, str):
        return message.strip()
    return ""


def _extract_title_from_message(message: str) -> Optional[str]:
    if not message:
        return None
    text = message.strip()
    if not text:
        return None

    quoted = extract_title_from_text(text)
    if quoted:
        candidate = _sanitize_title_candidate(quoted)
        if candidate:
            return candidate

    for pattern in _TITLE_KEYWORD_PATTERNS:
        match = pattern.search(text)
        if match:
            candidate = _sanitize_title_candidate(match.group(1).strip())
            if candidate:
                return candidate

    if ":" in text:
        before, after = text.split(":", 1)
        if any(token in before.lower() for token in ("todo", "task", "form", "item")):
            candidate = _sanitize_title_candidate(after.strip())
            if candidate:
                return candidate

    cleaned = _sanitize_title_candidate(text)
    return cleaned or None


def _strip_known_prefixes(text: str) -> str:
    cleaned = text.strip()
    if not cleaned:
        return ""
    changed = True
    while changed:
        changed = False
        for pattern in _TITLE_PREFIX_PATTERNS:
            new_value = pattern.sub("", cleaned, count=1).strip()
            if new_value != cleaned:
                cleaned = new_value
                changed = True
    return cleaned


_DEADLINE_HINT_PATTERN = re.compile(
    r"\b(today|tonight|tomorrow|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|"
    r"monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|på|i)\b|\d",
    re.IGNORECASE,
)

_TRAILING_PRIORITY_PATTERNS = [
    re.compile(r",?\s*(?:and\s+)?mark\s+it\s+as\s+.+$", re.IGNORECASE),
    re.compile(r",?\s*(?:and\s+)?mark\s+as\s+.+$", re.IGNORECASE),
    re.compile(r",?\s*(?:and\s+)?make\s+it\s+.+$", re.IGNORECASE),
    re.compile(r",?\s*(?:and\s+)?set\s+it\s+.+$", re.IGNORECASE),
]


def _strip_trailing_modifiers(text: str) -> str:
    cleaned = text.strip(" \t\n\r\"'()")
    if not cleaned:
        return ""

    match = re.search(r",?\s*(?:and\s+)?(due|deadline|by)\s+(.+)$", cleaned, re.IGNORECASE)
    if match and _DEADLINE_HINT_PATTERN.search(match.group(2)):
        cleaned = cleaned[: match.start()].rstrip(" ,.;:-")

    for pattern in _TRAILING_PRIORITY_PATTERNS:
        m = pattern.search(cleaned)
        if m:
            cleaned = cleaned[: m.start()].rstrip(" ,.;:-")

    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.;:-")
    return cleaned


def _extract_priority(payload: Dict[str, Any]) -> Optional[str]:
    if "priority" in payload:
        normalized = _normalize_priority(payload.get("priority"))
        if normalized:
            return normalized
    message = payload.get("message")
    if isinstance(message, str):
        return _priority_from_message(message)
    return None


def _priority_from_message(message: str) -> Optional[str]:
    lowered = message.lower()
    for keyword, normalized in _PRIORITY_MAP.items():
        if " " in keyword:
            if keyword in lowered:
                return normalized
        else:
            if re.search(rf"\b{re.escape(keyword)}\b", lowered):
                return normalized
    return None


def _normalize_priority(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text:
        return None
    return _PRIORITY_MAP.get(text) or _priority_from_message(text)


def _coerce_priority(value: Any) -> Optional[str]:
    return _normalize_priority(value)


def _coerce_link(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _format_priority_label(priority: Optional[str]) -> Optional[str]:
    if not priority:
        return None
    label_map = {
        "high": "High",
        "medium": "Medium",
        "normal": "Normal",
        "low": "Low",
    }
    return label_map.get(priority)


def _normalize_notes(value: Any) -> Optional[List[str]]:
    if value is None:
        return None
    if isinstance(value, list):
        items = [str(item).strip() for item in value if str(item).strip()]
        return items or None
    text = str(value).strip()
    if not text:
        return None
    return [text]


def _coerce_notes(value: Any) -> Optional[List[str]]:
    result = _normalize_notes(value)
    return result


def _clean_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    cleaned: Dict[str, Any] = {}
    for key, value in data.items():
        if value is None:
            continue
        if isinstance(value, (list, dict)) and not value:
            continue
        cleaned[key] = value
    return cleaned


def _normalize_deadline(deadline: Optional[str]) -> Optional[str]:
    if not deadline:
        return None
    parsed = parse_date_hint(deadline)
    return parsed.isoformat() if parsed else None


def _deadline_to_date(deadline: Optional[str]) -> Optional[date]:
    if not deadline:
        return None
    try:
        return date.fromisoformat(deadline)
    except ValueError:
        return None


def _days_until_deadline(deadline: Optional[str]) -> Optional[int]:
    deadline_date = _deadline_to_date(deadline)
    if not deadline_date:
        return None
    return (deadline_date - date.today()).days


def _augment_deadline_metadata(todo: Dict[str, Any]) -> None:
    deadline = todo.get("deadline")
    days_until = _days_until_deadline(deadline)
    if days_until is not None:
        todo["deadline_days_until"] = days_until


def _sort_key_for_entry(entry: TodoItem) -> Tuple[int, date, str]:
    deadline_date = _deadline_to_date(entry.deadline) or date.max
    has_deadline = 0 if entry.deadline else 1
    return (has_deadline, deadline_date, entry.title.lower())


def _sort_key_for_entry_dict(entry: Dict[str, Any]) -> Tuple[int, date, str]:
    deadline_value = entry.get("deadline")
    deadline_date = _deadline_to_date(deadline_value) or date.max
    has_deadline = 0 if deadline_value else 1
    title = str(entry.get("title") or "").lower()
    return (has_deadline, deadline_date, title or entry.get("id", ""))


def _tokenize_keywords(text: str) -> List[str]:
    tokens = [token.strip().lower() for token in re.split(r"[\\s,]+", text or "") if token.strip()]
    return tokens


def _normalize_deadline_text(text: str) -> str:
    return str(text or "").strip().strip(".,;")


def _format_todo_line(todo: Dict[str, Any], *, include_done_tag: bool = False) -> str:
    status_box = "x" if todo.get("status") == "completed" else " "
    priority_label = _format_priority_label(todo.get("priority"))
    line = f"- [{status_box}] {todo.get('title', 'Untitled')}"
    if priority_label:
        line += f" [{priority_label}]"
    if include_done_tag and todo.get("status") == "completed":
        line += " [done]"
    deadline = todo.get("deadline")
    if deadline:
        days = todo.get("deadline_days_until")
        if days is not None:
            countdown = f"{days} days" if days != 1 else "1 day"
            line += f" — due {deadline} ({countdown})"
        else:
            line += f" — due {deadline}"
    return line


def _score_todo_match(todo: Dict[str, Any], tokens: List[str]) -> int:
    if not tokens:
        return 0
    haystack_parts = [todo.get("title", ""), todo.get("status", ""), todo.get("priority", "")]
    notes = todo.get("notes")
    if isinstance(notes, list):
        haystack_parts.extend(notes)
    haystack = " ".join(str(part).lower() for part in haystack_parts if part)
    return sum(1 for token in tokens if token in haystack)


__all__ = ["run", "format_todo_response", "TodoStore", "TodoItem"]
