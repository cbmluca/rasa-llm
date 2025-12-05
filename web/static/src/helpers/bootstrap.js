import { state, STORAGE_KEYS } from './shared.js';
import { disableAutofill, switchPage } from './navigation.js';
import { detectVoiceSupport } from '../voice.js';
import { registerServiceWorker } from '../pwa.js';
import { restoreDataPanelState, setActiveDataTab } from '../dataStores.js';
import { setChatStatus } from '../utils.js';
import {
  loadStoredChatHistory,
  loadOfflineChatQueue,
  renderChat,
  renderOfflineQueueBanner,
  retryOfflineChatQueue,
} from '../chat.js';
import {
  loadStoredLatestConfirmed,
  loadStoredSelection,
  renderLatestConfirmed,
} from '../pending/pendingStats.js';
import {
  ensureAuthenticated,
  hideLoginModal,
  initializeAppData,
  showLoginModal,
  renderAuthUI,
} from '../pending/pendingQueueHelpers.js';

// WHAT: central bootstrap routine for the Tier-5 SPA.
// WHY: the dashboard has a lot of shared state that must be wired before reviewers interact.
// HOW: restore persisted UI state, start polling/service worker/voice helpers, hydrate cached data, and complete authentication before leaving the screen ready.
export async function bootstrapApp({ wireEvents }) {
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
  } catch {
    switchPage('front-page');
  }
  try {
    await ensureAuthenticated();
    hideLoginModal();
    await initializeAppData({ force: true });
  } catch {
    state.initialized = false;
    showLoginModal('Sign in to load reviewer data.');
  }
}
