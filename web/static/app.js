// Tier-5 dashboard constants and helpers
// WHAT: Define poll intervals, intent wiring, field layouts, and reusable DOM refs.
// WHY: Keeps the UI declarative so features (e.g., new tools) are driven by config instead of ad-hoc logic.
// HOW: Use consistent naming across pending queue, training view, and data tabs.
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

function getFieldLabel(tool, field) {
  if (tool === 'app_guide' && field === 'title') {
    return 'Section';
  }
  return FIELD_LIBRARY[field]?.label || field;
}

const TOOL_REQUIRED_FIELDS = {
  todo_list: ['title'],
  calendar_edit: ['title'],
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

const MUTATING_ACTIONS = new Set(['create', 'update', 'delete']);

const ENTITY_FIELD_CONFIG = {
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

// WHAT: bootstrap the state slice for a todo CRUD action.
// WHY: both create/update forms track their own draft values independent of pending corrections.
// HOW: seed action metadata plus value/display objects.
function createTodoFormState(action) {
  return {
    action,
    values: {},
    display: {},
  };
}

function createCalendarFormState(action) {
  return {
    action,
    values: {},
    display: {},
    datetime: {},
  };
}

function createKitchenFormState(action) {
  return {
    action,
    values: {},
  };
}

function slugifySectionLabel(text = '') {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function humanizeSectionId(value = '') {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatNotesSectionHeading(entry = {}) {
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

function getNoteSectionTitles() {
  const seen = new Set();
  return (state.dataStores.app_guide || [])
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

const COMBOBOX_DEFAULT_LIMIT = 8;
let comboboxIdCounter = 0;

// WHAT: reusable combobox widget that mixes text input with dropdown suggestions.
// WHY: several Tier-5 fields (Notes sections, future title lookups, IDs) need both free-form input and scoped suggestions.
// HOW: accept a config-driven data source, render a popover with filtered options, and expose refresh hooks so other modules can share the component.
function createCombobox(config = {}) {
  const {
    placeholder = '',
    name,
    required = false,
    getOptions = () => [],
    filterOption,
    allowCreate = false,
    createLabel = (value) => `Create "${value}"`,
    maxOptions = COMBOBOX_DEFAULT_LIMIT,
    onChange,
    initialValue = '',
    toggleLabel = 'Toggle suggestions',
  } = config;
  const wrapper = document.createElement('div');
  wrapper.className = 'notes-combobox';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'notes-combobox-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = placeholder;
  if (name) {
    input.name = name;
  }
  if (required) {
    input.required = true;
  }
  wrapper.appendChild(input);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'notes-combobox-toggle';
  toggle.setAttribute('aria-label', toggleLabel);
  toggle.tabIndex = -1;
  wrapper.appendChild(toggle);
  const dropdown = document.createElement('div');
  dropdown.className = 'notes-combobox-dropdown hidden';
  dropdown.setAttribute('role', 'listbox');
  const list = document.createElement('ul');
  dropdown.appendChild(list);
  wrapper.appendChild(dropdown);
  const dropdownId = `combobox-${comboboxIdCounter++}`;
  dropdown.id = dropdownId;
  input.setAttribute('aria-haspopup', 'listbox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', dropdownId);

  const instance = {
    wrapper,
    input,
    toggle,
    dropdown,
    list,
    onChange: typeof onChange === 'function' ? onChange : null,
    isOpen: false,
    highlightIndex: -1,
    options: [],
    blurTimeout: null,
    optionSource: [],
  };

  function notifyChange(value) {
    if (instance.onChange) {
      instance.onChange(value);
    }
  }

  function setInputValue(value, options = {}) {
    const text = value || '';
    const silent = Boolean(options.silent);
    if (input.value === text) {
      if (!silent) {
        notifyChange(text);
      }
      return;
    }
    input.value = text;
    if (!silent) {
      notifyChange(text);
    }
  }

  function selectOption(option) {
    if (!option || option.type === 'empty') return;
    setInputValue(option.value);
    closeDropdown();
    input.focus();
  }

  function getSelectableIndex(startIndex = 0, step = 1) {
    if (!instance.options.length) return -1;
    const length = instance.options.length;
    let index = startIndex;
    for (let attempts = 0; attempts < length; attempts += 1) {
      if (instance.options[index] && instance.options[index].type !== 'empty') {
        return index;
      }
      index = (index + step + length) % length;
    }
    return -1;
  }

  function normalizeOptions(rawOptions = []) {
    return rawOptions
      .map((entry) => {
        if (typeof entry === 'string') {
          const text = entry.trim();
          return text ? { value: text, label: text } : null;
        }
        if (entry && typeof entry === 'object') {
          const value = (entry.value || entry.label || '').toString().trim();
          if (!value) {
            return null;
          }
          return { value, label: entry.label ? String(entry.label) : value };
        }
        return null;
      })
      .filter(Boolean);
  }

  function defaultFilter(option, query) {
    if (!query) return true;
    const text = option.label || option.value || '';
    return text.toLowerCase().includes(query.toLowerCase());
  }

  function renderOptions(queryText = '') {
    const source = normalizeOptions(getOptions());
    instance.optionSource = source;
    const normalized = queryText.trim().toLowerCase();
    let matches = source;
    const filterFn = typeof filterOption === 'function' ? filterOption : defaultFilter;
    if (normalized) {
      matches = source.filter((option) => filterFn(option, queryText));
    }
    matches = matches.slice(0, Math.max(1, maxOptions));
    const options = matches.map((option) => ({
      type: 'option',
      label: option.label,
      value: option.value,
    }));
    if (
      allowCreate &&
      normalized &&
      !source.some((option) => option.value.toLowerCase() === normalized)
    ) {
      const trimmedValue = queryText.trim();
      options.push({
        type: 'create',
        label: createLabel(trimmedValue),
        value: trimmedValue,
      });
    }
    if (!options.length) {
      options.push({
        type: 'empty',
        label: 'No sections yet',
        value: '',
      });
    }
    instance.options = options;
    list.innerHTML = '';
    options.forEach((option, index) => {
      const item = document.createElement('li');
      item.className = 'notes-combobox-option';
      item.setAttribute('role', 'option');
      if (option.type === 'create') {
        item.classList.add('notes-combobox-option--create');
      }
      if (option.type === 'empty') {
        item.classList.add('notes-combobox-option--empty');
        item.setAttribute('aria-disabled', 'true');
      }
      if (index === instance.highlightIndex) {
        item.classList.add('active');
      }
      item.textContent = option.label;
      if (option.type !== 'empty') {
        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
          selectOption(option);
        });
      }
      list.appendChild(item);
    });
    if (instance.highlightIndex === -1 || !instance.options[instance.highlightIndex] || instance.options[instance.highlightIndex].type === 'empty') {
      instance.highlightIndex = getSelectableIndex(0, 1);
    }
    Array.from(list.children).forEach((item, idx) => {
      item.classList.toggle('active', idx === instance.highlightIndex);
    });
  }

  function openDropdown() {
    if (instance.isOpen) {
      renderOptions(input.value);
      return;
    }
    instance.isOpen = true;
    instance.dropdown.classList.remove('hidden');
    wrapper.classList.add('notes-combobox--open');
    input.setAttribute('aria-expanded', 'true');
    renderOptions(input.value);
  }

  function closeDropdown() {
    if (!instance.isOpen) return;
    instance.isOpen = false;
    wrapper.classList.remove('notes-combobox--open');
    dropdown.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    instance.highlightIndex = -1;
  }

  function cancelPendingClose() {
    if (instance.blurTimeout) {
      clearTimeout(instance.blurTimeout);
      instance.blurTimeout = null;
    }
  }

  function scheduleClose() {
    cancelPendingClose();
    instance.blurTimeout = setTimeout(() => {
      closeDropdown();
    }, 120);
  }

  function moveHighlight(step) {
    if (!instance.isOpen || !instance.options.length) return;
    const length = instance.options.length;
    if (length === 1 && instance.options[0].type === 'empty') {
      instance.highlightIndex = -1;
      return;
    }
    if (instance.highlightIndex === -1) {
      instance.highlightIndex = getSelectableIndex(step > 0 ? 0 : length - 1, step);
    } else {
      let nextIndex = instance.highlightIndex;
      for (let attempts = 0; attempts < length; attempts += 1) {
        nextIndex = (nextIndex + step + length) % length;
        if (instance.options[nextIndex] && instance.options[nextIndex].type !== 'empty') {
          instance.highlightIndex = nextIndex;
          break;
        }
      }
    }
    Array.from(list.children).forEach((item, idx) => {
      item.classList.toggle('active', idx === instance.highlightIndex);
    });
  }

  input.addEventListener('focus', () => {
    cancelPendingClose();
    openDropdown();
  });
  input.addEventListener('blur', () => {
    scheduleClose();
  });
  dropdown.addEventListener('mousedown', (event) => {
    event.preventDefault();
    cancelPendingClose();
  });
  toggle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    cancelPendingClose();
  });
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    if (instance.isOpen) {
      closeDropdown();
    } else {
      openDropdown();
      input.focus();
    }
  });
  input.addEventListener('input', () => {
    notifyChange(input.value);
    openDropdown();
    renderOptions(input.value);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openDropdown();
      moveHighlight(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openDropdown();
      moveHighlight(-1);
    } else if (event.key === 'Enter') {
      if (instance.isOpen && instance.highlightIndex !== -1) {
        const option = instance.options[instance.highlightIndex];
        if (option && option.type !== 'empty') {
          event.preventDefault();
          selectOption(option);
        }
      }
    } else if (event.key === 'Escape') {
      if (instance.isOpen) {
        event.preventDefault();
        closeDropdown();
      }
    }
  });

  if (initialValue) {
    setInputValue(initialValue, { silent: true });
  }

  const api = {
    element: wrapper,
    input,
    refreshOptions: () => {
      if (instance.isOpen) {
        renderOptions(input.value);
      }
    },
    setValue: (value, options = {}) => setInputValue(value, options),
    getValue: () => input.value,
    focus: () => input.focus(),
    close: () => closeDropdown(),
  };

  return api;
}

function disableAutofill() {
  document.querySelectorAll('form').forEach((form) => form.setAttribute('autocomplete', 'off'));
  document.querySelectorAll('input, textarea').forEach((field) => field.setAttribute('autocomplete', 'off'));
}

const STORAGE_KEYS = {
  ACTIVE_PAGE: 'tier5_active_page',
  PENDING_PAGE: 'tier5_pending_page',
  CHAT_HISTORY: 'tier5_chat_history',
  LATEST_CONFIRMED: 'tier5_latest_confirmed',
  SELECTED_PROMPT: 'tier5_selected_prompt',
  REVIEWER_ID: 'tier5_reviewer_id',
  REVIEWER_TOKEN: 'tier5_reviewer_token',
  LAST_PURGE_ALERT_SIGNATURE: 'tier5_last_purge_alert_signature',
  LAST_TRAINING_ALERT_COUNT: 'tier5_last_training_alert_count',
  DATA_ACTIVE_TAB: 'tier5_data_active_tab',
  DATA_SELECTED_ROWS: 'tier5_data_selected_rows',
  VOICE_OFFLINE_LOG: 'tier5_voice_offline_attempts',
};

let pollTimer;

const DATA_STORE_IDS = ['todos', 'calendar', 'kitchen_tips', 'app_guide'];
const SELECTABLE_DATA_STORES = new Set(['todos', 'calendar', 'kitchen_tips']);
const VOICE_MIN_DURATION_MS = 5000;
const VOICE_MAX_DURATION_MS = 15000;
const VOICE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mpeg'];

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
  reviewerId: '',
  reviewerToken: '',
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
  notifications: [],
};

const el = {
  chatLog: document.querySelector('#chat-log'),
  chatForm: document.querySelector('#chat-form'),
  chatInput: document.querySelector('#chat-input'),
  chatStatus: document.querySelector('#chat-status'),
  chatVoiceButton: document.querySelector('#chat-voice-button'),
  voiceStatus: document.querySelector('#voice-status'),
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
  toast: document.querySelector('#toast'),
  trainingPage: document.querySelector('#training-page'),
  reviewerBadge: document.querySelector('#reviewer-id-badge'),
  reviewerButton: document.querySelector('#set-reviewer-id'),
  reviewerTokenBadge: document.querySelector('#reviewer-token-badge'),
  reviewerTokenButton: document.querySelector('#set-reviewer-token'),
  notificationsList: document.querySelector('#notifications-list'),
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

const navButtons = document.querySelectorAll('.nav-link');

if (typeof window !== 'undefined' && window.history && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

const REVIEWER_ID_PATTERN = /^[A-Za-z0-9._-]{2,32}$/;
const PURGE_MAX_AGE_DAYS = 7;
const TRAINING_ALERT_INCREMENT = 30;

function validateReviewerId(value) {
  return REVIEWER_ID_PATTERN.test(value || '');
}

function updateReviewerBadge() {
  if (el.reviewerBadge) {
    el.reviewerBadge.textContent = state.reviewerId || 'anonymous';
  }
}

function setReviewerId(newId) {
  state.reviewerId = newId || '';
  updateReviewerBadge();
  try {
    if (state.reviewerId) {
      localStorage.setItem(STORAGE_KEYS.REVIEWER_ID, state.reviewerId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.REVIEWER_ID);
    }
  } catch (err) {
    // ignore storage failures
  }
}

function restoreReviewerId() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.REVIEWER_ID);
    if (stored && validateReviewerId(stored)) {
      state.reviewerId = stored;
    } else if (stored) {
      localStorage.removeItem(STORAGE_KEYS.REVIEWER_ID);
    }
  } catch (err) {
    // ignore
  }
  updateReviewerBadge();
}

function promptForReviewerId() {
  const existing = state.reviewerId;
  const input = window.prompt(
    'Enter your reviewer ID (letters/numbers, 2-32 chars).',
    existing || '',
  );
  if (input === null) {
    return false;
  }
  const normalized = (input || '').trim();
  if (!validateReviewerId(normalized)) {
    showToast('Reviewer ID must be 2-32 characters (letters, numbers, . _ -).', 'error');
    return false;
  }
  setReviewerId(normalized);
  showToast(`Reviewer set to ${normalized}`, 'success');
  return true;
}

function ensureReviewerId() {
  restoreReviewerId();
  if (!state.reviewerId) {
    const accepted = promptForReviewerId();
    if (!accepted) {
      showToast('Using anonymous reviewer ID until you set one.', 'warning');
    }
  }
}

function getReviewerId() {
  if (state.reviewerId) {
    return state.reviewerId;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.REVIEWER_ID);
    if (stored && validateReviewerId(stored)) {
      state.reviewerId = stored;
      updateReviewerBadge();
      return state.reviewerId;
    }
  } catch (err) {
    // ignore
  }
  return '';
}

function updateReviewerTokenBadge() {
  if (!el.reviewerTokenBadge) return;
  if (state.reviewerToken) {
    el.reviewerTokenBadge.textContent = 'Token set';
    el.reviewerTokenBadge.classList.remove('warning');
  } else {
    el.reviewerTokenBadge.textContent = 'Token missing';
    el.reviewerTokenBadge.classList.add('warning');
  }
}

function setReviewerToken(value) {
  state.reviewerToken = value || '';
  updateReviewerTokenBadge();
  try {
    if (state.reviewerToken) {
      localStorage.setItem(STORAGE_KEYS.REVIEWER_TOKEN, state.reviewerToken);
    } else {
      localStorage.removeItem(STORAGE_KEYS.REVIEWER_TOKEN);
    }
  } catch (err) {
    // ignore storage issues
  }
}

function restoreReviewerToken() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.REVIEWER_TOKEN);
    if (stored) {
      state.reviewerToken = stored;
    }
  } catch (err) {
    // ignore
  }
  updateReviewerTokenBadge();
}

function promptForReviewerToken() {
  const input = window.prompt('Enter the reviewer token (leave blank to clear).', '');
  if (input === null) {
    return false;
  }
  const normalized = (input || '').trim();
  setReviewerToken(normalized);
  if (normalized) {
    showToast('Reviewer token saved.', 'success');
    return true;
  }
  showToast('Reviewer token cleared. API calls will fail until you set one.', 'warning');
  return false;
}

function ensureReviewerToken() {
  restoreReviewerToken();
  if (!state.reviewerToken) {
    showToast('Set your reviewer token with the Token button to use the API.', 'warning');
  }
}

