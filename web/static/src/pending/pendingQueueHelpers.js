import { state, el, DEFAULT_INTENT_ACTIONS } from '../helpers/shared.js';
import { fetchJSON } from '../helpers/api.js';
import { normalizeActionName, populateIntentOptions } from './pendingFieldHelpers.js';
import { renderLatestConfirmed, loadStats, loadCorrected, loadClassifier } from './pendingStats.js';
import { loadPending } from './pendingQueue.js';
import { refreshStores } from '../dataStores.js';
import { initializeVoiceInbox, loadVoiceInbox } from '../voiceInbox.js';
import { startPendingPolling, stopPendingPolling } from './pendingPolling.js';
import { showToast } from '../utils.js';

function isAdminUser() {
  return Array.isArray(state.user?.roles) && state.user.roles.includes('admin');
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

function handleAuthenticationFailure(message) {
  clearAuthenticatedUser();
  state.initialized = false;
  stopPendingPolling();
  showLoginModal(message || 'Please log in.');
}

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

async function loadIntents() {
  const data = await fetchJSON('/api/intents');
  state.intents = Array.isArray(data.intents) ? data.intents : [];
  state.intentActions = sanitizeIntentActions(data.intent_actions || {});
  populateIntentOptions();
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
      initializeVoiceInbox(),
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

export {
  handleAuthenticationFailure,
  showLoginModal,
  hideLoginModal,
  setAuthenticatedUser,
  clearAuthenticatedUser,
  renderAuthUI,
  submitLogin,
  ensureAuthenticated,
  initializeAppData,
  updateScopeButtons,
};
