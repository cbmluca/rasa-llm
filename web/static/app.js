const flaggedPrompts = new Set();
const DEFAULT_INTENT_ACTIONS = {
  todo_list: ['list', 'create', 'update', 'delete'],
  kitchen_tips: ['list', 'search', 'get', 'create'],
  calendar_edit: ['list', 'create', 'update', 'delete'],
  app_guide: ['list', 'get', 'upsert', 'delete'],
};
const MAX_LABELED_CACHE = 50;
const STORAGE_KEYS = {
  ACTIVE_PAGE: 'tier5_active_page',
  SCROLL_PREFIX: 'tier5_scroll_',
  PENDING_PAGE: 'tier5_pending_page',
  PENDING_LIMIT: 'tier5_pending_limit',
};

let currentPageId = 'front-page';
const state = {
  chat: [],
  intents: [],
  intentActions: {},
  pending: [],
  classifier: [],
  labeled: [],
  todos: [],
  kitchenTips: [],
  calendar: [],
  appGuide: [],
  exports: [],
  stats: {},
  pendingPage: 1,
  pendingLimit: 10,
  pendingHasMore: false,
  pendingActiveIndex: 0,
};

const el = {
  chatLog: document.querySelector('#chat-log'),
  chatForm: document.querySelector('#chat-form'),
  chatInput: document.querySelector('#chat-input'),
  chatStatus: document.querySelector('#chat-status'),
  pendingTable: document.querySelector('#pending-table tbody'),
  pendingPrev: document.querySelector('#pending-prev'),
  pendingNext: document.querySelector('#pending-next'),
  pendingPageLabel: document.querySelector('#pending-page'),
  pendingLimitSelect: document.querySelector('#pending-limit'),
  classifierTable: document.querySelector('#classifier-table tbody'),
  labeledTable: document.querySelector('#labeled-table tbody'),
  pendingRefresh: document.querySelector('#pending-refresh'),
  classifierRefresh: document.querySelector('#classifier-refresh'),
  labeledRefresh: document.querySelector('#labeled-refresh'),
  exportButton: document.querySelector('#export-prompts'),
  exportLinks: document.querySelector('#export-links'),
  importForm: document.querySelector('#import-form'),
  refreshButton: document.querySelector('#refresh-button'),
  dataRefresh: document.querySelector('#data-refresh'),
  statsPending: document.querySelector('#pending-count'),
  statsPendingBreakdown: document.querySelector('#pending-breakdown'),
  statsLabeled: document.querySelector('#labeled-count'),
  statsClassifier: document.querySelector('#classifier-count'),
  todosPanel: document.querySelector('#todos-panel tbody'),
  todoForm: document.querySelector('#todo-form'),
  kitchenList: document.querySelector('#kitchen-list'),
  kitchenForm: document.querySelector('#kitchen-form'),
  calendarTable: document.querySelector('#calendar-panel tbody'),
  calendarForm: document.querySelector('#calendar-form'),
  guideList: document.querySelector('#guide-list'),
  guideForm: document.querySelector('#guide-form'),
  toast: document.querySelector('#toast'),
  trainingPage: document.querySelector('#training-page'),
};

const navButtons = document.querySelectorAll('.nav-link');
const pageViews = document.querySelectorAll('.page-view');

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
  if (!targetId || currentPageId === targetId) {
    return;
  }
  try {
    if (currentPageId) {
      const previousKey = `${STORAGE_KEYS.SCROLL_PREFIX}${currentPageId}`;
      localStorage.setItem(previousKey, String(window.scrollY));
    }
  } catch (err) {
    // ignore storage errors
  }

  pageViews.forEach((view) => {
    if (!view) return;
    view.classList.toggle('active', view.id === targetId);
  });
  navButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.target === targetId);
  });

  currentPageId = targetId;
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PAGE, targetId);
    const saved = localStorage.getItem(`${STORAGE_KEYS.SCROLL_PREFIX}${targetId}`);
    const value = saved ? Number(saved) : 0;
    if (!Number.isNaN(value)) {
      window.scrollTo({ top: value });
    } else {
      window.scrollTo({ top: 0 });
    }
  } catch (err) {
    window.scrollTo({ top: 0 });
  }
}

