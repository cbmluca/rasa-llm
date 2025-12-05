import { state, el, navButtons } from './helpers/shared.js';
import { wireChatControls } from './chat.js';
import { startVoiceRecording, stopRecording } from './voice.js';
import { wireTodoControls, renderTodoCrudForm } from './tools/toolTodo.js';
import { wireCalendarControls, renderCalendarCrudForm } from './tools/toolCalendar.js';
import { wireKitchenControls, renderKitchenCrudForm } from './tools/toolKitchen.js';
import {
  updateActionSelectOptions,
  renderDynamicFields,
  updateCorrectButtonState,
} from './pending/pendingFieldHelpers.js';
import {
  renderIntendedEntities,
  updateEntityOptions,
  updateRelatedPromptOptions,
  hideEntityOptions,
  hideRelatedPromptOptions,
} from './pending/pending.js';
import { submitCorrection } from './services/correctionsService.js';
import { loadPending } from './pending/pendingQueue.js';
import { persistPendingState } from './pending/pendingPolling.js';
import { loadClassifier, loadCorrected, loadStats } from './pending/pendingStats.js';
import { refreshStores, setActiveDataTab, mutateStore } from './dataStores.js';
import { loadVoiceInbox } from './voiceInbox.js';
import { showLoginModal, hideLoginModal, submitLogin } from './pending/pendingQueueHelpers.js';
import { toggleAdminScope, performLogout, switchPage } from './helpers/navigation.js';
import { setupGuideControls } from './guideControls.js';

export function wireEvents() {
  wireChatControls();

  el.chatVoiceButton?.addEventListener('click', () => {
    if (state.voice.recording) {
      stopRecording();
    } else {
      startVoiceRecording();
    }
  });

  wireTodoControls();
  wireCalendarControls();
  wireKitchenControls();

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

  setupGuideControls({ mutateStore, loadCorrected });

  renderTodoCrudForm();
  renderCalendarCrudForm();
  renderKitchenCrudForm();
}
