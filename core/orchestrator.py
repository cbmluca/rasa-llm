"""Coordinate Tier-1 assistant steps between NLU, tools, and the router.

The orchestrator is the entry point for Tier-1 requests: it first leans on
rule-based NLU for high-confidence auto-resolution and only escalates to the
LLM router when a deterministic answer is not possible. This module therefore
encapsulates the decision funnel for when to stay within the guard rails versus
calling the language model.
"""

from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Any, Dict, Optional

from core.learning_logger import LearningLogger, ReviewItem, TurnRecord
from core.llm_router import LLMRouter
from core.nlu_service import NLUResult, NLUService
from core.tool_registry import ToolRegistry
from tools.calendar_edit import format_calendar_response
from tools.kitchen_tips import format_kitchen_tips_response
from tools.news_tool import format_news_list
from tools.todo_list_tool import format_todo_response
from tools.app_guide_tool import format_app_guide_response
from tools.weather_tool import format_weather_response


_FORMATTERS = {
    "weather": format_weather_response,
    "news": format_news_list,
    "todo_list": format_todo_response,
    "kitchen_tips": format_kitchen_tips_response,
    "calendar_edit": format_calendar_response,
    "app_guide": format_app_guide_response,
}

_TOOL_DOMAINS = {
    "weather": "weather",
    "news": "news",
    "todo_list": "todo",
    "kitchen_tips": "kitchen",
    "calendar_edit": "calendar",
    "app_guide": "knowledge",
}


@dataclass
class OrchestratorResponse:
    """Structured result for a single orchestrator turn."""

    text: str
    user_text: str
    nlu_result: NLUResult
    extras: Dict[str, Any]
    tool_name: Optional[str]
    tool_payload: Optional[Dict[str, Any]]
    tool_result: Optional[Dict[str, Any]]
    tool_success: Optional[bool]
    resolution_status: str
    fallback_triggered: bool
    latency_ms: int
    metadata: Optional[Dict[str, Any]]
    review_reason: Optional[str]
    response_summary: Optional[str]


