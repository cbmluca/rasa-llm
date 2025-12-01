import {
  ACTION_ALIASES,
  DATE_TIME_FIELD_CONFIG,
  DEFAULT_INTENT_ACTIONS,
  ENTITY_FIELD_CONFIG,
  FIELD_LIBRARY,
  FIELD_ORDER,
  getFieldLabel,
  getNoteSectionTitles,
  MUTATING_ACTIONS,
  STORAGE_KEYS,
  TITLE_LOOKUP_ACTIONS,
  TITLE_LOOKUP_TOOLS,
  TITLE_SELECT_ACTIONS,
  TITLE_SELECT_TOOLS,
  TOOL_ACTION_FIELD_CONFIG,
  TOOL_EXTRA_FIELDS,
  TOOL_REQUIRED_FIELDS,
  state,
  el,
  navButtons,
  VOICE_MIN_DURATION_MS,
  VOICE_MAX_DURATION_MS,
  VOICE_MIME_TYPES,
} from './src/shared.js';
import {
  hideToast,
  setChatStatus,
  setVoiceStatus,
  showToast,
} from './src/utils.js';
import { applyFieldLayout, buildRelativeDateOptions, buildRelativeTimeOptions, fieldHasValue } from './src/toolUtils.js';
import {
  normalizeRelatedPromptsList,
  normalizeIntendedEntities,
  flagReviewerChange,
} from './src/pendingUtils.js';
import { fetchJSON } from './src/api.js';
import { configurePendingRender } from './src/pendingRender.js';
import {
  renderPendingList,
  renderRelatedPrompts,
  updateRelatedPromptOptions,
  hideEntityOptions,
  hideRelatedPromptOptions,
  renderIntendedEntities,
  updateEntityOptions,
  addPendingRecord,
  supportsIntendedEntities,
} from './src/pending.js';
import {
  restoreDataPanelState,
  fetchStore,
  refreshStores,
  refreshActiveDataTab,
  setActiveDataTab,
  mutateStore,
  renderCalendar,
  renderKitchen,
  renderNotes,
  setCalendarSort,
  setKitchenSort,
} from './src/dataStores.js';
import { configurePendingPolling, persistPendingState, startPendingPolling, stopPendingPolling } from './src/pendingPolling.js';
import { configurePendingQueue, loadPending, applyPronounResolution } from './src/pendingQueue.js';
import {
  renderCorrectedTable,
  renderVersionHistory,
  renderLatestConfirmed,
  renderStats,
  loadClassifier,
  loadCorrected,
  loadStats,
} from './src/pendingStats.js';
import {
  renderTodos,
  renderTodoCrudForm,
  handleTodoFormSubmit,
  resetTodoForm,
  setTodoCrudAction,
  setTodoSort,
} from './src/todoTool.js';
import { configureVoiceInbox, loadVoiceInbox, changeVoiceInboxPage } from './src/voiceInbox.js';

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




function buildReviewerHeaders(base = {}) {
  const headers = { ...(base || {}) };
  const reviewerId = state.user?.username;
  if (reviewerId && !headers['X-Reviewer-ID']) {
    headers['X-Reviewer-ID'] = reviewerId;
  }
  return headers;
}

function isAdminUser() {
  return Array.isArray(state.user?.roles) && state.user.roles.includes('admin');
}

function handleAuthenticationFailure(message) {
  clearAuthenticatedUser();
  state.initialized = false;
  stopPendingPolling();
  showLoginModal(message || 'Please log in.');
}

function showLoginModal(message) {
  state.loginVisible = true;
  if (el.loginModal) {
    el.loginModal.classList.add('show');
    el.loginModal.classList.remove('hidden');
  }
  if (el.loginError) {
    if (message) {
      el.loginError.textContent = message;
      el.loginError.classList.remove('hidden');
    } else {
      el.loginError.classList.add('hidden');
      el.loginError.textContent = '';
    }
  }
  if (el.loginPassword) {
    el.loginPassword.value = '';
  }
}

