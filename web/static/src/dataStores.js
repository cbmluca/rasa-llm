import {
  state,
  el,
  DATA_STORE_IDS,
  SELECTABLE_DATA_STORES,
  STORAGE_KEYS,
} from './helpers/shared.js';
import { fetchJSON } from './helpers/api.js';
import { showToast } from './utils.js';
import {
  renderTodos,
  renderTodoCrudForm,
  applyTodoSelectionFromState,
  configureTodoTool,
  setTodoCrudAction,
} from './tools/toolTodo.js';
import {
  renderCalendar,
  renderCalendarCrudForm,
  applyCalendarSelectionFromState,
  renderCalendarSortIndicators,
  setCalendarSort,
  configureCalendarTool,
  handleCalendarFormSubmit,
  resetCalendarForm,
  setCalendarCrudAction,
} from './tools/toolCalendar.js';
import {
  configureNotesTool,
  renderNotes,
} from './tools/toolNotes.js';
import {
  configureKitchenTool,
  renderKitchen,
  renderKitchenCrudForm,
  applyKitchenSelectionFromState,
  setKitchenSort,
  handleKitchenFormSubmit,
  resetKitchenForm,
  setKitchenCrudAction,
} from './tools/toolKitchen.js';

const dependencies = {
  renderIntendedEntities: () => {},
  onSelectCalendar: null,
  onSelectKitchen: null,
};

export function configureDataStores(config = {}) {
  Object.assign(dependencies, config);
}

export function persistActiveDataTab() {
  try {
    localStorage.setItem(STORAGE_KEYS.DATA_ACTIVE_TAB, state.activeDataTab || 'todos');
  } catch (err) {
    // ignore persistence failures
  }
}

export function restoreActiveDataTab() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.DATA_ACTIVE_TAB);
    if (stored && DATA_STORE_IDS.includes(stored)) {
      state.activeDataTab = stored;
    }
  } catch (err) {
    // ignore
  }
}

export function persistSelectedDataRows() {
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

export function restoreSelectedDataRows() {
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

export function getSelectedDataRow(store) {
  return state.selectedRows?.[store] || null;
}

export function setSelectedDataRow(store, id, options = {}) {
  if (!SELECTABLE_DATA_STORES.has(store)) {
    return;
  }
  if (!state.selectedRows) {
    state.selectedRows = { todos: null, calendar: null, kitchen_tips: null };
  }
  state.selectedRows[store] = id ? String(id) : null;
  if (options.persist !== false) {
    persistSelectedDataRows();
  }
}

export function clearSelectedDataRow(store, options = {}) {
  setSelectedDataRow(store, null, options);
}

export function restoreDataPanelState() {
  restoreActiveDataTab();
  restoreSelectedDataRows();
}

export async function fetchStore(store) {
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
  dependencies.renderIntendedEntities();
}

export async function refreshStores(stores = ['todos', 'calendar', 'kitchen_tips', 'app_guide']) {
  await Promise.all(stores.map((store) => fetchStore(store)));
}

export function refreshActiveDataTab() {
  return fetchStore(state.activeDataTab);
}

export function updateDataTabUI() {
  if (!el.dataTabs || !el.dataPanels) return;
  el.dataTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.store === state.activeDataTab);
  });
  el.dataPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.store === state.activeDataTab);
  });
}

export function renderAllDataPanels() {
  renderTodos();
  renderCalendar();
  renderKitchen();
  renderNotes();
}

export function resetDataStoreEditor(store) {
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

export function setActiveDataTab(target, options = {}) {
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
export async function mutateStore(store, payload = {}) {
  if (!store) return null;
  try {
    return await fetchJSON(`/api/data/${store}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    showToast(err?.message || 'Store mutation failed', 'error');
    return null;
  }
}

configureTodoTool({
  mutateStore,
  setSelectedDataRow,
  clearSelectedDataRow,
});

configureCalendarTool({
  mutateStore,
  setSelectedDataRow,
  clearSelectedDataRow,
});

configureNotesTool({
  mutateStore,
  setSelectedDataRow,
  clearSelectedDataRow,
});

configureKitchenTool({
  mutateStore,
  setSelectedDataRow,
  clearSelectedDataRow,
});

export {
  renderCalendar,
  renderCalendarCrudForm,
  applyCalendarSelectionFromState,
  renderCalendarSortIndicators,
  setCalendarSort,
  handleCalendarFormSubmit,
  resetCalendarForm,
  setCalendarCrudAction,
  renderNotes,
  renderKitchen,
  renderKitchenCrudForm,
  applyKitchenSelectionFromState,
  setKitchenSort,
  handleKitchenFormSubmit,
  resetKitchenForm,
  setKitchenCrudAction,
};
