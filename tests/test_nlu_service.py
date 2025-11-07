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
