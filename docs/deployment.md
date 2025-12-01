# Tier 7 Deployment (Fly.io)
## Configuration
1. Update `fly.toml` `app` value to your Fly application name.
2. Set required secrets:
   ```bash
   fly secrets set OPENAI_API_KEY="<key>" REVIEWER_TOKEN="<secret>" DEFAULT_REVIEWER_ID="<initial reviewer>"
   ```
3. Optional tweaks via secrets/env vars:
   - `SPEECH_TO_TEXT_MODEL` (defaults to `gpt-4o-mini-transcribe`).
   - `WEB_UI_PORT` if you change the container port.
   - `VOICE_INBOX_MAX_ENTRIES` to cap how many stored voice clips stay in `data_pipeline/voice_inbox.json` (default `500`).
   - `VOICE_DAILY_MINUTES` to limit the Whisper billing budget per day (default `60` minutes).

## Deploy
```bash
fly deploy
```
This builds the Docker image (using `Dockerfile` + `requirements.txt`) and runs `python -m app.web_api`. HTTP traffic is routed to port 8080 which matches `WEB_UI_PORT`.

## Post-deploy Checks
1. Visit the Fly URL (HTTPS) in Chrome desktop.
2. Set reviewer ID + token via the header buttons (token stored in `localStorage`).
3. Trigger a text chat to ensure `/api/chat` succeeds.
4. Record a short voice clip; confirm `/api/speech` returns a transcript and `data_pipeline/voice_inbox.json` logs the entry.
5. Open the browser menu → “Install Taskmaster” to verify the PWA manifest/service worker work on the hosted origin.

## Notes
- Service worker intentionally avoids caching `/api/speech` uploads; offline attempts are logged in `localStorage` for later replay.
- Reviewer token is required for every `/api/*` route except `/api/health` and `/`.
- Voice uploads are stored on-disk under `/app/data_pipeline/voice_uploads/` per instance; add a retention job later if storage becomes tight.
- `/api/voice_inbox` now surfaces stored clips with replay/rerun/delete actions, and `/api/stats` reports `voice_stats` so you can watch minute budgets each day.
