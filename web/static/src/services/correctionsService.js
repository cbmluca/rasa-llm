import { state, el } from '../helpers/shared.js';
import { fetchJSON } from '../helpers/api.js';
import { showToast } from '../utils.js';
import {
  normalizeActionName,
  prepareParserFields,
  supportsTitleLookup,
  updateCorrectButtonState,
} from '../pending/pendingFieldHelpers.js';
import { supportsIntendedEntities } from '../pending/pending.js';
import { renderLatestConfirmed, persistLatestConfirmed, loadCorrected, loadStats } from '../pending/pendingStats.js';

const correctionsDeps = {
  loadPending: () => Promise.resolve(),
  refreshStores: () => Promise.resolve(),
  fetchStore: () => Promise.resolve(),
  resetSelection: () => {},
};

export function configureCorrectionsService(config = {}) {
  Object.assign(correctionsDeps, config);
}

function hasDuplicateTitle(tool, title) {
  if (!tool || !title) return false;
  const entries = state.dataStores[tool] || [];
  const normalized = title.trim().toLowerCase();
  return entries.some((entry) =>
    ((entry.title || entry.name || entry.id || '').toString().trim().toLowerCase() === normalized),
  );
}

function removePendingEntriesFromState(promptId, relatedPrompts = []) {
  const normalizedRelated = new Set((relatedPrompts || []).map((text) => (text || '').trim()));
  state.pending = (state.pending || []).filter((item) => {
    if (!item) return false;
    if (item.prompt_id === promptId) {
      return false;
    }
    const text = (item.user_text || '').trim();
    if (normalizedRelated.has(text)) {
      return false;
    }
    return true;
  });
}

function gatherCorrectionPayload() {
  if (!state.selectedPrompt) return null;
  const reviewerIntent = el.intentSelect?.value || state.selectedPrompt.intent;
  if (!reviewerIntent) return null;
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
  const prepared = prepareParserFields(reviewerIntent, state.selectedPrompt.predicted_payload_raw || {});
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
    prepared_parser_fields: prepared,
  };
}

export async function submitCorrection() {
  const payload = gatherCorrectionPayload();
  if (!payload) {
    showToast('Select a prompt and fill the required fields first.');
    return;
  }
  const reviewerAction = (payload.action || payload.corrected_payload?.action || '').toLowerCase();
  const titleValue = (payload.corrected_payload?.title || '').trim();
  const isDuplicateTraining = reviewerAction === 'create' && hasDuplicateTitle(payload.tool, titleValue);
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
    state.latestConfirmed = response.record;
    persistLatestConfirmed();
    renderLatestConfirmed();
    const toastMessage = payload.training_duplicate ? 'Duplicate added to training data' : 'Action triggered';
    showToast(toastMessage);
    delete state.duplicateConfirmations[payload.prompt_id];
    removePendingEntriesFromState(payload.prompt_id, payload.corrected_payload?.related_prompts || []);
    const fetchPromises = (response.updated_stores || []).map((store) => correctionsDeps.fetchStore(store));
    await Promise.all([
      ...fetchPromises,
      correctionsDeps.loadPending(true),
      loadCorrected(),
      loadStats(),
    ]);
  } catch (err) {
    showToast(err.message || 'Failed to save correction', 'error');
  } finally {
    el.correctButton.disabled = false;
    updateCorrectButtonState();
  }
}

export async function deletePendingPrompt(item) {
  if (!item) return;
  const targetId = item.prompt_id || item.text_hash;
  if (!targetId) {
    showToast('Unable to delete prompt without an id.', 'error');
    return;
  }
  try {
    await fetchJSON(`/api/logs/pending/${encodeURIComponent(targetId)}`, { method: 'DELETE' });
    showToast('Pending intent deleted');
    if (state.selectedPromptId === item.prompt_id) {
      correctionsDeps.resetSelection();
    }
    delete state.duplicateConfirmations[item.prompt_id];
    await correctionsDeps.loadPending();
  } catch (err) {
    showToast(err.message || 'Deletion failed', 'error');
  }
}
