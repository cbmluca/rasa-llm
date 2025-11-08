import csv
import json
from pathlib import Path

from app import admin_scripts as admin


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row))
            handle.write("\n")


def test_export_prompts_groups_and_dedup(tmp_path: Path) -> None:
    pending = tmp_path / "pending.jsonl"
    rows = [
        {"user_text": "Check weather in Copenhagen", "intent": "weather", "confidence": 0.9, "reason": "auto", "timestamp": "2024-01-01T00:00:00Z"},
        {"user_text": "check weather in copenhagen", "intent": "weather", "confidence": 0.8, "reason": "auto", "timestamp": "2024-01-01T00:01:00Z"},
        {"user_text": "Give me tech news", "intent": "news", "confidence": 0.85, "reason": "auto", "timestamp": "2024-01-01T00:02:00Z"},
    ]
    _write_jsonl(pending, rows)
    output_dir = tmp_path / "exports"

    summary = admin.export_pending(pending_path=pending, output_dir=output_dir, fmt="csv", dedupe=True)

    assert summary["total"] == 2
    weather_file = output_dir / "weather.csv"
    news_file = output_dir / "news.csv"
    assert weather_file.exists()
    assert news_file.exists()

    with weather_file.open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
    assert len(rows) == 1
    assert rows[0]["text_hash"]


def test_append_labels_and_dedupe(tmp_path: Path) -> None:
    labels_csv = tmp_path / "labels.csv"
    with labels_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["text", "parser_intent", "reviewer_intent", "reviewer_action"])
        writer.writeheader()
        writer.writerow({
            "text": "Check weather in Copenhagen",
            "parser_intent": "weather",
            "reviewer_intent": "weather",
            "reviewer_action": "",
        })
        writer.writerow({
            "text": "Give me tech news",
            "parser_intent": "news",
            "reviewer_intent": "news",
            "reviewer_action": "",
        })
        writer.writerow({
            "text": "check weather in copenhagen",
            "parser_intent": "weather",
            "reviewer_intent": "weather",
            "reviewer_action": "",
        })

    labeled_path = tmp_path / "labeled.jsonl"
    outcome = admin.append_labels(
        input_path=labels_csv,
        fmt="csv",
        labeled_path=labeled_path,
        dedupe=True,
    )

    assert outcome["appended"] == 2
    lines = labeled_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    records = [json.loads(line) for line in lines]
    assert {record["reviewer_intent"] for record in records} == {"weather", "news"}
    for record in records:
        assert "reviewer_action" in record


def test_review_classifier_predictions_flags_mismatches(tmp_path: Path) -> None:
    turn_log = tmp_path / "turns.jsonl"
    rows = [
        {
            "timestamp": "2024-01-01T00:00:00Z",
            "user_text": "Give me sports news",
            "intent": "news",
            "confidence": 0.9,
            "entities": {},
            "tool_success": True,
            "resolution_status": "tool:nlu",
            "extras": {"invocation_source": "classifier", "classifier_intent": "news", "classifier_confidence": 0.9},
        },
        {
            "timestamp": "2024-01-01T00:01:00Z",
            "user_text": "Remind me to buy milk",
            "intent": "todo_list",
            "confidence": 0.8,
            "entities": {},
            "tool_success": False,
            "resolution_status": "tool_error",
            "extras": {"invocation_source": "classifier", "classifier_intent": "todo_list", "classifier_confidence": 0.8},
        },
    ]
    _write_jsonl(turn_log, rows)

    labeled = tmp_path / "labeled.jsonl"
    labeled_rows = [
        {"timestamp": "2024-01-01T00:10:00Z", "text": "Give me sports news", "parser_intent": "news", "reviewer_intent": "weather"},
    ]
    _write_jsonl(labeled, labeled_rows)

    findings = admin.review_classifier_predictions(
        turn_log=turn_log,
        labeled_path=labeled,
        intent=None,
        limit=10,
    )

    assert len(findings) == 2
    intents = {entry["classifier_intent"] for entry in findings}
    assert intents == {"news", "todo_list"}
