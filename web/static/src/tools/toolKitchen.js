// WHAT: Kitchen-specific helpers (form rendering, sorting, CRUD wiring) stay in this module.
// WHY: Keeping them adjacent to `renderKitchen` keeps the feature self-contained so helper code doesn’t leak into the orchestrator.
import {
  state,
  el,
  createKitchenFormState,
  FIELD_LIBRARY,
  ENTITY_FIELD_CONFIG,
  TOOL_ACTION_FIELD_CONFIG,
  TOOL_REQUIRED_FIELDS,
  getFieldLabel,
} from '../helpers/shared.js';
import { applyFieldLayout, fieldHasValue } from '../helpers/toolUtils.js';

const dependencies = {
  mutateStore: () => Promise.resolve(false),
  setSelectedDataRow: () => {},
  clearSelectedDataRow: () => {},
};

export function configureKitchenTool(config = {}) {
  Object.assign(dependencies, config);
}

function getKitchenFormState(action) {
  if (!state.kitchenCrud[action]) {
    state.kitchenCrud[action] = createKitchenFormState(action);
  }
  if (!state.kitchenCrud[action].display) {
    state.kitchenCrud[action].display = {};
  }
  return state.kitchenCrud[action];
}

function resetKitchenForm(action) {
  state.kitchenCrud[action] = createKitchenFormState(action);
}

function getActiveKitchenAction() {
  return state.kitchenCrud?.activeAction === 'update' ? 'update' : 'create';
}

function setKitchenCrudAction(action) {
  const normalized = action === 'update' ? 'update' : 'create';
  state.kitchenCrud.activeAction = normalized;
  if (normalized !== 'update') {
    dependencies.clearSelectedDataRow('kitchen_tips');
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
    delete formState.values[field];
  } else {
    formState.values[field] = next;
  }
  updateKitchenFormButtonState(action);
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
      formState.values[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  });
  formState.values.id = match.id;
}

function buildKitchenPayload(action) {
  const formState = getKitchenFormState(action);
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
      if (key === 'keywords') {
        payload[key] = trimmed
          .split(',')
          .map((chunk) => chunk.trim())
          .filter(Boolean);
        return;
      }
      payload[key] = key === 'content' ? value : trimmed;
      return;
    }
    payload[key] = value;
  });
  return payload;
}

async function handleKitchenFormSubmit(action) {
  const targetAction = action || getActiveKitchenAction();
  const payload = buildKitchenPayload(targetAction);
  if (!payload) return;
  const success = await dependencies.mutateStore('kitchen_tips', payload);
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
      dependencies.setSelectedDataRow('kitchen_tips', value);
      renderKitchen();
    } else {
      dependencies.clearSelectedDataRow('kitchen_tips');
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
    const required = isKitchenFieldRequired(action, field);
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
        fieldConfig.control?.() || (field === 'content' ? document.createElement('textarea') : document.createElement('input'));
      if (control.tagName === 'INPUT') {
        control.type = 'text';
      }
      control.value = rawValue || '';
      const eventName = control.tagName === 'SELECT' ? 'change' : 'input';
      control.addEventListener(eventName, (event) => {
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

function isKitchenFieldRequired(action, field) {
  const requiredFields = TOOL_ACTION_FIELD_CONFIG.kitchen_tips?.[action]?.required || [];
  return requiredFields.includes(field);
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
  const { column, direction } = state.kitchenSort || { column: 'title', direction: 'asc' };
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

function getStoreEntries() {
  const entries = state.dataStores.kitchen_tips || [];
  if (!state.user || !state.adminShowOnlyMine) {
    return entries;
  }
  const username = state.user?.username;
  return entries.filter((item) => {
    const owner = item.user_id || item.reviewer_id;
    return owner === username;
  });
}

export function renderKitchenSortIndicators() {
  if (!el.kitchenSortButtons) return;
  el.kitchenSortButtons.forEach((button) => {
    if (button.dataset.kitchenSort === state.kitchenSort?.column) {
      button.dataset.sortState = state.kitchenSort.direction;
    } else {
      button.removeAttribute('data-sort-state');
    }
  });
}

export function setKitchenSort(column) {
  if (!column) return;
  if (!state.kitchenSort) {
    state.kitchenSort = { column: 'title', direction: 'asc' };
  }
  if (state.kitchenSort.column === column) {
    state.kitchenSort.direction = state.kitchenSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.kitchenSort.column = column;
    state.kitchenSort.direction = 'asc';
  }
  renderKitchen();
}

export function renderKitchen() {
  if (!el.kitchenPanel) return;
  el.kitchenPanel.innerHTML = '';
  const rows = sortKitchenTips(getStoreEntries());
  const selectedKitchenId = state.selectedRows?.kitchen_tips || null;
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
        await dependencies.mutateStore('kitchen_tips', {
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

export function wireKitchenControls() {
  el.kitchenCrudForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleKitchenFormSubmit();
  });
  el.kitchenCrudReset?.addEventListener('click', () => {
    resetKitchenForm('create');
    setKitchenCrudAction('create');
  });
  el.kitchenSortButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      const column = button.dataset.kitchenSort;
      setKitchenSort(column);
    });
  });
}

export function applyKitchenSelectionFromState() {
  const selectedId = state.selectedRows?.kitchen_tips;
  if (!selectedId) {
    if (getActiveKitchenAction() === 'update') {
      setKitchenCrudAction('create');
    }
    return;
  }
  const match = getStoreEntries().find((tip) => String(tip.id) === String(selectedId));
  if (!match) {
    dependencies.clearSelectedDataRow('kitchen_tips');
    if (getActiveKitchenAction() === 'update') {
      setKitchenCrudAction('create');
    }
    return;
  }
  hydrateKitchenFormFromId(match.id);
  setKitchenCrudAction('update');
  renderKitchen();
}

export {
  renderKitchenCrudForm,
  handleKitchenFormSubmit,
  resetKitchenForm,
  setKitchenCrudAction,
};
