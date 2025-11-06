from __future__ import annotations

from typing import Dict

from core.llm_router import LLMRouter
from core.nlu_service import NLUService
from core.tool_registry import ToolRegistry
from tools.news import format_news_list
from tools.weather import format_weather_response


_FORMATTERS = {
    "weather": format_weather_response,
    "news": format_news_list,
}


class Orchestrator:
    """Coordinates NLU, tool execution, and LLM routing."""

    def __init__(self, nlu: NLUService, registry: ToolRegistry, router: LLMRouter) -> None:
        self._nlu = nlu
        self._registry = registry
        self._router = router

    def _format_tool_response(self, tool_name: str, result: Dict[str, object]) -> str:
        formatter = _FORMATTERS.get(tool_name)
        if not formatter:
            return str(result)
        return formatter(result)

    def _run_tool(self, tool_name: str, payload: Dict[str, object]) -> str:
        result = self._registry.run_tool(tool_name, payload)
        return self._format_tool_response(tool_name, result)

    def handle_message(self, message: str) -> str:
        nlu_result = self._nlu.parse(message)

        if self._nlu.is_confident(nlu_result) and nlu_result.intent in {"ask_weather", "get_news"}:
            payload: Dict[str, object] = {"message": message}
            tool_name = "weather" if nlu_result.intent == "ask_weather" else "news"
            return self._run_tool(tool_name, payload)

        decision = self._router.route(message)
        if isinstance(decision, dict) and decision.get("type") == "tool":
            tool_name = str(decision.get("name", "")).strip()
            if not tool_name:
                return "The router did not provide a tool name."
            payload = decision.get("payload") or {}
            if not isinstance(payload, dict):
                return "The router returned an invalid payload."
            return self._run_tool(tool_name, payload)

        return str(decision)