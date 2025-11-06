import json
from typing import Any, Dict, List

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher

from .context import Ctx
from .tools import news_tool  # noqa: F401
from .tools.registry import get_tool
from .conf import NEWS_SEARCH_LIMIT


def _intent_name(tracker: Tracker) -> str:
    intent = tracker.latest_message.get("intent") or {}
    return intent.get("name", "")

def _intent_confidence(tracker: Tracker) -> float:
    intent = tracker.latest_message.get("intent") or {}
    try:
        return float(intent.get("confidence", 0.0))
    except (TypeError, ValueError):
        return 0.0

class ActionToolRouter(Action):
    def name(self) -> str: 
        return "action_llm_router"
    @staticmethod
    def _infer_call(
        tracker: Tracker,
        text: str,
        ctx: Ctx,
    ) -> Dict[str, Any]:
        intent = _intent_name(tracker)
        confidence = _intent_confidence(tracker)

        if intent == "news_topic" and confidence >= 0.7:
            topic = ""
            # Prefer structured entities (e.g., city) when present
            for entity in tracker.latest_message.get("entities", []) or []:
                if entity.get("entity") == "city" and entity.get("value"):
                    topic = entity["value"].strip()
                    break

            if not topic:
                topic = text.strip()

            if not topic:
                topic = ctx.get_tool("news").get("topic", "")

            if topic:
                return {"tool": "topic_news", "query": topic}

        return {}

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        ctx = Ctx(tracker)
        text = tracker.latest_message.get("text", "")

        # Expect a JSON tool call from the LLM
        call: Dict[str, Any] = {}
        if text.strip().startswith("{"):
            try:
                call = json.loads(text)
            except Exception:
                    call = {}

        if not call:
            call = self._infer_call(tracker, text, ctx)

        tool_name = call.get("tool")
        if not tool_name:
            dispatcher.utter_message(text="I'm not sure which tool to use.")
            return []
        
        # Reuse last topic if the query is missing
        if tool_name in {"news_search", "topic_news"} and not call.get("query"):
            prev_topic = ctx.get_tool("news").get("topic")
            if prev_topic:
                call["query"] = prev_topic

        tool = get_tool(tool_name)
        if not tool:
            dispatcher.utter_message(text=f"Unknown tool '{tool_name}'.")
            return []

        # ensure default limit

        if tool_name in {"news_search", "topic_news"}:
            call.setdefault("limit", NEWS_SEARCH_LIMIT)

        result = tool.run(call)
        events: List[Dict[str, Any]] = []

        if tool_name in {"news_search", "topic_news"}:
            topic = (call.get("query") or "").strip()
            if topic:
                events += ctx.update_tool("news", topic=topic)
        dispatcher.utter_message(text=result)
        return events