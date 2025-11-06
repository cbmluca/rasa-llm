import json
from typing import Any, Dict, List

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher

from .context import Ctx
from .tools.registry import get_tool
from .conf import NEWS_SEARCH_LIMIT

class ActionToolRouter(Action):
    def name(self) -> str: 
        return "action_tool_router"

    def run (
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
                pass

        tool_name = call.get("tool")
        if not tool_name:
            dispatcher.utter_message(text="I'm not sure which tool to use.")
            return []

        # Reuse last topic if LLM omits it for news
        if tool_name == "news_search" and not call.get("query"):
            prev_topic = ctx.get_tool("news").get("topic")
            if prev_topic:
                call["query"] = prev_topic

        tool = get_tool(tool_name)
        if not tool:
            dispatcher.utter_message(text=f"Unknown tool '{tool_name}'.")
            return []

        # ensure default limit
        call.setdefault("limit", NEWS_SEARCH_LIMIT)

        result = tool.run(call)
        events: List[Dict[str, Any]] = []
        if tool_name == "news_search":
            topic = (call.get("query") or "").strip()
            if topic:
                events += ctx.update_tool("news", topic=topic)
        dispatcher.utter_message(text=result)
        return events