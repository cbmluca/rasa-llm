import { STORAGE_KEYS, POLL_INTERVAL_MS, state } from './shared.js';

const pendingPollingDeps = {
  loadPending: () => Promise.resolve(),
  refreshActiveDataTab: () => Promise.resolve(),
  loadVoiceInbox: () => Promise.resolve(),
};

export function configurePendingPolling(deps = {}) {
  Object.assign(pendingPollingDeps, deps);
}

let pollTimer = null;

export function persistPendingState() {
  try {
    localStorage.setItem(STORAGE_KEYS.PENDING_PAGE, String(state?.pendingPage ?? 1));
  } catch (err) {
    // ignore persistence failures
  }
}

export function startPendingPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(() => {
    pendingPollingDeps.loadPending(true);
    pendingPollingDeps.refreshActiveDataTab();
    pendingPollingDeps.loadVoiceInbox({ suppressErrors: true }).catch(() => {});
  }, POLL_INTERVAL_MS);
}

export function stopPendingPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
