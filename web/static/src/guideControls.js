import { el, getNoteSectionTitles } from './helpers/shared.js';
import { createCombobox } from './combobox.js';
import { showToast } from './utils.js';
import { buildReviewerHeaders, fetchJSON } from './helpers/api.js';

// WHAT: shared utilities for the Notes guide tab (combobox, form, export/import).
// WHY: guide-specific logic is independent of the global wireEvents flow.
// HOW: provide a single initializer that wires the combobox + listeners so `wireEvents` stays lean.
export function setupGuideControls({ mutateStore, loadCorrected }) {
  if (el.guideSectionField) {
    el.guideSectionField.innerHTML = '';
    const combo = createCombobox({
      name: 'title',
      placeholder: 'Section',
      required: true,
      getOptions: getNoteSectionTitles,
      allowCreate: true,
    });
    el.guideSectionField.appendChild(combo.element);
    el.guideSectionCombobox = combo;
  }

  el.guideForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(el.guideForm);
    const title = (formData.get('title') || '').toString().trim();
    const content = (formData.get('content') || '').toString().trim();
    const keywords = (formData.get('keywords') || '')
      .toString()
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!title) {
      showToast('Section is required.', 'error');
      return;
    }
    if (!content && !keywords.length) {
      showToast('Add content or at least one keyword before saving.', 'error');
      return;
    }
    await mutateStore('app_guide', {
      action: 'create',
      title,
      content,
      keywords,
      link: formData.get('link') || undefined,
    });
    el.guideForm.reset();
    el.guideSectionCombobox?.setValue('', { silent: true });
  });

  el.exportButton?.addEventListener('click', async () => {
    try {
      el.exportButton.disabled = true;
      const result = await fetchJSON('/api/logs/export', { method: 'POST', body: JSON.stringify({ fmt: 'csv' }) });
      const links = result.files || [];
      el.exportLinks.innerHTML = '';
      links.forEach((file) => {
        const a = document.createElement('a');
        a.href = file.path;
        a.textContent = file.path.split('/').pop();
        a.target = '_blank';
        el.exportLinks.appendChild(a);
      });
      showToast('Export ready');
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    } finally {
      el.exportButton.disabled = false;
    }
  });

  el.importForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(el.importForm);
    try {
      const response = await fetch('/api/logs/import', {
        method: 'POST',
        body: formData,
        headers: buildReviewerHeaders(),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail || response.statusText);
      }
      showToast('Import completed');
      el.importForm.reset();
      await loadCorrected();
    } catch (err) {
      showToast(err.message || 'Import failed', 'error');
    }
  });
}