function hideLoginModal() {
  state.loginVisible = false;
  if (el.loginModal) {
    el.loginModal.classList.remove('show');
    el.loginModal.classList.add('hidden');
  }
  if (el.loginError) {
    el.loginError.classList.add('hidden');
  }
}

function setAuthenticatedUser(payload) {
  state.user = payload || null;
  state.loginError = '';
  renderAuthUI();
  return state.user;
}

function clearAuthenticatedUser() {
  state.user = null;
  state.adminShowOnlyMine = false;
  renderAuthUI();
}

function renderAuthUI() {
  if (el.authStatusBadge) {
    if (state.user) {
      const roles = Array.isArray(state.user.roles) ? state.user.roles.join(', ') : '';
      const label = roles ? `${state.user.username} (${roles})` : state.user.username;
      el.authStatusBadge.textContent = label;
    } else {
      el.authStatusBadge.textContent = 'Not logged in';
    }
  }
  if (el.authUsage) {
    const usage = state.user?.usage;
    if (state.user && usage && usage.limit && !isAdminUser()) {
      const used = usage.used ?? 0;
      const left = Math.max((usage.limit ?? 0) - used, 0);
      el.authUsage.textContent = `Remaining: ${left}/${usage.limit}`;
      el.authUsage.classList.remove('hidden');
    } else {
      el.authUsage.textContent = '';
      el.authUsage.classList.add('hidden');
    }
  }
  if (el.showLoginButton) {
    if (state.user) {
      el.showLoginButton.classList.add('hidden');
    } else {
      el.showLoginButton.classList.remove('hidden');
    }
  }
  if (el.logoutButton) {
    if (state.user) {
      el.logoutButton.classList.remove('hidden');
    } else {
      el.logoutButton.classList.add('hidden');
    }
  }
  updateScopeButtons();
}

function updateScopeButtons() {
  const admin = isAdminUser();
  if (el.pendingScopeToggle) {
    if (!admin) {
      el.pendingScopeToggle.classList.add('hidden');
      if (el.pendingScopeBadge) {
        el.pendingScopeBadge.classList.add('hidden');
      }
    } else {
      el.pendingScopeToggle.classList.remove('hidden');
      el.pendingScopeToggle.textContent = state.adminShowOnlyMine ? 'Show all entries' : 'Show only my entries';
      if (el.pendingScopeBadge) {
        el.pendingScopeBadge.textContent = state.adminShowOnlyMine ? 'Viewing your entries' : 'Viewing all reviewers';
        el.pendingScopeBadge.classList.remove('hidden');
      }
    }
  }
  if (el.dataScopeToggle) {
    if (!admin) {
      el.dataScopeToggle.classList.add('hidden');
      if (el.dataScopeBadge) {
        el.dataScopeBadge.classList.add('hidden');
      }
    } else {
      el.dataScopeToggle.classList.remove('hidden');
      el.dataScopeToggle.textContent = state.adminShowOnlyMine ? 'Show all entries' : 'Show only my entries';
      if (el.dataScopeBadge) {
        el.dataScopeBadge.textContent = state.adminShowOnlyMine ? 'Viewing your entries' : 'Viewing all reviewers';
        el.dataScopeBadge.classList.remove('hidden');
      }
    }
  }
}

function toggleAdminScope() {
  state.adminShowOnlyMine = !state.adminShowOnlyMine;
  renderPendingList();
  renderStats();
  renderAllDataPanels();
  updateScopeButtons();
}

function purgeSensitiveState() {
  state.pending = [];
  state.classifier = [];
  state.corrected = [];
  state.stats = {};
  state.chat = [];
  state.dataStores = {
    todos: [],
    calendar: [],
    kitchen_tips: [],
    app_guide: [],
  };
  state.latestConfirmed = null;
  renderChat();
  renderPendingList();
  renderStats();
  renderCorrectedTable();
  renderAllDataPanels();
}

