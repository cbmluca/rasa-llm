import { state, STORAGE_KEYS, el } from '../helpers/shared.js';
import { fetchJSON } from '../helpers/api.js';
import {
  normalizePendingRecord,
  sortPendingByRecency,
  normalizeRelatedPromptsList,
  normalizeIntendedEntities,
  arePromptListsEqual,
} from './pendingUtils.js';
import { persistPendingState } from './pendingPolling.js';

const queueDependencies = {
  renderPendingList: () => {},
  renderStats: () => {},
  resetSelection: () => {},
  renderCorrectionForm: () => {},
  selectPendingPrompt: () => {},
  prepareParserFields: () => ({ fields: {}, hidden: {} }),
  applyPronounResolution: (fields) => fields,
};

export function configurePendingQueue(config = {}) {
  Object.assign(queueDependencies, config);
}

export async function loadPending(preserveSelection = false) {
  let previousId = preserveSelection ? state.selectedPromptId : null;
  if (!previousId && preserveSelection) {
    try {
      previousId = localStorage.getItem(STORAGE_KEYS.SELECTED_PROMPT);
    } catch (err) {
      previousId = null;
    }
  }
  const params = new URLSearchParams({ limit: state.pendingLimit, page: state.pendingPage });
  const data = await fetchJSON(`/api/logs/pending?${params.toString()}`);
  const normalizedItems = (data.items || []).map((item) => normalizePendingRecord(item));
  state.pending = sortPendingByRecency(normalizedItems);
  state.stats.pending = data.summary;
  state.pendingHasMore = Boolean(data.has_more);
  if (typeof data.page === 'number') {
    state.pendingPage = data.page;
  }
  if (typeof data.limit === 'number') {
    state.pendingLimit = data.limit;
  }
  queueDependencies.renderPendingList();
  queueDependencies.renderStats();
  persistPendingState();
  if (!state.pending.length) {
    queueDependencies.resetSelection();
    return;
  }
  if (preserveSelection && previousId) {
    const existing = state.pending.find((item) => item.prompt_id === previousId);
    if (existing) {
      const currentIntent = el.intentSelect?.value || state.selectedPrompt?.intent || existing.intent;
      const currentAction =
        el.actionSelect?.value || state.selectedPrompt?.predicted_payload_raw?.action || existing.predicted_payload?.action;
      const currentFields = { ...state.correctionFields };
      const currentHidden = { ...state.hiddenFields };
      const currentFieldVersions = { ...state.fieldVersions };
      const currentIntended = (state.intendedEntities || []).map((entry) => ({ ...entry }));
      const currentRelated = [...(state.selectedPrompt?.related_prompts || [])];
      const preserveUserFields = Object.keys(currentFields).length > 0;
      const preserveHiddenFields = Object.keys(currentHidden).length > 0;
      const pendingRelated = normalizeRelatedPromptsList(existing);
      const preserveRelated = !arePromptListsEqual(currentRelated, pendingRelated);
      const previousPayload =
        state.selectedPrompt?.predicted_payload_raw || existing.predicted_payload || existing.parser_payload || {};
      const prepared = queueDependencies.prepareParserFields(currentIntent, previousPayload);
      state.selectedPrompt = {
        ...existing,
        intent: currentIntent,
        predicted_payload_raw: { ...previousPayload },
        related_prompts: pendingRelated,
        intended_entities: normalizeIntendedEntities(existing),
        field_versions: existing.field_versions || {},
      };
      if (currentAction) {
        state.selectedPrompt.predicted_payload_raw.action = currentAction;
      }
      if (preserveUserFields) {
        state.correctionFields = currentFields;
      } else {
        state.correctionFields = prepared.fields;
        state.datetimeInputs = {};
      }
      state.hiddenFields = preserveHiddenFields ? currentHidden : prepared.hidden || {};
      const hasReviewerVersions = Object.keys(currentFieldVersions).length > 0;
      state.fieldVersions = hasReviewerVersions ? currentFieldVersions : { ...(state.selectedPrompt.field_versions || {}) };
      state.selectedPrompt.field_versions = { ...state.fieldVersions };
      const pendingIntended = normalizeIntendedEntities(existing);
      const preserveIntended = !arePromptListsEqual(currentIntended, pendingIntended);
      state.intendedEntities = preserveIntended ? currentIntended : pendingIntended;
      state.selectedPrompt.intended_entities = [...state.intendedEntities];
      state.selectedPrompt.related_prompts = preserveRelated ? currentRelated : pendingRelated;
      queueDependencies.renderPendingList();
      queueDependencies.renderCorrectionForm();
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_PROMPT);
    } catch (err) {
      // ignore
    }
  }
  queueDependencies.selectPendingPrompt(state.pending[0]);
}

export function applyPronounResolution(fields, item) {
  return fields;
}
