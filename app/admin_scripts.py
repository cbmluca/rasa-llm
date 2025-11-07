"""Lightweight admin helpers for reviewing logged prompts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Iterator


def iter_pending_prompts(path: Path) -> Iterator[dict]:
    if not path.exists():
        return iter(())
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def review_pending_prompts(path: Path, limit: int = 10) -> list[dict]:
    """Return the latest `limit` pending prompts for manual review."""

    entries = list(iter_pending_prompts(path))
    return entries[-limit:]


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Review pending NLU prompts")
    parser.add_argument("--path", type=Path, default=Path("data_pipeline/nlu_training_bucket/pending.jsonl"))
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()

    for entry in review_pending_prompts(args.path, args.limit):
        print(f"[{entry.get('intent')}] {entry.get('user_text')}")
