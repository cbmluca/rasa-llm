"""Keyword probes for CRUD-style tools."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from tools.kitchen_tips_tool import KitchenTipsStore
from tools.todo_list_tool import TodoStore
from tools.calendar_edit_tool import CalendarStore
from knowledge.app_guide import AppGuideStore
from core.tooling.query_helpers import tokenize_keywords


@dataclass
class ProbeResult:
    """Summarize the probe's decision plus the matching entities."""

    decision: str  # "find", "list", "answer"
    query: str
    matches: List[Dict[str, Any]]

    def to_metadata(self) -> Dict[str, Any]:
        preview_matches: List[Dict[str, Any]] = []
        for entry in self.matches[:10]:
            if not isinstance(entry, dict):
                continue
            identifier = str(entry.get("id") or entry.get("tip_id") or entry.get("entry_id") or "").strip()
            title = str(entry.get("title") or entry.get("name") or entry.get("text") or "").strip()
            if not identifier and not title:
                continue
            preview_matches.append({
                "id": identifier,
                "title": title,
            })
        return {
            "decision": self.decision,
            "query": self.query,
            "match_count": len(self.matches),
            "matches": preview_matches,
        }


def _extract_query(message: str, payload: Dict[str, Any]) -> str:
    candidates = [
        payload.get("keywords"),
        payload.get("title"),
        payload.get("id"),
        payload.get("message"),
        message,
    ]
    for value in candidates:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _looks_like_list(tool: str, message: str, payload: Dict[str, Any]) -> bool:
    action = str(payload.get("action") or "").strip().lower()
    if action == "list":
        return True
    lowered = (message or "").strip().lower()
    if not lowered:
        return False
    keywords = {
        "kitchen_tips": ["show kitchen", "list kitchen", "kitchen tips", "tips"],
        "todo_list": ["list todos", "show todos", "open tasks", "todo list"],
        "calendar_edit": ["show calendar", "list events", "calendar"],
        "app_guide": ["show guide", "list sections", "app guide", "show notes", "notes"],
    }
    return any(phrase in lowered for phrase in keywords.get(tool, []))


def _matches_exist(matches: List[Dict[str, Any]]) -> bool:
    return bool(matches)


def _run_kitchen_probe(message: str, payload: Dict[str, Any]) -> ProbeResult:
    query = _extract_query(message, payload)
    tokens = tokenize_keywords(query)
    store = KitchenTipsStore()
    matches = store.search(query) if tokens else []
    if _matches_exist(matches):
        return ProbeResult("find", query, matches)
    if _looks_like_list("kitchen_tips", message, payload):
        return ProbeResult("list", query, [])
    return ProbeResult("answer", query, [])


def _run_todo_probe(message: str, payload: Dict[str, Any]) -> ProbeResult:
    query = _extract_query(message, payload)
    tokens = tokenize_keywords(query)
    store = TodoStore()
    matches = store.find_todos(query) if tokens else []
    if _matches_exist(matches):
        return ProbeResult("find", query, matches)
    if _looks_like_list("todo_list", message, payload):
        return ProbeResult("list", query, [])
    return ProbeResult("answer", query, [])


def _run_calendar_probe(message: str, payload: Dict[str, Any]) -> ProbeResult:
    query = _extract_query(message, payload)
    tokens = tokenize_keywords(query)
    store = CalendarStore()
    matches = store.search_events(query) if tokens else []
    if _matches_exist(matches):
        return ProbeResult("find", query, matches)
    if _looks_like_list("calendar_edit", message, payload):
        return ProbeResult("list", query, [])
    return ProbeResult("answer", query, [])


def _run_app_guide_probe(message: str, payload: Dict[str, Any]) -> ProbeResult:
    query = _extract_query(message, payload)
    tokens = tokenize_keywords(query)
    store = AppGuideStore()
    matches = store.search_sections(query) if tokens else []
    if _matches_exist(matches):
        return ProbeResult("find", query, matches)
    if _looks_like_list("app_guide", message, payload):
        return ProbeResult("list", query, [])
    return ProbeResult("answer", query, [])


_PROBED_TOOLS = {
    "kitchen_tips": _run_kitchen_probe,
    "todo_list": _run_todo_probe,
    "calendar_edit": _run_calendar_probe,
    "app_guide": _run_app_guide_probe,
}


def run_tool_probe(tool_name: str, message: str, payload: Dict[str, Any]) -> Optional[ProbeResult]:
    """Heuristic search that finds likely entities before escalating to the LLM."""
    runner = _PROBED_TOOLS.get(tool_name)
    if not runner:
        return None
    return runner(message, payload)


__all__ = ["ProbeResult", "run_tool_probe"]
