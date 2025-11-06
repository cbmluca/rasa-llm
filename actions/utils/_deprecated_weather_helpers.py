# Deprecated: functionality moved to tools/weather.py
from ..http import get

def geocode_city(name: str):
    if not name:
        return None

    r = get(
        "https://geocoding-api.open-meteo.com/v1/search",
        params={"name": name, "count": 1},
    )
    r.raise_for_status()
    data = r.json()
    if not data.get("results"):
        return None
    res = data["results"][0]
    return {"lat": res["latitude"], "lon": res["longitude"], "name": res["name"]}

def get_current_weather(lat: float, lon: float):
    r = get(
        "https://api.open-meteo.com/v1/forecast",
        params={"latitude": lat, "longitude": lon, "current": "temperature_2m,weather_code"},
    )
    r.raise_for_status()
    return r.json().get("current", {})