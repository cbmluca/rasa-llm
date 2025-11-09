# actions/actions.py
# ------------------------------------------------------------
# NLU-first custom actions executed by the Rasa action server.
# This file intentionally contains ONLY the NLU-first tools.
# LLM fallback routing and topic news live in router.py / tools/.
# ------------------------------------------------------------

from __future__ import annotations
from tools.weather_tool import geocode_city, get_current_weather

import os
import json
import datetime as dt
from typing import Any, Dict, List, Text

# Rasa SDK
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet

# context
from .context import Ctx

# Local shared utilities
from .http import get
from .conf import (
    DR_RSS_URL,
    DR_RSS_LIMIT,
)


# NOTE: importing NEWS_USER_AGENT ensures .conf loads environment vars eagerly
from .conf import NEWS_USER_AGENT  # noqa: F401

# Ensure local data dirs exist for lightweight persistence
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
EVENTS_DIR = os.path.join(DATA_DIR, "events")
TODOS_PATH = os.path.join(DATA_DIR, "todos.json")
os.makedirs(EVENTS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)


# ------------------------------------------------------------
# Action: Get Weather (NLU-first)
#   - intent: ask_weather
#   - slot: city (string)
# ------------------------------------------------------------

class ActionGetWeather(Action):
    def name(self) -> Text:
        return "action_get_weather"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any]
    ) -> List[Dict[Text, Any]]:

        ctx = Ctx(tracker)

        # Try NLU entities first
        city = tracker.get_slot("city") or ""
        when = tracker.get_slot("date") or ""

        # Reuse last city if user omitted it (from global ctx_blob)
        if not city:
            city = (ctx.get_tool("weather").get("city") or "")

        # If still no city, ask
        if not city:
            dispatcher.utter_message(text="Which city?")
            return []

        # --- call your existing weather APIs here ---
        try:
            loc = geocode_city(city)
            if not loc:
                dispatcher.utter_message(text=f"I couldn't find '{city}'.")
                return []

            wx = get_current_weather(loc["lat"], loc["lon"])
            temp = wx.get("temperature_2m")
            code = wx.get("weather_code")
            if temp is None:
                dispatcher.utter_message(text="Weather data is unavailable right now.")
                return []

            code_text = f" (code {code})" if code is not None else ""
            msg = f"Weather in {loc['name']}: {temp}°C{code_text}."
        except Exception as e:
            dispatcher.utter_message(text=f"Weather error: {e}")
            return []

        # Persist what we used for follow-ups
        events = ctx.update_tool("weather", city=city, when=(when or "today"))
        dispatcher.utter_message(text=msg)
        return events


# ------------------------------------------------------------
# Action: DR Daily News (NLU-first)
#   - intent: news_daily  (your rules should map this)
# ------------------------------------------------------------

class ActionNewsDaily(Action):
    def name(self) -> Text:
        return "action_news_daily"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        try:
            r = get(DR_RSS_URL, allow_redirects=True)
            r.raise_for_status()

            import xml.etree.ElementTree as ET
            root = ET.fromstring(r.text)

            items: List[str] = []
            for item in root.findall(".//item"):
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                if title:
                    items.append(f"- {title}" + (f" ({link})" if link else ""))
                if len(items) >= DR_RSS_LIMIT:
                    break

            if not items:
                dispatcher.utter_message(text="Ingen nyheder fundet lige nu.")
                return []

            dispatcher.utter_message(text="Dagens overblik (DR):\n" + "\n".join(items))
            return []
        except Exception as e:
            dispatcher.utter_message(text=f"Kunne ikke hente DR-nyheder: {e}")
            return []


# ------------------------------------------------------------
# Actions: Todos (NLU-first)
#   - intents: add_todo, list_todos
#   - simple JSON storage at data/todos.json
# ------------------------------------------------------------

