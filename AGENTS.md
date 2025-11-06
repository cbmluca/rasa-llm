> [!IMPORTANT]
> **Maintenance Rule for Codex**
> This `AGENT.md` file must stay synchronized with the codebase.
> Whenever the App is extended or refactored, Codex should:
> 1. Update the **links and line ranges** in `:codex-file-citation[...]` blocks to match current code.
> 2. Revise existing agent and flow descriptions to reflect any behavioral or architectural changes.
> 3. Add entries for **new agents, tools, or orchestrator modules** as they are introduced.
> 4. Remove or deprecate sections corresponding to deleted functionality.
> Treat this document as the **source of truth for the system’s active agent architecture.**
> Every Tier milestone (1–6) must include a brief update to `AGENT.md`.
> ---------------------------------------------------------------------------------------------

## Overview
This document describes how agents are defined and orchestrated in this repository.
This repo now centers on the Tier-1 orchestration layer under `app/`, `core/`, and
`tools/`. The legacy Rasa project has been archived under `legacy_rasa/` for
reference; it no longer participates in the active runtime.

New agents/tools should continue to prefer the `tools/` + `core/tool_registry.py` path.


The Tier-1 CLI assembles an `Orchestrator` with the rule-based `NLUService`, a `ToolRegistry`, and the `LLMRouter` so every message follows the NLU → Orchestrator → Tool chain.​:codex-file-citation[codex-file-citation]{line_range_start=17 line_range_end=48 path=app/main.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/main.py#L17-L48"}​​:codex-file-citation[codex-file-citation]{line_range_start=27 line_range_end=67 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L27-L67"}​

---

## Agent Flow
1. **User request** → handled by `core.orchestrator.Orchestrator.handle_message()` after the CLI captures the text.​:codex-file-citation[codex-file-citation]{line_range_start=31 line_range_end=48 path=app/main.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/main.py#L31-L48"}​​:codex-file-citation[codex-file-citation]{line_range_start=27 line_range_end=72 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L27-L72"}​
2. **NLU classification** (rule heuristics + entities): `NLUService.parse()` maps obvious intents and extracts city/location, Danish/English phrasing, relative day phrases, clock times, and “news about …” topics so payloads already contain structured context.​:codex-file-citation[codex-file-citation]{line_range_start=65 line_range_end=218 path=core/nlu_service.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/nlu_service.py#L65-L218"}​
3. **Router/Orchestrator**:
   - If confidence ≥ threshold → call the registered tool via `ToolRegistry.run_tool()` (weather/news) with the parsed entities.​:codex-file-citation[codex-file-citation]{line_range_start=82 line_range_end=108 path=core/nlu_service.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/nlu_service.py#L82-L108"}​​:codex-file-citation[codex-file-citation]{line_range_start=47 line_range_end=66 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L47-L66"}​​:codex-file-citation[codex-file-citation]{line_range_start=18 line_range_end=36 path=core/tool_registry.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/tool_registry.py#L18-L36"}​
   - Else → `LLMRouter.route()` asks OpenAI which tool (if any) should run; when no tool is selected the orchestrator triggers the general ChatGPT fallback whose answers start with “From ChatGPT.”​:codex-file-citation[codex-file-citation]{line_range_start=56 line_range_end=72 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L56-L72"}​​:codex-file-citation[codex-file-citation]{line_range_start=24 line_range_end=121 path=core/llm_router.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/llm_router.py#L24-L121"}​
4. **Tool execution** → weather and news modules fetch/compute results from APIs or curated data.​:codex-file-citation[codex-file-citation]{line_range_start=13 line_range_end=116 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L13-L116"}​​:codex-file-citation[codex-file-citation]{line_range_start=11 line_range_end=25 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L11-L25"}​
5. **Response assembly** → tool outputs are normalized with formatter helpers before returning to the user.​:codex-file-citation[codex-file-citation]{line_range_start=35 line_range_end=45 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L35-L45"}​​:codex-file-citation[codex-file-citation]{line_range_start=118 line_range_end=145 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L118-L145"}​​:codex-file-citation[codex-file-citation]{line_range_start=28 line_range_end=45 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L28-L45"}​

---

## Agents
| Agent | Description | Source | Trigger / Intent |
|--------|--------------|--------|------------------|
| **NLU Agent** | Parses user input into intents and extracts city/topic/time entities (English + Danish cues) before confidence-gating. | `core/nlu_service.py` (`NLUService`)​:codex-file-citation[codex-file-citation]{line_range_start=25 line_range_end=201 path=core/nlu_service.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/nlu_service.py#L25-L201"}​ | All user inputs |
| **Weather Agent** | Calls Open-Meteo geocoding + hourly/current APIs, honors parsed time hints for future hours, and formats forecast/current summaries. | `tools/weather.py` (`run`, `format_weather_response`)​:codex-file-citation[codex-file-citation]{line_range_start=65 line_range_end=248 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L65-L248"}​ | `intent:ask_weather`​:codex-file-citation[codex-file-citation]{line_range_start=51 line_range_end=55 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L51-L55"}​ |
| **News Agent** | Reuses the shared topic search helper (Google News + NewsAPI) to return current headlines for the requested topic. | `tools/news.py` (`run`, `format_news_list`)​:codex-file-citation[codex-file-citation]{line_range_start=11 line_range_end=45 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L11-L45"}​ | `intent:get_news`​:codex-file-citation[codex-file-citation]{line_range_start=51 line_range_end=55 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L51-L55"}​ |
| **Fallback Agent** | Asks OpenAI which tool should run and, when none apply, produces a prefixed “From ChatGPT” answer for the user. | `core/llm_router.py` (`LLMRouter`)​:codex-file-citation[codex-file-citation]{line_range_start=24 line_range_end=121 path=core/llm_router.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/llm_router.py#L24-L121"}​ | Low NLU confidence / router “no tool” decisions.​:codex-file-citation[codex-file-citation]{line_range_start=56 line_range_end=70 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L56-L70"}​ |

---

## Key Files
| File | Purpose |
|------|----------|
| `app/main.py` | CLI entry point; builds the orchestrator wiring NLU, registry, and LLM router.​:codex-file-citation[codex-file-citation]{line_range_start=17 line_range_end=52 path=app/main.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/main.py#L17-L52"}​ |
| `app/config.py` | Defaults for NLU threshold, enabled tools, and OpenAI credentials lookup (auto-loads `.env` when python-dotenv is available).​:codex-file-citation[codex-file-citation]{line_range_start=8 line_range_end=54 path=app/config.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/config.py#L8-L54"}​ |
| `core/orchestrator.py` | Coordinates NLU, tool dispatch, and response formatting.​:codex-file-citation[codex-file-citation]{line_range_start=27 line_range_end=67 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L27-L67"}​ |
| `core/nlu_service.py` | Lightweight intent detector used before escalating to the LLM.​:codex-file-citation[codex-file-citation]{line_range_start=25 line_range_end=201 path=core/nlu_service.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/nlu_service.py#L25-L201"}​ |
| `core/llm_router.py` | OpenAI-based fallback router that decides between tools, instructs on missing credentials, and returns direct replies.​:codex-file-citation[codex-file-citation]{line_range_start=15 line_range_end=121 path=core/llm_router.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/llm_router.py#L15-L121"}​ |
| `core/tool_registry.py` | Registers tool callables and mediates execution/lookup.​:codex-file-citation[codex-file-citation]{line_range_start=18 line_range_end=40 path=core/tool_registry.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/tool_registry.py#L18-L40"}​ |
| `core/news_service.py` | Shared NewsAPI / Google News helpers formerly in the Rasa action layer.​:codex-file-citation[codex-file-citation]{line_range_start=1 line_range_end=189 path=core/news_service.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/news_service.py#L1-L189"}​ |
| `tools/weather.py` | Weather tool implementation plus time-aware formatter helpers.​:codex-file-citation[codex-file-citation]{line_range_start=13 line_range_end=248 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L13-L248"}​ |
| `tools/news.py` | News tool implementation plus formatter helpers.​:codex-file-citation[codex-file-citation]{line_range_start=11 line_range_end=45 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L11-L45"}​ |
| `tools/__init__.py` | Helper to register all core tools with a `ToolRegistry`.​:codex-file-citation[codex-file-citation]{line_range_start=13 line_range_end=16 path=tools/__init__.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/__init__.py#L13-L16"}​ |

---

### Archived Legacy Rasa Project
The historical Rasa project structure is preserved under `legacy_rasa/` for
reference only. Move those files back to their original locations if you ever
need to resurrect the old stack.​:codex-file-citation[codex-file-citation]{line_range_start=1 line_range_end=10 path=legacy_rasa/README.md git_url="https://github.com/cbmluca/rasa-llm/blob/main/legacy_rasa/README.md#L1-L10"}​

---

## Notes
- Confidence threshold for NLU fallback: `0.65` (see `app/config.py`).​:codex-file-citation[codex-file-citation]{line_range_start=18 line_range_end=28 path=app/config.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/config.py#L18-L28"}​
- The Tier-1 CLI automatically loads `.env` values on import when `python-dotenv` is installed.​:codex-file-citation[codex-file-citation]{line_range_start=8 line_range_end=13 path=app/config.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/config.py#L8-L13"}​
- Tool agents expose `run(payload)` callables; formatters convert their dict results into strings for replies.​:codex-file-citation[codex-file-citation]{line_range_start=65 line_range_end=145 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L65-L145"}​​:codex-file-citation[codex-file-citation]{line_range_start=11 line_range_end=45 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L11-L45"}​
- Weather tool respects parsed time hints by selecting the closest hourly forecast when available and otherwise returning current conditions with a note.​:codex-file-citation[codex-file-citation]{line_range_start=65 line_range_end=145 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L65-L145"}​
- News tool now calls the shared `core.news_service` helpers (Google News + NewsAPI) for live headlines.​:codex-file-citation[codex-file-citation]{line_range_start=11 line_range_end=45 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L11-L45"}​​:codex-file-citation[codex-file-citation]{line_range_start=1 line_range_end=189 path=core/news_service.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/news_service.py#L1-L189"}​
- When the router cannot pick a tool, the general ChatGPT fallback answers the user and prefixes responses with “From ChatGPT.”​:codex-file-citation[codex-file-citation]{line_range_start=56 line_range_end=70 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L56-L70"}​​:codex-file-citation[codex-file-citation]{line_range_start=79 line_range_end=92 path=core/llm_router.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/llm_router.py#L79-L92"}​
- LLM fallback uses the OpenAI Python v1 client (`chat.completions`) and, when credentials are missing, returns guidance for setting `OPENAI_API_KEY` before retrying.​:codex-file-citation[codex-file-citation]{line_range_start=58 line_range_end=92 path=core/llm_router.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/llm_router.py#L58-L92"}​​:codex-file-citation[codex-file-citation]{line_range_start=8 line_range_end=54 path=app/config.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/config.py#L8-L54"}​
- Future agents can be added by:
  1. Creating a new tool module under `/tools/` that implements a `run(payload)` callable.​:codex-file-citation[codex-file-citation]{line_range_start=13 line_range_end=116 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L13-L116"}​​:codex-file-citation[codex-file-citation]{line_range_start=11 line_range_end=25 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L11-L25"}​
  2. Registering it via `load_all_core_tools()` or analogous registry wiring in `tools/__init__.py`.​:codex-file-citation[codex-file-citation]{line_range_start=13 line_range_end=16 path=tools/__init__.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/__init__.py#L13-L16"}​​:codex-file-citation[codex-file-citation]{line_range_start=18 line_range_end=36 path=core/tool_registry.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/tool_registry.py#L18-L36"}​
  3. Updating orchestrator or router configuration (e.g., enabling the tool name in `app/config.py`) and reflecting it in this Agents table.​:codex-file-citation[codex-file-citation]{line_range_start=18 line_range_end=38 path=app/config.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/config.py#L18-L38"}​​:codex-file-citation[codex-file-citation]{line_range_start=35 line_range_end=65 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L35-L65"}​

---

## Example
```python
# Example: News & Weather Agent Registration
from core.tool_registry import ToolRegistry
from tools import load_all_core_tools
from core.llm_router import LLMRouter

registry = ToolRegistry()
load_all_core_tools(registry)

AGENTS = {
    "news": registry.available_tools()["news"],
    "weather": registry.available_tools()["weather"],
    "fallback": LLMRouter(model="gpt-4o-mini", api_key="...", enabled_tools=("weather", "news")),
}
```

---

## Development Roadmap (Tier Plan)
Each Tier represents a functional milestone in the system’s evolution.
Codex must keep this section synchronized with the repository state.
Whenever a Tier is completed or partially implemented, update this table and associated code citations.

| Tier  | Title                                                   | Purpose                                                                    | Core Files / Modules                                                                                                                             | Key Additions                                                                                          |
| ----- | ------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **1** | **Core Runtime + 2 Tools (Baseline)**                   | Establish CLI orchestrator pipeline (NLU → LLM → Tool) with weather/news.  | `app/main.py`, `core/orchestrator.py`, `core/nlu_service.py`, `core/llm_router.py`, `core/tool_registry.py`, `tools/weather.py`, `tools/news.py` | Working message loop, formatted responses.                                                             |
| **2** | **Logging & Observability**                             | Add minimal analytics and failure visibility before scaling tools.         | `core/learning_logger.py`, `data_pipeline/nlu_training_bucket`, `data_pipeline/new_tool_ideas.json`                                              | _WIP_: Tier-1 NLU now extracts city/time/topic entities, weather honors time hints, news pulls live headlines, and router fallbacks guide missing API keys; logging artifacts still pending.​:codex-file-citation[codex-file-citation]{line_range_start=25 line_range_end=201 path=core/nlu_service.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/nlu_service.py#L25-L201"}​​:codex-file-citation[codex-file-citation]{line_range_start=13 line_range_end=248 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L13-L248"}​​:codex-file-citation[codex-file-citation]{line_range_start=11 line_range_end=45 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L11-L45"}​​:codex-file-citation[codex-file-citation]{line_range_start=1 line_range_end=189 path=core/news_service.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/news_service.py#L1-L189"}​​:codex-file-citation[codex-file-citation]{line_range_start=58 line_range_end=92 path=core/llm_router.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/llm_router.py#L58-L92"}​ |
| **3** | **Tool Expansion + Editable Knowledge Base (RAG Seed)** | Broaden functionality and introduce persistent, editable data.             | `tools/todo_list.py`, `tools/kitchen_tips.py`, `tools/calendar_edit.py`, `knowledge/app_guide.py`                                                | CRUD for todos, kitchen tips, calendar; file-based “App Guide” editable in code or via helper scripts. |
| **4** | **Self-Evolving Logic**                                 | Use logs and admin scripts to retrain or extend NLU automatically.         | `core/learning_logger.py`, `app/admin_scripts.py`                                                                                                | CLI scripts for reviewing failed intents, adding examples, proposing new tools.                        |
| **5** | **Web UI / Admin Panel**                                | Introduce browser interface for chat and manual data editing.              | `ui/web_app.py`, `ui/channel_api.py`                                                                                                             | Chat interface, admin pages for viewing logs, editing todos/kitchen tips/app guide.                    |
| **6** | **Infrastructure / Always-On Execution**                | Enable persistent runtime and scheduled background tasks.                  | `app/main.py` (scheduler hooks), deployment configs                                                                                              | Cron/APScheduler or equivalent for continuous operation.                                               |
| **7** | **Scheduler & Agent Actions (Advanced Calendar)**       | Allow delayed or autonomous actions such as reminders and pseudo-bookings. | `core/scheduler.py`, `tools/calendar_edit.py` (extended), `data_pipeline/calendar_tasks.json`                                                    | Handle time-based triggers: “book badminton Thursday,” “doctor check-up window.”                       |
| **8** | **Future / Backlog: IoT, Voice, Advanced RAG**          | Expand modalities and self-documentation.                                  | `tools/tts.py`, `tools/voice_recognition.py`, `integrations/iot_home.py`, `knowledge/rag_store.py`                                               | Text-to-speech, speech-to-text, smart-home integration, vector-based RAG that updates from logs.       |

**Evolution Summary**
- Tiers 1–2: foundation and visibility.
- Tier 3: breadth (more tools + editable data).
- Tier 4: self-learning (turn logs → improvements).
- Tier 5: usability (UI + admin).
- Tier 6–7: autonomy (background & scheduling).
- Tier 8: ecosystem expansion (IoT, multimodal, advanced RAG).

## Integration & Governance Notes
- The editable knowledge base (knowledge/app_guide.py) begins as a file-based store in Tier 3 and evolves into a vector-based RAG (knowledge/rag_store.py) by Tier 8.
- The Tier list in this document is the canonical roadmap. Codex must keep it synchronized with the actual repository structure and current development status.
- Every Git commit completing a Tier (or part of one) must include a short update here describing what was implemented, deferred, or changed.

## Development & Validation Rules
**1. End-of-Tier Validation:**
- Each Tier must conclude with a short, focused round of relevant tests—unit, integration, or manual verification—before the Tier is marked completed by the USER.
- Tests should confirm that all functions, flows, and agents defined for that Tier behave as intended.
- Codex should log test outcomes or references (e.g., tests/test_weather.py) where applicable.

**2. Start-of-Tier Confirmation:**
- When beginning a new Tier (or a new task within a Tier), Codex must explicitly confirm the scope with the USER.
- Ask the USER to validate or adjust the planned tasks, files, or goals.
- This prevents duplicated work and ensures any USER-driven modifications to Tier structure are acknowledged before coding begins.

**3. Continuous Synchronization:**
- If scope or architecture changes mid-Tier, Codex should propose corresponding edits to this file (AGENT.md) immediately.
- Never start implementation on a new module or feature without confirming where it fits within the Tier roadmap.

**4. Commenting New Code:**
Every new chunk of functionality—whether a class, function, or file—must include a concise, high-level comment describing:
- Its purpose and relationship to the Tier or agent it belongs to.
- Any dependencies, triggers, or external API calls.
- If it replaces or deprecates existing code, note that explicitly.
This ensures that Codex, the USER, and future contributors can quickly map new code back to its design intent in AGENT.md.
