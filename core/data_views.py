"""Shared helpers for reading JSONL logs and admin data stores."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional, Sequence
from uuid import uuid4

from core.intent_config import load_intent_config
from core.parser_payloads import normalize_parser_payload
from core.text_utils import hash_text, normalize_text


def iter_jsonl(path: Path) -> Iterator[dict]:
    """WHAT: stream JSONL rows, WHY: avoid loading entire files, HOW: tolerant parse."""

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


def iter_pending_prompts(path: Path) -> Iterator[dict]:
    """Alias iter_jsonl for clarity when iterating pending queue files."""
    return iter_jsonl(path)


def review_pending_prompts(path: Path, limit: int = 10, page: int = 1) -> list[dict]:
    """Load a page of pending prompts newest-first for reporting/export."""
    entries = list(iter_pending_prompts(path))
    total = len(entries)
    if total == 0 or limit <= 0:
        return []
    page = max(page, 1)
    end = total - (page - 1) * limit
    if end <= 0:
        return []
    start = max(end - limit, 0)
    window = entries[start:end]
    return list(reversed(window))


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
    """Export pending prompts grouped by intent as CSV/JSON for audits."""
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
    """Parse labeled data files regardless of csv/json format."""
    if fmt == "csv":
        with path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            return [dict(row) for row in reader]
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, list):
        return data
    raise ValueError("Label import expects a list of objects.")


def normalize_intended_entities(values: Optional[Sequence[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Deduplicate/prettify intended entity annotations before persistence."""

    normalized: List[Dict[str, Any]] = []
    if not values:
        return normalized
    for entry in values:
        if not isinstance(entry, dict):
            continue
        title = str(entry.get("title") or entry.get("label") or "").strip()
        identifier = str(entry.get("id") or entry.get("value") or "").strip()
        if not title:
            continue
        item: Dict[str, Any] = {"title": title}
        if identifier:
            item["id"] = identifier
        normalized.append(item)
    return normalized


def load_label_lookup(path: Path) -> Dict[str, Dict[str, Optional[str]]]:
    """Build hash->label mappings to dedupe classifier review entries."""
    lookup: Dict[str, Dict[str, Optional[str]]] = {}
    for record in iter_jsonl(path):
        text = record.get("text")
        reviewer = record.get("reviewer_intent")
        if not text or not reviewer:
            continue
        lookup[hash_text(text)] = {
            "intent": reviewer,
            "action": record.get("reviewer_action") or None,
        }
    return lookup


def append_labels(
    *,
    input_path: Path,
    fmt: str,
    labeled_path: Path,
    dedupe: bool,
) -> dict:
    """Append reviewer labels from imported CSV/JSON files."""
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
            reviewer_action = row.get("reviewer_action") or row.get("action")
            if not text or not reviewer_intent:
                continue
            if reviewer_intent not in known_intents:
                continue
            if parser_intent not in known_intents:
                parser_intent = "nlu_fallback"
            reviewer_action = _normalize_reviewer_action(parser_intent, reviewer_action, config)
            text_hash = hash_text(text)
            if dedupe and text_hash in existing_hashes:
                continue
            payload = {
                "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                "text": text,
                "parser_intent": parser_intent,
                "reviewer_intent": reviewer_intent,
                "reviewer_action": reviewer_action,
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
    reviewer_action: Optional[str] = None,
) -> dict:
    """Append a single labeled prompt entry (used by automated scripts)."""
    text_value = (text or "").strip()
    if not text_value:
        raise ValueError("Text is required for labeling.")
    config = load_intent_config()
    known_intents = set(config.names())
    if reviewer_intent not in known_intents:
        raise ValueError(f"Unknown reviewer intent '{reviewer_intent}'.")
    if parser_intent not in known_intents:
        parser_intent = "nlu_fallback"

    reviewer_action = _normalize_reviewer_action(parser_intent, reviewer_action, config)

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
        "reviewer_action": reviewer_action,
    }
    with labeled_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False))
        handle.write("\n")

    return {"appended": 1, "duplicate": False, "record": payload}


