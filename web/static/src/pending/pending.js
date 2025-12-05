/**
 * WHAT: Shared helpers for managing the pending queue UI.
 * WHY: Keeps the pending list, metadata chips, and related-prompt state inside one focused module.
 * HOW: expose a `configurePending` API along with render/update helpers so the main bootstrap can stay lean.
 */
import {
  state,
  el,
  ACTION_ALIASES,
  DEFAULT_INTENT_ACTIONS,
  ENTITY_FIELD_CONFIG,
  INTENDED_ENTITY_ACTIONS,
  INTENDED_ENTITY_TOOLS,
} from '../helpers/shared.js';
import { formatPreviewValue } from '../utils.js';
import {
  buildPendingMetadata,
  sortPendingByRecency,
  normalizePendingRecord,
  normalizeRelatedPromptsList,
  normalizeIntendedEntities,
  areIntendedListsEqual,
  getRecentUserPrompts,
  getNearbyHistoryPrompts,
  getNearbyChatPrompts,
  getPendingNeighborPrompts,
  buildRelatedPromptSuggestions,
  getEntityOptions,
  getEntityOptionsForIntent,
  getEntitiesMatchingTitle,
} from './pendingUtils.js';

const pendingDependencies = {
  deletePendingPrompt: () => {},
  selectPendingPrompt: () => {},
  renderCorrectionForm: () => {},
};

export function configurePending(config = {}) {
  Object.assign(pendingDependencies, config);
}

const INTENT_LABELS = {
  weather: 'Weather tool',
  news: 'News tool',
  todo_list: 'Todo tool',
  kitchen_tips: 'Kitchen tips tool',
  calendar_edit: 'Calendar tool',
  app_guide: 'Notes tool',
  nlu_fallback: 'LLM fallback',
};

function formatIntentLabel(intent) {
  return INTENT_LABELS[intent] || intent || 'nlu_fallback';
}

function normalizeActionName(intent, action) {
  if (!intent) return null;
  if (!action) {
    const defaults = DEFAULT_INTENT_ACTIONS[intent] || [];
    return defaults.length ? defaults[0] : null;
  }
  const normalized = action.toLowerCase();
  const alias = ACTION_ALIASES[intent]?.[normalized];
  if (alias) {
    return alias;
  }
  if (DEFAULT_INTENT_ACTIONS[intent]?.includes(normalized)) {
    return normalized;
  }
  return null;
}

function supportsIntendedEntities(intent, action) {
  if (!intent) return false;
  const normalizedAction = normalizeActionName(intent, action);
  if (!normalizedAction) return false;
  return INTENDED_ENTITY_TOOLS.has(intent) && INTENDED_ENTITY_ACTIONS.has(normalizedAction);
}

function addRelatedPrompt(promptText) {
  if (!state.selectedPrompt) return;
  const text = (promptText || '').trim();
  if (!text) return;
  const prompts = state.selectedPrompt.related_prompts || [];
  if (prompts.includes(text)) return;
  prompts.push(text);
  state.selectedPrompt.related_prompts = prompts;
  renderRelatedPrompts();
}

function removeRelatedPrompt(index) {
  if (!state.selectedPrompt) return;
  const prompts = state.selectedPrompt.related_prompts || [];
  if (index < 0 || index >= prompts.length) return;
  prompts.splice(index, 1);
  state.selectedPrompt.related_prompts = prompts;
  renderRelatedPrompts();
}

