import { state, el } from './shared.js';
import { fetchJSON } from './api.js';
import { showToast } from './utils.js';
import { appendAssistantReply } from './chat.js';

const voiceInboxDeps = {
  loadPending: () => Promise.resolve(),
  refreshActiveDataTab: () => Promise.resolve(),
};

export function configureVoiceInbox(deps = {}) {
  Object.assign(voiceInboxDeps, deps);
}

function formatVoiceTimestamp(value) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', year: 'numeric' });
}

function formatVoiceMinutes(value) {
  const number = Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(number) || number === 0) {
    return '0';
  }
  return number.toFixed(3);
}

function renderVoiceInbox() {
  if (el.voiceMinutesTotal) {
    el.voiceMinutesTotal.textContent = formatVoiceMinutes(state.voiceInbox.voiceMinutesTotal || 0);
  }
  if (el.voiceMinutesToday) {
    el.voiceMinutesToday.textContent = formatVoiceMinutes(state.voiceInbox.voiceMinutesToday || 0);
  }
  if (el.voiceMinutesBudget) {
    el.voiceMinutesBudget.textContent = formatVoiceMinutes(state.voiceInbox.voiceMinutesBudget || 0);
  }
  if (el.voiceMinutesRemaining) {
    el.voiceMinutesRemaining.textContent = formatVoiceMinutes(state.voiceInbox.voiceMinutesRemaining || 0);
  }
  if (el.voiceMaxEntriesHint) {
    el.voiceMaxEntriesHint.textContent = `Retention max ${state.voiceInbox.maxEntries || 0} clips.`;
  }
  if (!el.voiceInboxTable) return;
  el.voiceInboxTable.innerHTML = '';
  const entries = Array.isArray(state.voiceInbox.entries) ? state.voiceInbox.entries : [];
  if (!entries.length) {
    el.voiceTableEmpty?.classList.remove('hidden');
  } else {
    el.voiceTableEmpty?.classList.add('hidden');
    entries.forEach((entry) => {
      const row = document.createElement('tr');
      const timestamp = document.createElement('td');
      timestamp.textContent = formatVoiceTimestamp(entry.timestamp);
      const status = document.createElement('td');
      status.textContent = (entry.status || 'unknown').replace(/_/g, ' ');
      const transcript = document.createElement('td');
      transcript.textContent = entry.transcribed_text || '—';
      const minutes = document.createElement('td');
      minutes.textContent = formatVoiceMinutes(entry.voice_minutes || 0);
      const actions = document.createElement('td');
      const replayBtn = document.createElement('button');
      replayBtn.type = 'button';
      replayBtn.className = 'button ghost micro';
      replayBtn.textContent = 'Replay';
      replayBtn.addEventListener('click', () => {
        if (!entry.audio_path) {
          showToast('No audio available to replay.', 'warning');
          return;
        }
        try {
          const player = new Audio(entry.audio_path);
          player.play().catch(() => {
            showToast('Unable to replay audio clip.', 'error');
          });
        } catch (err) {
          showToast(err?.message || 'Unable to replay audio clip.', 'error');
        }
      });
      const rerunBtn = document.createElement('button');
      rerunBtn.type = 'button';
      rerunBtn.className = 'button ghost micro';
      rerunBtn.textContent = 'Rerun';
      rerunBtn.addEventListener('click', () => rerunVoiceEntry(entry));
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'button ghost micro';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => deleteVoiceEntry(entry));
      actions.appendChild(replayBtn);
      actions.appendChild(rerunBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(timestamp);
      row.appendChild(status);
      row.appendChild(transcript);
      row.appendChild(minutes);
      row.appendChild(actions);
      el.voiceInboxTable.appendChild(row);
    });
  }
  if (el.voicePageLabel) {
    el.voicePageLabel.textContent = String(state.voiceInbox.page || 1);
  }
  if (el.voicePrev) {
    el.voicePrev.disabled = state.voiceInbox.page <= 1;
  }
  if (el.voiceNext) {
    el.voiceNext.disabled = !state.voiceInbox.hasMore;
  }
}

function recordVoiceResponse(payload, entry) {
  if (payload?.chat) {
    appendAssistantReply(payload.chat);
  }
  if (payload?.voice_entry && payload.voice_entry.id === entry.id) {
    state.voiceInbox.entries = state.voiceInbox.entries.map((candidate) =>
      candidate.id === entry.id ? payload.voice_entry : candidate,
    );
  }
}

async function rerunVoiceEntry(entry) {
  if (!entry?.id) return;
  try {
    const payload = await fetchJSON('/api/voice_inbox/rerun', {
      method: 'POST',
      body: JSON.stringify({ entry_id: entry.id }),
    });
    recordVoiceResponse(payload, entry);
    showToast('Voice entry rerun submitted', 'success');
    await Promise.all([voiceInboxDeps.loadPending(true), voiceInboxDeps.refreshActiveDataTab()]);
    await loadVoiceInbox({ page: state.voiceInbox.page });
  } catch (err) {
    showToast(err?.message || 'Failed to rerun voice entry', 'error');
  }
}

async function deleteVoiceEntry(entry) {
  if (!entry?.id) return;
  try {
    await fetchJSON('/api/voice_inbox/delete', {
      method: 'POST',
      body: JSON.stringify({ entry_id: entry.id }),
    });
    showToast('Voice entry deleted', 'success');
    await loadVoiceInbox({ page: state.voiceInbox.page });
  } catch (err) {
    showToast(err?.message || 'Failed to delete voice entry', 'error');
  }
}

export async function loadVoiceInbox(options = {}) {
  const { page = state.voiceInbox.page, limit = state.voiceInbox.limit, resetPage = false, suppressErrors = false } = options;
  const targetPage = resetPage ? 1 : Math.max(1, page || 1);
  const params = new URLSearchParams({
    limit: Math.max(1, limit || state.voiceInbox.limit || 25),
    page: targetPage,
  });
  try {
    const payload = await fetchJSON(`/api/voice_inbox?${params.toString()}`);
    if (!payload) {
      return;
    }
    state.voiceInbox.entries = payload.items || [];
    state.voiceInbox.page = payload.page || targetPage;
    state.voiceInbox.limit = payload.limit || limit || state.voiceInbox.limit;
    state.voiceInbox.hasMore = Boolean(payload.has_more);
    state.voiceInbox.totalEntries = payload.total_entries || state.voiceInbox.totalEntries;
    state.voiceInbox.voiceMinutesTotal = payload.voice_minutes_total ?? 0;
    state.voiceInbox.voiceMinutesToday = payload.voice_minutes_today ?? 0;
    state.voiceInbox.voiceMinutesBudget = payload.voice_minutes_budget ?? 0;
    state.voiceInbox.voiceMinutesRemaining = payload.voice_minutes_remaining ?? 0;
    state.voiceInbox.maxEntries = payload.max_entries || state.voiceInbox.maxEntries;
    renderVoiceInbox();
  } catch (err) {
    if (!suppressErrors) {
      showToast(err?.message || 'Failed to load voice inbox', 'error');
    }
  }
}

export function changeVoiceInboxPage(delta) {
  if (delta > 0 && !state.voiceInbox.hasMore) return;
  const nextPage = Math.max(1, state.voiceInbox.page + delta);
  if (delta < 0 && nextPage === state.voiceInbox.page) return;
  loadVoiceInbox({ page: nextPage });
}