function getActionsForIntent(intent) {
  if (!intent) {
    return [];
  }
  return state.intentActions[intent] || DEFAULT_INTENT_ACTIONS[intent] || [];
}

function updateActionSelectOptions(select, intent, defaultValue) {
  const actions = getActionsForIntent(intent);
  select.innerHTML = '';
  if (!actions.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No actions';
    select.appendChild(option);
    select.disabled = true;
    select.value = '';
    return;
  }

  select.disabled = false;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose action';
  select.appendChild(placeholder);
  actions.forEach((action) => {
    const option = document.createElement('option');
    option.value = action;
    option.textContent = action;
    select.appendChild(option);
  });
  if (defaultValue && actions.includes(defaultValue)) {
    select.value = defaultValue;
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
      if (entry.meta.tool && entry.meta.tool.result) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'Tool payload';
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(entry.meta.tool.result, null, 2);
        details.appendChild(summary);
        details.appendChild(pre);
        wrapper.appendChild(details);
      }
    }
    el.chatLog.appendChild(wrapper);
  });
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

function renderPending() {
  if (!el.pendingTable) return;
  el.pendingTable.innerHTML = '';
  state.pending.forEach((item, index) => {
    const rowIndex = index;
    const row = document.createElement('tr');
    row.dataset.index = index;

    const textCell = document.createElement('td');
    textCell.textContent = item.user_text || '—';
    const intentCell = document.createElement('td');
    intentCell.textContent = item.intent || 'nlu_fallback';
    const reasonCell = document.createElement('td');
    reasonCell.textContent = item.reason || 'review';

    const actionCell = document.createElement('td');
    const container = document.createElement('div');
    container.className = 'pending-actions';

    const select = document.createElement('select');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose intent';
    select.appendChild(placeholder);
    state.intents.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (name === item.intent) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    const actionSelect = document.createElement('select');
    actionSelect.className = 'pending-action-select';
    updateActionSelectOptions(actionSelect, item.intent || select.value, item.action);

    select.addEventListener('change', () => {
      const targetIntent = select.value || item.intent;
      updateActionSelectOptions(actionSelect, targetIntent, null);
    });

    const assignButton = document.createElement('button');
    assignButton.className = 'button primary';
    assignButton.type = 'button';
    assignButton.dataset.action = 'save';
    assignButton.textContent = 'Save';
    assignButton.addEventListener('click', async () => {
      if (!select.value) {
        showToast('Choose an intent first');
        return;
      }
      if (!actionSelect.disabled && !actionSelect.value) {
        showToast('Choose an action');
        return;
      }
      try {
        const actionValue = actionSelect.disabled ? null : actionSelect.value;
        const result = await fetchJSON('/api/logs/label', {
          method: 'POST',
          body: JSON.stringify({
            text: item.user_text,
            parser_intent: item.intent,
            reviewer_intent: select.value,
            action: actionValue,
          }),
        });
        showToast('Label saved');
        if (result?.record) {
          state.labeled = [result.record, ...state.labeled].slice(0, MAX_LABELED_CACHE);
          renderLabeled();
        } else {
          loadLabeled();
        }

        state.pending.splice(rowIndex, 1);
        if (state.stats.pending && typeof state.stats.pending.total === 'number') {
          state.stats.pending.total = Math.max(0, state.stats.pending.total - 1);
          renderStats();
        }
        if (!state.pending.length && state.pendingHasMore) {
          state.pendingPage = Math.max(1, state.pendingPage - 1);
          persistPendingState();
          loadPending();
        } else {
          state.pendingActiveIndex = Math.min(state.pendingActiveIndex, state.pending.length - 1);
          if (state.pendingActiveIndex < 0) {
            state.pendingActiveIndex = 0;
          }
          renderPending();
          persistPendingState();
        }
      } catch (err) {
        showToast(err.message || 'Failed to label prompt', 'error');
      }
    });

    container.appendChild(select);
    container.appendChild(actionSelect);
    container.appendChild(assignButton);

    const flagButton = document.createElement('button');
    flagButton.className = 'button ghost';
    flagButton.type = 'button';
    flagButton.textContent = flaggedPrompts.has(item.text_hash) ? 'Flagged' : 'Flag';
    flagButton.addEventListener('click', () => {
      if (!item.text_hash) return;
      if (flaggedPrompts.has(item.text_hash)) {
        flaggedPrompts.delete(item.text_hash);
        showToast('Flag removed');
      } else {
        flaggedPrompts.add(item.text_hash);
        showToast('Marked as needs new tool');
      }
      renderPending();
    });
    container.appendChild(flagButton);
    actionCell.appendChild(container);

    row.appendChild(textCell);
    row.appendChild(intentCell);
    row.appendChild(reasonCell);
    row.appendChild(actionCell);

    if (flaggedPrompts.has(item.text_hash)) {
      row.classList.add('pending-row-flagged');
    }

    el.pendingTable.appendChild(row);
  });

  if (!state.pending.length) {
    state.pendingActiveIndex = -1;
  } else if (state.pendingActiveIndex >= state.pending.length || state.pendingActiveIndex < 0) {
    state.pendingActiveIndex = 0;
  }
  applyPendingHighlight();
  updatePendingNav();
}

