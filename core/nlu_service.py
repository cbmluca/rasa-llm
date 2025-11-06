"""Offer fast heuristics for Tier-1 NLU before involving the LLM stack.

The Tier-1 assistant keeps latency low by checking for obvious intents using
keyword sets. This module houses those heuristics plus the confidence gate that
protects downstream components from noisy matches.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass
class NLUResult:
    intent: str
    confidence: float


class NLUService:
    """Minimal rule-based NLU used for Tier 1 orchestration."""

    WEATHER_KEYWORDS = {"weather", "temperature", "forecast"}
    NEWS_KEYWORDS = {"news", "headline", "stories"}

    def __init__(self, threshold: float) -> None:
        self._threshold = threshold

    # --- Keyword scan: cheap signals that prevent unnecessary LLM calls
    def parse(self, message: str) -> NLUResult:
        text = message.lower().strip()
        if not text:
            return NLUResult(intent="nlu_fallback", confidence=0.0)

        if any(keyword in text for keyword in self.WEATHER_KEYWORDS):
            return NLUResult(intent="ask_weather", confidence=0.9)
        if any(keyword in text for keyword in self.NEWS_KEYWORDS):
            return NLUResult(intent="get_news", confidence=0.85)

        return NLUResult(intent="nlu_fallback", confidence=0.4)

    # --- Confidence gate: only surface deterministic matches to the orchestrator
    def is_confident(self, result: NLUResult) -> bool:
        return result.confidence >= self._threshold

    @staticmethod
        # --- Payload helper: allow Tier-1 to forward structured info downstream
    def build_payload(intent: str, message: str) -> Dict[str, str]:
        return {"intent": intent, "message": message}