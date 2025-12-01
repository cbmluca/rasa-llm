import { state } from './shared.js';
import { formatPreviewValue, formatTimestamp } from './utils.js';

function buildPendingMetadata(item) {
  const parts = [];
  const created = formatTimestamp(item.timestamp);
  if (created) {
    parts.push(`Created ${created}`);
  }
  const reviewerId = item.reviewer_id || item.extras?.reviewer_id;
  if (reviewerId) {
    parts.push(`Reviewer ${reviewerId}`);
  }
  if (typeof item.confidence === 'number') {
    parts.push(`Confidence ${item.confidence.toFixed(2)}`);
  }
  const source = item.extras?.invocation_source || item.reason || item.tool_name;
  if (source) {
    parts.push(`Source ${source}`);
  }
  const probe = item.extras?.keyword_probe;
  if (probe?.decision === 'find') {
    parts.push(`Probe matched ${probe.match_count ?? 0} tip(s)`);
  } else if (probe?.decision === 'list') {
    parts.push('Probe: no matches, defaulted to list');
  } else if (probe?.decision === 'answer') {
    parts.push('Probe: answered via LLM (no matches)');
  }
  return parts.join(' • ');
}

function sortPendingByRecency(items) {
  const sorted = (items || []).slice().sort((a, b) => {
    const timeA = new Date(a?.timestamp || 0).getTime();
    const timeB = new Date(b?.timestamp || 0).getTime();
    if (!Number.isFinite(timeA) && !Number.isFinite(timeB)) return 0;
    if (!Number.isFinite(timeA)) return 1;
    if (!Number.isFinite(timeB)) return -1;
    return timeB - timeA;
  });
  const seen = new Set();
  return sorted.filter((item) => {
    const key = item?.prompt_id;
    if (!key) {
      return true;
    }
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeRelatedPromptsList(record) {
  if (!record) return [];
  const prompts = Array.isArray(record.related_prompts) ? record.related_prompts : [];
  const cleaned = prompts
    .map((prompt) => (typeof prompt === 'string' ? prompt.trim() : ''))
    .filter(Boolean);
  const primary = (record.user_text || '').trim();
  const filtered = cleaned.filter((prompt) => prompt !== primary);
  return filtered.slice(-10);
}

function arePromptListsEqual(listA = [], listB = []) {
  if (!Array.isArray(listA) || !Array.isArray(listB)) return false;
  if (listA.length !== listB.length) return false;
  for (let i = 0; i < listA.length; i += 1) {
    if (listA[i] !== listB[i]) {
      return false;
    }
  }
  return true;
}

function normalizeIntendedEntities(record) {
  if (!record) return [];
  const entities = Array.isArray(record.intended_entities) ? record.intended_entities : [];
  return entities
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const id = String(entry.id || entry.value || '').trim();
      const title = String(entry.title || entry.label || '').trim();
      if (!title) return null;
      return { id: id || null, title };
    })
    .filter(Boolean);
}

function areIntendedListsEqual(listA = [], listB = []) {
  if (!Array.isArray(listA) || !Array.isArray(listB)) return false;
  if (listA.length !== listB.length) return false;
  for (let i = 0; i < listA.length; i += 1) {
    const a = listA[i] || {};
    const b = listB[i] || {};
    if ((a.id || null) !== (b.id || null) || (a.title || '') !== (b.title || '')) {
      return false;
    }
  }
  return true;
}

function normalizePendingRecord(record) {
  if (!record || typeof record !== 'object') {
    return record;
  }
  const predicted = record.predicted_payload ? { ...record.predicted_payload } : {};
  if (!predicted.related_prompts) {
    predicted.related_prompts = [];
  }
  if (!predicted.intended_entities) {
    predicted.intended_entities = [];
  }
  return {
    ...record,
    predicted_payload: predicted,
    related_prompts: normalizeRelatedPromptsList(record),
    intended_entities: normalizeIntendedEntities(record),
    field_versions: { ...(record.field_versions || {}) },
  };
}

function flagReviewerChange(field) {
  if (!field) return;
  state.fieldVersions[field] = 'reviewer';
  if (state.selectedPrompt) {
    state.selectedPrompt.field_versions = state.selectedPrompt.field_versions || {};
    state.selectedPrompt.field_versions[field] = 'reviewer';
  }
}

function getRecentUserPrompts(limit = 10) {
  const primary = (state.selectedPrompt?.user_text || '').trim();
  const recent = [];
  const seen = new Set();
  for (let i = state.chat.length - 1; i >= 0 && recent.length < limit; i -= 1) {
    const entry = state.chat[i];
    if (!entry || entry.role !== 'user') {
      continue;
    }
    const text = (entry.text || '').trim();
    if (!text || text === primary || seen.has(text)) {
      continue;
    }
    recent.push(text);
    seen.add(text);
  }
  return recent;
}

function getConversationHistoryEntries(record) {
  if (!record) return [];
  const extrasHistory = record.extras?.conversation_history;
  if (Array.isArray(extrasHistory) && extrasHistory.length) {
    return extrasHistory
      .map((entry) => {
        const text = typeof entry?.user_text === 'string' ? entry.user_text.trim() : '';
        if (!text) return null;
        const entryId = entry?.id || entry?.entry_id || entry?.conversation_entry_id || null;
        return { id: entryId, text };
      })
      .filter(Boolean);
  }
  const fallback = Array.isArray(record.related_prompts) ? record.related_prompts : [];
  return fallback
    .map((text) => ({ id: null, text: (text || '').trim() }))
    .filter((entry) => entry.text);
}

function getNearbyHistoryPrompts(record, beforeCount = 5, afterCount = 5) {
  const entries = getConversationHistoryEntries(record);
  if (!entries.length) return [];
  const entryId = record.conversation_entry_id || record.extras?.conversation_entry_id || null;
  const primaryText = (record.user_text || '').trim();
  let targetIndex = -1;
  if (entryId) {
    targetIndex = entries.findIndex((entry) => entry.id === entryId);
  }
  if (targetIndex === -1 && primaryText) {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (entries[i].text === primaryText) {
        targetIndex = i;
        break;
      }
    }
  }
  if (targetIndex === -1) {
    targetIndex = entries.length - 1;
  }
  const suggestions = [];
  const beforeStart = Math.max(0, targetIndex - beforeCount);
  for (let i = beforeStart; i < targetIndex; i += 1) {
    suggestions.push(entries[i].text);
  }
  const afterEnd = Math.min(entries.length, targetIndex + afterCount + 1);
  for (let i = targetIndex + 1; i < afterEnd; i += 1) {
    suggestions.push(entries[i].text);
  }
  return suggestions;
}

