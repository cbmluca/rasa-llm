from __future__ import annotations

from typing import Dict


def run(payload: Dict[str, object]) -> Dict[str, object]:
    location = str(payload.get("location", "your area")).title()
    unit = payload.get("unit", "C")
    temperature = 22 if unit.upper() == "C" else 71

    return {
        "type": "weather",
        "location": location,
        "temperature": temperature,
        "unit": unit,
        "conditions": "Partly cloudy",
    }


def format_weather_response(result: Dict[str, object]) -> str:
    location = result.get("location", "the specified location")
    temperature = result.get("temperature", "unknown")
    unit = result.get("unit", "C")
    conditions = result.get("conditions", "unknown conditions")
    return f"The weather in {location} is {conditions} with a temperature of {temperature}°{unit}."