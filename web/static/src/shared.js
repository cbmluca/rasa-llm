// Shared configuration and state for the Tier-5 dashboard.
// WHAT: Define constants, global references, and the in-memory state used across modules.
// WHY: Keeps the document model centralized so feature modules can consume a consistent view of DOM refs and storage keys.
// HOW: Export the constants/state as named bindings for other modules to import.
export const POLL_INTERVAL_MS = 15000;
export const DEFAULT_INTENT_ACTIONS = {
  todo_list: ['list', 'find', 'create', 'update', 'delete'],
  kitchen_tips: ['list', 'find', 'create', 'update', 'delete'],
  calendar_edit: ['list', 'find', 'create', 'update', 'delete'],
  app_guide: ['list', 'find', 'create', 'update', 'delete'],
};

export const ACTION_ALIASES = {
  kitchen_tips: { search: 'find', get: 'find' },
  app_guide: { get: 'find', upsert: 'update', search: 'find' },
};

export const FIELD_ORDER = [
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

export const DISPLAY_META_FIELDS = ['intent', 'action', 'domain'];

export const FIELD_LIBRARY = {
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

export function getFieldLabel(tool, field) {
  if (tool === 'app_guide' && field === 'title') {
    return 'Section';
  }
  return FIELD_LIBRARY[field]?.label || field;
}

export const TOOL_REQUIRED_FIELDS = {
  todo_list: ['title'],
  calendar_edit: ['title'],
  kitchen_tips: ['title', 'content'],
  app_guide: ['title', 'content'],
};

export const TOOL_EXTRA_FIELDS = {
  calendar_edit: ['location', 'content'],
  todo_list: ['content', 'deadline', 'priority', 'link'],
  kitchen_tips: ['keywords', 'link'],
  app_guide: ['keywords', 'link'],
};

export const TITLE_LOOKUP_TOOLS = new Set(['todo_list', 'kitchen_tips', 'calendar_edit', 'app_guide']);
export const INTENDED_ENTITY_TOOLS = new Set(['todo_list', 'kitchen_tips', 'calendar_edit', 'app_guide']);
export const INTENDED_ENTITY_ACTIONS = new Set(['find', 'list']);
export const TITLE_LOOKUP_ACTIONS = new Set(['update', 'delete']);
export const TITLE_SELECT_TOOLS = new Set(['todo_list', 'kitchen_tips', 'calendar_edit', 'app_guide']);
export const TITLE_SELECT_ACTIONS = new Set(['update', 'delete']);

export const TOOL_ACTION_FIELD_CONFIG = {
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
    create: { fields: ['title', 'start', 'end', 'location', 'content', 'link'], required: ['title'] },
    delete: { fields: ['id', 'title'], required: ['id'] },
    update: { fields: ['id', 'title', 'start', 'end', 'location', 'content', 'link'], required: ['id'] },
  },
  app_guide: {
    list: { fields: [], required: [] },
    find: { fields: ['keywords'], required: ['keywords'] },
    create: { fields: ['title', 'content', 'keywords', 'link'], required: ['title', 'content'] },
    update: { fields: ['id', 'title', 'content', 'keywords', 'link'], required: ['id'] },
    delete: { fields: ['id', 'title'], required: ['id'] },
  },
};

export const MUTATING_ACTIONS = new Set(['create', 'update', 'delete']);

export const ENTITY_FIELD_CONFIG = {
  todo_list: {
    field: 'id',
    store: 'todos',
    label: (entity) => `${entity.title || 'Untitled'} (#${entity.id})`,
    hydrate: (entity) => ({
      id: entity.id,
      title: entity.title || '',
      status: entity.status || '',
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

export const DATE_TIME_FIELD_CONFIG = {
  time: { mode: 'weather', includeTime: true, defaultTime: '13:00' },
  start: { mode: 'iso', includeTime: true, defaultTime: '09:00', split: true },
  end: { mode: 'iso', includeTime: true, defaultTime: '10:00', split: true },
  deadline: { mode: 'date', includeTime: false },
};

export const CALENDAR_FIELD_LAYOUT = {
  title: { column: '1', row: '1' },
  'start-date': { column: '2', row: '1' },
  'end-date': { column: '3', row: '1' },
  link: { column: '4', row: '1' },
  location: { column: '4', row: '2' },
  'start-time': { column: '2', row: '2' },
  'end-time': { column: '3', row: '2' },
  id: { column: '1', row: '2' },
};

export const FIELD_LAYOUTS = {
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

export function createTodoFormState(action) {
  return {
    action,
    values: {},
    display: {},
  };
}

export function createCalendarFormState(action) {
  return {
    action,
    values: {},
    display: {},
    datetime: {},
  };
}

export function createKitchenFormState(action) {
  return {
    action,
    values: {},
  };
}

export function slugifySectionLabel(text = '') {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function humanizeSectionId(value = '') {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function formatNotesSectionHeading(entry = {}) {
  const rawId = String(entry.id || '').trim();
  const rawTitle = String(entry.title || '').trim();
  const slugLower = rawId.toLowerCase();
  let displayTitle = rawTitle;
  if (!displayTitle && rawId) {
    displayTitle = humanizeSectionId(rawId);
  } else if (displayTitle && rawId && slugifySectionLabel(displayTitle) === slugLower) {
    displayTitle = humanizeSectionId(rawId);
  }
  if (!displayTitle) {
    displayTitle = 'Untitled section';
  }
  const slugMatchesTitle = rawId && slugifySectionLabel(displayTitle) === slugLower;
  return {
    title: displayTitle,
    slug: slugMatchesTitle ? '' : rawId,
  };
}

export function getNoteSectionTitles(state) {
  const seen = new Set();
  return (state.dataStores?.app_guide || [])
    .map((entry) => {
      const heading = formatNotesSectionHeading(entry);
      const rawTitle = (entry.title || '').trim();
      const optionValue = rawTitle || heading.title;
      if (!optionValue) {
        return null;
      }
      const key = optionValue.toLowerCase();
      if (seen.has(key)) {
        return null;
      }
      seen.add(key);
      if (heading.title && heading.title !== optionValue) {
        return { value: optionValue, label: heading.title };
      }
      return optionValue;
    })
    .filter(Boolean);
}

export const STORAGE_KEYS = {
  ACTIVE_PAGE: 'tier5_active_page',
  PENDING_PAGE: 'tier5_pending_page',
  CHAT_HISTORY: 'tier5_chat_history',
  LATEST_CONFIRMED: 'tier5_latest_confirmed',
  SELECTED_PROMPT: 'tier5_selected_prompt',
  LAST_PURGE_ALERT_SIGNATURE: 'tier5_last_purge_alert_signature',
  LAST_TRAINING_ALERT_COUNT: 'tier5_last_training_alert_count',
  DATA_ACTIVE_TAB: 'tier5_data_active_tab',
  DATA_SELECTED_ROWS: 'tier5_data_selected_rows',
  VOICE_OFFLINE_LOG: 'tier5_voice_offline_attempts',
  CHAT_OFFLINE_QUEUE: 'tier5_chat_offline_queue',
};

export const DATA_STORE_IDS = ['todos', 'calendar', 'kitchen_tips', 'app_guide'];
export const SELECTABLE_DATA_STORES = new Set(['todos', 'calendar', 'kitchen_tips']);
export const VOICE_MIN_DURATION_MS = 5000;
export const VOICE_MAX_DURATION_MS = 15000;
export const VOICE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mpeg'];

export const state = {
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
  notesComboboxes: null,
  pendingChatEntry: null,
  duplicateConfirmations: {},
  dataStores: {
    todos: [],
    calendar: [],
    kitchen_tips: [],
    app_guide: [],
  },
  selectedRows: {
    todos: null,
    calendar: null,
    kitchen_tips: null,
  },
  todoCrud: {
    create: createTodoFormState('create'),
    update: createTodoFormState('update'),
    activeAction: 'create',
  },
  calendarCrud: {
    create: createCalendarFormState('create'),
    update: createCalendarFormState('update'),
    activeAction: 'create',
  },
  kitchenCrud: {
    create: createKitchenFormState('create'),
    update: createKitchenFormState('update'),
    activeAction: 'create',
  },
  todoSort: { column: 'deadline', direction: 'asc' },
  calendarSort: { column: 'end', direction: 'desc' },
  kitchenSort: { column: 'title', direction: 'asc' },
  activeDataTab: 'todos',
  user: null,
  loginError: '',
  adminShowOnlyMine: false,
  loginVisible: false,
  serviceWorkerReady: false,
  offlineChatQueue: [],
  offlineReplayActive: false,
  voice: {
    supported: false,
    mediaRecorder: null,
    recording: false,
    chunks: [],
    mimeType: 'audio/webm',
    mediaError: null,
    stopTimer: null,
    uploading: false,
    startedAt: null,
  },
  voiceInbox: {
    entries: [],
    page: 1,
    limit: 25,
    hasMore: false,
    totalEntries: 0,
    voiceMinutesTotal: 0,
    voiceMinutesToday: 0,
    voiceMinutesBudget: 0,
    voiceMinutesRemaining: 0,
    maxEntries: 0,
  },
  notifications: [],
  initialized: false,
};

export const el = {
  chatLog: document.querySelector('#chat-log'),
  chatForm: document.querySelector('#chat-form'),
  chatInput: document.querySelector('#chat-input'),
  chatStatus: document.querySelector('#chat-status'),
  chatVoiceButton: document.querySelector('#chat-voice-button'),
  voiceStatus: document.querySelector('#voice-status'),
  offlineQueue: document.querySelector('#offline-queue'),
  offlineQueueCount: document.querySelector('#offline-queue-count'),
  offlineQueueRetryBtn: document.querySelector('#offline-queue-retry'),
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
  pendingScopeToggle: document.querySelector('#pending-scope-toggle'),
  pendingScopeBadge: document.querySelector('#pending-scope-badge'),
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
  dataScopeToggle: document.querySelector('#data-scope-toggle'),
  dataScopeBadge: document.querySelector('#data-scope-badge'),
  todosPanel: document.querySelector('#todos-panel'),
  todoCrudGrid: document.querySelector('#todo-crud-grid'),
  todoCrudForm: document.querySelector('#todo-crud-form'),
  todoCrudSubmit: document.querySelector('#todo-crud-submit'),
  todoCrudTitle: document.querySelector('#todo-crud-title'),
  todoCrudReset: document.querySelector('#todo-reset-button'),
  todoSortButtons: document.querySelectorAll('[data-todo-sort]'),
  calendarPanel: document.querySelector('#calendar-panel'),
  calendarSortButtons: document.querySelectorAll('[data-calendar-sort]'),
  calendarCrudForm: document.querySelector('#calendar-crud-form'),
  calendarCrudGrid: document.querySelector('#calendar-crud-grid'),
  calendarCrudSubmit: document.querySelector('#calendar-crud-submit'),
  calendarCrudTitle: document.querySelector('#calendar-crud-title'),
  calendarCrudReset: document.querySelector('#calendar-reset-button'),
  kitchenPanel: document.querySelector('#kitchen-panel'),
  kitchenCrudForm: document.querySelector('#kitchen-crud-form'),
  kitchenCrudGrid: document.querySelector('#kitchen-crud-grid'),
  kitchenCrudSubmit: document.querySelector('#kitchen-crud-submit'),
  kitchenCrudTitle: document.querySelector('#kitchen-crud-title'),
  kitchenCrudReset: document.querySelector('#kitchen-reset-button'),
  kitchenSortButtons: document.querySelectorAll('[data-kitchen-sort]'),
  guideList: document.querySelector('#guide-list'),
  guideSectionField: document.querySelector('#guide-section-field'),
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
  voiceInboxTable: document.querySelector('#voice-inbox-table'),
  voiceTableEmpty: document.querySelector('#voice-table-empty'),
  voiceRefresh: document.querySelector('#voice-refresh'),
  voicePrev: document.querySelector('#voice-prev'),
  voiceNext: document.querySelector('#voice-next'),
  voicePageLabel: document.querySelector('#voice-page'),
  voiceMinutesTotal: document.querySelector('#voice-minutes-total'),
  voiceMinutesToday: document.querySelector('#voice-minutes-today'),
  voiceMinutesBudget: document.querySelector('#voice-minutes-budget'),
  voiceMinutesRemaining: document.querySelector('#voice-minutes-remaining'),
  voiceMaxEntriesHint: document.querySelector('#voice-max-entries'),
  toast: document.querySelector('#toast'),
  toastText: document.querySelector('#toast .toast-text'),
  toastClose: document.querySelector('#toast .toast-close'),
  trainingPage: document.querySelector('#training-page'),
  reviewerBadge: document.querySelector('#reviewer-id-badge'),
  notificationsList: document.querySelector('#notifications-list'),
  authStatusBadge: document.querySelector('#auth-status-badge'),
  authUsage: document.querySelector('#auth-usage'),
  showLoginButton: document.querySelector('#show-login'),
  logoutButton: document.querySelector('#logout-button'),
  loginModal: document.querySelector('#login-modal'),
  loginForm: document.querySelector('#login-form'),
  loginUsername: document.querySelector('#login-username'),
  loginPassword: document.querySelector('#login-password'),
  loginError: document.querySelector('#login-error'),
  loginCancel: document.querySelector('#login-cancel'),
  governancePolicyVersion: document.querySelector('#governance-policy-version'),
  governanceAllowedTools: document.querySelector('#governance-allowed-tools'),
  governanceAllowedModels: document.querySelector('#governance-allowed-models'),
  governanceLastPurge: document.querySelector('#governance-last-purge'),
  governanceAvgLatency: document.querySelector('#governance-avg-latency'),
  governanceViolationCount: document.querySelector('#governance-violation-count'),
  governanceViolationList: document.querySelector('#governance-violation-list'),
  retentionTableBody: document.querySelector('#retention-table-body'),
  governanceIntentCounts: document.querySelector('#governance-intent-counts'),
  governanceEvalIntent: document.querySelector('#governance-eval-intent'),
  governanceEvalAction: document.querySelector('#governance-eval-action'),
};

export const navButtons = document.querySelectorAll('.nav-link');

if (typeof window !== 'undefined' && window.history && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

export const PURGE_MAX_AGE_DAYS = 7;
export const TRAINING_ALERT_INCREMENT = 30;
