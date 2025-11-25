"""Integration tests covering parser→tool flows for kitchen tips and notes."""

from __future__ import annotations

from pathlib import Path

import pytest

from core.command_parser import parse_command
from tools import kitchen_tips_tool as kitchen_tips
from tools import app_guide_tool as app_guide


def test_kitchen_tip_create_and_search(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "kitchen_tips.json"
    monkeypatch.setattr(kitchen_tips, "_DEFAULT_STORAGE_PATH", storage_path)

    create_cmd = 'Add a kitchen tip via the form: "Keep herbs fresh" with tags fresh.'
    parsed = parse_command(create_cmd)
    assert parsed is not None
    assert parsed.tool == "kitchen_tips"
    created = kitchen_tips.run(parsed.payload)
    assert created["action"] == "create"

    search_cmd = "Share a kitchen tip about herbs"
    parsed_search = parse_command(search_cmd)
    assert parsed_search is not None
    result = kitchen_tips.run(parsed_search.payload)
    assert result["action"] == "search"


def test_notes_get_update(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage_path = tmp_path / "app_guide.json"
    monkeypatch.setattr(app_guide, "_DEFAULT_STORAGE_PATH", storage_path)

    create_cmd = 'Add Notes section "tier_policies" titled "Tier Policies" with content "Initial"'
    parsed_create = parse_command(create_cmd)
    assert parsed_create is not None
    created = app_guide.run(parsed_create.payload)
    assert created["action"] == "upsert"

    update_cmd = "Update the Notes entry for tier_policies with a note about governance."
    parsed_update = parse_command(update_cmd)
    assert parsed_update is not None
    updated = app_guide.run({**parsed_update.payload, "content": "Governance note"})
    assert updated["action"] == "upsert"

    get_cmd = 'Get Notes section "tier_policies"'
    parsed_get = parse_command(get_cmd)
    assert parsed_get is not None
    fetched = app_guide.run(parsed_get.payload)
    assert fetched["action"] == "get"
