const POLL_INTERVAL_MS = 15000;
const DEFAULT_INTENT_ACTIONS = {
  todo_list: ['list', 'find', 'create', 'update', 'delete'],
  kitchen_tips: ['list', 'find', 'create', 'update', 'delete'],
  calendar_edit: ['list', 'find', 'create', 'update', 'delete'],
  app_guide: ['list', 'find', 'create', 'update', 'delete'],
};

const ACTION_ALIASES = {
  kitchen_tips: { search: 'find', get: 'find' },
  app_guide: { get: 'find', upsert: 'update', search: 'find' },
};

const FIELD_ORDER = [
  'title',
  'id',
  'status',
  'priority',
  'deadline',
  'start',
  'end',
  'location',
  'keywords',
  'link',
  'city',
  'time',
  'topic',
  'language',
  'intended_entities',
  'content',
];

const DISPLAY_META_FIELDS = ['intent', 'action', 'domain'];

const FIELD_LIBRARY = {
  title: { label: 'Title' },
  content: { label: 'Content', type: 'textarea' },
  status: {
    label: 'Status',
    control: () => {
      const select = document.createElement('select');
      select.innerHTML = `
        <option value="pending">Pending</option>
        <option value="pushed">Pushed</option>
        <option value="completed">Completed</option>
      `;
      return select;
    },
  },
  priority: {
    label: 'Priority',
    control: () => {
      const select = document.createElement('select');
      select.innerHTML = `
        <option value="">None</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      `;
      return select;
    },
  },
  deadline: { label: 'Deadline' },
  start: { label: 'Start' },
  end: { label: 'End' },
  location: { label: 'Location' },
  keywords: { label: 'Keywords' },
  link: { label: 'Link (URL)' },
  city: { label: 'City' },
  time: { label: 'Time hint' },
  topic: { label: 'Topic' },
  language: { label: 'Language (e.g., en)' },
  id: { label: 'ID' },
};

const TOOL_REQUIRED_FIELDS = {
  todo_list: ['title'],
  calendar_edit: ['title', 'start'],
  kitchen_tips: ['title', 'content'],
  app_guide: ['title', 'content'],
};

const TOOL_EXTRA_FIELDS = {
  calendar_edit: ['location', 'content'],
  todo_list: ['content', 'deadline', 'priority', 'link'],
  kitchen_tips: ['keywords', 'link'],
  app_guide: ['keywords', 'link'],
};

const TITLE_LOOKUP_TOOLS = new Set(['todo_list', 'kitchen_tips', 'calendar_edit', 'app_guide']);
const INTENDED_ENTITY_TOOLS = new Set(['todo_list', 'kitchen_tips', 'calendar_edit', 'app_guide']);
const INTENDED_ENTITY_ACTIONS = new Set(['find', 'list']);
const TITLE_LOOKUP_ACTIONS = new Set(['update', 'delete']);
const TITLE_SELECT_TOOLS = new Set(['todo_list', 'kitchen_tips', 'calendar_edit', 'app_guide']);
const TITLE_SELECT_ACTIONS = new Set(['update', 'delete']);

const TOOL_ACTION_FIELD_CONFIG = {
  kitchen_tips: {
    list: { fields: [], required: [] },
    find: { fields: ['keywords'], required: ['keywords'] },
    create: { fields: ['title', 'content', 'keywords', 'link'], required: ['title', 'content'] },
    update: { fields: ['id', 'title', 'content', 'keywords', 'link'], required: ['id'] },
    delete: { fields: ['id', 'title'], required: ['id'] },
  },
  todo_list: {
    list: { fields: [], required: [] },
    find: { fields: ['keywords'], required: ['keywords'] },
    create: { fields: ['title', 'content', 'status', 'deadline', 'priority', 'link'], required: ['title', 'deadline'] },
    delete: { fields: ['id', 'title'], required: ['id'] },
    update: { fields: ['id', 'title', 'content', 'status', 'deadline', 'priority', 'link'], required: ['id'] },
  },
  calendar_edit: {
    list: { fields: [], required: [] },
    find: { fields: ['keywords'], required: ['keywords'] },
    create: { fields: ['title', 'start', 'end', 'location', 'content', 'link'], required: ['title', 'start'] },
    delete: { fields: ['id', 'title'], required: ['id'] },
    update: { fields: ['id', 'title', 'start', 'end', 'location', 'content', 'link'], required: ['id'] },
  },
  app_guide: {
    list: { fields: [], required: [] },
    find: { fields: ['keywords'], required: ['keywords'] },
    create: { fields: ['id', 'title', 'content', 'keywords', 'link'], required: ['title', 'content'] },
    update: { fields: ['id', 'title', 'content', 'keywords', 'link'], required: ['id'] },
    delete: { fields: ['id', 'title'], required: ['id'] },
  },
};

const MUTATING_ACTIONS = new Set(['create', 'update', 'delete']);

const ENTITY_FIELD_CONFIG = {
  todo_list: {
    field: 'id',
    store: 'todos',
    label: (entity) => `${entity.title || 'Untitled'} (#${entity.id})`,
    hydrate: (entity) => ({
      id: entity.id,
      title: entity.title || '',
      status: entity.status || 'pending',
      deadline: entity.deadline || '',
      priority: entity.priority || '',
      content: Array.isArray(entity.notes) ? entity.notes.join('\n') : entity.notes || '',
      link: entity.link || '',
    }),
  },
  calendar_edit: {
    field: 'id',
    store: 'calendar',
    label: (entity) => `${entity.title || 'Untitled'} (#${entity.id})`,
    hydrate: (entity) => ({
      id: entity.id,
      title: entity.title || '',
      start: entity.start || '',
      end: entity.end || '',
      location: entity.location || '',
      content: entity.notes || '',
      link: entity.link || '',
    }),
  },
  kitchen_tips: {
    field: 'id',
    store: 'kitchen_tips',
    label: (entity) => `${entity.title || 'Untitled'} (#${entity.id})`,
    hydrate: (entity) => ({
      id: entity.id,
      title: entity.title || '',
      content: entity.content || '',
      keywords: Array.isArray(entity.keywords) ? entity.keywords.join(', ') : '',
      link: entity.link || '',
    }),
  },
  app_guide: {
    field: 'id',
    store: 'app_guide',
    label: (entity) => `${entity.title || entity.id || 'Untitled'} (#${entity.id})`,
    hydrate: (entity) => ({
      id: entity.id || '',
      title: entity.title || '',
      content: entity.content || '',
      keywords: Array.isArray(entity.keywords) ? entity.keywords.join(', ') : '',
      link: entity.link || '',
    }),
  },
};

const DATE_TIME_FIELD_CONFIG = {
  time: { mode: 'weather', includeTime: true, defaultTime: '13:00' },
  start: { mode: 'iso', includeTime: true, defaultTime: '09:00', split: true },
  end: { mode: 'iso', includeTime: true, defaultTime: '10:00', split: true },
  deadline: { mode: 'date', includeTime: false },
};

const CALENDAR_FIELD_LAYOUT = {
  title: { column: '1', row: '1' },
  'start-date': { column: '2', row: '1' },
  'end-date': { column: '3', row: '1' },
  link: { column: '4', row: '1' },
  location: { column: '4', row: '2' },
  'start-time': { column: '2', row: '2' },
  'end-time': { column: '3', row: '2' },
  id: { column: '1', row: '2' },
};

const FIELD_LAYOUTS = {
  todo_list: {
    default: {
      title: { column: '1', row: '1' },
      id: { column: '2', row: '1' },
      keywords: { column: '3', row: '1' },
      deadline: { column: '1', row: '2' },
      priority: { column: '2', row: '2' },
      status: { column: '3', row: '2' },
      link: { column: '4', row: '2' },
      content: { column: '1 / span 4', row: '3' },
    },
    actions: {
      find: {
        keywords: { column: '1', row: '1' },
      },
      delete: {
        title: { column: '1', row: '1' },
        id: { column: '2', row: '1' },
      },
      list: {},
    },
  },
  app_guide: {
    default: {
      title: { column: '1', row: '1' },
      id: { column: '2', row: '1' },
      keywords: { column: '1', row: '2' },
      link: { column: '2', row: '2' },
      content: { column: '1 / span 4', row: '3' },
    },
    actions: {
      create: {
        title: { column: '1', row: '1' },
        id: { column: '2', row: '1' },
        keywords: { column: '1', row: '2' },
        link: { column: '2', row: '2' },
        content: { column: '1 / span 4', row: '3' },
      },
      find: {
        keywords: { column: '1', row: '1' },
      },
      delete: {
        title: { column: '1', row: '1' },
        id: { column: '2', row: '1' },
      },
      list: {},
    },
  },
  kitchen_tips: {
    default: {
      title: { column: '1', row: '1' },
      id: { column: '2', row: '1' },
      keywords: { column: '1', row: '2' },
      link: { column: '2', row: '2' },
      content: { column: '1 / span 4', row: '3' },
    },
    actions: {
      create: {
        title: { column: '1', row: '1' },
        keywords: { column: '1', row: '2' },
        link: { column: '2', row: '2' },
        content: { column: '1 / span 4', row: '3' },
      },
      find: {
        keywords: { column: '1', row: '1' },
      },
      delete: {
        title: { column: '1', row: '1' },
        id: { column: '2', row: '1' },
      },
      list: {},
    },
  },
  calendar_edit: {
    default: {
      keywords: { column: '1', row: '3' },
      content: { column: '1 / span 4', row: '4' },
    },
    actions: {
      find: {
        keywords: { column: '1', row: '1' },
      },
      delete: {
        title: { column: '1', row: '1' },
        id: { column: '2', row: '1' },
      },
      list: {},
    },
  },
};

