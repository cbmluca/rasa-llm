import tools.weather_tool as weather


def _fake_loc(name: str) -> dict:
    return {"lat": 55.0, "lon": 12.0, "name": name}


def _stub_current(*_args, **_kwargs):
    return {"temperature_2m": 18.5, "weather_code": 2}


def _stub_hourly(*_args, **_kwargs):
    return {}


def test_run_defaults_to_copenhagen_when_city_missing(monkeypatch):
    captured = {}

    def fake_geocode(city: str):
        captured.setdefault("calls", []).append(city)
        return _fake_loc(city)

    monkeypatch.setattr(weather, "geocode_city", fake_geocode)
    monkeypatch.setattr(weather, "get_current_weather", _stub_current)
    monkeypatch.setattr(weather, "get_hourly_forecast", _stub_hourly)

    result = weather.run({"intent": "weather", "message": "Need the weather please"})

    assert captured["calls"][0] == "Copenhagen"
    assert not (result.get("note") or "").strip()


def test_run_preserves_time_label_for_relative_requests(monkeypatch):
    def fake_geocode(city: str):
        return _fake_loc(city)

    monkeypatch.setattr(weather, "geocode_city", fake_geocode)
    monkeypatch.setattr(weather, "get_current_weather", _stub_current)
    monkeypatch.setattr(weather, "get_hourly_forecast", _stub_hourly)

    payload = {
        "intent": "weather",
        "message": "weather tomorrow",
        "time": {"day": "tomorrow", "raw": "tomorrow"},
    }
    result = weather.run(payload)

    assert result.get("time_label") == "tomorrow"


def test_city_tokens_are_sanitized(monkeypatch):
    captured = {}

    def fake_geocode(city: str):
        captured.setdefault("calls", []).append(city)
        return _fake_loc(city)

    monkeypatch.setattr(weather, "geocode_city", fake_geocode)
    monkeypatch.setattr(weather, "get_current_weather", _stub_current)
    monkeypatch.setattr(weather, "get_hourly_forecast", _stub_hourly)

    result = weather.run({"intent": "weather", "city": "Paris tonight please", "message": "What's the forecast for Paris tonight?"})

    assert captured["calls"][0] == "Paris"
    assert result["city"] == "Paris"


def test_city_can_be_inferred_from_message(monkeypatch):
    captured = {}

    def fake_geocode(city: str):
        captured.setdefault("calls", []).append(city)
        if city == "Berlin":
            return _fake_loc(city)
        return None

    monkeypatch.setattr(weather, "geocode_city", fake_geocode)
    monkeypatch.setattr(weather, "get_current_weather", _stub_current)
    monkeypatch.setattr(weather, "get_hourly_forecast", _stub_hourly)

    result = weather.run({"intent": "weather", "message": "What's the weather in Berlin tomorrow?"})

    assert captured["calls"][0] == "Berlin"
    assert result["city"] == "Berlin"
    assert (result.get("note") or "").strip() == ""


def test_format_response_includes_time_label():
    summary = weather.format_weather_response(
        {
            "type": "weather",
            "city": "Copenhagen",
            "temperature": 12,
            "mode": "current",
            "time_label": "tomorrow",
        }
    )
    assert "tomorrow" in summary.lower()
