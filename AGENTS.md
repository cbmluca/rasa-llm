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
This repo currently has two layers:

1. The new Tier-1 orchestration layer under `app/` and `core/` (CLI-style, NLU → tool → LLM).
2. The original Rasa project structure (`domain.yml`, `config.yml`, `actions/…`) kept for compatibility.

New agents/tools should prefer the `tools/` + `core/tool_registry.py` path.

The Tier-1 CLI assembles an `Orchestrator` with the rule-based `NLUService`, a `ToolRegistry`, and the `LLMRouter` so every message follows the NLU → Orchestrator → Tool chain.​:codex-file-citation[codex-file-citation]{line_range_start=17 line_range_end=48 path=app/main.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/main.py#L17-L48"}​​:codex-file-citation[codex-file-citation]{line_range_start=27 line_range_end=67 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L27-L67"}​

---

## Agent Flow
1. **User request** → handled by `core.orchestrator.Orchestrator.handle_message()` after the CLI captures the text.​:codex-file-citation[codex-file-citation]{line_range_start=32 line_range_end=48 path=app/main.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/main.py#L32-L48"}​​:codex-file-citation[codex-file-citation]{line_range_start=27 line_range_end=67 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L27-L67"}​
2. **NLU classification** (Rasa heuristics): `NLUService.parse()` extracts intents and lightweight entities using keyword rules.​:codex-file-citation[codex-file-citation]{line_range_start=20 line_range_end=44 path=core/nlu_service.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/nlu_service.py#L20-L44"}​
3. **Router/Orchestrator**:
   - If confidence ≥ threshold → call the registered tool via `ToolRegistry.run_tool()` (weather/news).​:codex-file-citation[codex-file-citation]{line_range_start=42 line_range_end=44 path=core/nlu_service.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/nlu_service.py#L42-L44"}​​:codex-file-citation[codex-file-citation]{line_range_start=47 line_range_end=65 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L47-L65"}​​:codex-file-citation[codex-file-citation]{line_range_start=18 line_range_end=36 path=core/tool_registry.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/tool_registry.py#L18-L36"}​
   - Else → use the OpenAI-backed `LLMRouter.route()` to determine the best tool or respond directly.​:codex-file-citation[codex-file-citation]{line_range_start=56 line_range_end=67 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L56-L67"}​​:codex-file-citation[codex-file-citation]{line_range_start=15 line_range_end=70 path=core/llm_router.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/llm_router.py#L15-L70"}​
4. **Tool execution** → weather and news modules fetch/compute results from APIs or curated data.​:codex-file-citation[codex-file-citation]{line_range_start=49 line_range_end=68 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L49-L68"}​​:codex-file-citation[codex-file-citation]{line_range_start=14 line_range_end=26 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L14-L26"}​
5. **Response assembly** → tool outputs are normalized with formatter helpers before returning to the user.​:codex-file-citation[codex-file-citation]{line_range_start=35 line_range_end=45 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L35-L45"}​​:codex-file-citation[codex-file-citation]{line_range_start=71 line_range_end=86 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L71-L86"}​​:codex-file-citation[codex-file-citation]{line_range_start=28 line_range_end=40 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L28-L40"}​

---

## Agents
| Agent | Description | Source | Trigger / Intent |
|--------|--------------|--------|------------------|
| **NLU Agent** | Parses user input into intents and confidence scores using keyword heuristics. | `core/nlu_service.py` (`NLUService`)​:codex-file-citation[codex-file-citation]{line_range_start=20 line_range_end=44 path=core/nlu_service.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/nlu_service.py#L20-L44"}​ | All user inputs |
| **Weather Agent** | Calls Open-Meteo geocoding & forecast APIs and formats a short summary. | `tools/weather.py` (`run`, `format_weather_response`)​:codex-file-citation[codex-file-citation]{line_range_start=49 line_range_end=86 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L49-L86"}​ | `intent:ask_weather`​:codex-file-citation[codex-file-citation]{line_range_start=51 line_range_end=54 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L51-L54"}​ |
| **News Agent** | Returns curated sample headlines and formats them into bullet lists. | `tools/news.py` (`run`, `format_news_list`)​:codex-file-citation[codex-file-citation]{line_range_start=14 line_range_end=40 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L14-L40"}​ | `intent:get_news`​:codex-file-citation[codex-file-citation]{line_range_start=51 line_range_end=54 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L51-L54"}​ |
| **Fallback Agent** | Delegates routing decisions to OpenAI when NLU confidence is low. | `core/llm_router.py` (`LLMRouter`)​:codex-file-citation[codex-file-citation]{line_range_start=15 line_range_end=70 path=core/llm_router.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/llm_router.py#L15-L70"}​ | Low NLU confidence / non-weather-news intents​:codex-file-citation[codex-file-citation]{line_range_start=47 line_range_end=67 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L47-L67"}​ |

---

## Key Files
| File | Purpose |
|------|----------|
| `domain.yml` | Rasa assistant intents, entities, slots, and actions for broader Tier-2 flows.​:codex-file-citation[codex-file-citation]{line_range_start=1 line_range_end=70 path=domain.yml git_url="https://github.com/cbmluca/rasa-llm/blob/main/domain.yml#L1-L70"}​ |
| `config.yml` | Rasa NLU pipeline and fallback policies.​:codex-file-citation[codex-file-citation]{line_range_start=1 line_range_end=18 path=config.yml git_url="https://github.com/cbmluca/rasa-llm/blob/main/config.yml#L1-L18"}​ |
| `app/main.py` | CLI entry point; builds the orchestrator wiring NLU, registry, and LLM router.​:codex-file-citation[codex-file-citation]{line_range_start=17 line_range_end=52 path=app/main.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/main.py#L17-L52"}​ |
| `app/config.py` | Defaults for NLU threshold, enabled tools, and OpenAI credentials lookup.​:codex-file-citation[codex-file-citation]{line_range_start=11 line_range_end=47 path=app/config.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/config.py#L11-L47"}​ |
| `core/orchestrator.py` | Coordinates NLU, tool dispatch, and response formatting.​:codex-file-citation[codex-file-citation]{line_range_start=27 line_range_end=67 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L27-L67"}​ |
| `core/nlu_service.py` | Lightweight intent detector used before escalating to the LLM.​:codex-file-citation[codex-file-citation]{line_range_start=20 line_range_end=44 path=core/nlu_service.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/nlu_service.py#L20-L44"}​ |
| `core/llm_router.py` | OpenAI-based fallback router that decides between tools and text replies.​:codex-file-citation[codex-file-citation]{line_range_start=15 line_range_end=70 path=core/llm_router.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/llm_router.py#L15-L70"}​ |
| `core/tool_registry.py` | Registers tool callables and mediates execution/lookup.​:codex-file-citation[codex-file-citation]{line_range_start=18 line_range_end=40 path=core/tool_registry.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/tool_registry.py#L18-L40"}​ |
| `tools/weather.py` | Weather tool implementation plus formatter helpers.​:codex-file-citation[codex-file-citation]{line_range_start=49 line_range_end=86 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L49-L86"}​ |
| `tools/news.py` | News tool implementation plus formatter helpers.​:codex-file-citation[codex-file-citation]{line_range_start=14 line_range_end=40 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L14-L40"}​ |
| `tools/__init__.py` | Helper to register all core tools with a `ToolRegistry`.​:codex-file-citation[codex-file-citation]{line_range_start=13 line_range_end=16 path=tools/__init__.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/__init__.py#L13-L16"}​ |

---

## Notes
- Confidence threshold for NLU fallback: `0.65` (see `app/config.py`).​:codex-file-citation[codex-file-citation]{line_range_start=11 line_range_end=21 path=app/config.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/config.py#L11-L21"}​
- Tool agents expose `run(payload)` callables; formatters convert their dict results into strings for replies.​:codex-file-citation[codex-file-citation]{line_range_start=49 line_range_end=86 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L49-L86"}​​:codex-file-citation[codex-file-citation]{line_range_start=14 line_range_end=40 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L14-L40"}​
- LLM fallback uses the OpenAI ChatCompletion API; the key is read from `OPENAI_API_KEY` in the environment.​:codex-file-citation[codex-file-citation]{line_range_start=46 line_range_end=70 path=core/llm_router.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/llm_router.py#L46-L70"}​​:codex-file-citation[codex-file-citation]{line_range_start=36 line_range_end=47 path=app/config.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/config.py#L36-L47"}​
- Future agents can be added by:
  1. Creating a new tool module under `/tools/` that implements a `run(payload)` callable.​:codex-file-citation[codex-file-citation]{line_range_start=49 line_range_end=68 path=tools/weather.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/weather.py#L49-L68"}​​:codex-file-citation[codex-file-citation]{line_range_start=14 line_range_end=26 path=tools/news.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/news.py#L14-L26"}​
  2. Registering it via `load_all_core_tools()` or analogous registry wiring in `tools/__init__.py`.​:codex-file-citation[codex-file-citation]{line_range_start=13 line_range_end=16 path=tools/__init__.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/tools/__init__.py#L13-L16"}​​:codex-file-citation[codex-file-citation]{line_range_start=18 line_range_end=36 path=core/tool_registry.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/tool_registry.py#L18-L36"}​
  3. Updating orchestrator or router configuration (e.g., enabling the tool name in `app/config.py`) and reflecting it in this Agents table.​:codex-file-citation[codex-file-citation]{line_range_start=11 line_range_end=31 path=app/config.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/app/config.py#L11-L31"}​​:codex-file-citation[codex-file-citation]{line_range_start=35 line_range_end=65 path=core/orchestrator.py git_url="https://github.com/cbmluca/rasa-llm/blob/main/core/orchestrator.py#L35-L65"}​

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
| **2** | **Logging & Observability**                             | Add minimal analytics and failure visibility before scaling tools.         | `core/learning_logger.py`, `data_pipeline/nlu_training_bucket`, `data_pipeline/new_tool_ideas.json`                                              | Capture every turn; mark low-confidence intents; store retraining examples.                            |
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
**End-of-Tier Validation:**
- Each Tier must conclude with a short, focused round of relevant tests—unit, integration, or manual verification—before the Tier is marked completed by the USER.
- Tests should confirm that all functions, flows, and agents defined for that Tier behave as intended.
- Codex should log test outcomes or references (e.g., tests/test_weather.py) where applicable.

**Start-of-Tier Confirmation:**
- When beginning a new Tier (or a new task within a Tier), Codex must explicitly confirm the scope with the USER.
- Ask the USER to validate or adjust the planned tasks, files, or goals.
- This prevents duplicated work and ensures any USER-driven modifications to Tier structure are acknowledged before coding begins.

**Continuous Synchronization:**
- If scope or architecture changes mid-Tier, Codex should propose corresponding edits to this file (AGENT.md) immediately.
- Never start implementation on a new module or feature without confirming where it fits within the Tier roadmap.