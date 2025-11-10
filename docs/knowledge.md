# Notes for Tier‑1 Assistant

## Quick Start
- Activate `.venv` (alias `act` → `source .venv/bin/activate`).
- CLI entry `./start orch`; web UI `./start web` (FastAPI + static dashboard).
- Flow reminder: shared parser (`core/parsers/*`) → `NLUService` → `Orchestrator` → Tier‑3 tool or `LLMRouter` fallback. Logs land in `logs/turns.jsonl`, review queue in `data_pipeline/nlu_training_bucket/`.
- Tool stores live under `data_pipeline/{todos,kitchen_tips,calendar,app_guide}.json`; helpers in `core/json_storage.py` keep writes atomic.

## Testing checklist
1. Parser coverage: `pytest tests/testing_parsers/test_command_parser.py`.
2. Tool/stateful coverage: `pytest tests/testing_tools/test_todo_list_tool.py tests/testing_tools/test_calendar_edit_tool.py`.
3. Kitchen/App integration: `pytest tests/testing_tools/test_kitchen_app_tool.py`.
4. Domain suites when touched: `tests/test_learning_logger.py`, `tests/test_news_service.py`, `tests/test_nlu_service.py`, `tests/test_web_api.py`.
5. Mention each command/output in your status update so reviewers know which coverage ran.

## Eval habits
- Run `./start eval --config config/eval_prompts.yml` whenever prompts/parsers change. `--include-synthetic --auto-threshold 20` prevents spam runs.
- Add any fixed regression prompt to `config/eval_prompts.yml` so the harness catches it next time.
- Only retrain the classifier (`python -m app.train_intent_classifier ...`) after reviewing the eval report and ensuring enough labeled prompts exist.

## Web UI reminders
- `./start web` launches FastAPI (`app/web_api.py`). Default host/port configurable via `WEB_UI_HOST/PORT` in `app/config.py`.
- `POST /api/chat` mirrors the CLI. `/api/data/{todos|kitchen_tips|calendar|app_guide}` proxies straight into the Tier‑3 tools so validation stays centralized.
- Labeling tables talk to `/api/logs/{pending,label,import,export}`; all paths reuse the same dedupe logic as the CLI tooling.

## Parser/Tool architecture
- Parser logic is split between shared helpers (`core/parser_utils/text.py`, `core/parser_utils/datetime.py`) and per-tool modules (`core/parsers/weather.py`, `news.py`, `todo.py`, `kitchen.py`, `calendar.py`, `app_guide.py`). `core/command_parser.py` is just the router.
- Tool integration tests now call `parse_command` + tool `run()` so prompts like “add a todo reminding me…” stay exercised end-to-end.
- Whenever parser or tool behaviour changes, update the relevant module, extend the test file in `tests/testing_parsers/` or `tests/testing_tools/`, and rerun the suites listed above.

## Config + storage notes
- Defaults (NLU threshold, enabled tools, log paths, redaction, web UI host) live in `app/config.py`. Secrets stay in `.env`.
- `core/learning_logger.py` scrubs PII by default; only disable redaction for local debugging and document the decision.
- Legacy Rasa bot is still in `legacy_rasa/` for reference but isn’t part of the runtime.
