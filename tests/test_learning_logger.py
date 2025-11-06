import json
from pathlib import Path

from core.learning_logger import LearningLogger, ReviewItem, TurnRecord
from core.nlu_service import NLUService
from core.orchestrator import Orchestrator
from core.tool_registry import ToolRegistry


class StubRouter:
    """Router stub that forces a fallback response during tests."""

    def route(self, message: str):
        return {"type": "none"}

    def general_answer(self, message: str) -> str:
        return "From ChatGPT: fallback response."


def test_learning_logger_writes_jsonl_records(tmp_path):
    turn_path = tmp_path / "turns.jsonl"
    review_path = tmp_path / "review.jsonl"
    logger = LearningLogger(turn_log_path=turn_path, review_log_path=review_path, enabled=True)

    turn = TurnRecord.new(
        user_text="How is the weather?",
        intent="ask_weather",
        confidence=0.8,
        entities={"city": "Copenhagen"},
        tool_name="weather",
        tool_payload={"city": "Copenhagen"},
        tool_success=True,
        response_text="Sunny",
        resolution_status="tool:nlu",
        metadata={"test": True},
        extras={"domain": "weather"},
    )
    logger.log_turn(turn)

    review = ReviewItem.new(
        user_text="hello?",
        intent="nlu_fallback",
        confidence=0.1,
        reason="low_confidence",
    )
    logger.log_review_item(review)

    turn_lines = turn_path.read_text(encoding="utf-8").strip().splitlines()
    review_lines = review_path.read_text(encoding="utf-8").strip().splitlines()

    assert len(turn_lines) == 1
    parsed_turn = json.loads(turn_lines[0])
    assert parsed_turn["user_text"] == "How is the weather?"
    assert parsed_turn["tool_name"] == "weather"
    assert parsed_turn["metadata"] == {"test": True}
    assert parsed_turn["extras"]["domain"] == "weather"

    assert len(review_lines) == 1
    parsed_review = json.loads(review_lines[0])
    assert parsed_review["reason"] in {"low_confidence", "fallback_response"}
    assert parsed_review["intent"] == "nlu_fallback"


def test_orchestrator_logs_review_for_low_confidence(tmp_path):
    turn_path = tmp_path / "turns.jsonl"
    review_path = tmp_path / "review.jsonl"
    logger = LearningLogger(turn_log_path=turn_path, review_log_path=review_path, enabled=True)

    nlu = NLUService(threshold=0.9)
    registry = ToolRegistry()
    router = StubRouter()
    orchestrator = Orchestrator(nlu=nlu, registry=registry, router=router, logger=logger)

    response = orchestrator.handle_message("hi there")
    assert response.startswith("From ChatGPT")

    review_lines = review_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(review_lines) == 1
    parsed_review = json.loads(review_lines[0])
    assert parsed_review["reason"] in {"low_confidence", "fallback_response"}
    assert parsed_review["intent"] == "nlu_fallback"

    turn_lines = turn_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(turn_lines) == 1
    parsed_turn = json.loads(turn_lines[0])
    assert parsed_turn["fallback_triggered"] is True
    assert parsed_turn["resolution_status"] == "fallback"


def test_redaction_scrubs_sensitive_strings(tmp_path):
    turn_path = tmp_path / "turns.jsonl"
    review_path = tmp_path / "review.jsonl"
    logger = LearningLogger(
        turn_log_path=turn_path,
        review_log_path=review_path,
        enabled=True,
        redact=True,
        patterns=["email", "phone", "credit_card", "gov_id", "url"],
    )

    record = TurnRecord.new(
        user_text="Contact me at jane.doe@example.com or +1 415 555 1212.",
        intent="test_intent",
        confidence=0.9,
        response_text="Sure thing, emailing jane.doe@example.com now. Visit https://example.com/profile.",
        metadata={"phone": "+1 (555) 987-6543", "card": "4111 1111 1111 1111", "ssn": "123-45-6789"},
    )
    logger.log_turn(record)

    turn_lines = turn_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(turn_lines) == 1
    payload = json.loads(turn_lines[0])
    assert "[REDACTED" not in payload["timestamp"]

    def assert_redacted(value: str) -> None:
        assert "example.com" not in value
        assert "+1 415 555 1212" not in value
        assert "4111 1111" not in value
        assert "123-45-6789" not in value
        assert "https://example.com" not in value
        replacements = [
            "[REDACTED_EMAIL]",
            "[REDACTED_PHONE]",
            "[REDACTED_CREDIT_CARD]",
            "[REDACTED_GOV_ID]",
            "[REDACTED_URL]",
        ]
        assert any(token in value for token in replacements)

    assert_redacted(payload["user_text"])
    assert_redacted(payload["response_text"])
    assert payload["metadata"]["phone"] == "[REDACTED_PHONE]"
    assert payload["metadata"]["card"] == "[REDACTED_CREDIT_CARD]"
    assert payload["metadata"]["ssn"] == "[REDACTED_GOV_ID]"


def test_log_rotation_respects_max_bytes(tmp_path):
    turn_path = tmp_path / "turns.jsonl"
    review_path = tmp_path / "review.jsonl"
    logger = LearningLogger(
        turn_log_path=turn_path,
        review_log_path=review_path,
        enabled=True,
        redact=False,
        max_bytes=150,
        backup_count=1,
    )

    for idx in range(5):
        record = TurnRecord.new(
            user_text=f"hello {idx}",
            intent="test_intent",
            confidence=0.9,
            response_text=f"response {idx}",
        )
        logger.log_turn(record)

    rotated = Path(f"{turn_path}.1")
    assert turn_path.exists()
    assert rotated.exists()
    active_text = turn_path.read_text(encoding="utf-8")
    rotated_text = rotated.read_text(encoding="utf-8")
    assert "hello 4" in active_text
    assert "hello 0" not in active_text
    assert "hello 3" in rotated_text
