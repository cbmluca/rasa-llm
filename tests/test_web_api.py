from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

from app.web_api import create_app
from core.nlu_service import NLUResult
from core.orchestrator import OrchestratorResponse
from core.voice_inbox import build_voice_entry
from core.governance import GovernancePolicy, GovernancePolicyViolation


class StubOrchestrator:
    def __init__(self) -> None:
        self.tool_calls: list[tuple[str, dict]] = []
        self.blocked_tools: set[str] = set()

    def handle_message_with_details(self, message: str) -> OrchestratorResponse:
        result = NLUResult(intent="weather", confidence=0.9, entities={"city": "copenhagen"})
        return OrchestratorResponse(
            text="It is sunny",
            user_text=message,
            nlu_result=result,
            extras={"resolved_tool": "weather", "invocation_source": "nlu"},
            tool_name="weather",
            tool_payload={"city": "copenhagen"},
            tool_result={"action": "forecast", "city": "copenhagen"},
            tool_success=True,
            resolution_status="tool:nlu",
            fallback_triggered=False,
            latency_ms=10,
            metadata=None,
            review_reason=None,
            response_summary="It is sunny",
        )

    def run_tool(self, tool_name: str, payload: dict, *, dry_run: bool = False) -> dict:
        self.tool_calls.append((tool_name, payload))
        if tool_name in self.blocked_tools:
            raise GovernancePolicyViolation(
                policy_version="test",
                violation_type="tool",
                reason=f"Tool '{tool_name}' is disabled.",
                tool=tool_name,
            )
        if tool_name == "todo_list":
            return {"todos": [{"id": "1", "title": "Test", "status": "pending", "owner": "LCBM"}], "count": 1}
        if tool_name == "kitchen_tips":
            return {"tips": []}
        if tool_name == "calendar_edit":
            return {"events": []}
        if tool_name == "app_guide":
            return {"sections": []}
        return {}


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row))
            handle.write("\n")


def build_client(
    tmp_path: Path,
    orchestrator: StubOrchestrator | None = None,
    policy: GovernancePolicy | None = None,
    username: str | None = "LCBM",
    password: str = "testing123",
) -> TestClient:
    pending = tmp_path / "pending.jsonl"
    labeled = tmp_path / "labeled.jsonl"
    turn_log = tmp_path / "turns.jsonl"
    static_dir = tmp_path / "static"
    export_dir = tmp_path / "exports"
    voice_inbox_path = tmp_path / "voice_inbox.json"
    voice_upload_dir = tmp_path / "voice_uploads"
    static_dir.mkdir(parents=True, exist_ok=True)
    export_dir.mkdir(parents=True, exist_ok=True)
    (static_dir / "index.html").write_text("<html></html>", encoding="utf-8")
    orchestrator = orchestrator or StubOrchestrator()
    policy = policy or GovernancePolicy.from_dict(
        {
            "policy_version": "test",
            "allowed_models": ["gpt-4o-mini"],
            "allowed_tools": ["weather", "todo_list", "kitchen_tips", "calendar_edit", "app_guide", "news"],
            "retention_max_entries": {"turn_logs": 200, "pending_queue": 200, "corrected_prompts": 200, "tool_stores": 200},
            "reviewer_roles": [],
            "pii_rules": [],
        }
    )
    app = create_app(
        orchestrator=orchestrator,
        pending_path=pending,
        labeled_path=labeled,
        turn_log_path=turn_log,
        static_dir=static_dir,
        export_dir=export_dir,
        voice_inbox_path=voice_inbox_path,
        voice_upload_dir=voice_upload_dir,
        governance_policy=policy,
        purge_state_path=tmp_path / "purge_state.json",
    )
    client = TestClient(app)
    if username:
        response = client.post("/api/login", json={"username": username, "password": password})
        assert response.status_code == 200, f"login failed: {response.text}"
    return client


