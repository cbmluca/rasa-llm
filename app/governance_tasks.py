"""Governance maintenance CLI for retention and purge workflows.

This module introduces the Tier-6 purge utilities that keep JSONL logs and
tool stores within the retention windows declared in ``config/governance.yml``.
It can be scheduled via cron or CI (``python -m app.governance_tasks purge``)
to prune old turns, pending queues, corrected prompts, and stale store rows.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, MutableMapping, Optional

from app.config import (
    get_corrected_prompts_path,
    get_review_queue_path,
    get_turn_log_path,
)
from core.data_views import iter_jsonl
from core.governance import GovernancePolicy

DEFAULT_POLICY_PATH = Path("config/governance.yml")
DEFAULT_PURGE_LOG = Path("reports/purge.log")
DEFAULT_PURGE_STATE = Path("reports/purge_state.json")

__all__ = ["purge_jsonl_file", "purge_store_file", "run_purge", "main"]

STORE_TARGETS: List[Dict[str, object]] = [
    {
        "name": "todos",
        "path": Path("data_pipeline/todos.json"),
        "collection_key": "todos",
        "collection_type": "list",
        "timestamp_fields": ("updated_at", "created_at"),
    },
    {
        "name": "calendar",
        "path": Path("data_pipeline/calendar.json"),
        "collection_key": "events",
        "collection_type": "list",
        "timestamp_fields": ("updated_at", "created_at", "start"),
    },
    {
        "name": "kitchen_tips",
        "path": Path("data_pipeline/kitchen_tips.json"),
        "collection_key": "tips",
        "collection_type": "list",
        "timestamp_fields": (),
    },
    {
        "name": "app_guide",
        "path": Path("data_pipeline/app_guide.json"),
        "collection_key": "sections",
        "collection_type": "mapping",
        "timestamp_fields": ("updated_at",),
    },
]


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _parse_timestamp(value: object) -> Optional[datetime]:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text.replace("Z", "+00:00")
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def purge_jsonl_file(
    path: Path,
    *,
    max_entries: int,
    dry_run: bool = False,
) -> Dict[str, object]:
    """Truncate JSONL files to the most recent ``max_entries`` rows."""

    result: Dict[str, object] = {
        "path": path,
        "total": 0,
        "removed": 0,
        "kept": 0,
        "dry_run": dry_run,
        "skipped": False,
    }
    if max_entries <= 0:
        result["skipped"] = True
        return result
    if not path.exists():
        result["skipped"] = True
        return result
    rows = list(iter_jsonl(path))
    total = len(rows)
    if total <= max_entries:
        result.update({"total": total, "removed": 0, "kept": total})
        return result
    kept_rows = rows[-max_entries:]
    removed = total - len(kept_rows)
    result.update({"total": total, "removed": removed, "kept": len(kept_rows)})
    if not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as handle:
            for row in kept_rows:
                handle.write(json.dumps(row, ensure_ascii=False))
                handle.write("\n")
    return result


def purge_store_file(
    *,
    path: Path,
    collection_key: str,
    collection_type: str,
    timestamp_fields: Iterable[str],
    max_entries: int,
    dry_run: bool = False,
) -> Dict[str, object]:
    """Trim store entries (todos, calendar, etc.) to the newest ``max_entries`` records."""

    result: Dict[str, object] = {
        "path": path,
        "total": 0,
        "removed": 0,
        "kept": 0,
        "dry_run": dry_run,
        "skipped": False,
    }
    if max_entries <= 0:
        result["skipped"] = True
        return result
    if not path.exists():
        result["skipped"] = True
        return result
    timestamp_fields = tuple(timestamp_fields)
    if not timestamp_fields:
        result["skipped"] = True
        return result
    try:
        payload = json.loads(path.read_text(encoding="utf-8") or "{}")
    except json.JSONDecodeError:
        result["skipped"] = True
        return result

    if collection_type == "mapping":
        collection = payload.get(collection_key) or {}
        if not isinstance(collection, MutableMapping):
            result["skipped"] = True
            return result
        total = len(collection)
        if total <= max_entries:
            result.update({"total": total, "removed": 0, "kept": total})
            return result
        items = list(collection.items())
        scored: List[tuple[datetime, int, str]] = []
        for index, (key, entry) in enumerate(items):
            ts_value = None
            if isinstance(entry, Mapping):
                for field in timestamp_fields:
                    ts_value = _parse_timestamp(entry.get(field))
                    if ts_value:
                        break
            scored.append((ts_value or datetime.min.replace(tzinfo=timezone.utc), index, key))
        scored.sort()  # oldest first
        drop_count = max(0, total - max_entries)
        to_drop = {key for _, _, key in scored[:drop_count]}
        kept_map: Dict[str, dict] = {}
        for key, entry in items:
            if key in to_drop:
                continue
            kept_map[key] = entry
        removed = total - len(kept_map)
        result.update({"total": total, "removed": removed, "kept": len(kept_map)})
        if not dry_run and removed > 0:
            payload[collection_key] = kept_map
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return result

    collection = payload.get(collection_key) or []
    if not isinstance(collection, list):
        result["skipped"] = True
        return result
    total = len(collection)
    if total <= max_entries:
        result.update({"total": total, "removed": 0, "kept": total})
        return result
    scored_entries: List[tuple[datetime, int]] = []
    for index, entry in enumerate(collection):
        ts_value = None
        if isinstance(entry, Mapping):
            for field in timestamp_fields:
                ts_value = _parse_timestamp(entry.get(field))
                if ts_value:
                    break
        scored_entries.append((ts_value or datetime.min.replace(tzinfo=timezone.utc), index))
    scored_entries.sort()  # oldest first
    drop_count = max(0, total - max_entries)
    drop_indexes = {index for _, index in scored_entries[:drop_count]}
    kept_entries = [entry for idx, entry in enumerate(collection) if idx not in drop_indexes]
    removed = total - len(kept_entries)
    result.update({"total": total, "removed": removed, "kept": len(kept_entries)})
    if not dry_run:
        payload[collection_key] = kept_entries
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return result


def _log(message: str, log_path: Optional[Path]) -> None:
    timestamp = _now().isoformat()
    line = f"[{timestamp}] {message}"
    print(line)
    if log_path:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(line)
            handle.write("\n")


def _format_result(bucket: str, result: Mapping[str, object]) -> str:
    if result.get("skipped"):
        return f"{bucket}: skipped (path={result.get('path')})"
    return (
        f"{bucket}: removed {result.get('removed')} / {result.get('total')} "
        f"(dry_run={result.get('dry_run')}) path={result.get('path')}"
    )


def _write_purge_state(state_path: Path, *, dry_run: bool) -> None:
    payload = {
        "last_run": _now().isoformat(),
        "dry_run": dry_run,
    }
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def run_purge(*, config_path: Path, dry_run: bool, log_path: Optional[Path], state_path: Path) -> None:
    """Entry point for the ``purge`` sub-command."""

    policy = GovernancePolicy(config_path)
    _log(f"Loaded governance policy version {policy.policy_version}", log_path)

    turn_log_result = purge_jsonl_file(
        get_turn_log_path(),
        max_entries=policy.get_retention_limit("turn_logs", default=0),
        dry_run=dry_run,
    )
    _log(_format_result("turn_logs", turn_log_result), log_path)

    pending_result = purge_jsonl_file(
        get_review_queue_path(),
        max_entries=policy.get_retention_limit("pending_queue", default=0),
        dry_run=dry_run,
    )
    _log(_format_result("pending_queue", pending_result), log_path)

    corrected_result = purge_jsonl_file(
        get_corrected_prompts_path(),
        max_entries=policy.get_retention_limit("corrected_prompts", default=0),
        dry_run=dry_run,
    )
    _log(_format_result("corrected_prompts", corrected_result), log_path)

    store_limit = policy.get_retention_limit("tool_stores", default=0)
    if store_limit > 0:
        for target in STORE_TARGETS:
            result = purge_store_file(
                path=target["path"],
                collection_key=target["collection_key"],
                collection_type=target["collection_type"],
                timestamp_fields=target["timestamp_fields"],
                max_entries=store_limit,
                dry_run=dry_run,
            )
            _log(_format_result(f"store:{target['name']}", result), log_path)
    else:
        _log("store retention disabled; skipping tool stores", log_path)

    _write_purge_state(state_path, dry_run=dry_run)
    _log("Purge completed.", log_path)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Governance maintenance tasks.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    purge_parser = subparsers.add_parser("purge", help="Purge old logs/stores per governance policy.")
    purge_parser.add_argument("--config", type=Path, default=DEFAULT_POLICY_PATH, help="Path to governance.yml.")
    purge_parser.add_argument("--dry-run", action="store_true", help="Preview retention changes without rewriting files.")
    purge_parser.add_argument(
        "--log-path",
        type=Path,
        default=DEFAULT_PURGE_LOG,
        help="Optional log file for purge summaries (default: reports/purge.log).",
    )
    purge_parser.add_argument(
        "--state-path",
        type=Path,
        default=DEFAULT_PURGE_STATE,
        help="Path for storing last purge metadata (default: reports/purge_state.json).",
    )
    return parser


def main(argv: Optional[Iterable[str]] = None) -> None:
    parser = _build_parser()
    args = parser.parse_args(argv)
    if args.command == "purge":
        run_purge(
            config_path=args.config,
            dry_run=args.dry_run,
            log_path=args.log_path,
            state_path=args.state_path,
        )
        return
    parser.error("Unknown command")


if __name__ == "__main__":
    main()
