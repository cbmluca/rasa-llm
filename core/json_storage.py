"""Tier-3 helper utilities for JSON-based persistence.

The new tools introduced in Tier-3 share a simple file-backed storage pattern.
These helpers keep the atomic write logic in one place so future tiers can
swap the implementation without touching every tool.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, TypeVar

T = TypeVar("T")


def read_json(path: Path, default: T) -> T:
    """Return JSON content from ``path`` or ``default`` when the file is absent."""

    if not path.exists():
        return default
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return default
    if not raw.strip():
        return default
    return json.loads(raw)


def atomic_write_json(path: Path, payload: Any) -> None:
    """Persist ``payload`` to ``path`` atomically."""

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")
    os.replace(tmp_path, path)


__all__ = ["read_json", "atomic_write_json"]