def test_chat_endpoint_returns_trace(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    response = client.post("/api/chat", json={"message": "weather tomorrow"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["reply"] == "It is sunny"
    assert payload["tool"]["name"] == "weather"
    assert payload["extras"]["resolved_tool"] == "weather"
    expected_user = client.app.state.default_admin_user
    assert payload["extras"]["reviewer_id"] == expected_user
    assert payload["extras"]["user_id"] == expected_user
    assert payload["reviewer_id"] == expected_user
    assert payload["user_id"] == expected_user
    assert payload.get("pending_record", {}).get("reviewer_id") == expected_user
    assert payload["extras"]["policy_version"] == "test"
    assert payload["policy_version"] == "test"


def test_chat_endpoint_reports_custom_user(tmp_path: Path) -> None:
    client = build_client(tmp_path, username="test1", password="test1")
    response = client.post("/api/chat", json={"message": "hi"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["reviewer_id"] == "test1"
    assert payload["user_id"] == "test1"


def test_chat_requires_login(tmp_path: Path) -> None:
    orchestrator = StubOrchestrator()
    client = TestClient(
        create_app(
            orchestrator=orchestrator,
            pending_path=tmp_path / "pending.jsonl",
            labeled_path=tmp_path / "labeled.jsonl",
            turn_log_path=tmp_path / "turns.jsonl",
            static_dir=tmp_path / "static",
            export_dir=tmp_path / "exports",
            voice_inbox_path=tmp_path / "voice_inbox.json",
            voice_upload_dir=tmp_path / "voice_uploads",
            reviewer_token="secret-token",
            governance_policy=GovernancePolicy.from_dict(
                {
                    "policy_version": "test",
                    "allowed_models": ["gpt-4o-mini"],
                    "allowed_tools": ["weather", "todo_list", "kitchen_tips", "calendar_edit", "app_guide", "news"],
                    "retention_max_entries": {"turn_logs": 200, "pending_queue": 200, "corrected_prompts": 200, "tool_stores": 200},
                    "reviewer_roles": [],
                    "pii_rules": [],
                }
            ),
            purge_state_path=tmp_path / "purge_state.json",
        )
    )
    response = client.post("/api/chat", json={"message": "hi"})
    assert response.status_code == 401


def test_chat_persists_reviewer_id_in_pending_file(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    response = client.post("/api/chat", json={"message": "weather tomorrow"})
    assert response.status_code == 200
    pending_path = client.app.state.pending_path
    rows = pending_path.read_text(encoding="utf-8").strip().splitlines()
    record = json.loads(rows[-1])
    assert record["reviewer_id"] == client.app.state.default_admin_user


def test_logs_routes_return_written_data(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    pending_path = client.app.state.pending_path
    labeled_path = client.app.state.labeled_path
    turn_log_path = client.app.state.turn_log_path

    _write_jsonl(
        pending_path,
        [
            {"user_text": "hello", "intent": "nlu_fallback", "reason": "low_confidence", "timestamp": "2024-01-01T00:00:00Z"},
        ],
    )
    _write_jsonl(
        labeled_path,
        [
            {"timestamp": "2024-01-01T00:01:00Z", "text": "hello", "parser_intent": "nlu_fallback", "reviewer_intent": "weather"}
        ],
    )
    _write_jsonl(
        turn_log_path,
        [
            {
                "timestamp": "2024-01-01T00:02:00Z",
                "user_text": "check weather",
                "intent": "weather",
                "tool_success": False,
                "resolution_status": "tool_error",
                "extras": {"invocation_source": "classifier", "classifier_intent": "weather", "classifier_confidence": 0.8},
            }
        ],
    )

    pending = client.get("/api/logs/pending").json()
    assert pending["items"][0]["user_text"] == "hello"

    labeled = client.get("/api/logs/labeled").json()
    assert labeled["items"][0]["reviewer_intent"] == "weather"

    classifier = client.get("/api/logs/classifier").json()
    assert classifier["items"]


def test_data_store_endpoints_use_tools(tmp_path: Path) -> None:
    orchestrator = StubOrchestrator()
    client = build_client(tmp_path, orchestrator)

    response = client.get("/api/data/todos")
    assert response.status_code == 200
    assert response.json()["todos"][0]["title"] == "Test"

    mutate = client.post("/api/data/todos", json={"action": "update", "id": "1", "status": "completed"})
    assert mutate.status_code == 200
    assert orchestrator.tool_calls[-1] == ("todo_list", {"action": "update", "id": "1", "status": "completed"})


def test_speech_endpoint_runs_chat_flow(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = build_client(tmp_path)

    from app import web_api

    monkeypatch.setattr(web_api, "_transcribe_audio_bytes", lambda payload, filename: "voice memo", raising=False)

    response = client.post(
        "/api/speech",
        files={"audio": ("memo.webm", b"fake-bytes", "audio/webm")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["transcription_status"] == "completed"
    assert payload["text"] == "voice memo"
    assert payload["chat"]["reply"] == "It is sunny"
    assert payload["pending_id"]
    inbox_rows = json.loads(client.app.state.voice_inbox_path.read_text(encoding="utf-8"))
    assert inbox_rows[-1]["pending_id"] == payload["pending_id"]


def test_voice_inbox_endpoint_returns_entries(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    entry = build_voice_entry(
        entry_id="voice-1",
        audio_path=tmp_path / "memo.webm",
        text="note",
        status="completed",
        reviewer_id="LCBM",
        pending_id="pending-1",
        voice_minutes=0.5,
    )
    client.app.state.voice_inbox_path.write_text(
        json.dumps([entry.to_dict()]), encoding="utf-8"
    )

    response = client.get("/api/voice_inbox")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_entries"] == 1
    assert payload["items"][0]["id"] == "voice-1"
    assert payload["voice_minutes_total"] == 0.5


def test_voice_rerun_endpoint_triggers_chat(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    entry = build_voice_entry(
        entry_id="voice-2",
        audio_path=tmp_path / "memo.webm",
        text="weather rerun",
        status="completed",
        reviewer_id="LCBM",
        pending_id="pending-2",
        voice_minutes=0.1,
    )
    client.app.state.voice_inbox_path.write_text(
        json.dumps([entry.to_dict()]), encoding="utf-8"
    )

    response = client.post("/api/voice_inbox/rerun", json={"entry_id": "voice-2"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["chat"]["reply"] == "It is sunny"
    assert payload["chat"]["review_reason"] == "voice_rerun"
    assert payload["chat"]["extras"]["voice_rerun_entry"] == "voice-2"
    assert payload["voice_entry"]["id"] == "voice-2"


def test_voice_delete_endpoint_removes_entry(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    upload = client.app.state.voice_upload_dir / "memo.webm"
    upload.write_bytes(b"audio")
    entry = build_voice_entry(
        entry_id="voice-3",
        audio_path=upload,
        text="delete me",
        status="completed",
        reviewer_id="LCBM",
        pending_id="pending-3",
        voice_minutes=0.2,
    )
    client.app.state.voice_inbox_path.write_text(
        json.dumps([entry.to_dict()]), encoding="utf-8"
    )

    response = client.post("/api/voice_inbox/delete", json={"entry_id": "voice-3"})
    assert response.status_code == 200
    assert not upload.exists()
    rows = json.loads(client.app.state.voice_inbox_path.read_text(encoding="utf-8"))
    assert rows == []


def test_label_endpoint_blocks_disallowed_tool(tmp_path: Path) -> None:
    orchestrator = StubOrchestrator()
    orchestrator.blocked_tools.add("todo_list")
    client = build_client(tmp_path, orchestrator)
    payload = {
        "prompt_id": "abc123",
        "prompt_text": "add a todo",
        "tool": "todo_list",
        "parser_intent": "todo_list",
        "reviewer_intent": "todo_list",
        "action": "create",
        "predicted_payload": {},
        "corrected_payload": {"action": "create", "title": "Task"},
        "training_duplicate": False,
    }

    response = client.post("/api/logs/label", json=payload)

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["policy_version"] == "test"
    assert detail["policy_violation"]["tool"] == "todo_list"


def test_label_endpoint_returns_reviewer_id(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    payload = {
        "prompt_id": "xyz789",
        "prompt_text": "update a todo",
        "tool": "todo_list",
        "parser_intent": "todo_list",
        "reviewer_intent": "todo_list",
        "action": "update",
        "predicted_payload": {},
        "corrected_payload": {"action": "update", "id": "1"},
        "training_duplicate": False,
    }

    response = client.post("/api/logs/label", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["reviewer_id"] == client.app.state.default_admin_user
    assert body["record"]["reviewer_id"] == client.app.state.default_admin_user
    corrected_path = client.app.state.corrected_path
    rows = corrected_path.read_text(encoding="utf-8").strip().splitlines()
    record = json.loads(rows[-1])
    assert record["reviewer_id"] == client.app.state.default_admin_user


def test_stats_filters_pending_for_user(tmp_path: Path) -> None:
    client = build_client(tmp_path, username="test1", password="test1")
    pending_path = client.app.state.pending_path
    extra_rows = [
        {"user_text": "alpha", "intent": "todo_list", "timestamp": "2024-01-01T00:00:00Z", "user_id": "test1"},
        {"user_text": "beta", "intent": "weather", "timestamp": "2024-01-02T00:00:00Z", "user_id": client.app.state.default_admin_user},
    ]
    _write_jsonl(pending_path, extra_rows)

    response = client.get("/api/stats")
    assert response.status_code == 200
    payload = response.json()
    assert payload["pending"]["total"] == 1
    assert payload["pending"]["by_intent"]["todo_list"] == 1
    assert all(record.get("user_id") == "test1" for record in payload["pending_sample"])


def test_data_store_filters_non_admin(tmp_path: Path) -> None:
    orchestrator = StubOrchestrator()
    client = build_client(tmp_path, orchestrator=orchestrator, username="test1", password="test1")
    response = client.get("/api/data/todos")
    assert response.status_code == 200
    data = response.json()
    assert data["todos"] == []
    assert data["count"] == 0

    admin_client = build_client(tmp_path, orchestrator=orchestrator, username="LCBM", password="testing123")
    admin_response = admin_client.get("/api/data/todos")
    assert admin_response.status_code == 200
    assert admin_response.json()["todos"][0]["title"] == "Test"


def test_stats_includes_governance_metadata(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    turn_log = client.app.state.turn_log_path
    turn_log.parent.mkdir(parents=True, exist_ok=True)
    sample_rows = [
        {
            "timestamp": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
            "intent": "weather",
            "latency_ms": 120,
            "extras": {},
            "user_text": "weather please",
        },
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "intent": "news",
            "latency_ms": 150,
            "extras": {"policy_violation": {"reason": "disallowed", "tool": "news"}},
            "resolution_status": "policy_violation",
            "user_text": "run news",
        },
    ]
    with turn_log.open("w", encoding="utf-8") as handle:
        for row in sample_rows:
            handle.write(json.dumps(row))
            handle.write("\n")
    purge_state = client.app.state.purge_state_path
    purge_state.parent.mkdir(parents=True, exist_ok=True)
    purge_state.write_text(
        json.dumps({"last_run": "2025-01-01T00:00:00+00:00", "dry_run": False}),
        encoding="utf-8",
    )

    response = client.get("/api/stats")

    assert response.status_code == 200
    data = response.json()
    assert data["policy_version"] == "test"
    assert data["retention_limits"]
    assert data["last_purge_timestamp"] == "2025-01-01T00:00:00+00:00"
    assert data["policy_violation_count"] == 1
    assert isinstance(data["avg_latency_ms"], (float, int))
    assert data["daily_intent_counts"]
