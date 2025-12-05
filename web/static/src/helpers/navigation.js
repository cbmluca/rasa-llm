import { state, el, navButtons, STORAGE_KEYS } from './shared.js';
import { renderPendingList } from '../pending/pending.js';
import { renderStats, renderCorrectedTable } from '../pending/pendingStats.js';
import { renderChat } from '../chat.js';
import { renderAllDataPanels } from '../dataStores.js';
import { fetchJSON, configureApi } from './api.js';
import { stopPendingPolling } from '../pending/pendingPolling.js';
import {
  handleAuthenticationFailure,
  showLoginModal,
  clearAuthenticatedUser,
  updateScopeButtons,
} from '../pending/pendingQueueHelpers.js';

configureApi({
  onAuthFailure: (detail) => handleAuthenticationFailure(detail || 'Authentication required.'),
});

// WHAT: disable browser autocomplete heuristics for the entire dashboard.
// WHY: Tier-5 uses custom forms and we want consistent text entry behavior across reviewers.
// HOW: unset `autocomplete` on every form/field once on load so browsers don’t yank focus away.
export function disableAutofill() {
  document.querySelectorAll('form').forEach((form) => form.setAttribute('autocomplete', 'off'));
  document
    .querySelectorAll('input, textarea')
    .forEach((field) => field.setAttribute('autocomplete', 'off'));
}

// WHAT: toggle the admin-only scope filters so reviewers can switch between "only mine" and "all".
// WHY: admin reviewers inspect both views and need quick toggles without refreshing the queue.
// HOW: flip the flag, rerender the pending + stats tables, refresh the data panels, then update both toggles.
export function toggleAdminScope() {
  state.adminShowOnlyMine = !state.adminShowOnlyMine;
  renderPendingList();
  renderStats();
  renderAllDataPanels();
  updateScopeButtons();
}

// WHAT: clear sensitive UI state when a reviewer logs out.
// WHY: leftover reviewer data must never persist after sign-out.
// HOW: zero-out the shared collections and rerender every panel that could surface stale rows.
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

// WHAT: log the user out and clear the dashboard.
// WHY: reviewers must be able to end their session safely.
// HOW: hit `/api/logout`, reset authentication state, stop polling, clear UI state, and show the login modal.
export async function performLogout() {
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

// WHAT: show/hide the global navigation panels.
// WHY: the SPA needs to keep only one top-level view visible.
// HOW: toggle `.active` on pages + nav buttons and persist the choice in localStorage.
export function switchPage(targetId) {
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
  } catch {
    // ignore storage issues
  }
}
