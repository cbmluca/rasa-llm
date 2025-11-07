"""Admin helpers for reviewing and labeling prompts for Tier-4 training."""

from __future__ import annotations

import argparse
from pathlib import Path

from app.config import get_labeled_queue_path, get_review_queue_path
from core.data_views import (
    append_labels,
    export_pending,
    review_classifier_predictions,
    review_pending_prompts,
)

PENDING_PATH = get_review_queue_path()
LABELED_PATH = get_labeled_queue_path()


def main() -> None:
    parser = argparse.ArgumentParser(description="Tier-4 admin helpers")
    sub = parser.add_subparsers(dest="command", required=True)

    review_parser = sub.add_parser("review-pending", help="Print the latest pending review prompts.")
    review_parser.add_argument("--path", type=Path, default=PENDING_PATH)
    review_parser.add_argument("--limit", type=int, default=10)

    export_parser = sub.add_parser("export-prompts", help="Export pending prompts grouped by intent.")
    export_parser.add_argument("--path", type=Path, default=PENDING_PATH)
    export_parser.add_argument("--output-dir", type=Path, default=Path("data_pipeline/nlu_training_bucket/exports"))
    export_parser.add_argument("--format", choices=("csv", "json"), default="csv")
    export_parser.add_argument("--dedupe", action="store_true", help="Skip duplicate prompts (hash on normalized text).")

    label_parser = sub.add_parser("import-labels", help="Append reviewer labels into labeled_prompts.jsonl.")
    label_parser.add_argument("--input", type=Path, required=True)
    label_parser.add_argument("--format", choices=("csv", "json"), default="csv")
    label_parser.add_argument("--output", type=Path, default=LABELED_PATH)
    label_parser.add_argument("--dedupe", action="store_true", help="Skip entries whose normalized text already exists.")

    review_classifier_parser = sub.add_parser("review-classifier", help="List classifier-driven turns that need attention.")
    review_classifier_parser.add_argument("--turn-log", type=Path, default=Path("logs/turns.jsonl"))
    review_classifier_parser.add_argument("--labeled-path", type=Path, default=LABELED_PATH)
    review_classifier_parser.add_argument("--intent", type=str, default=None)
    review_classifier_parser.add_argument("--limit", type=int, default=20)

    args = parser.parse_args()
    if args.command == "review-pending":
        entries = review_pending_prompts(args.path, args.limit)
        for entry in entries:
            print(f"[{entry.get('intent')}] {entry.get('user_text')}")
    elif args.command == "export-prompts":
        summary = export_pending(pending_path=args.path, output_dir=args.output_dir, fmt=args.format, dedupe=args.dedupe)
        intents_summary = ", ".join(f"{intent}:{count}" for intent, count in summary["intents"].items())
        print(f"Exported {summary['total']} prompts ({intents_summary}) to {args.output_dir}")
    elif args.command == "import-labels":
        outcome = append_labels(input_path=args.input, fmt=args.format, labeled_path=args.output, dedupe=args.dedupe)
        print(f"Appended {outcome['appended']} labeled rows (from {outcome['rows_seen']} input rows) into {args.output}")
    elif args.command == "review-classifier":
        findings = review_classifier_predictions(
            turn_log=args.turn_log,
            labeled_path=args.labeled_path,
            intent=args.intent,
            limit=args.limit,
        )
        if not findings:
            print("No classifier issues matched the requested filters.")
        else:
            for entry in findings:
                reviewer = entry.get("reviewer_intent") or "unknown"
                success = "ok" if entry.get("tool_success") else "error"
                print(
                    f"[{entry['timestamp']}] {entry['user_text']} "
                    f"(clf={entry['classifier_intent']}@{entry.get('classifier_confidence')}, reviewer={reviewer}, tool={success})"
                )
    else:  # pragma: no cover - safeguarded by argparse
        parser.error("Unknown command")


if __name__ == "__main__":
    main()
