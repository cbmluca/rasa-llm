"""Shared text normalization utilities."""

from __future__ import annotations

import hashlib


def normalize_text(value: str) -> str:
    """Normalize whitespace/case for consistent hashing."""

    return " ".join((value or "").split()).strip().lower()


def hash_text(value: str) -> str:
    normalized = normalize_text(value)
    if not normalized:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


__all__ = ["normalize_text", "hash_text"]
