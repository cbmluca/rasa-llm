from typing import Optional

import pytest

from core.intent_classifier import ClassifierPrediction
from core.nlu_service import NLUService


def _service(threshold: float = 0.65) -> NLUService:
    return NLUService(threshold)


def test_weather_city_strips_trailing_phrase():
    service = _service()
    result = service.parse("What's the forecast for Paris this evening?")

    assert result.intent == "weather"
    assert result.entities["city"] == "Paris"
    assert service.is_confident(result)


def test_news_topic_trims_prompt_prefix():
    service = _service()
    result = service.parse("Any headlines on renewable energy?")

    assert result.intent == "news"
    assert result.entities["topic"] == "renewable energy"


def test_planetary_name_does_not_register_as_city():
    service = _service()
    result = service.parse("What's the temperature on Mars?")

    assert result.intent == "weather"
    assert "city" not in result.entities
    assert not service.is_confident(result)


class _StubClassifier:
    def __init__(self, prediction: Optional[ClassifierPrediction]) -> None:
        self.prediction = prediction
        self.messages: list[str] = []

    def predict(self, text: str):
        self.messages.append(text)
        return self.prediction


def test_classifier_handles_fallback(monkeypatch):
    monkeypatch.setattr("core.nlu_service.parse_command", lambda _: None)
    classifier = _StubClassifier(ClassifierPrediction(intent="todo_list", confidence=0.8))
    service = NLUService(0.65, classifier=classifier, classifier_threshold=0.7)

    result = service.parse("Please remind me to buy milk later.")

    assert result.intent == "todo_list"
    assert result.source == "classifier"
    assert service.is_confident(result)
    metadata = service.build_metadata(result)
    assert metadata["invocation_source"] == "classifier"
    assert metadata["classifier_confidence"] == pytest.approx(0.8)


def test_classifier_rejects_low_confidence(monkeypatch):
    monkeypatch.setattr("core.nlu_service.parse_command", lambda _: None)
    classifier = _StubClassifier(ClassifierPrediction(intent="todo_list", confidence=0.3))
    service = NLUService(0.65, classifier=classifier, classifier_threshold=0.7)

    result = service.parse("some ambiguous request")

    assert result.intent == "nlu_fallback"
    assert result.source == "parser"
    assert not service.is_confident(result)