const STORAGE_KEYS = {
  ACTIVE_PAGE: 'tier5_active_page',
  SCROLL_PREFIX: 'tier5_scroll_',
  PENDING_PAGE: 'tier5_pending_page',
  CHAT_HISTORY: 'tier5_chat_history',
  LATEST_CONFIRMED: 'tier5_latest_confirmed',
  SELECTED_PROMPT: 'tier5_selected_prompt',
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
  hiddenFields: {},
  fieldVersions: {},
  intendedEntities: [],
  latestConfirmed: null,
  classifier: [],
  corrected: [],
  stats: {},
  datetimeInputs: {},
  pendingChatEntry: null,
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
  relatedPromptsList: document.querySelector('#related-prompts-list'),
  relatedPromptsInput: document.querySelector('#related-prompts-input'),
  relatedPromptsOptions: document.querySelector('#related-prompts-options'),
  intendedEntitiesRow: document.querySelector('#intended-entities-row'),
  intendedEntitiesList: document.querySelector('#intended-entities-list'),
  entitySearchInput: document.querySelector('#entity-search-input'),
  entitySearchOptions: document.querySelector('#entity-search-options'),
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

if (typeof window !== 'undefined' && window.history && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

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
    detail =
      payload?.detail?.message ||
      payload?.detail ||
      payload?.message ||
      (typeof payload === 'string' ? payload : JSON.stringify(payload));
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
  const defaults = DEFAULT_INTENT_ACTIONS[intent] || [];
  const configured = state.intentActions[intent] || [];
  if (!configured.length) {
    return defaults;
  }
  const result = [...defaults];
  configured.forEach((action) => {
    if (!result.includes(action)) {
      result.push(action);
    }
  });
  return result;
}

function normalizeActionName(intent, action) {
  if (!action) return action;
  const aliases = ACTION_ALIASES[intent];
  if (!aliases) return action;
  return aliases[action] || action;
}

function sanitizeIntentActions(raw = {}) {
  const sanitized = {};
  Object.entries(raw).forEach(([intent, actions]) => {
    if (!Array.isArray(actions)) {
      return;
    }
    const normalized = actions
      .map((action) => normalizeActionName(intent, action))
      .filter(Boolean);
    const unique = Array.from(new Set(normalized));
    const allowed = DEFAULT_INTENT_ACTIONS[intent];
    if (allowed && allowed.length) {
      sanitized[intent] = unique.filter((action) => allowed.includes(action));
    } else {
      sanitized[intent] = unique;
    }
  });
  return sanitized;
}

function populateIntentOptions() {
  if (!el.intentSelect) return;
  el.intentSelect.innerHTML = '';
  const sorted = state.intents
    .map((intent) => ({
      value: intent,
      label: INTENT_LABELS[intent] || intent,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  sorted.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    el.intentSelect.appendChild(option);
  });
  el.intentSelect.selectedIndex = -1;
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
  const canonicalOrder = DEFAULT_INTENT_ACTIONS[intent];
  const orderedActions = [...actions];
  if (canonicalOrder?.length) {
    orderedActions.sort((a, b) => {
      const aIdx = canonicalOrder.indexOf(a);
      const bIdx = canonicalOrder.indexOf(b);
      if (aIdx === -1 && bIdx === -1) {
        return a.localeCompare(b);
      }
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  } else {
    orderedActions.sort((a, b) => a.localeCompare(b));
  }
  orderedActions.forEach((action) => {
    const option = document.createElement('option');
    option.value = action;
    option.textContent = action;
    el.actionSelect.appendChild(option);
  });
  const nextValue = defaultValue && actions.includes(defaultValue) ? defaultValue : actions[0];
  el.actionSelect.value = nextValue;
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

function formatTimestamp(ts) {
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildPendingMetadata(item) {
  const parts = [];
  const created = formatTimestamp(item.timestamp);
  if (created) {
    parts.push(`Created ${created}`);
  }
  if (typeof item.confidence === 'number') {
    parts.push(`Confidence ${item.confidence.toFixed(2)}`);
  }
  const source = item.extras?.invocation_source || item.reason || item.tool_name;
  if (source) {
    parts.push(`Source ${source}`);
  }
  const probe = item.extras?.keyword_probe;
  if (probe?.decision === 'find') {
    parts.push(`Probe matched ${probe.match_count ?? 0} tip(s)`);
  } else if (probe?.decision === 'list') {
    parts.push('Probe: no matches, defaulted to list');
  } else if (probe?.decision === 'answer') {
    parts.push('Probe: answered via LLM (no matches)');
  }
  return parts.join(' • ');
}

function sortPendingByRecency(items) {
  const sorted = (items || []).slice().sort((a, b) => {
    const timeA = new Date(a?.timestamp || 0).getTime();
    const timeB = new Date(b?.timestamp || 0).getTime();
    if (!Number.isFinite(timeA) && !Number.isFinite(timeB)) return 0;
    if (!Number.isFinite(timeA)) return 1;
    if (!Number.isFinite(timeB)) return -1;
    return timeB - timeA;
  });
  const seen = new Set();
  return sorted.filter((item) => {
    const key = item?.prompt_id || item?.text_hash || item?.user_text;
    if (!key) {
      return true;
    }
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeRelatedPromptsList(record) {
  if (!record) return [];
  const prompts = Array.isArray(record.related_prompts) ? record.related_prompts : [];
  const cleaned = prompts
    .map((prompt) => (typeof prompt === 'string' ? prompt.trim() : ''))
    .filter(Boolean);
  const primary = (record.user_text || '').trim();
  const filtered = cleaned.filter((prompt) => prompt !== primary);
  return filtered.slice(-10);
}

function arePromptListsEqual(listA = [], listB = []) {
  if (!Array.isArray(listA) || !Array.isArray(listB)) return false;
  if (listA.length !== listB.length) return false;
  for (let i = 0; i < listA.length; i += 1) {
    if (listA[i] !== listB[i]) {
      return false;
    }
  }
  return true;
}

function normalizeIntendedEntities(record) {
  if (!record) return [];
  const entities = Array.isArray(record.intended_entities) ? record.intended_entities : [];
  return entities
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const id = String(entry.id || entry.value || '').trim();
      const title = String(entry.title || entry.label || '').trim();
      if (!title) return null;
      return { id: id || null, title };
    })
    .filter(Boolean);
}

function areIntendedListsEqual(listA = [], listB = []) {
  if (!Array.isArray(listA) || !Array.isArray(listB)) return false;
  if (listA.length !== listB.length) return false;
  for (let i = 0; i < listA.length; i += 1) {
    const a = listA[i] || {};
    const b = listB[i] || {};
    if ((a.id || null) !== (b.id || null) || (a.title || '') !== (b.title || '')) {
      return false;
    }
  }
  return true;
}

function normalizePendingRecord(record) {
  if (!record || typeof record !== 'object') {
    return record;
  }
  const predicted = record.predicted_payload ? { ...record.predicted_payload } : {};
  if (!predicted.related_prompts) {
    predicted.related_prompts = [];
  }
  if (!predicted.intended_entities) {
    predicted.intended_entities = [];
  }
  return {
    ...record,
    predicted_payload: predicted,
    related_prompts: normalizeRelatedPromptsList(record),
    intended_entities: normalizeIntendedEntities(record),
    field_versions: { ...(record.field_versions || {}) },
  };
}

function flagReviewerChange(field) {
  if (!field) return;
  state.fieldVersions[field] = 'reviewer';
  if (state.selectedPrompt) {
    state.selectedPrompt.field_versions = state.selectedPrompt.field_versions || {};
    state.selectedPrompt.field_versions[field] = 'reviewer';
  }
}

function getRecentUserPrompts(limit = 10) {
  const primary = (state.selectedPrompt?.user_text || '').trim();
  const recent = [];
  const seen = new Set();
  for (let i = state.chat.length - 1; i >= 0 && recent.length < limit; i--) {
    const entry = state.chat[i];
    if (!entry || entry.role !== 'user') {
      continue;
    }
    const text = (entry.text || '').trim();
    if (!text || text === primary || seen.has(text)) {
      continue;
    }
    recent.push(text);
    seen.add(text);
  }
  return recent;
}

function getConversationHistoryEntries(record) {
  if (!record) return [];
  const extrasHistory = record.extras?.conversation_history;
  if (Array.isArray(extrasHistory) && extrasHistory.length) {
    return extrasHistory
      .map((entry) => {
        const text = typeof entry?.user_text === 'string' ? entry.user_text.trim() : '';
        if (!text) return null;
        const entryId = entry?.id || entry?.entry_id || entry?.conversation_entry_id || null;
        return { id: entryId, text };
      })
      .filter(Boolean);
  }
  const fallback = Array.isArray(record.related_prompts) ? record.related_prompts : [];
  return fallback
    .map((text) => ({ id: null, text: (text || '').trim() }))
    .filter((entry) => entry.text);
}

function getNearbyHistoryPrompts(record, beforeCount = 5, afterCount = 5) {
  const entries = getConversationHistoryEntries(record);
  if (!entries.length) return [];
  const entryId = record.conversation_entry_id || record.extras?.conversation_entry_id || null;
  const primaryText = (record.user_text || '').trim();
  let targetIndex = -1;
  if (entryId) {
    targetIndex = entries.findIndex((entry) => entry.id === entryId);
  }
  if (targetIndex === -1 && primaryText) {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (entries[i].text === primaryText) {
        targetIndex = i;
        break;
      }
    }
  }
  if (targetIndex === -1) {
    targetIndex = entries.length - 1;
  }
  const suggestions = [];
  const beforeStart = Math.max(0, targetIndex - beforeCount);
  for (let i = beforeStart; i < targetIndex; i += 1) {
    suggestions.push(entries[i].text);
  }
  const afterEnd = Math.min(entries.length, targetIndex + afterCount + 1);
  for (let i = targetIndex + 1; i < afterEnd; i += 1) {
    suggestions.push(entries[i].text);
  }
  return suggestions;
}

function getChatUserEntries() {
  return state.chat
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => entry.role === 'user' && (entry.text || '').trim());
}

function getNearbyChatPrompts(record, beforeCount = 5, afterCount = 5) {
  if (!record) return [];
  const entries = getChatUserEntries();
  if (!entries.length) return [];
  const entryId = record.conversation_entry_id || record.extras?.conversation_entry_id || null;
  const primaryText = (record.user_text || '').trim();
  let targetIndex = -1;
  if (entryId) {
    targetIndex = entries.findIndex((entry) => entry.entryId === entryId);
  }
  if (targetIndex === -1 && primaryText) {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if ((entries[i].text || '').trim() === primaryText) {
        targetIndex = i;
        break;
      }
    }
  }
  if (targetIndex === -1) {
    return [];
  }
  const suggestions = [];
  const beforeStart = Math.max(0, targetIndex - beforeCount);
  for (let i = beforeStart; i < targetIndex; i += 1) {
    suggestions.push(entries[i].text);
  }
  const afterEnd = Math.min(entries.length, targetIndex + afterCount + 1);
  for (let i = targetIndex + 1; i < afterEnd; i += 1) {
    suggestions.push(entries[i].text);
  }
  return suggestions;
}

function buildRelatedPromptSuggestions(beforeCount = 5, afterCount = 5) {
  if (!state.selectedPrompt) return [];
  let combined = [
    ...getNearbyHistoryPrompts(state.selectedPrompt, beforeCount, afterCount),
    ...getNearbyChatPrompts(state.selectedPrompt, beforeCount, afterCount),
    ...getPendingNeighborPrompts(state.selectedPrompt, beforeCount, afterCount),
  ];
  if (!combined.length) {
    combined = getRecentUserPrompts(beforeCount + afterCount);
  }
  const existing = new Set((state.selectedPrompt.related_prompts || []).map((prompt) => prompt.trim()));
  const primary = (state.selectedPrompt.user_text || '').trim();
  const seen = new Set();
  const suggestions = [];
  combined.forEach((prompt) => {
    const text = (prompt || '').trim();
    if (!text || text === primary) {
      return;
    }
    if (existing.has(text) || seen.has(text)) {
      return;
    }
    seen.add(text);
    suggestions.push(text);
  });
  return suggestions;
}

function getProbeMatches(record) {
  if (!record || !record.extras) return [];
  const probe = record.extras.keyword_probe;
  if (!probe || !Array.isArray(probe.matches)) {
    return [];
  }
  return probe.matches
    .map((match) => {
      if (!match || typeof match !== 'object') return null;
      const idValue = (match.id || match.tip_id || match.entry_id || '').toString().trim();
      const titleValue = (match.title || match.name || match.text || '').toString().trim();
      if (!idValue && !titleValue) {
        return null;
      }
      return {
        id: idValue || null,
        title: titleValue || idValue || '',
      };
    })
    .filter((entry) => entry && entry.title);
}

function mergeProbeMatchesIntoState(record, intent, action) {
  const matches = getProbeMatches(record);
  if (!matches.length) {
    return;
  }
  if (supportsIntendedEntities(intent, action) && (!state.intendedEntities || state.intendedEntities.length === 0)) {
    state.intendedEntities = matches.map((entry) => ({ id: entry.id, title: entry.title }));
    if (state.selectedPrompt) {
      state.selectedPrompt.intended_entities = [...state.intendedEntities];
    }
  }
  if (action === 'update' || action === 'delete') {
    const primary = matches[0];
    if (primary) {
      if (primary.id && !state.correctionFields.id) {
        state.correctionFields.id = primary.id;
      }
      if (primary.title && !state.correctionFields.title) {
        state.correctionFields.title = primary.title;
        state.hiddenFields.lookup_title = primary.title;
      }
    }
  }
}

function getPendingNeighborPrompts(record, beforeCount = 5, afterCount = 5) {
  if (!record || !Array.isArray(state.pending) || !state.pending.length) return [];
  const index = state.pending.findIndex((item) => item.prompt_id === record.prompt_id);
  if (index === -1) {
    return [];
  }
  const suggestions = [];
  const primary = (record.user_text || '').trim();
  const seen = new Set();
  const beforeStart = Math.max(0, index - beforeCount);
  for (let i = beforeStart; i < index; i += 1) {
    const text = (state.pending[i]?.user_text || '').trim();
    if (!text || text === primary || seen.has(text)) continue;
    seen.add(text);
    suggestions.push(text);
  }
  const afterEnd = Math.min(state.pending.length, index + afterCount + 1);
  for (let i = index + 1; i < afterEnd; i += 1) {
    const text = (state.pending[i]?.user_text || '').trim();
    if (!text || text === primary || seen.has(text)) continue;
    seen.add(text);
    suggestions.push(text);
  }
  return suggestions;
}

function addRelatedPrompt(promptText) {
  if (!state.selectedPrompt) return;
  const text = (promptText || '').trim();
  if (!text) return;
  const prompts = state.selectedPrompt.related_prompts || [];
  if (prompts.includes(text)) return;
  prompts.push(text);
  state.selectedPrompt.related_prompts = prompts;
  renderRelatedPrompts();
}

function removeRelatedPrompt(index) {
  if (!state.selectedPrompt) return;
  const prompts = state.selectedPrompt.related_prompts || [];
  if (index < 0 || index >= prompts.length) return;
  prompts.splice(index, 1);
  state.selectedPrompt.related_prompts = prompts;
  renderRelatedPrompts();
}

function removePendingEntriesFromState(primaryId, relatedPrompts = []) {
  const normalizedPrompts = new Set(
    (relatedPrompts || [])
      .map((prompt) => (typeof prompt === 'string' ? prompt.trim() : ''))
      .filter(Boolean),
  );
  let removedSelected = false;
  state.pending = state.pending.filter((item) => {
    if (item.prompt_id === primaryId) {
      removedSelected = removedSelected || state.selectedPrompt?.prompt_id === primaryId;
      return false;
    }
    const text = (item.user_text || '').trim();
    if (normalizedPrompts.has(text)) {
      removedSelected = removedSelected || state.selectedPrompt?.prompt_id === item.prompt_id;
      return false;
    }
    return true;
  });
  if (removedSelected) {
    resetSelection();
  } else {
    renderPendingList();
  }
}

function addIntendedEntity(entity) {
  if (!entity || !entity.title) return;
  state.intendedEntities = state.intendedEntities || [];
  if (state.intendedEntities.find((entry) => entry.id === entity.id && entry.title === entity.title)) {
    return;
  }
  state.intendedEntities.push(entity);
  if (state.selectedPrompt) {
    state.selectedPrompt.intended_entities = [...state.intendedEntities];
  }
  renderIntendedEntities();
}

function removeIntendedEntity(index) {
  if (!state.intendedEntities) return;
  if (index < 0 || index >= state.intendedEntities.length) return;
  state.intendedEntities.splice(index, 1);
  if (state.selectedPrompt) {
    state.selectedPrompt.intended_entities = [...state.intendedEntities];
  }
  renderIntendedEntities();
}

const PRONOUN_TOKENS = new Set(['this', 'that', 'it', 'this one', 'that one', 'this todo', 'that todo']);

function resolvePronounValue(value, record) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const normalized = trimmed.replace(/[?!.,]/g, '').toLowerCase();
  if (!PRONOUN_TOKENS.has(normalized)) {
    return value;
  }
  const prompts = normalizeRelatedPromptsList(record);
  const current = (record.user_text || '').trim();
  for (let i = prompts.length - 1; i >= 0; i--) {
    const candidate = (prompts[i] || '').trim();
    if (!candidate) continue;
    if (current && candidate === current) continue;
    return candidate;
  }
  return value;
}

function applyPronounResolution(fields, record) {
  if (!fields || !record) return fields;
  const intent = record.intent || state.selectedPrompt?.intent || '';
  const reconciled = { ...fields };
  if (fields.title) {
    const resolvedTitle = resolvePronounValue(fields.title, record);
    if (resolvedTitle !== fields.title && resolvedTitle) {
      const matches = getEntitiesMatchingTitle(intent, resolvedTitle);
      if (matches.length === 1) {
        reconciled.title = resolvedTitle;
        reconciled.__matchedTitle = matches[0];
      } else {
        delete reconciled.title;
      }
    }
  }
  if (reconciled.__matchedTitle) {
    const match = reconciled.__matchedTitle;
    delete reconciled.__matchedTitle;
    reconciled.id = match.value;
    reconciled.lookup_title = match.label;
    state.selectedPrompt = state.selectedPrompt || {};
    state.selectedPrompt.matched_entity = match;
  }
  return reconciled;
}

function getVersionCount(promptId) {
  if (!promptId) return 0;
  return state.corrected.filter((record) => record.id === promptId).length;
}

function formatIntentLabel(intent) {
  return INTENT_LABELS[intent] || intent || 'nlu_fallback';
}

function orderPayloadForDisplay(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload || {};
  }
  const ordered = {};
  DISPLAY_META_FIELDS.forEach((field) => {
    if (field in payload) {
      ordered[field] = payload[field];
    }
  });
  const orderedKeys = new Set([...DISPLAY_META_FIELDS]);
  const restKeys = Object.keys(payload).filter((key) => !orderedKeys.has(key));
  const keyOrder = [...FIELD_ORDER, ...restKeys.sort()];
  keyOrder.forEach((key) => {
    if (key in payload && !orderedKeys.has(key)) {
      ordered[key] = payload[key];
      orderedKeys.add(key);
    }
  });
  return ordered;
}

function getEntityOptions(tool) {
  const config = ENTITY_FIELD_CONFIG[tool];
  if (!config) return [];
  const entities = state.dataStores[config.store] || [];
  return entities
    .filter((entity) => entity && (entity[config.field] || entity.id))
    .map((entity) => ({
      value: String(entity[config.field] || entity.id),
      label: config.label(entity),
      entity,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function loadStoredChatHistory() {
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

function persistChatHistory() {
  try {
    const trimmed = state.chat.slice(-10);
    state.chat = trimmed;
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(trimmed));
  } catch (err) {
    // ignore
  }
}

function loadStoredLatestConfirmed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LATEST_CONFIRMED);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      state.latestConfirmed = parsed;
    }
  } catch (err) {
    // ignore
  }
}

function persistLatestConfirmed() {
  try {
    if (state.latestConfirmed) {
      localStorage.setItem(STORAGE_KEYS.LATEST_CONFIRMED, JSON.stringify(state.latestConfirmed));
    } else {
      localStorage.removeItem(STORAGE_KEYS.LATEST_CONFIRMED);
    }
  } catch (err) {
    // ignore
  }
}

function loadStoredSelection() {
  try {
    const storedPrompt = localStorage.getItem(STORAGE_KEYS.SELECTED_PROMPT);
    if (storedPrompt) {
      state.selectedPromptId = storedPrompt;
    }
  } catch (err) {
    // ignore
  }
}

function getTitleGroups(tool) {
  const options = getEntityOptions(tool);
  const groups = new Map();
  options.forEach((option) => {
    const title = (option.entity?.title || '').trim();
    if (!title) {
      return;
    }
    const norm = title.toLowerCase();
    if (!groups.has(norm)) {
      groups.set(norm, { title, options: [] });
    }
    groups.get(norm).options.push(option);
  });
  return groups;
}

function getTitleOptions(tool) {
  const groups = getTitleGroups(tool);
  return Array.from(groups.values())
    .map(({ title }) => ({ value: title, label: title }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function getEntitiesMatchingTitle(tool, title) {
  if (!title) return [];
  const groups = getTitleGroups(tool);
  const entry = groups.get(title.trim().toLowerCase());
  return entry ? entry.options : [];
}

function autoSelectIdForTitle(tool, title) {
  const matches = getEntitiesMatchingTitle(tool, title);
  if (matches.length === 1) {
    state.correctionFields.id = matches[0].value;
  } else {
    delete state.correctionFields.id;
  }
  return matches.length;
}

function applyHydratedFields(fields) {
  Object.entries(fields || {}).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    if (value === null || value === '') {
      delete state.correctionFields[key];
    } else if (Array.isArray(value)) {
      const parts = value.map((item) => String(item).trim()).filter(Boolean);
      state.correctionFields[key] = key === 'content' ? parts.join('\n') : parts.join(', ');
    } else {
      state.correctionFields[key] = String(value);
    }
  });
}

function fieldHasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return true;
}

function applyFieldLayout(wrapper, intent, action, key) {
  if (!wrapper) {
    return;
  }
  if (intent === 'calendar_edit') {
    const timelineAllowed = !['delete', 'find'].includes(action || '');
    if (timelineAllowed) {
      const layout = CALENDAR_FIELD_LAYOUT[key];
      if (layout) {
        wrapper.style.gridColumn = layout.column;
        wrapper.style.gridRow = layout.row;
        return;
      }
    }
  }
  const intentLayout = FIELD_LAYOUTS[intent];
  if (!intentLayout) {
    return;
  }
  const actionLayout = intentLayout.actions?.[action];
  const config = actionLayout?.[key] || intentLayout.default?.[key];
  if (config) {
    wrapper.style.gridColumn = config.column;
    wrapper.style.gridRow = config.row;
  }
}

function ensureDateTimeState(field) {
  if (!state.datetimeInputs[field]) {
    state.datetimeInputs[field] = { dateValue: '', timeValue: '' };
  }
  return state.datetimeInputs[field];
}

function setDateTimePart(field, part, value) {
  const target = ensureDateTimeState(field);
  target[part] = value;
}

function applyDateTimeFieldValue(field, config) {
  const baseDate = getBaseDate();
  const stateValue = ensureDateTimeState(field);
  if (config.mode === 'weather') {
    const dateInfo = parseDateInput(stateValue.dateValue, baseDate);
    const timeInfo = parseTimeInput(stateValue.timeValue);
    const payload = {};
    if (dateInfo.keyword) {
      payload.day = dateInfo.keyword;
    }
    if (dateInfo.iso) {
      payload.date = dateInfo.iso;
    }
    if (timeInfo.time) {
      const [hour, minute] = timeInfo.time.split(':');
      payload.hour = Number(hour);
      payload.minute = Number(minute);
    }
    if (!Object.keys(payload).length && !stateValue.dateValue && !stateValue.timeValue) {
      delete state.correctionFields[field];
      return;
    }
    payload.raw = `${stateValue.dateValue || ''} ${stateValue.timeValue || ''}`.trim();
    state.correctionFields[field] = payload;
    return;
  }
  const dateInfo = parseDateInput(stateValue.dateValue, baseDate);
  if (!dateInfo.iso) {
    delete state.correctionFields[field];
    return;
  }
  if (config.mode === 'date' || !config.includeTime) {
    state.correctionFields[field] = dateInfo.iso;
    return;
  }
  const timeInfo = parseTimeInput(stateValue.timeValue || config.defaultTime);
  const timeValue = timeInfo.time || config.defaultTime;
  state.correctionFields[field] = `${dateInfo.iso}T${timeValue}`;
}

function getBaseDate() {
  const ts = state.selectedPrompt?.timestamp;
  if (!ts) return new Date();
  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatISODate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(date) {
  return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
}

function addDays(date, amount) {
  const clone = new Date(date.getTime());
  clone.setDate(clone.getDate() + amount);
  return clone;
}

function buildRelativeDateOptions(baseDate) {
  const options = [];
  const labels = [
    { label: 'Today', offset: 0, keyword: 'today' },
    { label: 'Tomorrow', offset: 1, keyword: 'tomorrow' },
    { label: 'Yesterday', offset: -1, keyword: 'yesterday' },
  ];
  labels.forEach((entry) => {
    const target = addDays(baseDate, entry.offset);
    options.push({
      label: entry.label,
      iso: formatISODate(target),
      keyword: entry.keyword,
      display: formatDisplayDate(target),
    });
  });
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  weekdays.forEach((dayName) => {
    const target = addDays(baseDate, (7 + weekdays.indexOf(dayName) - baseDate.getDay()) % 7 || 7);
    options.push({
      label: dayName,
      iso: formatISODate(target),
      keyword: dayName.toLowerCase(),
      display: formatDisplayDate(target),
    });
  });
  return options;
}

function buildRelativeTimeOptions(baseDate) {
  const baseTime = baseDate.toTimeString().slice(0, 5);
  return [
    { label: 'Now', time: baseTime, keyword: 'now' },
    { label: 'Morning', time: '09:00', keyword: 'morning' },
    { label: 'Midday', time: '12:00', keyword: 'midday' },
    { label: 'Afternoon', time: '15:00', keyword: 'afternoon' },
    { label: 'Evening', time: '19:00', keyword: 'evening' },
    { label: 'Night', time: '22:00', keyword: 'night' },
  ];
}

function parseDateInput(value, baseDate) {
  if (!value) return { iso: '', keyword: '', display: '' };
  const trimmed = value.trim();
  const options = buildRelativeDateOptions(baseDate);
  const match = options.find((opt) => opt.label.toLowerCase() === trimmed.toLowerCase());
  if (match) {
    return { iso: match.iso, keyword: match.keyword, display: match.display, label: match.label };
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return { iso: trimmed, keyword: '', display: formatDisplayDate(new Date(trimmed)) };
  }
  const shortMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?$/);
  if (shortMatch) {
    const day = shortMatch[1].padStart(2, '0');
    const month = shortMatch[2].padStart(2, '0');
    const year = shortMatch[3] || String(baseDate.getFullYear());
    const iso = `${year}-${month}-${day}`;
    return { iso, keyword: '', display: `${day}/${month}` };
  }
  return { iso: '', keyword: trimmed.toLowerCase(), display: trimmed, label: trimmed };
}

function parseTimeInput(value) {
  if (!value) return { time: '', keyword: '' };
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (match) {
    const hour = match[1].padStart(2, '0');
    const minute = (match[2] || '00').padStart(2, '0');
    return { time: `${hour}:${minute}`, keyword: '' };
  }
  const lower = trimmed.toLowerCase();
  const map = {
    morning: '09:00',
    midday: '12:00',
    afternoon: '15:00',
    evening: '19:00',
    night: '22:00',
  };
  if (map[lower]) {
    return { time: map[lower], keyword: lower };
  }
  if (lower === 'now') {
    const now = new Date();
    return { time: now.toTimeString().slice(0, 5), keyword: 'now' };
  }
  return { time: '', keyword: lower };
}

function hydrateEntitySelection(tool, entityId) {
  const config = ENTITY_FIELD_CONFIG[tool];
  if (!config || !entityId) {
    return;
  }
  const entities = state.dataStores[config.store] || [];
  const target = entities.find((entity) => String(entity[config.field] || entity.id) === entityId);
  if (!target) {
    return;
  }
  const hydrated = config.hydrate(target);
  applyHydratedFields(hydrated);
  if (TITLE_LOOKUP_TOOLS.has(tool)) {
    const lookupValue = hydrated.title || target.title || '';
    if (lookupValue) {
      state.hiddenFields.lookup_title = lookupValue;
    }
  }
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

function renderRelatedPrompts() {
  if (!el.relatedPromptsList) return;
  el.relatedPromptsList.innerHTML = '';
  if (!state.selectedPrompt) {
    if (el.relatedPromptsInput) {
      el.relatedPromptsInput.value = '';
      el.relatedPromptsInput.disabled = true;
    }
    hideRelatedPromptOptions();
    renderIntendedEntities();
    return;
  }
  if (el.relatedPromptsInput) {
    el.relatedPromptsInput.disabled = false;
  }
  const prompts = normalizeRelatedPromptsList(state.selectedPrompt);
  state.selectedPrompt.related_prompts = prompts;
  prompts.forEach((prompt, index) => {
    const li = document.createElement('li');
    li.textContent = prompt;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'prompt-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      removeRelatedPrompt(index);
    });
    li.appendChild(removeBtn);
    el.relatedPromptsList.appendChild(li);
  });
  updateRelatedPromptOptions();
  renderIntendedEntities();
}

function supportsIntendedEntities(intent, action) {
  if (!intent) return false;
  const normalizedAction = normalizeActionName(intent, action);
  if (!normalizedAction) return false;
  return INTENDED_ENTITY_TOOLS.has(intent) && INTENDED_ENTITY_ACTIONS.has(normalizedAction);
}

function renderIntendedEntities() {
  if (!el.intendedEntitiesRow || !el.intendedEntitiesList) return;
  const intent = el.intentSelect?.value || state.selectedPrompt?.intent || '';
  const actionValue = normalizeActionName(intent, el.actionSelect?.value || '');
  const supported = supportsIntendedEntities(intent, actionValue);
  const entities = state.intendedEntities || [];
  if (state.selectedPrompt) {
    state.selectedPrompt.intended_entities = [...entities];
  }
  if (!state.selectedPrompt || !supported) {
    el.intendedEntitiesRow.classList.add('hidden');
    el.intendedEntitiesList.innerHTML = '';
    if (el.entitySearchInput) {
      el.entitySearchInput.value = '';
    }
    hideEntityOptions();
    return;
  }
  el.intendedEntitiesRow.classList.remove('hidden');
  el.intendedEntitiesList.innerHTML = '';
  const seenTitles = new Map();
  entities.forEach((entity, index) => {
    const titleKey = entity.title.toLowerCase();
    seenTitles.set(titleKey, (seenTitles.get(titleKey) || 0) + 1);
  });
  entities.forEach((entity, index) => {
    const li = document.createElement('li');
    const titleKey = entity.title.toLowerCase();
    const label =
      seenTitles.get(titleKey) > 1 && entity.id ? `${entity.title} (#${entity.id})` : entity.title;
    li.textContent = label;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'prompt-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      removeIntendedEntity(index);
    });
    li.appendChild(removeBtn);
    el.intendedEntitiesList.appendChild(li);
  });
  updateEntityOptions();
}