function updatePendingNav() {
  if (el.pendingPageLabel) {
    el.pendingPageLabel.textContent = String(state.pendingPage);
  }
  if (el.pendingPrev) {
    el.pendingPrev.disabled = state.pendingPage <= 1;
  }
  if (el.pendingNext) {
    el.pendingNext.disabled = !state.pendingHasMore;
  }
  if (el.pendingLimitSelect) {
    el.pendingLimitSelect.value = String(state.pendingLimit);
  }
}

function persistPendingState() {
  try {
    localStorage.setItem(STORAGE_KEYS.PENDING_PAGE, String(state.pendingPage));
    localStorage.setItem(STORAGE_KEYS.PENDING_LIMIT, String(state.pendingLimit));
  } catch (err) {
    // ignore storage failures
  }
}

function applyPendingHighlight() {
  if (!el.pendingTable) return;
  const rows = el.pendingTable.querySelectorAll('tr');
  rows.forEach((row, idx) => {
    row.classList.toggle('pending-row-active', idx === state.pendingActiveIndex);
  });
  const activeRow = rows[state.pendingActiveIndex];
  if (activeRow) {
    activeRow.scrollIntoView({ block: 'nearest' });
  }
}

function movePendingSelection(delta) {
  if (!state.pending.length) return;
  const nextIndex = Math.min(Math.max(state.pendingActiveIndex + delta, 0), state.pending.length - 1);
  if (nextIndex === state.pendingActiveIndex) return;
  state.pendingActiveIndex = nextIndex;
  applyPendingHighlight();
}

