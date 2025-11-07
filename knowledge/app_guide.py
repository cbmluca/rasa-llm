"""File-backed knowledge helpers introduced with Tier-3.

This module exposes a lightweight interface for reading and updating the
assistant's editable knowledge base. The implementation intentionally uses a
JSON file stored under ``data_pipeline`` so later tiers can swap the backend
for a database or RAG store without changing the call sites.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, MutableMapping, Optional

GuideEntryDict = Dict[str, str]
_DEFAULT_STORAGE_PATH = Path("data_pipeline/app_guide.json")


@dataclass
class GuideEntry:
    """Represent a single knowledge section entry."""

    section_id: str
    title: str
    content: str
    updated_at: str

    def to_dict(self) -> GuideEntryDict:
        """Return a JSON-serialisable dictionary."""

        return asdict(self)


class AppGuideStore:
    """Manage the Tier-3 knowledge base persisted to a JSON file."""

    def __init__(self, storage_path: Path | None = None) -> None:
        self._storage_path = storage_path or _DEFAULT_STORAGE_PATH

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def list_sections(self) -> List[GuideEntryDict]:
        """Return every stored section as a list sorted by section_id."""

        sections = self._load_sections()
        return [sections[sid].to_dict() for sid in sorted(sections)]

    def get_section(self, section_id: str) -> Optional[GuideEntryDict]:
        """Return the stored section matching ``section_id`` if it exists."""

        sections = self._load_sections()
        entry = sections.get(section_id)
        return entry.to_dict() if entry else None

    def upsert_section(self, section_id: str, title: str, content: str) -> GuideEntryDict:
        """Insert or update a section entry in the knowledge base."""

        if not section_id.strip():
            raise ValueError("section_id cannot be blank")
        if not title.strip():
            raise ValueError("title cannot be blank")

        sections = self._load_sections()
        entry = GuideEntry(
            section_id=section_id,
            title=title,
            content=content,
            updated_at=_utc_timestamp(),
        )
        sections[section_id] = entry
        self._write_sections(sections)
        return entry.to_dict()

    def delete_section(self, section_id: str) -> bool:
        """Remove a section from the knowledge base.

        Returns ``True`` when a section was deleted and ``False`` otherwise.
        """

        sections = self._load_sections()
        if section_id not in sections:
            return False
        del sections[section_id]
        self._write_sections(sections)
        return True

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _load_sections(self) -> Dict[str, GuideEntry]:
        """Read the JSON file and return a mapping of section_id to entry."""

        if not self._storage_path.exists():
            return {}
        try:
            raw = self._storage_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return {}
        if not raw.strip():
            return {}
        payload = json.loads(raw)
        sections_raw = payload.get("sections", {})
        if not isinstance(sections_raw, MutableMapping):
            raise ValueError("Invalid app guide format: 'sections' must be a mapping")
        sections: Dict[str, GuideEntry] = {}
        for section_id, item in sections_raw.items():
            if not isinstance(section_id, str):
                raise ValueError("Invalid app guide format: section keys must be strings")
            if not isinstance(item, MutableMapping):
                raise ValueError(f"Invalid section payload for '{section_id}'")
            entry = GuideEntry(
                section_id=section_id,
                title=str(item.get("title", "")),
                content=str(item.get("content", "")),
                updated_at=str(item.get("updated_at", "")),
            )
            sections[section_id] = entry
        return sections

    def _write_sections(self, sections: Dict[str, GuideEntry]) -> None:
        """Persist the provided sections atomically."""

        payload = {"sections": {sid: entry.to_dict() for sid, entry in sections.items()}}
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self._storage_path.with_suffix(self._storage_path.suffix + ".tmp")
        tmp_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")
        os.replace(tmp_path, self._storage_path)


def _utc_timestamp() -> str:
    """Return the current UTC timestamp in ISO-8601 format."""

    return datetime.now(timezone.utc).isoformat()


__all__ = ["AppGuideStore", "GuideEntry", "GuideEntryDict"]
