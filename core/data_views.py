"""Shared helpers for reading JSONL logs and admin data stores."""

from __future__ import annotations

import csv
import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, Iterator, List, Optional, Sequence

from core.intent_config import load_intent_config


def iter_jsonl(path: Path) -> Iterator[dict]:
    """Yield parsed JSON objects from a JSONL file, skipping bad rows."""

    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def normalize_text(value: str) -> str:
    """Normalize whitespace/case for consistent hashing."""

    return " ".join((value or "").split()).strip().lower()


def hash_text(value: str) -> str:
    normalized = normalize_text(value)
    if not normalized:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def iter_pending_prompts(path: Path) -> Iterator[dict]:
    return iter_jsonl(path)


def review_pending_prompts(path: Path, limit: int = 10) -> list[dict]:
    entries = list(iter_pending_prompts(path))
    return entries[-limit:]


def _write_csv(path: Path, rows: Sequence[dict]) -> None:
    fieldnames = ["text", "parser_intent", "confidence", "reason", "timestamp", "text_hash"]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})


def export_pending(
    *,
    pending_path: Path,
    output_dir: Path,
    fmt: str,
    dedupe: bool,
) -> dict:
    groups: Dict[str, List[dict]] = {}
    seen_hashes: set[str] = set()
    for entry in iter_pending_prompts(pending_path):
        text = (entry.get("user_text") or "").strip()
        if not text:
            continue
        text_hash = hash_text(text)
        if dedupe and text_hash in seen_hashes:
            continue
        intent = entry.get("intent") or "nlu_fallback"
        groups.setdefault(intent, []).append(
            {
                "text": text,
                "parser_intent": intent,
                "confidence": entry.get("confidence"),
                "reason": entry.get("reason"),
                "timestamp": entry.get("timestamp"),
                "text_hash": text_hash,
            }
        )
        if dedupe and text_hash:
            seen_hashes.add(text_hash)

    output_dir.mkdir(parents=True, exist_ok=True)
    written_files: List[Path] = []
    for intent, records in groups.items():
        slug = intent.replace("/", "_")
        target = output_dir / f"{slug}.{fmt}"
        if fmt == "csv":
            _write_csv(target, records)
        else:
            target.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
        written_files.append(target)

    total = sum(len(records) for records in groups.values())
    return {
        "intents": {intent: len(records) for intent, records in groups.items()},
        "total": total,
        "files": [str(path) for path in written_files],
    }


def load_label_rows(path: Path, fmt: str) -> list[dict]:
    if fmt == "csv":
        with path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            return [dict(row) for row in reader]
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, list):
        return data
    raise ValueError("Label import expects a list of objects.")


def load_label_lookup(path: Path) -> Dict[str, str]:
    lookup: Dict[str, str] = {}
    for record in iter_jsonl(path):
        text = record.get("text")
        reviewer = record.get("reviewer_intent")
        if not text or not reviewer:
            continue
        lookup[hash_text(text)] = reviewer
    return lookup


def append_labels(
    *,
    input_path: Path,
    fmt: str,
    labeled_path: Path,
    dedupe: bool,
) -> dict:
    rows = load_label_rows(input_path, fmt)
    config = load_intent_config()
    known_intents = set(config.names())

    existing_lookup = load_label_lookup(labeled_path) if labeled_path.exists() else {}
    existing_hashes = set(existing_lookup.keys())

    appended = 0
    labeled_path.parent.mkdir(parents=True, exist_ok=True)
    with labeled_path.open("a", encoding="utf-8") as handle:
        for row in rows:
            text = (row.get("text") or "").strip()
            reviewer_intent = row.get("reviewer_intent") or row.get("label")
            parser_intent = row.get("parser_intent") or row.get("intent") or "unknown"
            if not text or not reviewer_intent:
                continue
            if reviewer_intent not in known_intents:
                continue
            if parser_intent not in known_intents:
                parser_intent = "nlu_fallback"
            text_hash = hash_text(text)
            if dedupe and text_hash in existing_hashes:
                continue
            payload = {
                "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                "text": text,
                "parser_intent": parser_intent,
                "reviewer_intent": reviewer_intent,
            }
            handle.write(json.dumps(payload, ensure_ascii=False))
            handle.write("\n")
            appended += 1
            if dedupe and text_hash:
                existing_hashes.add(text_hash)

    return {"appended": appended, "rows_seen": len(rows)}


