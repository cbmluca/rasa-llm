"""Tier-3 calendar tool supporting add/update/delete operations."""

from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.json_storage import atomic_write_json, read_json
from core.text_parsing import parse_datetime_hint

_DEFAULT_STORAGE_PATH = Path("data_pipeline/calendar.json")
_ACTION_ALIASES = {
    "list_events": "list",
    "list_event": "list",
    "events_list": "list",
}


@dataclass
class CalendarEvent:
    """Represent a single calendar entry."""

    id: str
    title: str
    start: str
    end: str
    created_at: str
    updated_at: str
    notes: Optional[str] = None
    location: Optional[str] = None
    link: Optional[str] = None

    def to_dict(self) -> Dict[str, str]:
        data = asdict(self)
        return {key: value for key, value in data.items() if value not in {None, ""}}


class CalendarStore:
    """File-backed storage for calendar events."""

    def __init__(self, storage_path: Path | None = None) -> None:
        self._storage_path = storage_path or _DEFAULT_STORAGE_PATH

    def list_events(self) -> List[Dict[str, str]]:
        events = self._load_events()
        events.sort(key=lambda event: event.start)
        return [event.to_dict() for event in events]

    def create_event(
        self,
        title: str,
        start: datetime,
        end: Optional[datetime],
        notes: Optional[str],
        location: Optional[str],
        link: Optional[str],
    ) -> Dict[str, str]:
        start_iso, end_iso = _normalize_range(start, end)
        now = _utc_timestamp()
        event = CalendarEvent(
            id=uuid.uuid4().hex,
            title=title,
            start=start_iso,
            end=end_iso,
            created_at=now,
            updated_at=now,
            notes=notes or None,
            location=location or None,
            link=link or None,
        )
        events = self._load_events()
        events.append(event)
        self._write_events(events)
        return event.to_dict()

    def update_event(
        self,
        event_id: str,
        *,
        title: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        notes: Optional[str] = None,
        location: Optional[str] = None,
        link: Optional[str] = None,
        clear_notes: bool = False,
        clear_location: bool = False,
        clear_link: bool = False,
    ) -> Optional[Dict[str, str]]:
        events = self._load_events()
        updated: Optional[CalendarEvent] = None
        for idx, event in enumerate(events):
            if event.id != event_id:
                continue
            new_start = start if start is not None else _parse_iso(event.start)
            new_end = end if end is not None else _parse_iso(event.end)
            start_iso, end_iso = _normalize_range(new_start, new_end)
            if clear_notes:
                next_notes = None
            elif notes is not None:
                next_notes = notes
            else:
                next_notes = event.notes

            if clear_location:
                next_location = None
            elif location is not None:
                next_location = location
            else:
                next_location = event.location

            if clear_link:
                next_link = None
            elif link is not None:
                next_link = link
            else:
                next_link = event.link

            new_event = replace(
                event,
                title=title if title is not None else event.title,
                start=start_iso,
                end=end_iso,
                notes=next_notes,
                location=next_location,
                link=next_link,
                updated_at=_utc_timestamp(),
            )
            events[idx] = new_event
            updated = new_event
            break

        if not updated:
            return None

        self._write_events(events)
        return updated.to_dict()

    def delete_event(self, event_id: str) -> bool:
        events = self._load_events()
        filtered = [event for event in events if event.id != event_id]
        if len(filtered) == len(events):
            return False
        self._write_events(filtered)
        return True

    def _load_events(self) -> List[CalendarEvent]:
        payload = read_json(self._storage_path, {"events": []})
        raw = payload.get("events", [])
        if not isinstance(raw, list):
            raise ValueError("Invalid calendar format: 'events' must be a list")

        events: List[CalendarEvent] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            event_id = str(item.get("id", "")).strip()
            if not event_id:
                continue
            start_raw = str(item.get("start", "")).strip()
            end_raw = str(item.get("end", "")).strip()
            try:
                start_dt = _parse_iso(start_raw)
                end_dt = _parse_iso(end_raw) if end_raw else None
            except ValueError:
                continue
            start_iso, end_iso = _normalize_range(start_dt, end_dt)
            events.append(
                CalendarEvent(
                    id=event_id,
                    title=str(item.get("title", "")).strip(),
                    start=start_iso,
                    end=end_iso,
                    created_at=str(item.get("created_at", "")).strip() or _utc_timestamp(),
                    updated_at=str(item.get("updated_at", "")).strip() or _utc_timestamp(),
                    notes=str(item.get("notes", "")).strip() or None,
                    location=str(item.get("location", "")).strip() or None,
                    link=str(item.get("link", "")).strip() or None,
                )
            )
        return events

    def _write_events(self, events: List[CalendarEvent]) -> None:
        payload = {"events": [event.to_dict() for event in events]}
        atomic_write_json(self._storage_path, payload)

    def find_event_by_title(self, title: str) -> Optional[CalendarEvent]:
        normalized = title.strip().lower()
        for event in self._load_events():
            if event.title.strip().lower() == normalized:
                return event
        return None


