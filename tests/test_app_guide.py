"""Tests for the Tier-3 app guide knowledge store."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pytest

from knowledge.app_guide import AppGuideStore


def test_list_sections_returns_empty_when_file_missing(tmp_path: Path) -> None:
    store = AppGuideStore(tmp_path / "app_guide.json")

    assert store.list_sections() == []
    assert store.get_section("overview") is None


def test_upsert_section_persists_payload(tmp_path: Path) -> None:
    storage_path = tmp_path / "guide" / "app_guide.json"
    store = AppGuideStore(storage_path)

    entry = store.upsert_section("overview", "Overview", "Initial content", keywords=["faq", "overview"], link="https://example.com")

    assert entry["id"] == "overview"
    assert entry["title"] == "Overview"
    assert entry["keywords"] == ["faq", "overview"]
    assert entry["link"] == "https://example.com"
    datetime.fromisoformat(entry["updated_at"])

    reloaded = store.get_section("overview")
    assert reloaded is not None
    assert reloaded["content"] == "Initial content"
    assert reloaded["keywords"] == ["faq", "overview"]
    datetime.fromisoformat(reloaded["updated_at"])

    on_disk = json.loads(storage_path.read_text(encoding="utf-8"))
    assert on_disk["sections"]["overview"]["title"] == "Overview"
    assert on_disk["sections"]["overview"]["keywords"] == ["faq", "overview"]


def test_upsert_section_overwrites_existing_data(tmp_path: Path) -> None:
    store = AppGuideStore(tmp_path / "app_guide.json")
    first = store.upsert_section("overview", "Overview", "Initial content", keywords=["first"])
    second = store.upsert_section("overview", "Overview", "Updated content", keywords=["second"])

    assert second["id"] == "overview"
    assert second["content"] == "Updated content"
    assert second["keywords"] == ["second"]
    assert datetime.fromisoformat(second["updated_at"]) >= datetime.fromisoformat(first["updated_at"])


def test_delete_section_returns_boolean(tmp_path: Path) -> None:
    store = AppGuideStore(tmp_path / "app_guide.json")
    store.upsert_section("overview", "Overview", "Some content")

    assert store.delete_section("overview") is True
    assert store.list_sections() == []
    assert store.delete_section("overview") is False


def test_upsert_section_validates_identifiers(tmp_path: Path) -> None:
    store = AppGuideStore(tmp_path / "app_guide.json")

    with pytest.raises(ValueError):
        store.upsert_section("", "Title", "Body")
    with pytest.raises(ValueError):
        store.upsert_section("overview", "", "Body")


def test_find_by_title_handles_case(tmp_path: Path) -> None:
    store = AppGuideStore(tmp_path / "app_guide.json")
    store.upsert_section("overview", "Overview", "Content", keywords=["intro"])

    found = store.find_by_title("overview")
    assert found is not None
    assert found["id"] == "overview"
    assert found["keywords"] == ["intro"]

    assert store.find_by_title("missing") is None