function getEntityOptionsForIntent(intent) {
  if (!intent) return [];
  const options = getEntityOptions(intent) || [];
  return options.map((option) => ({
    id: option.value,
    title: (option.entity?.title || option.label || option.value || '').trim() || option.value,
  }));
}

function updateEntityOptions(filterValue = '') {
  if (!el.entitySearchOptions || !el.entitySearchInput) return;
  hideRelatedPromptOptions();
  const intent = el.intentSelect?.value || state.selectedPrompt?.intent || '';
  const actionValue = normalizeActionName(intent, el.actionSelect?.value || '');
  if (!supportsIntendedEntities(intent, actionValue)) {
    hideEntityOptions();
    return;
  }
  const candidates = getEntityOptionsForIntent(intent);
  if (!candidates.length) {
    hideEntityOptions();
    return;
  }
  const duplicateCounts = new Map();
  candidates.forEach((candidate) => {
    const labelKey = candidate.title.toLowerCase();
    duplicateCounts.set(labelKey, (duplicateCounts.get(labelKey) || 0) + 1);
  });
  const existing = new Set((state.intendedEntities || []).map((entry) => entry.id || entry.title));
  const filter = (filterValue || el.entitySearchInput.value || '').trim().toLowerCase();
  const filtered = candidates.filter((candidate) => {
    if (existing.has(candidate.id || candidate.title)) {
      return false;
    }
    if (!filter) {
      return true;
    }
    return candidate.title.toLowerCase().includes(filter);
  });
  if (!filtered.length) {
    hideEntityOptions();
    return;
  }
  el.entitySearchOptions.innerHTML = '';
  filtered.slice(0, 15).forEach((candidate) => {
    const li = document.createElement('li');
    const labelKey = candidate.title.toLowerCase();
    const needsId = (duplicateCounts.get(labelKey) || 0) > 1 && candidate.id;
    li.textContent = needsId ? `${candidate.title} (#${candidate.id})` : candidate.title;
    li.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      addIntendedEntity(candidate);
      if (el.entitySearchInput) {
        el.entitySearchInput.value = '';
      }
      hideEntityOptions();
    });
    el.entitySearchOptions.appendChild(li);
  });
  el.entitySearchOptions.classList.remove('hidden');
}

