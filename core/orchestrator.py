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
from core.parser_payloads import normalize_parser_payload
from core.tool_registry import ToolRegistry
from core.tooling.store_config import is_mutating_action
from core.text_utils import hash_text
from core.conversation_memory import ConversationMemory
from core.probes.tool_probes import run_tool_probe
from tools.calendar_edit_tool import format_calendar_response
from tools.kitchen_tips_tool import format_kitchen_tips_response
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
        conversation_memory: Optional[ConversationMemory] = None,
    ) -> None:
        self._nlu = nlu
        self._registry = registry
        self._router = router
        self._logger = logger
        self._conversation_memory = conversation_memory or ConversationMemory()

    # --- Tool response normalization: keep user replies consistent across tools
    def _format_tool_response(self, tool_name: str, result: Dict[str, object]) -> str:
        formatter = _FORMATTERS.get(tool_name)
        if not formatter:
            return str(result)
        return formatter(result)

    # --- Tool execution bridge: isolates registry lookup from call sites
    def _run_tool(self, tool_name: str, payload: Dict[str, object], *, dry_run: bool = False) -> tuple[Dict[str, object], str]:
        result = self._registry.run_tool(tool_name, payload, dry_run=dry_run)
        return result, self._format_tool_response(tool_name, result)

    def run_tool(self, tool_name: str, payload: Dict[str, object], *, dry_run: bool = False) -> Dict[str, object]:
        """Execute a tool synchronously and return the raw result."""

        result, _ = self._run_tool(tool_name, payload, dry_run=dry_run)
        return result

    def _should_dry_run(self, tool_name: Optional[str], payload: Optional[Dict[str, object]]) -> bool:
        if not tool_name or not payload:
            return False
        action = str(payload.get("action") or "").strip().lower()
        return is_mutating_action(tool_name, action)

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

    def _maybe_apply_probe(
        self,
        tool_name: str,
        message: str,
        payload: Dict[str, Any],
        extras: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        candidates = {"kitchen_tips", "todo_list", "calendar_edit", "app_guide"}
        if tool_name not in candidates:
            return None
        action = str(payload.get("action") or "").strip().lower()
        if action not in {"", "list", "find"}:
            return None
        probe = run_tool_probe(tool_name, message, payload)
        if not probe:
            return None
        extras["keyword_probe"] = probe.to_metadata()
        if probe.decision == "find":
            payload["action"] = "find"
            if probe.query:
                payload.setdefault("keywords", probe.query)
                payload.pop("id", None)
            payload.setdefault("message", message)
            return None
        if probe.decision == "list":
            payload["action"] = "list"
            payload.setdefault("message", message)
            return None
        fallback = self._router.general_answer(message)
        response_text = fallback or "I couldn't find a matching entry yet, but here is what I can suggest."
        return {
            "response_text": response_text,
            "fallback_triggered": True,
            "resolution_status": "fallback",
            "review_reason": "keyword_probe_no_match",
        }

    def _handle_router_hint(
        self,
        message: str,
        normalized_entities: Dict[str, Any],
        extras: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        hint_tool = self._router.suggest_tool(message)
        probed_tools = {"kitchen_tips", "todo_list", "calendar_edit", "app_guide"}
        if hint_tool not in probed_tools:
            return None
        payload = dict(normalized_entities or {})
        payload.setdefault("message", message)
        payload.setdefault("intent", hint_tool)
        extras["router_hint"] = hint_tool
        extras["invocation_source"] = "router_hint"
        probe_response = self._maybe_apply_probe(hint_tool, message, payload, extras)
        if probe_response:
            return {
                "response_text": probe_response["response_text"],
                "fallback_triggered": probe_response.get("fallback_triggered", False),
                "resolution_status": probe_response.get("resolution_status", "fallback"),
                "review_reason": probe_response.get("review_reason"),
                "tool_name": None,
                "tool_payload": None,
                "tool_result": None,
                "tool_success": None,
            }
        dry_run = self._should_dry_run(hint_tool, payload)
        try:
            result, response_text = self._run_tool(hint_tool, payload, dry_run=dry_run)
            updated_extras = self._apply_tool_metadata(extras, hint_tool, result)
            if dry_run:
                updated_extras["staged"] = True
            return {
                "response_text": response_text,
                "tool_name": hint_tool,
                "tool_payload": payload,
                "tool_result": result,
                "tool_success": True,
                "resolution_status": "tool:router_hint",
                "fallback_triggered": False,
                "review_reason": None,
                "extras": updated_extras,
            }
        except Exception as exc:  # pragma: no cover - defensive guard
            return {
                "response_text": "The selected tool failed to execute.",
                "tool_name": hint_tool,
                "tool_payload": payload,
                "tool_result": None,
                "tool_success": False,
                "resolution_status": "tool_error",
                "fallback_triggered": False,
                "review_reason": "tool_error",
                "metadata": {"error": repr(exc)},
                "extras": extras,
            }

    def handle_message(self, message: str) -> str:
        return self.handle_message_with_details(message).text

    def handle_message_with_details(self, message: str) -> OrchestratorResponse:
        start = perf_counter()

        raw_message = message or ""
        nlu_result = self._nlu.parse(raw_message)
        is_confident = self._nlu.is_confident(nlu_result)
        entities_snapshot = dict(nlu_result.entities or {})
        parser_payload = {"intent": nlu_result.intent}
        normalized_entities = normalize_parser_payload(entities_snapshot)
        if normalized_entities:
            parser_payload.update(normalized_entities)

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
        stripped_message = raw_message.strip()
        memory_entry = None
        if stripped_message:
            memory_entry = self._conversation_memory.append(raw_message)
            extras["conversation_entry_id"] = memory_entry.entry_id
            extras["conversation_history"] = self._conversation_memory.history()

        if not stripped_message:
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
                probe_response = self._maybe_apply_probe(tool_name, raw_message, payload, extras)
                if probe_response:
                    response_text = probe_response["response_text"]
                    fallback_triggered = probe_response.get("fallback_triggered", False)
                    resolution_status = probe_response.get("resolution_status", "fallback")
                    review_reason = probe_response.get("review_reason", review_reason)
                    tool_name = None
                    tool_payload = None
                    tool_result = None
                    tool_success = None
                else:
                    dry_run = self._should_dry_run(tool_name, payload)
                    try:
                        result, response_text = self._run_tool(tool_name, payload, dry_run=dry_run)
                        tool_result = result
                        extras = self._apply_tool_metadata(extras, tool_name, result)
                        if dry_run:
                            extras["staged"] = True
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
                        payload = dict(payload)
                        for key, value in (normalized_entities or {}).items():
                            payload.setdefault(key, value)
                        payload.setdefault("message", raw_message)
                        tool_payload = payload
                        extras["invocation_source"] = "router"
                        extras["resolved_tool"] = tool_name
                        probe_response = self._maybe_apply_probe(tool_name, raw_message, payload, extras)
                        if probe_response:
                            response_text = probe_response["response_text"]
                            fallback_triggered = probe_response.get("fallback_triggered", False)
                            resolution_status = probe_response.get("resolution_status", "fallback")
                            review_reason = probe_response.get("review_reason", review_reason)
                            tool_name = None
                            tool_payload = None
                            tool_result = None
                            tool_success = None
                        else:
                            dry_run = self._should_dry_run(tool_name, payload)
                            try:
                                result, response_text = self._run_tool(tool_name, payload, dry_run=dry_run)
                                tool_result = result
                                extras = self._apply_tool_metadata(extras, tool_name, result)
                                if dry_run:
                                    extras["staged"] = True
                                tool_success = True
                                resolution_status = "tool:router"
                            except Exception as exc:  # pragma: no cover - defensive guard
                                tool_success = False
                                resolution_status = "tool_error"
                                response_text = "The selected tool failed to execute."
                                metadata = {"error": repr(exc)}
                                review_reason = "tool_error"
            else:
                hint_result = self._handle_router_hint(raw_message, normalized_entities, extras)
                if hint_result:
                    response_text = hint_result["response_text"]
                    tool_name = hint_result.get("tool_name")
                    tool_payload = hint_result.get("tool_payload")
                    tool_result = hint_result.get("tool_result")
                    tool_success = hint_result.get("tool_success")
                    resolution_status = hint_result.get("resolution_status", resolution_status)
                    fallback_triggered = hint_result.get("fallback_triggered", fallback_triggered)
                    review_reason = hint_result.get("review_reason", review_reason)
                    metadata = hint_result.get("metadata", metadata)
                    extras = hint_result.get("extras") or extras
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
            parser_payload,
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
        parser_payload: Optional[Dict[str, Any]],
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
            prompt_id = hash_text(message or "") or None
            review = ReviewItem.new(
                user_text=message,
                intent=nlu_result.intent,
                confidence=nlu_result.confidence,
                reason=review_reason,
                tool_name=tool_name,
                metadata=metadata,
                extras=extras,
                prompt_id=prompt_id,
                parser_payload=parser_payload,
            )
            self._logger.log_review_item(review)

    def update_conversation_payload(self, entry_id: Optional[str], payload: Optional[Dict[str, Any]]) -> None:
        """Persist the corrected payload for a past conversational turn."""

        self._conversation_memory.update_payload(entry_id, payload)
