import {
  el,
  state,
  STORAGE_KEYS,
  VOICE_MIN_DURATION_MS,
  VOICE_MAX_DURATION_MS,
  VOICE_MIME_TYPES,
} from './shared.js';
import { setChatStatus, setVoiceStatus, showToast } from './utils.js';
import { appendAssistantReply, persistChatHistory, renderChat } from './chat.js';

let deps = {};

export function configureVoice(dependencies = {}) {
  deps = dependencies;
}

export function updateVoiceButtonState() {
  if (!el.chatVoiceButton) return;
  if (!state.voice.supported) {
    el.chatVoiceButton.classList.add('hidden');
    return;
  }
  el.chatVoiceButton.classList.remove('hidden');
  el.chatVoiceButton.disabled = Boolean(state.voice.uploading || state.voice.mediaError);
  el.chatVoiceButton.textContent = state.voice.recording ? 'Stop' : 'Voice';
  el.chatVoiceButton.dataset.state = state.voice.recording ? 'recording' : 'idle';
}

export function recordOfflineVoiceAttempt(meta = {}) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      ...meta,
    };
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.VOICE_OFFLINE_LOG) || '[]');
    existing.push(entry);
    const trimmed = existing.slice(-20);
    localStorage.setItem(STORAGE_KEYS.VOICE_OFFLINE_LOG, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('Failed to record offline voice attempt', err);
  }
}

export function detectVoiceSupport() {
  const supported =
    Boolean(navigator?.mediaDevices?.getUserMedia) &&
    typeof window !== 'undefined' &&
    'MediaRecorder' in window;
  state.voice.supported = supported;
  state.voice.mediaError = null;
  if (!supported) {
    setVoiceStatus('Voice capture needs Chrome on desktop or iPhone.', 'warning');
  } else {
    setVoiceStatus('Mic ready (Chrome desktop + iPhone).', 'info');
  }
  updateVoiceButtonState();
}

function pickVoiceMimeType() {
  if (!window.MediaRecorder || typeof window.MediaRecorder.isTypeSupported !== 'function') {
    return 'audio/webm';
  }
  for (const type of VOICE_MIME_TYPES) {
    if (window.MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'audio/webm';
}

function handleMediaError(err) {
  console.error('Voice recording error', err);
  state.voice.mediaError = err?.message || 'Microphone unavailable. Use text input.';
  state.voice.recording = false;
  if (state.voice.mediaRecorder) {
    try {
      if (state.voice.mediaRecorder.state !== 'inactive') {
        state.voice.mediaRecorder.stop();
      }
    } catch (stopErr) {
      console.warn('Failed to stop recorder', stopErr);
    }
  }
  if (state.voice.stopTimer) {
    clearTimeout(state.voice.stopTimer);
    state.voice.stopTimer = null;
  }
  updateVoiceButtonState();
  setVoiceStatus('Mic unavailable — falling back to text input.', 'error');
}

const stopVoiceRecording = () => {
  if (state.voice.mediaRecorder && state.voice.mediaRecorder.state !== 'inactive') {
    state.voice.mediaRecorder.stop();
  }
};

export async function startVoiceRecording() {
  if (state.voice.recording || state.voice.uploading || state.voice.mediaError) {
    return;
  }
  if (!state.voice.supported) {
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickVoiceMimeType();
    const options = mimeType ? { mimeType } : undefined;
    const recorder = new MediaRecorder(stream, options);
    state.voice.mediaRecorder = recorder;
    state.voice.mimeType = mimeType || recorder.mimeType || 'audio/webm';
    state.voice.chunks = [];
    state.voice.recording = true;
    state.voice.startedAt = Date.now();
    updateVoiceButtonState();
    setVoiceStatus('Recording… tap Stop by 15s.', 'info');
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        state.voice.chunks.push(event.data);
      }
    };
    recorder.onerror = (event) => {
      handleMediaError(event.error || new Error('Recorder error'));
    };
    recorder.onstop = () => {
      if (state.voice.stopTimer) {
        clearTimeout(state.voice.stopTimer);
        state.voice.stopTimer = null;
      }
      const chunks = [...state.voice.chunks];
      state.voice.chunks = [];
      state.voice.recording = false;
      state.voice.mediaRecorder = null;
      try {
        stream.getTracks().forEach((track) => track.stop());
      } catch (cleanupErr) {
        console.warn('Failed to stop tracks', cleanupErr);
      }
      updateVoiceButtonState();
      if (!chunks.length) {
        setVoiceStatus('Recording failed — try again.', 'error');
        return;
      }
      const blob = new Blob(chunks, { type: state.voice.mimeType || 'audio/webm' });
      const duration = Date.now() - (state.voice.startedAt || Date.now());
      if (duration < VOICE_MIN_DURATION_MS) {
        showToast('Voice clips under 5 seconds may not transcribe accurately.', 'warning');
      }
      uploadVoiceClip(blob);
    };
    recorder.start();
    state.voice.stopTimer = window.setTimeout(() => {
      stopVoiceRecording();
    }, VOICE_MAX_DURATION_MS);
  } catch (err) {
    handleMediaError(err);
  }
}