function getChatUserEntries() {
  return state.chat
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => entry.role === 'user' && (entry.text || '').trim());
}

function getNearbyChatPrompts(record, beforeCount = 5, afterCount = 5) {
  if (!record) return [];
  const entries = getChatUserEntries();
  if (!entries.length) return [];
  const entryId = record.conversation_entry_id || record.extras?.conversation_entry_id || null;
  const primaryText = (record.user_text || '').trim();
  let targetIndex = -1;
  if (entryId) {
    targetIndex = entries.findIndex((entry) => entry.entryId === entryId);
  }
  if (targetIndex === -1 && primaryText) {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if ((entries[i].text || '').trim() === primaryText) {
        targetIndex = i;
        break;
      }
    }
  }
  if (targetIndex === -1) {
    return [];
  }
  const suggestions = [];
  const beforeStart = Math.max(0, targetIndex - beforeCount);
  for (let i = beforeStart; i < targetIndex; i += 1) {
    suggestions.push(entries[i].text);
  }
  const afterEnd = Math.min(entries.length, targetIndex + afterCount + 1);
  for (let i = targetIndex + 1; i < afterEnd; i += 1) {
    suggestions.push(entries[i].text);
  }
  return suggestions;
}

function getPendingNeighborPrompts(record, beforeCount = 5, afterCount = 5) {
  if (!record || !Array.isArray(state.pending) || !state.pending.length) return [];
  const index = state.pending.findIndex((item) => item.prompt_id === record.prompt_id);
  if (index === -1) {
    return [];
  }
  const suggestions = [];
  const primary = (record.user_text || '').trim();
  const seen = new Set();
  const beforeStart = Math.max(0, index - beforeCount);
  for (let i = beforeStart; i < index; i += 1) {
    const text = (state.pending[i]?.user_text || '').trim();
    if (!text || text === primary || seen.has(text)) continue;
    seen.add(text);
    suggestions.push(text);
  }
  const afterEnd = Math.min(state.pending.length, index + afterCount + 1);
  for (let i = index + 1; i < afterEnd; i += 1) {
    const text = (state.pending[i]?.user_text || '').trim();
    if (!text || text === primary || seen.has(text)) continue;
    seen.add(text);
    suggestions.push(text);
  }
  return suggestions;
}

// WHAT: combine history/chat/pending neighbors into a deduped suggestion list.
// WHY: reviewers should see relevant prompts even if some metadata sources are missing.
// HOW: merges prompts from conversation history, chat log, and queue neighbors, falling back to latest user prompts so the dropdown always has context-rich suggestions.
export function buildRelatedPromptSuggestions(beforeCount = 5, afterCount = 5) {
  if (!state.selectedPrompt) return [];
  let combined = [
    ...getNearbyHistoryPrompts(state.selectedPrompt, beforeCount, afterCount),
    ...getNearbyChatPrompts(state.selectedPrompt, beforeCount, afterCount),
    ...getPendingNeighborPrompts(state.selectedPrompt, beforeCount, afterCount),
  ];
  if (!combined.length) {
    combined = getRecentUserPrompts(beforeCount + afterCount);
  }
  const existing = new Set((state.selectedPrompt.related_prompts || []).map((prompt) => prompt.trim()));
  const primary = (state.selectedPrompt.user_text || '').trim();
  const seen = new Set();
  const suggestions = [];
  combined.forEach((prompt) => {
    const text = (prompt || '').trim();
    if (!text || text === primary) {
      return;
    }
    if (existing.has(text) || seen.has(text)) {
      return;
    }
    seen.add(text);
    suggestions.push(text);
  });
  return suggestions;
}

export {
  buildPendingMetadata,
  sortPendingByRecency,
  normalizeRelatedPromptsList,
  arePromptListsEqual,
  normalizeIntendedEntities,
  areIntendedListsEqual,
  normalizePendingRecord,
  flagReviewerChange,
  getRecentUserPrompts,
  getConversationHistoryEntries,
  getNearbyHistoryPrompts,
  getChatUserEntries,
  getNearbyChatPrompts,
  getPendingNeighborPrompts,
};
