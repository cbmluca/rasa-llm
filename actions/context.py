"""Context helpers for accessing tracker slots and persisted tool state."""

import json
from typing import Optional, List, Dict, Any

from rasa_sdk import Tracker
from rasa_sdk.events import SlotSet

class Ctx:
    def __init__(self, tracker: Tracker):
        self.t = tracker

    # --- Slot helper utilities --------------------------------------------------
    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        val = self.t.get_slot(key)
        return val if isinstance(val, str) and val.strip() else default

    def set(self, key: str, value: Optional[str]) -> List[SlotSet]:
        v = (value or "").strip() or None
        return [SlotSet(key, v)]

    # --- JSON blob utilities for tool state ------------------------------------
    def _load_blob(self) -> Dict[str, Any]:
        raw = self.get("ctx_blob", "{}") or "{}"
        try:
            data = json.loads(raw)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _dump_blob(self, data: Dict[str, Any]) -> List[SlotSet]:
        return self.set("ctx_blob", json.dumps(data, ensure_ascii=False))

    def get_tool(self, tool: str) -> Dict[str, Any]:
        blob = self._load_blob()
        node = blob.get(tool, {})
        return node if isinstance(node, dict) else {}

    def update_tool(self, tool: str, **kv) -> List[SlotSet]:
        blob = self._load_blob()
        node = blob.get(tool, {})
        if not isinstance(node, dict):
            node = {}
        for k, v in kv.items():
            if v is None or (isinstance(v, str) and not v.strip()):
                continue
            node[k] = v
        blob[tool] = node
        return self._dump_blob(blob)