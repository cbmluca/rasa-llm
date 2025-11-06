"""Maintain Tier-1 tool registrations with guard rails against misuse.

This module owns the list of callable utilities that Tier-1 can execute. By
centralizing registration and access, it ensures the orchestrator only triggers
known, vetted tools and can enumerate them for the LLM router prompt.
"""

from __future__ import annotations

from typing import Dict, Protocol


class ToolFn(Protocol):
    def __call__(self, payload: Dict[str, object]) -> Dict[str, object]:
        ...


class ToolRegistry:
    """Registry that maps tool names to callables."""

    def __init__(self) -> None:
        self._tools: Dict[str, ToolFn] = {}

# --- Registration: fail fast on duplicates to avoid shadowing tools
    def register_tool(self, name: str, fn: ToolFn) -> None:
        if name in self._tools:
            raise ValueError(f"Tool '{name}' is already registered")
        self._tools[name] = fn

# --- Execution: guard against missing tools so callers receive clear errors
    def run_tool(self, name: str, payload: Dict[str, object]) -> Dict[str, object]:
        try:
            tool_fn = self._tools[name]
        except KeyError as exc:
            raise KeyError(f"Tool '{name}' is not registered") from exc
        return tool_fn(payload)

# --- Snapshot: provide a copy to avoid external mutation of registry state
    def available_tools(self) -> Dict[str, ToolFn]:
        return dict(self._tools)