def append_label_entry(
    *,
    text: str,
    parser_intent: str,
    reviewer_intent: str,
    labeled_path: Path,
    dedupe: bool = True,
) -> dict:
    text_value = (text or "").strip()
    if not text_value:
        raise ValueError("Text is required for labeling.")
    config = load_intent_config()
    known_intents = set(config.names())
    if reviewer_intent not in known_intents:
        raise ValueError(f"Unknown reviewer intent '{reviewer_intent}'.")
    if parser_intent not in known_intents:
        parser_intent = "nlu_fallback"

    text_hash = hash_text(text_value)
    if dedupe and labeled_path.exists():
        lookup = load_label_lookup(labeled_path)
        if text_hash in lookup:
            return {"appended": 0, "duplicate": True}

    labeled_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "text": text_value,
        "parser_intent": parser_intent,
        "reviewer_intent": reviewer_intent,
    }
    with labeled_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False))
        handle.write("\n")

    return {"appended": 1, "duplicate": False, "record": payload}


def review_classifier_predictions(
    *,
    turn_log: Path,
    labeled_path: Path,
    intent: Optional[str],
    limit: int,
) -> List[dict]:
    findings: List[dict] = []
    label_lookup = load_label_lookup(labeled_path) if labeled_path.exists() else {}

    for record in iter_jsonl(turn_log):
        extras = record.get("extras") or {}
        if extras.get("invocation_source") != "classifier":
            continue
        classifier_intent = extras.get("classifier_intent") or record.get("intent")
        if intent and classifier_intent != intent:
            continue
        text_hash = hash_text(record.get("user_text") or "")
        reviewer_intent = label_lookup.get(text_hash)
        tool_success = record.get("tool_success")
        resolution_status = record.get("resolution_status")
        mismatch = reviewer_intent is not None and reviewer_intent != classifier_intent
        tool_failure = tool_success is False or (
            isinstance(resolution_status, str) and resolution_status.startswith("tool_error")
        )
        if mismatch or tool_failure:
            findings.append(
                {
                    "timestamp": record.get("timestamp"),
                    "user_text": record.get("user_text"),
                    "classifier_intent": classifier_intent,
                    "classifier_confidence": extras.get("classifier_confidence"),
                    "reviewer_intent": reviewer_intent,
                    "tool_success": tool_success,
                    "resolution_status": resolution_status,
                }
            )
        if len(findings) >= limit:
            break
    return findings


def list_recent_records(
    path: Path,
    *,
    limit: int,
    reverse: bool = True,
    predicate: Optional[Callable[[dict], bool]] = None,
) -> List[dict]:
    rows = list(iter_jsonl(path))
    if predicate:
        rows = [row for row in rows if predicate(row)]
    if reverse:
        rows = rows[-limit:]
    else:
        rows = rows[:limit]
    return rows


def load_labeled_prompts(path: Path, *, limit: int, intent: Optional[str] = None) -> List[dict]:
    def _predicate(record: dict) -> bool:
        if not intent:
            return True
        return record.get("reviewer_intent") == intent or record.get("parser_intent") == intent

    rows = list_recent_records(path, limit=limit, predicate=_predicate)
    return rows


def summarize_pending_queue(path: Path) -> dict:
    total = 0
    by_intent: Dict[str, int] = {}
    for record in iter_pending_prompts(path):
        total += 1
        intent = record.get("intent") or "nlu_fallback"
        by_intent[intent] = by_intent.get(intent, 0) + 1
    return {"total": total, "by_intent": by_intent}


def list_pending_with_hashes(path: Path, *, limit: int) -> List[dict]:
    rows = review_pending_prompts(path, limit)
    enriched: List[dict] = []
    for row in rows:
        text = row.get("user_text") or ""
        enriched.append({**row, "text_hash": hash_text(text)})
    return enriched


def count_jsonl_rows(path: Path) -> int:
    return sum(1 for _ in iter_jsonl(path))
