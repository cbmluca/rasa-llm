"""Register the built-in conversation tools with the shared registry.

Tier-3 introduces kitchen tips, todo list management, and calendar editing
tools on top of the Tier-1 weather/news actions. This module centralises their
registration so the orchestrator and router share a single source of truth.
"""

from __future__ import annotations

from core.tool_registry import ToolRegistry
from tools import app_guide_tool, calendar_edit, kitchen_tips, news, todo_list, weather


def load_all_core_tools(registry: ToolRegistry) -> None:
    # Register every core tool with ``registry``
    registry.register_tool("weather", weather.run)
    registry.register_tool("news", news.run)
    registry.register_tool("todo_list", todo_list.run)
    registry.register_tool("kitchen_tips", kitchen_tips.run)
    registry.register_tool("calendar_edit", calendar_edit.run)
    registry.register_tool("app_guide", app_guide_tool.run)
