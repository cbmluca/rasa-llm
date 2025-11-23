"""Tests for the App Guide tool wrapper."""

from __future__ import annotations

import json
from pathlib import Path

from tools import app_guide_tool


def test_app_guide_list_and_create_update(tmp_path: Path, monkeypatch) -> None:
    storage_path = tmp_path / "app_guide.json"

    def _mock_store_path(self):  # type: ignore
        return storage_path

    # Ensure the underlying store writes to tmp_path by overriding __init__ attribute
    monkeypatch.setattr(app_guide_tool.AppGuideStore, "__init__", lambda self: setattr(self, "_storage_path", storage_path))

    created = app_guide_tool.run(
        {
            "action": "create",
            "id": "faq",
            "title": "FAQ",
            "content": "Details",
            "keywords": ["policies", "faq"],
            "link": "https://example.com/faq",
        }
    )
    assert created["section"]["id"] == "faq"
    assert created["section"]["link"] == "https://example.com/faq"
    assert created["section"]["keywords"] == ["policies", "faq"]

    updated = app_guide_tool.run({"action": "update", "lookup_title": "FAQ", "content": "Updated", "keywords": "updated"})
    assert updated["section"]["content"] == "Updated"
    assert updated["section"]["keywords"] == ["updated"]

    listing = app_guide_tool.run({"action": "list"})
    assert listing["count"] == 1


def test_app_guide_find_and_delete(tmp_path: Path, monkeypatch) -> None:
    storage_path = tmp_path / "app_guide.json"
    storage_path.parent.mkdir(parents=True, exist_ok=True)
    storage_path.write_text(json.dumps({"sections": {"intro": {"id": "intro", "title": "Intro", "content": "Welcome", "updated_at": "ts"}}}))
    monkeypatch.setattr(app_guide_tool.AppGuideStore, "__init__", lambda self: setattr(self, "_storage_path", storage_path))

    fetched = app_guide_tool.run({"action": "find", "title": "Intro"})
    assert fetched["sections"][0]["title"] == "Intro"

    deleted = app_guide_tool.run({"action": "delete", "id": "intro"})
    assert deleted["deleted"] is True
