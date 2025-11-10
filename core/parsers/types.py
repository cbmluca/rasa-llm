"""Shared dataclasses for parser outputs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass
class CommandResult:
    tool: str
    payload: Dict[str, object]
    confidence: float = 0.95


__all__ = ["CommandResult"]
