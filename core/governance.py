"""Load and enforce repository-level governance policies."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import yaml


class GovernancePolicyError(RuntimeError):
    """Raised when the governance policy file is missing or invalid."""


class GovernancePolicyViolation(RuntimeError):
    """Raised when a runtime request violates the active governance policy."""

    def __init__(
        self,
        *,
        policy_version: str,
        reason: str,
        violation_type: str = "tool",
        tool: Optional[str] = None,
        message: Optional[str] = None,
    ) -> None:
        detail = message or reason
        super().__init__(detail)
        self.policy_version = policy_version
        self.reason = reason
        self.violation_type = violation_type
        self.tool = tool
        self.user_message = detail

    def to_metadata(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "type": self.violation_type,
            "reason": self.reason,
        }
        if self.tool:
            payload["tool"] = self.tool
        return payload


class GovernancePolicy:
    """Represents the loaded governance policy document."""

    def __init__(self, path: Path | str, *, data: Optional[Mapping[str, Any]] = None) -> None:
        self._path = Path(path)
        raw = data if data is not None else self._read_yaml()
        self._policy = self._validate(raw)
        self._policy_version: str = self._policy["policy_version"]
        self._allowed_models = tuple(self._policy["allowed_models"])
        self._allowed_tools = tuple(self._policy["allowed_tools"])
        self._retention_limits = dict(self._policy["retention_max_entries"])
        self._reviewer_roles = tuple(self._policy["reviewer_roles"])
        self._pii_patterns: List[Tuple[re.Pattern[str], str]] = self._compile_pii_rules(self._policy["pii_rules"])
        self._allowed_models_lower = {value.lower() for value in self._allowed_models}
        self._allowed_tools_lower = {value.lower() for value in self._allowed_tools}

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "GovernancePolicy":
        """Instantiate a policy directly from a dictionary (primarily for tests)."""

        return cls(path=Path("<in-memory>"), data=data)

    @property
    def policy_version(self) -> str:
        return self._policy_version

    @property
    def reviewer_roles(self) -> Sequence[Mapping[str, Any]]:
        return self._reviewer_roles

    @property
    def allowed_tools(self) -> Tuple[str, ...]:
        return self._allowed_tools

    @property
    def allowed_models(self) -> Tuple[str, ...]:
        return self._allowed_models

    @property
    def retention_limits(self) -> Dict[str, int]:
        return dict(self._retention_limits)

    def is_model_allowed(self, model_name: str) -> bool:
        """Return True when the provided LLM identifier is permitted by the policy."""

        if not model_name:
            return False
        return model_name.strip().lower() in self._allowed_models_lower

    def is_tool_allowed(self, tool_name: str) -> bool:
        """Return True when the orchestrator may invoke the requested tool."""

        if not tool_name:
            return False
        return tool_name.strip().lower() in self._allowed_tools_lower

    def ensure_tool_allowed(self, tool_name: str) -> None:
        """Raise ``GovernancePolicyViolation`` when a tool is disallowed."""

        if not tool_name:
            return
        if not self.is_tool_allowed(tool_name):
            raise GovernancePolicyViolation(
                policy_version=self._policy_version,
                reason=f"Tool '{tool_name}' is disabled by governance policy.",
                violation_type="tool",
                tool=tool_name,
            )

    def get_retention_limit(self, bucket: str, *, default: int = 0) -> int:
        """Return the policy-defined max entry count for a bucket."""

        if not bucket:
            return default
        return int(self._retention_limits.get(bucket, default))

    def mask_pii(self, payload: Any) -> Any:
        """Recursively replace sensitive substrings based on configured PII rules."""

        return self._mask_value(payload)

    def _mask_value(self, value: Any) -> Any:
        if isinstance(value, str):
            return self._mask_string(value)
        if isinstance(value, list):
            return [self._mask_value(entry) for entry in value]
        if isinstance(value, tuple):
            return tuple(self._mask_value(entry) for entry in value)
        if isinstance(value, dict):
            return {key: self._mask_value(entry) for key, entry in value.items()}
        return value

    def _mask_string(self, text: str) -> str:
        masked = text
        for pattern, replacement in self._pii_patterns:
            masked = pattern.sub(replacement, masked)
        return masked

    def _compile_pii_rules(self, rules: Sequence[Mapping[str, Any]]) -> List[Tuple[re.Pattern[str], str]]:
        compiled: List[Tuple[re.Pattern[str], str]] = []
        for idx, rule in enumerate(rules):
            pattern = rule.get("pattern")
            replacement = rule.get("replacement")
            if not isinstance(pattern, str) or not pattern.strip():
                raise GovernancePolicyError(f"pii_rules[{idx}] is missing a valid 'pattern'.")
            if not isinstance(replacement, str):
                raise GovernancePolicyError(f"pii_rules[{idx}] is missing a string 'replacement'.")
            try:
                compiled.append((re.compile(pattern, re.IGNORECASE), replacement))
            except re.error as exc:  # pragma: no cover - defensive guard
                raise GovernancePolicyError(f"Invalid regex in pii_rules[{idx}]: {exc}") from exc
        return compiled

    def _read_yaml(self) -> Mapping[str, Any]:
        if not self._path.exists():
            raise GovernancePolicyError(f"Governance file not found: {self._path}")
        text = self._path.read_text(encoding="utf-8")
        data = yaml.safe_load(text) or {}
        if not isinstance(data, Mapping):
            raise GovernancePolicyError("Governance policy must be a mapping.")
        return data

    def _validate(self, raw: Mapping[str, Any]) -> Dict[str, Any]:
        policy_version = self._normalize_string(raw.get("policy_version")) or "unspecified"
        allowed_models = self._normalize_string_list(raw.get("allowed_models"))
        allowed_tools = self._normalize_string_list(raw.get("allowed_tools"))
        retention_limits = self._normalize_retention_limits(raw.get("retention_max_entries"))
        reviewer_roles = self._normalize_roles(raw.get("reviewer_roles"))
        pii_rules = self._normalize_pii_rules(raw.get("pii_rules"))

        return {
            "policy_version": policy_version,
            "allowed_models": allowed_models,
            "allowed_tools": allowed_tools,
            "retention_max_entries": retention_limits,
            "reviewer_roles": reviewer_roles,
            "pii_rules": pii_rules,
        }

    def _normalize_string(self, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    def _normalize_string_list(self, values: Any) -> List[str]:
        if values is None:
            return []
        if not isinstance(values, Iterable) or isinstance(values, (str, bytes)):
            raise GovernancePolicyError("String list values must be sequences.")
        normalized: List[str] = []
        for item in values:
            text = self._normalize_string(item)
            if text:
                normalized.append(text)
        return normalized

    def _normalize_retention_limits(self, value: Any) -> Dict[str, int]:
        if value is None:
            return {}
        if not isinstance(value, Mapping):
            raise GovernancePolicyError("retention_max_entries must be a mapping.")
        result: Dict[str, int] = {}
        for key, raw in value.items():
            normalized_key = self._normalize_string(key)
            if not normalized_key:
                continue
            try:
                days = int(raw)
            except (TypeError, ValueError):
                raise GovernancePolicyError(f"Invalid retention value for '{normalized_key}'.")
            result[normalized_key] = max(days, 0)
        return result

    def _normalize_roles(self, roles: Any) -> List[Dict[str, Any]]:
        if roles is None:
            return []
        if not isinstance(roles, Sequence):
            raise GovernancePolicyError("reviewer_roles must be a list.")
        normalized: List[Dict[str, Any]] = []
        for idx, role in enumerate(roles):
            if not isinstance(role, Mapping):
                raise GovernancePolicyError(f"reviewer_roles[{idx}] must be a mapping.")
            role_id = self._normalize_string(role.get("id"))
            if not role_id:
                raise GovernancePolicyError(f"reviewer_roles[{idx}] is missing an 'id'.")
            permissions = self._normalize_string_list(role.get("permissions"))
            normalized.append(
                {
                    "id": role_id,
                    "name": self._normalize_string(role.get("name")) or role_id,
                    "permissions": permissions,
                }
            )
        return normalized

    def _normalize_pii_rules(self, rules: Any) -> List[Dict[str, Any]]:
        if rules is None:
            return []
        if not isinstance(rules, Sequence):
            raise GovernancePolicyError("pii_rules must be a list.")
        normalized: List[Dict[str, Any]] = []
        for idx, rule in enumerate(rules):
            if not isinstance(rule, Mapping):
                raise GovernancePolicyError(f"pii_rules[{idx}] must be a mapping.")
            normalized.append(
                {
                    "pattern": self._normalize_string(rule.get("pattern")),
                    "replacement": str(rule.get("replacement") or ""),
                }
            )
        return normalized


def load_governance_policy(path: Path | str) -> GovernancePolicy:
    """Convenience helper mirroring other config loaders."""

    return GovernancePolicy(path)
