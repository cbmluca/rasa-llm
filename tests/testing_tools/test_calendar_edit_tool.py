"""Tests for the Tier-3 calendar edit tool."""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest

from tools import calendar_edit_tool as calendar_edit


def test_calendar_run_create_update_delete(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "calendar.json"
    monkeypatch.setattr(calendar_edit, "_DEFAULT_STORAGE_PATH", storage_path)

    start = datetime(2024, 5, 1, 9, 0, tzinfo=timezone.utc)
    end = start + timedelta(hours=1)
    created = calendar_edit.run(
        {
            "action": "create",
            "title": "Standup",
            "start": start.isoformat(),
            "end": end.isoformat(),
            "notes": "Daily sync",
            "location": "HQ",
            "link": "https://meet.example.com",
        }
    )
    assert created["action"] == "create"
    event_id = created["event"]["id"]
    assert created["event"]["location"] == "HQ"

    listed = calendar_edit.run({"action": "list"})
    assert listed["count"] == 1

    updated = calendar_edit.run(
        {"action": "update", "id": event_id, "title": "Team Standup", "location": "Remote", "link": ""}
    )
    assert updated["event"]["title"] == "Team Standup"
    assert updated["event"]["location"] == "Remote"
    assert "link" not in updated["event"]

    deleted = calendar_edit.run({"action": "delete", "id": event_id})
    assert deleted["deleted"] is True
    assert calendar_edit.run({"action": "list"})["count"] == 0


def test_calendar_integration_create_update_delete(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "calendar.json"
    monkeypatch.setattr(calendar_edit, "_DEFAULT_STORAGE_PATH", storage_path)

    create_cmd = "Create an event for Sprint Retro on 1/2/2025 15:00-16:00 at the office."
    parsed = parse_command(create_cmd)
    assert parsed is not None
    created = calendar_edit.run(parsed.payload)
    event_id = created["event"]["id"]
    assert created["event"]["title"] == "Sprint Retro"

    update_cmd = "Update the meeting called Sprint Retro with location Remote"
    parsed_update = parse_command(update_cmd)
    parsed_update.payload["id"] = event_id
    updated = calendar_edit.run(parsed_update.payload)
    assert updated["event"]["location"] == "Remote"

    delete_cmd = 'Delete the meeting called "Sprint Retro"'
    parsed_delete = parse_command(delete_cmd)
    parsed_delete.payload["id"] = event_id
    deleted = calendar_edit.run(parsed_delete.payload)
    assert deleted["deleted"] is True


def test_calendar_validations(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "calendar.json"
    monkeypatch.setattr(calendar_edit, "_DEFAULT_STORAGE_PATH", storage_path)

    missing_title = calendar_edit.run({"action": "create", "start": datetime.now(timezone.utc).isoformat()})
    assert missing_title["error"] == "missing_title"

    missing_start = calendar_edit.run({"action": "create", "title": "Meeting"})
    assert missing_start["error"] == "missing_start"

    bad_time = calendar_edit.run({"action": "create", "title": "Meeting", "start": "not a date"})
    assert bad_time["error"] == "invalid_datetime"

    created = calendar_edit.run(
        {"action": "create", "title": "Call", "start": datetime.now(timezone.utc).isoformat()}
    )
    event_id = created["event"]["id"]

    missing_updates = calendar_edit.run({"action": "update", "id": event_id})
    assert missing_updates["error"] == "missing_updates"

    invalid_update = calendar_edit.run({"action": "update", "id": event_id, "start": "bad date"})
    assert invalid_update["error"] == "invalid_datetime"

    not_found = calendar_edit.run({"action": "delete", "id": "unknown"})
    assert not_found["error"] == "not_found"


def test_calendar_formatter_includes_raw(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "calendar.json"
    monkeypatch.setattr(calendar_edit, "_DEFAULT_STORAGE_PATH", storage_path)

    result = calendar_edit.run({"action": "list"})
    formatted = calendar_edit.format_calendar_response(result)
    assert "Raw:" in formatted


def test_calendar_accepts_danish_datetime(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "calendar.json"
    monkeypatch.setattr(calendar_edit, "_DEFAULT_STORAGE_PATH", storage_path)

    created = calendar_edit.run(
        {"action": "create", "title": "Retro", "start": "1/2/2025 09:00", "end": "1/2/2025 10:00", "location": "HQ"}
    )
    event = created["event"]
    assert event["start"].startswith("2025-02-01T09:00")
    assert event["end"].startswith("2025-02-01T10:00")
    assert event["location"] == "HQ"