function renderAllDataPanels() {
  renderTodos();
  renderCalendar();
  renderKitchen();
  renderNotes();
}

async function submitLogin(event) {
  if (event) {
    event.preventDefault();
  }
  if (!el.loginUsername) return;
  const username = (el.loginUsername.value || '').trim();
  const password = el.loginPassword?.value || '';
  if (!username) {
    if (el.loginError) {
      el.loginError.textContent = 'Username is required.';
      el.loginError.classList.remove('hidden');
    }
    return;
  }
  try {
    const payload = await fetchJSON('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setAuthenticatedUser(payload);
    hideLoginModal();
    await initializeAppData({ force: true });
  } catch (err) {
    if (el.loginError) {
      el.loginError.textContent = err?.message || 'Login failed';
      el.loginError.classList.remove('hidden');
    }
  }
}

async function performLogout() {
  try {
    await fetchJSON('/api/logout', { method: 'POST' });
  } catch (err) {
    console.warn('Logout failed', err);
  }
  clearAuthenticatedUser();
  state.initialized = false;
  stopPendingPolling();
  purgeSensitiveState();
  showLoginModal('Logged out. Please sign in again.');
}

async function ensureAuthenticated() {
  if (state.user) {
    return state.user;
  }
  try {
    const payload = await fetchJSON('/api/me');
    return setAuthenticatedUser(payload);
  } catch (err) {
    state.user = null;
    state.initialized = false;
    throw err;
  }
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
    const offline = typeof err?.message === 'string' && err.message.toLowerCase().includes('offline');
    if (offline) {
      recordOfflineVoiceAttempt({ reason: 'offline', size: blob.size, mimeType: blob.type });
      showToast('Offline voice upload logged. Re-send when back online.', 'warning');
    } else {
      showToast(err?.message || 'Voice upload failed', 'error');
    }
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
  const installHints = document.querySelectorAll('.install-hint');
  const toggleInstallHints = (ready) => {
    installHints.forEach((hint) => hint.classList.toggle('hidden', !ready));
  };

  const hasServiceWorker = 'serviceWorker' in navigator;
  const controllerReady = hasServiceWorker && Boolean(navigator.serviceWorker.controller);
  state.serviceWorkerReady = controllerReady;
  toggleInstallHints(controllerReady);

  if (!hasServiceWorker) {
    return;
  }

  const markServiceWorkerReady = () => {
    if (state.serviceWorkerReady) {
      toggleInstallHints(true);
      return;
    }
    state.serviceWorkerReady = true;
    toggleInstallHints(true);
    showToast('Offline shell ready. Use Add to Home Screen for offline voice retries.', 'success');
  };

  navigator.serviceWorker
    .register('/static/service-worker.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => markServiceWorkerReady())
    .catch((err) => {
      console.warn('Service worker registration failed', err);
    });

  if (!controllerReady) {
    navigator.serviceWorker.addEventListener('controllerchange', markServiceWorkerReady);
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    if (state.serviceWorkerReady) {
      return;
    }
    event.preventDefault();
    showToast('Offline shell is still caching. Try Add to Home Screen after this message clears.', 'info');
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
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
    if (entry.offline) {
      const offlineMeta = document.createElement('div');
      offlineMeta.className = 'chat-meta offline';
      const queuedAtDate = entry.queuedAt ? new Date(entry.queuedAt) : null;
      const queuedAt = queuedAtDate && !Number.isNaN(queuedAtDate.getTime())
        ? queuedAtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : null;
      offlineMeta.textContent = queuedAt ? `Queued offline · ${queuedAt}` : 'Queued offline';
      wrapper.appendChild(offlineMeta);
    }
    el.chatLog.appendChild(wrapper);
  });
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

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

configurePendingRender({
  deletePendingPrompt,
  renderCorrectionForm,
  selectPendingPrompt,
});

configurePendingQueue({
  renderPendingList,
  renderStats,
  resetSelection,
  renderCorrectionForm,
  selectPendingPrompt,
  prepareParserFields,
  applyPronounResolution,
});

configureVoiceInbox({
  loadPending,
  refreshActiveDataTab,
});

configurePendingPolling({
  loadPending,
  refreshActiveDataTab,
  loadVoiceInbox,
});

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
      await Promise.all(response.updated_stores.map((store) => fetchStore(store)));
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
async function initializeAppData(options = {}) {
  const { force = false } = options;
  if (state.initialized && !force) {
    return;
  }
  stopPendingPolling();
  try {
    await ensureAuthenticated();
    await loadIntents();
    await Promise.all([
      loadStats(),
      loadPending(true),
      loadClassifier(),
      loadCorrected(),
      refreshStores(),
      loadVoiceInbox(),
    ]);
    renderLatestConfirmed();
    startPendingPolling();
    state.initialized = true;
  } catch (err) {
    if (!state.loginVisible) {
      showLoginModal(err?.message || 'Sign in to load dashboard data.');
    }
    if (!(err?.message || '').toLowerCase().includes('authentication')) {
      showToast(err?.message || 'Failed to load dashboard data.', 'error');
    }
  }
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
      if (isOfflineError(err)) {
        queueOfflineChatMessage(message, userEntry);
      } else {
        showToast(err.message || 'Chat failed', 'error');
      }
      state.pendingChatEntry = null;
    } finally {
      setChatStatus('Ready');
    }
  });

  el.offlineQueueRetryBtn?.addEventListener('click', () => {
    retryOfflineChatQueue();
  });

  el.toastClose?.addEventListener('click', hideToast);

  window.addEventListener('online', () => {
    renderOfflineQueueBanner();
    if (state.offlineChatQueue.length) {
      showToast('Back online. Retrying queued prompts…', 'info');
      retryOfflineChatQueue({ silent: true });
    }
  });

  window.addEventListener('offline', () => {
    renderOfflineQueueBanner();
    showToast('Offline: prompts will queue until you retry.', 'warning');
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
    Promise.all([
      loadStats(),
      loadPending(true),
      loadClassifier(),
      loadCorrected(),
      refreshStores(),
      loadVoiceInbox(),
    ]),
  );
  el.showLoginButton?.addEventListener('click', () => showLoginModal());
  el.logoutButton?.addEventListener('click', () => performLogout());
  el.loginForm?.addEventListener('submit', submitLogin);
  el.loginCancel?.addEventListener('click', hideLoginModal);
  el.pendingScopeToggle?.addEventListener('click', () => toggleAdminScope());
  el.dataScopeToggle?.addEventListener('click', () => toggleAdminScope());
  el.dataRefresh?.addEventListener('click', () => refreshStores([state.activeDataTab]));
  el.voiceRefresh?.addEventListener('click', () => loadVoiceInbox({ resetPage: true }));
  el.voicePrev?.addEventListener('click', () => changeVoiceInboxPage(-1));
  el.voiceNext?.addEventListener('click', () => changeVoiceInboxPage(1));

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
  disableAutofill();
  detectVoiceSupport();
  registerServiceWorker();
  wireEvents();
  renderAuthUI();
  setActiveDataTab(state.activeDataTab, { force: true, skipRefresh: true, persist: false });
  setChatStatus('Ready');
  window.scrollTo(0, 0);
  loadStoredChatHistory();
  loadOfflineChatQueue();
  loadStoredLatestConfirmed();
  loadStoredSelection();
  renderChat();
  renderOfflineQueueBanner();
  if (state.offlineChatQueue.length && navigator?.onLine) {
    retryOfflineChatQueue({ silent: true });
  }
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
  try {
    await ensureAuthenticated();
    hideLoginModal();
    await initializeAppData({ force: true });
  } catch (err) {
    state.initialized = false;
    showLoginModal('Sign in to load reviewer data.');
  }
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
