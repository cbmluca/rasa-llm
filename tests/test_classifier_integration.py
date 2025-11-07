from __future__ import annotations

from core.intent_classifier import ClassifierPrediction
from core.nlu_service import NLUService
from core.orchestrator import Orchestrator
from core.tool_registry import ToolRegistry


class StubRouter:
    def route(self, message: str):
        return {"type": "none"}

    def general_answer(self, message: str) -> str:
        return "From ChatGPT: fallback response."


class StubClassifier:
    def predict(self, text: str):
        return ClassifierPrediction(intent="todo_list", confidence=0.9)


class CapturingLogger:
    def __init__(self) -> None:
        self.enabled = True
        self.turn = None

    def log_turn(self, record):
        self.turn = record

    def log_review_item(self, review):
        self.review = review


def test_classifier_prediction_executes_tool(monkeypatch):
    monkeypatch.setattr("core.nlu_service.parse_command", lambda _: None)
    classifier = StubClassifier()
    nlu = NLUService(0.65, classifier=classifier, classifier_threshold=0.5)
    registry = ToolRegistry()

    def fake_todo_tool(payload):
        return {"action": "create", "todo": {"title": payload.get("message", "Untitled")}}

    registry.register_tool("todo_list", fake_todo_tool)
    router = StubRouter()
    logger = CapturingLogger()

    orchestrator = Orchestrator(nlu=nlu, registry=registry, router=router, logger=logger)
    response = orchestrator.handle_message("please remind me about the dentist")

    assert "Added todo" in response
    assert logger.turn is not None
    extras = logger.turn.extras
    assert extras["invocation_source"] == "classifier"
    assert extras["resolved_tool"] == "todo_list"
    assert extras["classifier_intent"] == "todo_list"
