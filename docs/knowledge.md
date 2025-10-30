# Rasa LLM Bot – Quick Facts
- CALM routing: NLU-first for clear commands; LLM router on fallback for semantics.
- Tools: weather (Open-Meteo), news daily (DR default), todos (data/todos.json), .ics generator (data/events/).

# Runbook
- Train: `rasa train`
- Start actions: `rasa run actions -vv` (needs restart after editing actions/)
- Chat: `rasa shell`
- Env: `act` (alias for `source .venv/bin/activate`)

# Fallback & Thresholds
- FallbackClassifier threshold: 0.7; ambiguity_threshold: 0.1
- Out-of-scope → LLM router
- LLM tool eligibility via .env flags (e.g., LLM_WEATHER_FALLBACK)

# Weather Tool
- NLU intent: ask_weather with (city) entity
- API: Open-Meteo geocoding + forecast current temperature_2m & weather_code
- Human mapping via WMO_TEXT

# News – Defaults
- “daily overview” uses DR frontpage headlines (NLU-first).
- Topic-specific searches use LLM tool (if enabled).

# Todos
- Todos are stored locally in a JSON file at: `data/todos.json`.
- Actions: `action_add_todo`, `action_list_todos`.

# Calendar
- create_event → generates .ics to data/events/
- Time format: "YYYY-MM-DD HH:MM" (24h)

# USER PROCESS - STARTING
1. (If general Terminal shell) cd ~/rasa-llm-bot
2. act                 # tab 1(alias; activates venv)
3. make actions        # tab 1
4. act                 # tab 2
5. make shell          # tab 2

# USER PROCESS - STOPPING
1. In each terminal tab running Rasa: press Ctrl-C once or twice until it exits
2. (Optional) Deactivate the venv: deactivate

# USER PROCESS - TRAINING
0. (before make actions and make shell)
1. rasa data validate     # tab 1
2. rasa train             # tab 1
3. [standard starting process]

# File explanations
- `actions/` — Python custom actions (runtime code, not trained).  
- `data/` — Training data:
  - `nlu.yml` for intents/examples
  - `rules.yml` / `stories.yml` for flows
- `domain.yml` — Declares intents, responses, **actions** (registers `action_llm_router`)
- `config.yml` — Pipeline & policies (e.g., `FallbackClassifier`)
- `endpoints.yml` — How Core calls the action server
- `credentials.yml` — Channel auth (unused for local `rasa shell`)
- `models/` — trained model files: **Build artifacts** created by `rasa train` (ignored by Git)
- `.env` — Secrets (API keys) loaded by `python-dotenv`. **Ignored by Git**
- `.venv/` — isolated Python environment. Disposable and ignored