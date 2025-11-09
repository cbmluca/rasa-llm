"""Tier-3 todo list tool providing CRUD operations with JSON persistence."""

from __future__ import annotations

import json
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

    def create_todo(self, title: str, notes: Optional[List[str]], status: str, deadline: Optional[str]) -> Dict[str, Any]:
        now = _utc_timestamp()
        entries = self._load_items()
        normalized_title = title.strip().lower()
        if any(entry.title.strip().lower() == normalized_title for entry in entries):
            raise ValueError("duplicate_title")
        item = TodoItem(
            id=uuid.uuid4().hex,
            title=title,
            status=status,
            created_at=now,
            updated_at=now,
            notes=notes,
            deadline=deadline,
        )
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
    ) -> Optional[Dict[str, Any]]:
        entries = self._load_items()
        updated: Optional[TodoItem] = None
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
            new_entry = replace(
                entry,
                title=title if title is not None else entry.title,
                status=status if status is not None else entry.status,
                notes=new_notes,
                updated_at=_utc_timestamp(),
                deadline=new_deadline,
            )
            entries[idx] = new_entry
            updated = new_entry
            break

        if not updated:
            return None

        self._write_items(entries)
        return updated.to_dict()

    def delete_todo(self, todo_id: str) -> bool:
        entries = self._load_items()
        filtered = [entry for entry in entries if entry.id != todo_id]
        if len(filtered) == len(entries):
            return False
        self._write_items(filtered)
        return True

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
                )
            )
        return entries

    def _write_items(self, items: List[TodoItem]) -> None:
        payload = {"todos": [item.to_dict() for item in items]}
        atomic_write_json(self._storage_path, payload)


def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle todo list commands driven by the orchestrator or router."""

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

    if action == "create":
        title = _extract_title(payload)
        if not title:
            return _error_response("create", "missing_title", "Todo title is required.")
        notes = _normalize_notes(payload.get("notes")) or _extract_notes_from_message(payload)
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

        try:
            todo = store.create_todo(title=title, notes=notes, status=status, deadline=deadline_iso)
        except ValueError as exc:
            if str(exc) == "duplicate_title":
                return _error_response("create", "duplicate_title", f"Todo '{title}' already exists.")
            raise
        _augment_deadline_metadata(todo)
        return {"type": "todo_list", "domain": "todo", "action": "create", "todo": todo}

    if action == "update":
        todo_id = str(payload.get("id", "")).strip()
        target_title = payload.get("target_title")
        if not todo_id and target_title:
            entry = store.find_entry_by_title(str(target_title))
            if not entry:
                return _error_response("update", "not_found", f"Todo '{target_title}' was not found.")
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

        notes_field_present = "notes" in payload
        if notes_field_present:
            notes_value = _normalize_notes(payload.get("notes"))
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

        if (
            title_value is None
            and status_value is None
            and not notes_field_present
            and not deadline_requested
        ):
            return _error_response("update", "missing_updates", "Provide at least one field to update.")

        updated = store.update_todo(
            todo_id,
            title=title_value,
            status=status_value,
            notes=notes_value,
            clear_notes=notes_field_present and notes_value is None,
            deadline=deadline_value,
            clear_deadline=deadline_cleared,
        )
        if not updated:
            return _error_response("update", "not_found", f"Todo '{todo_id}' was not found.")
        _augment_deadline_metadata(updated)
        return {"type": "todo_list", "domain": "todo", "action": "update", "todo": updated}

    if action == "delete":
        todo_id = str(payload.get("id", "")).strip()
        target_title = payload.get("target_title") or payload.get("title")
        if not todo_id and target_title:
            entry = store.find_entry_by_title(str(target_title))
            if entry:
                todo_id = entry.id
        if not todo_id:
            return _error_response("delete", "missing_id", "Todo ID or title is required to delete an item.")
        removed = store.delete_todo(todo_id)
        if not removed:
            return _error_response("delete", "not_found", f"Todo '{todo_id}' was not found.")
        return {"type": "todo_list", "domain": "todo", "action": "delete", "deleted": True, "id": todo_id}

    return _error_response(action, "unsupported_action", f"Unsupported todo action '{action}'.")


def format_todo_response(result: Dict[str, Any]) -> str:
    """Render a human-friendly summary for todo operations plus raw payload."""

    if "error" in result:
        return _with_raw_output(result.get("message", "Todo action failed."), result, include_raw=False)

    action = result.get("action")
    if action == "list":
        todos = result.get("todos") or []
        if not todos:
            return _with_raw_output("Your todo list is empty.", result)
        lines = []
        for item in todos:
            status_box = "x" if item.get("status") == "completed" else " "
            title = item.get("title", "Untitled")
            parts = [f"- [{status_box}] {title} (#{item.get('id')})"]
            if item.get("deadline"):
                days = item.get("deadline_days_until")
                if days is not None:
                    countdown = f"{days} days" if days != 1 else "1 day"
                    parts.append(f"due {item['deadline']} ({countdown})")
                else:
                    parts.append(f"due {item['deadline']}")
            lines.append(" ".join(parts))
        return _with_raw_output("Todos:\n" + "\n".join(lines), result)

    if action == "create":
        todo = result.get("todo") or {}
        message = f"Added todo '{todo.get('title', 'Untitled')}'."
        if todo.get("deadline"):
            message += f" Due {todo['deadline']}."
        return _with_raw_output(message, result)

    if action == "update":
        todo = result.get("todo") or {}
        message = f"Updated todo '{todo.get('title', 'Untitled')}'."
        if todo.get("deadline"):
            message += f" Due {todo['deadline']}."
        return _with_raw_output(message, result)

    if action == "delete":
        title = result.get("id", "todo")
        return _with_raw_output(f"Removed todo '{title}'.", result)

    return _with_raw_output("Todo request completed.", result)


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
        title = _extract_title_from_message(message)
        if title:
            return title
    return ""


def _extract_deadline_from_fields(payload: Dict[str, Any]) -> Tuple[Optional[str], bool, bool]:
    for key in _DEADLINE_KEYS:
        if key not in payload:
            continue
        raw_value = payload.get(key)
        provided = True
        if raw_value is None:
            return None, provided, True
        text = str(raw_value).strip()
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
    for pattern in (_DATE_PATTERN, _DATE_TEXT_PATTERN):
        for match in pattern.finditer(message):
            parsed = parse_date_hint(match.group(0))
            if parsed:
                return parsed.isoformat()
    for token in re.split(r"\s+", message):
        parsed = parse_date_hint(token)
        if parsed:
            return parsed.isoformat()
    return None


def _extract_notes_from_message(payload: Dict[str, Any]) -> Optional[List[str]]:
    message = payload.get("message")
    if not isinstance(message, str):
        return None
    notes = extract_notes_from_text(message)
    return notes or None


def _extract_title_from_message(message: str) -> Optional[str]:
    title = extract_title_from_text(message)
    if title:
        return _clean_command_prefix(title)
    return None


def _clean_command_prefix(text: str) -> str:
    lowered = text.lower()
    prefixes = [
        "remember",
        "add todo",
        "todo",
        "add task",
        "create todo",
    ]
    for prefix in prefixes:
        if lowered.startswith(prefix):
            return text[len(prefix) :].strip(" :,-")
    return text.strip()


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


def _with_raw_output(message: str, payload: Dict[str, Any], include_raw: bool = True) -> str:
    if not include_raw:
        return message
    raw = json.dumps(payload, indent=2, ensure_ascii=False)
    return f"{message}\nRaw:\n{raw}"


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


__all__ = ["run", "format_todo_response", "TodoStore", "TodoItem"]