function getReviewerToken() {
  if (state.reviewerToken) {
    return state.reviewerToken;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.REVIEWER_TOKEN);
    if (stored) {
      state.reviewerToken = stored;
      updateReviewerTokenBadge();
      return state.reviewerToken;
    }
  } catch (err) {
    // ignore
  }
  return '';
}

function persistActiveDataTab() {
  try {
    localStorage.setItem(STORAGE_KEYS.DATA_ACTIVE_TAB, state.activeDataTab || 'todos');
  } catch (err) {
    // ignore persistence failures
  }
}

function restoreActiveDataTab() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.DATA_ACTIVE_TAB);
    if (stored && DATA_STORE_IDS.includes(stored)) {
      state.activeDataTab = stored;
    }
  } catch (err) {
    // ignore
  }
}

function persistSelectedDataRows() {
  try {
    const payload = JSON.stringify({
      todos: state.selectedRows?.todos || null,
      calendar: state.selectedRows?.calendar || null,
      kitchen_tips: state.selectedRows?.kitchen_tips || null,
    });
    localStorage.setItem(STORAGE_KEYS.DATA_SELECTED_ROWS, payload);
  } catch (err) {
    // ignore
  }
}

function restoreSelectedDataRows() {
  if (!state.selectedRows) {
    state.selectedRows = { todos: null, calendar: null, kitchen_tips: null };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.DATA_SELECTED_ROWS);
    if (!stored) {
      return;
    }
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === 'object') {
      state.selectedRows.todos = parsed.todos || null;
      state.selectedRows.calendar = parsed.calendar || null;
      state.selectedRows.kitchen_tips = parsed.kitchen_tips || null;
    }
  } catch (err) {
    state.selectedRows.todos = null;
    state.selectedRows.calendar = null;
    state.selectedRows.kitchen_tips = null;
  }
}

function getSelectedDataRow(store) {
  return state.selectedRows?.[store] || null;
}

function setSelectedDataRow(store, id, options = {}) {
  if (!SELECTABLE_DATA_STORES.has(store)) {
    return;
  }
  if (!state.selectedRows) {
    state.selectedRows = { todos: null, calendar: null };
  }
  state.selectedRows[store] = id ? String(id) : null;
  if (options.persist !== false) {
    persistSelectedDataRows();
  }
}

function clearSelectedDataRow(store, options = {}) {
  setSelectedDataRow(store, null, options);
}

function restoreDataPanelState() {
  restoreActiveDataTab();
  restoreSelectedDataRows();
}

function buildReviewerHeaders(base = {}) {
  const headers = { ...(base || {}) };
  const reviewerId = getReviewerId();
  const reviewerToken = getReviewerToken();
  if (reviewerId && !headers['X-Reviewer-ID']) {
    headers['X-Reviewer-ID'] = reviewerId;
  }
  if (reviewerToken && !headers['X-Reviewer-Token']) {
    headers['X-Reviewer-Token'] = reviewerToken;
  }
  return headers;
}

// WHAT: standardize AJAX calls with JSON parsing and friendly errors.
// WHY: every frontend API call should share headers/logic so errors propagate consistently.
// HOW: invoked by every `/api/...` call so it wraps `fetch`, parses success (incl. 204), and bubbles server detail strings when orchestration endpoints fail.
async function fetchJSON(url, options = {}) {
  const headers = buildReviewerHeaders({
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  });
  const response = await fetch(url, {
    headers,
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

// WHAT: display a temporary toast notification.
// WHY: reviewers need quick confirmation/error messages when mutating state.
// HOW: writes the message/type into `#toast`, shows it, then hides it after 3 s so reviewers see feedback without extra clicks.
function showToast(message, type = 'info') {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.remove('hidden');
  el.toast.dataset.type = type;
  setTimeout(() => {
    el.toast?.classList.add('hidden');
  }, 3000);
}

// WHAT: update the chat footer with the latest status message.
// WHY: gives operators feedback when the chatbot is running or idle.
// HOW: whenever chat submission or polling starts/ends we update `#chat-status` so the footer mirrors backend activity.
function setChatStatus(text) {
  if (el.chatStatus) {
    el.chatStatus.textContent = text;
  }
}

function setVoiceStatus(text, tone = 'info') {
  if (!el.voiceStatus) return;
  if (!text) {
    el.voiceStatus.classList.add('hidden');
    el.voiceStatus.removeAttribute('data-tone');
    return;
  }
  el.voiceStatus.textContent = text;
  el.voiceStatus.dataset.tone = tone;
  el.voiceStatus.classList.remove('hidden');
}

function updateVoiceButtonState() {
  if (!el.chatVoiceButton) return;
  if (!state.voice.supported) {
    el.chatVoiceButton.classList.add('hidden');
    return;
  }
  el.chatVoiceButton.classList.remove('hidden');
  el.chatVoiceButton.disabled = Boolean(state.voice.uploading || state.voice.mediaError);
  el.chatVoiceButton.textContent = state.voice.recording ? 'Stop' : 'Voice';
  el.chatVoiceButton.dataset.state = state.voice.recording ? 'recording' : 'idle';
}

function recordOfflineVoiceAttempt(meta = {}) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      ...meta,
    };
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.VOICE_OFFLINE_LOG) || '[]');
    existing.push(entry);
    const trimmed = existing.slice(-20);
    localStorage.setItem(STORAGE_KEYS.VOICE_OFFLINE_LOG, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('Failed to record offline voice attempt', err);
  }
}

function detectVoiceSupport() {
  const supported = Boolean(navigator?.mediaDevices?.getUserMedia) && typeof window !== 'undefined' && 'MediaRecorder' in window;
  state.voice.supported = supported;
  state.voice.mediaError = null;
  if (!supported) {
    setVoiceStatus('Voice capture needs Chrome on desktop or iPhone.', 'warning');
  } else {
    setVoiceStatus('Mic ready (Chrome desktop + iPhone).', 'info');
  }
  updateVoiceButtonState();
}

function pickVoiceMimeType() {
  if (!window.MediaRecorder || typeof window.MediaRecorder.isTypeSupported !== 'function') {
    return 'audio/webm';
  }
  for (const type of VOICE_MIME_TYPES) {
    if (window.MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'audio/webm';
}

function handleMediaError(err) {
  console.error('Voice recording error', err);
  state.voice.mediaError = err?.message || 'Microphone unavailable. Use text input.';
  state.voice.recording = false;
  if (state.voice.mediaRecorder) {
    try {
      if (state.voice.mediaRecorder.state !== 'inactive') {
        state.voice.mediaRecorder.stop();
      }
    } catch (stopErr) {
      console.warn('Failed to stop recorder', stopErr);
    }
  }
  if (state.voice.stopTimer) {
    clearTimeout(state.voice.stopTimer);
    state.voice.stopTimer = null;
  }
  updateVoiceButtonState();
  setVoiceStatus('Mic unavailable — falling back to text input.', 'error');
}

function stopVoiceRecording() {
  if (state.voice.mediaRecorder && state.voice.mediaRecorder.state !== 'inactive') {
    state.voice.mediaRecorder.stop();
  }
}

async function startVoiceRecording() {
  if (!state.voice.supported || state.voice.recording || state.voice.uploading || state.voice.mediaError) {
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickVoiceMimeType();
    const options = mimeType ? { mimeType } : undefined;
    const recorder = new MediaRecorder(stream, options);
    state.voice.mediaRecorder = recorder;
    state.voice.mimeType = mimeType || recorder.mimeType || 'audio/webm';
    state.voice.chunks = [];
    state.voice.recording = true;
    state.voice.startedAt = Date.now();
    updateVoiceButtonState();
    setVoiceStatus('Recording… tap Stop by 15s.', 'info');
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        state.voice.chunks.push(event.data);
      }
    };
    recorder.onerror = (event) => {
      handleMediaError(event.error || new Error('Recorder error'));
    };
    recorder.onstop = () => {
      if (state.voice.stopTimer) {
        clearTimeout(state.voice.stopTimer);
        state.voice.stopTimer = null;
      }
      const chunks = [...state.voice.chunks];
      state.voice.chunks = [];
      state.voice.recording = false;
      state.voice.mediaRecorder = null;
      try {
        stream.getTracks().forEach((track) => track.stop());
      } catch (cleanupErr) {
        console.warn('Failed to stop tracks', cleanupErr);
      }
      updateVoiceButtonState();
      if (!chunks.length) {
        setVoiceStatus('Recording failed — try again.', 'error');
        return;
      }
      const blob = new Blob(chunks, { type: state.voice.mimeType || 'audio/webm' });
      const duration = Date.now() - (state.voice.startedAt || Date.now());
      if (duration < VOICE_MIN_DURATION_MS) {
        showToast('Voice clips under 5 seconds may not transcribe accurately.', 'warning');
      }
      uploadVoiceClip(blob);
    };
    recorder.start();
    state.voice.stopTimer = window.setTimeout(() => {
      stopVoiceRecording();
    }, VOICE_MAX_DURATION_MS);
  } catch (err) {
    handleMediaError(err);
  }
}

async function uploadVoiceClip(blob) {
  if (!blob || !blob.size) {
    setVoiceStatus('Recording failed — empty audio.', 'error');
    return;
  }
  const extension = blob.type.includes('mpeg') ? 'mp3' : 'webm';
  const formData = new FormData();
  formData.append('audio', blob, `clip-${Date.now()}.${extension}`);
  const headers = buildReviewerHeaders();
  state.voice.uploading = true;
  setVoiceStatus('Transcribing…', 'info');
  setChatStatus('Transcribing…');
  updateVoiceButtonState();
  try {
    const response = await fetch('/api/speech', {
      method: 'POST',
      body: formData,
      headers,
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (parseErr) {
        console.warn('Failed to parse /api/speech response', parseErr);
      }
    }
    if (!response.ok) {
      throw new Error(payload?.detail || payload?.error || 'Voice upload failed');
    }
    if ((payload?.transcription_status || '').toLowerCase() !== 'completed') {
      const errorMessage = payload?.error || 'Transcription failed. Try again when online.';
      showToast(errorMessage, 'error');
      return;
    }
    handleSpeechPayload(payload);
    await Promise.all([loadPending(true), refreshActiveDataTab()]);
    showToast('Voice message sent', 'success');
  } catch (err) {
    state.pendingChatEntry = null;
    recordOfflineVoiceAttempt({ reason: err?.message || 'network_error', size: blob.size, mimeType: blob.type });
    showToast(err.message || 'Voice upload failed', 'error');
  } finally {
    state.voice.uploading = false;
    if (!state.voice.mediaError) {
      setVoiceStatus('Mic ready (Chrome desktop + iPhone).', 'info');
    }
    setChatStatus('Ready');
    updateVoiceButtonState();
  }
}

function handleSpeechPayload(payload) {
  if (!payload) return;
  const transcript = (payload.text || '').trim();
  if (transcript) {
    const entry = { role: 'user', text: transcript, entryId: null, via: 'voice' };
    state.chat.push(entry);
    state.pendingChatEntry = entry;
    persistChatHistory();
    renderChat();
  }
  if (payload.chat) {
    appendAssistantReply(payload.chat);
  }
}

function appendAssistantReply(reply) {
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
    addPendingRecord(reply.pending_record);
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/static/service-worker.js');
    } catch (err) {
      console.warn('Service worker registration failed', err);
    }
  });
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'voice-upload-offline') {
      recordOfflineVoiceAttempt({ reason: 'offline_sw', ...(event.data?.meta || {}) });
      showToast('Offline voice upload logged. Re-send when back online.', 'warning');
    }
  });
}

// WHAT: swap between the dashboard’s top-level views (Chat, Training, Data Stores).
// WHY: Tier‑5 is a single-page app; toggling visibility keeps state intact.
// HOW: flips `.active` on both nav buttons and `.page-view` panels and stores the selection so refreshes land the reviewer back on the same section.
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

// WHAT: list valid actions for the selected intent.
// WHY: the action dropdown should reflect both defaults and runtime-configured additions.
// HOW: combines baked-in defaults with `/api/intents` overrides so the action dropdown always mirrors what the orchestrator will accept.
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

// WHAT: collapse tool-specific action aliases (e.g., “search” -> “find”).
// WHY: keeps payloads consistent regardless of how the router/parser named the action.
// HOW: consults `ACTION_ALIASES` before we dispatch/prefill forms so payloads sent to `/api/logs/label` align with tool expectations.
function normalizeActionName(intent, action) {
  if (!action) return action;
  const aliases = ACTION_ALIASES[intent];
  if (!aliases) return action;
  return aliases[action] || action;
}

// WHAT: clean the `/api/intents` response before storing it.
// WHY: protects the UI from duplicates or unsupported actions when configs drift.
// HOW: when `/api/intents` responds we strip duplicates/unsupported verbs so downstream dropdowns never expose stale options.
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

// WHAT: rebuild the intent dropdown using the current set of registered tools.
// WHY: whenever `/api/intents` responds or state resets, reviewers need an accurate list.
// HOW: replaces the `<select>` contents with sorted labels so when reviewers pick a tool it matches what Tier‑1 registered.
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

// WHAT: populate the action select based on the chosen intent.
// WHY: action options differ per tool; showing irrelevant ones causes bad payloads.
// HOW: pulls the merged action list, orders it per tool defaults, and sets the dropdown so corrections mirror the orchestrator dispatch path.
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

// WHAT: render the chat transcript in the left-hand panel.
// WHY: reviewers monitor real-time interactions and need links to pending items.
// HOW: iterates `state.chat`, renders bubbles plus tool metadata, and keeps the log scrolled so reviewers can jump from the transcript to pending cards.
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

// WHAT: stringify parser payload values for short previews.
// WHY: pending cards show only the first few key/value pairs as inline text.
// HOW: before pending cards render inline payload summaries we stringify arrays/objects, trim strings, and fallback to “—” for empty values.
function formatPreviewValue(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    return '[object]';
  }
  return String(value ?? '');
}

// WHAT: convert ISO timestamps into localized display text.
// WHY: pending/meta sections show human-readable timestamps (Created at ...).
// HOW: convert parser timestamps into `Date` objects, guard invalid values, and format via `toLocaleString` before printing in metadata rows.
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

