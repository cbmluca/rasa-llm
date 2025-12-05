// WHAT: Calendar-only helpers (form state, datetime parsing, validation) live here.
// WHY: Keeping this logic adjacent to `renderCalendar` avoids global leakage and makes future splits easier.
import {
  state,
  el,
  createCalendarFormState,
  ENTITY_FIELD_CONFIG,
  FIELD_LIBRARY,
  TOOL_ACTION_FIELD_CONFIG,
  DATE_TIME_FIELD_CONFIG,
  getFieldLabel,
} from '../helpers/shared.js';
import { formatDanishDateString } from '../utils.js';
import { applyFieldLayout, fieldHasValue, buildRelativeDateOptions, buildRelativeTimeOptions, parseDateInput, parseTimeInput } from '../helpers/toolUtils.js';

const dependencies = {
  setSelectedDataRow: () => {},
  clearSelectedDataRow: () => {},
};

export function configureCalendarTool(config = {}) {
  Object.assign(dependencies, config);
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

function setCalendarCrudAction(action) {
  const normalized = action === 'update' ? 'update' : 'create';
  state.calendarCrud.activeAction = normalized;
  if (normalized !== 'update') {
    dependencies.clearSelectedDataRow('calendar');
    renderCalendar();
  }
  renderCalendarCrudForm();
}

function calendarHasTimingValue(formState) {
  if (!formState || !formState.values) {
    return false;
  }
  return fieldHasValue(formState.values.start) || fieldHasValue(formState.values.end);
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
  const grid = [];
  const trackedWrappers = [];

  const updateRequired = () => {
    if (!required) return;
    const hasValue = fieldHasValue(formState.values[field]);
    trackedWrappers.forEach((wrapper) => {
      wrapper.classList.toggle('field-required', !hasValue);
    });
  };

  const baseLabel = getFieldLabel('calendar_edit', field);

  const dateWrapper = document.createElement('div');
  dateWrapper.className = 'field-wrapper datetime-field';
  dateWrapper.dataset.field = `${field}-date`;
  const dateLabel = document.createElement('span');
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
  grid.push(dateWrapper);
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
    grid.push(timeWrapper);
  }

  updateCalendarDatetimeValue(action, field);
  updateRequired();
  return grid;
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
      dependencies.setSelectedDataRow('calendar', value);
      renderCalendar();
    } else {
      dependencies.clearSelectedDataRow('calendar');
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
    const required = isCalendarFieldRequired(action, field);
    if (field === 'start' || field === 'end') {
      const wrappers = buildCalendarDateTimeFields(action, field, required);
      wrappers.forEach((wrapper) => grid.appendChild(wrapper));
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'field-wrapper';
    wrapper.dataset.field = field;
    const label = document.createElement('span');
    label.textContent = getFieldLabel('calendar_edit', field);
    wrapper.appendChild(label);
    const rawValue = formState.values[field];
    if (required && !fieldHasValue(rawValue)) {
      wrapper.classList.add('field-required');
    }
    let control;
    if (field === 'id') {
      control = buildCalendarIdSelect(action, rawValue, required, wrapper);
    } else {
      const fieldConfig = FIELD_LIBRARY[field] || {};
      control =
        fieldConfig.control?.() || (field === 'content' ? document.createElement('textarea') : document.createElement('input'));
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

function isCalendarFieldRequired(action, field) {
  const requiredFields = TOOL_ACTION_FIELD_CONFIG.calendar_edit?.[action]?.required || [];
  return requiredFields.includes(field);
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
      payload[key] = text;
      return;
    }
    payload[key] = value;
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
  const success = await dependencies.mutateStore('calendar', payload);
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
  dependencies.setSelectedDataRow('calendar', event.id);
  setCalendarCrudAction('update');
  if (options.scroll !== false && el.calendarCrudForm) {
    el.calendarCrudForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  renderCalendar();
}

function getCalendarTimestamp(value) {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
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

function getStoreEntries() {
  const entries = state.dataStores.calendar || [];
  if (!state.user || !state.adminShowOnlyMine) {
    return entries;
  }
  const username = state.user?.username;
  return entries.filter((item) => {
    const owner = item.user_id || item.reviewer_id;
    return owner === username;
  });
}

export function renderCalendarSortIndicators() {
  if (!el.calendarSortButtons) return;
  el.calendarSortButtons.forEach((button) => {
    if (button.dataset.calendarSort === state.calendarSort.column) {
      button.dataset.sortState = state.calendarSort.direction;
    } else {
      button.removeAttribute('data-sort-state');
    }
  });
}

export function setCalendarSort(column) {
  if (!column) return;
  if (state.calendarSort.column === column) {
    state.calendarSort.direction = state.calendarSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.calendarSort.column = column;
    state.calendarSort.direction = column === 'end' ? 'desc' : 'asc';
  }
  renderCalendar();
}

export function renderCalendar() {
  if (!el.calendarPanel) return;
  el.calendarPanel.innerHTML = '';
  const rows = sortCalendarEvents(getStoreEntries());
  const selectedId = state.selectedRows?.calendar;
  const highlightActive = getActiveCalendarAction() === 'update' && selectedId;
  rows.forEach((event) => {
    const tr = document.createElement('tr');
    if (event.id) {
      tr.dataset.calendarId = event.id;
    }
    if (highlightActive && String(selectedId) === String(event.id)) {
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
        await dependencies.mutateStore('calendar', {
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

export function wireCalendarControls() {
  el.calendarCrudForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleCalendarFormSubmit();
  });
  el.calendarCrudReset?.addEventListener('click', () => {
    resetCalendarForm('create');
    setCalendarCrudAction('create');
  });
  el.calendarSortButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      const column = button.dataset.calendarSort;
      setCalendarSort(column);
    });
  });
}

export function applyCalendarSelectionFromState() {
  const selectedId = state.selectedRows?.calendar;
  if (!selectedId) {
    if (getActiveCalendarAction() === 'update') {
      setCalendarCrudAction('create');
    }
    return;
  }
  const match = getStoreEntries().find((event) => String(event.id) === String(selectedId));
  if (!match) {
    dependencies.clearSelectedDataRow('calendar');
    if (getActiveCalendarAction() === 'update') {
      setCalendarCrudAction('create');
    }
    return;
  }
  hydrateCalendarFormFromId(match.id);
  setCalendarCrudAction('update');
  renderCalendar();
}

export {
  renderCalendarCrudForm,
  handleCalendarFormSubmit,
  resetCalendarForm,
  setCalendarCrudAction,
};
