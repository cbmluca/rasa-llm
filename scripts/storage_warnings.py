#!/usr/bin/env python3
"""Warn when data store files grow beyond safe thresholds."""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_PIPELINE = REPO_ROOT / "data_pipeline"
VOICE_INBOX = DATA_PIPELINE / "voice_inbox.json"
NOTIFICATION_LIMIT_MB = 50
VOICE_WARNING_COUNT = 250


def _bytes_to_mb(value: int) -> float:
    return value / 1024 / 1024


def _total_data_size() -> int:
    total = 0
    for entry in DATA_PIPELINE.iterdir():
        if entry.is_file():
            try:
                total += entry.stat().st_size
            except OSError:
                continue
    return total


def _voice_count() -> int:
    if not VOICE_INBOX.exists():
        return 0
    try:
        payload = json.loads(VOICE_INBOX.read_text())
        if isinstance(payload, list):
            return len(payload)
    except (json.JSONDecodeError, OSError):
        return 0
    return 0


def main() -> int:
    warnings = []
    size_bytes = _total_data_size()
    size_mb = _bytes_to_mb(size_bytes)
    if size_mb > NOTIFICATION_LIMIT_MB:
        warnings.append(
            f"data_pipeline directory crosses {NOTIFICATION_LIMIT_MB}MB ({size_mb:.1f}MB). "
            "Consider pruning old logs/voice clips."
        )

    voices = _voice_count()
    if voices > VOICE_WARNING_COUNT:
        warnings.append(
            f"{voices} voice inbox entries detected (threshold {VOICE_WARNING_COUNT}). "
            "Review and archive exported clips."
        )

    if warnings:
        print("Storage warnings detected:")
        for warning in warnings:
            print(f"- {warning}")
        return 2

    print(
        f"Data size: {size_mb:.1f}MB, voice clips: {voices}; below thresholds."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