function triggerPendingSave() {
  if (!el.pendingTable || state.pendingActiveIndex < 0) return;
  const rows = el.pendingTable.querySelectorAll('tr');
  const row = rows[state.pendingActiveIndex];
  if (!row) return;
  const button = row.querySelector('button[data-action="save"]');
  if (button) {
    button.click();
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

function renderLabeled() {
  if (!el.labeledTable) return;
  el.labeledTable.innerHTML = '';
  state.labeled.forEach((item) => {
    const row = document.createElement('tr');
    ['text', 'parser_intent', 'reviewer_intent', 'reviewer_action'].forEach((key) => {
      const cell = document.createElement('td');
      cell.textContent = item[key] || '—';
      row.appendChild(cell);
    });
    el.labeledTable.appendChild(row);
  });
}

function renderStats() {
  if (state.stats.pending && el.statsPending) {
    el.statsPending.textContent = state.stats.pending.total ?? 0;
    const intents = state.stats.pending.by_intent || {};
    const summary = Object.entries(intents)
      .map(([intent, count]) => `${intent}:${count}`)
      .join(', ');
    el.statsPendingBreakdown.textContent = summary || '—';
  }
  if (el.statsLabeled) {
    el.statsLabeled.textContent = state.stats.labeled_count ?? 0;
  }
  if (el.statsClassifier) {
    const warnings = state.classifier.length;
    el.statsClassifier.textContent = warnings;
  }
}

function renderTodos() {
  if (!el.todosPanel) return;
  el.todosPanel.innerHTML = '';
  state.todos.forEach((todo) => {
    const row = document.createElement('tr');
    const title = document.createElement('td');
    title.textContent = `${todo.title} (#${todo.id.slice(0, 4)})`;
    const status = document.createElement('td');
    status.textContent = todo.status;
    const deadline = document.createElement('td');
    deadline.textContent = todo.deadline || '—';
    const actions = document.createElement('td');
    const completeBtn = document.createElement('button');
    completeBtn.className = 'button ghost';
    completeBtn.textContent = 'Done';
    completeBtn.disabled = todo.status === 'completed';
    completeBtn.addEventListener('click', () => mutateStore('todos', { action: 'update', id: todo.id, status: 'completed' }));
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'button ghost';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => mutateStore('todos', { action: 'delete', id: todo.id }));
    actions.appendChild(completeBtn);
    actions.appendChild(deleteBtn);
    row.appendChild(title);
    row.appendChild(status);
    row.appendChild(deadline);
    row.appendChild(actions);
    el.todosPanel.appendChild(row);
  });
}

function renderKitchen() {
  if (!el.kitchenList) return;
  el.kitchenList.innerHTML = '';
  state.kitchenTips.forEach((tip) => {
    const li = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = tip.title;
    li.appendChild(title);
    const body = document.createElement('p');
    body.textContent = tip.body || '';
    li.appendChild(body);
    if (tip.tags?.length) {
      const tags = document.createElement('p');
      tags.textContent = tip.tags.join(', ');
      li.appendChild(tags);
    }
    el.kitchenList.appendChild(li);
  });
}

function renderCalendar() {
  if (!el.calendarTable) return;
  el.calendarTable.innerHTML = '';
  state.calendar.forEach((event) => {
    const row = document.createElement('tr');
    const title = document.createElement('td');
    title.textContent = `${event.title} (#${event.id.slice(0, 4)})`;
    const start = document.createElement('td');
    start.textContent = event.start;
    const end = document.createElement('td');
    end.textContent = event.end || '—';
    const actions = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'button ghost';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => mutateStore('calendar', { action: 'delete', id: event.id }));
    actions.appendChild(deleteBtn);
    row.appendChild(title);
    row.appendChild(start);
    row.appendChild(end);
    row.appendChild(actions);
    el.calendarTable.appendChild(row);
  });
}

function renderGuide() {
  if (!el.guideList) return;
  el.guideList.innerHTML = '';
  state.appGuide.forEach((entry) => {
    const li = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = `${entry.section_id}: ${entry.title}`;
    li.appendChild(title);
    const body = document.createElement('p');
    body.textContent = (entry.content || '').slice(0, 160) + (entry.content?.length > 160 ? '…' : '');
    li.appendChild(body);
    el.guideList.appendChild(li);
  });
}

async function loadIntents() {
  try {
    const data = await fetchJSON('/api/intents');
    state.intents = data.intents || [];
    state.intentActions = data.actions || {};
  } catch (err) {
    console.warn('Failed to load intents', err);
  }
}

async function loadPending() {
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
  state.pendingActiveIndex = state.pending.length ? 0 : -1;
  renderPending();
  renderStats();
  persistPendingState();
}

async function loadClassifier() {
  const data = await fetchJSON('/api/logs/classifier');
  state.classifier = data.items || [];
  renderClassifier();
  renderStats();
}

async function loadLabeled() {
  const data = await fetchJSON('/api/logs/labeled');
  state.labeled = data.items || [];
  renderLabeled();
}

async function loadStats() {
  const data = await fetchJSON('/api/stats');
  state.stats = data;
  renderStats();
}

