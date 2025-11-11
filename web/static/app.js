const POLL_INTERVAL_MS = 15000;
const DEFAULT_INTENT_ACTIONS = {
  todo_list: ['list', 'create', 'update', 'delete'],
  kitchen_tips: ['list', 'search', 'get', 'create'],
  calendar_edit: ['list', 'create', 'update', 'delete'],
  app_guide: ['list', 'get', 'upsert', 'delete'],
};

const FIELD_ORDER = [
  'title',
  'section_id',
  'content',
  'notes',
  'status',
  'priority',
  'deadline',
  'start',
  'end',
  'location',
  'notes_append',
  'link',
  'tags',
  'target_title',
  'new_title',
];

const FIELD_LIBRARY = {
  title: { label: 'Title' },
  section_id: { label: 'Section ID' },
  content: { label: 'Content', type: 'textarea', placeholder: 'Details or body text' },
  notes: { label: 'Notes', type: 'textarea' },
  notes_append: { label: 'Append Notes', type: 'textarea' },
  status: { label: 'Status', placeholder: 'pending / completed' },
  priority: { label: 'Priority', placeholder: 'low / medium / high' },
  deadline: { label: 'Deadline', placeholder: 'YYYY-MM-DD' },
  start: { label: 'Start', placeholder: 'ISO datetime' },
  end: { label: 'End', placeholder: 'ISO datetime' },
  location: { label: 'Location' },
  link: { label: 'Link (URL)' },
  tags: { label: 'Tags', placeholder: 'comma separated' },
  target_title: { label: 'Target Title' },
  new_title: { label: 'New Title' },
};

const TOOL_REQUIRED_FIELDS = {
  todo_list: ['title'],
  calendar_edit: ['title', 'start'],
  kitchen_tips: ['title'],
  app_guide: ['section_id', 'title', 'content'],
};

const TOOL_EXTRA_FIELDS = {
  calendar_edit: ['location', 'notes'],
  todo_list: ['notes', 'deadline', 'priority'],
  kitchen_tips: ['link', 'tags', 'content'],
  app_guide: ['content'],
};

const TOOL_ACTION_FIELD_CONFIG = {
  kitchen_tips: {
    search: { fields: ['query'], required: ['query'] },
    get: { fields: ['id', 'title'], required: ['id'] },
    list: { fields: [], required: [] },
  },
  todo_list: {
    list: { fields: [], required: [] },
    delete: { fields: ['id', 'target_title'], required: ['id'] },
    update: { fields: ['id', 'target_title', 'status', 'deadline', 'priority', 'notes'], required: ['id'] },
  },
  calendar_edit: {
    list: { fields: [], required: [] },
    delete: { fields: ['id', 'title'], required: ['id'] },
  },
};

const STORAGE_KEYS = {
  ACTIVE_PAGE: 'tier5_active_page',
  SCROLL_PREFIX: 'tier5_scroll_',
  PENDING_PAGE: 'tier5_pending_page',
};

let pollTimer;

const state = {
  chat: [],
  intents: [],
  intentActions: {},
  pending: [],
  pendingPage: 1,
  pendingLimit: 25,
  pendingHasMore: false,
  selectedPromptId: null,
  selectedPrompt: null,
  correctionFields: {},
  latestConfirmed: null,
  classifier: [],
  corrected: [],
  stats: {},
  dataStores: {
    todos: [],
    calendar: [],
    kitchen_tips: [],
    app_guide: [],
  },
  activeDataTab: 'todos',
};

