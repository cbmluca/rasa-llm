from pathlib import Path

import pytest

from core.governance import GovernancePolicy, GovernancePolicyError, GovernancePolicyViolation
from core.orchestrator import Orchestrator
from core.nlu_service import NLUResult
from core.tool_registry import ToolRegistry


def _base_policy_dict() -> dict:
    return {
        "policy_version": "test-policy",
        "allowed_models": ["gpt-4o-mini"],
        "allowed_tools": ["weather"],
        "retention_max_entries": {"turn_logs": 200},
        "reviewer_roles": [],
        "pii_rules": [{"pattern": r"secret", "replacement": "[MASKED]"}],
    }


def test_governance_policy_loads_from_yaml(tmp_path: Path) -> None:
    policy_path = tmp_path / "policy.yml"
    policy_path.write_text(
        """policy_version: v1
allowed_models:
  - gpt-4o-mini
allowed_tools:
  - weather
  - todo_list
retention_max_entries:
  turn_logs: 150
reviewer_roles:
  - id: lead
    name: Lead Reviewer
    permissions:
      - approve
pii_rules:
  - pattern: email@example.com
    replacement: "[REDACTED_EMAIL]"
""",
        encoding="utf-8",
    )

    policy = GovernancePolicy(policy_path)

    assert policy.policy_version == "v1"
    assert policy.is_model_allowed("gpt-4o-mini")
    assert policy.is_tool_allowed("TODO_LIST")
    assert policy.get_retention_limit("turn_logs") == 150
    assert policy.get_retention_limit("missing", default=3) == 3


def test_governance_policy_validates_schema() -> None:
    bad_payload = _base_policy_dict()
    bad_payload["allowed_models"] = "gpt-4o"
    with pytest.raises(GovernancePolicyError):
        GovernancePolicy.from_dict(bad_payload)


def test_mask_pii_rewrites_nested_payloads() -> None:
    policy = GovernancePolicy.from_dict(_base_policy_dict())
    payload = {
        "note": "secret",
        "items": ["keep", "SECRET"],
        "nested": {"value": "secret SECRET"},
    }

    masked = policy.mask_pii(payload)

    assert payload["note"] == "secret"
    assert masked["note"] == "[MASKED]"
    assert masked["items"][1] == "[MASKED]"
    assert masked["nested"]["value"].count("[MASKED]") == 2


def test_policy_ensure_tool_allowed_raises_violation() -> None:
    policy = GovernancePolicy.from_dict(
        {
            "policy_version": "policy-test",
            "allowed_models": ["gpt-4o-mini"],
            "allowed_tools": ["news"],
            "retention_max_entries": {},
            "reviewer_roles": [],
            "pii_rules": [],
        }
    )
    with pytest.raises(GovernancePolicyViolation):
        policy.ensure_tool_allowed("weather")


class _StubNLU:
    def parse(self, message: str) -> NLUResult:
        return NLUResult(intent="weather", confidence=0.9, entities={})

    def is_confident(self, result: NLUResult) -> bool:
        return True

    def build_payload(self, result: NLUResult, message: str) -> dict:
        return {"city": "copenhagen"}

    def build_metadata(self, result: NLUResult) -> dict:
        return {}


class _StubRouter:
    def route(self, message: str) -> dict:
        return {"type": "none"}

    def general_answer(self, message: str) -> str:
        return "fallback"

    def suggest_tool(self, message: str) -> None:
        return None


def test_orchestrator_returns_policy_violation_for_blocked_tool() -> None:
    policy = GovernancePolicy.from_dict(
        {
            "policy_version": "policy-test",
            "allowed_models": ["gpt-4o-mini"],
            "allowed_tools": ["todo_list"],
            "retention_max_entries": {},
            "reviewer_roles": [],
            "pii_rules": [],
        }
    )
    registry = ToolRegistry()

    def _weather_tool(payload: dict, *, dry_run: bool = False) -> dict:
        return {"action": "forecast", "city": payload.get("city")}

    registry.register_tool("weather", _weather_tool)
    orchestrator = Orchestrator(
        nlu=_StubNLU(),
        registry=registry,
        router=_StubRouter(),
        governance_policy=policy,
    )

    response = orchestrator.handle_message_with_details("check weather")

    assert response.resolution_status == "policy_violation"
    assert response.review_reason == "policy_violation"
    assert response.extras["policy_version"] == "policy-test"
    assert response.extras["policy_violation"]["tool"] == "weather"