def _load_todos() -> List[Dict[str, Any]]:
    if not os.path.exists(TODOS_PATH):
        return []
    try:
        with open(TODOS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save_todos(items: List[Dict[str, Any]]) -> None:
    with open(TODOS_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


class ActionAddTodo(Action):
    def name(self) -> Text:
        return "action_add_todo"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        # Expect the todo text either in an entity/slot (e.g., "task") or use whole message text after intent
        todo_text = (tracker.get_slot("task") or "").strip()
        if not todo_text:
            # fallback: take latest user text minus the intent keyword (simple heuristic)
            todo_text = tracker.latest_message.get("text", "").strip()

        if not todo_text:
            dispatcher.utter_message(text="What should I add to your todo list?")
            return []

        items = _load_todos()
        items.append({
            "text": todo_text,
            "created": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "done": False,
        })
        _save_todos(items)
        dispatcher.utter_message(text=f"Added: {todo_text}")
        return []


class ActionListTodos(Action):
    def name(self) -> Text:
        return "action_list_todos"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        items = _load_todos()
        if not items:
            dispatcher.utter_message(text="Your todo list is empty.")
            return []
        lines = []
        for i, it in enumerate(items, start=1):
            status = "✓" if it.get("done") else "•"
            lines.append(f"{i}. {status} {it.get('text')}")
        dispatcher.utter_message(text="Your tasks:\n" + "\n".join(lines))
        return []


# ------------------------------------------------------------
# Actions: Calendar (NLU-first)
#   - intents: create_event, list_events
#   - stores .ics files to data/events/
# ------------------------------------------------------------

def _write_ics_file(title: str, start_iso: str) -> str:
    """
    Write a minimal single-event .ics file.
    start_iso: ISO string in UTC or local (we do not do TZ conversions here).
    """
    uid = f"{int(dt.datetime.utcnow().timestamp())}@local"
    dtstamp = dt.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    # if start_iso lacks 'Z', do not append Z blindly—accept as provided
    start_clean = start_iso.replace("-", "").replace(":", "").replace(" ", "T")
    if len(start_clean) == 15:  # e.g., 20251212T090000
        dtstart = start_clean + "Z"
    else:
        dtstart = start_clean

    ics = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//rasa-llm-bot//EN\r\n"
        "BEGIN:VEVENT\r\n"
        f"UID:{uid}\r\n"
        f"DTSTAMP:{dtstamp}\r\n"
        f"DTSTART:{dtstart}\r\n"
        f"SUMMARY:{title}\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )

    fname = f"event_{uid}.ics"
    fpath = os.path.join(EVENTS_DIR, fname)
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(ics)
    return fpath


class ActionCreateEvent(Action):
    def name(self) -> Text:
        return "action_create_event"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        title = (tracker.get_slot("event_title") or "").strip()
        start  = (tracker.get_slot("event_start") or "").strip()

        if not title:
            dispatcher.utter_message(text="What should I call the event?")
            return []
        if not start:
            dispatcher.utter_message(text="When does it start? (e.g., 2025-12-12 09:00)")
            return []

        try:
            path = _write_ics_file(title, start)
            dispatcher.utter_message(text=f"Event created: {title}\nSaved as: {path}")
            return []
        except Exception as e:
            dispatcher.utter_message(text=f"Couldn't create event: {e}")
            return []


class ActionListEvents(Action):
    def name(self) -> Text:
        return "action_list_events"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        files = sorted(
            [f for f in os.listdir(EVENTS_DIR) if f.endswith(".ics")],
            reverse=True,
        )
        if not files:
            dispatcher.utter_message(text="No events found.")
            return []
        lines = [f"- {f}" for f in files[:20]]
        dispatcher.utter_message(text="Saved events:\n" + "\n".join(lines))
        return []


# ------------------------------------------------------------
# Exported symbol list (helps some tooling)
# ------------------------------------------------------------
__all__ = [
    "ActionGetWeather",
    "ActionNewsDaily",
    "ActionAddTodo",
    "ActionListTodos",
    "ActionCreateEvent",
    "ActionListEvents",
]