export function stopRecording() {
  stopVoiceRecording();
}

async function uploadVoiceClip(blob) {
  if (!blob || !blob.size) {
    setVoiceStatus('Recording failed — empty audio.', 'error');
    return;
  }
  const extension = blob.type.includes('mpeg') ? 'mp3' : 'webm';
  const formData = new FormData();
  formData.append('audio', blob, `clip-${Date.now()}.${extension}`);
  const headers = (deps.buildReviewerHeaders || (() => ({})))();
  state.voice.uploading = true;
  setVoiceStatus('Transcribing…', 'info');
  setChatStatus('Transcribing…');
  updateVoiceButtonState();
  try {
    const response = await fetch('/api/speech', {
      method: 'POST',
      body: formData,
      headers,
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (parseErr) {
        console.warn('Failed to parse /api/speech response', parseErr);
      }
    }
    if (!response.ok) {
      throw new Error(payload?.detail || payload?.error || 'Voice upload failed');
    }
    if ((payload?.transcription_status || '').toLowerCase() !== 'completed') {
      const errorMessage = payload?.error || 'Transcription failed. Try again when online.';
      showToast(errorMessage, 'error');
      return;
    }
    handleSpeechPayload(payload);
    const loadPending = deps.loadPending;
    const refreshActiveDataTab = deps.refreshActiveDataTab;
    if (loadPending || refreshActiveDataTab) {
      await Promise.all([
        loadPending ? loadPending(true) : Promise.resolve(),
        refreshActiveDataTab ? refreshActiveDataTab() : Promise.resolve(),
      ]);
    }
    showToast('Voice message sent', 'success');
  } catch (err) {
    recordOfflineVoiceAttempt({ reason: 'offline', size: blob.size, mimeType: blob.type });
    state.pendingChatEntry = null;
    const offline = typeof err?.message === 'string' && err.message.toLowerCase().includes('offline');
    if (offline) {
      showToast('Offline voice upload logged. Re-send when back online.', 'warning');
    } else {
      showToast(err?.message || 'Voice upload failed', 'error');
    }
  } finally {
    state.voice.uploading = false;
    if (!state.voice.mediaError) {
      setVoiceStatus('Mic ready (Chrome desktop + iPhone).', 'info');
    }
    setChatStatus('Ready');
    updateVoiceButtonState();
  }
}

export function handleSpeechPayload(payload) {
  if (!payload) return;
  const transcript = (payload.text || '').trim();
  if (transcript) {
    const entry = { role: 'user', text: transcript, entryId: null, via: 'voice' };
    state.chat.push(entry);
    state.pendingChatEntry = entry;
    persistChatHistory();
    renderChat();
  }
  if (payload.chat) {
    appendAssistantReply(payload.chat);
  }
}
