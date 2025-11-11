"""Tests for the Tier-3 kitchen tips tool."""

from __future__ import annotations

import json
from pathlib import Path

from tools import kitchen_tips_tool as kitchen_tips


def test_kitchen_tips_list_get_search(tmp_path: Path, monkeypatch) -> None:
    storage_path = tmp_path / "kitchen_tips.json"
    monkeypatch.setattr(kitchen_tips, "_DEFAULT_STORAGE_PATH", storage_path)

    payload = {
        "tips": [
            {
                "id": "boil_pasta",
                "title": "Boil pasta",
                "body": "Salt the water generously.",
                "tags": ["pasta"],
                "link": "https://example.com/pasta",
            },
            {"id": "store_herbs", "title": "Store herbs", "body": "Keep herbs in water in the fridge.", "tags": ["herbs"]},
        ]
    }
    storage_path.write_text(json.dumps(payload), encoding="utf-8")

    listed = kitchen_tips.run({"action": "list"})
    assert listed["count"] == 2

    fetched = kitchen_tips.run({"action": "get", "id": "boil_pasta"})
    assert fetched["tip"]["title"] == "Boil pasta"
    assert fetched["tip"]["link"] == "https://example.com/pasta"

    search = kitchen_tips.run({"action": "search", "query": "herbs"})
    assert search["count"] == 1
    assert search["tips"][0]["id"] == "store_herbs"


def test_kitchen_tips_validation(tmp_path: Path, monkeypatch) -> None:
    storage_path = tmp_path / "kitchen_tips.json"
    monkeypatch.setattr(kitchen_tips, "_DEFAULT_STORAGE_PATH", storage_path)
    storage_path.write_text(json.dumps({"tips": []}), encoding="utf-8")

    missing = kitchen_tips.run({"action": "get"})
    assert missing["error"] == "missing_id"

    unknown = kitchen_tips.run({"action": "get", "id": "missing"})
    assert unknown["error"] == "not_found"

    search = kitchen_tips.run({"action": "search"})
    assert search["error"] == "missing_query"

def test_kitchen_tips_formatter_is_clean(tmp_path: Path, monkeypatch) -> None:
    storage_path = tmp_path / "kitchen_tips.json"
    monkeypatch.setattr(kitchen_tips, "_DEFAULT_STORAGE_PATH", storage_path)
    storage_path.write_text(json.dumps({"tips": []}), encoding="utf-8")

    result = kitchen_tips.run({"action": "list"})
    formatted = kitchen_tips.format_kitchen_tips_response(result)
    assert "Raw:" not in formatted


def test_kitchen_tips_create(tmp_path: Path, monkeypatch) -> None:
    storage_path = tmp_path / "kitchen_tips.json"
    monkeypatch.setattr(kitchen_tips, "_DEFAULT_STORAGE_PATH", storage_path)
    storage_path.write_text(json.dumps({"tips": []}), encoding="utf-8")

    created = kitchen_tips.run(
        {
            "action": "create",
            "title": "Sear steaks hot",
            "body": "Sear at high heat then finish low.",
            "tags": ["meat", "steak"],
            "link": "https://example.com/steak",
        }
    )
    assert created["action"] == "create"
    assert created["tip"]["title"] == "Sear steaks hot"


def test_kitchen_tips_update_and_delete(tmp_path: Path, monkeypatch) -> None:
    storage_path = tmp_path / "kitchen_tips.json"
    monkeypatch.setattr(kitchen_tips, "_DEFAULT_STORAGE_PATH", storage_path)
    payload = {
        "tips": [
            {
                "id": "tip123",
                "title": "Old title",
                "body": "Old body",
                "tags": ["legacy"],
                "link": "https://example.com/old",
            }
        ]
    }
    storage_path.write_text(json.dumps(payload), encoding="utf-8")

    updated = kitchen_tips.run(
        {
            "action": "update",
            "id": "tip123",
            "title": "New title",
            "body": "New body",
            "tags": ["fresh"],
            "link": "https://example.com/new",
        }
    )
    assert updated["tip"]["title"] == "New title"
    assert updated["tip"]["tags"] == ["fresh"]

    deleted = kitchen_tips.run({"action": "delete", "id": "tip123"})
    assert deleted["deleted"] is True

    missing = kitchen_tips.run({"action": "delete", "id": "tip123"})
    assert missing["error"] == "not_found"
