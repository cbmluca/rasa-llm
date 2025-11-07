"""Tests for the Tier-3 calendar edit tool."""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest

from tools import calendar_edit


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

