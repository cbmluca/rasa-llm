import {
  state,
  el,
  ENTITY_FIELD_CONFIG,
  FIELD_LIBRARY,
  FIELD_ORDER,
  getFieldLabel,
  TITLE_LOOKUP_ACTIONS,
  TITLE_LOOKUP_TOOLS,
  TITLE_SELECT_ACTIONS,
  TITLE_SELECT_TOOLS,
  TOOL_ACTION_FIELD_CONFIG,
  TOOL_EXTRA_FIELDS,
  TOOL_REQUIRED_FIELDS,
  ACTION_ALIASES,
  DEFAULT_INTENT_ACTIONS,
  MUTATING_ACTIONS,
} from '../helpers/shared.js';
import { applyFieldLayout, buildRelativeDateOptions, buildRelativeTimeOptions, fieldHasValue, isFieldRequired } from '../helpers/toolUtils.js';
import { getEntityOptions, getEntitiesMatchingTitle, flagReviewerChange } from './pendingUtils.js';
import { getNoteSectionTitles } from '../helpers/shared.js';

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

const dependencies = {
  createCombobox: () => ({ element: document.createElement('div'), refreshOptions: () => {} }),
};

export function configureFieldHelpers(config = {}) {
  Object.assign(dependencies, config);
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
    (TOOL_ACTION_FIELD_CONFIG[tool]?.defaultFields || []).forEach((key) => keys.add(key));
    if (entityField) {
      keys.add(entityField);
    }
    const ordered = FIELD_ORDER.filter((field) => keys.has(field));
    const extras = [...keys].filter((field) => !FIELD_ORDER.includes(field));
    fields = [...ordered, ...extras];
  }
  const shouldIncludeEntityField = Boolean(entityField && (!override || overrideFields.includes(entityField)));
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

function getTitleOptions(tool) {
  const config = ENTITY_FIELD_CONFIG[tool];
  if (!config) return [];
  const entries = state.dataStores[config.store] || [];
  return entries
    .map((entry) => {
      const rawLabel = entry.title || entry[config.field] || entry.id || '';
      const trimmed = (rawLabel || '').toString().trim();
      if (!trimmed) return null;
      return { value: String(entry[config.field] || entry.id || ''), label: trimmed };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function normalizeActionName(intent, action) {
  if (!intent) return null;
  if (!action) {
    const defaults = TOOL_ACTION_FIELD_CONFIG[intent]?.defaultActions || [];
    return defaults.length ? defaults[0] : null;
  }
  const normalized = action.toLowerCase();
  const alias = ACTION_ALIASES[intent]?.[normalized];
  if (alias) {
    return alias;
  }
  const allowed = TOOL_ACTION_FIELD_CONFIG[intent]?.actions || [];
  if (allowed.includes(normalized)) {
    return normalized;
  }
  return null;
}

export function getActionsForIntent(intent) {
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

function getBaseDate() {
  return new Date();
}

function ensureDateTimeState(field) {
  if (!state.datetimeInputs) {
    state.datetimeInputs = {};
  }
  if (!state.datetimeInputs[field]) {
    state.datetimeInputs[field] = { dateValue: '', timeValue: '', useDefaultTime: false };
  }
  return state.datetimeInputs[field];
}

function applyDateTimeFieldValue(field, config) {
  const stateValue = ensureDateTimeState(field);
  if (!stateValue.dateValue) {
    delete state.correctionFields[field];
    return;
  }
  let value = stateValue.dateValue;
  if (config?.includeTime && stateValue.timeValue) {
    value = `${stateValue.dateValue}T${stateValue.timeValue}`;
  }
  state.correctionFields[field] = value;
}

function renderDateTimeField(field, config, targetGrid, isRequired, tool, action) {
  if (!targetGrid || !config) return;
  const normalizedGrid = targetGrid;
  const baseDate = getBaseDate();
  const stateValue = ensureDateTimeState(field);
  const rawValue = state.correctionFields[field];
  let hydratedFromPayload = false;
  if (!stateValue.dateValue && rawValue) {
    if (config.mode === 'weather') {
      stateValue.dateValue = rawValue?.day?.replace(/_/g, ' ') || rawValue?.raw || '';
      hydratedFromPayload = Boolean(stateValue.dateValue);
    } else if (typeof rawValue === 'string') {
      const [datePart, timePart] = rawValue.split('T');
      stateValue.dateValue = datePart;
      stateValue.timeValue = timePart?.slice(0, 5) || '';
      hydratedFromPayload = true;
    } else if (typeof rawValue === 'object') {
      const iso = rawValue.start || rawValue.date || rawValue.iso || '';
      if (iso.includes('T')) {
        const [datePart, timePart] = iso.split('T');
        stateValue.dateValue = datePart;
        stateValue.timeValue = timePart?.slice(0, 5) || '';
        hydratedFromPayload = true;
      }
    }
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
    trackedWrappers.forEach((wrapper) => wrapper.classList.toggle('field-required', !hasValue));
  };
  const baseLabel = getFieldLabel(tool, field);
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
      option.value = `${opt.label} (${opt.time})`;
      dataList.appendChild(option);
    });
    input.addEventListener('input', () => {
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
  const wrapper = document.createElement('div');
  wrapper.className = 'field-wrapper datetime-field';
  wrapper.dataset.field = field;
  const label = document.createElement('span');
  label.textContent = baseLabel;
  wrapper.appendChild(label);
  const controls = document.createElement('div');
  controls.className = 'datetime-controls';
  controls.appendChild(buildDateInput());
  if (config.includeTime) {
    controls.appendChild(buildTimeInput());
  }
  wrapper.appendChild(controls);
  applyFieldLayout(wrapper, tool, action, field);
  targetGrid.appendChild(wrapper);
  trackedWrappers.push(wrapper);
  applyDateTimeFieldValue(field, config);
  updateRequiredState();
}

export function renderDynamicFields(tool, action) {
  const normalizedAction = normalizeActionName(tool, action);
  if (!el.dynamicFieldGrid || !tool || !state.selectedPrompt) return;
  const targetGrid = el.dynamicFieldGrid;
  targetGrid.innerHTML = '';
  targetGrid.classList.toggle('calendar-layout', tool === 'calendar_edit');
  if (tool === 'app_guide') {
    state.notesComboboxes = new Set();
  } else {
    state.notesComboboxes = null;
  }
  const requiresActionFirst = !!TOOL_ACTION_FIELD_CONFIG[tool];
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
      const combo = dependencies.createCombobox({
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
        },
      });
    state.notesComboboxes?.add(combo);
      container.appendChild(combo.element);
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
          dependencies.hydrateEntitySelection(tool, value);
          renderDynamicFields(tool, normalizedAction);
        } else {
          delete state.correctionFields[field];
        }
        flagReviewerChange(field);
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
      if (required) {
        wrapper.classList.toggle('field-required', !(event.target.value || '').trim());
      }
    });
    wrapper.appendChild(control);
    applyFieldLayout(wrapper, tool, normalizedAction, field);
    targetGrid.appendChild(wrapper);
  });
}