const el = {
  chatLog: document.querySelector('#chat-log'),
  chatForm: document.querySelector('#chat-form'),
  chatInput: document.querySelector('#chat-input'),
  chatStatus: document.querySelector('#chat-status'),
  intentSelect: document.querySelector('#intent-select'),
  actionSelect: document.querySelector('#action-select'),
  dynamicFieldGrid: document.querySelector('#dynamic-field-grid'),
  pendingList: document.querySelector('#pending-list'),
  pendingCountInline: document.querySelector('#pending-count-inline'),
  pendingPrev: document.querySelector('#pending-prev'),
  pendingNext: document.querySelector('#pending-next'),
  pendingPageLabel: document.querySelector('#pending-page'),
  pendingRefresh: document.querySelector('#pending-refresh'),
  selectedPromptText: document.querySelector('#selected-prompt-text'),
  selectedReason: document.querySelector('#selected-reason'),
  versionHistory: document.querySelector('#version-history'),
  correctButton: document.querySelector('#correct-button'),
  latestConfirmedTitle: document.querySelector('#latest-confirmed-title'),
  latestConfirmedMeta: document.querySelector('#latest-confirmed-meta'),
  latestConfirmedPayload: document.querySelector('#latest-confirmed-payload'),
  promptSummary: document.querySelector('#prompt-summary'),
  editorPanel: document.querySelector('#editor-panel'),
  dataTabs: document.querySelectorAll('.data-tab'),
  dataPanels: document.querySelectorAll('.data-panel-view'),
  dataRefresh: document.querySelector('#data-refresh'),
  todosPanel: document.querySelector('#todos-panel'),
  calendarPanel: document.querySelector('#calendar-panel'),
  kitchenList: document.querySelector('#kitchen-list'),
  guideList: document.querySelector('#guide-list'),
  todoForm: document.querySelector('#todo-form'),
  kitchenForm: document.querySelector('#kitchen-form'),
  calendarForm: document.querySelector('#calendar-form'),
  guideForm: document.querySelector('#guide-form'),
  classifierTable: document.querySelector('#classifier-table tbody'),
  classifierRefresh: document.querySelector('#classifier-refresh'),
  correctedTable: document.querySelector('#corrected-table tbody'),
  correctedRefresh: document.querySelector('#corrected-refresh'),
  statsPending: document.querySelector('#pending-count'),
  statsPendingBreakdown: document.querySelector('#pending-breakdown'),
  statsLabeled: document.querySelector('#labeled-count'),
  statsClassifier: document.querySelector('#classifier-count'),
  exportButton: document.querySelector('#export-prompts'),
  exportLinks: document.querySelector('#export-links'),
  importForm: document.querySelector('#import-form'),
  refreshButton: document.querySelector('#refresh-button'),
  toast: document.querySelector('#toast'),
  trainingPage: document.querySelector('#training-page'),
};

const navButtons = document.querySelectorAll('.nav-link');

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  if (response.ok) {
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  let detail = response.statusText;
  try {
    const payload = await response.json();
    detail = payload.detail || JSON.stringify(payload);
  } catch (err) {
    // ignore
  }
  throw new Error(detail || 'Request failed');
}

function showToast(message, type = 'info') {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.remove('hidden');
  el.toast.dataset.type = type;
  setTimeout(() => {
    el.toast?.classList.add('hidden');
  }, 3000);
}

function setChatStatus(text) {
  if (el.chatStatus) {
    el.chatStatus.textContent = text;
  }
}

function switchPage(targetId) {
  const pageViews = document.querySelectorAll('.page-view');
  if (!targetId) return;
  pageViews.forEach((view) => {
    view.classList.toggle('active', view.id === targetId);
  });
  navButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.target === targetId);
  });
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PAGE, targetId);
  } catch (err) {
    // ignore storage issues
  }
}

function getActionsForIntent(intent) {
  if (!intent) return [];
  return state.intentActions[intent] || DEFAULT_INTENT_ACTIONS[intent] || [];
}

function populateIntentOptions() {
  if (!el.intentSelect) return;
  el.intentSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose intent';
  el.intentSelect.appendChild(placeholder);
  state.intents.forEach((intent) => {
    const option = document.createElement('option');
    option.value = intent;
    option.textContent = INTENT_LABELS[intent] || intent;
    el.intentSelect.appendChild(option);
  });
}

function updateActionSelectOptions(intent, defaultValue) {
  if (!el.actionSelect) return;
  const actions = getActionsForIntent(intent);
  el.actionSelect.innerHTML = '';
  if (!actions.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No actions';
    el.actionSelect.appendChild(option);
    el.actionSelect.disabled = true;
    return;
  }
  el.actionSelect.disabled = false;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose action';
  el.actionSelect.appendChild(placeholder);
  actions.forEach((action) => {
    const option = document.createElement('option');
    option.value = action;
    option.textContent = action;
    el.actionSelect.appendChild(option);
  });
  if (defaultValue && actions.includes(defaultValue)) {
    el.actionSelect.value = defaultValue;
  }
}

function renderChat() {
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
      meta.textContent = [
        entry.meta.intent ? `intent=${entry.meta.intent}` : null,
        extras.resolved_tool ? `tool=${extras.resolved_tool}` : null,
        entry.meta.latency_ms ? `${entry.meta.latency_ms} ms` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      wrapper.appendChild(meta);
    }
    el.chatLog.appendChild(wrapper);
  });
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

