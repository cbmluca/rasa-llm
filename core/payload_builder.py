"""Heuristic payload builder used when classifier routes a request."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from core.text_parsing import extract_notes_from_text, extract_title_from_text


class PayloadBuilder:
    """WHAT: infer lightweight payloads when the classifier fires.

    WHY: classifier-only turns still need structured ``action`` hints so CRUD
    tools perform something reasonable before Tier‑5 corrections step in.
    HOW: provide intent-specific heuristics (keyword probes, title extraction,
    note parsing) and expose a ``build`` router that dispatches by intent name.
    """

    def build(self, intent: str, message: str) -> Dict[str, Any]:
        """WHAT: dispatch classifier intents to heuristic builders.

        WHY: routers call this once per fallback turn; central routing keeps the
        orchestrator simple and avoids ``if/elif`` chains.
        HOW: look up ``_build_<intent>`` methods dynamically, guard failures,
        and return empty dicts when no heuristic exists.
        """
        handler = getattr(self, f"_build_{intent}", None)
        if not handler:
            return {}
        try:
            return handler(message or "") or {}
        except Exception:  # pragma: no cover - heuristics should never break parsing pipeline
            return {}

    # --- intent-specific helpers -------------------------------------------------
    def _build_todo_list(self, message: str) -> Dict[str, Any]:
        """WHAT: infer ``todo_list`` actions/titles/notes.

        WHY: classifier traffic often comes from ambiguous todo phrasing; giving
        the tool a best-effort action/title maintains intent fidelity.
        HOW: map verbs via ``_infer_action``, inspect keywords for completion
        hints, and reuse shared text helpers for titles/notes.
        """
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
        """WHAT: heuristic for ``kitchen_tips`` list/find/create verbs.

        WHY: fallback prompts still need an ``action`` for CRUD tools to work.
        HOW: run ``_infer_action`` with verb clusters keyed to our canonical
        actions and return the resulting payload.
        """
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
        """WHAT: infer calendar actions (create/update/list/delete).

        WHY: scheduler prompts can skip explicit verbs; heuristics provide a
        safe default so the tool doesn’t mis-handle the request.
        HOW: reuse `_infer_action`, default to create, and attempt to extract a
        title for context.
        """
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
        """WHAT: normalize Notes prompts to CRUD verbs.

        WHY: knowledge-base edits run through the same reviewer tooling, so the
        classifier must emit clear upsert/list/delete hints.
        HOW: rely on `_infer_action` with synonyms for each canonical verb.
        """
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
        """WHAT: derive a topic for news prompts.

        WHY: deterministic parser handles most cases, but classifier fallbacks
        still benefit from a topic so the tool can run a search.
        HOW: scan for "news about/on" phrases or regex matches, returning the
        trimmed topic string when available.
        """
        topic = self._extract_topic(message)
        payload: Dict[str, Any] = {}
        if topic:
            payload["topic"] = topic
        return payload

    def _build_weather(self, message: str) -> Dict[str, Any]:
        """WHAT: guess whether the user wants current weather or a forecast.

        WHY: even classifier-sourced weather prompts should hint at the desired
        mode so formatters choose the right narrative.
        HOW: inspect lowercase text for time hints such as "forecast" or
        "later" and return the inferred mode.
        """
        action = "forecast" if "forecast" in message.lower() or "later" in message.lower() else "current"
        return {"mode": action}

    # --- utilities ----------------------------------------------------------------
    def _infer_action(self, message: str, mapping: Dict[str, List[str]], default: str) -> str:
        """WHAT: shared keyword→action matcher for builder helpers.

        WHY: each intent uses similar verb buckets; centralizing the matcher
        avoids duplicating `for` loops and keeps heuristics consistent.
        HOW: lowercase the message, scan for keywords per action, and return
        the matched action or the provided default when nothing hits.
        """
        lowered = (message or "").lower()
        for action, keywords in mapping.items():
            for keyword in keywords:
                if keyword in lowered:
                    return action
        return default

    def _extract_topic(self, message: str) -> Optional[str]:
        """WHAT: parse human-friendly news topics from free text.

        WHY: users ask for "news about the election" rather than structured
        payloads; heuristics keep fallback behavior acceptable.
        HOW: search for known prefixes or regex matches, trim punctuation, and
        cap the result length so downstream calls stay bounded.
        """
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
