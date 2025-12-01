"""Helpers for recording Tier-7 voice inbox entries."""

from __future__ import annotations

from dataclasses import dataclass, asdict
from dataclasses import fields
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.json_storage import atomic_write_json, read_json


@dataclass(frozen=True)
class VoiceInboxEntry:
    """Structured record for a stored voice submission."""

    id: str
    timestamp: str
    audio_path: str
    transcribed_text: str
    status: str
    reviewer_id: Optional[str] = None
    pending_id: Optional[str] = None
    voice_minutes: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, raw: Dict[str, Any]) -> "VoiceInboxEntry":
        """Build an entry from JSON data, ignoring unknown keys."""

        allowed = {field.name for field in fields(cls)}
        filtered = {key: raw.get(key) for key in allowed if key in raw}
        return cls(**filtered)


def append_voice_inbox_entry(
    path: Path, entry: VoiceInboxEntry, *, max_entries: Optional[int] = None
) -> VoiceInboxEntry:
    """Append ``entry`` to ``path`` while trimming once the store exceeds ``max_entries``."""

    rows: List[Dict[str, Any]] = read_json(path, default=[])
    rows.append(entry.to_dict())
    if max_entries and len(rows) > max_entries:
        rows = rows[-max_entries:]
    atomic_write_json(path, rows)
    return entry


def read_voice_inbox_entries(path: Path) -> List[VoiceInboxEntry]:
    """Load all voice inbox rows as structured entries."""

    raw_rows: List[Dict[str, Any]] = read_json(path, default=[])
    entries: List[VoiceInboxEntry] = []
    for row in raw_rows:
        try:
            entries.append(VoiceInboxEntry.from_dict(row))
        except TypeError:
            continue
    return entries


def write_voice_inbox_entries(path: Path, entries: List[VoiceInboxEntry]) -> None:
    """Persist ``entries`` to disk with atomic replacement."""

    atomic_write_json(path, [entry.to_dict() for entry in entries])


def find_voice_entry(entries: List[VoiceInboxEntry], entry_id: str) -> VoiceInboxEntry | None:
    """Return the row matching ``entry_id`` or None if missing."""

    for entry in entries:
        if entry.id == entry_id:
            return entry
    return None


def delete_voice_entry(path: Path, entry_id: str) -> VoiceInboxEntry | None:
    """Remove and return the entry with ``entry_id`` if it exists."""

    entries = read_voice_inbox_entries(path)
    remaining: List[VoiceInboxEntry] = []
    deleted: VoiceInboxEntry | None = None
    for entry in entries:
        if deleted is None and entry.id == entry_id:
            deleted = entry
            continue
        remaining.append(entry)
    if deleted:
        write_voice_inbox_entries(path, remaining)
    return deleted


def estimate_voice_minutes(payload_size: int) -> float:
    """Return an approximate Whisper billing minutes based on payload size."""

    if payload_size <= 0:
        return 0.0
    minutes = payload_size / 1_920_000
    return round(minutes, 3)


def build_voice_entry(
    *,
    entry_id: str,
    audio_path: Path,
    text: str,
    status: str,
    reviewer_id: Optional[str] = None,
    pending_id: Optional[str] = None,
    voice_minutes: float = 0.0,
) -> VoiceInboxEntry:
    """Factory that stamps timestamps + normalization for inbox rows."""

    timestamp = datetime.now(tz=timezone.utc).isoformat()
    return VoiceInboxEntry(
        id=entry_id,
        timestamp=timestamp,
        audio_path=str(audio_path),
        transcribed_text=text,
        status=status,
        reviewer_id=reviewer_id,
        pending_id=pending_id,
        voice_minutes=voice_minutes,
    )


__all__ = [
    "VoiceInboxEntry",
    "append_voice_inbox_entry",
    "build_voice_entry",
    "read_voice_inbox_entries",
    "write_voice_inbox_entries",
    "find_voice_entry",
    "delete_voice_entry",
    "estimate_voice_minutes",
]