function hideEntityOptions() {
  if (el.entitySearchOptions) {
    el.entitySearchOptions.classList.add('hidden');
    el.entitySearchOptions.innerHTML = '';
  }
}

function updateRelatedPromptOptions(filterValue = '') {
  if (!el.relatedPromptsOptions || !el.relatedPromptsInput) return;
  hideEntityOptions();
  if (!state.selectedPrompt) {
    hideRelatedPromptOptions();
    return;
  }
  const suggestions = buildRelatedPromptSuggestions(5, 5);
  const filter = (filterValue || el.relatedPromptsInput.value || '').trim().toLowerCase();
  const filtered = suggestions.filter((prompt) => {
    if (!filter) {
      return true;
    }
    return prompt.toLowerCase().includes(filter);
  });
  if (!filtered.length) {
    hideRelatedPromptOptions();
    return;
  }
  el.relatedPromptsOptions.innerHTML = '';
  filtered.slice(0, 10).forEach((prompt) => {
    const li = document.createElement('li');
    li.textContent = prompt;
    li.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      addRelatedPrompt(prompt);
      if (el.relatedPromptsInput) {
        el.relatedPromptsInput.value = '';
      }
      hideRelatedPromptOptions();
    });
    el.relatedPromptsOptions.appendChild(li);
  });
  el.relatedPromptsOptions.classList.remove('hidden');
}

