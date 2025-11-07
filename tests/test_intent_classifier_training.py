import json
from pathlib import Path

import joblib

from app.train_intent_classifier import run_training_pipeline


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row))
            handle.write("\n")


def test_training_pipeline_trains_and_reports(tmp_path: Path) -> None:
    labeled = tmp_path / "labeled.jsonl"
    rows = [
        {"timestamp": "2024-01-01T00:00:00Z", "text": "weather in copenhagen", "parser_intent": "weather", "reviewer_intent": "weather"},
        {"timestamp": "2024-01-01T00:01:00Z", "text": "sunny forecast for aarhus", "parser_intent": "weather", "reviewer_intent": "weather"},
        {"timestamp": "2024-01-01T00:02:00Z", "text": "add buy milk to my todo list", "parser_intent": "todo_list", "reviewer_intent": "todo_list"},
        {"timestamp": "2024-01-01T00:03:00Z", "text": "schedule dentist appointment", "parser_intent": "todo_list", "reviewer_intent": "todo_list"},
    ]
    _write_jsonl(labeled, rows)
    model_path = tmp_path / "intent.pkl"
    report_path = tmp_path / "intent.json"

    result = run_training_pipeline(
        labeled_path=labeled,
        model_path=model_path,
        report_path=report_path,
        intent_config_path=Path("config/intents.yml"),
        test_size=0.5,
        min_class_samples=1,
        random_state=0,
    )

    assert model_path.exists()
    assert report_path.exists()
    assert result.metrics["data_count"] == 4
    assert "accuracy" in result.metrics

    model = joblib.load(model_path)
    prediction = model.predict(["remind me about the dentist visit"])[0]
    assert prediction in {"weather", "todo_list"}


def test_training_pipeline_flags_low_counts(tmp_path: Path) -> None:
    labeled = tmp_path / "few.jsonl"
    rows = [
        {"timestamp": "2024-01-01T00:00:00Z", "text": "rain in copenhagen", "parser_intent": "weather", "reviewer_intent": "weather"},
        {"timestamp": "2024-01-01T00:01:00Z", "text": "cloudy aarhus", "parser_intent": "weather", "reviewer_intent": "weather"},
        {"timestamp": "2024-01-01T00:02:00Z", "text": "sunny odense", "parser_intent": "weather", "reviewer_intent": "weather"},
        {"timestamp": "2024-01-01T00:03:00Z", "text": "news about sports", "parser_intent": "news", "reviewer_intent": "news"},
    ]
    _write_jsonl(labeled, rows)
    model_path = tmp_path / "intent.pkl"
    report_path = tmp_path / "intent.json"

    result = run_training_pipeline(
        labeled_path=labeled,
        model_path=model_path,
        report_path=report_path,
        intent_config_path=Path("config/intents.yml"),
        test_size=0.5,
        min_class_samples=3,
        random_state=0,
    )

    assert result.metrics["class_warnings"]["news"] == 1
    assert result.metrics["validation_mode"] in {"train_only", "train_test"}
