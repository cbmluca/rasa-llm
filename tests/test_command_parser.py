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


def test_calendar_parses_danish_datetime():
    result = parse_command('calendar create title "Standup" start 1/9/2026 09:00 end 1/9/2026 10:00')
    assert result is not None
    assert result.payload["start"].startswith("2026-09-01T09:00")
    assert result.payload["end"].startswith("2026-09-01T10:00")


def test_news_language_marker_detection():
    result = parse_command("search english news about energipolitik")
    assert result is not None
    assert result.payload.get("language") == "en"


def test_app_guide_parser_detects_commands():
    result = parse_command('list app guide sections')
    assert result is not None
    assert result.tool == "app_guide"
    assert result.payload["action"] == "list"
