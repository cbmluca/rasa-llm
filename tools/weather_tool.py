"""Weather tool utilities for fetching and presenting current conditions.

The module separates low-level helpers that call third-party APIs from the
orchestrator-facing functions that prepare responses for the assistant.
"""

from __future__ import annotations

from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta, time as dt_time
import re
import requests

_DEFAULT_CITY = "Copenhagen"
_CITY_SANITIZE_RE = re.compile(r"[^A-Za-zÀ-ÖØ-öø-ÿ' .-]+")
_CITY_STOP_WORDS = {
    "weather",
    "forecast",
    "temperature",
    "whats",
    "what",
    "is",
    "the",
    "latest",
    "current",
    "right",
    "now",
    "today",
    "tonight",
    "tomorrow",
    "morning",
    "afternoon",
    "evening",
    "please",
    "give",
    "show",
    "tell",
    "me",
    "need",
    "in",
    "for",
    "på",
    "til",
    "i",
    "på",
    "som",
    "going",
    "to",
    "be",
    "like",
}
_CITY_MAX_LENGTH = 60

# --- External API helper functions -----------------------------------------
def geocode_city(name: str) -> Optional[Dict[str, Any]]:
    if not name:
        return None

    r = requests.get(
        "https://geocoding-api.open-meteo.com/v1/search",
        params={"name": name, "count": 1},
        timeout=8,
    )
    r.raise_for_status()
    data = r.json()
    if not data.get("results"):
        return None
    res = data["results"][0]
    return {
        "lat": res["latitude"],
        "lon": res["longitude"],
        "name": res["name"],
    }


def get_current_weather(lat: float, lon: float) -> Dict[str, Any]:
    r = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,weather_code",
        },
        timeout=8,
    )
    r.raise_for_status()
    return r.json().get("current", {})


def get_hourly_forecast(lat: float, lon: float) -> Dict[str, List[Any]]:
    r = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": lat,
            "longitude": lon,
            "hourly": "temperature_2m,weather_code",
            "forecast_days": 7,
            "timezone": "auto",
        },
        timeout=8,
    )
    r.raise_for_status()
    return r.json().get("hourly", {})


# --- Orchestrator-facing tool functions ------------------------------------
    # WHAT: geocode the city, honor time hints, and fetch either current conditions or hourly forecasts.
    # WHY: Tier‑1 needs deterministic weather responses so router and CLI outputs stay aligned.
    # HOW: sanitize the payload, call Open‑Meteo helpers, prefer forecasts when a target hour exists, otherwise return current conditions plus metadata.
def run(payload: Dict[str, Any], *, dry_run: bool = False) -> Dict[str, Any]:
    """Resolve ``payload`` into current or forecasted weather for the requested city."""

    city = _resolve_city(payload)

    loc = geocode_city(city)
    if not loc:
        inferred = _infer_city_from_message(payload.get("message"))
        if inferred and inferred.lower() != city.lower():
            loc = geocode_city(inferred)
            if loc:
                city = inferred
        if not loc:
            return {"error": "not_found", "message": f"Could not find city '{city}'."}

    time_hint = payload.get("time") if isinstance(payload.get("time"), dict) else None
    if time_hint:
        target_dt = _resolve_target_datetime(time_hint)
    else:
        target_dt = None
    time_label = _describe_time_label(time_hint, target_dt)

    if target_dt:
        hourly = get_hourly_forecast(loc["lat"], loc["lon"])
        forecast_entry = _pick_hourly_entry(hourly, target_dt)
    else:
        forecast_entry = None

    if forecast_entry:
        notes = []
        return {
            "type": "weather",
            "city": loc["name"],
            "temperature": forecast_entry.get("temperature"),
            "weather_code": forecast_entry.get("weather_code"),
            "timestamp": forecast_entry.get("time"),
            "mode": "forecast",
            "note": " ".join(notes) if notes else None,
            "time_label": time_label,
        }

    wx = get_current_weather(loc["lat"], loc["lon"])
    temp = wx.get("temperature_2m")
    code = wx.get("weather_code")

    notes: List[str] = []
    if target_dt and not forecast_entry:
        notes.append("Requested time is outside the available forecast; showing current conditions.")
    note = " ".join(notes) if notes else None

    return {
        "type": "weather",
        "city": loc["name"],
        "temperature": temp,
        "weather_code": code,
        "mode": "current",
        "note": note,
        "time_label": time_label,
    }


    # WHAT: decide which city string to use when calling the weather APIs.
    # WHY: payloads may include structured `city` fields or only a free-form message.
    # HOW: prefer sanitized `city`/`location`, otherwise infer from the message, falling back to `_DEFAULT_CITY`.