def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for calendar operations."""

    action_raw = str(payload.get("action", "list")).strip().lower()
    action = _ACTION_ALIASES.get(action_raw, action_raw or "list")
    store = CalendarStore()

    if action == "list":
        events = store.list_events()
        return {
            "type": "calendar_edit",
            "domain": "calendar",
            "action": "list",
            "events": events,
            "count": len(events),
        }

    if action == "create":
        title = str(payload.get("title", "")).strip()
        if not title:
            return _error_response("create", "missing_title", "Event title is required.")
        start_raw = str(payload.get("start", "")).strip()
        if not start_raw:
            return _error_response("create", "missing_start", "Event start datetime is required.")
        end_raw = payload.get("end")
        notes = str(payload.get("notes", "")).strip() or None
        location = str(payload.get("location", "")).strip() or None
        link = str(payload.get("link", "")).strip() or None
        try:
            start_dt = _parse_datetime(start_raw)
            end_dt = _parse_datetime(str(end_raw)) if end_raw else None
        except ValueError as exc:
            return _error_response("create", "invalid_datetime", str(exc))

        event = store.create_event(title=title, start=start_dt, end=end_dt, notes=notes, location=location, link=link)
        return {"type": "calendar_edit", "domain": "calendar", "action": "create", "event": event}

    if action == "update":
        event_id = str(payload.get("id", "")).strip()
        if not event_id:
            lookup_title = payload.get("target_title")
            if not lookup_title:
                lookup_title = payload.get("title")
            if lookup_title:
                entry = store.find_event_by_title(str(lookup_title))
                if entry:
                    event_id = entry.id
        if not event_id:
            return _error_response("update", "missing_id", "Event ID or title is required to update an entry.")

        title_value = None
        if "new_title" in payload:
            title_value = str(payload.get("new_title") or "").strip()
        elif "title" in payload and payload.get("title") is not None and payload.get("target_title") is None:
            title_candidate = str(payload.get("title")).strip()
            if title_candidate:
                title_value = title_candidate

        start_dt: Optional[datetime]
        if "start" in payload:
            try:
                start_dt = _parse_datetime(str(payload.get("start")))
            except ValueError as exc:
                return _error_response("update", "invalid_datetime", str(exc))
        else:
            start_dt = None

        end_dt: Optional[datetime]
        if "end" in payload:
            raw_end = payload.get("end")
            if raw_end in {None, ""}:
                end_dt = None
            else:
                try:
                    end_dt = _parse_datetime(str(raw_end))
                except ValueError as exc:
                    return _error_response("update", "invalid_datetime", str(exc))
        else:
            end_dt = None

        notes_value = payload.get("notes")
        notes_text = str(notes_value).strip() if notes_value is not None else None
        if notes_text == "":
            notes_text = None
        location_present = "location" in payload
        location_value = payload.get("location")
        location_text = str(location_value).strip() if location_present else None
        if location_text == "":
            location_text = None
        link_present = "link" in payload
        link_value = payload.get("link")
        link_text = str(link_value).strip() if link_present else None
        if link_text == "":
            link_text = None

        if (
            title_value is None
            and start_dt is None
            and end_dt is None
            and notes_text is None
            and location_text is None
            and link_text is None
        ):
            return _error_response("update", "missing_updates", "Provide at least one field to update.")

        updated = store.update_event(
            event_id,
            title=title_value,
            start=start_dt,
            end=end_dt,
            notes=notes_text,
            location=location_text,
            link=link_text,
            clear_notes=notes_value is not None and notes_text is None,
            clear_location=location_present and location_text is None,
            clear_link=link_present and link_text is None,
        )
        if not updated:
            return _error_response("update", "not_found", f"Event '{event_id}' was not found.")
        return {"type": "calendar_edit", "domain": "calendar", "action": "update", "event": updated}

    if action == "delete":
        event_id = str(payload.get("id", "")).strip()
        if not event_id:
            lookup_title = payload.get("target_title") or payload.get("title")
            if lookup_title:
                entry = store.find_event_by_title(str(lookup_title))
                if entry:
                    event_id = entry.id
        if not event_id:
            return _error_response("delete", "missing_id", "Event ID or title is required to delete an entry.")
        removed = store.delete_event(event_id)
        if not removed:
            return _error_response("delete", "not_found", f"Event '{event_id}' was not found.")
        return {"type": "calendar_edit", "domain": "calendar", "action": "delete", "deleted": True, "id": event_id}

    return _error_response(action, "unsupported_action", f"Unsupported calendar action '{action}'.")


def format_calendar_response(result: Dict[str, Any]) -> str:
    """Render a short description of calendar operations."""

    if "error" in result:
        return _with_raw_output(result.get("message", "Calendar action failed."), result, include_raw=False)

    action = result.get("action")
    if action == "list":
        events = result.get("events") or []
        if not events:
            return _with_raw_output("Your calendar is empty.", result)
        lines = [
            f"- {event.get('title', 'Untitled')} ({event.get('start')} → {event.get('end')}) (#{event.get('id')})"
            for event in events
        ]
        return _with_raw_output("Calendar events:\n" + "\n".join(lines), result)

    if action == "create":
        event = result.get("event") or {}
        return _with_raw_output(f"Added '{event.get('title', 'event')}' on {event.get('start')}.", result)

    if action == "update":
        event = result.get("event") or {}
        return _with_raw_output(f"Updated '{event.get('title', 'event')}'.", result)

    if action == "delete":
        name = result.get("id", "event")
        return _with_raw_output(f"Removed event '{name}'.", result)

    return _with_raw_output("Calendar request completed.", result)


def _parse_datetime(value: str) -> datetime:
    value = (value or "").strip()
    if not value:
        raise ValueError("Invalid datetime ''. Provide a timestamp like 01/02/2025 09:00.")
    try:
        return _parse_iso(value)
    except ValueError:
        hint = parse_datetime_hint(value)
        if hint:
            return hint
        raise ValueError(f"Invalid datetime '{value}'. Use formats like 01/02/2025 09:00 or ISO 8601.") from None


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _normalize_range(start: datetime, end: Optional[datetime]) -> Tuple[str, str]:
    if end is None:
        end = start
    if end < start:
        raise ValueError("Event end time cannot be before the start time.")
    return start.isoformat(), end.isoformat()


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _error_response(action: str, code: str, message: str) -> Dict[str, Any]:
    return {
        "type": "calendar_edit",
        "domain": "calendar",
        "action": action,
        "error": code,
        "message": message,
    }


def _with_raw_output(message: str, payload: Dict[str, Any], include_raw: bool = False) -> str:
    if not include_raw:
        return message
    return f"{message}\nRaw:\n{json.dumps(payload, indent=2, ensure_ascii=False)}"


__all__ = ["run", "format_calendar_response", "CalendarStore", "CalendarEvent"]