// WHAT: create the combined metadata string shown beneath each pending card.
// WHY: reviewers need to see confidence, source, probe info, etc., at a glance.
// HOW: assembles the pill text by appending timestamp, classifier confidence, invocation source, and keyword-probe notes so reviewers see the full routing story inline.
function buildPendingMetadata(item) {
  const parts = [];
  const created = formatTimestamp(item.timestamp);
  if (created) {
    parts.push(`Created ${created}`);
  }
  const reviewerId = item.reviewer_id || item.extras?.reviewer_id;
  if (reviewerId) {
    parts.push(`Reviewer ${reviewerId}`);
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

// WHAT: sort pending queue items by timestamp descending while deduping.
// WHY: the UI should show the newest unresolved prompts first without duplicates.
// HOW: clone the server response, sort newest-first, and skip duplicate hashes so the queue list and poller stay in sync without flicker.
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
    const key = item?.prompt_id;
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

// WHAT: normalize a record’s `related_prompts` array into trimmed unique strings.
// WHY: backend data may contain duplicates or include the primary prompt; the UI needs clean chips.
// HOW: before chips render we coerce API arrays, drop blanks/primary text, and cap to the most recent 10 so corrected payloads stay lean.
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

// WHAT: shallow equality check for related prompt arrays.
// WHY: we only want to preserve reviewer edits if the list actually changed.
// HOW: compare lengths and string order so we know whether to preserve reviewer edits when merging fresh pending data.
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

// WHAT: normalize the `intended_entities` array from API records.
// WHY: chips require `{id,title}` objects even when the backend stored different keys.
// HOW: convert whatever backend schema we got into `{id,title}` pairs so chips dropdowns can reuse a consistent shape.
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

// WHAT: shallow equality check for intended entity arrays.
// WHY: ensures we don’t overwrite reviewer-edited lists when refreshing.
// HOW: compare lengths plus each `{id,title}` so we don’t overwrite reviewer-added chips when fresh queue snapshots arrive.
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

// WHAT: coerce pending API records into the shape the UI expects.
// WHY: earlier entries may miss fields (prompt_id, predicted payload, metadata).
// HOW: clone the API row, ensure it has a predicted payload object, and attach normalized prompts/entities so the editor always receives consistent shapes.
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

// WHAT: mark a field as edited by the reviewer.
// WHY: helps flag which values differ from parser predictions and drives UI hints.
// HOW: mark the field in local state and on the selected prompt so downstream renders (chips, payload diffs) can highlight reviewer overrides.
function flagReviewerChange(field) {
  if (!field) return;
  state.fieldVersions[field] = 'reviewer';
  if (state.selectedPrompt) {
    state.selectedPrompt.field_versions = state.selectedPrompt.field_versions || {};
    state.selectedPrompt.field_versions[field] = 'reviewer';
  }
}

// WHAT: fetch the most recent distinct user prompts (excluding the active one).
// WHY: powers the Related Prompts dropdown so reviewers can quickly link context.
// HOW: walk the chat array backwards, collect user messages, dedupe, and cap the list so the Related Prompts dropdown can surface the most recent alternate prompts.
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

// WHAT: normalize orchestrator conversation history extras into `{id,text}` pairs.
// WHY: the Related Prompts picker should reuse previously asserted prompts.
// HOW: inspect the orchestrator’s stored conversation history (or fallback to existing related prompts) and sanitize them before they feed suggestion builders.
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

// WHAT: pick the ±N prompts around the selected entry from conversation history.
// WHY: suggestions should focus on conversational neighbors, not arbitrary history.
// HOW: find the matching entry (by id or text) in conversation history and slice prompts before/after it so follow-up suggestions stay localized to the same dialog.
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

// WHAT: build a cached array of `{index,text,entryId}` for user chat messages.
// WHY: multiple helpers need indexed access to the chat log without recalculating.
// HOW: create a cached array of `{index,text}` for user entries so history fallbacks can reuse the same structure without re-walking the chat log.
function getChatUserEntries() {
  return state.chat
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => entry.role === 'user' && (entry.text || '').trim());
}

// WHAT: fallback to chat history neighbors when conversation memory lacks data.
// WHY: ensures Related Prompts still works for older cards created before memory snapshots.
// HOW: locate the matching user entry (by conversation id or text) inside `state.chat`, pull the surrounding prompts, and hand them to the suggestion builder when conversation history is missing.
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

// WHAT: combine history/chat/pending neighbors into a deduped suggestion list.
// WHY: reviewers should see relevant prompts even if some metadata sources are missing.
// HOW: merges prompts from conversation history, chat log, and queue neighbors, falling back to latest user prompts so the dropdown always has context-rich suggestions.
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

// WHAT: pull keyword probe matches (if any) from the record extras.
// WHY: used to auto-fill intended entities and ID/title fields when the router made a confident match.
// HOW: pulls the orchestrator’s keyword probe metadata, normalizes each hit into `{id,title}`, and hands them off to ID/title/intended-entity autofill logic.
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

// WHAT: hydrate intended entities/IDs/titles from probe matches when available.
// WHY: saves reviewers time when the router already pinpointed the right entity.
// HOW: set `state.intendedEntities` if empty and fill ID/title fields for update/delete actions.
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

// WHAT: final fallback to ±N pending entries when no conversation/chat history exists.
// WHY: cards imported from CSV or older log files still need sensible suggestions.
// HOW: find the card’s index inside `state.pending` and gather nearby prompt texts so even CSV-imported queues can feed the Related Prompts picker.
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

// WHAT: append a related prompt chip.
// WHY: reviewers link follow-up turns so the training pipeline understands multi-message context.
// HOW: trim/dedupe the chosen string, append it to the selected prompt’s `related_prompts`, and re-render chips so the correction payload mirrors reviewer intent.
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

// WHAT: remove a related prompt chip.
// WHY: curating the list keeps incorrect suggestions out of the labeled payload.
// HOW: drop the chip at the given index and refresh the list so only the desired prompts reach `/api/logs/label`.
function removeRelatedPrompt(index) {
  if (!state.selectedPrompt) return;
  const prompts = state.selectedPrompt.related_prompts || [];
  if (index < 0 || index >= prompts.length) return;
  prompts.splice(index, 1);
  state.selectedPrompt.related_prompts = prompts;
  renderRelatedPrompts();
}

// WHAT: eagerly remove pending entries (primary + related) after a correction.
// WHY: keeps the queue visually in sync without waiting for the poll interval.
// HOW: after `/api/logs/label` succeeds we filter out both the primary card and any related prompts so the queue UI reflects the backend immediately without waiting for the poller.
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

// WHAT: add an Intended Entity chip.
// WHY: captures which entities the system asserted or the reviewer expects for list/find flows.
// HOW: dedupe the `{id,title}` pair, push it into both state and the selected prompt, then re-render chips so logging payloads inherit the reviewer’s target entities.
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

// WHAT: remove an Intended Entity chip.
// WHY: reviewers may need to drop incorrect auto-filled matches before logging.
// HOW: remove the entry at the given index, update the prompt’s list, and redraw chips so unintended matches don’t end up in corrected payloads.
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

// WHAT: convert pronoun references (“this/that”) into concrete prompt values.
// WHY: follow-up utterances often refer to prior entities implicitly; we still need the actual text for lookup.
// HOW: scan the normalized related prompts list from newest to oldest and pick the first non-primary text so subsequent hydration logic can map “this/that” to a real entity.
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

// WHAT: replace pronoun-based title/id fields with resolved values.
// WHY: ensures lookup fields point to explicit entities when the parser only captured “this”/“that”.
// HOW: resolve the title text, then if it matches a single entity we stash its ID/lookup title so the rest of the correction form already points at the correct record before the reviewer edits anything.
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

// WHAT: count how many prior corrections exist for a given prompt id.
// WHY: drives the version history summary shown in the editor sidebar.
// HOW: count matching records in `state.corrected` so the sidebar can show how many corrections exist before the reviewer opens history.
function getVersionCount(promptId) {
  if (!promptId) return 0;
  return state.corrected.filter((record) => record.id === promptId).length;
}

// WHAT: convert raw intent names into human-friendly labels.
// WHY: pending cards should show readable tool names (e.g., “Todo tool”).
// HOW: lookup the friendly label (e.g., “Todo tool”) from `INTENT_LABELS` so pills/headings display a reviewer-friendly name even if the raw intent is technical.
function formatIntentLabel(intent) {
  return INTENT_LABELS[intent] || intent || 'nlu_fallback';
}

// WHAT: reorder payload keys for display purposes.
// WHY: ensures intent/action/domain appear first when rendering payload JSON.
// HOW: build a shallow copy, emit the meta fields first, then append remaining keys alphabetically so JSON previews in Pending/Training remain readable.
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

// WHAT: build dropdown options from the cached store data for a tool.
// WHY: update/delete actions use entity selectors; these need consistent labels/ids.
// HOW: read the cached store via `ENTITY_FIELD_CONFIG`, convert entries into option objects, and sort them so the ID dropdowns stay consistent with the underlying JSON stores.
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

// WHAT: read cached chat history from localStorage.
// WHY: preserves the mini transcript across reloads when reviewers refresh the page.
// HOW: read the persisted JSON array, keep only the latest 10, and stuff it back into `state.chat` so renderChat can pick up where the reviewer left off.
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

// WHAT: write the most recent chat entries to localStorage.
// WHY: lets the chat log survive page reloads between sessions.
// HOW: whenever the chat log updates we trim it to 10 entries and write it to localStorage, keeping reloads cheap.
function persistChatHistory() {
  try {
    const trimmed = state.chat.slice(-10);
    state.chat = trimmed;
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(trimmed));
  } catch (err) {
    // ignore
  }
}

// WHAT: load the “Latest Confirmed” record from storage.
// WHY: keeps the confirmation panel populated even after reloads.
// HOW: read the serialized record from localStorage and assign it to `state.latestConfirmed` so the sidebar populates immediately on refresh.
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

// WHAT: persist the most recent correction record so the summary panel survives reloads.
// WHY: reviewers expect to see the last triggered payload even if they refresh.
// HOW: after every correction we either store the new record or clear the key so the sidebar reflects the latest trigger status.
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

// WHAT: restore the last selected pending prompt id from storage.
// WHY: allows reviewers to pick up where they left off after a refresh.
// HOW: grab the saved prompt id from storage (if any) so `selectPendingPrompt` can rehydrate the editor on reload.
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

// WHAT: group store entries by title for dropdown consumption.
// WHY: titles may have duplicate IDs; grouping helps us present unique dropdown entries.
// HOW: reuse `getEntityOptions` output to group options by lowercase title so update/delete flows can show a single dropdown entry even when multiple IDs share the name.
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

// WHAT: produce sorted title dropdown options from grouped entities.
// WHY: update/delete workflows show human-readable titles instead of IDs.
// HOW: flatten the grouped titles into `{value,label}` entries and sort them, giving the title dropdown a stable alphabetical order.
function getTitleOptions(tool) {
  const groups = getTitleGroups(tool);
  return Array.from(groups.values())
    .map(({ title }) => ({ value: title, label: title }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// WHAT: detect whether a create action would duplicate an existing entity title.
// WHY: during training we sometimes log duplicates that should not mutate the underlying store.
// HOW: normalize the requested title and compare it against the cached store entries for the tool.
function hasDuplicateTitle(tool, titleValue) {
  if (!tool || !titleValue) return false;
  const config = ENTITY_FIELD_CONFIG[tool];
  if (!config) return false;
  const normalizedTitle = titleValue.trim().toLowerCase();
  if (!normalizedTitle) return false;
  const entries = state.dataStores[config.store] || [];
  return entries.some((entry) => (entry.title || '').trim().toLowerCase() === normalizedTitle);
}

// WHAT: return entity options that match a specific title (case-insensitive).
// WHY: used to auto-select IDs when a reviewer picks an existing title.
// HOW: look up the normalized title inside the grouped map and return every entity option that shares it so subsequent ID auto-fill logic can evaluate the match count.
function getEntitiesMatchingTitle(tool, title) {
  if (!title) return [];
  const groups = getTitleGroups(tool);
  const entry = groups.get(title.trim().toLowerCase());
  return entry ? entry.options : [];
}

// WHAT: auto-fill the ID field when only one entity matches the provided title.
// WHY: saves reviewers from manually selecting IDs during update/delete flows.
// HOW: ask `getEntitiesMatchingTitle` for matches and, when exactly one exists, stash its id in the correction fields so submissions already reference the concrete entity.
function autoSelectIdForTitle(tool, title) {
  const matches = getEntitiesMatchingTitle(tool, title);
  if (matches.length === 1) {
    state.correctionFields.id = matches[0].value;
  } else {
    delete state.correctionFields.id;
  }
  return matches.length;
}

// WHAT: merge hydrated entity data into the current correction fields.
// WHY: selecting an ID from the dropdown should populate related fields (notes, deadlines, etc.).
// HOW: loop over the tool-specific hydrate payload and copy values (or remove empties) into `state.correctionFields` so the editor reflects the selected entity’s data.
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

// WHAT: determine whether a field currently has a meaningful value.
// WHY: used when checking required fields and to toggle “field required” styling.
// HOW: treat trimmed strings, non-empty objects, and truthy primitives as filled so required-field highlighting and submission checks stay consistent.
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

// WHAT: assign CSS grid positions to dynamic form fields based on intent/action layouts.
// WHY: keeps the editor grid organized differently per tool (e.g., calendar vs todo).
// HOW: fetch the tool/action-specific coordinates and set each wrapper’s CSS grid placement so the correction form stays organized regardless of which fields render.
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

// WHAT: lazily initialize the shared date/time state object for a field.
// WHY: split inputs (date + time) need to persist their values between renders.
// HOW: ensure the `state.datetimeInputs` cache has an entry for the field so multiple renders/edit handlers share the same draft date/time values.
function ensureDateTimeState(field) {
  if (!state.datetimeInputs[field]) {
    state.datetimeInputs[field] = { dateValue: '', timeValue: '', useDefaultTime: true };
  } else if (typeof state.datetimeInputs[field].useDefaultTime === 'undefined') {
    state.datetimeInputs[field].useDefaultTime = true;
  }
  return state.datetimeInputs[field];
}

// WHAT: update either the date or time portion of a datetime field.
// WHY: input handlers reuse this to keep state in sync with user edits.
// HOW: ensure the per-field state exists and update either `.dateValue` or `.timeValue`, keeping text inputs and eventual payload serialization in sync.
function setDateTimePart(field, part, value) {
  const target = ensureDateTimeState(field);
  target[part] = value;
}

// WHAT: translate the internal date/time state into the payload format.
// WHY: weather/calendar/todo fields expect normalized ISO or structured objects.
// HOW: parse the stored strings (anchored to the prompt timestamp for relatives) and update `state.correctionFields` so submissions include normalized ISO/time payloads.
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
    updateCorrectButtonState();
    return;
  }
  const dateInfo = parseDateInput(stateValue.dateValue, baseDate);
  if (!dateInfo.iso) {
    delete state.correctionFields[field];
    updateCorrectButtonState();
    return;
  }
  if (config.mode === 'date' || !config.includeTime) {
    state.correctionFields[field] = dateInfo.iso;
    updateCorrectButtonState();
    return;
  }
  const allowDefault = stateValue.useDefaultTime !== false && config.defaultTime;
  const defaultTime = allowDefault ? config.defaultTime : '';
  const timeSource = stateValue.timeValue || defaultTime || '';
  const timeInfo = parseTimeInput(timeSource);
  let timeValue = timeInfo.time || '';
  if (!timeValue && stateValue.timeValue) {
    timeValue = stateValue.timeValue.trim();
  } else if (!timeValue && defaultTime) {
    timeValue = defaultTime;
  }
  if (!timeValue) {
    state.correctionFields[field] = dateInfo.iso;
    stateValue.useDefaultTime = false;
    updateCorrectButtonState();
    return;
  }
  if (!stateValue.timeValue && defaultTime) {
    stateValue.timeValue = defaultTime;
    stateValue.useDefaultTime = true;
  } else if (!stateValue.timeValue) {
    stateValue.useDefaultTime = false;
  } else {
    stateValue.useDefaultTime = false;
  }
  state.correctionFields[field] = `${dateInfo.iso}T${timeValue}`;
  updateCorrectButtonState();
}

// WHAT: determine the reference date for relative parsing (prompt timestamp or now).
// WHY: relative keywords like “tomorrow” should anchor to the original prompt time.
// HOW: parse `state.selectedPrompt.timestamp` (fallback to now) so both the datalist hints and parser normalization use the same anchor.
function getBaseDate() {
  const ts = state.selectedPrompt?.timestamp;
  if (!ts) return new Date();
  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

// WHAT: format Date objects as ISO `YYYY-MM-DD` strings.
// WHY: used by the relative date datalist hints.
// HOW: slice the first 10 characters from `date.toISOString()`.
function formatISODate(date) {
  return date.toISOString().slice(0, 10);
}

// WHAT: format Date objects as localized `DD/MM` strings.
// WHY: improves readability of the relative date datalist options.
// HOW: call `toLocaleDateString` with day/month options.
function formatDisplayDate(date) {
  return date.toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// WHAT: create a new Date offset by `amount` days.
// WHY: reused when building relative date options.
// HOW: clone the Date, adjust the day, and return the new instance.
function addDays(date, amount) {
  const clone = new Date(date.getTime());
  clone.setDate(clone.getDate() + amount);
  return clone;
}

// WHAT: enumerate relative date suggestions (“today”, weekdays, etc.).
// WHY: date inputs share the same datalist for fast reviewer entry.
// HOW: offset from the base date to produce ISO strings plus human labels so date fields and datalists stay aligned.
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

// WHAT: enumerate relative time suggestions (“morning”, “evening”, etc.).
// WHY: list/find workflows often rely on rough parts of day rather than exact times.
// HOW: supply canonical HH:MM values for each friendly label so both the datalist and payload serializer speak the same shorthand.
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

function stripOptionDisplaySuffix(value) {
  if (!value || typeof value !== 'string') return value;
  return value.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// WHAT: normalize free-form date text into ISO/keyword/display triples.
// WHY: reviewers can type “tomorrow”, “12/05”, etc., and we still need canonical payloads.
// HOW: check for known relative labels/ISO patterns first, otherwise fallback to raw text, so downstream serialization can decide whether to store ISO dates or conversational keywords.
function parseDateInput(value, baseDate) {
  if (!value) return { iso: '', keyword: '', display: '' };
  const trimmed = stripOptionDisplaySuffix(value).trim();
  const options = buildRelativeDateOptions(baseDate);
  const match = options.find((opt) => opt.label.toLowerCase() === trimmed.toLowerCase());
  if (match) {
    return { iso: match.iso, keyword: match.keyword, display: match.display, label: match.label };
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return { iso: trimmed, keyword: '', display: formatDisplayDate(new Date(trimmed)) };
  }
  const shortMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2}|\d{4}))?$/);
  if (shortMatch) {
    const day = shortMatch[1].padStart(2, '0');
    const month = shortMatch[2].padStart(2, '0');
    const baseYear = baseDate.getFullYear();
    const rawYear = shortMatch[3];
    let yearNumber;
    if (!rawYear) {
      yearNumber = baseYear;
    } else if (rawYear.length === 2) {
      const baseCentury = Math.floor(baseYear / 100) * 100;
      const parsed = Number(rawYear);
      yearNumber = baseCentury + parsed;
      if (yearNumber < baseYear - 50) {
        yearNumber += 100;
      } else if (yearNumber > baseYear + 50) {
        yearNumber -= 100;
      }
    } else {
      yearNumber = Number(rawYear);
    }
    const iso = `${String(yearNumber).padStart(4, '0')}-${month}-${day}`;
    return { iso, keyword: '', display: formatDisplayDate(new Date(iso)) };
  }
  return { iso: '', keyword: trimmed.toLowerCase(), display: trimmed, label: trimmed };
}