// WHAT: refresh the intended-entities chips below the editor whenever state changes.
// WHY: reviewers need a visible list of entities already selected to avoid duplicates.
// HOW: rebuild the list from `state.intendedEntities`, show/hide the row, and hook remove buttons to the existing helper.
function renderIntendedEntities() {
  if (!el.intendedEntitiesRow || !el.intendedEntitiesList) return;
  const entries = Array.isArray(state.intendedEntities) ? state.intendedEntities : [];
  if (!entries.length) {
    el.intendedEntitiesList.innerHTML = '';
    el.intendedEntitiesRow.classList.add('hidden');
    return;
  }
  el.intendedEntitiesRow.classList.remove('hidden');
  el.intendedEntitiesList.innerHTML = '';
  entries.forEach((entity, index) => {
    const li = document.createElement('li');
    const title = (entity?.title || entity?.id || 'Untitled').toString();
    const label = document.createElement('span');
    label.textContent = title;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeIntendedEntity(index);
    });
    li.appendChild(label);
    li.appendChild(removeBtn);
    el.intendedEntitiesList.appendChild(li);
  });
}

function addIntendedEntity(entity) {
  if (!entity || !entity.title) return;
  state.intendedEntities = state.intendedEntities || [];
  if (state.intendedEntities.find((entry) => entry.id === entity.id && entry.title === entity.title)) {
    return;
  }
  state.intendedEntities.push(entity);
  if (state.selectedPrompt) {
    state.selectedPrompt.intended_entities = [...state.intendedEntities];
  }
  renderIntendedEntities();
}

function removeIntendedEntity(index) {
  if (!state.intendedEntities) return;
  if (index < 0 || index >= state.intendedEntities.length) return;
  state.intendedEntities.splice(index, 1);
  if (state.selectedPrompt) {
    state.selectedPrompt.intended_entities = [...state.intendedEntities];
  }
  renderIntendedEntities();
}

function hideEntityOptions() {
  if (el.entitySearchOptions) {
    el.entitySearchOptions.classList.add('hidden');
    el.entitySearchOptions.innerHTML = '';
  }
}

function hideRelatedPromptOptions() {
  if (el.relatedPromptsOptions) {
    el.relatedPromptsOptions.classList.add('hidden');
    el.relatedPromptsOptions.innerHTML = '';
  }
}

function renderPendingMeta() {
  if (el.pendingCountInline) {
    const total = state.stats.pending?.total ?? state.pending.length;
    el.pendingCountInline.textContent = total;
  }
  if (el.pendingPageLabel) {
    el.pendingPageLabel.textContent = String(state.pendingPage);
  }
  if (el.pendingPrev) {
    el.pendingPrev.disabled = state.pendingPage <= 1;
  }
  if (el.pendingNext) {
    el.pendingNext.disabled = !state.pendingHasMore;
  }
}

function renderRelatedPrompts() {
  if (!el.relatedPromptsList) return;
  el.relatedPromptsList.innerHTML = '';
  if (!state.selectedPrompt) {
    if (el.relatedPromptsInput) {
      el.relatedPromptsInput.value = '';
      el.relatedPromptsInput.disabled = true;
    }
    hideRelatedPromptOptions();
    renderIntendedEntities();
    return;
  }
  if (el.relatedPromptsInput) {
    el.relatedPromptsInput.disabled = false;
  }
  const prompts = normalizeRelatedPromptsList(state.selectedPrompt);
  state.selectedPrompt.related_prompts = prompts;
  prompts.forEach((prompt, index) => {
    const li = document.createElement('li');
    li.textContent = prompt;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'prompt-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      removeRelatedPrompt(index);
    });
    li.appendChild(removeBtn);
    el.relatedPromptsList.appendChild(li);
  });
  if (el.relatedPromptsInput && document.activeElement === el.relatedPromptsInput) {
    updateRelatedPromptOptions();
  } else {
    hideRelatedPromptOptions();
  }
  renderIntendedEntities();
}

