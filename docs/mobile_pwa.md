# Tier 7 Mobile / PWA Checklist

1. **Open the production URL (`https://<app>.fly.dev`) in Chrome on desktop and phone.**
   - Desktop: set reviewer ID + token once; verify `/api/chat` + `/api/speech` work.
   - Phone: paste the same token via the header button before attempting voice uploads.
2. **Install the PWA.**
   - Chrome desktop: ⋮ → Install Taskmaster.
   - Chrome on iOS (WebKit): use Safari-style “Add to Home Screen” menu; Chrome mirrors it.
3. **Validate mic flow on phone.**
   - Tap the Voice button, record a 5–15s clip, ensure the status badge shows “Transcribing…”, and watch the chat log populate with the transcript + reply.
   - Toggle airplane mode to confirm the service worker logs offline uploads (toast appears) and the clip is retried later.
4. **Reopen the installed app.**
   - Launch from the home screen icon; confirm it stays in standalone mode and `localStorage` preserved the reviewer token/ID.
5. **Optional sanity checks.**
   - Clear site data → reload → ensure the token warning appears until you set it again.
   - Try text chat + voice chat sequentially to confirm `buildReviewerHeaders` keeps both headers on every request.

Use this checklist every time you redeploy or change voice/PWA code so the phone workflow stays regressions-free.