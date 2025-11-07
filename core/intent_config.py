"""Utilities for loading canonical intent definitions used by Tier-4 tooling."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional

try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover - PyYAML is optional
    yaml = None  # type: ignore


DEFAULT_INTENT_CONFIG = Path("config/intents.yml")


@dataclass(frozen=True)
class IntentDefinition:
    """Describe a single intent and the tool it should trigger."""

    name: str
    tool: Optional[str]
    description: str = ""


class IntentConfig:
    """Access helpers for working with the canonical intent definitions."""

    def __init__(self, intents: Iterable[IntentDefinition]) -> None:
        lookup = {intent.name: intent for intent in intents}
        if not lookup:
            raise ValueError("IntentConfig requires at least one intent definition.")
        self._intents: Dict[str, IntentDefinition] = lookup

    def get(self, name: str) -> Optional[IntentDefinition]:
        return self._intents.get(name)

    def tool_for(self, name: str) -> Optional[str]:
        definition = self.get(name)
        if not definition:
            return None
        return definition.tool

    def names(self) -> List[str]:
        return list(self._intents.keys())

    def definitions(self) -> List[IntentDefinition]:
        return list(self._intents.values())


def load_intent_config(path: Path | str | None = None) -> IntentConfig:
    """Load the YAML intent config into an ``IntentConfig`` instance."""

    target = Path(path) if path else DEFAULT_INTENT_CONFIG
    if not target.exists():
        raise FileNotFoundError(f"Intent config not found: {target}")

    raw = target.read_text(encoding="utf-8")
    data = _parse_yaml_or_json(raw, target)
    intents_payload = data.get("intents")
    if not isinstance(intents_payload, list):
        raise ValueError("Intent config must define a top-level 'intents' list.")

    intents: list[IntentDefinition] = []
    for entry in intents_payload:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        tool = entry.get("tool")
        description = entry.get("description", "")
        if not name:
            continue
        intents.append(IntentDefinition(name=name, tool=tool, description=description))

    if not intents:
        raise ValueError("Intent config did not yield any valid intent definitions.")
    return IntentConfig(intents)


def _parse_yaml_or_json(raw: str, source: Path) -> Dict[str, object]:
    if yaml is not None:  # pragma: no cover - exercised in integration tests
        data = yaml.safe_load(raw)
        if isinstance(data, dict):
            return data
        raise ValueError(f"Unsupported YAML document shape in {source}")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:  # pragma: no cover - only hit if PyYAML missing
        raise RuntimeError(
            f"Unable to parse {source} without PyYAML installed. "
            "Install PyYAML or ensure the file is valid JSON."
        ) from exc

    if not isinstance(parsed, dict):
        raise ValueError(f"Intent config {source} must be a mapping at the top level.")
    return parsed


__all__ = ["IntentDefinition", "IntentConfig", "load_intent_config", "DEFAULT_INTENT_CONFIG"]
