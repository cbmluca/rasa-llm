from typing import Dict, Optional, Protocol, Any

class Tool(Protocol):
    name: str
    def run(self, args: Dict[str, Any]) -> str: ...

_REGISTRY: Dict[str, Tool] = {}

def register(tool: Tool) -> None:
    _REGISTRY[tool.name] = tool

def get_tool(name: str) -> Optional[Tool]:
    return _REGISTRY.get(name)