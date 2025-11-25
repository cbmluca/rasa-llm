import core.parsers.calendar as calendar_parser
from core.command_parser import parse_command


def test_remember_todo_uses_full_phrase_as_title():
    result = parse_command('remember buy wine for dinner tomorrow notes ["Check cellar","Pick from list"]')
    assert result is not None
    assert result.tool == "todo_list"
    payload = result.payload
    assert payload["title"].startswith("remember buy wine for dinner")
    assert payload["notes"] == ["Check cellar", "Pick from list"]


def test_update_todo_allows_natural_title():
    result = parse_command("update todo Tier X - UI to status completed")
    assert result is not None
    assert result.payload.get("target_title") == "Tier X - UI"
    assert result.payload.get("status") == "completed"


def test_todo_create_extracts_deadline_and_notes():
    result = parse_command('add todo "Prepare slides" deadline 5/12/2025 notes "Focus on KPIs"')
    assert result is not None
    payload = result.payload
    assert payload["action"] == "create"
    assert payload["title"] == "Prepare slides"
    assert payload["deadline"].startswith("2025-12-05")
    assert payload["notes"] == ["Focus on KPIs"]


def test_todo_delete_command_uses_target_title():
    result = parse_command("delete todo Prepare slides before tomorrow")
    assert result is not None
    payload = result.payload
    assert payload["action"] == "delete"
    assert payload["target_title"].startswith("Prepare slides")


def test_weather_city_and_time_hint():
    result = parse_command("What's the weather like in Paris tomorrow at 18:00?")
    assert result is not None
    assert result.tool == "weather"
    payload = result.payload
    assert payload.get("city") == "Paris"
    assert "time" in payload
    assert payload["time"]["day"].startswith("tomorrow")


def test_news_topic_from_sentence():
    result = parse_command("Any headlines on renewable energy?")
    assert result is not None
    assert result.tool == "news"
    assert result.payload.get("topic") == "renewable energy"


def test_calendar_parses_danish_datetime():
    result = parse_command('calendar create title "Standup" start 1/9/2026 09:00 end 1/9/2026 10:00')
    assert result is not None
    assert result.payload["start"].startswith("2026-09-01T09:00")
    assert result.payload["end"].startswith("2026-09-01T10:00")


def test_news_language_marker_detection():
    result = parse_command("search english news about energipolitik")
    assert result is not None
    assert result.payload.get("language") == "en"


def test_notes_parser_detects_commands():
    result = parse_command('list notes sections')
    assert result is not None
    assert result.tool == "app_guide"
    assert result.payload["action"] == "list"


def test_calendar_freeform_create_with_range():
    result = parse_command("Create an event for Sprint Retro on 1/2/2025 15:00-16:00 at the office.")
    assert result is not None
    assert result.tool == "calendar_edit"
    assert result.payload["action"] == "create"
    assert result.payload["title"].lower() == "sprint retro"
    assert result.payload.get("start", "").startswith("2025-02-01T15:00")
    assert result.payload.get("end", "").startswith("2025-02-01T16:00")
    assert "office" in result.payload.get("location", "").lower()


def test_calendar_list_prompt_detected():
    result = parse_command("list my calendar events")
    assert result is not None
    assert result.tool == "calendar_edit"
    assert result.payload["action"] == "list"


def test_calendar_delete_meeting_called():
    result = parse_command('Delete the meeting called "Budget sync"')
    assert result is not None
    assert result.payload["action"] == "delete"
    assert result.payload.get("title") == "Budget sync"


def test_calendar_part_of_day_defaults():
    result = parse_command("Set up a meeting on 1/2/2025 afternoon called Sprint Retro.")
    assert result is not None
    assert result.payload["action"] == "create"
    assert result.payload["title"] == "Sprint Retro"
    assert result.payload.get("start", "").startswith("2025-02-01T15:00")


def test_share_kitchen_tip_maps_to_search():
    result = parse_command("Share a kitchen tip about cleaning cast iron pans.")
    assert result is not None
    assert result.tool == "kitchen_tips"
    assert result.payload["action"] == "find"
    assert "cast iron" in (result.payload.get("keywords") or "").lower()


def test_add_kitchen_tip_via_form():
    result = parse_command('Add a kitchen tip via the form: "Chill the bowl before whipping cream" with tags dessert.')
    assert result is not None
    assert result.tool == "kitchen_tips"
    assert result.payload["action"] == "create"
    assert "Chill the bowl" in result.payload.get("title", "")
    assert "dessert" in (result.payload.get("keywords") or [])


def test_list_kitchen_tips_phrase():
    result = parse_command("Show kitchen tips")
    assert result is not None
    assert result.tool == "kitchen_tips"
    assert result.payload["action"] == "list"


def test_notes_question_defaults_to_list():
    result = parse_command("What Notes sections do we have?")
    assert result is not None
    assert result.tool == "app_guide"
    assert result.payload["action"] == "find"


def test_notes_update_detects_section_id():
    result = parse_command("Update the Notes entry for tier_policies with a note about governance.")
    assert result is not None
    assert result.tool == "app_guide"
    assert result.payload["action"] == "update"
    assert result.payload.get("id") == "tier_policies"


def test_notes_get_with_quotes():
    result = parse_command('Get Notes section "tier_policies"')
    assert result is not None
    assert result.tool == "app_guide"
    assert result.payload["action"] == "find"
    assert result.payload.get("id") == "tier_policies"


def test_notes_insert_mode_detection():
    create_top = parse_command('Add Notes section "future_work" with "Ship feature"')
    assert create_top is not None
    assert create_top.payload.get("insert_mode") == "top"

    create_bottom = parse_command("Append to notes section future_work")
    assert create_bottom is not None
    assert create_bottom.payload.get("insert_mode") == "bottom"


def test_calendar_defaults_start_to_now(monkeypatch):
    monkeypatch.setattr(calendar_parser, "_current_time_iso", lambda: "2025-01-02T03:04:00")
    result = parse_command('Create an event called "Quick sync"')
    assert result is not None
    assert result.payload["action"] == "create"
    assert result.payload.get("start") == "2025-01-02T03:04:00"


def test_calendar_end_inherits_start_date():
    result = parse_command("Schedule event 'Budget sync' on 1/2/2025 from 14 to 15 at HQ.")
    assert result is not None
    payload = result.payload
    assert payload["start"].startswith("2025-02-01T14:00")
    assert payload["end"].startswith("2025-02-01T15:00")