// WHAT: normalize free-form time text into HH:MM plus optional keyword.
// WHY: time fields accept natural phrases (“morning”, “now”) that must serialize cleanly.
// HOW: favor explicit HH:MM strings, map common words (morning/now/etc.) to canonical times, otherwise carry the keyword so the backend knows it still needs clarification.
function parseTimeInput(value) {
  if (!value) return { time: '', keyword: '' };
  const trimmed = stripOptionDisplaySuffix(value).trim();
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

function normalizeCalendarDateInput(text) {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.includes('T')) {
    return trimmed;
  }
  const [datePart, timePart] = trimmed.split(/\s+/);
  const dateInfo = parseDateInput(datePart, new Date());
  if (!dateInfo.iso) {
    return trimmed;
  }
  const timeInfo = parseTimeInput(timePart || '');
  const timeValue = timeInfo.time || '09:00';
  return `${dateInfo.iso}T${timeValue}`;
}

// WHAT: format ISO `YYYY-MM-DD` (optionally with time) strings as Danish `DD-MM-YYYY`.
// WHY: reviewers operate in Danish locales and expect day-first ordering everywhere in the UI.
// HOW: detect ISO-like strings, flip the components, preserve HH:MM if present, and fall back to the original text otherwise.
function formatDanishDateString(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!match) {
    return value;
  }
  const [, year, month, day, time] = match;
  const dateText = `${day}-${month}-${year}`;
  return time ? `${dateText} ${time}` : dateText;
}

// WHAT: auto-populate fields when a reviewer picks an entity from the dropdown.
// WHY: selecting a todo/calendar entry should bring in its metadata to reduce manual edits.
// HOW: find the matching store entry, run the tool-specific `hydrate`, and populate both visible/hidden fields so selecting an ID instantly fills the editor.
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

// WHAT: sync pagination labels/buttons for the pending queue.
// WHY: reviewers need to see how many cards remain and page through safely.
// HOW: refresh the inline counter, page label, and pagination button states so reviewers always know where they are in the queue without guessing.
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
  if (el.relatedPromptsInput && document.activeElement === el.relatedPromptsInput) {
    updateRelatedPromptOptions();
  } else {
    hideRelatedPromptOptions();
  }
  renderIntendedEntities();
}

// WHAT: guard to decide whether Intended Entities UI should appear.
// WHY: only certain tool/action combos (list/find) can return multiple entities to label.
// HOW: normalize the action name (respecting aliases) and check intent/action allowlists before rendering the Intended Entities row.
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
  if (document.activeElement === el.entitySearchInput) {
    updateEntityOptions(el.entitySearchInput.value);
  } else {
    hideEntityOptions();
  }
}

// WHAT: convert the current tool’s store rows into Intended Entity suggestions.
// WHY: list/find reviewers need to tag which entries the system attempted to surface.
// HOW: reuse `getEntityOptions` output but flatten it to `{id,title}` pairs so the Intended Entities dropdown can show lightweight chips regardless of tool schema.
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

// WHAT: show the Related Prompts dropdown with conversational suggestions.
// WHY: reviewers often need to tag follow-up utterances without typing them manually.
// HOW: pull the merged suggestions, filter by the current search text, and render clickable rows so reviewers can attach context to the selected pending card without retyping.
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

// WHAT: close the Related Prompts dropdown when focus moves away.
// WHY: prevents overlapping menus and accidental chip additions.
// HOW: hide the suggestion list and clear its contents.
function hideRelatedPromptOptions() {
  if (el.relatedPromptsOptions) {
    el.relatedPromptsOptions.classList.add('hidden');
    el.relatedPromptsOptions.innerHTML = '';
  }
}

// WHAT: remove the floating editor panel from whichever card it was attached to.
// WHY: ensures only one pending intent owns the editor at a time and avoids duplicate DOM nodes.
// HOW: detach the panel from its parent and hide it until a new item is selected.
function detachEditorPanel() {
  if (!el.editorPanel) {
    return;
  }
  if (el.editorPanel.parentElement) {
    el.editorPanel.parentElement.removeChild(el.editorPanel);
  }
  el.editorPanel.classList.add('hidden');
}