function hideRelatedPromptOptions() {
  if (el.relatedPromptsOptions) {
    el.relatedPromptsOptions.classList.add('hidden');
    el.relatedPromptsOptions.innerHTML = '';
  }
}

function detachEditorPanel() {
  if (!el.editorPanel) {
    return;
  }
  if (el.editorPanel.parentElement) {
    el.editorPanel.parentElement.removeChild(el.editorPanel);
  }
  el.editorPanel.classList.add('hidden');
}

function attachEditorPanel(slot) {
  if (!el.editorPanel || !slot) return;
  slot.appendChild(el.editorPanel);
  el.editorPanel.classList.remove('hidden');
}

function renderPendingList() {
  if (!el.pendingList) return;
  const previousScroll = el.pendingList.scrollTop || 0;
  el.pendingList.innerHTML = '';
  detachEditorPanel();
  state.pending.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'pending-item';
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
    const slot = document.createElement('div');
    slot.className = 'pending-editor-slot';
    slot.dataset.promptId = item.prompt_id;
    li.appendChild(header);
    const metadataText = buildPendingMetadata(item);
    if (metadataText) {
      const metadata = document.createElement('p');
      metadata.className = 'meta meta-secondary';
      metadata.textContent = metadataText;
      li.appendChild(metadata);
    }
    li.appendChild(payload);
    li.appendChild(slot);
    if (item.prompt_id === state.selectedPromptId) {
      li.classList.add('editing');
      attachEditorPanel(slot);
      renderCorrectionForm();
    }
    li.addEventListener('click', (event) => {
      if (el.editorPanel && el.editorPanel.contains(event.target)) {
        return;
      }
      selectPendingPrompt(item);
    });
    el.pendingList.appendChild(li);
  });
  renderPendingMeta();
  el.pendingList.scrollTop = previousScroll;
}

function renderDateTimeField(field, config, targetGrid = el.dynamicFieldGrid, isRequired = false, intent = null, action = null) {
  const baseDate = getBaseDate();
  const stateValue = ensureDateTimeState(field);
  const rawValue = state.correctionFields[field];
  if (!stateValue.dateValue && rawValue) {
    if (config.mode === 'weather') {
      let parsed = rawValue;
      if (typeof rawValue === 'string') {
        try {
          parsed = JSON.parse(rawValue);
        } catch (err) {
          parsed = { raw: rawValue };
        }
      }
      if (parsed?.day) {
        stateValue.dateValue = parsed.day.replace(/_/g, ' ');
      } else if (parsed?.raw) {
        stateValue.dateValue = parsed.raw;
      }
      if (typeof parsed?.hour === 'number') {
        const hour = String(parsed.hour).padStart(2, '0');
        const minute = typeof parsed?.minute === 'number' ? String(parsed.minute).padStart(2, '0') : '00';
        stateValue.timeValue = `${hour}:${minute}`;
      }
    } else if (typeof rawValue === 'string' && rawValue.includes('T')) {
      const [datePart, timePart] = rawValue.split('T');
      stateValue.dateValue = datePart;
      stateValue.timeValue = timePart?.slice(0, 5) || '';
    } else if (typeof rawValue === 'string') {
      stateValue.dateValue = rawValue;
    } else if (typeof rawValue === 'object') {
      if (rawValue.start || rawValue.date) {
        const iso = rawValue.start || rawValue.date;
        if (iso.includes('T')) {
          const [datePart, timePart] = iso.split('T');
          stateValue.dateValue = datePart;
          stateValue.timeValue = timePart?.slice(0, 5) || '';
        }
      }
    }
  }
  if (!stateValue.dateValue && isRequired) {
    stateValue.dateValue = 'Today';
  }
  if (!stateValue.timeValue && config.includeTime && config.defaultTime && isRequired) {
    stateValue.timeValue = config.defaultTime;
  }

  const trackedWrappers = [];
  const updateRequiredState = () => {
    if (!isRequired) return;
    const hasValue = fieldHasValue(state.correctionFields[field]);
    trackedWrappers
      .filter(Boolean)
      .forEach((wrapper) => wrapper.classList.toggle('field-required', !hasValue));
  };

  const buildDateInput = () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = stateValue.dateValue || '';
    const listId = `${field}-date-options-${state.selectedPromptId || 'global'}`;
    input.setAttribute('list', listId);
    const dataList = document.createElement('datalist');
    dataList.id = listId;
    buildRelativeDateOptions(baseDate).forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.label;
      option.label = `${opt.label} (${opt.display})`;
      dataList.appendChild(option);
    });
    input.addEventListener('focus', () => {
      input.dataset.prevValue = input.value;
      input.value = '';
    });
    input.addEventListener('blur', () => {
      if (!input.value && input.dataset.prevValue) {
        input.value = input.dataset.prevValue;
      }
      delete input.dataset.prevValue;
    });
    input.addEventListener('input', () => {
      stateValue.dateValue = input.value;
      applyDateTimeFieldValue(field, config);
      updateRequiredState();
    });
    const wrapper = document.createElement('div');
    wrapper.className = 'datetime-single';
    wrapper.appendChild(input);
    wrapper.appendChild(dataList);
    return wrapper;
  };

  const buildTimeInput = () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = stateValue.timeValue || '';
    const listId = `${field}-time-options-${state.selectedPromptId || 'global'}`;
    input.setAttribute('list', listId);
    const dataList = document.createElement('datalist');
    dataList.id = listId;
    buildRelativeTimeOptions(baseDate).forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.label;
      option.label = `${opt.label} (${opt.time})`;
      dataList.appendChild(option);
    });
    input.addEventListener('focus', () => {
      input.dataset.prevValue = input.value;
      input.value = '';
    });
    input.addEventListener('blur', () => {
      if (!input.value && input.dataset.prevValue) {
        input.value = input.dataset.prevValue;
      }
      delete input.dataset.prevValue;
    });
    input.addEventListener('input', () => {
      stateValue.timeValue = input.value || (isRequired ? config.defaultTime || '' : '');
      applyDateTimeFieldValue(field, config);
      updateRequiredState();
    });
    const wrapper = document.createElement('div');
    wrapper.className = 'datetime-single';
    wrapper.appendChild(input);
    wrapper.appendChild(dataList);
    return wrapper;
  };

  if (config.split) {
    const dateWrapper = document.createElement('div');
    dateWrapper.className = 'field-wrapper datetime-field';
    dateWrapper.dataset.field = `${field}-date`;
    const dateLabel = document.createElement('span');
    dateLabel.textContent = `${FIELD_LIBRARY[field]?.label || field} Date`;
    dateWrapper.appendChild(dateLabel);
    dateWrapper.appendChild(buildDateInput());
    applyFieldLayout(dateWrapper, intent, action, `${field}-date`);
    targetGrid.appendChild(dateWrapper);
    trackedWrappers.push(dateWrapper);

    let timeWrapper = null;
    if (config.includeTime) {
      timeWrapper = document.createElement('div');
      timeWrapper.className = 'field-wrapper datetime-field';
      timeWrapper.dataset.field = `${field}-time`;
      const timeLabel = document.createElement('span');
      timeLabel.textContent = `${FIELD_LIBRARY[field]?.label || field} Time`;
      timeWrapper.appendChild(timeLabel);
      timeWrapper.appendChild(buildTimeInput());
      applyFieldLayout(timeWrapper, intent, action, `${field}-time`);
      targetGrid.appendChild(timeWrapper);
      trackedWrappers.push(timeWrapper);
    }
    applyDateTimeFieldValue(field, config);
    updateRequiredState();
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'field-wrapper datetime-field';
  wrapper.dataset.field = field;
  const mainLabel = document.createElement('span');
  mainLabel.textContent = FIELD_LIBRARY[field]?.label || field;
  wrapper.appendChild(mainLabel);
  const controls = document.createElement('div');
  controls.className = 'datetime-controls';
  controls.appendChild(buildDateInput());
  if (config.includeTime) {
    controls.appendChild(buildTimeInput());
  }
  wrapper.appendChild(controls);
  applyFieldLayout(wrapper, intent, action, field);
  targetGrid.appendChild(wrapper);
  trackedWrappers.push(wrapper);
  applyDateTimeFieldValue(field, config);
  updateRequiredState();
}

