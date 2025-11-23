from __future__ import annotations

import json
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

from app.web_api import create_app
from core.nlu_service import NLUResult
from core.orchestrator import OrchestratorResponse


class StubOrchestrator:
    def __init__(self) -> None:
        self.tool_calls: list[tuple[str, dict]] = []

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
        if tool_name == "todo_list":
            return {"todos": [{"id": "1", "title": "Test", "status": "pending"}]}
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


def build_client(tmp_path: Path, orchestrator: StubOrchestrator | None = None) -> TestClient:
    pending = tmp_path / "pending.jsonl"
    labeled = tmp_path / "labeled.jsonl"
    turn_log = tmp_path / "turns.jsonl"
    static_dir = tmp_path / "static"
    export_dir = tmp_path / "exports"
    static_dir.mkdir(parents=True, exist_ok=True)
    export_dir.mkdir(parents=True, exist_ok=True)
    (static_dir / "index.html").write_text("<html></html>", encoding="utf-8")
    orchestrator = orchestrator or StubOrchestrator()
    app = create_app(
        orchestrator=orchestrator,
        pending_path=pending,
        labeled_path=labeled,
        turn_log_path=turn_log,
        static_dir=static_dir,
        export_dir=export_dir,
    )
    return TestClient(app)


def test_chat_endpoint_returns_trace(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    response = client.post("/api/chat", json={"message": "weather tomorrow"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["reply"] == "It is sunny"
    assert payload["tool"]["name"] == "weather"
    assert payload["extras"]["resolved_tool"] == "weather"


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
