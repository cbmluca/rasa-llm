"""Helpers for recording Tier-7 voice inbox entries."""

from __future__ import annotations

from dataclasses import dataclass, asdict
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

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def append_voice_inbox_entry(path: Path, entry: VoiceInboxEntry) -> VoiceInboxEntry:
    """Append ``entry`` to ``path`` preserving prior rows."""

    rows: List[Dict[str, Any]] = read_json(path, default=[])
    rows.append(entry.to_dict())
    atomic_write_json(path, rows)
    return entry


def build_voice_entry(
    *,
    entry_id: str,
    audio_path: Path,
    text: str,
    status: str,
    reviewer_id: Optional[str] = None,
    pending_id: Optional[str] = None,
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
    )


__all__ = ["VoiceInboxEntry", "append_voice_inbox_entry", "build_voice_entry"]
