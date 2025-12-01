import { state } from './shared.js';

let dependencies = {
  onAuthFailure: null,
};

export function configureApi(config = {}) {
  dependencies = {
    ...dependencies,
    ...config,
  };
}

export function buildReviewerHeaders(base = {}) {
  const headers = { ...(base || {}) };
  const reviewerId = state.user?.username;
  if (reviewerId && !headers['X-Reviewer-ID']) {
    headers['X-Reviewer-ID'] = reviewerId;
  }
  return headers;
}

export async function fetchJSON(url, options = {}) {
  const headers = buildReviewerHeaders({
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  });
  const response = await fetch(url, {
    headers,
    credentials: 'include',
    ...options,
  });
  if (response.ok) {
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  let detail = response.statusText;
  try {
    const payload = await response.json();
    detail =
      payload?.detail?.message ||
      payload?.detail ||
      payload?.message ||
      payload?.error ||
      (typeof payload === 'string' ? payload : JSON.stringify(payload));
  } catch (err) {
    // ignore parse errors
  }
  if (response.status === 401) {
    dependencies.onAuthFailure?.(detail || 'Authentication required.');
  }
  throw new Error(detail || 'Request failed');
}
