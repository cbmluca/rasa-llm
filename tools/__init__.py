"""Register the built-in conversation tools with the shared registry.

The module currently exposes weather and news tools that can be registered
with the orchestrator via :func:`load_all_core_tools`.
"""

from __future__ import annotations

from core.tool_registry import ToolRegistry
from tools import news, weather


def load_all_core_tools(registry: ToolRegistry) -> None:
    # Register every core tool with ``registry``
    registry.register_tool("weather", weather.run)
    registry.register_tool("news", news.run)