def append_correction_entry(
    *,
    prompt_id: str,
    prompt_text: str,
    tool: str,
    parser_intent: str,
    reviewer_intent: str,
    corrected_path: Path,
    reviewer_action: Optional[str] = None,
    predicted_payload: Optional[Dict[str, Any]] = None,
    corrected_payload: Optional[Dict[str, Any]] = None,
    updated_stores: Optional[List[str]] = None,
) -> dict:
    """Persist a reviewer correction with versioned history."""
    identifier = (prompt_id or "").strip() or hash_text(prompt_text or "")
    if not identifier:
        identifier = uuid4().hex

    normalized_predicted = normalize_parser_payload(dict(predicted_payload or {}))
    normalized_corrected = normalize_parser_payload(dict(corrected_payload or {}))
    if "intended_entities" in normalized_predicted:
        normalized_predicted["intended_entities"] = normalize_intended_entities(
            normalized_predicted.get("intended_entities")
        )
    if "intended_entities" in normalized_corrected:
        normalized_corrected["intended_entities"] = normalize_intended_entities(
            normalized_corrected.get("intended_entities")
        )

    if parser_intent and "intent" not in normalized_predicted:
        normalized_predicted["intent"] = parser_intent
    if reviewer_intent and "intent" not in normalized_corrected:
        normalized_corrected["intent"] = reviewer_intent
    if reviewer_action and "action" not in normalized_corrected:
        normalized_corrected["action"] = reviewer_action

    version = 1
    if corrected_path.exists():
        for row in iter_jsonl(corrected_path):
            if row.get("id") != identifier:
                continue
            try:
                version = max(version, int(row.get("version", 0)) + 1)
            except (TypeError, ValueError):
                version = max(version, 2)

    record = {
        "correction_id": uuid4().hex,
        "version": version,
        "id": identifier,
        "prompt_text": prompt_text,
        "tool": tool,
        "parser_intent": parser_intent,
        "reviewer_intent": reviewer_intent,
        "reviewer_action": reviewer_action,
        "predicted_payload": normalized_predicted,
        "corrected_payload": normalized_corrected,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "updated_stores": list(updated_stores or []),
    }
    corrected_path.parent.mkdir(parents=True, exist_ok=True)
    with corrected_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False))
        handle.write("\n")
    return record


def rehydrate_labeled_prompts(
    *,
    labeled_path: Path,
    pending_path: Path,
) -> dict:
    """Move legacy labeled prompts back into the pending queue."""
    if not labeled_path.exists():
        return {"migrated": 0}
    legacy_entries = list(iter_jsonl(labeled_path))
    if not legacy_entries:
        return {"migrated": 0}

    existing_hashes = {
        hash_text(entry.get("user_text") or "")
        for entry in iter_jsonl(pending_path)
        if entry.get("user_text")
    }
    migrated = 0
    pending_path.parent.mkdir(parents=True, exist_ok=True)
    with pending_path.open("a", encoding="utf-8") as handle:
        for entry in legacy_entries:
            text = (entry.get("text") or "").strip()
            if not text:
                continue
            text_hash = hash_text(text)
            if text_hash and text_hash in existing_hashes:
                continue
            parser_intent = entry.get("parser_intent") or entry.get("reviewer_intent") or "nlu_fallback"
            reviewer_action = entry.get("reviewer_action")
            parser_payload = {"intent": parser_intent}
            if reviewer_action:
                parser_payload["action"] = reviewer_action
            payload = {
                "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                "user_text": text,
                "intent": parser_intent,
                "confidence": 0.4,
                "reason": "migration_pending",
                "tool_name": None,
                "metadata": {"source": "labeled_prompts_migration"},
                "extras": {"domain": "general"},
                "parser_payload": parser_payload,
                "predicted_payload": dict(parser_payload),
                "prompt_id": text_hash or uuid4().hex,
                "text_hash": text_hash,
            }
            handle.write(json.dumps(payload, ensure_ascii=False))
            handle.write("\n")
            migrated += 1
            if text_hash:
                existing_hashes.add(text_hash)
    if migrated:
        labeled_path.write_text("", encoding="utf-8")
    return {"migrated": migrated}


