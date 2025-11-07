"""Tests for the App Guide tool wrapper."""

from __future__ import annotations

import json
from pathlib import Path

from tools import app_guide_tool


def test_app_guide_list_and_upsert(tmp_path: Path, monkeypatch) -> None:
    storage_path = tmp_path / "app_guide.json"

    def _mock_store_path(self):  # type: ignore
        return storage_path

    # Ensure the underlying store writes to tmp_path by overriding __init__ attribute
    monkeypatch.setattr(app_guide_tool.AppGuideStore, "__init__", lambda self: setattr(self, "_storage_path", storage_path))

    upsert = app_guide_tool.run({"action": "upsert", "section_id": "faq", "title": "FAQ", "content": "Details"})
    assert upsert["section"]["section_id"] == "faq"

    listing = app_guide_tool.run({"action": "list"})
    assert listing["count"] == 1


def test_app_guide_get_and_delete(tmp_path: Path, monkeypatch) -> None:
    storage_path = tmp_path / "app_guide.json"
    storage_path.parent.mkdir(parents=True, exist_ok=True)
    storage_path.write_text(json.dumps({"sections": {"intro": {"section_id": "intro", "title": "Intro", "content": "Welcome", "updated_at": "ts"}}}))
    monkeypatch.setattr(app_guide_tool.AppGuideStore, "__init__", lambda self: setattr(self, "_storage_path", storage_path))

    fetched = app_guide_tool.run({"action": "get", "section_id": "intro"})
    assert fetched["section"]["title"] == "Intro"

    deleted = app_guide_tool.run({"action": "delete", "section_id": "intro"})
    assert deleted["deleted"] is True
