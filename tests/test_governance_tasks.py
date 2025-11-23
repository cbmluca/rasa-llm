from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.governance_tasks import purge_jsonl_file, purge_store_file


def _now() -> datetime:
    return datetime(2025, 1, 10, tzinfo=timezone.utc)


def test_purge_jsonl_file_trims_to_latest_entries(tmp_path: Path) -> None:
    path = tmp_path / "turns.jsonl"
    cutoff = _now() - timedelta(days=5)
    rows = [
        {"timestamp": (cutoff - timedelta(days=1)).isoformat(), "value": "old"},
        {"timestamp": (_now() - timedelta(days=1)).isoformat(), "value": "fresh"},
        {"timestamp": _now().isoformat(), "value": "latest"},
    ]
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row))
            handle.write("\n")

    result = purge_jsonl_file(path, max_entries=2, dry_run=False)

    assert result["removed"] == 1
    remaining_lines = path.read_text(encoding="utf-8").strip().splitlines()
    assert len(remaining_lines) == 2
    assert json.loads(remaining_lines[0])["value"] == "fresh"
    assert json.loads(remaining_lines[1])["value"] == "latest"


def test_purge_jsonl_file_dry_run_preserves_file(tmp_path: Path) -> None:
    path = tmp_path / "pending.jsonl"
    path.write_text(
        "\n".join(
            json.dumps({"timestamp": (_now() - timedelta(days=10)).isoformat(), "value": idx}) for idx in range(2)
        ),
        encoding="utf-8",
    )

    result = purge_jsonl_file(path, max_entries=1, dry_run=True)

    assert result["removed"] == 2
    assert path.read_text(encoding="utf-8").count("\n") == 1  # original content unchanged


def test_purge_store_file_filters_list_entries(tmp_path: Path) -> None:
    path = tmp_path / "todos.json"
    payload = {
        "todos": [
            {"id": "a", "updated_at": (_now() - timedelta(days=30)).isoformat()},
            {"id": "b", "updated_at": (_now() - timedelta(days=2)).isoformat()},
            {"id": "c", "updated_at": (_now() - timedelta(hours=2)).isoformat()},
        ]
    }
    path.write_text(json.dumps(payload), encoding="utf-8")

    result = purge_store_file(
        path=path,
        collection_key="todos",
        collection_type="list",
        timestamp_fields=("updated_at",),
        max_entries=1,
        dry_run=False,
    )

    assert result["removed"] == 2
    data = json.loads(path.read_text(encoding="utf-8"))
    assert [entry["id"] for entry in data["todos"]] == ["c"]


def test_purge_store_file_handles_mapping(tmp_path: Path) -> None:
    path = tmp_path / "guide.json"
    payload = {
        "sections": {
            "old": {"id": "old", "updated_at": (_now() - timedelta(days=200)).isoformat()},
            "fresh": {"id": "fresh", "updated_at": (_now() - timedelta(days=2)).isoformat()},
            "newest": {"id": "newest", "updated_at": _now().isoformat()},
        }
    }
    path.write_text(json.dumps(payload), encoding="utf-8")

    result = purge_store_file(
        path=path,
        collection_key="sections",
        collection_type="mapping",
        timestamp_fields=("updated_at",),
        max_entries=2,
        dry_run=False,
    )

    assert result["removed"] == 1
    updated = json.loads(path.read_text(encoding="utf-8"))
    assert sorted(updated["sections"].keys()) == ["fresh", "newest"]
