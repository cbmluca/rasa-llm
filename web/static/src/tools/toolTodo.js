// WHAT: Todo-specific form helpers and renderers stay in this module.
// WHY: Keeping them next to `renderTodos` keeps the tool self-contained while shared helpers live elsewhere.
import {
  state,
  el,
  createTodoFormState,
  ENTITY_FIELD_CONFIG,
  FIELD_LIBRARY,
  TOOL_ACTION_FIELD_CONFIG,
  getFieldLabel,
} from '../helpers/shared.js';
import { formatDanishDateString } from '../utils.js';
import { applyFieldLayout, fieldHasValue, buildRelativeDateOptions, parseDateInput, isFieldRequired } from '../helpers/toolUtils.js';

const dependencies = {
  mutateStore: () => Promise.resolve(false),
  setSelectedDataRow: () => {},
  clearSelectedDataRow: () => {},
};

export function configureTodoTool(config = {}) {
  Object.assign(dependencies, config);
}

function getTodoFormState(action) {
  if (!state.todoCrud[action]) {
    state.todoCrud[action] = createTodoFormState(action);
  }
  if (!state.todoCrud[action].display) {
    state.todoCrud[action].display = {};
  }
  return state.todoCrud[action];
}

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
    dependencies.clearSelectedDataRow('todos');
    renderTodos();
  }
  renderTodoCrudForm();
}

function updateTodoFormButtonState(action) {
  const button = el.todoCrudSubmit;
  if (!button) return;
  const targetAction = action || getActiveTodoAction();
  const formState = getTodoFormState(targetAction);
  const requiredFields = TOOL_ACTION_FIELD_CONFIG.todo_list?.[targetAction]?.required || [];
  const isValid = requiredFields.every((field) => fieldHasValue(formState.values[field]));
  button.disabled = !isValid;
}

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

function selectTodoForUpdate(todo, options = {}) {
  if (!todo || !todo.id) return;
  hydrateTodoFormFromId(todo.id);
  dependencies.setSelectedDataRow('todos', todo.id);
  setTodoCrudAction('update');
  if (options.scroll !== false && el.todoCrudForm) {
    el.todoCrudForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  renderTodos();
}

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
      dependencies.setSelectedDataRow('todos', value);
      renderTodos();
    } else {
      dependencies.clearSelectedDataRow('todos');
      renderTodos();
    }
  });
  return select;
}

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
        fieldConfig.control?.() || (FIELD_LIBRARY[field]?.type === 'textarea' ? document.createElement('textarea') : document.createElement('input'));
      control.value = displayValue || '';
      if (control.tagName === 'INPUT') {
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

async function handleTodoFormSubmit(action) {
  const targetAction = action || getActiveTodoAction();
  const payload = buildTodoPayload(targetAction);
  if (!payload) return;
  const success = await dependencies.mutateStore('todos', payload);
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

function getTodoTextValue(todo, column) {
  if (column === 'status') {
    return (todo.status || '').toLowerCase();
  }
  return (todo.title || '').toLowerCase();
}

function getTodoDeadlineTimestamp(value) {
  if (!value) return null;
  const parsed = parseDateInput(value, new Date());
  const iso = parsed.iso || value;
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? null : ts;
}

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

function getStoreEntries() {
  const entries = state.dataStores.todos || [];
  if (!state.user || !state.adminShowOnlyMine) {
    return entries;
  }
  const username = state.user?.username;
  return entries.filter((item) => {
    const owner = item.user_id || item.reviewer_id;
    return owner === username;
  });
}

export function renderTodoSortIndicators() {
  if (!el.todoSortButtons) return;
  el.todoSortButtons.forEach((button) => {
    if (button.dataset.todoSort === state.todoSort.column) {
      button.dataset.sortState = state.todoSort.direction;
    } else {
      button.removeAttribute('data-sort-state');
    }
  });
}

export function setTodoSort(column) {
  if (!column) return;
  if (state.todoSort.column === column) {
    state.todoSort.direction = state.todoSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.todoSort.column = column;
    state.todoSort.direction = column === 'deadline' ? 'asc' : 'asc';
  }
  renderTodos();
}

export function renderTodos() {
  if (!el.todosPanel) return;
  el.todosPanel.innerHTML = '';
  const rows = sortTodosByState(getStoreEntries());
  const selectedTodoId = state.selectedRows?.todos || null;
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
        await dependencies.mutateStore('todos', {
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
    tr.addEventListener('click', () => selectTodoForUpdate(todo));
    el.todosPanel.appendChild(tr);
  });
  renderTodoSortIndicators();
}

export function wireTodoControls() {
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
}

export function applyTodoSelectionFromState() {
  const selectedId = state.selectedRows?.todos;
  if (!selectedId) {
    if (getActiveTodoAction() === 'update') {
      setTodoCrudAction('create');
    }
    return;
  }
  const match = getStoreEntries().find((todo) => String(todo.id) === String(selectedId));
  if (!match) {
    dependencies.clearSelectedDataRow('todos');
    if (getActiveTodoAction() === 'update') {
      setTodoCrudAction('create');
    }
    return;
  }
  hydrateTodoFormFromId(match.id);
  setTodoCrudAction('update');
  renderTodos();
}

export { renderTodoCrudForm, handleTodoFormSubmit, resetTodoForm, setTodoCrudAction, selectTodoForUpdate };
