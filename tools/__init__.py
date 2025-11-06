from __future__ import annotations

from core.tool_registry import ToolRegistry
from tools import news, weather


def load_all_core_tools(registry: ToolRegistry) -> None:
    registry.register_tool("weather", weather.run)
    registry.register_tool("news", news.run)