async function loadStore(store) {
  const data = await fetchJSON(`/api/data/${store}`);
  if (store === 'todos') {
    state.todos = data.todos || [];
    renderTodos();
  } else if (store === 'kitchen_tips') {
    state.kitchenTips = data.tips || [];
    renderKitchen();
  } else if (store === 'calendar') {
    state.calendar = data.events || [];
    renderCalendar();
  } else if (store === 'app_guide') {
    state.appGuide = data.sections || [];
    renderGuide();
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
  } catch (err) {
    showToast(err.message || 'Update failed', 'error');
  }
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
      setChatStatus('Ready');
    } catch (err) {
      showToast(err.message || 'Chat failed', 'error');
      setChatStatus('Error');
    }
  });

  el.exportButton?.addEventListener('click', async () => {
    el.exportButton.disabled = true;
    try {
      const data = await fetchJSON('/api/logs/export', { method: 'POST' });
      const links = data.files || [];
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
      await loadLabeled();
    } catch (err) {
      showToast(err.message || 'Import failed', 'error');
    }
  });

  el.pendingRefresh?.addEventListener('click', () => {
    loadPending();
  });
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
  el.pendingLimitSelect?.addEventListener('change', (event) => {
    const value = Number(event.target.value) || 10;
    state.pendingLimit = value;
    state.pendingPage = 1;
    persistPendingState();
    loadPending();
  });
  el.classifierRefresh?.addEventListener('click', loadClassifier);
  el.labeledRefresh?.addEventListener('click', loadLabeled);
  el.refreshButton?.addEventListener('click', () => {
    Promise.all([loadStats(), loadPending(), loadClassifier(), loadLabeled(), refreshStores()]);
  });
  el.dataRefresh?.addEventListener('click', refreshStores);
  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.target;
      if (target) {
        switchPage(target);
      }
    });
  });

  el.todoForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(el.todoForm);
    const payload = {
      action: 'create',
      title: formData.get('title'),
      deadline: formData.get('deadline') || undefined,
    };
    await mutateStore('todos', payload);
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
    const payload = {
      action: 'create',
      title: formData.get('title'),
      body: formData.get('body'),
      tags,
      link: formData.get('link') || undefined,
    };
    await mutateStore('kitchen_tips', payload);
    el.kitchenForm.reset();
  });

  el.calendarForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(el.calendarForm);
    const payload = {
      action: 'create',
      title: formData.get('title'),
      start: formData.get('start'),
      end: formData.get('end') || undefined,
      location: formData.get('location') || undefined,
    };
    await mutateStore('calendar', payload);
    el.calendarForm.reset();
  });

  el.guideForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(el.guideForm);
    const payload = {
      action: 'upsert',
      section_id: formData.get('section_id'),
      title: formData.get('title'),
      content: formData.get('content'),
    };
    await mutateStore('app_guide', payload);
    el.guideForm.reset();
  });

  document.addEventListener('keydown', (event) => {
    const trainingActive = el.trainingPage?.classList.contains('active');
    if (!trainingActive || !state.pending.length) {
      return;
    }
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'j') {
      event.preventDefault();
      movePendingSelection(1);
    } else if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'k') {
      event.preventDefault();
      movePendingSelection(-1);
    } else if (event.key === 'Enter' || event.key.toLowerCase() === 's') {
      event.preventDefault();
      triggerPendingSave();
    }
  });
}

async function refreshStores() {
  await Promise.all([loadStore('todos'), loadStore('kitchen_tips'), loadStore('calendar'), loadStore('app_guide')]);
}

async function bootstrap() {
  wireEvents();
  setChatStatus('Ready');
  let initialPage = 'front-page';
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.ACTIVE_PAGE);
    if (stored && document.getElementById(stored)) {
      initialPage = stored;
    }
    const storedPendingPage = Number(localStorage.getItem(STORAGE_KEYS.PENDING_PAGE));
    if (!Number.isNaN(storedPendingPage) && storedPendingPage > 0) {
      state.pendingPage = storedPendingPage;
    }
    const storedPendingLimit = Number(localStorage.getItem(STORAGE_KEYS.PENDING_LIMIT));
    if (!Number.isNaN(storedPendingLimit) && storedPendingLimit > 0) {
      state.pendingLimit = storedPendingLimit;
    }
  } catch (err) {
    // ignore storage errors
  }
  switchPage(initialPage);
  await loadIntents();
  await Promise.all([loadStats(), loadPending(), loadClassifier(), loadLabeled(), refreshStores()]);
}

bootstrap().catch((err) => console.error(err));
