import { state, el, STORAGE_KEYS } from './shared.js';
import { fetchJSON } from './api.js';
import { setChatStatus, showToast } from './utils.js';

const dependencies = {
  loadPending: null,
  refreshActiveDataTab: null,
  updateRelatedPromptOptions: null,
  onAddPendingRecord: null,
};

export function configureChat(config = {}) {
  Object.assign(dependencies, config);
}

// WHAT: render the chat transcript in the left-hand panel.
// WHY: reviewers monitor real-time interactions and need links to pending items.
// HOW: iterates `state.chat`, renders bubbles plus tool metadata, and keeps the log scrolled so reviewers can jump from the transcript to pending cards.
export function renderChat() {
  if (!el.chatLog) return;
  el.chatLog.innerHTML = '';
  state.chat.forEach((entry) => {
    const wrapper = document.createElement('div');
    wrapper.className = `chat-message ${entry.role}`;
    const text = document.createElement('p');
    text.textContent = entry.text;
    wrapper.appendChild(text);
    if (entry.meta) {
      const meta = document.createElement('div');
      meta.className = 'chat-meta';
      const extras = entry.meta.extras || {};
      const toolName = extras.resolved_tool || entry.meta.tool?.name;
      const toolAction =
        entry.meta.tool?.payload?.action ||
        (toolName ? extras[`${toolName}_action`] : undefined) ||
        entry.meta.tool?.result?.action;
      meta.textContent = [
        entry.meta.intent ? `intent=${entry.meta.intent}` : null,
        toolName ? `tool=${toolName}` : null,
        toolAction ? `action=${toolAction}` : null,
        entry.meta.latency_ms ? `${entry.meta.latency_ms} ms` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      wrapper.appendChild(meta);
    }
    if (entry.offline) {
      const offlineMeta = document.createElement('div');
      offlineMeta.className = 'chat-meta offline';
      const queuedAtDate = entry.queuedAt ? new Date(entry.queuedAt) : null;
      const queuedAt =
        queuedAtDate && !Number.isNaN(queuedAtDate.getTime())
          ? queuedAtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : null;
      offlineMeta.textContent = queuedAt ? `Queued offline · ${queuedAt}` : 'Queued offline';
      wrapper.appendChild(offlineMeta);
    }
    el.chatLog.appendChild(wrapper);
  });
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

// WHAT: read cached chat history from localStorage.
// WHY: preserves the mini transcript across reloads when reviewers refresh the page.
// HOW: read the persisted JSON array, keep only the latest 10, and stuff it back into `state.chat` so renderChat can pick up where the reviewer left off.
export function loadStoredChatHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      state.chat = parsed.slice(-10);
    }
  } catch (err) {
    // ignore
  }
}

// WHAT: write the most recent chat entries to localStorage.
// WHY: lets the chat log survive page reloads between sessions.
// HOW: whenever the chat log updates we trim it to 10 entries and write it to localStorage, keeping reloads cheap.
export function persistChatHistory() {
  try {
    const trimmed = state.chat.slice(-10);
    state.chat = trimmed;
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(trimmed));
  } catch (err) {
    // ignore
  }
}

// WHAT: hydrate the offline chat queue from storage during bootstrap.
// WHY: queued prompts should survive reloads so reviewers can resend them once connectivity returns.
// HOW: read the serialized array, fall back to [], and store it on `state.offlineChatQueue`.
export function loadOfflineChatQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHAT_OFFLINE_QUEUE);
    if (!raw) {
      state.offlineChatQueue = [];
      return;
    }
    const parsed = JSON.parse(raw);
    state.offlineChatQueue = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    state.offlineChatQueue = [];
  }
}

// WHAT: persist the pending offline prompts so refreshes keep the queue intact.
// WHY: reviewers may go offline for extended periods; cached prompts guarantee the retry button works after reloads.
// HOW: stringify `state.offlineChatQueue` and write it to localStorage, swallowing quota errors.
export function persistOfflineChatQueue() {
  try {
    localStorage.setItem(STORAGE_KEYS.CHAT_OFFLINE_QUEUE, JSON.stringify(state.offlineChatQueue || []));
  } catch (err) {
    // ignore
  }
}

// WHAT: show/hide the offline queue banner + button.
// WHY: reviewers need an at-a-glance indicator when prompts are waiting to resend.
// HOW: toggle `.hidden`, update the count, and disable the retry button while resends are running.
export function renderOfflineQueueBanner() {
  if (!el.offlineQueue) return;
  const count = state.offlineChatQueue.length;
  el.offlineQueue.classList.toggle('hidden', count === 0);
  if (el.offlineQueueCount) {
    el.offlineQueueCount.textContent = String(count);
  }
  if (el.offlineQueueRetryBtn) {
    el.offlineQueueRetryBtn.disabled = state.offlineReplayActive || count === 0;
    el.offlineQueueRetryBtn.textContent = state.offlineReplayActive ? 'Retrying…' : 'Retry offline prompts';
  }
}

// WHAT: append a chat message to the offline queue when `/api/chat` is unavailable.
// WHY: keeps reviewer prompts from disappearing when airplane mode drops the network mid-flight.
// HOW: register a lightweight queue record, annotate the chat entry so the transcript shows “Queued offline,” persist both, and update the banner.
export function queueOfflineChatMessage(message, entry) {
  if (!message) return;
  if (entry?.queueId && state.offlineChatQueue.some((item) => item.id === entry.queueId)) {
    entry.offline = true;
    renderChat();
    renderOfflineQueueBanner();
    return;
  }
  const record = {
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: message,
    createdAt: new Date().toISOString(),
    retries: 0,
  };
  state.offlineChatQueue.push(record);
  if (entry) {
    entry.offline = true;
    entry.queueId = record.id;
    entry.queuedAt = record.createdAt;
    persistChatHistory();
    renderChat();
  }
  persistOfflineChatQueue();
  renderOfflineQueueBanner();
  showToast('Offline: prompt queued for resend.', 'warning');
}