function formatPreviewValue(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    return '[object]';
  }
  return String(value ?? '');
}

function getVersionCount(promptId) {
  if (!promptId) return 0;
  return state.corrected.filter((record) => record.id === promptId).length;
}

function formatIntentLabel(intent) {
  return INTENT_LABELS[intent] || intent || 'nlu_fallback';
}

function renderPendingMeta() {
  if (el.pendingCountInline) {
    const total = state.stats.pending?.total ?? state.pending.length;
    el.pendingCountInline.textContent = total;
  }
  if (el.pendingPageLabel) {
    el.pendingPageLabel.textContent = String(state.pendingPage);
  }
  if (el.pendingPrev) {
    el.pendingPrev.disabled = state.pendingPage <= 1;
  }
  if (el.pendingNext) {
    el.pendingNext.disabled = !state.pendingHasMore;
  }
}

function detachEditorPanel() {
  if (!el.editorPanel) {
    return;
  }
  el.editorPanel.classList.add('hidden');
}

function attachEditorPanel(container) {
  if (!el.editorPanel || !container) return;
  container.insertAdjacentElement('afterend', el.editorPanel);
  el.editorPanel.classList.remove('hidden');
}

function renderPendingList() {
  if (!el.pendingList) return;
  el.pendingList.innerHTML = '';
  detachEditorPanel();
  state.pending.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'pending-item';
    if (item.prompt_id === state.selectedPromptId) {
      li.classList.add('editing');
      attachEditorPanel(li);
      renderCorrectionForm();
    }
    const header = document.createElement('div');
    header.className = 'pending-item-header';
    const heading = document.createElement('h4');
    heading.textContent = item.user_text || '—';
    const actionRow = document.createElement('div');
    actionRow.className = 'pending-item-actions';
    const infoPills = document.createElement('div');
    infoPills.className = 'info-pills';
    const intentLabel = formatIntentLabel(item.intent);
    const intentPill = document.createElement('span');
    intentPill.textContent = intentLabel;
    infoPills.appendChild(intentPill);
    if (item.reason) {
      const reasonPill = document.createElement('span');
      reasonPill.textContent = item.reason;
      infoPills.appendChild(reasonPill);
    }
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'button ghost';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      deletePendingPrompt(item);
    });
    actionRow.appendChild(infoPills);
    actionRow.appendChild(deleteBtn);
    header.appendChild(heading);
    header.appendChild(actionRow);
    const payload = document.createElement('p');
    payload.className = 'meta';
    const predicted = item.predicted_payload || item.parser_payload || {};
    const preview = Object.entries(predicted)
      .filter(([key]) => key !== 'intent' && key !== 'action')
      .slice(0, 3)
      .map(([key, value]) => `${key}=${formatPreviewValue(value)}`)
      .join(', ');
    payload.textContent = preview || 'No parser payload';
    li.appendChild(header);
    li.appendChild(payload);
    li.addEventListener('click', (event) => {
      if (el.editorPanel && el.editorPanel.contains(event.target)) {
        return;
      }
      selectPendingPrompt(item);
    });
    el.pendingList.appendChild(li);
  });
  renderPendingMeta();
}

function normalizeFormFields(payload) {
  const normalized = {};
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (key === 'action' || key === 'intent') {
      return;
    }
    if (Array.isArray(value)) {
      normalized[key] = value.join(', ');
    } else if (typeof value === 'object' && value !== null) {
      // skip nested objects for now
    } else if (value !== null && value !== undefined) {
      normalized[key] = String(value);
    }
  });
  return normalized;
}

function computeFieldList(tool, action, payload) {
  const override = TOOL_ACTION_FIELD_CONFIG[tool]?.[action];
  if (override) {
    return override.fields || [];
  }
  const keys = new Set();
  Object.keys(payload || {}).forEach((key) => keys.add(key));
  (TOOL_EXTRA_FIELDS[tool] || []).forEach((key) => keys.add(key));
  (TOOL_REQUIRED_FIELDS[tool] || []).forEach((key) => keys.add(key));
  const ordered = FIELD_ORDER.filter((field) => keys.has(field));
  const extras = [...keys].filter((field) => !FIELD_ORDER.includes(field));
  return [...ordered, ...extras];
}

