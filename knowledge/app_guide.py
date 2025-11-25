"""File-backed knowledge helpers introduced with Tier-3.

This module exposes a lightweight interface for reading and updating the
assistant's editable knowledge base. The implementation intentionally uses a
JSON file stored under ``data_pipeline`` so later tiers can swap the backend
for a database or RAG store without changing the call sites.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, MutableMapping, Optional

from core.tooling.query_helpers import tokenize_keywords

GuideEntryDict = Dict[str, str]
_DEFAULT_STORAGE_PATH = Path("data_pipeline/app_guide.json")


@dataclass
class GuideEntry:
    """Represent a single knowledge section entry."""

    id: str
    title: str
    content: str
    updated_at: str
    keywords: List[str] = field(default_factory=list)
    link: Optional[str] = None

    def to_dict(self) -> GuideEntryDict:
        """Return a JSON-serialisable dictionary."""

        payload = asdict(self)
        if not payload.get("link"):
            payload.pop("link", None)
        if not payload.get("keywords"):
            payload["keywords"] = []
        return payload


class AppGuideStore:
    """Manage the Notes knowledge base persisted to a JSON file."""

    def __init__(self, storage_path: Path | None = None) -> None:
        self._storage_path = storage_path or _DEFAULT_STORAGE_PATH
        self._section_order: List[str] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def list_sections(self) -> List[GuideEntryDict]:
        """Return every stored section respecting the configured order."""

        sections = self._load_sections()
        ordered_ids = self._ordered_ids(sections)
        return [sections[sid].to_dict() for sid in ordered_ids]

    def get_section(self, entry_id: str) -> Optional[GuideEntryDict]:
        """Return the stored section matching ``entry_id`` if it exists."""

        sections = self._load_sections()
        entry = sections.get(entry_id)
        return entry.to_dict() if entry else None

    def search_sections(self, keywords: str) -> List[GuideEntryDict]:
        tokens = tokenize_keywords(keywords)
        if not tokens:
            return []
        sections = self._load_sections()
        matches: List[GuideEntryDict] = []
        for entry in sections.values():
            haystack_parts = [entry.title, entry.content, " ".join(entry.keywords or [])]
            haystack = " ".join(part.lower() for part in haystack_parts if part)
            if all(token in haystack for token in tokens):
                matches.append(entry.to_dict())
        return matches

    def upsert_section(
        self,
        entry_id: str,
        title: str,
        content: str,
        *,
        keywords: Optional[List[str]] = None,
        link: Optional[str] = None,
        dry_run: bool = False,
    ) -> GuideEntryDict:
        """Insert or update a section entry in the knowledge base."""

        if not entry_id.strip():
            raise ValueError("id cannot be blank")
        if not title.strip():
            raise ValueError("title cannot be blank")

        normalized_keywords = [kw.strip() for kw in (keywords or []) if kw and kw.strip()]

        sections = self._load_sections()
        entry = GuideEntry(
            id=entry_id,
            title=title,
            content=content,
            updated_at=_utc_timestamp(),
            keywords=normalized_keywords,
            link=link or None,
        )
        if not dry_run:
            sections[entry_id] = entry
            self._ensure_order(sections, preferred_order=[entry_id])
            self._write_sections(sections)
        return entry.to_dict()

    def insert_note(
        self,
        entry_id: str,
        title: str,
        note: str,
        *,
        position: str = "top",
        keywords: Optional[List[str]] = None,
        link: Optional[str] = None,
        dry_run: bool = False,
    ) -> GuideEntryDict:
        """Insert a note into the requested section (prepending by default)."""

        if not entry_id.strip():
            raise ValueError("id cannot be blank")
        note_text = (note or "").strip()
        if not note_text:
            raise ValueError("content cannot be blank")

        sections = self._load_sections()
        entry = sections.get(entry_id)
        if not entry:
            entry = GuideEntry(
                id=entry_id,
                title=title.strip() or entry_id,
                content="",
                updated_at=_utc_timestamp(),
                keywords=[],
                link=None,
            )
        elif title.strip():
            entry.title = title.strip()

        existing = entry.content.strip()
        if existing:
            if position == "bottom":
                entry.content = f"{existing}\n\n{note_text}"
            else:
                entry.content = f"{note_text}\n\n{existing}"
        else:
            entry.content = note_text

        if keywords is not None:
            merged = {kw.strip() for kw in entry.keywords or [] if kw.strip()}
            merged.update({kw.strip() for kw in keywords if kw and kw.strip()})
            entry.keywords = sorted(merged)
        if link is not None:
            entry.link = link or None

        entry.updated_at = _utc_timestamp()
        if not dry_run:
            sections[entry_id] = entry
            self._ensure_order(sections, preferred_order=[entry_id])
            self._write_sections(sections)
        return entry.to_dict()
    
    def overwrite_section(
        self,
        entry_id: str,
        title: str,
        content: str,
        *,
        keywords: Optional[List[str]] = None,
        link: Optional[str] = None,
        dry_run: bool = False,
    ) -> GuideEntryDict:
        """Overwrite a section with new content."""

        if not entry_id.strip():
            raise ValueError("id cannot be blank")
        sections = self._load_sections()
        existing = sections.get(entry_id)
        if not existing:
            raise ValueError(f"Section '{entry_id}' does not exist.")
        normalized_keywords = [
            kw.strip()
            for kw in (keywords if keywords is not None else existing.keywords or [])
            if kw and kw.strip()
        ]
        entry = GuideEntry(
            id=entry_id,
            title=title or existing.title,
            content=content,
            updated_at=_utc_timestamp(),
            keywords=normalized_keywords,
            link=link if link is not None else existing.link,
        )
        if not dry_run:
            sections[entry_id] = entry
            self._write_sections(sections)
        return entry.to_dict()

    def delete_section(self, entry_id: str, *, dry_run: bool = False) -> bool:
        """Remove a section from the knowledge base.

        Returns ``True`` when a section was deleted and ``False`` otherwise.
        """

        sections = self._load_sections()
        if entry_id not in sections:
            return False
        if not dry_run:
            del sections[entry_id]
            if entry_id in self._section_order:
                self._section_order = [sid for sid in self._section_order if sid != entry_id]
            self._write_sections(sections)
        return True

    def find_by_title(self, title: str) -> Optional[GuideEntryDict]:
        """Return the first entry matching ``title`` (case-insensitive) if it exists."""

        title_norm = title.strip().lower()
        if not title_norm:
            return None
        sections = self._load_sections()
        for entry in sections.values():
            if entry.title.strip().lower() == title_norm:
                return entry.to_dict()
        return None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _load_sections(self) -> Dict[str, GuideEntry]:
        """Read the JSON file and return a mapping of id to entry."""

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
            raise ValueError("Invalid notes format: 'sections' must be a mapping")
        order_raw = payload.get("order")
        order: List[str] = []
        if isinstance(order_raw, list):
            for item in order_raw:
                if isinstance(item, str) and item.strip():
                    order.append(item.strip())
        sections: Dict[str, GuideEntry] = {}
        for section_key, item in sections_raw.items():
            if not isinstance(section_key, str):
                raise ValueError("Invalid notes format: section keys must be strings")
            if not isinstance(item, MutableMapping):
                raise ValueError(f"Invalid section payload for '{section_key}'")
            entry_id = str(item.get("id") or section_key)
            entry = GuideEntry(
                id=entry_id,
                title=str(item.get("title", "")),
                content=str(item.get("content", "")),
                updated_at=str(item.get("updated_at", "")),
                keywords=_coerce_keywords(item.get("keywords")),
                link=str(item.get("link", "")).strip() or None,
            )
            sections[entry_id] = entry
        self._ensure_order(sections, preferred_order=order)
        return sections

    def _write_sections(self, sections: Dict[str, GuideEntry]) -> None:
        """Persist the provided sections atomically."""

        ordered_ids = self._ordered_ids(sections)
        payload = {
            "sections": {sid: sections[sid].to_dict() for sid in ordered_ids},
            "order": ordered_ids,
        }
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self._storage_path.with_suffix(self._storage_path.suffix + ".tmp")
        tmp_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")
        os.replace(tmp_path, self._storage_path)

    def _ordered_ids(self, sections: Dict[str, GuideEntry]) -> List[str]:
        if not self._section_order:
            return sorted(sections)
        # ensure only existing ids in order, append missing at end
        ordered = [sid for sid in self._section_order if sid in sections]
        for sid in sections:
            if sid not in ordered:
                ordered.append(sid)
        self._section_order = ordered
        return ordered

    def _ensure_order(self, sections: Dict[str, GuideEntry], preferred_order: Optional[List[str]] = None) -> None:
        if preferred_order:
            for sid in preferred_order:
                if sid and sid not in self._section_order:
                    self._section_order.append(sid)
        for sid in sections:
            if sid not in self._section_order:
                self._section_order.append(sid)


def _utc_timestamp() -> str:
    """Return the current UTC timestamp in ISO-8601 format."""

    return datetime.now(timezone.utc).isoformat()


def _coerce_keywords(value: object) -> List[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value).strip()
    if not text:
        return []
    return [token.strip() for token in text.split(",") if token.strip()]


__all__ = ["AppGuideStore", "GuideEntry", "GuideEntryDict"]
