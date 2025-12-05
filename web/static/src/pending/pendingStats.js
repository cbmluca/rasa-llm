import { state, el, STORAGE_KEYS } from '../helpers/shared.js';
import { fetchJSON } from '../helpers/api.js';
import { orderPayloadForDisplay, showToast } from '../utils.js';
import { normalizePendingRecord, sortPendingByRecency } from './pendingUtils.js';
import { renderPendingList, renderPendingMeta } from './pendingRender.js';
import { renderGovernanceStats, updateNotifications } from '../governance.js';

function renderClassifier() {
  if (!el.classifierTable) return;
  el.classifierTable.innerHTML = '';
  state.classifier.forEach((item) => {
    const row = document.createElement('tr');
    const textCell = document.createElement('td');
    textCell.textContent = item.user_text || '—';
    const clfCell = document.createElement('td');
    clfCell.textContent = `${item.classifier_intent || 'unknown'} (${item.classifier_confidence ?? '?'})`;
    const reviewerCell = document.createElement('td');
    reviewerCell.textContent = item.reviewer_intent || '—';
    const statusCell = document.createElement('td');
    statusCell.textContent = item.tool_success ? 'ok' : 'issue';
    if (item.reviewer_intent && item.reviewer_intent !== item.classifier_intent) {
      row.style.background = 'rgba(248, 113, 113, 0.1)';
    }
    row.appendChild(textCell);
    row.appendChild(clfCell);
    row.appendChild(reviewerCell);
    row.appendChild(statusCell);
    el.classifierTable.appendChild(row);
  });
}

function renderPayloadPreview(payload, listSelector) {
  const list = document.querySelector(listSelector);
  if (!list) return payload;
  const copy = JSON.parse(JSON.stringify(payload || {}));
  copy.related_prompts = Array.isArray(copy.related_prompts)
    ? copy.related_prompts.map((prompt) => ({ text: prompt, id: crypto.randomUUID() }))
    : [];
  return copy;
}

function renderCorrectedTable() {
  if (!el.correctedTable) return;
  el.correctedTable.innerHTML = '';
  state.corrected.forEach((record) => {
    const row = document.createElement('tr');
    const promptCell = document.createElement('td');
    promptCell.textContent = record.prompt_text || '—';
    const predictedCell = document.createElement('td');
    const predictedPre = document.createElement('pre');
    predictedPre.textContent = JSON.stringify(orderPayloadForDisplay(record.predicted_payload || {}), null, 2);
    predictedCell.appendChild(predictedPre);
    const correctedCell = document.createElement('td');
    const correctedPre = document.createElement('pre');
    correctedPre.textContent = JSON.stringify(orderPayloadForDisplay(record.corrected_payload || {}), null, 2);
    correctedCell.appendChild(correctedPre);
    const actionsCell = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'button ghost';
    deleteBtn.textContent = 'x';
    deleteBtn.setAttribute('aria-label', 'Delete');
    deleteBtn.addEventListener('click', async () => {
      if (!record.id && !record.correction_id) {
        return;
      }
      const targetId = record.id || record.correction_id;
      try {
        await fetchJSON(`/api/logs/corrected/${encodeURIComponent(targetId)}`, {
          method: 'DELETE',
        });
        state.corrected = state.corrected.filter((item) => item !== record);
        renderCorrectedTable();
      } catch (err) {
        showToast(err.message || 'Failed to delete labeled prompt', 'error');
      }
    });
    actionsCell.appendChild(deleteBtn);
    row.appendChild(promptCell);
    row.appendChild(predictedCell);
    row.appendChild(correctedCell);
    row.appendChild(actionsCell);
    el.correctedTable.appendChild(row);
  });
}

