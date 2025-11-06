"""Weather tool utilities for fetching and presenting current conditions.

The module separates low-level helpers that call third-party APIs from the
orchestrator-facing functions that prepare responses for the assistant.
"""

from __future__ import annotations

from typing import Dict, Any, Optional
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


# --- Orchestrator-facing tool functions ------------------------------------
def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve ``payload`` into the current weather for the requested city."""
    city = (payload.get("city") or payload.get("location") or "").strip()
    if not city:
        return {"error": "missing_city", "message": "No city specified."}

    loc = geocode_city(city)
    if not loc:
        return {"error": "not_found", "message": f"Could not find city '{city}'."}

    wx = get_current_weather(loc["lat"], loc["lon"])
    temp = wx.get("temperature_2m")
    code = wx.get("weather_code")

    return {
        "type": "weather",
        "city": loc["name"],
        "temperature": temp,
        "weather_code": code,
    }

# --- Formatting helpers ----------------------------------------------------
def format_weather_response(result: Dict[str, Any]) -> str:
    """Create a short, human-friendly weather summary."""
    if "error" in result:
        return result.get("message", "Weather error.")

    city = result.get("city", "the specified city")
    temp = result.get("temperature")
    code = result.get("weather_code")

    parts = [f"Weather in {city}"]
    if temp is not None:
        parts.append(f"{temp}°C")
    if code is not None:
        parts.append(f"(code {code})")

    return ": ".join(parts)