import {
  state,
  el,
  DATA_STORE_IDS,
  SELECTABLE_DATA_STORES,
  STORAGE_KEYS,
  formatNotesSectionHeading,
} from './shared.js';
import { fetchJSON } from './api.js';
import { showToast, formatDanishDateString } from './utils.js';
import {
  renderTodos,
  renderTodoCrudForm,
  applyTodoSelectionFromState,
  configureTodoTool,
} from './todoTool.js';

const dependencies = {
  renderCalendarCrudForm: () => {},
  applyCalendarSelectionFromState: () => {},
  renderKitchenCrudForm: () => {},
  applyKitchenSelectionFromState: () => {},
  renderIntendedEntities: () => {},
  setTodoCrudAction: () => {},
  setCalendarCrudAction: () => {},
  setKitchenCrudAction: () => {},
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
    dependencies.renderCalendarCrudForm();
    dependencies.applyCalendarSelectionFromState();
  } else if (store === 'kitchen_tips') {
    state.dataStores.kitchen_tips = data.tips || [];
    renderKitchen();
    dependencies.renderKitchenCrudForm();
    dependencies.applyKitchenSelectionFromState();
  } else if (store === 'app_guide') {
    state.dataStores.app_guide = data.sections || [];
    renderNotes();
    updateNotesSectionOptions();
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

export function resetDataStoreEditor(store) {
  if (store === 'todos') {
    dependencies.setTodoCrudAction('create');
    return;
  }
  if (store === 'calendar') {
    dependencies.setCalendarCrudAction('create');
    return;
  }
  if (store === 'kitchen_tips') {
    dependencies.setKitchenCrudAction('create');
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

function getCalendarSortValue(event, column) {
  if (!event) {
    return '';
  }
  if (column === 'title') {
    return (event.title || '').toLowerCase();
  }
  if (column === 'content') {
    return (event.content || '').toLowerCase();
  }
  const dateValue = event[column];
  if (!dateValue) {
    return column === 'end' ? Infinity : 0;
  }
  const parsed = Date.parse(dateValue);
  if (Number.isNaN(parsed)) {
    return dateValue;
  }
  return parsed;
}

function sortCalendarEvents(list) {
  const rows = [...(list || [])];
  const sortConfig = state.calendarSort || { column: 'end', direction: 'desc' };
  const multiplier = sortConfig.direction === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const valueA = getCalendarSortValue(a, sortConfig.column);
    const valueB = getCalendarSortValue(b, sortConfig.column);
    if (valueA === valueB) {
      return 0;
    }
    if (typeof valueA === 'number' && typeof valueB === 'number') {
      return (valueA - valueB) * multiplier;
    }
    return String(valueA).localeCompare(String(valueB)) * multiplier;
  });
  return rows;
}

function getActiveCalendarAction() {
  return state.calendarCrud?.activeAction === 'update' ? 'update' : 'create';
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
  if (!state.calendarSort) {
    state.calendarSort = { column: 'end', direction: 'desc' };
  }
  if (state.calendarSort.column === column) {
    state.calendarSort.direction = state.calendarSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.calendarSort.column = column;
    state.calendarSort.direction = 'asc';
  }
  renderCalendar();
}

export function renderCalendar() {
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
    tr.addEventListener('click', () => {
      dependencies.onSelectCalendar?.(event);
    });
    el.calendarPanel.appendChild(tr);
  });
  renderCalendarSortIndicators();
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

function getActiveKitchenAction() {
  return state.kitchenCrud?.activeAction === 'update' ? 'update' : 'create';
}

export function renderKitchenSortIndicators() {
  if (!el.kitchenSortButtons) return;
  el.kitchenSortButtons.forEach((button) => {
    if (button.dataset.kitchenSort === state.kitchenSort.column) {
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
    tr.addEventListener('click', () => {
      dependencies.onSelectKitchen?.(tip);
    });
    el.kitchenPanel.appendChild(tr);
  });
  renderKitchenSortIndicators();
}

function updateNotesSectionOptions() {
  if (el.guideSectionCombobox) {
    el.guideSectionCombobox.refreshOptions();
  }
}

export function renderNotes() {
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

function getTodoSortValue(todo, column) {
  if (!todo) {
    return '';
  }
  const raw = todo[column];
  if (column === 'deadline') {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return (raw ?? '').toString().toLowerCase();
}

function sortTodosByState(list) {
  const rows = [...(list || [])];
  const todoSort = state.todoSort || { column: 'deadline', direction: 'asc' };
  const multiplier = todoSort.direction === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const valueA = getTodoSortValue(a, todoSort.column);
    const valueB = getTodoSortValue(b, todoSort.column);
    if (typeof valueA === 'number' && typeof valueB === 'number') {
      return (valueA - valueB) * multiplier;
    }
    if (valueA === valueB) {
      return 0;
    }
    const textA = String(valueA || '');
    const textB = String(valueB || '');
    return textA.localeCompare(textB) * multiplier;
  });
  return rows;
}

export function getActiveTodoAction() {
  return state.todoCrud?.activeAction === 'update' ? 'update' : 'create';
}

function selectTodoForUpdate(todo) {
  if (!todo || !todo.id) return;
  setSelectedDataRow('todos', todo.id);
  state.todoCrud.activeAction = 'update';
  renderTodos();
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

export function renderTodos() {
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
    const deadlineText = todo.deadline || '—';
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
        await fetchStore('todos');
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

export function setTodoSort(column) {
  if (!column) return;
  if (!state.todoSort) {
    state.todoSort = { column: 'deadline', direction: 'asc' };
  }
  if (state.todoSort.column === column) {
    state.todoSort.direction = state.todoSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.todoSort.column = column;
    state.todoSort.direction = 'asc';
  }
  renderTodos();
}