function renderVersionHistory() {
  if (!el.versionHistory) return;
  el.versionHistory.innerHTML = '';
  if (!state.selectedPrompt) {
    const placeholder = document.createElement('p');
    placeholder.className = 'hint';
    placeholder.textContent = 'Version history will appear once you select a prompt.';
    el.versionHistory.appendChild(placeholder);
    return;
  }
  const history = state.corrected
    .filter((record) => record.id === state.selectedPrompt?.prompt_id)
    .sort((a, b) => (a.version || 0) - (b.version || 0));
  if (!history.length) {
    return;
  }
  const list = document.createElement('ul');
  history.forEach((record) => {
    const item = document.createElement('li');
    item.textContent = `Version ${record.version} • ${new Date(record.timestamp).toLocaleString()}`;
    list.appendChild(item);
  });
  el.versionHistory.appendChild(list);
}

function renderLatestConfirmed() {
  if (!state.latestConfirmed) {
    if (el.latestConfirmedTitle) {
      el.latestConfirmedTitle.textContent = 'No corrections yet.';
    }
    if (el.latestConfirmedMeta) {
      el.latestConfirmedMeta.textContent = 'Saved records will appear here.';
    }
    if (el.latestConfirmedPayload) {
      el.latestConfirmedPayload.innerHTML = '';
    }
    return;
  }
  const record = state.latestConfirmed;
  if (el.latestConfirmedTitle) {
    el.latestConfirmedTitle.textContent = record.prompt_text || 'Triggered prompt';
  }
  if (el.latestConfirmedMeta) {
    const reviewerText = record.reviewer_id ? `Reviewer ${record.reviewer_id} • ` : '';
    el.latestConfirmedMeta.textContent = `${reviewerText}${record.reviewer_intent} v${record.version}`;
  }
  if (el.latestConfirmedPayload) {
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(record.corrected_payload, null, 2);
    el.latestConfirmedPayload.innerHTML = '';
    el.latestConfirmedPayload.appendChild(pre);
  }
}

export function persistLatestConfirmed() {
  try {
    if (!state.latestConfirmed) {
      localStorage.removeItem(STORAGE_KEYS.LATEST_CONFIRMED);
      return;
    }
    localStorage.setItem(STORAGE_KEYS.LATEST_CONFIRMED, JSON.stringify(state.latestConfirmed));
  } catch (err) {
    // ignore
  }
}

export function loadStoredLatestConfirmed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LATEST_CONFIRMED);
    if (!raw) return;
    state.latestConfirmed = JSON.parse(raw);
  } catch (err) {
    // ignore
  }
}

export function loadStoredSelection() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SELECTED_PROMPT);
    if (stored) {
      state.selectedPromptId = stored;
    }
  } catch (err) {
    // ignore
  }
}

function renderStats() {
  if (el.statsPending) {
    el.statsPending.textContent = state.stats.pending?.total ?? 0;
  }
  if (el.statsPendingBreakdown) {
    const intents = state.stats.pending?.by_intent || {};
    const summary = Object.entries(intents)
      .map(([intent, count]) => `${intent}:${count}`)
      .join(', ');
    el.statsPendingBreakdown.textContent = summary || '—';
  }
  if (el.statsLabeled) {
    el.statsLabeled.textContent = state.stats.labeled_count ?? 0;
  }
  if (el.statsClassifier) {
    el.statsClassifier.textContent = state.classifier.length ?? 0;
  }
  renderPendingMeta();
  renderGovernanceStats();
  updateNotifications();
}

async function loadClassifier() {
  const data = await fetchJSON('/api/logs/classifier');
  state.classifier = data.items || [];
  renderClassifier();
  renderStats();
}

async function loadCorrected() {
  const data = await fetchJSON('/api/logs/corrected?limit=100');
  state.corrected = data.items || [];
  renderCorrectedTable();
  renderVersionHistory();
  renderPendingList();
}

async function loadStats() {
  const data = await fetchJSON('/api/stats');
  state.stats = data || {};
  renderStats();
  if ((!state.pending || state.pending.length === 0) && Array.isArray(data.pending_sample) && data.pending_sample.length) {
    state.pending = sortPendingByRecency(data.pending_sample.map((record) => normalizePendingRecord(record)));
    renderPendingList();
  }
}

export {
  renderClassifier,
  renderCorrectedTable,
  renderVersionHistory,
  renderLatestConfirmed,
  renderStats,
  loadClassifier,
  loadCorrected,
  loadStats,
};