def _resolve_city(payload: Dict[str, Any]) -> str:
    raw_city = str(payload.get("city") or payload.get("location") or "").strip()
    normalized = _normalize_city_name(raw_city)
    if normalized:
        return normalized

    inferred = _infer_city_from_message(payload.get("message"))
    if inferred:
        return inferred

    return _DEFAULT_CITY


    # WHAT: sanitize user-provided city names before geocoding.
    # WHY: removes extra words/symbols so Open‑Meteo matches the right location.
    # HOW: strip non-letter characters, drop stop words, and cap the final string length.
def _normalize_city_name(candidate: str) -> str:
    if not candidate:
        return ""

    cleaned = _CITY_SANITIZE_RE.sub(" ", candidate)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .-\t\n")
    if not cleaned:
        return ""

    tokens = [token for token in cleaned.split() if token.lower() not in _CITY_STOP_WORDS]
    normalized = " ".join(tokens).strip(" .-\t\n")
    if not normalized:
        return ""
    return normalized[:_CITY_MAX_LENGTH]


    # WHAT: extract a city mention from the free-form message.
    # WHY: lets prompts like “weather in Berlin tomorrow” resolve even without structured fields.
    # HOW: run regex heuristics to capture “in/for <city>” phrases and normalize the result.
def _infer_city_from_message(message: Any) -> str:
    if not isinstance(message, str):
        return ""
    text = message.strip()
    if not text:
        return ""

    patterns = [
        re.compile(r"\b(?:in|i|for|til|på)\s+(?P<city>[A-Za-zÀ-ÖØ-öø-ÿ' .-]{3,})", re.IGNORECASE),
        re.compile(r"(?P<city>[A-Za-zÀ-ÖØ-öø-ÿ' .-]{3,})\s+(?:weather|forecast|temperature|vejret|vejr)", re.IGNORECASE),
    ]
    for pattern in patterns:
        match = pattern.search(text)
        if not match:
            continue
        normalized = _normalize_city_name(match.group("city"))
        if normalized:
            return normalized
    return ""

# --- Formatting helpers ----------------------------------------------------
    # WHAT: turn the structured weather payload into a chat-friendly sentence.
    # WHY: the orchestrator reuses this text for both CLI and router responses.
    # HOW: build a header (current vs forecast), append temperature/notes, and include error messages when present.
def format_weather_response(result: Dict[str, Any]) -> str:
    """Create a short, human-friendly weather summary."""
    if "error" in result:
        return result.get("message", "Weather error.")

    city = result.get("city", "the specified city")
    temp = result.get("temperature")
    code = result.get("weather_code")
    mode = result.get("mode", "current")
    timestamp = result.get("timestamp")
    note = result.get("note")
    time_label = result.get("time_label")

    if mode == "forecast":
        if time_label:
            header = f"Weather in {city} {time_label}"
        elif timestamp:
            time_text = _format_timestamp(timestamp)
            header = f"Forecast for {city} at {time_text}"
        else:
            header = f"Forecast for {city}"
    else:
        if time_label:
            header = f"Weather in {city} {time_label}"
        else:
            header = f"Weather in {city}"

    parts = [header]
    if temp is not None:
        parts.append(f"{temp}°C")
    if note:
        parts.append(note)

    return ": ".join(parts)


# --- Time parsing helpers --------------------------------------------------
_WEEKDAY_INDEX = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


    # WHAT: convert parser-provided time hints into a concrete UTC datetime.
    # WHY: the weather tool chooses between hourly forecast vs current conditions based on this target.
    # HOW: normalize day/hour/minute hints, clamp values, and combine with today’s date plus an offset.
def _resolve_target_datetime(time_hint: Dict[str, Any]) -> Optional[datetime]:
    day_hint = str(time_hint.get("day", "")).strip().lower()
    hour = time_hint.get("hour")
    minute = time_hint.get("minute")

    if hour is None:
        hour = _default_hour_for_hint(day_hint)
    if hour is None:
        hour = datetime.utcnow().hour
    if minute is None:
        minute = 0

    hour = max(0, min(23, hour))
    minute = max(0, min(59, minute))

    now = datetime.utcnow()
    day_offset = _resolve_day_offset(day_hint, now)
    target_date = (now + timedelta(days=day_offset)).date()

    try:
        dt_obj = datetime.combine(target_date, dt_time(hour=hour, minute=minute))
    except ValueError:
        return None

    return dt_obj.replace(minute=0, second=0, microsecond=0)


    # WHAT: translate relative day strings into offsets from today.
    # WHY: users say “tomorrow” or “next Wednesday” rather than exact dates.
    # HOW: map common phrases and weekday names to offsets, defaulting to zero.