def delete_pending_entry(pending_path: Path, prompt_id: str) -> bool:
    """Remove a pending intent by id or text hash."""
    if not prompt_id or not pending_path.exists():
        return False
    prompt_key = prompt_id.strip().lower()
    rows = list(iter_jsonl(pending_path))
    if not rows:
        return False
    remaining: List[dict] = []
    deleted = False
    for row in rows:
        row_prompt = str(row.get("prompt_id") or "").strip().lower()
        row_hash = hash_text(row.get("user_text") or "")
        if prompt_key and prompt_key in {row_prompt, row_hash}:
            deleted = True
            continue
        remaining.append(row)
    if not deleted:
        return False
    pending_path.parent.mkdir(parents=True, exist_ok=True)
    with pending_path.open("w", encoding="utf-8") as handle:
        for row in remaining:
            handle.write(json.dumps(row, ensure_ascii=False))
            handle.write("\n")
    if not remaining:
        pending_path.write_text("", encoding="utf-8")
    return True


def get_pending_entry(pending_path: Path, prompt_id: str) -> Optional[dict]:
    """Return the pending record matching ``prompt_id`` or its text hash."""
    if not prompt_id or not pending_path.exists():
        return None
    prompt_key = prompt_id.strip().lower()
    for row in iter_jsonl(pending_path):
        row_prompt = str(row.get("prompt_id") or "").strip().lower()
        row_hash = hash_text(row.get("user_text") or "")
        if prompt_key and prompt_key in {row_prompt, row_hash}:
            return row
    return None


def dedupe_pending_prompts(pending_path: Path) -> dict:
    if not pending_path.exists():
        return {"deduped": 0}
    rows = list(iter_jsonl(pending_path))
    seen_hashes: set[str] = set()
    deduped: List[dict] = []
    dropped = 0
    for row in rows:
        text_hash = row.get("text_hash") or hash_text(row.get("user_text") or "")
        if text_hash and text_hash in seen_hashes:
            dropped += 1
            continue
        if text_hash:
            seen_hashes.add(text_hash)
        deduped.append(row)
    if dropped == 0:
        return {"deduped": 0}
    pending_path.parent.mkdir(parents=True, exist_ok=True)
    with pending_path.open("w", encoding="utf-8") as handle:
        for row in deduped:
            handle.write(json.dumps(row, ensure_ascii=False))
            handle.write("\n")
    return {"deduped": dropped}


def append_pending_prompt(
    *,
    pending_path: Path,
    message: str,
    intent: str,
    parser_payload: Optional[Dict[str, Any]] = None,
    confidence: float = 0.0,
    reason: str = "chat_submission",
    extras: Optional[Dict[str, Any]] = None,
    tool_name: Optional[str] = None,
    staged: bool = False,
    related_prompts: Optional[List[str]] = None,
    conversation_entry_id: Optional[str] = None,
    field_versions: Optional[Dict[str, str]] = None,
    intended_entities: Optional[Sequence[Dict[str, Any]]] = None,
) -> dict:
    text_value = (message or "").strip()
    if not text_value:
        return {"appended": False, "skipped": True}

    normalized_intent = intent or "nlu_fallback"
    prompt_hash = hash_text(text_value)
    identifier = uuid4().hex
    normalized_payload = normalize_parser_payload(parser_payload or {})
    normalized_versions = dict(field_versions or {})
    if not normalized_versions:
        for key in normalized_payload.keys():
            if key not in {"intent"}:
                normalized_versions[key] = "system"

    existing_ids: set[str] = set()
    existing_hashes: set[str] = set()
    if pending_path.exists():
        for row in iter_jsonl(pending_path):
            prompt_id = str(row.get("prompt_id") or "").strip().lower()
            if prompt_id:
                existing_ids.add(prompt_id)
            text_hash = hash_text(row.get("user_text") or "")
            if text_hash:
                existing_hashes.add(text_hash)

    if prompt_hash and prompt_hash in existing_hashes:
        return {"appended": False, "duplicate": True}

    extras_payload = extras if isinstance(extras, dict) else {}

    prompts_payload = [prompt.strip() for prompt in related_prompts or [] if isinstance(prompt, str) and prompt.strip()]
    if text_value and text_value not in prompts_payload:
        prompts_payload.append(text_value)

    record = {
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "user_text": text_value,
        "intent": normalized_intent,
        "confidence": confidence,
        "reason": reason,
        "tool_name": tool_name,
        "metadata": {"source": "chat_console"},
        "extras": extras_payload,
        "parser_payload": normalized_payload,
        "predicted_payload": dict(normalized_payload),
        "prompt_id": identifier,
        "text_hash": prompt_hash,
        "staged": bool(staged),
        "related_prompts": prompts_payload,
        "conversation_entry_id": conversation_entry_id,
        "field_versions": normalized_versions,
        "intended_entities": normalize_intended_entities(intended_entities),
    }
    pending_path.parent.mkdir(parents=True, exist_ok=True)
    with pending_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False))
        handle.write("\n")
    return {"appended": True, "record": record}