// WHAT: mount the editor panel inside the selected pending card.
// WHY: keeps the correction form visually scoped to the active prompt.
// HOW: append the panel to the slot div and reveal it.
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
      if (state.selectedPromptId === item.prompt_id) {
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
  let hydratedFromPayload = false;
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
    hydratedFromPayload = true;
  }
  if (!stateValue.dateValue && isRequired) {
    stateValue.dateValue = 'Today';
  }
  if (!stateValue.timeValue && config.includeTime && config.defaultTime && isRequired) {
    stateValue.timeValue = config.defaultTime;
    stateValue.useDefaultTime = true;
  }
  if (hydratedFromPayload) {
    stateValue.useDefaultTime = false;
  }

  const trackedWrappers = [];
  const updateRequiredState = () => {
    if (!isRequired) return;
    const hasValue = fieldHasValue(state.correctionFields[field]);
    trackedWrappers
      .filter(Boolean)
      .forEach((wrapper) => wrapper.classList.toggle('field-required', !hasValue));
  };

  const baseLabel = getFieldLabel(intent, field);
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
      option.value = `${opt.label} (${opt.display})`;
      dataList.appendChild(option);
    });
    input.addEventListener('focus', () => {
      input.dataset.prevValue = input.value;
      input.dataset.userEdited = 'false';
      input.value = '';
    });
    input.addEventListener('blur', () => {
      if (!input.value && input.dataset.prevValue && input.dataset.userEdited !== 'true') {
        input.value = input.dataset.prevValue;
      }
      delete input.dataset.prevValue;
      delete input.dataset.userEdited;
    });
    input.addEventListener('input', () => {
      input.dataset.userEdited = 'true';
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
      option.value = `${opt.label} (${opt.time})`;
      dataList.appendChild(option);
    });
    input.addEventListener('focus', () => {
      input.dataset.prevValue = input.value;
      input.dataset.userEdited = 'false';
      input.value = '';
    });
    input.addEventListener('blur', () => {
      if (!input.value && input.dataset.prevValue && input.dataset.userEdited !== 'true') {
        input.value = input.dataset.prevValue;
      }
      delete input.dataset.prevValue;
      delete input.dataset.userEdited;
    });
    input.addEventListener('input', () => {
      input.dataset.userEdited = 'true';
      stateValue.timeValue = input.value;
      stateValue.useDefaultTime = false;
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
    dateLabel.textContent = `${baseLabel} Date`;
    dateWrapper.appendChild(dateLabel);
    dateWrapper.appendChild(buildDateInput());
    applyFieldLayout(dateWrapper, intent, action, `${field}-date`);
    targetGrid.appendChild(dateWrapper);
    if (isRequired) {
      trackedWrappers.push(dateWrapper);
    }

    let timeWrapper = null;
    if (config.includeTime) {
      timeWrapper = document.createElement('div');
      timeWrapper.className = 'field-wrapper datetime-field';
      timeWrapper.dataset.field = `${field}-time`;
      const timeLabel = document.createElement('span');
      timeLabel.textContent = `${baseLabel} Time`;
      timeWrapper.appendChild(timeLabel);
      timeWrapper.appendChild(buildTimeInput());
      applyFieldLayout(timeWrapper, intent, action, `${field}-time`);
      targetGrid.appendChild(timeWrapper);
    }
    applyDateTimeFieldValue(field, config);
    updateRequiredState();
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'field-wrapper datetime-field';
  wrapper.dataset.field = field;
  const mainLabel = document.createElement('span');
  mainLabel.textContent = baseLabel;
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

// WHAT: normalize parser payloads into a flat `{fields, hidden}` structure for the editor.
// WHY: form rendering needs predictable keys regardless of tool-specific nesting.
// HOW: before the form renders we either apply a whitelist (weather/news) or fall back to canonicalization so each tool’s parser output maps cleanly into form fields.
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

// WHAT: flatten arbitrary parser payloads while keeping ancillary lookup metadata.
// WHY: CRUD tools share field components; this helper keeps their inputs consistent.
// HOW: walk every parser key, remap known fields (title/id/keywords/etc.), and collect lookup metadata so the UI always receives flat text inputs plus hidden helpers.
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

// WHAT: stringify payload values with optional joining/trimming rules.
// WHY: text inputs require strings even when parser output is arrays/objects.
// HOW: when parsers hand us arrays/objects we join or stringify them (trimming unless told otherwise) so every form control receives a plain string value.
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

// WHAT: determine if the title dropdown (vs. free text) should render for a tool/action.
// WHY: update/delete flows often pick an existing title; create flows may not.
// HOW: gate render-time logic by confirming the tool/action pair is allowed to use the title dropdown instead of a free-text input.
function supportsTitleLookup(tool, action) {
  if (!TITLE_LOOKUP_TOOLS.has(tool)) {
    return false;
  }
  if (!action) {
    return true;
  }
  return TITLE_LOOKUP_ACTIONS.has(action);
}

// WHAT: derive which fields to show for the correction form.
// WHY: each tool/action needs a tailored set of inputs (e.g., todo find shows keywords only).
// HOW: inspect tool overrides plus parser payload keys, merge them with required/extras, and dedupe so `renderDynamicFields` gets a definitive ordered list per tool/action.
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

// WHAT: determine whether a field is mandatory for the current tool/action.
// WHY: drives validation badges and button enablement.
// HOW: consult action-specific overrides first, then fall back to tool defaults (with exceptions like todo-list list) so validation mirrors tool constraints.
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

// WHAT: build the correction form inputs for the selected tool/action.
// WHY: reviewers must edit structured payloads that differ for each workflow.
// HOW: derive the field list, render the right control type (select, textarea, datetime) with hydrated values, and place it according to layout metadata so the correction editor always mirrors the parser payload.
function renderDynamicFields(tool, action) {
  if (!el.dynamicFieldGrid) return;
  const normalizedAction = normalizeActionName(tool, action);
  const targetGrid = el.dynamicFieldGrid;
  targetGrid.innerHTML = '';
  targetGrid.classList.toggle('calendar-layout', tool === 'calendar_edit');
  if (tool === 'app_guide') {
    state.notesComboboxes = new Set();
  } else {
    state.notesComboboxes = null;
  }
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
    label.textContent = getFieldLabel(tool, field);
    wrapper.appendChild(label);
    if (required && !fieldHasValue(state.correctionFields[field])) {
      wrapper.classList.add('field-required');
    }
    const entityConfig = ENTITY_FIELD_CONFIG[tool];
    const isEntityField = entityConfig && entityConfig.field === field;
    const shouldUseTitleDropdown =
      TITLE_SELECT_TOOLS.has(tool) &&
      TITLE_SELECT_ACTIONS.has(normalizedAction) &&
      field === 'title' &&
      normalizedAction !== 'update';
    if (shouldUseTitleDropdown) {
      const container = document.createElement('div');
      container.className = 'search-input';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Search title';
      input.value = state.correctionFields[field] || state.hiddenFields.lookup_title || '';
      const datalistId = `${tool}-${field}-options`;
      input.setAttribute('list', datalistId);
      const dataList = document.createElement('datalist');
      dataList.id = datalistId;
      const options = getTitleOptions(tool);
      options.forEach(({ value, label: optionLabel }) => {
        const option = document.createElement('option');
        option.value = value;
        option.label = optionLabel;
        dataList.appendChild(option);
      });
      input.addEventListener('input', (event) => {
        const value = event.target.value;
        const prevId = state.correctionFields.id;
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
        updateCorrectButtonState();
        const idChanged = prevId !== state.correctionFields.id;
        if (idChanged) {
          renderDynamicFields(tool, normalizedAction);
        }
      });
      container.appendChild(input);
      container.appendChild(dataList);
      wrapper.appendChild(container);
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

    if (tool === 'app_guide' && field === 'title') {
      const combo = createCombobox({
        placeholder: getFieldLabel(tool, field),
        initialValue: state.correctionFields[field] ?? state.hiddenFields.lookup_title ?? '',
        getOptions: getNoteSectionTitles,
        allowCreate: true,
        onChange: (text) => {
          const value = text.trim();
          if (value) {
            state.correctionFields[field] = value;
            state.hiddenFields.lookup_title = value;
            wrapper.classList.remove('field-required');
          } else {
            delete state.correctionFields[field];
            delete state.hiddenFields.lookup_title;
            if (required) {
              wrapper.classList.add('field-required');
            }
          }
          flagReviewerChange(field);
          updateCorrectButtonState();
        },
      });
      state.notesComboboxes?.add(combo);
      wrapper.appendChild(combo.element);
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

// WHAT: display prior corrections for the selected prompt.
// WHY: reviewers need quick context on earlier edits before making another change.
// HOW: filter `state.corrected` for the active prompt id, sort versions chronologically, and render them so reviewers can preview past triggers without leaving the editor.
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

// WHAT: toggle the Trigger/Correct button label and disabled state.
// WHY: prevents reviewers from firing incomplete payloads and clarifies whether a change is mutating.
// HOW: look at the reviewer’s chosen intent/action and field values, then flip the button label (Trigger vs Correct) so submissions always reflect both requirements and whether the tool mutates data.
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
  const normalizedAction = normalizeActionName(tool, action);
  const effectiveAction = normalizedAction || action;
  const requiredFields = (TOOL_REQUIRED_FIELDS[tool] || []).filter((field) =>
    isFieldRequired(tool, effectiveAction, field),
  );
  const missingField = requiredFields.some((field) => !fieldHasValue(state.correctionFields[field]));
  const needsAction = getActionsForIntent(tool).length > 0;
  const needsCalendarTiming = tool === 'calendar_edit' && effectiveAction === 'create';
  const hasCalendarTiming =
    !needsCalendarTiming ||
    fieldHasValue(state.correctionFields.start) ||
    fieldHasValue(state.correctionFields.end);
  const ready = Boolean(reviewerIntent && (!needsAction || action) && !missingField && hasCalendarTiming);
  el.correctButton.disabled = !ready;
  const actionKey = action.trim().toLowerCase();
  el.correctButton.textContent = MUTATING_ACTIONS.has(actionKey) ? 'Trigger' : 'Correct';
}

// WHAT: populate the summary of the most recently triggered correction.
// WHY: provides a quick confirmation reference when reviewers fire multiple actions.
// HOW: populate the sidebar text/pre block with the latest record (or a placeholder) so reviewers immediately see the last action they triggered after refreshes.
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
    if (item.prompt_id) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_PROMPT, item.prompt_id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_PROMPT);
    }
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
  const normalizedAction = normalizeActionName(reviewerIntent, action);
  if (reviewerIntent === 'calendar_edit' && normalizedAction === 'create') {
    if (!correctedPayload.start && correctedPayload.end) {
      correctedPayload.start = correctedPayload.end;
    }
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
    corrected_payload: {
      ...correctedPayload,
      related_prompts: [...(state.selectedPrompt.related_prompts || [])],
      intended_entities: supportsIntendedEntities(reviewerIntent, action)
        ? [...(state.intendedEntities || [])]
        : [],
    },
  };
}

// WHAT: merge live-added pending prompts into state without waiting for the next refresh.
// WHY: keeps the queue responsive when new router decisions arrive from the chat endpoint.
// HOW: normalize the record, insert/update it in `state.pending`, and preserve reviewer edits when possible.
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

// WHAT: send the reviewer’s corrected payload to the backend and refresh derived views.
// WHY: this is the core action (Trigger/Correct) that persists fixes and mutates stores.
// HOW: gather form data, POST to `/api/logs/label`, update local queues/stores, and surface toast feedback.
async function submitCorrection() {
  const payload = gatherCorrectionPayload();
  if (!payload) {
    showToast('Select a prompt and fill the required fields first.');
    return;
  }
  const reviewerAction = (payload.action || payload.corrected_payload?.action || '').toLowerCase();
  const titleValue = (payload.corrected_payload?.title || '').trim();
  const isDuplicateTraining =
    reviewerAction === 'create' && hasDuplicateTitle(payload.tool, titleValue);
  if (isDuplicateTraining && !state.duplicateConfirmations[payload.prompt_id]) {
    state.duplicateConfirmations[payload.prompt_id] = true;
    showToast('Duplicate will only be added to training data');
    updateCorrectButtonState();
    return;
  }
  if (isDuplicateTraining && state.duplicateConfirmations[payload.prompt_id]) {
    payload.training_duplicate = true;
  } else if (!isDuplicateTraining && state.duplicateConfirmations[payload.prompt_id]) {
    delete state.duplicateConfirmations[payload.prompt_id];
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
    const toastMessage = payload.training_duplicate ? 'Duplicate added to training data' : 'Action triggered';
    showToast(toastMessage);
    delete state.duplicateConfirmations[payload.prompt_id];
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

// WHAT: remove a pending intent without labeling it.
// WHY: lets reviewers triage noise or duplicates quickly.
// HOW: issue DELETE `/api/logs/pending/{id}`, clear selection if needed, and reload the queue list.
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
    delete state.duplicateConfirmations[item.prompt_id];
    await loadPending();
  } catch (err) {
    showToast(err.message || 'Deletion failed', 'error');
  }
}

// WHAT: display the classifier audit table inside the Training tab.
// WHY: reviewers monitor low-confidence ML predictions to guide retraining.
// HOW: iterate `state.classifier`, render each row with classifier vs. reviewer intent plus success flag styling.
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

// WHAT: render the labeled prompt pairs table with predicted vs. corrected payloads.
// WHY: gives reviewers an overview of recent training data and an option to delete test entries.
// HOW: pretty-print both payloads in `<pre>` blocks and wire delete buttons to `/api/logs/corrected` so the Training view doubles as a lightweight QA surface.
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

// WHAT: update the stats sidebar cards (pending counts, classifier backlog, etc.).
// WHY: provides at-a-glance telemetry for Tier‑5 reviewers.
// HOW: read `state.stats` and update the DOM counters/breakdowns (plus sample pending chips) so reviewers can gauge queue health without opening other tabs.
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
  // Purge reminder
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

  // Training reminder
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

// WHAT: helper to sort arrays descending by timestamp-like keys.
// WHY: multiple data panels (todos/kitchen/etc.) want most recent entries first.
// HOW: clone each list and sort by the chosen timestamp so todo/calendar/kitchen panels always show the freshest entries first.
function sortNewestFirst(list, key = 'timestamp') {
  return [...(list || [])].sort((a, b) => {
    const aVal = a[key] || a.created_at || a.id || 0;
    const bVal = b[key] || b.created_at || b.id || 0;
    return aVal < bVal ? 1 : -1;
  });
}

// WHAT: ensure per-action todo CRUD state exists.
// WHY: the Data Stores panel now hosts create/update editors that track their own values.
// HOW: lazily materialize the state slice and guarantee a display map for fields (e.g., deadline text).
function getTodoFormState(action) {
  if (!state.todoCrud[action]) {
    state.todoCrud[action] = createTodoFormState(action);
  }
  if (!state.todoCrud[action].display) {
    state.todoCrud[action].display = {};
  }
  return state.todoCrud[action];
}

// WHAT: reset the todo CRUD form for the given action to its defaults.
// WHY: after successful submissions we need a clean slate mirroring the pending editor behavior.
// HOW: recreate the action's state bucket via `createTodoFormState`.
function resetTodoForm(action) {
  state.todoCrud[action] = createTodoFormState(action);
}

function getActiveTodoAction() {
  return state.todoCrud.activeAction === 'update' ? 'update' : 'create';
}

function setTodoCrudAction(action) {
  const normalized = action === 'update' ? 'update' : 'create';
  state.todoCrud.activeAction = normalized;
  if (normalized !== 'update') {
    clearSelectedDataRow('todos');
    renderTodos();
  }
  renderTodoCrudForm();
}

// WHAT: toggle submit button disabled state for todo forms.
// WHY: reviewers shouldn't fire create/update without required fields (title/deadline/id).
// HOW: validate the stored values per action config and flip the corresponding button.
function updateTodoFormButtonState(action) {
  const button = el.todoCrudSubmit;
  if (!button) return;
  const targetAction = action || getActiveTodoAction();
  const formState = getTodoFormState(targetAction);
  const requiredFields = TOOL_ACTION_FIELD_CONFIG.todo_list?.[targetAction]?.required || [];
  const isValid = requiredFields.every((field) => fieldHasValue(formState.values[field]));
  button.disabled = !isValid;
}

// WHAT: update a field inside the todo CRUD state.
// WHY: dynamic inputs need to keep state in sync so payloads serialize correctly.
// HOW: optionally trim strings, drop empty values, and re-run validation when a value changes.
function setTodoFormValue(action, field, value, options = {}) {
  if (!field) return;
  const formState = getTodoFormState(action);
  let next = value;
  if (typeof next === 'string' && !options.preserveSpacing) {
    next = next.trim();
  }
  if (next === '' || next === null || next === undefined) {
    delete formState.values[field];
  } else {
    formState.values[field] = next;
  }
  updateTodoFormButtonState(action);
}

// WHAT: capture date input text for deadline fields and normalize to ISO when possible.
// WHY: the UI accepts natural language (“tomorrow”) but the tool prefers canonical dates.
// HOW: persist the raw text for display and run it through `parseDateInput` to populate the payload value.
function handleTodoDeadlineInput(action, field, text) {
  const formState = getTodoFormState(action);
  if (!formState.display) {
    formState.display = {};
  }
  formState.display[field] = text;
  const trimmed = text.trim();
  if (!trimmed) {
    delete formState.values[field];
    updateTodoFormButtonState(action);
    return;
  }
  const parsed = parseDateInput(trimmed, new Date());
  formState.values[field] = parsed.iso || trimmed;
  updateTodoFormButtonState(action);
}

// WHAT: render a deadline input with relative date suggestions.
// WHY: reviewers expect the same “today/tomorrow” helper from the pending editor.
// HOW: build an input + datalist pair and wire it to `handleTodoDeadlineInput`.
function buildTodoDeadlineInput(action, field, value, required, wrapper) {
  const container = document.createElement('div');
  container.className = 'search-input';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '';
  input.value = value || '';
  const listId = `todo-${action}-${field}-options`;
  input.setAttribute('list', listId);
  const dataList = document.createElement('datalist');
  dataList.id = listId;
  buildRelativeDateOptions(new Date()).forEach((opt) => {
    const option = document.createElement('option');
    option.value = `${opt.label} (${opt.display})`;
    dataList.appendChild(option);
  });
  input.addEventListener('input', (event) => {
    handleTodoDeadlineInput(action, field, event.target.value);
    if (required) {
      const hasValue = fieldHasValue(getTodoFormState(action).values[field]);
      wrapper.classList.toggle('field-required', !hasValue);
    }
  });
  container.appendChild(input);
  container.appendChild(dataList);
  return container;
}

// WHAT: hydrate the update form fields when an existing todo id is selected.
// WHY: mimics the entity dropdown in the pending editor so reviewers don't retype payloads.
// HOW: find the matching store entry, run the todo hydrate helper, merge into state, then rerender.
function hydrateTodoFormFromId(entityId) {
  if (!entityId) return;
  const config = ENTITY_FIELD_CONFIG.todo_list;
  if (!config) return;
  const entries = state.dataStores[config.store] || [];
  const match = entries.find((entry) => String(entry[config.field] || entry.id) === String(entityId));
  if (!match) return;
  const hydrated = config.hydrate(match);
  const formState = getTodoFormState('update');
  Object.entries(hydrated).forEach(([key, value]) => {
    if (key === 'deadline') {
      formState.display[key] = value ? formatDanishDateString(value) : '';
    }
    if (value === null || value === undefined || value === '') {
      delete formState.values[key];
    } else {
      formState.values[key] = value;
    }
  });
}

// WHAT: enter update mode when a todo row is selected.
// WHY: reviewers click table rows to edit existing entries without juggling multiple forms.
// HOW: hydrate the update form with the row’s payload, switch the active action, and scroll the form into view.
function selectTodoForUpdate(todo, options = {}) {
  if (!todo || !todo.id) return;
  hydrateTodoFormFromId(todo.id);
  setSelectedDataRow('todos', todo.id);
  setTodoCrudAction('update');
  if (options.scroll !== false && el.todoCrudForm) {
    el.todoCrudForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  renderTodos();
}

// WHAT: build the todo id `<select>` element for update forms.
// WHY: lets reviewers pick an existing entry and auto-fill the rest of the fields.
// HOW: populate options from the cached store, sync selection state, and hook up hydration on change.
function buildTodoIdSelect(action, currentValue, required, wrapper) {
  const select = document.createElement('select');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose todo';
  select.appendChild(placeholder);
  const entries = state.dataStores.todos || [];
  entries.forEach((todo) => {
    const option = document.createElement('option');
    option.value = String(todo.id);
    option.textContent = `${todo.title || 'Untitled'} (#${todo.id})`;
    select.appendChild(option);
  });
  select.value = currentValue ? String(currentValue) : '';
  select.addEventListener('change', (event) => {
    const value = event.target.value;
    setTodoFormValue(action, 'id', value);
    if (required) {
      const hasValue = fieldHasValue(getTodoFormState(action).values.id);
      wrapper.classList.toggle('field-required', !hasValue);
    }
    if (value) {
      hydrateTodoFormFromId(value);
      renderTodoCrudForm();
      setSelectedDataRow('todos', value);
      renderTodos();
    } else {
      clearSelectedDataRow('todos');
      renderTodos();
    }
  });
  return select;
}

// WHAT: render the todo create/update forms using the shared field layout.
// WHY: Data Stores now mirror the pending editor experience, so we need dynamic grids per action.
// HOW: iterate the configured fields, attach the right controls (text/select/datetime), and honor required styling/layout metadata.
function renderTodoActionForm(action) {
  const grid = el.todoCrudGrid;
  if (!grid) return;
  const config = TOOL_ACTION_FIELD_CONFIG.todo_list?.[action];
  const fields = config?.fields || [];
  grid.innerHTML = '';
  if (!fields.length) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'No fields configured for this action.';
    grid.appendChild(hint);
    return;
  }
  const formState = getTodoFormState(action);
  fields.forEach((field) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'field-wrapper';
    wrapper.dataset.field = field;
    const label = document.createElement('span');
    label.textContent = getFieldLabel('todo_list', field);
    wrapper.appendChild(label);
    const required = isFieldRequired('todo_list', action, field);
    const rawValue = formState.values[field];
    const displayValue = field === 'deadline' ? formState.display?.[field] || rawValue || '' : rawValue || '';
    if (required && !fieldHasValue(rawValue)) {
      wrapper.classList.add('field-required');
    }
    let control;
    if (field === 'id') {
      control = buildTodoIdSelect(action, rawValue, required, wrapper);
    } else if (field === 'deadline') {
      control = buildTodoDeadlineInput(action, field, displayValue, required, wrapper);
    } else {
      const fieldConfig = FIELD_LIBRARY[field] || {};
      control =
        fieldConfig.control?.() ||
        (fieldConfig.type === 'textarea' ? document.createElement('textarea') : document.createElement('input'));
      control.value = displayValue || '';
      if (!fieldConfig.control && fieldConfig.type !== 'textarea') {
        control.type = 'text';
      }
      const eventName = control.tagName === 'SELECT' ? 'change' : 'input';
      control.addEventListener(eventName, (event) => {
        const value = event.target.value;
        setTodoFormValue(action, field, value, { preserveSpacing: field === 'content' });
        if (required) {
          const hasValue = fieldHasValue(getTodoFormState(action).values[field]);
          wrapper.classList.toggle('field-required', !hasValue);
        }
      });
    }
    wrapper.appendChild(control);
    applyFieldLayout(wrapper, 'todo_list', action, field);
    grid.appendChild(wrapper);
  });
  updateTodoFormButtonState(action);
}

// WHAT: render the single Todo CRUD form using whichever action is active.
// WHY: the dashboard now uses one form that flips between create/update when rows are selected.
// HOW: render the configured fields, update header text/button styles, and show/hide the reset button.
function renderTodoCrudForm() {
  const action = getActiveTodoAction();
  renderTodoActionForm(action);
  if (el.todoCrudTitle) {
    el.todoCrudTitle.textContent = action === 'create' ? 'Create Todo' : 'Update Todo';
  }
  if (el.todoCrudSubmit) {
    el.todoCrudSubmit.textContent = action === 'create' ? 'Create Todo' : 'Update Todo';
    el.todoCrudSubmit.classList.toggle('primary', action === 'create');
    el.todoCrudSubmit.classList.toggle('secondary', action !== 'create');
  }
  if (el.todoCrudReset) {
    el.todoCrudReset.classList.toggle('hidden', action === 'create');
  }
  updateTodoFormButtonState(action);
}

// WHAT: serialize the todo CRUD state into a mutate payload.
// WHY: the Data Stores endpoint expects action + tool fields, same as pending corrections.
// HOW: copy non-empty values from the per-action state into a new object.
function buildTodoPayload(action) {
  const formState = getTodoFormState(action);
  const payload = { action };
  Object.entries(formState.values).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      payload[key] = key === 'content' ? value : trimmed;
    } else {
      payload[key] = value;
    }
  });
  return payload;
}

// WHAT: submit the Data Stores todo form for the given action.
// WHY: create/update buttons should reuse the same mutate endpoint as pending corrections.
// HOW: build the payload, run `mutateStore`, and reset the create form on success.
async function handleTodoFormSubmit(action) {
  const targetAction = action || getActiveTodoAction();
  const payload = buildTodoPayload(targetAction);
  if (!payload) return;
  const success = await mutateStore('todos', payload);
  if (success && targetAction === 'create') {
    resetTodoForm('create');
    setTodoCrudAction('create');
  } else if (success && targetAction === 'update' && payload.id) {
    hydrateTodoFormFromId(payload.id);
    renderTodoCrudForm();
  } else if (!success && targetAction === 'create') {
    renderTodoCrudForm();
  }
}

// WHAT: derive comparable text values for todo sorting.
// WHY: Title/status sorts should be case-insensitive and stable.
// HOW: normalize to lowercase strings for the requested column.
function getTodoTextValue(todo, column) {
  if (column === 'status') {
    return (todo.status || '').toLowerCase();
  }
  return (todo.title || '').toLowerCase();
}

// WHAT: convert deadline strings into sortable timestamps.
// WHY: deadlines may be natural language, so we translate them into actual dates for ordering.
// HOW: reuse the date parser to get ISO strings and then feed them to `Date.parse`.
function getTodoDeadlineTimestamp(value) {
  if (!value) return null;
  const parsed = parseDateInput(value, new Date());
  const iso = parsed.iso || value;
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? null : ts;
}

function getCalendarTimestamp(value) {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

// WHAT: sort todos according to the active header selection.
// WHY: reviewers need to pivot between title/status/soonest-deadline views without leaving the page.
// HOW: clone the list, compare values per column (with deadline-specific handling), and fall back to title to break ties.
function sortTodosByState(list) {
  const { column, direction } = state.todoSort;
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...(list || [])].sort((a, b) => {
    if (column === 'deadline') {
      const aTs = getTodoDeadlineTimestamp(a.deadline);
      const bTs = getTodoDeadlineTimestamp(b.deadline);
      const fallback = direction === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      const aValue = aTs === null ? fallback : aTs;
      const bValue = bTs === null ? fallback : bTs;
      if (aValue !== bValue) {
        return aValue > bValue ? multiplier : -multiplier;
      }
    } else {
      const aValue = getTodoTextValue(a, column);
      const bValue = getTodoTextValue(b, column);
      if (aValue !== bValue) {
        return aValue > bValue ? multiplier : -multiplier;
      }
    }
    return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
  });
}

