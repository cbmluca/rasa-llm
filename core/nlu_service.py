"""Offer deterministic command parsing for Tier-1 NLU before involving the LLM stack.

The Tier-1 assistant now funnels every utterance through ``core.command_parser``
so weather, news, todo, kitchen, and calendar requests all share the same
deterministic extraction path before the LLM router is considered.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from core.command_parser import parse_command
from core.intent_classifier import ClassifierPrediction, IntentClassifier
from core.payload_builder import PayloadBuilder


@dataclass
class NLUResult:
    intent: str
    confidence: float
    entities: Dict[str, Any] = field(default_factory=dict)
    source: str = "parser"


class NLUService:
    """Minimal deterministic NLU used for Tier 1 orchestration."""

    def __init__(
        self,
        threshold: float,
        *,
        classifier: Optional[IntentClassifier] = None,
        classifier_threshold: float = 0.55,
        payload_builder: Optional[PayloadBuilder] = None,
    ) -> None:
        self._threshold = threshold
        self._classifier = classifier
        self._classifier_threshold = classifier_threshold
        self._payload_builder = payload_builder or PayloadBuilder()

    # WHAT: parse an utterance deterministically before involving ML/LLM fallbacks.
    # WHY: Tier‑1 should use the shared command parser whenever possible for predictable payloads.
    # HOW: call `parse_command`, otherwise defer to `_classify`, and finally fall back to `nlu_fallback`.
    def parse(self, message: str) -> NLUResult:
        """Primary entry point: try deterministic parsing before ML fallback."""
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

        classified = self._classify(original)
        if classified:
            return classified

        return NLUResult(intent="nlu_fallback", confidence=0.4)

    # WHAT: determine whether a parsed intent is confident enough to skip router escalation.
    # WHY: classifier-based intents use a different threshold than rule-based parsing.
    # HOW: compare the result’s confidence against either `_classifier_threshold` or `_threshold`.
    def is_confident(self, result: NLUResult) -> bool:
        """Gate router escalation by comparing confidences to the right threshold."""
        if result.source == "classifier":
            return result.confidence >= self._classifier_threshold
        return result.confidence >= self._threshold

    # WHAT: build the payload dict passed to tools for deterministic runs.
    # WHY: tools expect at least `intent` + `message` plus any parser entities.
    # HOW: start with intent/message and merge the `entities` captured by the parser/classifier.
    def build_payload(self, result: NLUResult, message: str) -> Dict[str, Any]:
        """Combine parser entities + raw text for tool execution."""
        payload: Dict[str, Any] = {"intent": result.intent, "message": message}
        payload.update(result.entities or {})
        return payload

    # WHAT: produce metadata describing the parsed intent for logging/analytics.
    # WHY: Tier‑5 dashboards filter by domain, classifier source, and other hints.
    # HOW: map intents to domains, include classifier confidence when applicable, and note tool requirements.
    def build_metadata(self, result: NLUResult) -> Dict[str, Any]:
        """Annotate turns with domains/sources so Tier‑5 can slice analytics."""
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

        if result.source == "classifier":
            metadata["invocation_source"] = "classifier"
            metadata["classifier_intent"] = result.intent
            metadata["classifier_confidence"] = result.confidence

        metadata["requires_tool"] = result.intent != "nlu_fallback"
        return metadata

    # WHAT: run the ML classifier when the deterministic parser returned nothing.
    # WHY: gives Tier‑1 another structured guess before sending the turn to the router.
    # HOW: call `IntentClassifier.predict`, enforce a minimum confidence, and optionally patch entities via `PayloadBuilder`.
    def _classify(self, message: str) -> Optional[NLUResult]:
        """Lazy-load classifier predictions when no rule fired."""
        if not self._classifier:
            return None
        prediction: Optional[ClassifierPrediction] = self._classifier.predict(message)
        if not prediction:
            return None
        if prediction.confidence < self._classifier_threshold:
            return None
        result = NLUResult(intent=prediction.intent, confidence=prediction.confidence, source="classifier")
        if self._payload_builder:
            repaired = self._payload_builder.build(prediction.intent, message)
            if repaired:
                result.entities.update(repaired)
        return result


__all__ = ["NLUResult", "NLUService"]
