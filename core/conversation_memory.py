"""Lightweight in-memory conversation history."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Deque, Dict, List, Optional
from uuid import uuid4


@dataclass
class MemoryEntry:
    entry_id: str
    user_text: str
    corrected_payload: Optional[Dict[str, object]] = None

    def to_dict(self) -> Dict[str, object]:
        payload = {
            "id": self.entry_id,
            "user_text": self.user_text,
        }
        if self.corrected_payload is not None:
            payload["corrected_payload"] = self.corrected_payload
        return payload


class ConversationMemory:
    """Ring buffer that tracks the latest user prompts + reviewed payloads."""

    def __init__(self, max_turns: int = 10) -> None:
        self._entries: Deque[MemoryEntry] = deque(maxlen=max(1, max_turns))

    def append(self, user_text: str) -> MemoryEntry:
        entry = MemoryEntry(entry_id=uuid4().hex, user_text=(user_text or "").strip())
        self._entries.append(entry)
        return entry

    def update_payload(self, entry_id: str | None, payload: Optional[Dict[str, object]]) -> None:
        if not entry_id:
            return
        for entry in self._entries:
            if entry.entry_id == entry_id:
                entry.corrected_payload = payload
                break

    def history(self) -> List[Dict[str, object]]:
        return [entry.to_dict() for entry in self._entries if entry.user_text]

    def history_texts(self) -> List[str]:
        return [entry.user_text for entry in self._entries if entry.user_text]
