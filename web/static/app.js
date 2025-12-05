import { renderPendingList, renderRelatedPrompts, updateRelatedPromptOptions, addPendingRecord } from './src/pending/pending.js';
import { fetchStore, refreshStores, refreshActiveDataTab } from './src/dataStores.js';
import { configurePendingPolling } from './src/pending/pendingPolling.js';
import { configurePendingQueue, loadPending, applyPronounResolution } from './src/pending/pendingQueue.js';
import { renderVersionHistory, renderStats, loadCorrected, loadStats } from './src/pending/pendingStats.js';
import { configurePendingRender, detachEditorPanel } from './src/pending/pendingRender.js';
import { configureVoiceInbox, loadVoiceInbox, wireVoiceInboxControls } from './src/voiceInbox.js';
import { configurePendingDashboard, renderCorrectionForm, selectPendingPrompt, resetSelection } from './src/pending/pendingDashboard.js';
import { configureChat } from './src/chat.js';
import { autoSelectIdForTitle, normalizeActionName, prepareParserFields, updateActionSelectOptions, updateCorrectButtonState, renderDynamicFields } from './src/pending/pendingFieldHelpers.js';
import { configureVoice } from './src/voice.js';
import { buildReviewerHeaders } from './src/helpers/api.js';
import { configureCorrectionsService, deletePendingPrompt } from './src/services/correctionsService.js';
import { bootstrapApp } from './src/helpers/bootstrap.js';
import { wireEvents } from './src/wireEvents.js';
import { normalizeRelatedPromptsList, normalizeIntendedEntities } from './src/pending/pendingUtils.js';

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

configurePendingDashboard({
  detachEditorPanel,
  renderDynamicFields,
  renderRelatedPrompts,
  renderPendingList,
  renderVersionHistory,
  updateCorrectButtonState,
  updateActionSelectOptions,
  normalizeActionName,
  prepareParserFields,
  normalizeRelatedPromptsList,
  normalizeIntendedEntities,
  autoSelectIdForTitle,
});

configureChat({
  loadPending,
  refreshActiveDataTab,
  updateRelatedPromptOptions,
  onAddPendingRecord: addPendingRecord,
});

configureVoiceInbox({
  loadPending,
  refreshActiveDataTab,
});

wireVoiceInboxControls();

configureCorrectionsService({
  loadPending,
  loadCorrected,
  loadStats,
  refreshStores,
  fetchStore,
  resetSelection,
});

configureVoice({
  buildReviewerHeaders,
  loadPending,
  refreshActiveDataTab,
});

configurePendingPolling({
  loadPending,
  refreshActiveDataTab,
  loadVoiceInbox,
});

bootstrapApp({ wireEvents }).catch((err) => console.error(err));
