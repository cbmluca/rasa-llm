"""Offer deterministic command parsing for Tier-1 NLU before involving the LLM stack.

The Tier-1 assistant now funnels every utterance through ``core.command_parser``
so weather, news, todo, kitchen, and calendar requests all share the same
deterministic extraction path before the LLM router is considered.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict

from core.command_parser import parse_command


@dataclass
class NLUResult:
    intent: str
    confidence: float
    entities: Dict[str, Any] = field(default_factory=dict)


class NLUService:
    """Minimal deterministic NLU used for Tier 1 orchestration."""

    def __init__(self, threshold: float) -> None:
        self._threshold = threshold

    def parse(self, message: str) -> NLUResult:
        original = message or ""
        if not original.strip():
            return NLUResult(intent="nlu_fallback", confidence=0.0)

        command = parse_command(original)
        if command:
            return NLUResult(
                intent=command.tool,
                confidence=command.confidence,
                entities=command.payload,
            )

        return NLUResult(intent="nlu_fallback", confidence=0.4)

    def is_confident(self, result: NLUResult) -> bool:
        return result.confidence >= self._threshold

    def build_payload(self, result: NLUResult, message: str) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"intent": result.intent, "message": message}
        payload.update(result.entities or {})
        return payload

    def build_metadata(self, result: NLUResult) -> Dict[str, Any]:
        tool_domains = {
            "weather": "weather",
            "news": "news",
            "todo_list": "todo",
            "kitchen_tips": "kitchen",
            "calendar_edit": "calendar",
        }
        domain = tool_domains.get(result.intent) or result.entities.get("domain") or "general"

        metadata: Dict[str, Any] = {"domain": domain}
        if result.intent == "weather" and "time" in result.entities:
            metadata["contains_time_hint"] = True
        if result.intent == "news" and result.entities.get("topic"):
            metadata["topic"] = result.entities["topic"]

        metadata["requires_tool"] = result.intent != "nlu_fallback"
        return metadata


__all__ = ["NLUResult", "NLUService"]