function prepareParserFields(tool, payload) {
  const whitelist = TOOL_FIELD_WHITELIST[tool];
  if (whitelist) {
    const normalized = {};
    whitelist.forEach((path) => {
      let value = payload[path];
      if (value === undefined) {
        const segments = path.split('.');
        if (segments.length > 1) {
          value = payload;
          for (const segment of segments) {
            if (value && typeof value === 'object' && segment in value) {
              value = value[segment];
            } else {
              value = undefined;
              break;
            }
          }
        }
      }
      if (value === undefined || value === null || value === '') {
        return;
      }
      let formatted = '';
      if (tool === 'weather' && path === 'time' && typeof value === 'object') {
        const parts = [];
        if (value.day) parts.push(String(value.day));
        if (value.hour !== undefined) parts.push(`hour ${value.hour}`);
        if (value.minute !== undefined) parts.push(`minute ${value.minute}`);
        if (value.raw) parts.push(String(value.raw));
        formatted = parts.join(' ').trim() || JSON.stringify(value);
      } else {
        formatted = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
      normalized[path.replace(/\./g, '_')] = formatted;
    });
    return { fields: normalized, hidden: {} };
  }
  return canonicalizeParserPayload(payload);
}

function canonicalizeParserPayload(payload) {
  const fields = {};
  const hidden = {};

  const assign = (key, rawValue, options = {}) => {
    const text = formatFieldText(rawValue, options);
    if (!text && text !== '0') {
      return;
    }
    if (options.preferExisting && fields[key]) {
      return;
    }
    if (options.append && fields[key]) {
      fields[key] = `${fields[key]}${options.append}${text}`;
      return;
    }
    fields[key] = text;
  };

  Object.entries(payload || {}).forEach(([key, value]) => {
    if (key === 'action' || key === 'intent') {
      return;
    }
    switch (key) {
      case 'section_id':
      case 'tip_id':
        assign('id', value, { preferExisting: true });
        break;
      case 'target_title':
        if (!fields.title) {
          assign('title', value);
        }
        if (typeof value === 'string' && value.trim() && !hidden.lookup_title) {
          hidden.lookup_title = value.trim();
        }
        break;
      case 'lookup_title':
      case 'title_lookup':
        if (typeof value === 'string' && value.trim()) {
          hidden.lookup_title = value.trim();
        }
        break;
      case 'new_title':
        assign('title', value);
        break;
      case 'body':
      case 'notes':
      case 'notes_append':
        if (!fields.content) {
          assign('content', value, { joinWithNewline: true });
        }
        break;
      case 'content':
        assign('content', value, { joinWithNewline: Array.isArray(value) });
        break;
      case 'tags':
        if (!fields.keywords) {
          assign('keywords', value);
        }
        break;
      case 'query':
        if (!fields.keywords) {
          assign('keywords', value);
        }
        break;
      case 'keywords':
        assign('keywords', value);
        break;
      default:
        assign(key, value);
        break;
    }
  });

  return { fields, hidden };
}

function formatFieldText(value, options = {}) {
  if (value === undefined || value === null) {
    return '';
  }
  if (Array.isArray(value)) {
    const cleaned = value.map((item) => String(item).trim()).filter(Boolean);
    if (!cleaned.length) {
      return '';
    }
    if (options.joinWithNewline) {
      return cleaned.join('\n');
    }
    return cleaned.join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return '';
    }
  }
  const text = String(value);
  return options.preserveSpacing ? text : text.trim();
}

function supportsTitleLookup(tool, action) {
  if (!TITLE_LOOKUP_TOOLS.has(tool)) {
    return false;
  }
  if (!action) {
    return true;
  }
  return TITLE_LOOKUP_ACTIONS.has(action);
}

function computeFieldList(tool, action, payload) {
  const entityField = ENTITY_FIELD_CONFIG[tool]?.field;
  const override = TOOL_ACTION_FIELD_CONFIG[tool]?.[action];
  const overrideFields = override?.fields || [];
  let fields;
  if (override) {
    fields = [...overrideFields];
  } else {
    const keys = new Set();
    Object.keys(payload || {}).forEach((key) => keys.add(key));
    (TOOL_EXTRA_FIELDS[tool] || []).forEach((key) => keys.add(key));
    (TOOL_REQUIRED_FIELDS[tool] || []).forEach((key) => keys.add(key));
    (TOOL_FIELD_WHITELIST[tool] || []).forEach((path) => keys.add(path.replace(/\./g, '_')));
    if (entityField) {
      keys.add(entityField);
    }
    const ordered = FIELD_ORDER.filter((field) => keys.has(field));
    const extras = [...keys].filter((field) => !FIELD_ORDER.includes(field));
    fields = [...ordered, ...extras];
  }
  const shouldIncludeEntityField = Boolean(
    entityField && (!override || overrideFields.includes(entityField)),
  );
  if (entityField) {
    if (shouldIncludeEntityField && !fields.includes(entityField)) {
      fields = [entityField, ...fields];
    } else if (!shouldIncludeEntityField) {
      fields = fields.filter((field) => field !== entityField);
    }
  }
  const seen = new Set();
  return fields.filter((field) => {
    if (seen.has(field)) {
      return false;
    }
    seen.add(field);
    return true;
  });
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
  if (tool === 'app_guide' && action !== 'create') {
    return false;
  }
  return true;
}

