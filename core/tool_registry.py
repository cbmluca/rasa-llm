"""Maintain Tier-1 tool registrations with guard rails against misuse.

This module owns the list of callable utilities that Tier-1 can execute. By
centralizing registration and access, it ensures the orchestrator only triggers
known, vetted tools and can enumerate them for the LLM router prompt.
"""

from __future__ import annotations

from typing import Dict, Protocol


class ToolFn(Protocol):
    def __call__(self, payload: Dict[str, object], *, dry_run: bool = False) -> Dict[str, object]:
        ...


class ToolRegistry:
    """Registry that maps tool names to callables."""

    def __init__(self) -> None:
        self._tools: Dict[str, ToolFn] = {}

    # WHAT: register a tool callable under a unique name.
    # WHY: the orchestrator and router rely on this registry to know which tools are safe to invoke.
    # HOW: guard against duplicates and store the callable in `_tools`.
    def register_tool(self, name: str, fn: ToolFn) -> None:
        if name in self._tools:
            raise ValueError(f"Tool '{name}' is already registered")
        self._tools[name] = fn

    # WHAT: execute a previously registered tool.
    # WHY: the orchestrator calls this when a deterministic flow resolves to a tool.
    # HOW: look up the callable and invoke it with the provided payload/dry_run flag.
    def run_tool(self, name: str, payload: Dict[str, object], *, dry_run: bool = False) -> Dict[str, object]:
        try:
            tool_fn = self._tools[name]
        except KeyError as exc:
            raise KeyError(f"Tool '{name}' is not registered") from exc
        return tool_fn(payload, dry_run=dry_run)

    # WHAT: return a snapshot of registered tools.
    # WHY: the router uses this to build prompts and the CLI may list available tools.
    # HOW: return a shallow copy of the registry dict to prevent callers from mutating internal state.
    def available_tools(self) -> Dict[str, ToolFn]:
        return dict(self._tools)