function updateEntityOptions(filterValue = '') {
  if (!el.entitySearchOptions || !el.entitySearchInput) return;
  hideRelatedPromptOptions();
  const intent = el.intentSelect?.value || state.selectedPrompt?.intent || '';
  const actionValue = normalizeActionName(intent, el.actionSelect?.value || '');
  if (!supportsIntendedEntities(intent, actionValue)) {
    hideEntityOptions();
    return;
  }
  const candidates = getEntityOptionsForIntent(intent);
  if (!candidates.length) {
    hideEntityOptions();
    return;
  }
  const duplicateCounts = new Map();
  candidates.forEach((candidate) => {
    const labelKey = candidate.title.toLowerCase();
    duplicateCounts.set(labelKey, (duplicateCounts.get(labelKey) || 0) + 1);
  });
  const existing = new Set((state.intendedEntities || []).map((entry) => entry.id || entry.title));
  const filter = (filterValue || el.entitySearchInput.value || '').trim().toLowerCase();
  const filtered = candidates.filter((candidate) => {
    if (existing.has(candidate.id || candidate.title)) {
      return false;
    }
    if (!filter) {
      return true;
    }
    return candidate.title.toLowerCase().includes(filter);
  });
  if (!filtered.length) {
    hideEntityOptions();
    return;
  }
  el.entitySearchOptions.innerHTML = '';
  filtered.slice(0, 15).forEach((candidate) => {
    const li = document.createElement('li');
    const labelKey = candidate.title.toLowerCase();
    const needsId = (duplicateCounts.get(labelKey) || 0) > 1 && candidate.id;
    li.textContent = needsId ? `${candidate.title} (#${candidate.id})` : candidate.title;
    li.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      addIntendedEntity(candidate);
      if (el.entitySearchInput) {
        el.entitySearchInput.value = '';
      }
      hideEntityOptions();
    });
    el.entitySearchOptions.appendChild(li);
  });
  el.entitySearchOptions.classList.remove('hidden');
}

function updateRelatedPromptOptions(filterValue = '') {
  if (!el.relatedPromptsOptions || !el.relatedPromptsInput) return;
  hideEntityOptions();
  if (!state.selectedPrompt) {
    hideRelatedPromptOptions();
    return;
  }
  const suggestions = buildRelatedPromptSuggestions(5, 5);
  const filter = (filterValue || el.relatedPromptsInput.value || '').trim().toLowerCase();
  const filtered = suggestions.filter((prompt) => {
    if (!filter) {
      return true;
    }
    return prompt.toLowerCase().includes(filter);
  });
  if (!filtered.length) {
    hideRelatedPromptOptions();
    return;
  }
  el.relatedPromptsOptions.innerHTML = '';
  filtered.slice(0, 10).forEach((prompt) => {
    const li = document.createElement('li');
    li.textContent = prompt;
    li.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      addRelatedPrompt(prompt);
      if (el.relatedPromptsInput) {
        el.relatedPromptsInput.value = '';
      }
      hideRelatedPromptOptions();
    });
    el.relatedPromptsOptions.appendChild(li);
  });
  el.relatedPromptsOptions.classList.remove('hidden');
}

function detachEditorPanel() {
  if (!el.editorPanel) {
    return;
  }
  if (el.editorPanel.parentElement) {
    el.editorPanel.parentElement.removeChild(el.editorPanel);
  }
  el.editorPanel.classList.add('hidden');
}

function attachEditorPanel(slot) {
  if (!el.editorPanel || !slot) return;
  slot.appendChild(el.editorPanel);
  el.editorPanel.classList.remove('hidden');
}