class Orchestrator:
    """Coordinates NLU, tool execution, and LLM routing."""

    def __init__(
        self,
        nlu: NLUService,
        registry: ToolRegistry,
        router: LLMRouter,
        logger: Optional[LearningLogger] = None,
    ) -> None:
        self._nlu = nlu
        self._registry = registry
        self._router = router
        self._logger = logger

    # --- Tool response normalization: keep user replies consistent across tools
    def _format_tool_response(self, tool_name: str, result: Dict[str, object]) -> str:
        formatter = _FORMATTERS.get(tool_name)
        if not formatter:
            return str(result)
        return formatter(result)

    # --- Tool execution bridge: isolates registry lookup from call sites
    def _run_tool(self, tool_name: str, payload: Dict[str, object]) -> tuple[Dict[str, object], str]:
        result = self._registry.run_tool(tool_name, payload)
        return result, self._format_tool_response(tool_name, result)

    def run_tool(self, tool_name: str, payload: Dict[str, object]) -> Dict[str, object]:
        """Execute a tool synchronously and return the raw result."""

        result, _ = self._run_tool(tool_name, payload)
        return result

    def _apply_tool_metadata(
        self,
        extras: Dict[str, Any],
        tool_name: str,
        result: Dict[str, object],
    ) -> Dict[str, Any]:
        metadata = dict(extras or {})
        domain = ""
        if isinstance(result, dict):
            domain_candidate = result.get("domain")
            if isinstance(domain_candidate, str):
                domain = domain_candidate.strip()
        if not domain:
            domain = _TOOL_DOMAINS.get(tool_name, "")
        if domain and metadata.get("domain") in (None, "", "general"):
            metadata["domain"] = domain

        if isinstance(result, dict):
            action = result.get("action")
            if isinstance(action, str) and action:
                metadata[f"{tool_name}_action"] = action
        return metadata

    def handle_message(self, message: str) -> str:
        return self.handle_message_with_details(message).text

    def handle_message_with_details(self, message: str) -> OrchestratorResponse:
        start = perf_counter()

        raw_message = message or ""
        nlu_result = self._nlu.parse(raw_message)
        is_confident = self._nlu.is_confident(nlu_result)

        response_text = ""
        response_summary: Optional[str] = None
        tool_name: Optional[str] = None
        tool_payload: Optional[Dict[str, Any]] = None
        tool_result: Optional[Dict[str, Any]] = None
        tool_success: Optional[bool] = None
        resolution_status = "unknown"
        fallback_triggered = False
        metadata: Dict[str, Any] | None = None
        extras: Dict[str, Any] = self._nlu.build_metadata(nlu_result)
        extras["resolved_intent"] = nlu_result.intent
        review_reason: Optional[str] = None

        router_needed = False

        if not raw_message.strip():
            response_text = "Please enter a message to get started."
            resolution_status = "input_error"
            extras["invocation_source"] = "input_validation"
        elif is_confident:
            candidate_tool = self._intent_to_tool(nlu_result.intent)
            if candidate_tool:
                payload = self._nlu.build_payload(nlu_result, raw_message)
                tool_payload = payload
                tool_name = candidate_tool
                extras.setdefault("invocation_source", "nlu")
                extras["resolved_tool"] = tool_name
                try:
                    result, response_text = self._run_tool(tool_name, payload)
                    tool_result = result
                    extras = self._apply_tool_metadata(extras, tool_name, result)
                    tool_success = True
                    resolution_status = "tool:nlu"
                except Exception as exc:
                    tool_success = False
                    resolution_status = "tool_error"
                    response_text = "The selected tool failed to execute."
                    metadata = {"error": repr(exc)}
                    review_reason = "tool_error"
            else:
                router_needed = True
        else:
            router_needed = True

        if router_needed:
            decision = self._router.route(raw_message)
            if isinstance(decision, dict) and decision.get("type") == "tool":
                tool_name = str(decision.get("name", "")).strip()
                if not tool_name:
                    response_text = "The router did not provide a tool name."
                    resolution_status = "router_error"
                    review_reason = "router_missing_tool_name"
                else:
                    payload = decision.get("payload") or {}
                    if not isinstance(payload, dict):
                        response_text = "The router returned an invalid payload."
                        resolution_status = "router_error"
                        review_reason = "router_invalid_payload"
                    else:
                        tool_payload = payload
                        extras["invocation_source"] = "router"
                        extras["resolved_tool"] = tool_name
                        try:
                            result, response_text = self._run_tool(tool_name, payload)
                            tool_result = result
                            extras = self._apply_tool_metadata(extras, tool_name, result)
                            tool_success = True
                            resolution_status = "tool:router"
                        except Exception as exc:  # pragma: no cover - defensive guard
                            tool_success = False
                            resolution_status = "tool_error"
                            response_text = "The selected tool failed to execute."
                            metadata = {"error": repr(exc)}
                            review_reason = "tool_error"
            else:
                fallback = self._router.general_answer(raw_message)
                if fallback:
                    response_text = fallback
                    fallback_triggered = True
                    resolution_status = "fallback"
                    review_reason = review_reason or "fallback_response"
                    extras["invocation_source"] = "fallback"
                else:
                    response_text = str(decision)
                    resolution_status = "router_response"
                    extras["invocation_source"] = "router"

        if not is_confident and review_reason is None:
            review_reason = "low_confidence"

        latency_ms = int((perf_counter() - start) * 1000)
        response_summary = response_text[:160] if response_text else None
        self._emit_logs(
            raw_message,
            nlu_result,
            response_text,
            response_summary,
            tool_name,
            tool_payload,
            tool_success,
            resolution_status,
            fallback_triggered,
            latency_ms,
            metadata,
            extras or {},
            review_reason,
        )

        return OrchestratorResponse(
            text=response_text,
            user_text=raw_message,
            nlu_result=nlu_result,
            extras=extras or {},
            tool_name=tool_name,
            tool_payload=tool_payload,
            tool_result=tool_result,
            tool_success=tool_success,
            resolution_status=resolution_status,
            fallback_triggered=fallback_triggered,
            latency_ms=latency_ms,
            metadata=metadata,
            review_reason=review_reason,
            response_summary=response_summary,
        )

    def _intent_to_tool(self, intent: str) -> Optional[str]:
        mapping = {
            "ask_weather": "weather",
            "get_news": "news",
            "weather": "weather",
            "news": "news",
        }
        if intent in mapping:
            return mapping[intent]
        available = self._registry.available_tools()
        if intent in available:
            return intent
        return None

    def _emit_logs(
        self,
        message: str,
        nlu_result: NLUResult,
        response_text: str,
        response_summary: Optional[str],
        tool_name: Optional[str],
        tool_payload: Optional[Dict[str, Any]],
        tool_success: Optional[bool],
        resolution_status: str,
        fallback_triggered: bool,
        latency_ms: int,
        metadata: Optional[Dict[str, Any]],
        extras: Optional[Dict[str, Any]],
        review_reason: Optional[str],
    ) -> None:
        if not self._logger or not self._logger.enabled:
            return

        turn_record = TurnRecord.new(
            user_text=message,
            intent=nlu_result.intent,
            confidence=nlu_result.confidence,
            entities=nlu_result.entities,
            tool_name=tool_name,
            tool_payload=tool_payload,
            tool_success=tool_success,
            response_text=response_text,
            response_summary=response_summary,
            resolution_status=resolution_status,
            latency_ms=latency_ms,
            fallback_triggered=fallback_triggered,
            metadata=metadata,
            extras=extras,
        )
        self._logger.log_turn(turn_record)

        if review_reason:
            review = ReviewItem.new(
                user_text=message,
                intent=nlu_result.intent,
                confidence=nlu_result.confidence,
                reason=review_reason,
                tool_name=tool_name,
                metadata=metadata,
                extras=extras,
            )
            self._logger.log_review_item(review)
