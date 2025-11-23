"""Todo intent parsing."""

from __future__ import annotations

import re
from typing import Dict, Optional, Sequence

from core.parser_utils import extract_after_keywords
from core.parser_utils.datetime import find_date_in_text
from core.text_parsing import extract_notes_from_text, extract_title_from_text
from core.parsers.types import CommandResult

_TODO_DIRECTIVE_TOKENS = ("notes", "note", "deadline", "due", "reminder")
_LIST_TODOS_PATTERN = re.compile(r"\b(list|show|display|see)\b[^\n]*\b(todos?|tasks?)\b", re.IGNORECASE)
_SIMPLE_LIST_PATTERN = re.compile(r"^\s*(?:todos?|todo list|my todos|list todos?)\b", re.IGNORECASE)
_FIND_TODOS_PATTERN = re.compile(r"\b(find|search|look\s*up|locate)\b[^\n]*\b(todos?|tasks?)?", re.IGNORECASE)
_COMPLETE_TODO_PATTERN = re.compile(r"\b(complete|finish)\b[^\n]*\b(todo|task)\b", re.IGNORECASE)
_MARK_DONE_PATTERN = re.compile(r"\bmark\b[^\n]+\bas\s+(?:done|complete|finished)\b", re.IGNORECASE)
_COMPLETION_LEADING_PATTERN = re.compile(r"^\s*(?:to\s+)+", re.IGNORECASE)

def parse(message: str, lowered: str) -> Optional[CommandResult]:
    """WHAT: convert todo phrases into structured actions/entities for the todo tool.
    WHY: deterministic parsing avoids hitting the router/LLM when user commands are explicit.
    HOW: detect CRUD verbs via regex helpers, extract titles/notes/deadlines/status, and return a ``CommandResult``."""
    action = "create"
    completion_request = _is_completion_request(lowered)
    completion_title = _extract_completion_title(message)

    if _is_find_request(lowered):
        action = "find"
    elif _is_list_request(lowered):
        action = "list"
    elif _is_delete_request(lowered):
        action = "delete"
    elif completion_request or lowered.startswith("update todo") or " status " in lowered or lowered.startswith("mark todo"):
        action = "update"
    elif "remember" in lowered or "remind me" in lowered or lowered.startswith("remind"):
        action = "create"

    payload: Dict[str, object] = {"action": action, "message": message, "domain": "todo"}
    cleaned_for_title = _strip_command_directives(message)

    if completion_request and action == "update":
        payload["status"] = "completed"

    if action == "find":
        keywords = _extract_find_keywords(message)
        payload["keywords"] = keywords or ""
    if action in {"update", "delete"}:
        trimmed_message = re.sub(
            r"^(?:update|delete|remove|complete|finish|mark)\s+(?:the\s+)?(?:todo|task)\s+",
            "",
            message,
            count=1,
            flags=re.IGNORECASE,
        ).strip()
        title = extract_title_from_text(trimmed_message)
        if title:
            title = re.split(r"\s+to\b", title, 1)[0].strip(' "')
        if not title:
            title = extract_after_keywords(
                trimmed_message,
                ["update todo", "delete todo", "remove todo", "complete todo", "complete task", "finish todo", "finish task"],
                terminators=[" status", " notes", " note", " deadline", " due", "."],
            )
            if title:
                title = title.strip(' "')
        if not title:
            match = re.search(r"update todo\s+(.+?)\s+to\b", message, re.IGNORECASE)
            if match:
                title = match.group(1).strip(' "')
        if not title and trimmed_message:
            normalized = re.split(r"\s+to\b", trimmed_message, 1)[0].strip(' "')
            if normalized:
                title = normalized
        if not title and completion_title:
            title = completion_title
        if title:
            cleaned_title = _strip_completion_leading(title).strip(' "')
            if cleaned_title:
                payload["target_title"] = cleaned_title
    else:
        title = extract_title_from_text(cleaned_for_title)
        if not title and cleaned_for_title:
            title = cleaned_for_title.strip()
        if title:
            payload["title"] = title

    notes = extract_notes_from_text(message)
    if notes:
        payload["notes"] = notes

    deadline = find_date_in_text(message)
    if deadline:
        payload["deadline"] = deadline

    status_match = re.search(r"status\s+(completed|done|finished|pending)", lowered)
    if status_match:
        payload["status"] = "completed" if status_match.group(1) in {"completed", "done", "finished"} else "pending"

    return CommandResult(tool="todo_list", payload=payload)

