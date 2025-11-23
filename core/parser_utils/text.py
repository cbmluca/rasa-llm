"""Common text-processing helpers shared across parser modules."""

from __future__ import annotations

import json
import re
from typing import List, Optional


def contains_keyword(text: str, keywords: set[str]) -> bool:
    """Return True when any keyword is present in ``text``."""

    return any(keyword in text for keyword in keywords)


def extract_after_keywords(message: str, keywords: List[str], terminators: Optional[List[str]] = None) -> Optional[str]:
    """Return text that follows any of the supplied keywords until a terminator."""
    terminators = terminators or [" end", " ending", " til", " until", " notes", " location", " link"]
    for keyword in keywords:
        pattern = re.compile(rf"{keyword}\s+(.+)", re.IGNORECASE)
        match = pattern.search(message)
        if not match:
            continue
        segment = match.group(1)
        lower_segment = segment.lower()
        cut_index = len(segment)
        for stopper in terminators:
            idx = lower_segment.find(stopper)
            if idx != -1:
                cut_index = min(cut_index, idx)
        segment = segment[:cut_index]
        for separator in (",", ";", "."):
            if separator in segment:
                segment = segment.split(separator)[0]
        return segment.strip().strip(' "')
    return None


def extract_json_array_after_keyword(message: str, keyword: str) -> Optional[List[str]]:
    """Parse a JSON array following ``keyword`` (used for tags/notes inputs)."""
    pattern = re.compile(rf"{keyword}\s*(\[[^\]]+\])", re.IGNORECASE)
    match = pattern.search(message)
    if not match:
        return None
    try:
        values = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    if isinstance(values, list):
        return [str(value).strip() for value in values if str(value).strip()]
    return None


__all__ = [
    "contains_keyword",
    "extract_after_keywords",
    "extract_json_array_after_keyword",
]