export function hydrateEntitySelection(tool, entityId) {
  const config = ENTITY_FIELD_CONFIG[tool];
  if (!config || !entityId) return;
  const entries = state.dataStores[config.store] || [];
  const target = entries.find((entity) => String(entity[config.field] || entity.id) === entityId);
  if (!target) return;
  const hydrated = config.hydrate(target);
  Object.entries(hydrated).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      delete state.correctionFields[key];
    } else {
      state.correctionFields[key] = value;
    }
  });
  if (TITLE_LOOKUP_TOOLS.has(tool)) {
    const lookupValue = hydrated.title || target.title || '';
    if (lookupValue) {
      state.hiddenFields.lookup_title = lookupValue;
    }
  }
}

export function autoSelectIdForTitle(tool, value) {
  const normalizedTitle = (value || '').trim().toLowerCase();
  if (!normalizedTitle) {
    delete state.correctionFields.id;
    return;
  }
  const config = ENTITY_FIELD_CONFIG[tool];
  if (!config) return;
  const entries = state.dataStores[config.store] || [];
  const match = entries.find((entry) => {
    const title = (entry.title || entry[config.field] || entry.id || '').toString().trim().toLowerCase();
    return title === normalizedTitle;
  });
  if (match) {
    state.correctionFields.id = String(match[config.field] || match.id || '');
  }
}

function formatFieldText(rawValue, options = {}) {
  if (rawValue === undefined || rawValue === null) {
    return '';
  }
  if (Array.isArray(rawValue)) {
    const parts = rawValue
      .map((entry) => formatFieldText(entry, options))
      .filter((value) => value || value === '0');
    if (!parts.length) {
      return '';
    }
    return parts.join(options.joinWithNewline ? '\n' : ' ');
  }
  if (typeof rawValue === 'object') {
    try {
      return JSON.stringify(rawValue);
    } catch (err) {
      return String(rawValue);
    }
  }
  return String(rawValue).trim();
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

export function prepareParserFields(tool, payload) {
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

export function supportsTitleLookup(intent, action) {
  if (!intent) return false;
  const normalized = normalizeActionName(intent, action);
  if (!normalized) return false;
  return TITLE_LOOKUP_TOOLS.has(intent) && TITLE_LOOKUP_ACTIONS.has(normalized);
}

export function updateActionSelectOptions(intent, defaultValue) {
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

export function updateCorrectButtonState() {
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

export function populateIntentOptions() {
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

export { normalizeActionName };
