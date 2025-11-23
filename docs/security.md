# Security & Governance Notes

## Reviewer Identity & Auth Stub
- Every Tier‑5 API call now expects an `X-Reviewer-ID` header (2‑32 characters, alphanumeric plus `. _ -`). The web dashboard prompts for initials on first load and caches them in `localStorage`, but CLI/automation should set the header explicitly.
- When the header is missing the backend falls back to the configured default reviewer (`DEFAULT_REVIEWER_ID` in `app/config.py`) and logs a warning. Always provide a real ID before seeding the queue so pending rows and corrections retain accurate lineage.
- `/api/chat` and `/api/logs/label` echo the resolved reviewer id in their `extras` payloads; pending JSONL and corrected prompts store the same value for downstream audits.

## Governance Policy Source of Truth
- Policy definitions live in `config/governance.yml`. Each revision declares:
  - `policy_version` (referenced in logs/stats),
  - `allowed_models` / `allowed_tools`,
  - `retention_max_entries` (per-bucket max records for turn logs, pending queue, corrected prompts, and tool stores),
  - reviewer roles and PII regex replacements.
- The CLI and web API load this file at startup via `core.governance.GovernancePolicy`. Updating the YAML file instantly changes enforcement (no code edits required) but make sure reviewers know when policy versions change.

## Purge Workflow
- Count-based retention is enforced by `python -m app.governance_tasks purge --config config/governance.yml`.
  - Add `--dry-run` to preview how many rows would be removed.
  - Use `--log-path` (defaults to `reports/purge.log`) to append summaries suitable for cron/GitHub Actions logs.
  - Each run writes `reports/purge_state.json` (timestamp + dry-run flag); `/api/stats` surfaces this as “Last Purge” in the Governance dashboard.
- The CLI truncates JSONL/log stores to the most recent `retention_max_entries[bucket]` rows. Keep counts conservative (e.g., 200 entries) until traffic grows enough to justify date-based pruning.

## Evaluation & Gating
- `python -m app.eval_suite --governance-config config/governance.yml` embeds policy metadata into `reports/eval_results.json` so the Governance tab can display accuracy next to the active policy version.
- Always run the eval suite (with `--include-synthetic` when helpful) before changing policy gates or enabling new tools so the dashboard reflects up-to-date intent/action accuracy.
- When policy violations appear in `/api/stats`, triage the samples surfaced in the Governance tab and consider adding those prompts to `config/eval_prompts.yml` to prevent regressions.

## Operational Tips
- Automate the purge CLI via cron or a GitHub Action: run with `--dry-run` daily plus a full purge weekly, monitoring `reports/purge.log` for anomalies.
- Keep `logs/turns.jsonl` under version control ignores; the policy ensures sensitive payloads are PII-scrubbed before truncation.
- Document any temporary policy overrides (e.g., enabling extra tools during experiments) in `docs/knowledge.md` so reviewers know why the Governance tab might look different.