function sortCalendarEvents(list) {
  const { column, direction } = state.calendarSort;
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...(list || [])].sort((a, b) => {
    if (column === 'end') {
      const aTs = getCalendarTimestamp(a.end);
      const bTs = getCalendarTimestamp(b.end);
      const fallback = direction === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      const aValue = aTs === null ? fallback : aTs;
      const bValue = bTs === null ? fallback : bTs;
      if (aValue !== bValue) {
        return aValue > bValue ? multiplier : -multiplier;
      }
    } else if (column === 'title') {
      const aValue = (a.title || '').toLowerCase();
      const bValue = (b.title || '').toLowerCase();
      if (aValue !== bValue) {
        return aValue > bValue ? multiplier : -multiplier;
      }
    } else if (column === 'content') {
      const aValue = (a.content || '').toLowerCase();
      const bValue = (b.content || '').toLowerCase();
      if (aValue !== bValue) {
        return aValue > bValue ? multiplier : -multiplier;
      }
    }
    return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
  });
}

// WHAT: toggle the active todo sort column/direction.
// WHY: clicking column headers should flip between ascending/descending ordering.
// HOW: update the `state.todoSort` metadata and rerender the table.
function setTodoSort(column) {
  if (!column) return;
  if (state.todoSort.column === column) {
    state.todoSort.direction = state.todoSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.todoSort.column = column;
    state.todoSort.direction = column === 'deadline' ? 'asc' : 'asc';
  }
  renderTodos();
}

function setCalendarSort(column) {
  if (!column) return;
  if (state.calendarSort.column === column) {
    state.calendarSort.direction = state.calendarSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.calendarSort.column = column;
    state.calendarSort.direction = column === 'end' ? 'desc' : 'asc';
  }
  renderCalendar();
}

// WHAT: reflect the current sort state in the header buttons.
// WHY: reviewers need visual cues for which column/direction is active.
// HOW: walk the todos header buttons and set/remove a `data-sort-state` attribute.
function renderTodoSortIndicators() {
  if (!el.todoSortButtons) return;
  el.todoSortButtons.forEach((button) => {
    if (button.dataset.todoSort === state.todoSort.column) {
      button.dataset.sortState = state.todoSort.direction;
    } else {
      button.removeAttribute('data-sort-state');
    }
  });
}

function renderCalendarSortIndicators() {
  if (!el.calendarSortButtons) return;
  el.calendarSortButtons.forEach((button) => {
    if (button.dataset.calendarSort === state.calendarSort.column) {
      button.dataset.sortState = state.calendarSort.direction;
    } else {
      button.removeAttribute('data-sort-state');
    }
  });
}

// WHAT: populate the Todos data panel with current store entries.
// WHY: reviewers need quick visibility into persisted todos for context and manual QA.
// HOW: sort cached store items, build list rows with key metadata, and inject into the DOM.
function renderTodos() {
  if (!el.todosPanel) return;
  el.todosPanel.innerHTML = '';
  const rows = sortTodosByState(state.dataStores.todos);
  const selectedTodoId = getSelectedDataRow('todos');
  const highlightActive = getActiveTodoAction() === 'update' && selectedTodoId;
  rows.forEach((todo) => {
    const tr = document.createElement('tr');
    if (todo.id) {
      tr.dataset.todoId = todo.id;
    }
    if (highlightActive && String(selectedTodoId) === String(todo.id)) {
      tr.classList.add('selected-row');
    }
    const title = document.createElement('td');
    title.className = 'col-title';
    title.textContent = todo.title || 'Untitled';
    const status = document.createElement('td');
    status.className = 'col-status';
    status.textContent = todo.status || 'pending';
    const deadline = document.createElement('td');
    deadline.className = 'col-deadline';
    const deadlineText = todo.deadline ? formatDanishDateString(todo.deadline) : '—';
    deadline.textContent = deadlineText;
    const actions = document.createElement('td');
    actions.className = 'col-actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'button ghost';
    deleteBtn.textContent = 'Delete';
    deleteBtn.disabled = !todo.id;
    deleteBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!todo.id) return;
      deleteBtn.disabled = true;
      try {
        await mutateStore('todos', {
          action: 'delete',
          id: todo.id,
          title: todo.title,
        });
      } finally {
        deleteBtn.disabled = false;
      }
    });
    actions.appendChild(deleteBtn);
    tr.appendChild(title);
    tr.appendChild(status);
    tr.appendChild(deadline);
    tr.appendChild(actions);
    tr.addEventListener('click', () => {
      selectTodoForUpdate(todo);
    });
    el.todosPanel.appendChild(tr);
  });
  renderTodoSortIndicators();
}

function applyTodoSelectionFromState() {
  const selectedId = getSelectedDataRow('todos');
  if (!selectedId) {
    if (getActiveTodoAction() === 'update') {
      setTodoCrudAction('create');
    }
    return;
  }
  const match = (state.dataStores.todos || []).find(
    (todo) => String(todo.id) === String(selectedId),
  );
  if (!match) {
    clearSelectedDataRow('todos');
    if (getActiveTodoAction() === 'update') {
      setTodoCrudAction('create');
    }
    return;
  }
  hydrateTodoFormFromId(match.id);
  setTodoCrudAction('update');
  renderTodos();
}

function getKitchenTextValue(tip, column) {
  if (column === 'keywords') {
    if (Array.isArray(tip.keywords)) {
      return tip.keywords.join(', ').toLowerCase();
    }
    if (typeof tip.keywords === 'string') {
      return tip.keywords.toLowerCase();
    }
    return '';
  }
  if (column === 'content') {
    return (tip.content || '').toLowerCase();
  }
  if (column === 'link') {
    return tip.link ? tip.link.toLowerCase() : '';
  }
  return (tip.title || '').toLowerCase();
}

function sortKitchenTips(list) {
  const { column, direction } = state.kitchenSort;
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...(list || [])].sort((a, b) => {
    const aValue = getKitchenTextValue(a, column);
    const bValue = getKitchenTextValue(b, column);
    if (aValue !== bValue) {
      return aValue > bValue ? multiplier : -multiplier;
    }
    return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
  });
}

function setKitchenSort(column) {
  if (!column) return;
  if (state.kitchenSort.column === column) {
    state.kitchenSort.direction = state.kitchenSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.kitchenSort.column = column;
    state.kitchenSort.direction = column === 'title' ? 'asc' : 'asc';
  }
  renderKitchen();
}

function renderKitchenSortIndicators() {
  if (!el.kitchenSortButtons) return;
  el.kitchenSortButtons.forEach((button) => {
    if (button.dataset.kitchenSort === state.kitchenSort.column) {
      button.dataset.sortState = state.kitchenSort.direction;
    } else {
      button.removeAttribute('data-sort-state');
    }
  });
}

function getKitchenFormState(action) {
  if (!state.kitchenCrud[action]) {
    state.kitchenCrud[action] = createKitchenFormState(action);
  }
  return state.kitchenCrud[action];
}

function resetKitchenForm(action) {
  state.kitchenCrud[action] = createKitchenFormState(action);
}

function getActiveKitchenAction() {
  return state.kitchenCrud.activeAction === 'update' ? 'update' : 'create';
}

function setKitchenCrudAction(action) {
  const normalized = action === 'update' ? 'update' : 'create';
  state.kitchenCrud.activeAction = normalized;
  if (normalized !== 'update') {
    clearSelectedDataRow('kitchen_tips');
    renderKitchen();
  }
  renderKitchenCrudForm();
}

function updateKitchenFormButtonState(action) {
  const button = el.kitchenCrudSubmit;
  if (!button) return;
  const targetAction = action || getActiveKitchenAction();
  const formState = getKitchenFormState(targetAction);
  const requiredFields = TOOL_ACTION_FIELD_CONFIG.kitchen_tips?.[targetAction]?.required || [];
  const isValid = requiredFields.every((field) => fieldHasValue(formState.values[field]));
  button.disabled = !isValid;
}

function setKitchenFormValue(action, field, value, options = {}) {
  if (!field) return;
  const formState = getKitchenFormState(action);
  let next = value;
  if (typeof next === 'string' && !options.preserveSpacing) {
    next = next.trim();
  }
  if (next === '' || next === null || next === undefined) {
    if (field === 'keywords' && next === '') {
      formState.values[field] = '';
    } else {
      delete formState.values[field];
    }
  } else {
    formState.values[field] = next;
  }
  updateKitchenFormButtonState(action);
}

function buildKitchenIdSelect(action, currentValue, required, wrapper) {
  const select = document.createElement('select');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose tip';
  select.appendChild(placeholder);
  const entries = state.dataStores.kitchen_tips || [];
  entries.forEach((tip) => {
    const option = document.createElement('option');
    option.value = String(tip.id);
    option.textContent = `${tip.title || 'Untitled'} (#${tip.id})`;
    select.appendChild(option);
  });
  select.value = currentValue ? String(currentValue) : '';
  select.addEventListener('change', (event) => {
    const value = event.target.value;
    setKitchenFormValue(action, 'id', value);
    if (required) {
      const hasValue = fieldHasValue(getKitchenFormState(action).values.id);
      wrapper.classList.toggle('field-required', !hasValue);
    }
    if (value) {
      hydrateKitchenFormFromId(value);
      renderKitchenCrudForm();
      setSelectedDataRow('kitchen_tips', value);
      renderKitchen();
    } else {
      clearSelectedDataRow('kitchen_tips');
      renderKitchen();
    }
  });
  return select;
}

function renderKitchenActionForm(action) {
  const grid = el.kitchenCrudGrid;
  if (!grid) return;
  const config = TOOL_ACTION_FIELD_CONFIG.kitchen_tips?.[action];
  const fields = config?.fields || [];
  grid.innerHTML = '';
  if (!fields.length) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'No fields configured for this action.';
    grid.appendChild(hint);
    return;
  }
  const formState = getKitchenFormState(action);
  fields.forEach((field) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'field-wrapper';
    wrapper.dataset.field = field;
    const label = document.createElement('span');
    label.textContent = getFieldLabel('kitchen_tips', field);
    wrapper.appendChild(label);
    const required = isFieldRequired('kitchen_tips', action, field);
    const rawValue = formState.values[field];
    if (required && !fieldHasValue(rawValue)) {
      wrapper.classList.add('field-required');
    }
    let control;
    if (field === 'id') {
      control = buildKitchenIdSelect(action, rawValue, required, wrapper);
    } else {
      const fieldConfig = FIELD_LIBRARY[field] || {};
      control =
        fieldConfig.control?.() ||
        (field === 'content' ? document.createElement('textarea') : document.createElement('input'));
      if (control.tagName === 'INPUT') {
        control.type = 'text';
      }
      control.value = rawValue || '';
      control.addEventListener('input', (event) => {
        setKitchenFormValue(action, field, event.target.value, { preserveSpacing: field === 'content' });
        if (required) {
          const hasValue = fieldHasValue(getKitchenFormState(action).values[field]);
          wrapper.classList.toggle('field-required', !hasValue);
        }
      });
    }
    wrapper.appendChild(control);
    applyFieldLayout(wrapper, 'kitchen_tips', action, field);
    grid.appendChild(wrapper);
  });
  updateKitchenFormButtonState(action);
}

function renderKitchenCrudForm() {
  const action = getActiveKitchenAction();
  renderKitchenActionForm(action);
  if (el.kitchenCrudTitle) {
    el.kitchenCrudTitle.textContent = action === 'create' ? 'Create Tip' : 'Update Tip';
  }
  if (el.kitchenCrudSubmit) {
    el.kitchenCrudSubmit.textContent = action === 'create' ? 'Create Tip' : 'Update Tip';
    el.kitchenCrudSubmit.classList.toggle('primary', action === 'create');
    el.kitchenCrudSubmit.classList.toggle('secondary', action !== 'create');
  }
  if (el.kitchenCrudReset) {
    el.kitchenCrudReset.classList.toggle('hidden', action === 'create');
  }
  updateKitchenFormButtonState(action);
}

function buildKitchenPayload(action) {
  const formState = getKitchenFormState(action);
  const payload = { action };
  Object.entries(formState.values).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'string') {
      if (key === 'keywords') {
        const keywords = value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
        payload[key] = keywords;
        return;
      }
      const text = key === 'content' ? value : value.trim();
      if (!text) {
        return;
      }
      payload[key] = key === 'content' ? value : text;
    } else {
      payload[key] = value;
    }
  });
  return payload;
}

async function handleKitchenFormSubmit(action) {
  const targetAction = action || getActiveKitchenAction();
  const payload = buildKitchenPayload(targetAction);
  if (!payload) return;
  const success = await mutateStore('kitchen_tips', payload);
  if (success && targetAction === 'create') {
    resetKitchenForm('create');
    setKitchenCrudAction('create');
  } else if (success && targetAction === 'update' && payload.id) {
    hydrateKitchenFormFromId(payload.id);
    renderKitchenCrudForm();
  } else if (!success && targetAction === 'create') {
    renderKitchenCrudForm();
  }
}

function hydrateKitchenFormFromId(entityId) {
  if (!entityId) return;
  const config = ENTITY_FIELD_CONFIG.kitchen_tips;
  if (!config) return;
  const entries = state.dataStores[config.store] || [];
  const match = entries.find((entry) => String(entry[config.field] || entry.id) === String(entityId));
  if (!match) return;
  const hydrated = config.hydrate(match);
  const formState = getKitchenFormState('update');
  Object.entries(hydrated).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      delete formState.values[key];
    } else {
      formState.values[key] = value;
    }
  });
  formState.values.id = match.id;
}