function renderDynamicFields(tool, action) {
  if (!el.dynamicFieldGrid) return;
  const normalizedAction = normalizeActionName(tool, action);
  const targetGrid = el.dynamicFieldGrid;
  targetGrid.innerHTML = '';
  targetGrid.classList.toggle('calendar-layout', tool === 'calendar_edit');
  const requiresActionFirst = !!TOOL_ACTION_FIELD_CONFIG[tool];
  if (!tool || !state.selectedPrompt) {
    return;
  }
  if (requiresActionFirst && !normalizedAction) {
    targetGrid.innerHTML = '<p class="hint">Select an action to edit fields.</p>';
    return;
  }
  const fields = computeFieldList(tool, normalizedAction, state.correctionFields);
  if (!fields.length) {
    targetGrid.innerHTML = '<p class="hint">No fields available for this action.</p>';
    return;
  }
  if (tool === 'calendar_edit') {
    const order = ['title', 'start', 'end', 'link', 'location', 'start_time', 'end_time', 'id', 'notes'];
    const orderIndex = (value) => {
      const idx = order.indexOf(value);
      if (idx === -1) {
        const fallback = FIELD_ORDER.indexOf(value);
        return order.length + (fallback === -1 ? order.length : fallback);
      }
      return idx;
    };
    fields.sort((a, b) => orderIndex(a) - orderIndex(b));
  }
  fields.forEach((field) => {
    const config = FIELD_LIBRARY[field] || { label: field };
    const required = isFieldRequired(tool, normalizedAction, field);
    const dateTimeConfig = DATE_TIME_FIELD_CONFIG[field];
    if (dateTimeConfig) {
      renderDateTimeField(field, dateTimeConfig, targetGrid, required, tool, normalizedAction);
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'field-wrapper';
    wrapper.dataset.field = field;
    const currentVersion = state.fieldVersions?.[field];
    if (currentVersion) {
      wrapper.dataset.version = currentVersion;
    } else if (wrapper.dataset) {
      delete wrapper.dataset.version;
    }
    if (field === 'content') {
      wrapper.classList.add('field-wrapper--full');
    }
    const label = document.createElement('span');
    label.textContent = config.label || field;
    wrapper.appendChild(label);
    if (required && !fieldHasValue(state.correctionFields[field])) {
      wrapper.classList.add('field-required');
    }
    const entityConfig = ENTITY_FIELD_CONFIG[tool];
    const isEntityField = entityConfig && entityConfig.field === field;
    const shouldUseTitleDropdown =
      TITLE_SELECT_TOOLS.has(tool) && TITLE_SELECT_ACTIONS.has(normalizedAction) && field === 'title';
    if (shouldUseTitleDropdown) {
      const select = document.createElement('select');
      const placeholderOption = document.createElement('option');
      placeholderOption.value = '';
      placeholderOption.textContent = 'Choose title';
      select.appendChild(placeholderOption);
      const options = getTitleOptions(tool);
      const currentValue = state.correctionFields[field] || state.hiddenFields.lookup_title || '';
      let hasCurrent = false;
      options.forEach(({ value, label: optionLabel }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = optionLabel;
        if (value === currentValue) {
          option.selected = true;
          hasCurrent = true;
        }
        select.appendChild(option);
      });
      if (currentValue && !hasCurrent) {
        const option = document.createElement('option');
        option.value = currentValue;
        option.textContent = currentValue;
        option.selected = true;
        select.appendChild(option);
      }
      select.addEventListener('change', (event) => {
        const value = event.target.value;
        if (value) {
          state.correctionFields[field] = value;
          state.hiddenFields.lookup_title = value;
          autoSelectIdForTitle(tool, value);
        } else {
          delete state.correctionFields[field];
          delete state.hiddenFields.lookup_title;
          delete state.correctionFields.id;
        }
        flagReviewerChange(field);
        renderDynamicFields(tool, normalizedAction);
        updateCorrectButtonState();
      });
      wrapper.appendChild(select);
      applyFieldLayout(wrapper, tool, normalizedAction, field);
      targetGrid.appendChild(wrapper);
      return;
    }
    if (isEntityField) {
      const select = document.createElement('select');
      const placeholderOption = document.createElement('option');
      placeholderOption.value = '';
      placeholderOption.textContent = 'Choose entry';
      select.appendChild(placeholderOption);
      let options = getEntityOptions(tool);
      const titleFilter =
        TITLE_SELECT_TOOLS.has(tool) && TITLE_SELECT_ACTIONS.has(normalizedAction)
          ? (state.correctionFields.title || state.hiddenFields.lookup_title || '').trim()
          : '';
      if (titleFilter) {
        const matches = getEntitiesMatchingTitle(tool, titleFilter);
        if (matches.length) {
          options = matches;
        }
      }
      const currentValue = state.correctionFields[field] || '';
      let hasCurrent = false;
      options.forEach(({ value, label: optionLabel }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = optionLabel;
        if (value === currentValue) {
          option.selected = true;
          hasCurrent = true;
        }
        select.appendChild(option);
      });
      if (currentValue && !hasCurrent) {
        const option = document.createElement('option');
        option.value = currentValue;
        option.textContent = currentValue;
        option.selected = true;
        select.appendChild(option);
      }
      select.addEventListener('change', (event) => {
        const value = event.target.value;
        if (value) {
          state.correctionFields[field] = value;
          hydrateEntitySelection(tool, value);
          renderDynamicFields(tool, normalizedAction);
        } else {
          delete state.correctionFields[field];
        }
        flagReviewerChange(field);
        updateCorrectButtonState();
      });
      wrapper.appendChild(select);
      applyFieldLayout(wrapper, tool, normalizedAction, field);
      targetGrid.appendChild(wrapper);
      return;
    }

    const control =
      config.control?.() ||
      (config.type === 'textarea' ? document.createElement('textarea') : document.createElement('input'));
    control.value = state.correctionFields[field] ?? '';
    control.addEventListener('input', (event) => {
      state.correctionFields[field] = event.target.value;
      flagReviewerChange(field);
      updateCorrectButtonState();
      if (isFieldRequired(tool, normalizedAction, field)) {
        if (event.target.value.trim()) {
          wrapper.classList.remove('field-required');
        } else {
          wrapper.classList.add('field-required');
        }
      }
    });
    wrapper.appendChild(control);
    applyFieldLayout(wrapper, tool, normalizedAction, field);
    targetGrid.appendChild(wrapper);
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
      el.correctButton.textContent = 'Correct';
    }
    return;
  }
  const reviewerIntent = el.intentSelect?.value || '';
  const action = el.actionSelect?.value || '';
  const tool = reviewerIntent || state.selectedPrompt.intent;
  const requiredFields = (TOOL_REQUIRED_FIELDS[tool] || []).filter((field) =>
    isFieldRequired(tool, action, field),
  );
  const missingField = requiredFields.some((field) => !fieldHasValue(state.correctionFields[field]));
  const needsAction = getActionsForIntent(tool).length > 0;
  const ready = Boolean(reviewerIntent && (!needsAction || action) && !missingField);
  el.correctButton.disabled = !ready;
  const actionKey = action.trim().toLowerCase();
  el.correctButton.textContent = MUTATING_ACTIONS.has(actionKey) ? 'Trigger' : 'Correct';
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
  renderRelatedPrompts();
  if (!state.selectedPrompt) {
    detachEditorPanel();
    el.intentSelect.selectedIndex = -1;
    el.intentSelect.disabled = true;
    el.actionSelect.disabled = true;
    el.actionSelect.innerHTML = '';
    if (el.selectedPromptText) {
      el.selectedPromptText.textContent = '';
    }
    if (el.selectedReason) {
      el.selectedReason.textContent = '';
    }
    el.dynamicFieldGrid.innerHTML = '<p class="hint">Select a pending intent to edit tool fields.</p>';
    el.versionHistory.innerHTML = '<p class="hint">Version history is empty.</p>';
    updateCorrectButtonState();
    return;
  }
  el.intentSelect.disabled = false;
  el.actionSelect.disabled = false;
  const titleText =
    state.selectedPrompt.user_text && state.selectedPrompt.user_text.trim()
      ? state.selectedPrompt.user_text
      : '—';
  if (el.selectedPromptText) {
    el.selectedPromptText.textContent = titleText;
  }
  if (el.selectedReason) {
    el.selectedReason.textContent = `Reason: ${state.selectedPrompt.reason || 'review'}`;
  }
  const reviewerIntent = state.selectedPrompt.intent || '';
  el.intentSelect.value = reviewerIntent;
  const predicted = state.selectedPrompt.predicted_payload_raw || {};
  const normalizedAction = normalizeActionName(reviewerIntent, predicted.action);
  if (normalizedAction !== predicted.action) {
    predicted.action = normalizedAction;
    state.selectedPrompt.predicted_payload_raw = predicted;
  }
  updateActionSelectOptions(reviewerIntent, normalizedAction);
  if (el.actionSelect) {
    el.actionSelect.value = normalizedAction || el.actionSelect.value || '';
  }
  const actionValue = el.actionSelect?.value || '';
  renderDynamicFields(reviewerIntent, actionValue);
  renderVersionHistory();
  updateCorrectButtonState();
}

function selectPendingPrompt(item) {
  state.selectedPromptId = item.prompt_id;
  try {
    localStorage.setItem(STORAGE_KEYS.SELECTED_PROMPT, item.prompt_id);
  } catch (err) {
    // ignore
  }
  const predicted = item.predicted_payload || item.parser_payload || {};
  const routerIntent = predicted.intent || item.tool_name || null;
  const resolvedIntent =
    (item.intent && item.intent !== 'nlu_fallback' ? item.intent : null) || routerIntent || 'nlu_fallback';
  if (routerIntent && !predicted.intent) {
    predicted.intent = routerIntent;
  }
  const normalizedAction = normalizeActionName(resolvedIntent, predicted.action);
  if (normalizedAction && normalizedAction !== predicted.action) {
    predicted.action = normalizedAction;
  }
  const prepared = prepareParserFields(resolvedIntent, predicted);
  prepared.fields = applyPronounResolution(prepared.fields, item);
  const relatedPrompts = normalizeRelatedPromptsList(item);
  const intendedEntities = normalizeIntendedEntities(item);
  const fieldVersions = { ...(item.field_versions || {}) };
  state.selectedPrompt = {
    ...item,
    intent: resolvedIntent,
    predicted_payload_raw: predicted,
    related_prompts: relatedPrompts,
    intended_entities: intendedEntities,
    field_versions: fieldVersions,
  };
  state.datetimeInputs = {};
  state.correctionFields = prepared.fields;
  state.hiddenFields = prepared.hidden || {};
  state.fieldVersions = { ...fieldVersions };
  state.intendedEntities = intendedEntities;
  mergeProbeMatchesIntoState(state.selectedPrompt, resolvedIntent, normalizedAction);
  if (state.selectedPrompt?.matched_entity) {
    const match = state.selectedPrompt.matched_entity;
    state.correctionFields.id = match.value;
    state.hiddenFields.lookup_title = match.label;
    delete state.selectedPrompt.matched_entity;
  } else if (state.correctionFields.title && TITLE_LOOKUP_TOOLS.has(resolvedIntent)) {
    autoSelectIdForTitle(resolvedIntent, state.correctionFields.title);
  }
  renderPendingList();
  renderCorrectionForm();
}

function resetSelection() {
  state.selectedPromptId = null;
  state.selectedPrompt = null;
  state.correctionFields = {};
  state.hiddenFields = {};
  state.fieldVersions = {};
  state.intendedEntities = [];
  renderCorrectionForm();
  renderPendingList();
  try {
    localStorage.removeItem(STORAGE_KEYS.SELECTED_PROMPT);
  } catch (err) {
    // ignore
  }
  renderRelatedPrompts();
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
  const hiddenFields = { ...(state.hiddenFields || {}) };
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
  if (supportsTitleLookup(reviewerIntent, action) && !correctedPayload.id) {
    const titleValue = state.correctionFields.title;
    if (typeof titleValue === 'string' && titleValue.trim() && !hiddenFields.lookup_title) {
      hiddenFields.lookup_title = titleValue.trim();
    }
  }
  Object.entries(hiddenFields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && !correctedPayload[key]) {
      correctedPayload[key] = value;
    }
  });
  correctedPayload.intent = reviewerIntent;
  return {
    prompt_id: state.selectedPrompt.prompt_id,
    prompt_text: state.selectedPrompt.user_text,
    tool: reviewerIntent,
    parser_intent: state.selectedPrompt.intent,
    reviewer_intent: reviewerIntent,
    action,
    predicted_payload: state.selectedPrompt.predicted_payload_raw || {},
    corrected_payload: {
      ...correctedPayload,
      related_prompts: [...(state.selectedPrompt.related_prompts || [])],
      intended_entities: supportsIntendedEntities(reviewerIntent, action)
        ? [...(state.intendedEntities || [])]
        : [],
    },
  };
}

