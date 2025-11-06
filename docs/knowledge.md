# Tier‑1 Assistant Knowledge Sheet

## Quick Facts
- Runtime is pure Python: CLI entrypoint `python -m app.main` (or `./start orch`).
- Message flow: `NLUService` (rules/entities) → `Orchestrator` → tools or `LLMRouter` fallback.
- Observability: `LearningLogger` appends `TurnRecord` and `ReviewItem` JSONL rows (`logs/turns.jsonl`, `data_pipeline/nlu_training_bucket/pending.jsonl`) for every handled turn, redacting emails/phones/cards/IDs/URLs and rotating files when size caps are reached.​:codex-file-citation[codex-file-citation]{line_range_start=138 line_range_end=203 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L138-L203"}​​:codex-file-citation[codex-file-citation]{line_range_start=142 line_range_end=253 path=core/learning_logger.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/learning_logger.py#L142-L253"}​
- Core utilities live under `app/`, `core/`, `tools/`, and are covered by pytest (`tests/`).
- `.env` values are auto-loaded via `python-dotenv` when available; keep secrets there and out of git.
- Legacy Rasa project is archived in `legacy_rasa/` for reference only.

## Runbook
1. `cd ~/rasa-llm-bot`
2. Activate virtualenv (alias `act` ⇒ `source .venv/bin/activate`).
3. Launch CLI: `./start orch` (forwards to `python -m app.main`).
4. Type messages; exit with `quit`/`exit`.
5. Inspect recent logs (optional):
   - Turns: `tail -n 5 logs/turns.jsonl`
   - Review queue: `tail -n 5 data_pipeline/nlu_training_bucket/pending.jsonl`
   - Older segments live under `logs/turns.jsonl.1`, `.2`, etc. after rotation.

### Shutting Down
- Ctrl‑C from the CLI, then `deactivate` if the virtualenv should be closed.

### Testing
- Run unit tests with `pytest` (prints command + summary in status updates).
- Tests live in `tests/` and must expand whenever new behaviour/tools are added (e.g., `test_learning_logger.py`, `test_news_service.py`, `test_nlu_service.py`).​:codex-file-citation[codex-file-citation]{line_range_start=1 line_range_end=86 path=tests/test_learning_logger.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tests/test_learning_logger.py#L1-L86"}​

## Configuration Highlights
- `app/config.py` handles defaults (NLU confidence 0.65, logging paths, redaction/rotation toggles, enabled tools, LLM model) and loads `.env` overrides.​:codex-file-citation[codex-file-citation]{line_range_start=19 line_range_end=162 path=app/config.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/config.py#L19-L162"}​
- `core/nlu_service.py` provides keyword heuristics, city/topic/time extraction, and blocklists for non-city terms.
- `core/llm_router.py` uses OpenAI Python v1 API; replies with guidance if `OPENAI_API_KEY` is missing.
- `core/news_service.py` wraps Google News RSS + NewsAPI with retry-friendly HTTP helpers.
- Tools:
  - `tools/weather.py` (Open‑Meteo hourly+current, time-aware summaries).
  - `tools/news.py` (delegates to `core.news_service.topic_news_search`).

## Data & Extras
- No Rasa training data is used in Tier‑1. Historic files (`data/`, `domain.yml`, `config.yml`, etc.) now live in `legacy_rasa/` with `README.md` instructions for revival.
- Tier‑2 logging produces data under `logs/` and `data_pipeline/nlu_training_bucket/` for future self-training workflows; sanitisation/rotation can be tuned via `LOG_REDACTION_ENABLED`, `LOG_REDACTION_PATTERNS`, `LOG_MAX_BYTES`, `LOG_BACKUP_COUNT`.​:codex-file-citation[codex-file-citation]{line_range_start=108 line_range_end=162 path=app/config.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/config.py#L108-L162"}​

## Development Practices
- Tier roadmap (see `AGENTS.md`) is sequential: do not pull higher-tier tasks early without user confirmation.
- Every feature should ship with pytest coverage; mention the command and output when reporting results.
- Keep `AGENTS.md` synchronized with architectural or tooling changes.

## Tier Vision Snapshot
- **Tier 1 – Baseline Runtime**: Fast CLI loop with weather/news tools, deterministic heuristics, and ChatGPT fallback. Foundation is now stable.
- **Tier 2 – Logging & Observability**: Structured logs + review queue now ship in Tier‑1; focus is expanding metrics/visualization next.
- **Tier 3 – Tool Expansion & Knowledge**: Planned expansion toward todos, calendar, and lightweight knowledge base once observability is in place.
- Higher tiers (4–8) remain future roadmap items (self-improving NLU, UI, always-on execution, etc.) and will only start after the preceding tier completes.
