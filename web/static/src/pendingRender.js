import { state, el } from './shared.js';
import {
  normalizeRelatedPromptsList,
  buildPendingMetadata,
  sortPendingByRecency,
  normalizePendingRecord,
} from './pendingUtils.js';
import { formatPreviewValue } from './utils.js';

const pendingDeps = {
  deletePendingPrompt: () => {},
  selectPendingPrompt: () => {},
  renderCorrectionForm: () => {},
};

export function configurePendingRender(deps = {}) {
  Object.assign(pendingDeps, deps);
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

export function renderPendingMeta() {
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

function addRelatedPrompt(prompt) {
  if (!state.selectedPrompt) return;
  const text = (prompt || '').trim();
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

export function renderRelatedPrompts() {
  if (!el.relatedPromptsList) return;
  el.relatedPromptsList.innerHTML = '';
  if (!state.selectedPrompt) {
    if (el.relatedPromptsInput) {
      el.relatedPromptsInput.value = '';
      el.relatedPromptsInput.disabled = true;
    }
    hideRelatedPromptOptions();
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
    renderRelatedPromptSuggestions();
  } else {
    hideRelatedPromptOptions();
  }
}

export function renderRelatedPromptSuggestions() {
  if (!el.relatedPromptsOptions || !el.relatedPromptsInput) return;
  hideEntityOptions();
  if (!state.selectedPrompt) {
    hideRelatedPromptOptions();
    return;
  }
  const suggestions = buildRelatedPromptSuggestions(5, 5);
  const filter = (el.relatedPromptsInput.value || '').trim().toLowerCase();
  const filtered = suggestions.filter((prompt) => (filter ? prompt.toLowerCase().includes(filter) : true));
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
  if (!el.editorPanel) return;
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

export function renderPendingList() {
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
      pendingDeps.deletePendingPrompt(item);
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
      pendingDeps.renderCorrectionForm();
    }
    li.addEventListener('click', (event) => {
      if (el.editorPanel && el.editorPanel.contains(event.target)) {
        return;
      }
      if (state.selectedPromptId === item.prompt_id) {
        return;
      }
      pendingDeps.selectPendingPrompt(item);
    });
    el.pendingList.appendChild(li);
  });
  renderPendingMeta();
  el.pendingList.scrollTop = previousScroll;
}

export function addPendingRecord(record) {
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
    state.selectedPrompt = { ...normalized, predicted_payload_raw: state.selectedPrompt.predicted_payload_raw };
    pendingDeps.renderCorrectionForm();
  }
  renderPendingList();
}
