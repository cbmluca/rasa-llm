"""Evaluation harness for Tier-5/6 prompt understanding."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional

try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover - PyYAML optional
    yaml = None  # type: ignore

from app.main import build_orchestrator
from app.prompt_templates import generate_prompts, PromptTemplate

REPORT_PATH = Path("reports/eval_results.json")
STATE_PATH = Path("reports/eval_state.json")
DEFAULT_LABELED_PATH = Path("data_pipeline/nlu_training_bucket/labeled_prompts.jsonl")


@dataclass
class EvalCase:
    prompt: str
    expected_intent: str
    expected_action: Optional[str] = None


def load_cases(path: Optional[Path]) -> List[EvalCase]:
    if not path or not path.exists():
        return []
    raw = path.read_text(encoding="utf-8")
    data: dict
    if yaml is not None:
        data = yaml.safe_load(raw)
        if not isinstance(data, dict):
            raise ValueError("Eval config must be a mapping.")
    else:
        data = json.loads(raw)
    prompts = data.get("prompts")
    if not isinstance(prompts, list):
        raise ValueError("Eval config requires a 'prompts' list.")
    cases: List[EvalCase] = []
    for entry in prompts:
        if not isinstance(entry, dict):
            continue
        prompt = entry.get("prompt")
        expected_intent = entry.get("expected_intent")
        if not prompt or not expected_intent:
            continue
        cases.append(
            EvalCase(
                prompt=prompt,
                expected_intent=expected_intent,
                expected_action=entry.get("expected_action"),
            )
        )
    return cases


def extract_action(response) -> Optional[str]:
    if response.tool_payload and isinstance(response.tool_payload, dict):
        action = response.tool_payload.get("action")
        if isinstance(action, str) and action:
            return action
    if response.tool_result and isinstance(response.tool_result, dict):
        action = response.tool_result.get("action")
        if isinstance(action, str) and action:
            return action
    return None


def evaluate_cases(orchestrator, cases: Iterable[EvalCase]) -> dict:
    total = 0
    intent_hits = 0
    action_hits = 0
    mismatches: List[dict] = []
    for case in cases:
        total += 1
        response = orchestrator.handle_message_with_details(case.prompt)
        predicted_intent = response.nlu_result.intent
        predicted_action = extract_action(response)
        intent_ok = predicted_intent == case.expected_intent
        action_ok = True
        if case.expected_action is not None:
            action_ok = predicted_action == case.expected_action
        if intent_ok:
            intent_hits += 1
        if action_ok:
            action_hits += 1
        if not (intent_ok and action_ok):
            mismatches.append(
                {
                    "prompt": case.prompt,
                    "expected_intent": case.expected_intent,
                    "predicted_intent": predicted_intent,
                    "expected_action": case.expected_action,
                    "predicted_action": predicted_action,
                }
            )
    return {
        "total": total,
        "intent_accuracy": intent_hits / total if total else 0.0,
        "action_accuracy": action_hits / total if total else 0.0,
        "mismatches": mismatches,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Tier-5 eval suite")
    parser.add_argument("--config", type=Path, default=Path("config/eval_prompts.yml"))
    parser.add_argument("--include-synthetic", action="store_true", help="Add prompts generated from templates")
    parser.add_argument("--variations", type=int, default=2, help="Synthetic variations per template")
    parser.add_argument("--report", type=Path, default=REPORT_PATH)
    parser.add_argument("--state", type=Path, default=STATE_PATH, help="Path used to track previous runs")
    parser.add_argument("--labeled-path", type=Path, default=DEFAULT_LABELED_PATH, help="Labeled prompts path for auto trigger")
    parser.add_argument(
        "--auto-threshold",
        type=int,
        default=0,
        help="Only run when new labeled prompts since last run >= threshold",
    )
    args = parser.parse_args()

    cases = load_cases(args.config)
    if args.include_synthetic:
        synthetic = generate_prompts(variations=args.variations)
        cases.extend(EvalCase(prompt=item["prompt"], expected_intent=item["expected_intent"], expected_action=item["expected_action"]) for item in synthetic)

    if not cases:
        raise SystemExit("No evaluation prompts found. Provide --config or enable synthetic generation.")

    if args.auto_threshold > 0:
        if not args.labeled_path.exists():
            print(f"No labeled data at {args.labeled_path}; skipping auto eval.")
            return
        label_count = sum(1 for _ in args.labeled_path.open("r", encoding="utf-8"))
        previous = _load_state(args.state)
        last_count = previous.get("last_label_count", 0)
        if label_count - last_count < args.auto_threshold:
            print(
                f"Auto threshold not met (need {args.auto_threshold}, only {label_count - last_count}). Skipping eval."
            )
            return

    orchestrator = build_orchestrator()
    results = evaluate_cases(orchestrator, cases)

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(results, indent=2), encoding="utf-8")

    intent_pct = results["intent_accuracy"] * 100
    action_pct = results["action_accuracy"] * 100
    print(f"Evaluated {results['total']} prompts · intent accuracy {intent_pct:.1f}% · action accuracy {action_pct:.1f}%")
    if results["mismatches"]:
        print("Mismatches:")
        for entry in results["mismatches"][:10]:
            print(
                f"- {entry['prompt']} (expected {entry['expected_intent']}:{entry['expected_action']}, "
                f"got {entry['predicted_intent']}:{entry['predicted_action']})"
            )

    if args.auto_threshold > 0:
        label_count = sum(1 for _ in args.labeled_path.open("r", encoding="utf-8"))
        _save_state(args.state, last_label_count=label_count)


def _load_state(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _save_state(path: Path, **state: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    main()
