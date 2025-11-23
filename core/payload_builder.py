"""Heuristic payload builder used when classifier routes a request."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from core.text_parsing import extract_notes_from_text, extract_title_from_text


class PayloadBuilder:
    """Infer minimal payloads for classifier-sourced intents.

    The goal is not full natural-language understanding; we simply detect
    high-signal keywords so tools receive an ``action`` hint and, when
    obvious, a few extra fields (e.g., todo status).
    """

    def build(self, intent: str, message: str) -> Dict[str, Any]:
        """Route classifier intents to the associated lightweight heuristic."""
        handler = getattr(self, f"_build_{intent}", None)
        if not handler:
            return {}
        try:
            return handler(message or "") or {}
        except Exception:  # pragma: no cover - heuristics should never break parsing pipeline
            return {}

    # --- intent-specific helpers -------------------------------------------------
    def _build_todo_list(self, message: str) -> Dict[str, Any]:
        """Guess todo action/title/notes when no deterministic parser fired."""
        action = self._infer_action(
            message,
            mapping={
                "list": ["list", "show", "display"],
                "delete": ["delete", "remove", "clear"],
                "update": ["update", "change", "edit", "complete", "done", "finish", "mark"],
                "create": ["add", "create", "new", "make", "remember", "remind"],
            },
            default="create",
        )
        payload: Dict[str, Any] = {"action": action}
        lower = message.lower()
        if action == "update" and any(word in lower for word in ("complete", "done", "finish")):
            payload.setdefault("status", "completed")
        title = extract_title_from_text(message)
        if title:
            payload.setdefault("title", title)
        notes = extract_notes_from_text(message)
        if notes:
            payload.setdefault("notes", notes)
        return payload

    def _build_kitchen_tips(self, message: str) -> Dict[str, Any]:
        """Map verbs to kitchen tip actions (list/find/create)."""
        action = self._infer_action(
            message,
            mapping={
                "search": ["search", "find", "lookup"],
                "get": ["get", "show", "tell"],
                "create": ["add", "create", "new", "submit"],
                "list": ["list", "show", "display", "all"],
            },
            default="list",
        )
        return {"action": action}

    def _build_calendar_edit(self, message: str) -> Dict[str, Any]:
        """Prefer create/update/list hints for calendar prompts."""
        action = self._infer_action(
            message,
            mapping={
                "list": ["list", "show", "display", "upcoming"],
                "delete": ["delete", "remove", "cancel"],
                "update": ["update", "change", "move", "reschedule"],
                "create": ["create", "schedule", "add", "book"],
            },
            default="create",
        )
        payload: Dict[str, Any] = {"action": action}
        title = extract_title_from_text(message)
        if title:
            payload.setdefault("title", title)
        return payload

    def _build_app_guide(self, message: str) -> Dict[str, Any]:
        """Decide between list/delete/upsert/get for knowledge base requests."""
        action = self._infer_action(
            message,
            mapping={
                "list": ["list", "show", "display"],
                "delete": ["delete", "remove"],
                "upsert": ["add", "create", "update", "edit", "write"],
                "get": ["get", "lookup", "fetch"],
            },
            default="list",
        )
        return {"action": action}

    def _build_news(self, message: str) -> Dict[str, Any]:
        """Extract the topic the user wants headlines about."""
        topic = self._extract_topic(message)
        payload: Dict[str, Any] = {}
        if topic:
            payload["topic"] = topic
        return payload

    def _build_weather(self, message: str) -> Dict[str, Any]:
        """Distinguish current weather queries from forecast requests."""
        action = "forecast" if "forecast" in message.lower() or "later" in message.lower() else "current"
        return {"mode": action}

    # --- utilities ----------------------------------------------------------------
    def _infer_action(self, message: str, mapping: Dict[str, List[str]], default: str) -> str:
        """Shared keyword matcher that backs each intent-specific builder."""
        lowered = (message or "").lower()
        for action, keywords in mapping.items():
            for keyword in keywords:
                if keyword in lowered:
                    return action
        return default

    def _extract_topic(self, message: str) -> Optional[str]:
        """Pull news topic from common phrasings ("news about", etc.)."""
        lowered = message.lower()
        for prefix in ("news about", "news on", "news regarding", "about", "on", "regarding"):
            idx = lowered.find(prefix)
            if idx != -1:
                topic = message[idx + len(prefix) :].strip(" .!?\n")
                if topic:
                    return topic[:120]
        match = re.search(r"news\s+(?:for|about)\s+([\w\s-]+)", message, re.IGNORECASE)
        if match:
            topic = match.group(1).strip()
            if topic:
                return topic[:120]
        return None


__all__ = ["PayloadBuilder"]
