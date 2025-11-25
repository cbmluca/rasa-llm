> [!IMPORTANT]
> **Maintenance Rule for Codex**
> Keep this document synchronized with the active codebase. Whenever behavior, architecture, or tooling changes, update the relevant sections below so Codex (and humans) can rely on AGENTS.md as the canonical description of the system.
>
> Only document durable architecture/workflows here. Ship notes or short-lived behaviors belong in changelogs or inline comments, not AGENTS.md. Treat this file as the canonical “central nervous system” reference—capture fundamentals (tiers, agents, shared helpers) and omit transient UI tweaks or sprint-specific status.

## Overview & Architecture
- Tier‑1 centers on the CLI/web orchestrator stack (`app/main.py`, `app/web_api.py`, `core/orchestrator.py`). Every turn flows through `NLUService` → `Orchestrator` → `ToolRegistry` → tool formatter, while `LearningLogger` persists turn + review data.
- Tier‑5’s FastAPI/UI surface reuses the same orchestrator wiring, exposes CRUD endpoints for queue/data stores, and records corrections under `data_pipeline/nlu_training_bucket/`.
- The legacy Rasa project lives under `legacy_rasa/` for reference only; it is not part of the runtime.

## Shared Behaviors & Guarantees
- **Parser-first workflow**: `core.command_parser` + parser modules handle deterministic intents before the router/classifier. Always extend these first when adding features.
- **Classifier + LLM fallback**: `IntentClassifier` provides TF‑IDF/LogReg predictions when rules fail; `LLMRouter` only runs when both parser and classifier abstain.
- **Keyword probes & dry-run staging**: CRUD tools run keyword probes (`core/probes/tool_probes.py`) to map fuzzy requests to list/find actions, and Tier‑1 marks CRUD executions as staged until Tier‑5 reviewers confirm them.
- **Global parsing helpers**: Danish date/time parsing, natural-language title extraction, and normalization utilities live in `core/parser_utils` and `core/text_parsing`. Use them across tools so behaviors stay consistent.
- **Shared storage helpers**: JSON-backed tools should rely on `core/json_storage` for atomic reads/writes. New stores should follow the same pattern (files under `data_pipeline/` plus a storage helper) instead of rolling ad hoc persistence.
- **Logging & observability**: Every handled message writes a `TurnRecord` + optional `ReviewItem` via `LearningLogger`, with configurable redaction/rotation.
- **Reviewer token auth**: All `/api/*` routes (except `/` and `/api/health`) require a secret `X-Reviewer-Token`. Configure it via `REVIEWER_TOKEN`, enforce it with `_require_reviewer_token`, and have the frontend persist/apply it via `buildReviewerHeaders`.
- **Voice capture & STT**: The chat console surfaces a Chrome-only MediaRecorder button; successful clips hit `/api/speech`, which transcribes via Whisper (`SPEECH_TO_TEXT_MODEL`), forwards text into the orchestrator, appends records to `data_pipeline/voice_inbox.json`, and echoes `{transcription_status, text, pending_id}`. Media failures set a `mediaError` state so the UI hides the mic and guides reviewers back to text input.
- **Frontend contract**: `web/static/index.html`, `styles.css`, and `app.js` keep panels persistent, hydrate queues/stores, and show toast notifications for async operations. The Todos and Calendar data stores now mirror the pending editor with sortable rows, inline delete buttons, and single create/update forms that switch into update mode when you click an existing row. Switching into the Todos, Calendar, or Kitchen Tips tabs from another store always drops you back into Create mode and clears the highlighted row so edits never start from a stale selection, while staying on the same tab keeps the remembered selection and prefilled edit card. Calendar create flows (Pending corrections + Data Stores) enforce “Title + either Start or End” and copy End → Start when only an end time is provided so backend constraints stay satisfied.
- **PWA shell**: `manifest.json` + `service-worker.js` let Chrome offer “Install app.” The service worker runs network-first caching for the chat bundle/manifest/icons, explicitly skips `/api/speech`, and notifies the UI when offline uploads fail so `app.js` can log them for replay.
- **Commenting standard**: Every newly added function/class/module must include concise WHAT/WHY/HOW comments matching the style used across the repo.
- **Context-first implementation**: Before adding functionality, scan related files/comments to understand existing patterns and reuse them.
- **Conservative edge-case handling**: Avoid speculative automation for risky fixes. When safer, guide operators through manual steps (e.g., deleting bad entries from `pending.jsonl`). Document such guidance in AGENTS.md or inline comments.
- **Secret hygiene**: Keep credentials (OpenAI keys, reviewer tokens) out of the repo—use `.gitignore`, `fly secrets set`, or local `.env` files so sensitive values never land in source control.

## Agent Flow
1. Capture user text (CLI or `/api/chat`) and pass it to `Orchestrator.handle_message_with_details`.
2. `NLUService` runs deterministic parsers; when they fail, it uses `IntentClassifier` if the score ≥ configured threshold.
3. If the intent confidence ≥ gate, the orchestrator dispatches directly to the mapped tool. Otherwise, LLMRouter may suggest a tool or fall back to “From ChatGPT.”
4. CRUD intents run keyword probes and execute in dry-run mode; reviewers confirm via `/api/logs/label` before stores mutate.
5. Responses are formatted per tool (weather/news natural text, CRUD payload echoes as needed) and sent back to the client.
6. `LearningLogger` records turn + review entries, and Tier‑5 surfaces them in the Self-Learning dashboard for corrections.

