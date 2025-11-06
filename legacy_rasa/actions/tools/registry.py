"""Simple tool registry for exposing reusable action integrations."""

from typing import Dict, Optional, Protocol, Any

class Tool(Protocol):
    name: str
    def run(self, args: Dict[str, Any]) -> str: ...
    
# Central mapping of tool names to their implementations.
_REGISTRY: Dict[str, Tool] = {}

def register(tool: Tool) -> None:
    _REGISTRY[tool.name] = tool

def get_tool(name: str) -> Optional[Tool]:
    return _REGISTRY.get(name)

def register_alias(alias: str, target: str) -> None:
    if target in _REGISTRY:
        _REGISTRY[alias] = _REGISTRY[target]