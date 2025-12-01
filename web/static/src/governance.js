import { el, state, STORAGE_KEYS, PURGE_MAX_AGE_DAYS, TRAINING_ALERT_INCREMENT } from './shared.js';
import { formatTimestamp } from './utils.js';

export function renderGovernanceStats() {
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
}

export function updateNotifications() {
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
  const correctedCount = stats.corrected_count || 0;
  const lastTrainingCount =
    Number(localStorage.getItem(STORAGE_KEYS.LAST_TRAINING_ALERT_COUNT)) || 0;
  if (correctedCount - lastTrainingCount >= TRAINING_ALERT_INCREMENT) {
    notifications.push({
      reason: `Another ${TRAINING_ALERT_INCREMENT} labeled prompts were added.`,
      command:
        'python -m app.train_intent_classifier --labeled-path data_pipeline/nlu_training_bucket/labeled_prompts.jsonl --model-path models/intent_classifier.pkl --report-path reports/intent_classifier.json',
      key: 'training',
    });
    localStorage.setItem(STORAGE_KEYS.LAST_TRAINING_ALERT_COUNT, String(correctedCount));
  }
  state.notifications = notifications;
  renderNotifications();
}

function renderNotifications() {
  if (!el.notificationsList) return;
  el.notificationsList.innerHTML = '';
  if (!state.notifications.length) {
    const empty = document.createElement('li');
    empty.className = 'notification-empty';
    empty.textContent = 'No pending CLI actions.';
    el.notificationsList.appendChild(empty);
    return;
  }
  state.notifications.forEach((notification) => {
    const item = document.createElement('li');
    item.className = 'notification-item';
    const reason = document.createElement('p');
    reason.className = 'notification-reason';
    reason.textContent = notification.reason;
    const command = document.createElement('p');
    command.className = 'notification-command';
    command.textContent = notification.command;
    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'button ghost';
    dismissButton.textContent = 'Dismiss';
    dismissButton.addEventListener('click', () => dismissNotification(notification.key));
    item.appendChild(reason);
    item.appendChild(command);
    item.appendChild(dismissButton);
    el.notificationsList.appendChild(item);
  });
}

function dismissNotification(key) {
  state.notifications = state.notifications.filter((entry) => entry.key !== key);
  renderNotifications();
}