def review_classifier_predictions(
    *,
    turn_log: Path,
    labeled_path: Path,
    intent: Optional[str],
    limit: int,
) -> List[dict]:
    """Surface classifier turns that were overridden or failed."""
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
        reviewer_entry = label_lookup.get(text_hash) or {}
        reviewer_intent = reviewer_entry.get("intent")
        reviewer_action = reviewer_entry.get("action")
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
                    "reviewer_action": reviewer_action,
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
    """Read the last N JSONL rows with optional filtering."""
    rows = list(iter_jsonl(path))
    if predicate:
        rows = [row for row in rows if predicate(row)]
    if reverse:
        rows = rows[-limit:]
    else:
        rows = rows[:limit]
    return rows


def load_labeled_prompts(path: Path, *, limit: int, intent: Optional[str] = None) -> List[dict]:
    """Return recent labeled entries for the Training view."""
    def _predicate(record: dict) -> bool:
        if not intent:
            return True
        return record.get("reviewer_intent") == intent or record.get("parser_intent") == intent

    rows = list_recent_records(path, limit=limit, predicate=_predicate)
    return rows


def summarize_pending_queue(path: Path) -> dict:
    """Compute total pending prompts and a per-intent breakdown."""
    total = 0
    by_intent: Dict[str, int] = {}
    for record in iter_pending_prompts(path):
        total += 1
        intent = record.get("intent") or "nlu_fallback"
        by_intent[intent] = by_intent.get(intent, 0) + 1
    return {"total": total, "by_intent": by_intent}


def list_pending_with_hashes(path: Path, *, limit: int, page: int = 1) -> List[dict]:
    """Paginate pending entries while ensuring they have prompt ids + hashes."""
    rows = review_pending_prompts(path, limit, page)
    enriched: List[dict] = []
    for row in rows:
        text = row.get("user_text") or ""
        prompt_id = row.get("prompt_id")
        if not prompt_id:
            prompt_id = hash_text(text) or uuid4().hex
        parser_payload = row.get("parser_payload") or {}
        normalized_payload = normalize_parser_payload(parser_payload)
        related_prompts = row.get("related_prompts") or ([text] if text else [])
        field_versions = row.get("field_versions") or {}
        enriched.append(
            {
                **row,
                "text_hash": hash_text(text),
                "prompt_id": prompt_id,
                "parser_payload": normalized_payload,
                "related_prompts": related_prompts,
                "field_versions": field_versions,
                "intended_entities": normalize_intended_entities(row.get("intended_entities")),
            }
        )
    return enriched


def list_recent_pending(path: Path, *, limit: int) -> List[dict]:
    return list_pending_with_hashes(path, limit=limit, page=1)


def load_corrected_prompts(
    path: Path,
    *,
    limit: int,
    page: int = 1,
    intent: Optional[str] = None,
) -> dict:
    """Paginate corrected prompts for the Labeled Prompt Pairs table."""
    records = list(iter_jsonl(path))
    if intent:
        records = [
            record
            for record in records
            if record.get("reviewer_intent") == intent
            or record.get("parser_intent") == intent
            or record.get("tool") == intent
        ]
    records.sort(key=lambda row: row.get("timestamp") or "", reverse=True)
    total = len(records)
    if limit <= 0:
        limit = 1
    page = max(page, 1)
    start = (page - 1) * limit
    end = start + limit
    items = records[start:end]
    has_more = end < total
    return {"items": items, "total": total, "page": page, "limit": limit, "has_more": has_more}


def count_jsonl_rows(path: Path) -> int:
    """Return number of rows in a JSONL file (used for stats cards)."""
    return sum(1 for _ in iter_jsonl(path))


def _normalize_reviewer_action(parser_intent: str, reviewer_action: Optional[str], config) -> Optional[str]:
    action_value = (reviewer_action or "").strip()
    valid_actions = set(config.actions_for(parser_intent))
    if not action_value:
        return None
    if valid_actions and action_value not in valid_actions:
        raise ValueError(f"Action '{action_value}' is not allowed for intent '{parser_intent}'.")
    return action_value