function renderPendingList() {
  if (!el.pendingList) return;
  const previousScroll = el.pendingList.scrollTop || 0;
  el.pendingList.innerHTML = '';
  detachEditorPanel();
  state.pending.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'pending-item';
    const header = document.createElement('div');
    header.className = 'pending-item-header';
    const heading = document.createElement('h4');
    heading.textContent = item.user_text || '—';
    const actionRow = document.createElement('div');
    actionRow.className = 'pending-item-actions';
    const infoPills = document.createElement('div');
    infoPills.className = 'info-pills';
    const intentLabel = formatIntentLabel(item.intent);
    const intentPill = document.createElement('span');
    intentPill.textContent = intentLabel;
    infoPills.appendChild(intentPill);
    if (item.reason) {
      const reasonPill = document.createElement('span');
      reasonPill.textContent = item.reason;
      infoPills.appendChild(reasonPill);
    }
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'button ghost';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      pendingDependencies.deletePendingPrompt(item);
    });
    actionRow.appendChild(infoPills);
    actionRow.appendChild(deleteBtn);
    header.appendChild(heading);
    header.appendChild(actionRow);
    const payload = document.createElement('p');
    payload.className = 'meta';
    const predicted = item.predicted_payload || item.parser_payload || {};
    const preview = Object.entries(predicted)
      .filter(([key]) => key !== 'intent' && key !== 'action')
      .slice(0, 3)
      .map(([key, value]) => `${key}=${formatPreviewValue(value)}`)
      .join(', ');
    payload.textContent = preview || 'No parser payload';
    const slot = document.createElement('div');
    slot.className = 'pending-editor-slot';
    slot.dataset.promptId = item.prompt_id;
    li.appendChild(header);
    const metadataText = buildPendingMetadata(item);
    if (metadataText) {
      const metadata = document.createElement('p');
      metadata.className = 'meta meta-secondary';
      metadata.textContent = metadataText;
      li.appendChild(metadata);
    }
    li.appendChild(payload);
    li.appendChild(slot);
    if (item.prompt_id === state.selectedPromptId) {
      li.classList.add('editing');
      attachEditorPanel(slot);
      pendingDependencies.renderCorrectionForm();
    }
    li.addEventListener('click', (event) => {
      if (el.editorPanel && el.editorPanel.contains(event.target)) {
        return;
      }
      if (state.selectedPromptId === item.prompt_id) {
        return;
      }
      pendingDependencies.selectPendingPrompt(item);
    });
    el.pendingList.appendChild(li);
  });
  renderPendingMeta();
  el.pendingList.scrollTop = previousScroll;
}

function addPendingRecord(record) {
  if (!record || !record.prompt_id) {
    return;
  }
  const normalized = normalizePendingRecord(record);
  const exists = state.pending.findIndex((item) => item.prompt_id === record.prompt_id);
  if (exists >= 0) {
    state.pending[exists] = normalized;
  } else {
    state.pending.unshift(normalized);
  }
  state.pending = sortPendingByRecency(state.pending);
  if (state.selectedPrompt?.prompt_id === normalized.prompt_id) {
    const preservedIntended = (state.intendedEntities || []).map((entry) => ({ ...entry }));
    const normalizedIntended = normalizeIntendedEntities(normalized);
    const preserveIntended = !areIntendedListsEqual(preservedIntended, normalizedIntended);
    const preservedPrompts = [...(state.selectedPrompt.related_prompts || [])];
    const normalizedPrompts = normalizeRelatedPromptsList(normalized);
    const preserveRelated = !arePromptListsEqual(preservedPrompts, normalizedPrompts);
    state.selectedPrompt = { ...normalized, predicted_payload_raw: state.selectedPrompt.predicted_payload_raw };
    state.selectedPrompt.related_prompts = preserveRelated ? preservedPrompts : normalizedPrompts;
    state.selectedPrompt.intended_entities = preserveIntended ? preservedIntended : normalizedIntended;
    state.intendedEntities = preserveIntended ? preservedIntended : normalizedIntended;
    pendingDependencies.renderCorrectionForm();
  }
  renderPendingList();
}

export {
  renderPendingList,
  renderPendingMeta,
  renderRelatedPrompts,
  updateRelatedPromptOptions,
  hideEntityOptions,
  hideRelatedPromptOptions,
  renderIntendedEntities,
  updateEntityOptions,
  addRelatedPrompt,
  removeRelatedPrompt,
  addIntendedEntity,
  removeIntendedEntity,
  addPendingRecord,
  supportsIntendedEntities,
};