function selectKitchenForUpdate(tip) {
  if (!tip || !tip.id) return;
  hydrateKitchenFormFromId(tip.id);
  setSelectedDataRow('kitchen_tips', tip.id);
  setKitchenCrudAction('update');
  if (el.kitchenCrudForm) {
    el.kitchenCrudForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  renderKitchen();
}

function applyKitchenSelectionFromState() {
  const selectedId = getSelectedDataRow('kitchen_tips');
  if (!selectedId) {
    if (getActiveKitchenAction() === 'update') {
      setKitchenCrudAction('create');
    }
    return;
  }
  const match = (state.dataStores.kitchen_tips || []).find(
    (tip) => String(tip.id) === String(selectedId),
  );
  if (!match) {
    clearSelectedDataRow('kitchen_tips');
    if (getActiveKitchenAction() === 'update') {
      setKitchenCrudAction('create');
    }
    return;
  }
  hydrateKitchenFormFromId(match.id);
  setKitchenCrudAction('update');
  renderKitchen();
}

function hydrateCalendarFormFromId(entityId) {
  if (!entityId) return;
  const config = ENTITY_FIELD_CONFIG.calendar_edit;
  if (!config) return;
  const entries = state.dataStores[config.store] || [];
  const match = entries.find((entry) => String(entry[config.field] || entry.id) === String(entityId));
  if (!match) return;
  const formState = getCalendarFormState('update');
  const fields = ['id', 'title', 'start', 'end', 'location', 'content', 'link'];
  fields.forEach((field) => {
    const value = match[field];
    if (field === 'start' || field === 'end') {
      formState.display[field] = value ? formatDanishDateString(value) : '';
      if (value) {
        formState.values[field] = value;
        setCalendarDatetimeParts(formState, field, value);
      } else {
        delete formState.values[field];
        if (formState.datetime) {
          delete formState.datetime[field];
        }
      }
    } else if (value === null || value === undefined || value === '') {
      delete formState.values[field];
    } else {
      formState.values[field] = field === 'content' ? value : String(value);
    }
  });
  formState.values.id = match.id;
}

function selectCalendarForUpdate(event, options = {}) {
  if (!event || !event.id) return;
  hydrateCalendarFormFromId(event.id);
  setSelectedDataRow('calendar', event.id);
  setCalendarCrudAction('update');
  if (options.scroll !== false && el.calendarCrudForm) {
    el.calendarCrudForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  renderCalendar();
}

function getCalendarFormState(action) {
  if (!state.calendarCrud[action]) {
    state.calendarCrud[action] = createCalendarFormState(action);
  }
  if (!state.calendarCrud[action].display) {
    state.calendarCrud[action].display = {};
  }
  return state.calendarCrud[action];
}

function resetCalendarForm(action) {
  state.calendarCrud[action] = createCalendarFormState(action);
}

function getActiveCalendarAction() {
  return state.calendarCrud.activeAction === 'update' ? 'update' : 'create';
}

// WHAT: check if the calendar form currently includes any start/end timestamp.
// WHY: calendar create flows can now accept either field, but at least one must be present.
// HOW: reuse `fieldHasValue` so both ISO strings and natural-language hints count toward satisfying the requirement.
function calendarHasTimingValue(formState) {
  if (!formState || !formState.values) {
    return false;
  }
  return fieldHasValue(formState.values.start) || fieldHasValue(formState.values.end);
}

function setCalendarCrudAction(action) {
  const normalized = action === 'update' ? 'update' : 'create';
  state.calendarCrud.activeAction = normalized;
  if (normalized !== 'update') {
    clearSelectedDataRow('calendar');
    renderCalendar();
  }
  renderCalendarCrudForm();
}

// WHAT: clean up legacy calendar timing warnings.
// WHY: we previously highlighted datetime fields; now we only need to ensure no stale classes linger after renders.
// HOW: strip the helper class/data attribute from every datetime wrapper so only Title retains the required styling.
function updateCalendarTimingHints(action) {
  if (!el.calendarCrudGrid) return;
  const wrappers = el.calendarCrudGrid.querySelectorAll('.datetime-field');
  wrappers.forEach((wrapper) => {
    wrapper.classList.remove('calendar-timing-required');
    if (wrapper.dataset.calendarTimingRequired) {
      delete wrapper.dataset.calendarTimingRequired;
    }
  });
}

function updateCalendarFormButtonState(action) {
  const button = el.calendarCrudSubmit;
  if (!button) return;
  const targetAction = action || getActiveCalendarAction();
  const formState = getCalendarFormState(targetAction);
  const requiredFields = TOOL_ACTION_FIELD_CONFIG.calendar_edit?.[targetAction]?.required || [];
  const isValid = requiredFields.every((field) => fieldHasValue(formState.values[field]));
  const hasTiming = targetAction === 'create' ? calendarHasTimingValue(formState) : true;
  button.disabled = !(isValid && hasTiming);
  updateCalendarTimingHints(targetAction);
}

function setCalendarFormValue(action, field, value, options = {}) {
  if (!field) return;
  const formState = getCalendarFormState(action);
  let next = value;
  if (typeof next === 'string' && !options.preserveSpacing) {
    next = next.trim();
  }
  if (next === '' || next === null || next === undefined) {
    delete formState.values[field];
    if ((field === 'start' || field === 'end') && formState.datetime) {
      delete formState.datetime[field];
    }
  } else {
    formState.values[field] = next;
    if ((field === 'start' || field === 'end') && formState.datetime) {
      setCalendarDatetimeParts(formState, field, String(next));
    }
  }
  updateCalendarFormButtonState(action);
}

function splitCalendarDatetimeValue(value) {
  if (!value || typeof value !== 'string') {
    return { date: '', time: '', useDefaultTime: false };
  }
  if (value.includes('T')) {
    const [datePart, timePart] = value.split('T');
    return {
      date: datePart || '',
      time: (timePart || '').slice(0, 5),
      useDefaultTime: false,
    };
  }
  const parts = value.trim().split(/\s+/);
  return {
    date: parts[0] || '',
    time: parts.slice(1).join(' ') || '',
    useDefaultTime: false,
  };
}

function ensureCalendarDatetimeParts(action, field) {
  const formState = getCalendarFormState(action);
  if (!formState.datetime) {
    formState.datetime = {};
  }
  if (!formState.datetime[field]) {
    const existingValue = formState.values[field];
    if (typeof existingValue === 'string' && existingValue) {
      formState.datetime[field] = splitCalendarDatetimeValue(existingValue);
    } else {
      formState.datetime[field] = { date: '', time: '', useDefaultTime: true };
    }
  } else if (typeof formState.datetime[field].useDefaultTime === 'undefined') {
    formState.datetime[field].useDefaultTime = false;
  }
  return formState.datetime[field];
}

function setCalendarDatetimeParts(formState, field, value) {
  if (!formState.datetime) {
    formState.datetime = {};
  }
  if (!value) {
    delete formState.datetime[field];
    return;
  }
  formState.datetime[field] = { ...splitCalendarDatetimeValue(value), useDefaultTime: false };
}

function updateCalendarDatetimeValue(action, field) {
  const formState = getCalendarFormState(action);
  const parts = ensureCalendarDatetimeParts(action, field);
  const dateText = (parts.date || '').trim();
  const timeText = (parts.time || '').trim();
  if (!dateText) {
    delete formState.values[field];
    if (formState.display) {
      delete formState.display[field];
    }
    if (formState.datetime) {
      delete formState.datetime[field];
    }
    return;
  }
  const config = DATE_TIME_FIELD_CONFIG[field] || { includeTime: true };
  const dateInfo = parseDateInput(dateText, new Date());
  if (!dateInfo.iso) {
    const fallback = [dateText, timeText].filter(Boolean).join(' ').trim();
    if (fallback) {
      formState.values[field] = fallback;
      if (formState.display) {
        formState.display[field] = fallback;
      }
    } else {
      delete formState.values[field];
      if (formState.display) {
        delete formState.display[field];
      }
    }
    return;
  }
  if (!config.includeTime) {
    formState.values[field] = dateInfo.iso;
    if (formState.display) {
      formState.display[field] = formatDanishDateString(dateInfo.iso);
    }
    return;
  }
  const allowDefault = parts.useDefaultTime !== false && config.defaultTime;
  const defaultTime = allowDefault ? config.defaultTime : '';
  const timeSource = timeText || defaultTime || '';
  const timeInfo = parseTimeInput(timeSource);
  let timeValue = timeInfo.time || '';
  if (!timeValue && timeText) {
    timeValue = timeText;
  } else if (!timeValue && defaultTime) {
    timeValue = defaultTime;
  }
  if (!timeValue) {
    formState.values[field] = dateInfo.iso;
    if (formState.display) {
      formState.display[field] = formatDanishDateString(dateInfo.iso);
    }
    parts.time = '';
    parts.useDefaultTime = false;
    return;
  }
  if (!timeText && defaultTime) {
    parts.time = defaultTime;
    parts.useDefaultTime = true;
  } else if (!timeText) {
    parts.time = '';
    parts.useDefaultTime = false;
  } else {
    parts.useDefaultTime = false;
  }
  const isoValue = timeValue.includes('T') ? timeValue : `${dateInfo.iso}T${timeValue}`;
  formState.values[field] = isoValue;
  if (formState.display) {
    formState.display[field] = formatDanishDateString(isoValue);
  }
}

function buildCalendarDateTimeFields(action, field, required) {
  const formState = getCalendarFormState(action);
  const parts = ensureCalendarDatetimeParts(action, field);
  const wrappers = [];
  const trackedWrappers = [];
  const updateRequired = () => {
    if (!required) return;
    const hasValue = fieldHasValue(formState.values[field]);
    trackedWrappers.forEach((wrapper) => {
      wrapper.classList.toggle('field-required', !hasValue);
    });
  };

  const dateWrapper = document.createElement('div');
  dateWrapper.className = 'field-wrapper datetime-field';
  dateWrapper.dataset.field = `${field}-date`;
  const dateLabel = document.createElement('span');
  const baseLabel = getFieldLabel('calendar_edit', field);
  dateLabel.textContent = `${baseLabel} Date`;
  dateWrapper.appendChild(dateLabel);
  const dateInput = document.createElement('input');
  dateInput.type = 'text';
  dateInput.value = parts.date || '';
  const dateListId = `calendar-${action}-${field}-date-options`;
  dateInput.setAttribute('list', dateListId);
  const dateDatalist = document.createElement('datalist');
  dateDatalist.id = dateListId;
  buildRelativeDateOptions(new Date()).forEach((opt) => {
    const option = document.createElement('option');
    option.value = `${opt.label} (${opt.display})`;
    dateDatalist.appendChild(option);
  });
  dateInput.addEventListener('input', (event) => {
    const bucket = ensureCalendarDatetimeParts(action, field);
    bucket.date = event.target.value;
    if (!bucket.date || !bucket.date.trim()) {
      bucket.useDefaultTime = true;
    }
    updateCalendarDatetimeValue(action, field);
    updateRequired();
    updateCalendarFormButtonState(action);
  });
  dateWrapper.appendChild(dateInput);
  dateWrapper.appendChild(dateDatalist);
  applyFieldLayout(dateWrapper, 'calendar_edit', action, `${field}-date`);
  wrappers.push(dateWrapper);
  if (required) {
    trackedWrappers.push(dateWrapper);
  }

  const config = DATE_TIME_FIELD_CONFIG[field] || { includeTime: true };
  if (config.includeTime !== false) {
    const timeWrapper = document.createElement('div');
    timeWrapper.className = 'field-wrapper datetime-field';
    timeWrapper.dataset.field = `${field}-time`;
    const timeLabel = document.createElement('span');
      timeLabel.textContent = `${baseLabel} Time`;
    timeWrapper.appendChild(timeLabel);
    const timeInput = document.createElement('input');
    timeInput.type = 'text';
    timeInput.value = parts.time || '';
    const timeListId = `calendar-${action}-${field}-time-options`;
    timeInput.setAttribute('list', timeListId);
    const timeDatalist = document.createElement('datalist');
    timeDatalist.id = timeListId;
    buildRelativeTimeOptions(new Date()).forEach((opt) => {
      const option = document.createElement('option');
      option.value = `${opt.label} (${opt.time})`;
      timeDatalist.appendChild(option);
    });
    timeInput.addEventListener('input', (event) => {
      const bucket = ensureCalendarDatetimeParts(action, field);
      bucket.time = event.target.value;
      bucket.useDefaultTime = false;
      updateCalendarDatetimeValue(action, field);
      updateRequired();
      updateCalendarFormButtonState(action);
    });
    timeWrapper.appendChild(timeInput);
    timeWrapper.appendChild(timeDatalist);
    applyFieldLayout(timeWrapper, 'calendar_edit', action, `${field}-time`);
    wrappers.push(timeWrapper);
  }

  updateCalendarDatetimeValue(action, field);
  updateRequired();
  return wrappers;
}

function buildCalendarIdSelect(action, currentValue, required, wrapper) {
  const select = document.createElement('select');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose event';
  select.appendChild(placeholder);
  const entries = state.dataStores.calendar || [];
  entries.forEach((event) => {
    const option = document.createElement('option');
    option.value = String(event.id);
    option.textContent = `${event.title || 'Untitled'} (#${event.id})`;
    select.appendChild(option);
  });
  select.value = currentValue ? String(currentValue) : '';
  select.addEventListener('change', (event) => {
    const value = event.target.value;
    setCalendarFormValue(action, 'id', value);
    if (required) {
      const hasValue = fieldHasValue(getCalendarFormState(action).values.id);
      wrapper.classList.toggle('field-required', !hasValue);
    }
    if (value) {
      hydrateCalendarFormFromId(value);
      renderCalendarCrudForm();
      setSelectedDataRow('calendar', value);
      renderCalendar();
    } else {
      clearSelectedDataRow('calendar');
      renderCalendar();
    }
  });
  return select;
}

function renderCalendarActionForm(action) {
  const grid = el.calendarCrudGrid;
  if (!grid) return;
  const config = TOOL_ACTION_FIELD_CONFIG.calendar_edit?.[action];
  const fields = config?.fields || [];
  grid.innerHTML = '';
  const timelineEnabled = !['delete', 'find', 'list'].includes(action);
  grid.classList.toggle('calendar-layout', timelineEnabled);
  if (!fields.length) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'No fields configured for this action.';
    grid.appendChild(hint);
    return;
  }
  const formState = getCalendarFormState(action);
  fields.forEach((field) => {
    const required = isFieldRequired('calendar_edit', action, field);
    const rawValue = formState.values[field];
    if (field === 'start' || field === 'end') {
      const dateWrappers = buildCalendarDateTimeFields(action, field, required);
      dateWrappers.forEach((wrapper) => {
        grid.appendChild(wrapper);
      });
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'field-wrapper';
    wrapper.dataset.field = field;
    const label = document.createElement('span');
    label.textContent = getFieldLabel('calendar_edit', field);
    wrapper.appendChild(label);
    if (required && !fieldHasValue(rawValue)) {
      wrapper.classList.add('field-required');
    }
    let control;
    if (field === 'id') {
      control = buildCalendarIdSelect(action, rawValue, required, wrapper);
    } else {
      const fieldConfig = FIELD_LIBRARY[field] || {};
      control =
        fieldConfig.control?.() ||
        (field === 'content' ? document.createElement('textarea') : document.createElement('input'));
      if (control.tagName === 'INPUT') {
        control.type = 'text';
      }
      control.value = rawValue || '';
      control.addEventListener('input', (event) => {
        setCalendarFormValue(action, field, event.target.value, { preserveSpacing: field === 'content' });
        if (required) {
          const hasValue = fieldHasValue(getCalendarFormState(action).values[field]);
          wrapper.classList.toggle('field-required', !hasValue);
        }
      });
    }
    wrapper.appendChild(control);
    applyFieldLayout(wrapper, 'calendar_edit', action, field);
    grid.appendChild(wrapper);
  });
  updateCalendarFormButtonState(action);
}

function renderCalendarCrudForm() {
  const action = getActiveCalendarAction();
  renderCalendarActionForm(action);
  if (el.calendarCrudTitle) {
    el.calendarCrudTitle.textContent = action === 'create' ? 'Create Event' : 'Update Event';
  }
  if (el.calendarCrudSubmit) {
    el.calendarCrudSubmit.textContent = action === 'create' ? 'Create Event' : 'Update Event';
    el.calendarCrudSubmit.classList.toggle('primary', action === 'create');
    el.calendarCrudSubmit.classList.toggle('secondary', action !== 'create');
  }
  if (el.calendarCrudReset) {
    el.calendarCrudReset.classList.toggle('hidden', action === 'create');
  }
  updateCalendarFormButtonState(action);
}

function buildCalendarPayload(action) {
  const formState = getCalendarFormState(action);
  const payload = { action };
  Object.entries(formState.values).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'string') {
      const text = key === 'content' ? value : value.trim();
      if (!text) {
        return;
      }
      payload[key] = key === 'content' ? value : text;
    } else {
      payload[key] = value;
    }
  });
  if (action === 'create' && !payload.start && payload.end) {
    payload.start = payload.end;
  }
  return payload;
}

async function handleCalendarFormSubmit(action) {
  const targetAction = action || getActiveCalendarAction();
  const payload = buildCalendarPayload(targetAction);
  if (!payload) return;
  const success = await mutateStore('calendar', payload);
  if (success && targetAction === 'create') {
    resetCalendarForm('create');
    setCalendarCrudAction('create');
  } else if (success && targetAction === 'update' && payload.id) {
    hydrateCalendarFormFromId(payload.id);
    renderCalendarCrudForm();
  } else if (!success && targetAction === 'create') {
    renderCalendarCrudForm();
  }
}

// WHAT: render the calendar store list inside the Data panel.
// WHY: helps reviewers verify scheduled events after running tools.
// HOW: sort events, format start/end timestamps, and append list items with action badges.
function renderCalendar() {
  if (!el.calendarPanel) return;
  el.calendarPanel.innerHTML = '';
  const rows = sortCalendarEvents(state.dataStores.calendar);
  const selectedCalendarId = getSelectedDataRow('calendar');
  const highlightActive = getActiveCalendarAction() === 'update' && selectedCalendarId;
  rows.forEach((event) => {
    const tr = document.createElement('tr');
    if (event.id) {
      tr.dataset.calendarId = event.id;
    }
    if (highlightActive && String(selectedCalendarId) === String(event.id)) {
      tr.classList.add('selected-row');
    }
    const title = document.createElement('td');
    title.className = 'calendar-title';
    title.textContent = event.title || 'Untitled';
    const content = document.createElement('td');
    content.className = 'calendar-content';
    if (event.content) {
      const text = event.content.length > 200 ? `${event.content.slice(0, 200)}…` : event.content;
      content.textContent = text;
    } else {
      content.textContent = '—';
    }
    const end = document.createElement('td');
    end.className = 'calendar-end';
    end.textContent = event.end ? formatDanishDateString(event.end) : '—';
    const actions = document.createElement('td');
    actions.className = 'calendar-actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'button ghost';
    deleteBtn.textContent = 'Delete';
    deleteBtn.disabled = !event.id;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!event.id) return;
      deleteBtn.disabled = true;
      try {
        await mutateStore('calendar', {
          action: 'delete',
          id: event.id,
          title: event.title,
        });
      } finally {
        deleteBtn.disabled = false;
      }
    });
    actions.appendChild(deleteBtn);
    tr.appendChild(title);
    tr.appendChild(content);
    tr.appendChild(end);
    tr.appendChild(actions);
    tr.addEventListener('click', () => selectCalendarForUpdate(event));
    el.calendarPanel.appendChild(tr);
  });
}