function isFieldRequired(tool, action, field) {
  if (!tool) return false;
  const overrideRequired = TOOL_ACTION_FIELD_CONFIG[tool]?.[action]?.required;
  if (overrideRequired && overrideRequired.includes(field)) {
    return true;
  }
  const required = TOOL_REQUIRED_FIELDS[tool] || [];
  if (!required.includes(field)) {
    return false;
  }
  if (tool === 'todo_list' && action === 'list') {
    return false;
  }
  if (tool === 'calendar_edit' && action === 'list') {
    return false;
  }
  if (tool === 'kitchen_tips' && action !== 'create') {
    return false;
  }
  if (tool === 'app_guide' && action !== 'upsert') {
    return false;
  }
  return true;
}

function renderDynamicFields(tool, action) {
  if (!el.dynamicFieldGrid) return;
  el.dynamicFieldGrid.innerHTML = '';
  const requiresActionFirst = !!TOOL_ACTION_FIELD_CONFIG[tool];
  if (!tool || !state.selectedPrompt) {
    const placeholder = document.createElement('p');
    placeholder.className = 'hint';
    placeholder.textContent = 'Select a pending prompt to edit tool fields.';
    el.dynamicFieldGrid.appendChild(placeholder);
    return;
  }
  if (requiresActionFirst && !action) {
    const placeholder = document.createElement('p');
    placeholder.className = 'hint';
    placeholder.textContent = 'Choose an action to edit its fields.';
    el.dynamicFieldGrid.appendChild(placeholder);
    return;
  }
  const fields = computeFieldList(tool, action, state.correctionFields);
  if (!fields.length) {
    const placeholder = document.createElement('p');
    placeholder.className = 'hint';
    placeholder.textContent = 'No tool-specific fields for this intent.';
    el.dynamicFieldGrid.appendChild(placeholder);
    return;
  }
  fields.forEach((field) => {
    const config = FIELD_LIBRARY[field] || { label: field };
    const wrapper = document.createElement('label');
    const label = document.createElement('span');
    label.textContent = config.label || field;
    wrapper.appendChild(label);
    const required = isFieldRequired(tool, action, field);
    if (required && !(state.correctionFields[field]?.trim())) {
      wrapper.classList.add('field-required');
    }
    const control =
      config.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    control.value = state.correctionFields[field] ?? '';
    if (config.placeholder) {
      control.placeholder = config.placeholder;
    }
    control.addEventListener('input', (event) => {
      state.correctionFields[field] = event.target.value;
      updateCorrectButtonState();
      if (isFieldRequired(tool, action, field)) {
        if (event.target.value.trim()) {
          wrapper.classList.remove('field-required');
        } else {
          wrapper.classList.add('field-required');
        }
      }
    });
    wrapper.appendChild(control);
    el.dynamicFieldGrid.appendChild(wrapper);
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
    .filter((record) => record.id === state.selectedPrompt.prompt_id)
    .sort((a, b) => (a.version || 0) - (b.version || 0));
  if (!history.length) {
    const placeholder = document.createElement('p');
    placeholder.className = 'hint';
    placeholder.textContent = 'No saved corrections yet.';
    el.versionHistory.appendChild(placeholder);
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

function updateCorrectButtonState() {
  if (!el.correctButton || !state.selectedPrompt) {
    if (el.correctButton) {
      el.correctButton.disabled = true;
    }
    return;
  }
  const reviewerIntent = el.intentSelect?.value || '';
  const action = el.actionSelect?.value || '';
  const tool = reviewerIntent || state.selectedPrompt.intent;
  const requiredFields = (TOOL_REQUIRED_FIELDS[tool] || []).filter((field) =>
    isFieldRequired(tool, action, field),
  );
  const missingField = requiredFields.some((field) => !(state.correctionFields[field]?.trim()));
  const needsAction = getActionsForIntent(tool).length > 0;
  const ready = Boolean(reviewerIntent && (!needsAction || action) && !missingField);
  el.correctButton.disabled = !ready;
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
    el.latestConfirmedTitle.textContent = record.prompt_text || 'Corrected prompt';
  }
  if (el.latestConfirmedMeta) {
    el.latestConfirmedMeta.textContent = `${record.reviewer_intent} v${record.version}`;
  }
  if (el.latestConfirmedPayload) {
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(record.corrected_payload, null, 2);
    el.latestConfirmedPayload.innerHTML = '';
    el.latestConfirmedPayload.appendChild(pre);
  }
}

function renderCorrectionForm() {
  if (!el.intentSelect || !el.actionSelect) return;
  if (!state.selectedPrompt) {
    detachEditorPanel();
    el.intentSelect.value = '';
    el.intentSelect.disabled = true;
    el.actionSelect.disabled = true;
    el.selectedPromptText.textContent = '';
    el.selectedReason.textContent = '';
    el.promptSummary?.classList.add('hidden');
    el.dynamicFieldGrid.innerHTML = '<p class="hint">Parser payload fields will appear here.</p>';
    el.versionHistory.innerHTML = '<p class="hint">Version history is empty.</p>';
    updateCorrectButtonState();
    return;
  }
  el.promptSummary?.classList.remove('hidden');
  el.intentSelect.disabled = false;
  el.actionSelect.disabled = false;
  const titleText =
    state.selectedPrompt.user_text && state.selectedPrompt.user_text.trim()
      ? state.selectedPrompt.user_text
      : '—';
  el.selectedPromptText.textContent = titleText;
  el.selectedReason.textContent = `Reason: ${state.selectedPrompt.reason || 'review'}`;
  const reviewerIntent = state.selectedPrompt.intent || '';
  el.intentSelect.value = reviewerIntent;
  const predicted = state.selectedPrompt.predicted_payload_raw || {};
  updateActionSelectOptions(reviewerIntent, predicted.action);
  renderDynamicFields(reviewerIntent, el.actionSelect.value);
  renderVersionHistory();
  updateCorrectButtonState();
}

function selectPendingPrompt(item) {
  state.selectedPromptId = item.prompt_id;
  const predicted = item.predicted_payload || item.parser_payload || {};
  state.selectedPrompt = {
    ...item,
    predicted_payload_raw: predicted,
  };
  state.correctionFields = normalizeFormFields(predicted);
  renderPendingList();
  renderCorrectionForm();
}

function resetSelection() {
  state.selectedPromptId = null;
  state.selectedPrompt = null;
  state.correctionFields = {};
  renderCorrectionForm();
  renderPendingList();
}

function gatherCorrectionPayload() {
  if (!state.selectedPrompt) {
    return null;
  }
  const reviewerIntent = el.intentSelect?.value || state.selectedPrompt.intent;
  if (!reviewerIntent) {
    return null;
  }
  const action = el.actionSelect?.value || state.selectedPrompt.predicted_payload_raw?.action || null;
  const correctedPayload = {};
  Object.entries(state.correctionFields).forEach(([key, value]) => {
    const trimmed = typeof value === 'string' ? value.trim() : value;
    if (trimmed === '' || trimmed === undefined) {
      return;
    }
    if (key === 'tags') {
      correctedPayload[key] = trimmed
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    } else {
      correctedPayload[key] = trimmed;
    }
  });
  if (action) {
    correctedPayload.action = action;
  }
  correctedPayload.intent = reviewerIntent;
  return {
    prompt_id: state.selectedPrompt.prompt_id,
    prompt_text: state.selectedPrompt.user_text,
    tool: reviewerIntent,
    parser_intent: state.selectedPrompt.intent,
    reviewer_intent: reviewerIntent,
    action,
    predicted_payload: state.selectedPrompt.predicted_payload_raw || {},
    corrected_payload: correctedPayload,
  };
}

function addPendingRecord(record) {
  if (!record || !record.prompt_id) {
    return;
  }
  const exists = state.pending.findIndex((item) => item.prompt_id === record.prompt_id);
  if (exists >= 0) {
    state.pending[exists] = record;
  } else {
    state.pending.unshift(record);
  }
  renderPendingList();
}

async function submitCorrection() {
  const payload = gatherCorrectionPayload();
  if (!payload) {
    showToast('Select a prompt and fill the required fields first.');
    return;
  }
  el.correctButton.disabled = true;
  try {
    const response = await fetchJSON('/api/logs/label', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.latestConfirmed = response.record;
    renderLatestConfirmed();
    showToast('Correction saved');
    if (Array.isArray(response.updated_stores) && response.updated_stores.length) {
      await Promise.all(response.updated_stores.map((store) => loadStore(store)));
    }
    await Promise.all([loadPending(true), loadCorrected(), loadStats()]);
  } catch (err) {
    showToast(err.message || 'Failed to save correction', 'error');
  } finally {
    updateCorrectButtonState();
  }
}

async function deletePendingPrompt(item) {
  if (!item) return;
  const targetId = item.prompt_id || item.text_hash;
  if (!targetId) {
    showToast('Unable to delete prompt without an id.', 'error');
    return;
  }
  try {
    await fetchJSON(`/api/logs/pending/${encodeURIComponent(targetId)}`, {
      method: 'DELETE',
    });
    showToast('Pending prompt deleted');
    if (state.selectedPromptId === item.prompt_id) {
      resetSelection();
    }
    await loadPending();
  } catch (err) {
    showToast(err.message || 'Deletion failed', 'error');
  }
}

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

function renderCorrectedTable() {
  if (!el.correctedTable) return;
  el.correctedTable.innerHTML = '';
  state.corrected.forEach((record) => {
    const row = document.createElement('tr');
    const promptCell = document.createElement('td');
    promptCell.textContent = record.prompt_text || '—';
    const predictedCell = document.createElement('td');
    const predictedPre = document.createElement('pre');
    predictedPre.textContent = JSON.stringify(record.predicted_payload || {}, null, 2);
    predictedCell.appendChild(predictedPre);
    const correctedCell = document.createElement('td');
    const correctedPre = document.createElement('pre');
    correctedPre.textContent = JSON.stringify(record.corrected_payload || {}, null, 2);
    correctedCell.appendChild(correctedPre);
    row.appendChild(promptCell);
    row.appendChild(predictedCell);
    row.appendChild(correctedCell);
    el.correctedTable.appendChild(row);
  });
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
}

function sortNewestFirst(list, key = 'timestamp') {
  return [...(list || [])].sort((a, b) => {
    const aVal = a[key] || a.created_at || a.id || 0;
    const bVal = b[key] || b.created_at || b.id || 0;
    return aVal < bVal ? 1 : -1;
  });
}

function renderTodos() {
  if (!el.todosPanel) return;
  el.todosPanel.innerHTML = '';
  const rows = sortNewestFirst(state.dataStores.todos, 'deadline');
  rows.forEach((todo) => {
    const tr = document.createElement('tr');
    const title = document.createElement('td');
    title.textContent = todo.title || 'Untitled';
    const status = document.createElement('td');
    status.textContent = todo.status || 'pending';
    const deadline = document.createElement('td');
    deadline.textContent = todo.deadline || '—';
    tr.appendChild(title);
    tr.appendChild(status);
    tr.appendChild(deadline);
    el.todosPanel.appendChild(tr);
  });
}

function renderCalendar() {
  if (!el.calendarPanel) return;
  el.calendarPanel.innerHTML = '';
  const rows = sortNewestFirst(state.dataStores.calendar, 'start');
  rows.forEach((event) => {
    const tr = document.createElement('tr');
    const title = document.createElement('td');
    title.textContent = event.title || 'Untitled';
    const start = document.createElement('td');
    start.textContent = event.start || '—';
    const end = document.createElement('td');
    end.textContent = event.end || '—';
    tr.appendChild(title);
    tr.appendChild(start);
    tr.appendChild(end);
    el.calendarPanel.appendChild(tr);
  });
}

function renderKitchen() {
  if (!el.kitchenList) return;
  el.kitchenList.innerHTML = '';
  const tips = sortNewestFirst(state.dataStores.kitchen_tips);
  tips.forEach((tip) => {
    const li = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = tip.title || 'Untitled tip';
    li.appendChild(title);
    if (tip.body) {
      const body = document.createElement('p');
      body.textContent = tip.body;
      li.appendChild(body);
    }
    if (tip.tags?.length) {
      const tags = document.createElement('p');
      tags.textContent = tip.tags.join(', ');
      li.appendChild(tags);
    }
    el.kitchenList.appendChild(li);
  });
}

function renderGuide() {
  if (!el.guideList) return;
  el.guideList.innerHTML = '';
  const entries = sortNewestFirst(state.dataStores.app_guide);
  entries.forEach((entry) => {
    const li = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = `${entry.section_id || 'section'}: ${entry.title || 'Untitled'}`;
    li.appendChild(title);
    if (entry.content) {
      const body = document.createElement('p');
      body.textContent = entry.content.slice(0, 160) + (entry.content.length > 160 ? '…' : '');
      li.appendChild(body);
    }
    el.guideList.appendChild(li);
  });
}

async function loadStore(store) {
  const data = await fetchJSON(`/api/data/${store}`);
  if (!data) return;
  if (store === 'todos') {
    state.dataStores.todos = data.todos || [];
    renderTodos();
  } else if (store === 'calendar') {
    state.dataStores.calendar = data.events || [];
    renderCalendar();
  } else if (store === 'kitchen_tips') {
    state.dataStores.kitchen_tips = data.tips || [];
    renderKitchen();
  } else if (store === 'app_guide') {
    state.dataStores.app_guide = data.sections || [];
    renderGuide();
  }
}

async function refreshStores(stores = ['todos', 'calendar', 'kitchen_tips', 'app_guide']) {
  await Promise.all(stores.map((store) => loadStore(store)));
}

function refreshActiveDataTab() {
  return loadStore(state.activeDataTab);
}

async function mutateStore(store, payload) {
  try {
    await fetchJSON(`/api/data/${store}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showToast('Store updated');
    await loadStore(store);
  } catch (err) {
    showToast(err.message || 'Update failed', 'error');
  }
}

async function loadIntents() {
  try {
    const data = await fetchJSON('/api/intents');
  state.intents = data.intents || [];
  state.intentActions = data.actions || {};
  populateIntentOptions();
  } catch (err) {
    console.warn('Failed to load intents', err);
  }
}

async function loadPending(preserveSelection = false) {
  const previousId = preserveSelection ? state.selectedPromptId : null;
  const params = new URLSearchParams({ limit: state.pendingLimit, page: state.pendingPage });
  const data = await fetchJSON(`/api/logs/pending?${params.toString()}`);
  state.pending = data.items || [];
  state.stats.pending = data.summary;
  state.pendingHasMore = Boolean(data.has_more);
  if (typeof data.page === 'number') {
    state.pendingPage = data.page;
  }
  if (typeof data.limit === 'number') {
    state.pendingLimit = data.limit;
  }
  renderPendingList();
  renderStats();
  persistPendingState();
  if (!state.pending.length) {
    resetSelection();
    return;
  }
  if (preserveSelection && previousId) {
    const existing = state.pending.find((item) => item.prompt_id === previousId);
    if (existing) {
      const currentIntent = el.intentSelect?.value || state.selectedPrompt?.intent || existing.intent;
      const currentAction =
        el.actionSelect?.value || state.selectedPrompt?.predicted_payload_raw?.action || existing.predicted_payload?.action;
      const currentFields = { ...state.correctionFields };
      const previousPayload = state.selectedPrompt?.predicted_payload_raw || existing.predicted_payload || existing.parser_payload || {};
      state.selectedPrompt = {
        ...existing,
        intent: currentIntent,
        predicted_payload_raw: { ...previousPayload },
      };
      if (currentAction) {
        state.selectedPrompt.predicted_payload_raw.action = currentAction;
      }
      state.correctionFields = currentFields;
      renderPendingList();
      renderCorrectionForm();
      return;
    }
  }
  selectPendingPrompt(state.pending[0]);
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
    state.pending = data.pending_sample;
    renderPendingList();
  }
}

function persistPendingState() {
  try {
    localStorage.setItem(STORAGE_KEYS.PENDING_PAGE, String(state.pendingPage));
  } catch (err) {
    // ignore
  }
}

function startPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(() => {
    loadPending(true);
    refreshActiveDataTab();
  }, POLL_INTERVAL_MS);
}

function wireEvents() {
  el.chatForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = el.chatInput.value.trim();
    if (!message) return;
    state.chat.push({ role: 'user', text: message });
    renderChat();
    el.chatInput.value = '';
    setChatStatus('Running…');
    try {
      const reply = await fetchJSON('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      state.chat.push({ role: 'assistant', text: reply.reply, meta: reply });
      renderChat();
      if (reply.pending_record) {
        addPendingRecord(reply.pending_record);
      }
      await Promise.all([loadPending(true), refreshActiveDataTab()]);
    } catch (err) {
      showToast(err.message || 'Chat failed', 'error');
    } finally {
      setChatStatus('Ready');
    }
  });

  el.intentSelect?.addEventListener('change', () => {
    updateActionSelectOptions(el.intentSelect.value, '');
    if (state.selectedPrompt) {
      state.selectedPrompt.intent = el.intentSelect.value || state.selectedPrompt.intent;
    }
    renderDynamicFields(el.intentSelect.value, el.actionSelect?.value || '');
    updateCorrectButtonState();
  });

  el.actionSelect?.addEventListener('change', () => {
    if (state.selectedPrompt) {
      const payload = state.selectedPrompt.predicted_payload_raw || {};
      payload.action = el.actionSelect.value;
      state.selectedPrompt.predicted_payload_raw = payload;
    }
    renderDynamicFields(el.intentSelect?.value, el.actionSelect.value);
    updateCorrectButtonState();
  });

  el.correctButton?.addEventListener('click', submitCorrection);
  el.pendingRefresh?.addEventListener('click', () => loadPending(true));

  el.pendingPrev?.addEventListener('click', () => {
    if (state.pendingPage <= 1) return;
    state.pendingPage -= 1;
    persistPendingState();
    loadPending();
  });

  el.pendingNext?.addEventListener('click', () => {
    if (!state.pendingHasMore) return;
    state.pendingPage += 1;
    persistPendingState();
    loadPending();
  });

  el.classifierRefresh?.addEventListener('click', loadClassifier);
  el.correctedRefresh?.addEventListener('click', loadCorrected);
  el.refreshButton?.addEventListener('click', () =>
    Promise.all([loadStats(), loadPending(true), loadClassifier(), loadCorrected(), refreshStores()]),
  );
  el.dataRefresh?.addEventListener('click', () => refreshStores([state.activeDataTab]));

  el.todoForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(el.todoForm);
    await mutateStore('todos', {
      action: 'create',
      title: formData.get('title'),
      deadline: formData.get('deadline') || undefined,
    });
    el.todoForm.reset();
  });

  el.kitchenForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(el.kitchenForm);
    const tags = (formData.get('tags') || '')
      .toString()
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    await mutateStore('kitchen_tips', {
      action: 'create',
      title: formData.get('title'),
      body: formData.get('body'),
      tags,
      link: formData.get('link') || undefined,
    });
    el.kitchenForm.reset();
  });

  el.calendarForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(el.calendarForm);
    await mutateStore('calendar', {
      action: 'create',
      title: formData.get('title'),
      start: formData.get('start'),
      end: formData.get('end') || undefined,
      location: formData.get('location') || undefined,
    });
    el.calendarForm.reset();
  });

  el.guideForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(el.guideForm);
    await mutateStore('app_guide', {
      action: 'upsert',
      section_id: formData.get('section_id'),
      title: formData.get('title'),
      content: formData.get('content'),
    });
    el.guideForm.reset();
  });

  el.exportButton?.addEventListener('click', async () => {
    try {
      el.exportButton.disabled = true;
      const result = await fetchJSON('/api/logs/export', { method: 'POST', body: JSON.stringify({ fmt: 'csv' }) });
      const links = result.files || [];
      el.exportLinks.innerHTML = '';
      links.forEach((file) => {
        const a = document.createElement('a');
        a.href = file.path;
        a.textContent = file.path.split('/').pop();
        a.target = '_blank';
        el.exportLinks.appendChild(a);
      });
      showToast('Export ready');
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    } finally {
      el.exportButton.disabled = false;
    }
  });

  el.importForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(el.importForm);
    try {
      const response = await fetch('/api/logs/import', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail || response.statusText);
      }
      showToast('Import completed');
      el.importForm.reset();
      await loadCorrected();
    } catch (err) {
      showToast(err.message || 'Import failed', 'error');
    }
  });

  el.dataTabs.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.store;
      if (!target || target === state.activeDataTab) return;
      state.activeDataTab = target;
      el.dataTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.store === target));
      el.dataPanels.forEach((panel) => panel.classList.toggle('active', panel.dataset.store === target));
      refreshActiveDataTab();
    });
  });

  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.target;
      if (target) {
        switchPage(target);
      }
    });
  });
}

async function bootstrap() {
  wireEvents();
  setChatStatus('Ready');
  try {
    const storedPage = localStorage.getItem(STORAGE_KEYS.ACTIVE_PAGE);
    if (storedPage && document.getElementById(storedPage)) {
      switchPage(storedPage);
    } else {
      switchPage('front-page');
    }
    const storedPendingPage = Number(localStorage.getItem(STORAGE_KEYS.PENDING_PAGE));
    if (!Number.isNaN(storedPendingPage) && storedPendingPage > 0) {
      state.pendingPage = storedPendingPage;
    }
  } catch (err) {
    switchPage('front-page');
  }
  await loadIntents();
  await Promise.all([loadStats(), loadPending(), loadClassifier(), loadCorrected(), refreshStores()]);
  renderLatestConfirmed();
  startPolling();
}

bootstrap().catch((err) => console.error(err));
const INTENT_LABELS = {
  weather: 'Weather tool',
  news: 'News tool',
  todo_list: 'Todo tool',
  kitchen_tips: 'Kitchen tips tool',
  calendar_edit: 'Calendar tool',
  app_guide: 'App guide tool',
  nlu_fallback: 'Fallback',
};
