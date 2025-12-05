import { state, el, STORAGE_KEYS } from '../helpers/shared.js';

const dependencies = {
  detachEditorPanel: () => {},
  renderDynamicFields: () => {},
  renderRelatedPrompts: () => {},
  renderPendingList: () => {},
  renderVersionHistory: () => {},
  updateCorrectButtonState: () => {},
  updateActionSelectOptions: () => {},
  normalizeActionName: () => null,
  prepareParserFields: () => ({ fields: {}, hidden: {} }),
  normalizeRelatedPromptsList: () => [],
  normalizeIntendedEntities: () => [],
  autoSelectIdForTitle: () => {},
};

export function configurePendingDashboard(config = {}) {
  Object.assign(dependencies, config);
}

export function renderCorrectionForm() {
  if (!el.intentSelect || !el.actionSelect) return;
  dependencies.renderRelatedPrompts();
  if (!state.selectedPrompt) {
    dependencies.detachEditorPanel();
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
    if (el.dynamicFieldGrid) {
      el.dynamicFieldGrid.innerHTML = '<p class="hint">Select a pending intent to edit tool fields.</p>';
    }
    if (el.versionHistory) {
      el.versionHistory.innerHTML = '<p class="hint">Version history is empty.</p>';
    }
    dependencies.updateCorrectButtonState();
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
  const normalizedAction = dependencies.normalizeActionName(reviewerIntent, predicted.action);
  if (normalizedAction !== predicted.action) {
    predicted.action = normalizedAction;
    state.selectedPrompt.predicted_payload_raw = predicted;
  }
  dependencies.updateActionSelectOptions(reviewerIntent, normalizedAction);
  const actionValue = el.actionSelect?.value || '';
  dependencies.renderDynamicFields(reviewerIntent, actionValue);
  dependencies.renderVersionHistory();
  dependencies.updateCorrectButtonState();
}

export function selectPendingPrompt(item) {
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
  const normalizedAction = dependencies.normalizeActionName(resolvedIntent, predicted.action);
  if (normalizedAction && normalizedAction !== predicted.action) {
    predicted.action = normalizedAction;
  }
  const prepared = dependencies.prepareParserFields(resolvedIntent, predicted);
  const relatedPrompts = dependencies.normalizeRelatedPromptsList(item);
  const intendedEntities = dependencies.normalizeIntendedEntities(item);
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
  if (state.selectedPrompt?.matched_entity) {
    const match = state.selectedPrompt.matched_entity;
    state.correctionFields.id = match.value;
    state.hiddenFields.lookup_title = match.label;
    delete state.selectedPrompt.matched_entity;
  } else if (state.correctionFields.title) {
    dependencies.autoSelectIdForTitle(resolvedIntent, state.correctionFields.title);
  }
  dependencies.renderPendingList();
  renderCorrectionForm();
}

export function resetSelection() {
  state.selectedPromptId = null;
  state.selectedPrompt = null;
  state.correctionFields = {};
  state.hiddenFields = {};
  state.fieldVersions = {};
  state.intendedEntities = [];
  renderCorrectionForm();
  dependencies.renderPendingList();
  try {
    localStorage.removeItem(STORAGE_KEYS.SELECTED_PROMPT);
  } catch (err) {
    // ignore
  }
}
