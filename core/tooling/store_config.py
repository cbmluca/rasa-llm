"""Shared mapping between tools and their backing data stores."""

from __future__ import annotations

from typing import Dict, Set

DATA_STORE_TO_TOOL = {
    "todos": {"tool": "todo_list", "list_payload": {"action": "list"}},
    "kitchen_tips": {"tool": "kitchen_tips", "list_payload": {"action": "list"}},
    "calendar": {"tool": "calendar_edit", "list_payload": {"action": "list"}},
    "app_guide": {"tool": "app_guide", "list_payload": {"action": "list"}},
}

TOOL_TO_STORE: Dict[str, str] = {
    config["tool"]: store_id for store_id, config in DATA_STORE_TO_TOOL.items()
}

STORE_MUTATING_ACTIONS: Dict[str, Set[str]] = {
    "todos": {"create", "update", "delete"},
    "kitchen_tips": {"create", "update", "delete"},
    "calendar": {"create", "update", "delete"},
    "app_guide": {"create", "update", "delete"},
}


def is_mutating_action(tool: str, action: str) -> bool:
    """Return True when running ``tool`` with ``action`` should mutate a data store."""

    store = TOOL_TO_STORE.get(tool)
    if not store:
        return False
    normalized_action = (action or "").strip().lower()
    if not normalized_action:
        return False
    return normalized_action in STORE_MUTATING_ACTIONS.get(store, set())


__all__ = [
    "DATA_STORE_TO_TOOL",
    "TOOL_TO_STORE",
    "STORE_MUTATING_ACTIONS",
    "is_mutating_action",
]