def _strip_command_directives(message: str) -> str:
    """WHAT: trim trailing directive phrases before title extraction.
    WHY: phrases like “add todo X notes Y” should stop title parsing before the notes segment.
    HOW: scan for directive tokens and cut the string at the earliest occurrence."""
    lowered = message.lower()
    cut_index = len(message)
    for token in _TODO_DIRECTIVE_TOKENS:
        idx = lowered.find(token)
        if idx != -1:
            cut_index = min(cut_index, idx)
    return message[:cut_index].strip()

def _is_list_request(lowered: str) -> bool:
    """WHAT: detect list/show phrasing for todos.
    WHY: ensures the parser emits ``action=list`` so the tool enumerates items.
    HOW: run list regexes and fall back to simple phrase checks."""
    if _LIST_TODOS_PATTERN.search(lowered) or _SIMPLE_LIST_PATTERN.search(lowered):
        return True
    return any(phrase in lowered for phrase in ("show my todos", "show todos", "view my todos", "what are my todos"))

def _is_find_request(lowered: str) -> bool:
    """WHAT: detect search/find phrasing for todo keywords.
    WHY: find requests should capture keywords instead of creating entries.
    HOW: evaluate `_FIND_TODOS_PATTERN` against the lowered utterance."""
    return bool(_FIND_TODOS_PATTERN.search(lowered))

def _is_delete_request(lowered: str) -> bool:
    """WHAT: detect delete/remove instructions.
    WHY: maps “remove the task…” to the delete action for the tool.
    HOW: check for key substrings like “delete todo” or “remove task”."""
    return any(keyword in lowered for keyword in ("delete todo", "remove todo", "delete task", "remove task"))

def _is_completion_request(lowered: str) -> bool:
    """WHAT: detect mark/finish/complete requests to set `status=completed`.
    WHY: completed status updates should happen automatically when the intent is explicit.
    HOW: test regex patterns and prefixes for completion verbs."""
    if _COMPLETE_TODO_PATTERN.search(lowered):
        return True
    if _MARK_DONE_PATTERN.search(lowered):
        return True
    return lowered.strip().startswith("complete ") or lowered.strip().startswith("finish ")

def _extract_completion_title(message: str) -> Optional[str]:
    """WHAT: recover the todo title from completion phrases.
    WHY: update actions need a concrete title when IDs aren’t supplied.
    HOW: run regexes for “complete todo …”/“mark … as done”, strip quotes, and remove leading “to …” tokens."""
    patterns = [
        re.compile(r"(?:complete|finish)\s+(?:the\s+)?(?:task|todo)\s+(?:to\s+)?(.+)", re.IGNORECASE),
        re.compile(r"mark\s+(.+?)\s+as\s+(?:done|complete|finished)", re.IGNORECASE),
    ]
    for pattern in patterns:
        match = pattern.search(message)
        if not match:
            continue
        candidate = match.group(1).strip(' ".,')
        candidate = _strip_completion_leading(candidate)
        if candidate:
            return candidate
    return None

def _strip_completion_leading(text: str) -> str:
    """WHAT: remove leading “to …” tokens from completion titles.
    WHY: completion phrases often embed infinitives (“to call mom”) that shouldn’t be stored.
    HOW: apply `_COMPLETION_LEADING_PATTERN` and trim whitespace."""
    return _COMPLETION_LEADING_PATTERN.sub("", (text or "")).strip()

def _extract_find_keywords(message: str, *, nouns: Sequence[str] | None = None) -> str:
    """WHAT: capture the keyword string following verbs like “find” or “search”.
    WHY: the todo tool expects ``keywords`` for find requests to filter entries.
    HOW: regex match after verbs, strip noun phrases (todo/task), and return the cleaned remainder."""
    terms = nouns or ['todos?', 'tasks?']
    noun_pattern = "|".join(terms)
    pattern = re.compile(rf"\b(find|search|look\s*up|locate)\b\s*(?:for\s+)?(?:(?:the|my)\s+)?(?:(?:{noun_pattern})\s+)?(.+)", re.IGNORECASE)
    match = pattern.search(message)
    if not match:
        return ""
    keywords = match.group(2).strip()
    keywords = re.sub(rf"\b(?:{noun_pattern})\b", "", keywords, flags=re.IGNORECASE).strip(" ,.-")
    return keywords