function addPendingRecord(record) {
  if (!record || !record.prompt_id) {
    return;
  }
  const normalized = normalizePendingRecord(record);
  const exists = state.pending.findIndex((item) => item.prompt_id === record.prompt_id);
  if (exists >= 0) {
    state.pending[exists] = normalized;
  } else {
    state.pending.unshift(normalized);
  }
  state.pending = sortPendingByRecency(state.pending);
  if (state.selectedPrompt?.prompt_id === normalized.prompt_id) {
    const preservedIntended = (state.intendedEntities || []).map((entry) => ({ ...entry }));
    const normalizedIntended = normalizeIntendedEntities(normalized);
    const preserveIntended = !areIntendedListsEqual(preservedIntended, normalizedIntended);
    const preservedPrompts = [...(state.selectedPrompt.related_prompts || [])];
    const normalizedPrompts = normalizeRelatedPromptsList(normalized);
    const preserveRelated = !arePromptListsEqual(preservedPrompts, normalizedPrompts);
    state.selectedPrompt = { ...normalized, predicted_payload_raw: state.selectedPrompt.predicted_payload_raw };
    state.selectedPrompt.related_prompts = preserveRelated ? preservedPrompts : normalizedPrompts;
    state.selectedPrompt.intended_entities = preserveIntended ? preservedIntended : normalizedIntended;
    state.intendedEntities = preserveIntended ? preservedIntended : normalizedIntended;
    state.fieldVersions = { ...(state.selectedPrompt.field_versions || {}) };
    renderCorrectionForm();
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
    removePendingEntriesFromState(payload.prompt_id, payload.corrected_payload?.related_prompts || []);
    state.latestConfirmed = response.record;
    persistLatestConfirmed();
    renderLatestConfirmed();
    showToast('Action triggered');
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
    showToast('Pending intent deleted');
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
    deleteBtn.textContent = 'Delete';
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
    if (tip.content) {
      const body = document.createElement('p');
      body.textContent = tip.content;
      li.appendChild(body);
    }
    if (Array.isArray(tip.keywords) && tip.keywords.length) {
      const keywords = document.createElement('p');
      keywords.className = 'meta';
      keywords.textContent = `Keywords: ${tip.keywords.join(', ')}`;
      li.appendChild(keywords);
    }
    if (tip.link) {
      const link = document.createElement('a');
      link.href = tip.link;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'View tip';
      li.appendChild(link);
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
    title.textContent = `${entry.id || 'section'}: ${entry.title || 'Untitled'}`;
    li.appendChild(title);
    if (entry.content) {
      const body = document.createElement('p');
      body.textContent = entry.content.slice(0, 160) + (entry.content.length > 160 ? '…' : '');
      li.appendChild(body);
    }
    if (Array.isArray(entry.keywords) && entry.keywords.length) {
      const keywords = document.createElement('p');
      keywords.className = 'meta';
      keywords.textContent = `Keywords: ${entry.keywords.join(', ')}`;
      li.appendChild(keywords);
    }
    if (entry.link) {
      const link = document.createElement('a');
      link.href = entry.link;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'Open link';
      li.appendChild(link);
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
  renderIntendedEntities();
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
    state.intentActions = sanitizeIntentActions(data.actions || {});
    populateIntentOptions();
  } catch (err) {
    console.warn('Failed to load intents', err);
  }
}

async function loadPending(preserveSelection = false) {
  let previousId = preserveSelection ? state.selectedPromptId : null;
  if (!previousId && preserveSelection) {
    try {
      previousId = localStorage.getItem(STORAGE_KEYS.SELECTED_PROMPT);
    } catch (err) {
      previousId = null;
    }
  }
  const params = new URLSearchParams({ limit: state.pendingLimit, page: state.pendingPage });
  const data = await fetchJSON(`/api/logs/pending?${params.toString()}`);
  const normalizedItems = (data.items || []).map((item) => normalizePendingRecord(item));
  state.pending = sortPendingByRecency(normalizedItems);
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
      const currentHidden = { ...state.hiddenFields };
      const currentFieldVersions = { ...state.fieldVersions };
      const currentIntended = (state.intendedEntities || []).map((entry) => ({ ...entry }));
      const currentRelated = [...(state.selectedPrompt?.related_prompts || [])];
      const preserveUserFields = Object.keys(currentFields).length > 0;
      const preserveHiddenFields = Object.keys(currentHidden).length > 0;
      const pendingRelated = normalizeRelatedPromptsList(existing);
      const preserveRelated = !arePromptListsEqual(currentRelated, pendingRelated);
      const previousPayload =
        state.selectedPrompt?.predicted_payload_raw || existing.predicted_payload || existing.parser_payload || {};
      const prepared = prepareParserFields(currentIntent, previousPayload);
      state.selectedPrompt = {
        ...existing,
        intent: currentIntent,
        predicted_payload_raw: { ...previousPayload },
        related_prompts: pendingRelated,
        intended_entities: normalizeIntendedEntities(existing),
        field_versions: existing.field_versions || {},
      };
      if (currentAction) {
        state.selectedPrompt.predicted_payload_raw.action = currentAction;
      }
      if (preserveUserFields) {
        state.correctionFields = currentFields;
      } else {
        state.correctionFields = prepared.fields;
        state.datetimeInputs = {};
      }
      state.hiddenFields = preserveHiddenFields ? currentHidden : prepared.hidden || {};
      const hasReviewerVersions = Object.keys(currentFieldVersions).length > 0;
      state.fieldVersions = hasReviewerVersions ? currentFieldVersions : { ...(state.selectedPrompt.field_versions || {}) };
      state.selectedPrompt.field_versions = { ...state.fieldVersions };
      const pendingIntended = normalizeIntendedEntities(existing);
      const preserveIntended = !areIntendedListsEqual(currentIntended, pendingIntended);
      state.intendedEntities = preserveIntended ? currentIntended : pendingIntended;
      state.selectedPrompt.intended_entities = [...state.intendedEntities];
      state.selectedPrompt.related_prompts = preserveRelated ? currentRelated : pendingRelated;
      renderPendingList();
      renderCorrectionForm();
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_PROMPT);
    } catch (err) {
      // ignore
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
    state.pending = sortPendingByRecency(data.pending_sample.map((record) => normalizePendingRecord(record)));
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
    const userEntry = { role: 'user', text: message, entryId: null };
    state.chat.push(userEntry);
    state.pendingChatEntry = userEntry;
    persistChatHistory();
    renderChat();
    if (state.selectedPrompt) {
      updateRelatedPromptOptions();
    }
    el.chatInput.value = '';
    setChatStatus('Running…');
    try {
      const reply = await fetchJSON('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
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
      if (state.selectedPrompt) {
        updateRelatedPromptOptions();
      }
      if (reply.pending_record) {
        addPendingRecord(reply.pending_record);
      }
      await Promise.all([loadPending(true), refreshActiveDataTab()]);
    } catch (err) {
      showToast(err.message || 'Chat failed', 'error');
      state.pendingChatEntry = null;
    } finally {
      setChatStatus('Ready');
    }
  });

  el.intentSelect?.addEventListener('change', () => {
    const intentValue = el.intentSelect.value || 'nlu_fallback';
    updateActionSelectOptions(intentValue, '');
    if (state.selectedPrompt) {
      state.selectedPrompt.intent = intentValue;
    }
    renderDynamicFields(intentValue, el.actionSelect?.value || '');
    renderIntendedEntities();
    updateCorrectButtonState();
  });

  el.actionSelect?.addEventListener('change', () => {
    if (state.selectedPrompt) {
      const payload = state.selectedPrompt.predicted_payload_raw || {};
      payload.action = el.actionSelect.value;
      state.selectedPrompt.predicted_payload_raw = payload;
    }
    renderDynamicFields(el.intentSelect?.value, el.actionSelect.value);
    renderIntendedEntities();
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
    const keywords = (formData.get('keywords') || '')
      .toString()
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    await mutateStore('kitchen_tips', {
      action: 'create',
      title: formData.get('title'),
      content: formData.get('content'),
      keywords,
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
    const id = (formData.get('id') || '').toString().trim();
    const keywords = (formData.get('keywords') || '')
      .toString()
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const existing = state.dataStores.app_guide.some((entry) => entry.id === id);
    await mutateStore('app_guide', {
      action: existing ? 'update' : 'create',
      id,
      title: formData.get('title'),
      content: formData.get('content'),
      keywords,
      link: formData.get('link') || undefined,
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

  el.entitySearchInput?.addEventListener('focus', () => {
    updateEntityOptions(el.entitySearchInput.value);
  });
  el.entitySearchInput?.addEventListener('input', () => {
    updateEntityOptions(el.entitySearchInput.value);
  });
  el.relatedPromptsInput?.addEventListener('focus', () => {
    updateRelatedPromptOptions(el.relatedPromptsInput.value);
  });
  el.relatedPromptsInput?.addEventListener('input', () => {
    updateRelatedPromptOptions(el.relatedPromptsInput.value);
  });
  document.addEventListener('click', (event) => {
    if (
      event.target === el.entitySearchInput ||
      el.entitySearchOptions?.contains(event.target) ||
      event.target === el.relatedPromptsInput ||
      el.relatedPromptsOptions?.contains(event.target)
    ) {
      return;
    }
    hideEntityOptions();
    hideRelatedPromptOptions();
  });

}

async function bootstrap() {
  wireEvents();
  setChatStatus('Ready');
  window.scrollTo(0, 0);
  loadStoredChatHistory();
  loadStoredLatestConfirmed();
  loadStoredSelection();
  renderChat();
  renderLatestConfirmed();
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
  await Promise.all([loadStats(), loadPending(true), loadClassifier(), loadCorrected(), refreshStores()]);
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
  nlu_fallback: 'LLM fallback',
};

const TOOL_FIELD_WHITELIST = {
  weather: ['city', 'time'],
  news: ['topic', 'language'],
};
function renderPayloadPreview(payload, listSelector) {
  const list = document.querySelector(listSelector);
  if (!list) return payload;
  const copy = JSON.parse(JSON.stringify(payload || {}));
  copy.related_prompts = Array.isArray(copy.related_prompts)
    ? copy.related_prompts.map((prompt) => ({ text: prompt, id: crypto.randomUUID() }))
    : [];
  return copy;
}
