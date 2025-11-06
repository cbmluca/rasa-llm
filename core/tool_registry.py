from __future__ import annotations

from typing import Dict, Protocol


class ToolFn(Protocol):
    def __call__(self, payload: Dict[str, object]) -> Dict[str, object]:
        ...


class ToolRegistry:
    """Registry that maps tool names to callables."""

    def __init__(self) -> None:
        self._tools: Dict[str, ToolFn] = {}

    def register_tool(self, name: str, fn: ToolFn) -> None:
        if name in self._tools:
            raise ValueError(f"Tool '{name}' is already registered")
        self._tools[name] = fn

    def run_tool(self, name: str, payload: Dict[str, object]) -> Dict[str, object]:
        try:
            tool_fn = self._tools[name]
        except KeyError as exc:
            raise KeyError(f"Tool '{name}' is not registered") from exc
        return tool_fn(payload)

    def available_tools(self) -> Dict[str, ToolFn]:
        return dict(self._tools)