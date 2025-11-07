# Tier‑1 Assistant Knowledge Sheet

## Quick Facts
- Runtime is pure Python: CLI entrypoint `python -m app.main` (or `./start orch`).
- Message flow: `NLUService` (rules/entities) → `Orchestrator` → tools or `LLMRouter` fallback.
- Observability: `LearningLogger` appends `TurnRecord` and `ReviewItem` JSONL rows (`logs/turns.jsonl`, `data_pipeline/nlu_training_bucket/pending.jsonl`), scrubs PII by default, and rotates files when size limits are reached.​:codex-file-citation[codex-file-citation]{line_range_start=138 line_range_end=203 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L138-L203"}​​:codex-file-citation[codex-file-citation]{line_range_start=142 line_range_end=253 path=core/learning_logger.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/learning_logger.py#L142-L253"}​
- Core utilities live under `app/`, `core/`, `tools/`, and are covered by pytest (`tests/`).
- `.env` values are auto-loaded via `python-dotenv` when available; keep secrets there and out of git.
- Legacy Rasa project is archived in `legacy_rasa/` for reference only.

## Runbook
1. `cd ~/rasa-llm-bot`
2. Activate virtualenv (alias `act` ⇒ `source .venv/bin/activate`).
3. Launch CLI: `./start orch` (forwards to `python -m app.main`).
4. Type messages; exit with `quit`/`exit`.

### Shutting Down
- Ctrl‑C from the CLI, then `deactivate` to drop the virtualenv.

### Testing
- Run unit tests with `pytest`; mention the command and output in status updates.
- Tests live in `tests/` and must expand alongside new behaviour (`test_learning_logger.py`, `test_news_service.py`, `test_nlu_service.py`, plus Tier‑3 cases such as `test_app_guide.py`, `test_todo_list_tool.py`, `test_kitchen_tips_tool.py`, `test_calendar_edit_tool.py`).​:codex-file-citation[codex-file-citation]{line_range_start=1 line_range_end=86 path=tests/test_learning_logger.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tests/test_learning_logger.py#L1-L86"}​​:codex-file-citation[codex-file-citation]{line_range_start=1 line_range_end=52 path=tests/test_kitchen_tips_tool.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tests/test_kitchen_tips_tool.py#L1-L52"}​

## Configuration Highlights
- `app/config.py` handles defaults (NLU confidence 0.65, enabled tools, logging paths, redaction toggles, rotation limits) and loads `.env` overrides.​:codex-file-citation[codex-file-citation]{line_range_start=19 line_range_end=162 path=app/config.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/config.py#L19-L162"}​
- `core/nlu_service.py` delegates every utterance to the shared command parser so weather/news/todo/kitchen/calendar payloads stay consistent before any LLM fallback.
- `core/llm_router.py` uses OpenAI Python v1 API; replies with guidance if `OPENAI_API_KEY` is missing.
- `core/news_service.py` wraps Google News RSS + NewsAPI with retry-friendly HTTP helpers.
- Tools:
  - `tools/weather.py` (Open‑Meteo hourly+current, time-aware summaries).
  - `tools/news.py` (delegates to `core.news_service.topic_news_search`).
  - `tools/todo_list.py` (CRUD + Danish deadline parsing, countdown metadata, formatted + raw JSON output for verification).​:codex-file-citation[codex-file-citation]{line_range_start=1 line_range_end=420 path=tools/todo_list.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/todo_list.py#L1-L420"}​
  - `tools/kitchen_tips.py` (read-only tips with optional reference link and raw JSON echo).​:codex-file-citation[codex-file-citation]{line_range_start=1 line_range_end=219 path=tools/kitchen_tips.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/kitchen_tips.py#L1-L219"}​
  - `tools/calendar_edit.py` (add/update/delete calendar events with optional location/link).​:codex-file-citation[codex-file-citation]{line_range_start=32 line_range_end=360 path=tools/calendar_edit.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/calendar_edit.py#L32-L360"}​

## Data & Extras
- Tier‑3 data stores sit under `data_pipeline/`: `app_guide.json`, `todos.json`, `kitchen_tips.json`, `calendar.json`. Every read/write flows through `core.json_storage` for atomic persistence.​:codex-file-citation[codex-file-citation]{line_range_start=1 line_range_end=41 path=core/json_storage.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/json_storage.py#L1-L41"}​
- Manage the knowledge base via `AppGuideStore` (list/get/upsert/delete). Docs (`docs/knowledge.md`) should mirror `knowledge/app_guide.py` entries so human-readable guidance matches the JSON served to tools.​:codex-file-citation[codex-file-citation]{line_range_start=37 line_range_end=140 path=knowledge/app_guide.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/knowledge/app_guide.py#L37-L140"}​
- Todo reminders accept Danish-style dates (e.g., `1/7/2026`, `1 juli 2026`) from structured fields (`deadline`, `due`, `date`, `reminder`) or free-form `message`; stored items record `deadline_days_until` so `list todos` surfaces close deadlines first.​:codex-file-citation[codex-file-citation]{line_range_start=43 line_range_end=260 path=tools/todo_list.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/todo_list.py#L43-L260"}​​:codex-file-citation[codex-file-citation]{line_range_start=34 line_range_end=106 path=tests/test_todo_list_tool.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tests/test_todo_list_tool.py#L34-L106"}​
- Kitchen tips now allow optional `link` references, and calendar events store optional `location`/`link` fields; all tool responses echo the raw JSON payload so testers can confirm persisted data without opening files.​:codex-file-citation[codex-file-citation]{line_range_start=27 line_range_end=219 path=tools/kitchen_tips.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/kitchen_tips.py#L27-L219"}​​:codex-file-citation[codex-file-citation]{line_range_start=142 line_range_end=360 path=tools/calendar_edit.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/calendar_edit.py#L142-L360"}​
- No Rasa training data is used in Tier‑1. Historic files (`data/`, `domain.yml`, `config.yml`, etc.) now live in `legacy_rasa/`.
- Tier‑2 logging produces data under `logs/` and `data_pipeline/nlu_training_bucket/`; tune `LOG_REDACTION_ENABLED`, `LOG_REDACTION_PATTERNS`, `LOG_MAX_BYTES`, `LOG_BACKUP_COUNT` as needed.​:codex-file-citation[codex-file-citation]{line_range_start=108 line_range_end=162 path=app/config.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/config.py#L108-L162"}​

## Development Practices
- Tier roadmap (see `AGENTS.md`) is sequential: do not pull higher-tier tasks early without user approval.
- Every feature must ship with pytest coverage; report the command/output in status updates.
- Keep `AGENTS.md` synchronized with architectural or tooling changes.

## Tier Vision Snapshot
- **Tier 1 – Baseline Runtime**: Fast CLI loop with command-parser-driven tools plus ChatGPT fallback.
- **Tier 2 – Logging & Observability**: Structured logs + review queue now ship in Tier‑1; focus is expanding metrics/visualization next.
- **Tier 3 – Tool Expansion & Knowledge**: Todos, calendar, kitchen tips, and editable knowledge base built on atomic JSON stores.
- Higher tiers (4–8) remain future roadmap items (self-improving NLU, UI, always-on execution, etc.) and only start after the preceding tier completes.