// WHAT: delete a record from the offline queue and persist the change.
// WHY: once prompts succeed we need to clear them so the banner + retries don’t duplicate messages.
// HOW: splice the matching record, update storage, and refresh the banner.
export function removeOfflineChatRecord(queueId) {
  if (!queueId) return;
  const next = state.offlineChatQueue.filter((item) => item.id !== queueId);
  if (next.length === state.offlineChatQueue.length) {
    return;
  }
  state.offlineChatQueue = next;
  persistOfflineChatQueue();
  renderOfflineQueueBanner();
}

// WHAT: clear offline markers from a chat entry after it successfully replays.
// WHY: once the backend acknowledges the prompt we should remove the “queued” badge from the transcript.
// HOW: locate the entry with `queueId`, delete helper fields, and persist the history snapshot.
export function markChatEntryDelivered(queueId) {
  if (!queueId) return;
  let changed = false;
  state.chat.forEach((entry) => {
    if (entry.queueId === queueId) {
      entry.offline = false;
      delete entry.queueId;
      delete entry.queuedAt;
      changed = true;
    }
  });
  if (changed) {
    persistChatHistory();
    renderChat();
  }
}

// WHAT: detect when fetch failures are caused by missing connectivity.
// WHY: we only queue prompts on network errors; server-side failures should bubble to reviewers immediately.
// HOW: check `navigator.onLine` plus common network error substrings before classifying the exception as “offline.”
export function isOfflineError(error) {
  if (navigator?.onLine === false) {
    return true;
  }
  const message = (error?.message || '').toLowerCase();
  return ['failed to fetch', 'networkerror', 'offline', 'network request failed'].some((needle) =>
    message.includes(needle),
  );
}

// WHAT: append assistant replies to the chat log.
// WHY: keeps the transcript in sync whenever batch operations (voice, API responses) generate replies.
// HOW: insert the assistant entry, persist the history, and honor `pending_chat_entry` metadata so the offline queue reflects delivery status.
export function appendAssistantReply(reply) {
  if (!reply) return;
  state.chat.push({ role: 'assistant', text: reply.reply, meta: reply });
  persistChatHistory();
  renderChat();
  if (state.pendingChatEntry) {
    const entryId = reply.pending_record?.conversation_entry_id || reply.extras?.conversation_entry_id;
    if (entryId) {
      state.pendingChatEntry.entryId = entryId;
    }
    if (reply.pending_record?.prompt_id) {
      state.pendingChatEntry.promptId = reply.pending_record.prompt_id;
    }
    state.pendingChatEntry = null;
  }
  if (reply.pending_record) {
    dependencies.onAddPendingRecord?.(reply.pending_record);
  }
}

// WHAT: resend queued chat prompts manually or when the browser regains connectivity.
// WHY: reviewers need a one-click “Retry offline prompts” flow instead of copy/pasting text after outages.
// HOW: run the queue sequentially, piping each message back through `/api/chat`, clearing entries as they succeed, and halting/resurfacing errors if we go offline again.
export async function retryOfflineChatQueue(options = {}) {
  const { silent = false } = options;
  if (!state.offlineChatQueue.length) {
    if (!silent) {
      showToast('No offline prompts to resend.', 'info');
    }
    return;
  }
  if (navigator?.onLine === false) {
    if (!silent) {
      showToast('Still offline — prompts remain queued.', 'warning');
    }
    return;
  }
  state.offlineReplayActive = true;
  renderOfflineQueueBanner();
  setChatStatus('Retrying offline prompts…');
  for (const record of [...state.offlineChatQueue]) {
    const success = await replayOfflineChatRecord(record, { silent });
    if (!success) {
      break;
    }
  }
  state.offlineReplayActive = false;
  renderOfflineQueueBanner();
  setChatStatus('Ready');
}

// WHAT: attempt to replay a single queued prompt.
// WHY: reuses the same code path for batch retries and future per-message buttons.
// HOW: set the pending entry (if it still exists), post to `/api/chat`, clear it from the queue, and bubble toast errors when needed.
export async function replayOfflineChatRecord(record, options = {}) {
  if (!record) return false;
  const { silent = false } = options;
  const chatEntry = state.chat.find((entry) => entry.queueId === record.id);
  state.pendingChatEntry = chatEntry || null;
  try {
    const reply = await fetchJSON('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: record.text }),
    });
    removeOfflineChatRecord(record.id);
    markChatEntryDelivered(record.id);
    appendAssistantReply(reply);
    if (state.selectedPrompt) {
      dependencies.updateRelatedPromptOptions?.();
    }
    await Promise.all([
      dependencies.loadPending ? dependencies.loadPending(true) : Promise.resolve(),
      dependencies.refreshActiveDataTab ? dependencies.refreshActiveDataTab() : Promise.resolve(),
    ]);
    return true;
  } catch (err) {
    if (!navigator?.onLine) {
      if (!silent) {
        showToast('Went offline mid-retry. Prompts stay queued.', 'warning');
      }
      return false;
    }
    const message = err?.message || 'Failed to resend prompt.';
    if (!silent) {
      showToast(message, 'error');
    }
    return false;
  } finally {
    state.pendingChatEntry = null;
  }
}
