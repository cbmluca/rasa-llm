"""Train the Tier-4 intent classifier (Tfidf + LogisticRegression)."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Sequence

try:
    import joblib
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline
except Exception as exc:  # pragma: no cover - import guard
    raise RuntimeError("scikit-learn and joblib are required to train the classifier.") from exc

from core.intent_config import load_intent_config

DEFAULT_LABELED_PATH = Path("data_pipeline/nlu_training_bucket/labeled_prompts.jsonl")
DEFAULT_MODEL_PATH = Path("models/intent_classifier.pkl")
DEFAULT_REPORT_PATH = Path("reports/intent_classifier.json")


@dataclass
class TrainingResult:
    model_path: Path
    report_path: Path
    metrics: Dict[str, object]


def load_labeled_records(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"No labeled prompts found at {path}")
    records: list[dict] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if payload.get("text") and payload.get("reviewer_intent"):
                records.append(payload)
    if not records:
        raise ValueError(f"{path} did not contain any labeled prompts.")
    return records


def build_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
            ("clf", LogisticRegression(max_iter=1000)),
        ]
    )


def _split_data(
    texts: Sequence[str],
    labels: Sequence[str],
    *,
    test_size: float,
    random_state: int,
    class_counts: Counter,
) -> tuple[Sequence[str], Sequence[str], Sequence[str], Sequence[str], str]:
    if len(set(labels)) < 2 or min(class_counts.values()) < 2:
        return texts, texts, labels, labels, "train_only"
    try:
        return (
            *train_test_split(
                texts,
                labels,
                test_size=test_size,
                random_state=random_state,
                stratify=labels,
            ),
            "train_test",
        )
    except ValueError:
        return texts, texts, labels, labels, "train_only"


def _hash_records(records: Iterable[dict]) -> str:
    normalized = [
        {
            "text": record.get("text"),
            "parser_intent": record.get("parser_intent"),
            "reviewer_intent": record.get("reviewer_intent"),
        }
        for record in records
    ]
    payload = json.dumps(normalized, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def run_training_pipeline(
    *,
    labeled_path: Path = DEFAULT_LABELED_PATH,
    model_path: Path = DEFAULT_MODEL_PATH,
    report_path: Path = DEFAULT_REPORT_PATH,
    intent_config_path: Path | None = None,
    test_size: float = 0.2,
    random_state: int = 42,
    min_class_samples: int = 10,
) -> TrainingResult:
    intent_config = load_intent_config(intent_config_path) if intent_config_path else load_intent_config()
    known_intents = set(intent_config.names())

    records = load_labeled_records(labeled_path)
    texts = [entry["text"] for entry in records]
    labels = [entry["reviewer_intent"] for entry in records]

    unknown = sorted({label for label in labels if label not in known_intents})
    if unknown:
        raise ValueError(f"Found reviewer intents not present in config: {', '.join(unknown)}")

    class_counts = Counter(labels)
    X_train, X_val, y_train, y_val, validation_mode = _split_data(
        texts,
        labels,
        test_size=test_size,
        random_state=random_state,
        class_counts=class_counts,
    )

    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)
    predictions = pipeline.predict(X_val)
    accuracy = accuracy_score(y_val, predictions)
    macro_f1 = f1_score(y_val, predictions, average="macro")

    labels_sorted = sorted(class_counts.keys())
    matrix = confusion_matrix(y_val, predictions, labels=labels_sorted).tolist()

    data_hash = _hash_records(records)
    warnings = {intent: count for intent, count in class_counts.items() if count < min_class_samples}

    report = {
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "data_count": len(records),
        "data_hash": data_hash,
        "accuracy": accuracy,
        "macro_f1": macro_f1,
        "class_counts": class_counts,
        "class_warnings": warnings,
        "validation_mode": validation_mode,
        "min_class_samples": min_class_samples,
        "confusion_matrix": {"labels": labels_sorted, "matrix": matrix},
        "model_path": str(model_path),
        "test_size": test_size,
    }

    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, model_path)

    report_path.parent.mkdir(parents=True, exist_ok=True)
    with report_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)

    _maybe_warn(warnings)
    _print_summary(report)

    return TrainingResult(model_path=model_path, report_path=report_path, metrics=report)


def _maybe_warn(warnings: Dict[str, int]) -> None:
    if not warnings:
        return
    warning_lines = ", ".join(f"{intent}={count}" for intent, count in warnings.items())
    print(f"[warning] Low sample count for intents: {warning_lines}")


def _print_summary(report: Dict[str, object]) -> None:
    print(
        f"trained intent classifier on {report['data_count']} rows "
        f"(accuracy={report['accuracy']:.3f}, macro_f1={report['macro_f1']:.3f})"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the Tier-4 intent classifier.")
    parser.add_argument("--labeled-path", type=Path, default=DEFAULT_LABELED_PATH)
    parser.add_argument("--model-path", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--report-path", type=Path, default=DEFAULT_REPORT_PATH)
    parser.add_argument("--intent-config", type=Path, default=None)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--min-class-samples", type=int, default=10)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    run_training_pipeline(
        labeled_path=args.labeled_path,
        model_path=args.model_path,
        report_path=args.report_path,
        intent_config_path=args.intent_config,
        test_size=args.test_size,
        random_state=args.random_state,
        min_class_samples=args.min_class_samples,
    )


if __name__ == "__main__":
    main()