function applyCalendarSelectionFromState() {
  const selectedId = getSelectedDataRow('calendar');
  if (!selectedId) {
    if (getActiveCalendarAction() === 'update') {
      setCalendarCrudAction('create');
    }
    return;
  }
  const match = (state.dataStores.calendar || []).find(
    (event) => String(event.id) === String(selectedId),
  );
  if (!match) {
    clearSelectedDataRow('calendar');
    if (getActiveCalendarAction() === 'update') {
      setCalendarCrudAction('create');
    }
    return;
  }
  hydrateCalendarFormFromId(match.id);
  setCalendarCrudAction('update');
  renderCalendar();
}

// WHAT: render the kitchen tips data table.
// WHY: reviewers need quick visibility into stored tips and the ability to edit/delete entries from the dashboard.
// HOW: sort using the active column, build table rows with truncated text/link badges, and attach delete/select handlers.
function renderKitchen() {
  if (!el.kitchenPanel) return;
  el.kitchenPanel.innerHTML = '';
  const rows = sortKitchenTips(state.dataStores.kitchen_tips);
  const selectedKitchenId = getSelectedDataRow('kitchen_tips');
  const highlightActive = getActiveKitchenAction() === 'update' && selectedKitchenId;
  rows.forEach((tip) => {
    const tr = document.createElement('tr');
    if (tip.id) {
      tr.dataset.kitchenId = tip.id;
    }
    if (highlightActive && String(selectedKitchenId) === String(tip.id)) {
      tr.classList.add('selected-row');
    }
    const title = document.createElement('td');
    title.className = 'kitchen-title';
    title.textContent = tip.title || 'Untitled tip';
    const content = document.createElement('td');
    content.className = 'kitchen-content';
    if (tip.content) {
      const text = tip.content.length > 200 ? `${tip.content.slice(0, 200)}…` : tip.content;
      content.textContent = text;
    } else {
      content.textContent = '—';
    }
    const keywords = document.createElement('td');
    keywords.className = 'kitchen-keywords';
    if (Array.isArray(tip.keywords) && tip.keywords.length) {
      keywords.textContent = tip.keywords.join(', ');
    } else if (typeof tip.keywords === 'string' && tip.keywords.trim()) {
      keywords.textContent = tip.keywords;
    } else {
      keywords.textContent = '—';
    }
    const linkCell = document.createElement('td');
    linkCell.className = 'kitchen-link';
    if (tip.link) {
      const anchor = document.createElement('a');
      anchor.href = tip.link;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer';
      anchor.textContent = 'Link';
      anchor.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      linkCell.appendChild(anchor);
    } else {
      const placeholder = document.createElement('span');
      placeholder.textContent = 'Link';
      placeholder.className = 'link-disabled';
      linkCell.appendChild(placeholder);
    }
    const actions = document.createElement('td');
    actions.className = 'kitchen-actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'button ghost';
    deleteBtn.textContent = 'Delete';
    deleteBtn.disabled = !tip.id;
    deleteBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!tip.id) return;
      deleteBtn.disabled = true;
      try {
        await mutateStore('kitchen_tips', {
          action: 'delete',
          id: tip.id,
          title: tip.title,
        });
      } finally {
        deleteBtn.disabled = false;
      }
    });
    actions.appendChild(deleteBtn);
    tr.appendChild(title);
    tr.appendChild(content);
    tr.appendChild(keywords);
    tr.appendChild(linkCell);
    tr.appendChild(actions);
    tr.addEventListener('click', () => selectKitchenForUpdate(tip));
    el.kitchenPanel.appendChild(tr);
  });
  renderKitchenSortIndicators();
}

// WHAT: render the Notes knowledge base section.
// WHY: mirrors other stores—lets reviewers scan Sections + content quickly.
// HOW: sort by title, show keywords/link/content snippet, and annotate with IDs.
function renderNotes() {
  if (!el.guideList) return;
  el.guideList.innerHTML = '';
  const entries = state.dataStores.app_guide || [];
  entries.forEach((entry) => {
    const wrapper = document.createElement('li');
    wrapper.className = 'notes-section';
    const canMutateSection = Boolean(entry.id);
    const header = document.createElement('div');
    header.className = 'notes-section-header';
    const titleGroup = document.createElement('div');
    titleGroup.className = 'notes-section-title-group';
    const heading = formatNotesSectionHeading(entry);
    const title = document.createElement('strong');
    title.textContent = heading.title;
    titleGroup.appendChild(title);
    if (heading.slug) {
      const slugBadge = document.createElement('span');
      slugBadge.className = 'notes-section-slug';
      slugBadge.textContent = heading.slug;
      titleGroup.appendChild(slugBadge);
    }
    header.appendChild(titleGroup);
    const deleteSection = document.createElement('button');
    deleteSection.type = 'button';
    deleteSection.className = 'button ghost notes-delete-section';
    deleteSection.textContent = 'Delete Section';
    deleteSection.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!entry.id) return;
      deleteSection.disabled = true;
      try {
        await mutateStore('app_guide', {
          action: 'delete',
          id: entry.id,
        });
      } finally {
        deleteSection.disabled = false;
      }
    });
    header.appendChild(deleteSection);
    wrapper.appendChild(header);
    if (entry.content) {
      const paragraphs = entry.content.split(/\n{2,}/).filter(Boolean);
      paragraphs.forEach((para, paraIndex) => {
        const row = document.createElement('div');
        row.className = 'notes-entry-row';
        if (canMutateSection) {
          const deleteEntry = document.createElement('button');
          deleteEntry.type = 'button';
          deleteEntry.className = 'notes-entry-delete';
          deleteEntry.setAttribute('aria-label', 'Delete entry');
          deleteEntry.textContent = '×';
          deleteEntry.addEventListener('click', async (event) => {
            event.stopPropagation();
            deleteEntry.disabled = true;
            try {
              const chunks = (entry.content || '').split(/\n{2,}/).filter(Boolean);
              if (paraIndex >= 0 && paraIndex < chunks.length) {
                chunks.splice(paraIndex, 1);
                await mutateStore('app_guide', {
                  action: 'overwrite',
                  id: entry.id,
                  title: entry.title,
                  content: chunks.join('\n\n'),
                  keywords: entry.keywords,
                  link: entry.link,
                });
              }
            } finally {
              deleteEntry.disabled = false;
            }
          });
          row.appendChild(deleteEntry);
        }
        const body = document.createElement('p');
        body.textContent = para;
        row.appendChild(body);
        wrapper.appendChild(row);
      });
    }
    if (Array.isArray(entry.keywords) && entry.keywords.length) {
      const keywords = document.createElement('div');
      keywords.className = 'notes-keywords';
      const keywordsLabel = document.createElement('span');
      keywordsLabel.className = 'notes-keywords-label';
      keywordsLabel.textContent = 'Keywords';
      keywords.appendChild(keywordsLabel);
      const keywordsList = document.createElement('div');
      keywordsList.className = 'notes-keywords-list';
      entry.keywords.forEach((keyword, keywordIndex) => {
        const chip = document.createElement('span');
        chip.className = 'notes-keyword-chip';
        const text = document.createElement('span');
        text.textContent = keyword;
        chip.appendChild(text);
        if (canMutateSection) {
          const removeKeyword = document.createElement('button');
          removeKeyword.type = 'button';
          removeKeyword.className = 'notes-keyword-remove';
          removeKeyword.setAttribute('aria-label', `Remove keyword ${keyword}`);
          removeKeyword.textContent = '×';
          removeKeyword.addEventListener('click', async (event) => {
            event.stopPropagation();
            removeKeyword.disabled = true;
            try {
              const updatedKeywords = [...(entry.keywords || [])];
              if (keywordIndex >= 0 && keywordIndex < updatedKeywords.length) {
                updatedKeywords.splice(keywordIndex, 1);
                await mutateStore('app_guide', {
                  action: 'overwrite',
                  id: entry.id,
                  title: entry.title,
                  content: entry.content,
                  keywords: updatedKeywords.length ? updatedKeywords : [],
                  link: entry.link,
                });
              }
            } finally {
              removeKeyword.disabled = false;
            }
          });
          chip.appendChild(removeKeyword);
        }
        keywordsList.appendChild(chip);
      });
      keywords.appendChild(keywordsList);
      if (keywordsList.children.length > 0) {
        wrapper.appendChild(keywords);
      }
    }
    if (entry.link) {
      const link = document.createElement('a');
      link.href = entry.link;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'Open link';
      wrapper.appendChild(link);
    }
    el.guideList.appendChild(wrapper);
  });
  updateNotesSectionOptions();
}

function updateNotesSectionOptions() {
  el.guideSectionCombobox?.refreshOptions();
  if (state.notesComboboxes) {
    state.notesComboboxes.forEach((combo) => combo.refreshOptions());
  }
}

// WHAT: fetch a single data store (todos/calendar/etc.) from the backend and rerender it.
// WHY: the Data tab should stay in sync after corrections or manual refreshes.
// HOW: call `/api/data/{store}`, update the relevant cache slice, and trigger the renderer so the active data tab reflects the latest tool mutations.
async function loadStore(store) {
  const data = await fetchJSON(`/api/data/${store}`);
  if (!data) return;
  if (store === 'todos') {
    state.dataStores.todos = data.todos || [];
    renderTodos();
    renderTodoCrudForm();
    applyTodoSelectionFromState();
  } else if (store === 'calendar') {
    state.dataStores.calendar = data.events || [];
    renderCalendar();
    renderCalendarCrudForm();
    applyCalendarSelectionFromState();
  } else if (store === 'kitchen_tips') {
    state.dataStores.kitchen_tips = data.tips || [];
    renderKitchen();
    renderKitchenCrudForm();
    applyKitchenSelectionFromState();
  } else if (store === 'app_guide') {
    state.dataStores.app_guide = data.sections || [];
    renderNotes();
  }
  renderIntendedEntities();
}

// WHAT: bulk-refresh multiple stores in parallel.
// WHY: faster initialization since todos/calendar/etc. can load concurrently.
// HOW: run `loadStore` for each requested store concurrently so the Sync button and bootstrap refresh all panels without serial waits.
async function refreshStores(stores = ['todos', 'calendar', 'kitchen_tips', 'app_guide']) {
  await Promise.all(stores.map((store) => loadStore(store)));
}

// WHAT: refresh whichever store tab is currently active.
// WHY: ensures manual pagination/edits always show the freshest data.
// HOW: pass the currently selected tab id into `loadStore` so manual refreshes only pull the visible dataset.
function refreshActiveDataTab() {
  return loadStore(state.activeDataTab);
}

function updateDataTabUI() {
  if (!el.dataTabs || !el.dataPanels) return;
  el.dataTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.store === state.activeDataTab);
  });
  el.dataPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.store === state.activeDataTab);
  });
}

// WHAT: ensure a Data Store tab re-enters Create mode when coming from another store.
// WHY: prevents stale selections from sticking when reviewers swap tabs, matching the Todos behavior.
// HOW: delegate to the tool-specific action setter so it clears the remembered row and re-renders the form/table.
function resetDataStoreEditor(store) {
  if (store === 'todos') {
    setTodoCrudAction('create');
    return;
  }
  if (store === 'calendar') {
    setCalendarCrudAction('create');
    return;
  }
  if (store === 'kitchen_tips') {
    setKitchenCrudAction('create');
  }
}

function setActiveDataTab(target, options = {}) {
  const normalized = DATA_STORE_IDS.includes(target) ? target : 'todos';
  const { skipRefresh = false, persist = true, force = false } = options;
  const previousTab = state.activeDataTab;
  if (!force && previousTab === normalized) {
    return;
  }
  const tabChanged = Boolean(previousTab && previousTab !== normalized);
  state.activeDataTab = normalized;
  updateDataTabUI();
  if (tabChanged) {
    resetDataStoreEditor(normalized);
  }
  if (persist) {
    persistActiveDataTab();
  }
  if (!skipRefresh) {
    refreshActiveDataTab();
  }
}

async function mutateStore(store, payload) {
  try {
    await fetchJSON(`/api/data/${store}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showToast('Store updated');
    await loadStore(store);
    return true;
  } catch (err) {
    showToast(err.message || 'Update failed', 'error');
    return false;
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
      appendAssistantReply(reply);
      if (state.selectedPrompt) {
        updateRelatedPromptOptions();
      }
      await Promise.all([loadPending(true), refreshActiveDataTab()]);
    } catch (err) {
      showToast(err.message || 'Chat failed', 'error');
      state.pendingChatEntry = null;
    } finally {
      setChatStatus('Ready');
    }
  });

  el.chatVoiceButton?.addEventListener('click', () => {
    if (state.voice.recording) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
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
  el.reviewerButton?.addEventListener('click', () => {
    promptForReviewerId();
  });
  el.reviewerTokenButton?.addEventListener('click', () => {
    promptForReviewerToken();
  });
  el.dataRefresh?.addEventListener('click', () => refreshStores([state.activeDataTab]));

  el.todoCrudForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleTodoFormSubmit();
  });
  el.todoCrudReset?.addEventListener('click', () => {
    resetTodoForm('create');
    setTodoCrudAction('create');
  });
  el.todoSortButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      const column = button.dataset.todoSort;
      setTodoSort(column);
    });
  });
  el.calendarSortButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      const column = button.dataset.calendarSort;
      setCalendarSort(column);
    });
  });
  el.kitchenSortButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      const column = button.dataset.kitchenSort;
      setKitchenSort(column);
    });
  });

  el.kitchenCrudForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleKitchenFormSubmit();
  });
  el.kitchenCrudReset?.addEventListener('click', () => {
    resetKitchenForm('create');
    setKitchenCrudAction('create');
  });

  el.calendarCrudForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleCalendarFormSubmit();
  });
  el.calendarCrudReset?.addEventListener('click', () => {
    resetCalendarForm('create');
    setCalendarCrudAction('create');
  });

  if (el.guideSectionField) {
    el.guideSectionField.innerHTML = '';
    const combo = createCombobox({
      name: 'title',
      placeholder: 'Section',
      required: true,
      getOptions: getNoteSectionTitles,
      allowCreate: true,
    });
    el.guideSectionField.appendChild(combo.element);
    el.guideSectionCombobox = combo;
  }

  el.guideForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(el.guideForm);
    const title = (formData.get('title') || '').toString().trim();
    const content = (formData.get('content') || '').toString().trim();
    const keywords = (formData.get('keywords') || '')
      .toString()
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!title) {
      showToast('Section is required.', 'error');
      return;
    }
    if (!content && !keywords.length) {
      showToast('Add content or at least one keyword before saving.', 'error');
      return;
    }
    await mutateStore('app_guide', {
      action: 'create',
      title,
      content,
      keywords,
      link: formData.get('link') || undefined,
    });
    el.guideForm.reset();
    el.guideSectionCombobox?.setValue('', { silent: true });
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
        headers: buildReviewerHeaders(),
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
      if (!target) return;
      setActiveDataTab(target);
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

  renderTodoCrudForm();
  renderCalendarCrudForm();
  renderKitchenCrudForm();
}

// WHAT: initialize the Tier‑5 dashboard and kick off background polling.
// WHY: ensures listeners, cached state, initial data, and periodic refreshes are ready before reviewers interact.
// HOW: wire events, restore stored UI state, fetch intents/stats/pending items, and start the auto-refresh interval.
async function bootstrap() {
  restoreDataPanelState();
  ensureReviewerId();
  ensureReviewerToken();
  disableAutofill();
  detectVoiceSupport();
  registerServiceWorker();
  wireEvents();
  setActiveDataTab(state.activeDataTab, { force: true, skipRefresh: true, persist: false });
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
  app_guide: 'Notes tool',
  nlu_fallback: 'LLM fallback',
};

const TOOL_FIELD_WHITELIST = {
  weather: ['city', 'time'],
  news: ['topic', 'language'],
};
// WHAT: decorate payloads for the training table (adds stable ids to related prompts chips).
// WHY: keeps the simple DOM list stable without a full diffing framework.
// HOW: deep-clone the payload and map `related_prompts` strings to `{text,id}` objects.
function renderPayloadPreview(payload, listSelector) {
  const list = document.querySelector(listSelector);
  if (!list) return payload;
  const copy = JSON.parse(JSON.stringify(payload || {}));
  copy.related_prompts = Array.isArray(copy.related_prompts)
    ? copy.related_prompts.map((prompt) => ({ text: prompt, id: crypto.randomUUID() }))
    : [];
  return copy;
}
