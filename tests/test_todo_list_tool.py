"""Tests for the Tier-3 todo list tool."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import pytest

from tools import todo_list


def test_todo_run_create_update_delete(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "todos.json"
    monkeypatch.setattr(todo_list, "_DEFAULT_STORAGE_PATH", storage_path)

    created = todo_list.run({"action": "create", "title": "Buy milk"})
    assert created["action"] == "create"
    assert created["todo"]["title"] == "Buy milk"

    listed = todo_list.run({"action": "list"})
    assert listed["count"] == 1
    assert listed["todos"][0]["status"] == "pending"

    todo_id = listed["todos"][0]["id"]
    updated = todo_list.run({"action": "update", "id": todo_id, "status": "completed"})
    assert updated["todo"]["status"] == "completed"

    formatted = todo_list.format_todo_response(listed)
    assert "Buy milk" in formatted
    assert "Raw:" in formatted

    deleted = todo_list.run({"action": "delete", "id": todo_id})
    assert deleted["deleted"] is True
    assert todo_list.run({"action": "list"})["count"] == 0


def test_todo_run_validations(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "todos.json"
    monkeypatch.setattr(todo_list, "_DEFAULT_STORAGE_PATH", storage_path)

    missing_title = todo_list.run({"action": "create"})
    assert missing_title["error"] == "missing_title"

    created = todo_list.run({"action": "create", "title": "Task"})
    todo_id = created["todo"]["id"]

    bad_status = todo_list.run({"action": "update", "id": todo_id, "status": "bogus"})
    assert bad_status["error"] == "invalid_status"

    not_found = todo_list.run({"action": "delete", "id": "unknown"})
    assert not_found["error"] == "not_found"


def test_todo_run_accepts_add_alias(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "todos.json"
    monkeypatch.setattr(todo_list, "_DEFAULT_STORAGE_PATH", storage_path)

    result = todo_list.run({"action": "add", "title": "Alias task"})
    assert result["action"] == "create"
    assert result["todo"]["title"] == "Alias task"


def test_todo_run_uses_message_as_title(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "todos.json"
    monkeypatch.setattr(todo_list, "_DEFAULT_STORAGE_PATH", storage_path)

    result = todo_list.run({"action": "create", "message": "Message based title"})
    assert result["todo"]["title"] == "Message based title"


def test_todo_deadlines_sorting_and_countdown(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "todos.json"
    monkeypatch.setattr(todo_list, "_DEFAULT_STORAGE_PATH", storage_path)

    soon = (date.today() + timedelta(days=3)).strftime("%d/%m/%Y")
    later = (date.today() + timedelta(days=10)).strftime("%d/%m/%Y")

    todo_list.run({"action": "create", "title": "Later", "deadline": later})
    todo_list.run({"action": "create", "title": "Soon", "deadline": soon})
    todo_list.run({"action": "create", "title": "Beta"})
    todo_list.run({"action": "create", "title": "Alpha"})

    listed = todo_list.run({"action": "list"})
    titles = [todo["title"] for todo in listed["todos"]]
    assert titles[:2] == ["Soon", "Later"]
    assert titles[2:] == ["Alpha", "Beta"]
    days_until = listed["todos"][0].get("deadline_days_until")
    assert days_until == 3


def test_todo_deadline_parsed_from_message(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "todos.json"
    monkeypatch.setattr(todo_list, "_DEFAULT_STORAGE_PATH", storage_path)

    todo = todo_list.run({"action": "create", "message": "Remember SMK card 1/7/2030"})
    assert todo["todo"]["deadline"] == "2030-07-01"


def test_todo_notes_list_and_clearing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "todos.json"
    monkeypatch.setattr(todo_list, "_DEFAULT_STORAGE_PATH", storage_path)

    created = todo_list.run({"action": "create", "title": "Prep dinner", "notes": "Chop veggies"})
    todo = created["todo"]
    assert todo["notes"] == ["Chop veggies"]

    todo_id = todo["id"]
    updated = todo_list.run({"action": "update", "id": todo_id, "notes": ["Boil pasta", "Preheat oven"]})
    assert updated["todo"]["notes"] == ["Boil pasta", "Preheat oven"]

    cleared = todo_list.run({"action": "update", "id": todo_id, "notes": ""})
    assert "notes" not in cleared["todo"]