def _resolve_day_offset(day_hint: str, now: datetime) -> int:
    if not day_hint:
        return 0

    day_hint = day_hint.lower()
    if day_hint in {
        "today",
        "tonight",
        "this morning",
        "this afternoon",
        "this evening",
        "this weekend",
        "i aften",
        "iaften",
        "i nat",
        "inat",
    }:
        return 0
    if day_hint in {"tomorrow", "i morgen", "imorgen"}:
        return 1
    if day_hint == "next week":
        return 7

    if day_hint in {"i weekenden", "i weekend", "weekend"}:
        return _days_until_weekday(5, now, include_today=now.weekday() in {5, 6})

    if day_hint.startswith("next "):
        weekday = day_hint.split(" ", 1)[1]
        idx = _WEEKDAY_INDEX.get(weekday)
        if idx is not None:
            return _days_until_weekday(idx, now, include_today=False)

    if day_hint.startswith("this "):
        weekday = day_hint.split(" ", 1)[1]
        idx = _WEEKDAY_INDEX.get(weekday)
        if idx is not None:
            return _days_until_weekday(idx, now, include_today=True)

    return 0


    # WHAT: compute how many days until the requested weekday.
    # WHY: supports phrases like “next Wednesday” or “this weekend”.
    # HOW: use modulo arithmetic and optionally include today when the weekday matches.
def _days_until_weekday(target_idx: int, now: datetime, *, include_today: bool) -> int:
    today_idx = now.weekday()
    delta = (target_idx - today_idx) % 7
    if delta == 0 and not include_today:
        delta = 7
    return delta


    # WHAT: infer a representative hour when only day parts are provided.
    # WHY: “this evening” should pick 19:00 so forecast matching works consistently.
    # HOW: map common phrases to default hours and return None when unknown.
def _default_hour_for_hint(day_hint: str) -> Optional[int]:
    mapping = {
        "this morning": 9,
        "this afternoon": 15,
        "this evening": 19,
        "tonight": 20,
        "this weekend": 10,
        "i aften": 19,
        "iaften": 19,
        "i nat": 22,
        "inat": 22,
        "i weekenden": 10,
        "i weekend": 10,
    }
    return mapping.get(day_hint or "")


    # WHAT: find the hourly forecast entry nearest to the target datetime.
    # WHY: Open‑Meteo returns arrays of timestamps/temps/codes that need to be aligned.
    # HOW: iterate the hourly list, compute deltas, and return the closest match as a dict.
def _pick_hourly_entry(hourly: Dict[str, List[Any]], target: datetime) -> Optional[Dict[str, Any]]:
    times = hourly.get("time") or []
    temps = hourly.get("temperature_2m") or []
    codes = hourly.get("weather_code") or []
    if not times:
        return None

    best_idx = None
    best_delta = None
    for idx, iso_value in enumerate(times):
        try:
            entry_dt = datetime.fromisoformat(iso_value)
        except ValueError:
            continue
        delta = abs((entry_dt - target).total_seconds())
        if best_delta is None or delta < best_delta:
            best_idx = idx
            best_delta = delta
            if delta == 0:
                break

    if best_idx is None:
        return None

    # Require the closest slot to be within 3 hours of the requested time.
    if best_delta is not None and best_delta > 3 * 3600:
        return None

    def _safe_get(values: List[Any], index: int) -> Any:
        return values[index] if index < len(values) else None

    return {
        "time": _safe_get(times, best_idx),
        "temperature": _safe_get(temps, best_idx),
        "weather_code": _safe_get(codes, best_idx),
    }


    # WHAT: format ISO timestamps into a short human-readable string.
    # WHY: used when building forecast headers in `format_weather_response`.
    # HOW: parse via `datetime.fromisoformat` and fall back to the raw text on failure.
def _format_timestamp(timestamp: str) -> str:
    try:
        dt_obj = datetime.fromisoformat(timestamp)
    except ValueError:
        return timestamp
    return dt_obj.strftime("%b %d %H:%M")


    # WHAT: create a human-readable label describing the requested time.
    # WHY: response headers (“Weather in Copenhagen tomorrow at 09:00”) rely on this string.
    # HOW: use explicit day/hour hints when present, otherwise fall back to the raw text or resolved datetime.
def _describe_time_label(time_hint: Optional[Dict[str, Any]], target_dt: Optional[datetime]) -> Optional[str]:
    if not isinstance(time_hint, dict):
        return None
    day_hint = str(time_hint.get("day") or "").strip()
    raw_hint = str(time_hint.get("raw") or "").strip()
    hour = time_hint.get("hour")
    minute = time_hint.get("minute")

    parts: List[str] = []
    if day_hint:
        parts.append(day_hint)

    time_fragment: Optional[str] = None
    if hour is not None:
        try:
            hour_int = max(0, min(23, int(hour)))
        except (TypeError, ValueError):
            hour_int = None
        if hour_int is not None:
            minute_int = 0
            if minute is not None:
                try:
                    minute_int = max(0, min(59, int(minute)))
                except (TypeError, ValueError):
                    minute_int = 0
            time_fragment = f"{hour_int:02d}:{minute_int:02d}"
    if time_fragment:
        if parts:
            parts.append(f"at {time_fragment}")
        else:
            parts.append(time_fragment)

    if parts:
        return " ".join(parts).strip()

    if raw_hint:
        return raw_hint

    if target_dt:
        return target_dt.strftime("%b %d %H:%M")

    return None
