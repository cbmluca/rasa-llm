"""Weather tool utilities for fetching and presenting current conditions.

The module separates low-level helpers that call third-party APIs from the
orchestrator-facing functions that prepare responses for the assistant.
"""

from __future__ import annotations

from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta, time as dt_time
import requests

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
def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve ``payload`` into current or forecasted weather for the requested city."""
    city = (payload.get("city") or payload.get("location") or "").strip()
    if not city:
        return {
            "error": "missing_city",
            "message": "I need a city or location to look up the weather.",
        }

    loc = geocode_city(city)
    if not loc:
        return {"error": "not_found", "message": f"Could not find city '{city}'."}

    time_hint = payload.get("time") if isinstance(payload.get("time"), dict) else None
    if time_hint:
        target_dt = _resolve_target_datetime(time_hint)
    else:
        target_dt = None

    if target_dt:
        hourly = get_hourly_forecast(loc["lat"], loc["lon"])
        forecast_entry = _pick_hourly_entry(hourly, target_dt)
    else:
        forecast_entry = None

    if forecast_entry:
        return {
            "type": "weather",
            "city": loc["name"],
            "temperature": forecast_entry.get("temperature"),
            "weather_code": forecast_entry.get("weather_code"),
            "timestamp": forecast_entry.get("time"),
            "mode": "forecast",
        }

    wx = get_current_weather(loc["lat"], loc["lon"])
    temp = wx.get("temperature_2m")
    code = wx.get("weather_code")

    note = None
    if target_dt and not forecast_entry:
        note = "Requested time is outside the available forecast; showing current conditions."

    return {
        "type": "weather",
        "city": loc["name"],
        "temperature": temp,
        "weather_code": code,
        "mode": "current",
        "note": note,
    }

# --- Formatting helpers ----------------------------------------------------
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

    if mode == "forecast" and timestamp:
        time_text = _format_timestamp(timestamp)
        header = f"Forecast for {city} at {time_text}"
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


def _days_until_weekday(target_idx: int, now: datetime, *, include_today: bool) -> int:
    today_idx = now.weekday()
    delta = (target_idx - today_idx) % 7
    if delta == 0 and not include_today:
        delta = 7
    return delta


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


def _format_timestamp(timestamp: str) -> str:
    try:
        dt_obj = datetime.fromisoformat(timestamp)
    except ValueError:
        return timestamp
    return dt_obj.strftime("%b %d %H:%M")
