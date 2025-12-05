import { state } from './helpers/shared.js';
import { showToast } from './utils.js';
import { recordOfflineVoiceAttempt } from './voice.js';

export function registerServiceWorker() {
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
