import { state, el, STORAGE_KEYS, PURGE_MAX_AGE_DAYS } from './shared.js';
import { fetchJSON } from './api.js';
import { formatTimestamp, orderPayloadForDisplay, showToast } from './utils.js';
import { normalizePendingRecord, sortPendingByRecency } from './pendingUtils.js';
import { renderPendingList, renderPendingMeta } from './pendingRender.js';

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

function renderGovernanceStats() {
  const stats = state.stats || {};
  if (el.governancePolicyVersion) {
    el.governancePolicyVersion.textContent = stats.policy_version || '—';
  }
  if (el.governanceAllowedTools) {
    const tools = Array.isArray(stats.allowed_tools) ? stats.allowed_tools : [];
    el.governanceAllowedTools.textContent = tools.length ? tools.join(', ') : '—';
  }
  if (el.governanceAllowedModels) {
    const models = Array.isArray(stats.allowed_models) ? stats.allowed_models : [];
    el.governanceAllowedModels.textContent = models.length ? models.join(', ') : '—';
  }
  if (el.governanceLastPurge) {
    const formatted = formatTimestamp(stats.last_purge_timestamp) || 'Never';
    el.governanceLastPurge.textContent = formatted;
  }
  if (el.governanceAvgLatency) {
    const latency =
      typeof stats.avg_latency_ms === 'number' ? `${stats.avg_latency_ms.toFixed(1)} ms` : '—';
    el.governanceAvgLatency.textContent = latency;
  }
  if (el.governanceViolationCount) {
    const count = stats.policy_violation_count || 0;
    el.governanceViolationCount.textContent = count;
    el.governanceViolationCount.classList.toggle('warning', count > 0);
  }
  if (el.governanceViolationList) {
    el.governanceViolationList.innerHTML = '';
    const violations = Array.isArray(stats.policy_violation_samples)
      ? stats.policy_violation_samples
      : [];
    if (!violations.length) {
      const li = document.createElement('li');
      li.textContent = 'No recent policy violations.';
      el.governanceViolationList.appendChild(li);
    } else {
      violations.forEach((entry) => {
        const li = document.createElement('li');
        const timestamp = formatTimestamp(entry.timestamp) || 'Unknown time';
        const reason = entry.reason || 'policy_violation';
        const tool = entry.tool || 'unknown tool';
        li.textContent = `${timestamp} • ${tool} • ${reason}`;
        el.governanceViolationList.appendChild(li);
      });
    }
  }
  if (el.retentionTableBody) {
    el.retentionTableBody.innerHTML = '';
    const retention = stats.retention_limits || {};
    const entries = Object.entries(retention);
    if (!entries.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 2;
      cell.textContent = 'No retention rules configured.';
      row.appendChild(cell);
      el.retentionTableBody.appendChild(row);
    } else {
      entries.forEach(([bucket, value]) => {
        const row = document.createElement('tr');
        const bucketCell = document.createElement('td');
        bucketCell.textContent = bucket;
        const valueCell = document.createElement('td');
        valueCell.textContent = value;
        row.appendChild(bucketCell);
        row.appendChild(valueCell);
        el.retentionTableBody.appendChild(row);
      });
    }
  }
  if (el.governanceIntentCounts) {
    el.governanceIntentCounts.innerHTML = '';
    const counts = stats.daily_intent_counts || {};
    const entries = Object.entries(counts);
    if (!entries.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 2;
      cell.textContent = 'No recent activity.';
      row.appendChild(cell);
      el.governanceIntentCounts.appendChild(row);
    } else {
      entries.forEach(([date, intents]) => {
        const row = document.createElement('tr');
        const dateCell = document.createElement('td');
        dateCell.textContent = date;
        const detailCell = document.createElement('td');
        const summary = Object.entries(intents)
          .map(([intent, count]) => `${intent}:${count}`)
          .join(', ');
        detailCell.textContent = summary || '–';
        row.appendChild(dateCell);
        row.appendChild(detailCell);
        el.governanceIntentCounts.appendChild(row);
      });
    }
  }
  const evalResults = stats.eval_results || {};
  if (el.governanceEvalIntent) {
    const pct =
      typeof evalResults.intent_accuracy === 'number'
        ? `${(evalResults.intent_accuracy * 100).toFixed(1)}%`
        : '—';
    el.governanceEvalIntent.textContent = `Intent: ${pct}`;
  }
  if (el.governanceEvalAction) {
    const pct =
      typeof evalResults.action_accuracy === 'number'
        ? `${(evalResults.action_accuracy * 100).toFixed(1)}%`
        : '—';
    el.governanceEvalAction.textContent = `Action: ${pct}`;
  }
}

function updateNotifications() {
  const notifications = [];
  const stats = state.stats || {};
  const purgeTimestamp = stats.last_purge_timestamp ? Date.parse(stats.last_purge_timestamp) : null;
  const purgeThresholdMs = PURGE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  let purgeSignature = purgeTimestamp || 0;
  if (!purgeTimestamp || Date.now() - purgeTimestamp > purgeThresholdMs) {
    const lastSignature = Number(localStorage.getItem(STORAGE_KEYS.LAST_PURGE_ALERT_SIGNATURE)) || 0;
    if (purgeSignature !== lastSignature) {
      notifications.push({
        reason: purgeTimestamp
          ? `Last governance purge was more than ${PURGE_MAX_AGE_DAYS} days ago.`
          : 'Governance purge has never been recorded.',
        command: 'python -m app.governance_tasks purge --config config/governance.yml',
        key: 'purge',
      });
      localStorage.setItem(STORAGE_KEYS.LAST_PURGE_ALERT_SIGNATURE, String(purgeSignature));
    }
  }
  const pending = state.pending || [];
  const pendingSample = (stats.pending_sample || []).map((record) => (record.prompt_id ? record.prompt_id : null));
  const unseenPendingWarning = pendingSample.length && pendingSample.every((id) => !pending.find((item) => item.prompt_id === id));
  if (unseenPendingWarning && !localStorage.getItem(STORAGE_KEYS.PENDING_WARNING_DISMISSED)) {
    notifications.push({
      reason: 'New pending entries exist beyond the current view. Refresh to sync.',
      command: 'Refresh queue',
      key: 'pending-warning',
    });
  }
  if (notifications.length) {
    const container = el.notificationList;
    if (container) {
      container.innerHTML = '';
      notifications.forEach((notification) => {
        const item = document.createElement('li');
        const text = document.createElement('span');
        text.textContent = notification.reason;
        item.appendChild(text);
        if (notification.command) {
          const command = document.createElement('code');
          command.textContent = notification.command;
          item.appendChild(command);
        }
        container.appendChild(item);
      });
    }
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
