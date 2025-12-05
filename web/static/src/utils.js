import { el, state, DISPLAY_META_FIELDS, FIELD_ORDER } from './helpers/shared.js';

let toastHideTimer = null;
const TOAST_AUTO_HIDE_TYPES = new Set(['info', 'success']);

// WHAT: hide the toast banner and cancel any pending auto-close timer.
// WHY: keeps manual dismissals deterministic and prevents lingering timers from closing new toasts.
// HOW: reapply the `hidden` class, reset the type tag, and clear the stored timer.
export function hideToast() {
  if (!el.toast) return;
  el.toast.classList.add('hidden');
  delete el.toast.dataset.type;
  toastHideTimer = null;
}

// WHAT: display toast notifications with manual dismissal for errors.
// WHY: reviewers need persistent error pop-ups that only disappear when they click the “x,” while other notices remain ephemeral.
// HOW: update the text/type, uncover the banner, and only schedule an auto-hide for non-error types.
export function showToast(message, type = 'info') {
  if (!el.toast) return;
  if (el.toastText) {
    el.toastText.textContent = message;
  } else {
    el.toast.textContent = message;
  }
  el.toast.classList.remove('hidden');
  el.toast.dataset.type = type;
  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
  if (TOAST_AUTO_HIDE_TYPES.has(type)) {
    toastHideTimer = window.setTimeout(hideToast, 3000);
  }
}

// WHAT: update the chat footer with the latest status message.
// WHY: gives operators feedback when the chatbot is running or idle.
// HOW: whenever chat submission or polling starts/ends we update `#chat-status` so the footer mirrors backend activity.
export function setChatStatus(text) {
  if (el.chatStatus) {
    el.chatStatus.textContent = text;
  }
}

// WHAT: surface microphone/Transcriber status messages beneath the voice controls.
// WHY: reviewers need explicit hints when the mic is busy or unavailable.
// HOW: show/hide the status row and annotate the tone so the styles stay consistent.
export function setVoiceStatus(text, tone = 'info') {
  if (!el.voiceStatus) return;
  if (!text) {
    el.voiceStatus.classList.add('hidden');
    el.voiceStatus.removeAttribute('data-tone');
    return;
  }
  el.voiceStatus.classList.remove('hidden');
  el.voiceStatus.textContent = text;
  el.voiceStatus.dataset.tone = tone;
}

// WHAT: stringify parser payload values for short previews.
// WHY: pending cards show only the first few key/value pairs as inline text.
// HOW: before pending cards render inline payload summaries we stringify arrays/objects, trim strings, and fallback to `—` for empty values.
export function formatPreviewValue(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    return '[object]';
  }
  return String(value ?? '');
}

// WHAT: convert ISO timestamps into localized display text.
// WHY: pending/meta sections show human-readable timestamps (Created at ...).
// HOW: convert parser timestamps into `Date` objects, guard invalid values, and format via `toLocaleString` before printing in metadata rows.
export function formatTimestamp(ts) {
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// WHAT: reorder payload keys for display purposes.
// WHY: ensures intent/action/domain appear first when rendering payload JSON.
// HOW: build a shallow copy, emit the meta fields first, then append remaining keys alphabetically so JSON previews in Pending/Training remain readable.
export function orderPayloadForDisplay(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload || {};
  }
  const ordered = {};
  DISPLAY_META_FIELDS.forEach((field) => {
    if (field in payload) {
      ordered[field] = payload[field];
    }
  });
  const orderedKeys = new Set([...DISPLAY_META_FIELDS]);
  const restKeys = Object.keys(payload).filter((key) => !orderedKeys.has(key));
  const keyOrder = [...FIELD_ORDER, ...restKeys.sort()];
  keyOrder.forEach((key) => {
    if (key in payload && !orderedKeys.has(key)) {
      ordered[key] = payload[key];
      orderedKeys.add(key);
    }
  });
  return ordered;
}

// WHAT: format ISO `YYYY-MM-DD` (optionally with time) strings as Danish `DD-MM-YYYY`.
// WHY: reviewers operate in Danish locales and expect day-first ordering everywhere in the UI.
// HOW: detect ISO-like strings, flip the components, preserve HH:MM if present, and fall back to the original text otherwise.
export function formatDanishDateString(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!match) {
    return value;
  }
  const [, year, month, day, time] = match;
  const dateText = `${day}-${month}-${year}`;
  return time ? `${dateText} ${time}` : dateText;
}