## Agents & Tools
| Agent / Tool | Description | Trigger |
| --- | --- | --- |
| **NLU Agent** (`core/nlu_service.py`) | Runs parser modules, normalizes entities, and hands structured payloads to the orchestrator. | All user inputs. |
| **Intent Classifier** (`core/intent_classifier.py`) | TF‑IDF + LogisticRegression pipeline loaded on demand; fills gaps when deterministic parsing fails. | Parser returned `None` and classifier ≥ threshold. |
| **Weather Tool** (`tools/weather_tool.py`) | Sanitizes city tokens, infers time hints, and fetches Open-Meteo forecasts with human-readable summaries. | `intent:weather`. |
| **News Tool** (`tools/news_tool.py`) | Normalizes topics and returns markdown-linked headlines plus raw payload metadata. | `intent:news`. |
| **Todo Tool** (`tools/todo_list_tool.py`) | JSON-backed CRUD with Danish deadline parsing, keyword probes, and natural confirmations. | `intent:todo_list`. |
| **Kitchen Tips Tool** (`tools/kitchen_tips_tool.py`) | CRUD over tips (`content/keywords/link`) with lookup-by-title fallbacks. | `intent:kitchen_tips`. |
| **Calendar Tool** (`tools/calendar_edit_tool.py`) | Handles create/list/update/delete with Danish-style timestamps, part-of-day ranges, and location hints. | `intent:calendar_edit`. |
| **Notes Tool** (`tools/app_guide_tool.py`) | Ordered personal sections with keywords/link fields; create adds notes within a section while update rewrites full sections. | `intent:app_guide`. |
| **LLM Router** (`core/llm_router.py`) | Chooses tools or generates fallback answers when deterministic paths abstain. | Invoked by orchestrator when needed. |
| **Learning Logger** (`core/learning_logger.py`) | Writes turn/review JSONL files with optional redaction and rotation. | Every handled message or review item. |

## Tier Roadmap (current)
| Tier | Goal | Highlights |
| --- | --- | --- |
| **1** | Core runtime + weather/news tools. | CLI orchestrator loop, deterministic parsing, initial formatters. |
| **2** | Logging & observability. | `LearningLogger`, config-driven redaction, rotation, and basic tests. |
| **3** | Tool expansion + editable knowledge base. | Todo/kitchen/calendar/Notes stores backed by shared JSON storage + formatters. |
| **4** | Self-learning pipeline. | Turn logging → review queue, correction endpoints, intent classifier training scripts. |
| **5** | Web UI / Admin panel. | FastAPI endpoints, chat console, self-learning editor, data-store tabs, classifier/corrected tables, import/export tooling. |
| **6** | Governance & security hardening. | Policy configs, purge/eval CLI tasks, reviewer identity logging, governance dashboard. |
| **7** | Voice / PWA experience. | `/api/speech`, installable UI shell (voice inbox UI deferred to backlog). |
| **8** | ML + LLM hybrid workflow. | Field-level confidence, schema-aware LLM payload filler, assisted-turn badges. |
| **9** | Infrastructure & always-on execution. | Containerization, health probes, lightweight schedulers/workers, ops runbook. |
| **10** | Governance + LLMOps. | Policy enforcement helpers, audit trail exports, governance tab updates. |
| **11** | Scheduler & advanced agent actions. | Background scheduler, advanced calendar behaviors, reviewer tooling for queued actions. |

Future backlog (IoT integrations, extended RAG, hardware hooks) resides in `docs/knowledge.md` until scoped.

## Integration & Governance Notes
- The Notes store starts as an ordered JSON document (Tier 3) where each section is fixed and `create` operations insert notes (top-prepended by default). It may evolve into vector-backed RAG components in later tiers.
- Notes capture personal/brainstorming context separate from AGENTS.md (which stays the canonical system design doc).
- `/api/logs/label`, `/api/logs/pending`, and `/api/logs/corrected` form the backbone of the self-learning workflow; keep their schemas stable when iterating.
- `data_pipeline/voice_inbox.json` plus `core.voice_inbox` track `{id,timestamp,audio_path,transcribed_text,status}` rows for Tier‑7’s voice inbox. Audio blobs live under `data_pipeline/voice_uploads/` (gitignored) and `/api/speech` is the sole ingestion path; the reviewer UI for browsing/re-running clips is deferred and tracked in the backlog.
- Fly.io deployment config lives in `Dockerfile` + `fly.toml`; secrets `OPENAI_API_KEY` and `REVIEWER_TOKEN` must be set before running `fly deploy`. Mobile/PWA validation steps are captured in `docs/mobile_pwa.md` (Chrome install, offline retry checks).
- Governance workflows (`config/governance.yml`, `app/governance_tasks.py`, `core/governance.py`) own purge/eval tasks and reviewer auditing.

## Development & Validation Rules
1. **End-of-Tier validation**: Finish each tier/task with focused tests or manual verification and record outcomes (e.g., reference relevant pytest modules).
2. **Start-of-Tier confirmation**: Confirm scope with the user before coding; adjust plans based on their feedback.
3. **Continuous synchronization**: Update AGENTS.md immediately when architecture or scope changes; never add features without clarifying where they fit.
4. **Commenting new code**: Add WHAT/WHY/HOW comments near every significant function/class/module to keep intent clear.
5. **Context-first implementation**: Review related modules/comments before coding to avoid duplicating logic and to plug changes into existing flows.
6. **Conservative edge-case handling**: For destructive or rare fixes, prefer guiding the user through manual steps (e.g., deleting queue entries) instead of adding fragile automation.
