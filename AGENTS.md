> [!IMPORTANT]
> Maintenance Rule for Codex
> Keep this document synchronized with the active codebase. Whenever behavior, architecture, or tooling changes, update the relevant sections below so Codex (and humans) can rely on AGENTS.md as the canonical description of the system.
>
> Only document durable architecture/workflows here. Short-lived status, UI layout tweaks, or sprint-specific notes belong in changelogs or inline comments. This file is the canonical “central nervous system” reference.

## Scope Rules for Future Additions
Only include new content if all conditions are met:

- Describes stable runtime behavior (not visual placement, not “currently”)
- Defines a contract: inputs, outputs, storage rules, or routing guarantees
- Affects orchestrator flow, NLU logic, persistence, governance, or learning pipeline
- Written as a timeless statement (avoid “new”, “updated”)
- UI details only when required for backend-behavior expectations
- Deployment configurations, passwords, and concrete secrets belong elsewhere
- If uncertain: link out to the appropriate doc rather than expanding this file.

## Overview & Architecture

All user input flows through a central orchestrator:

```
User → NLUService → Orchestrator → ToolRegistry → Tool → Formatter → Client/UI
                                   ↘ LearningLogger (side channel)
```

Primary components:

- `app/main.py`, `app/web_api.py` – CLI + FastAPI entry points
- `core/orchestrator.py` – routing, dispatching, dry-run staging
- `core/nlu_service.py` – parser-first NLU then classifier fallback
- `core/json_storage.py` – atomic JSON persistence
- `core/learning_logger.py` – turn + review pipeline
- `core/auth.py` – reviewer identity and quotas

Legacy experiments under `legacy_rasa/` are excluded from runtime.

## Shared Behaviors & Guarantees

### Routing & NLU

- Deterministic parsers execute first
- Intent classifier enables fallback when parsing abstains
- LLM router runs only if both parser and classifier abstain
- Keyword probes assist CRUD mapping when user intent is fuzzy

### Self-Learning Pipeline

- Every handled message produces:
  - A `TurnRecord` (processed intent + metadata)
  - Optional `ReviewItem` (corrections)
- CRUD tool results are staged until reviewer confirmation

### Data Persistence

- All JSON tools rely on shared helpers for safe read/write
- Stores reside in `data_pipeline/` with controlled schema changes

### Authentication & Governance

- Reviewers authenticate with username/password (catalog in code)
- Sessions managed via secure cookies
- Non-admin reviewer quotas enforced server-side
- Governance/audit logic under `core/governance.py`

### Voice & Offline Behavior

- `/api/speech` handles audio ingestion + Whisper transcription
- Voice inbox surfaces stored transcription attempts for re-processing
- Offline prompts queue client-side and replay automatically once online

### Frontend Contract (backend-relevant only)

- UI must call FastAPI endpoints for reading/writing data stores
- UI enforces required parameters aligned with backend validation
- UI relies on authenticated session cookie, not token persistence

## Agent Flow (Canonical)

1. Capture input (text or voice→text)
2. `NLUService` parses → classifies if needed
3. Orchestrator dispatches to a Tool or to LLM fallback
4. CRUD persists only after reviewer confirmation
5. Response returns to client formatted per tool
6. `LearningLogger` stores artifacts to enable self-learning

## Agents & Tools

| Agent / Tool | Description | Trigger |
| --- | --- | --- |
| NLU Agent (`core/nlu_service.py`) | Deterministic parsing + entity extraction | All inputs |
| Intent Classifier (`core/intent_classifier.py`) | ML fallback for intent prediction | When parsing abstains |
| Weather Tool (`tools/weather_tool.py`) | Forecast summarization | `intent:weather` |
| News Tool (`tools/news_tool.py`) | Headline retrieval + topic normalization | `intent:news` |
| Todo Tool (`tools/todo_list_tool.py`) | CRUD + natural deadline parsing | `intent:todo_list` |
| Kitchen Tips Tool (`tools/kitchen_tips_tool.py`) | CRUD for tips indexed by title | `intent:kitchen_tips` |
| Calendar Tool (`tools/calendar_edit_tool.py`) | CRUD with date/time parsing | `intent:calendar_edit` |
| Notes Tool (`tools/app_guide_tool.py`) | Structured personal notes | `intent:app_guide` |
| LLM Router (`core/llm_router.py`) | Suggest tools or free-form response | Orchestrator fallback |
| Learning Logger (`core/learning_logger.py`) | Logs turn + review events | Every message |
| Auth Agent (`core/auth.py`) | Sessions, roles, quotas | Login + protected calls |

## Tier Roadmap

Only implemented tiers are documented here.

| Tier | Goal | Highlights |
| --- | --- | --- |
| 1 | Runtime foundation | CLI loop, parser-first routing |
| 2 | Observability | Logging + rotation |
| 3 | CRUD capabilities | JSON stores for todos/tips/calendar/notes |
| 4 | Self-learning | Review queue + correction endpoints |
| 5 | Web UI surface | FastAPI + Admin/data-store access |
| 6 | Governance | Roles, quotas, reviewer filtering |
| 7 | Voice & offline resilience | STT ingestion + installable SPA |

Future expansions (ML-assistance, scheduling, infra automation) are scoped in `docs/roadmap.md`.

## Integration Notes

- Notes store is auxiliary personal context — not system design
- Voice inbox must remain overseen by governance
- API schemas and review flow are considered stable interfaces
- Persist the `data_pipeline/` files (and other `data_pipeline/*` stores) on any hosted deployment via a durable volume (e.g., Fly.io `[[mounts]]` to `/app/data_pipeline`) so reviewer queues and tool stores survive redeploys.

## Development & Validation Rules

- Update AGENTS.md immediately upon architectural change.
- Confirm scope before beginning a new Tier or major feature.
- Validate each Tier with targeted tests or manual demo.
- Comment code with WHAT / WHY / HOW (not restating logic).
- Reuse existing patterns; avoid unnecessary divergence.
- For destructive actions, prefer guided manual intervention rather than speculative automation.

## Document Governance

AGENTS.md is the authoritative source for:

- Runtime architecture
- Agents, tools, and routing contracts
- Data pipeline + governance behaviors
- Auth + quota rules

All other information:

- Deployment → deployment docs
- UI patterns → frontend docs
- Backlog/experiments → roadmap docs

If AGENTS.md remains accurate and concise, Codex can always reason correctly about this system.
