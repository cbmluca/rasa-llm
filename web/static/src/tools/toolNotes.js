// WHAT: Notes-specific rendering helpers sit in this module so the guide tool stays self-contained.
// WHY: Keeping the mutating DOM logic next to `renderNotes` avoids scattering guide logic across global files.
import { state, el, formatNotesSectionHeading } from '../helpers/shared.js';

const dependencies = {
  mutateStore: () => Promise.resolve(false),
};

// WHAT: Allow callers to inject the shared mutateStore helper so notes actions can trigger backend mutations.
// WHY: Keep notes render/mutation helpers isolated from dataStores wiring so the module remains cohesive.
// HOW: Merge provided dependencies with the internal defaults; consumers call this during bootstrap.
export function configureNotesTool(config = {}) {
  Object.assign(dependencies, config);
}

// WHAT: Render each notes section with CRUD affordances.
// WHY: Notes is a mutable data store that needs inline delete/overwrite actions and keyword chips.
// HOW: Build the DOM from `state.dataStores.app_guide`, wire delete handlers via `mutateStore`, and refresh section options afterward.
export function renderNotes() {
  if (!el.guideList) return;
  el.guideList.innerHTML = '';
  const entries = state.dataStores.app_guide || [];
  entries.forEach((entry) => {
    const wrapper = document.createElement('li');
    wrapper.className = 'notes-section';
    const canMutateSection = Boolean(entry.id);
    const header = document.createElement('div');
    header.className = 'notes-section-header';
    const titleGroup = document.createElement('div');
    titleGroup.className = 'notes-section-title-group';
    const heading = formatNotesSectionHeading(entry);
    const title = document.createElement('strong');
    title.textContent = heading.title;
    titleGroup.appendChild(title);
    if (heading.slug) {
      const slugBadge = document.createElement('span');
      slugBadge.className = 'notes-section-slug';
      slugBadge.textContent = heading.slug;
      titleGroup.appendChild(slugBadge);
    }
    header.appendChild(titleGroup);
    const deleteSection = document.createElement('button');
    deleteSection.type = 'button';
    deleteSection.className = 'button ghost notes-delete-section';
    deleteSection.textContent = 'Delete Section';
    deleteSection.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!entry.id) return;
      deleteSection.disabled = true;
      try {
        await dependencies.mutateStore('app_guide', {
          action: 'delete',
          id: entry.id,
        });
      } finally {
        deleteSection.disabled = false;
      }
    });
    header.appendChild(deleteSection);
    wrapper.appendChild(header);
    if (entry.content) {
      const paragraphs = entry.content.split(/\n{2,}/).filter(Boolean);
      paragraphs.forEach((para, paraIndex) => {
        const row = document.createElement('div');
        row.className = 'notes-entry-row';
        if (canMutateSection) {
          const deleteEntry = document.createElement('button');
          deleteEntry.type = 'button';
          deleteEntry.className = 'notes-entry-delete';
          deleteEntry.setAttribute('aria-label', 'Delete entry');
          deleteEntry.textContent = '×';
          deleteEntry.addEventListener('click', async (event) => {
            event.stopPropagation();
            deleteEntry.disabled = true;
            try {
              const chunks = (entry.content || '').split(/\n{2,}/).filter(Boolean);
              if (paraIndex >= 0 && paraIndex < chunks.length) {
                chunks.splice(paraIndex, 1);
                await dependencies.mutateStore('app_guide', {
                  action: 'overwrite',
                  id: entry.id,
                  title: entry.title,
                  content: chunks.join('\n\n'),
                  keywords: entry.keywords,
                  link: entry.link,
                });
              }
            } finally {
              deleteEntry.disabled = false;
            }
          });
          row.appendChild(deleteEntry);
        }
        const body = document.createElement('p');
        body.textContent = para;
        row.appendChild(body);
        wrapper.appendChild(row);
      });
    }
    if (Array.isArray(entry.keywords) && entry.keywords.length) {
      const keywords = document.createElement('div');
      keywords.className = 'notes-keywords';
      const keywordsLabel = document.createElement('span');
      keywordsLabel.className = 'notes-keywords-label';
      keywordsLabel.textContent = 'Keywords';
      keywords.appendChild(keywordsLabel);
      const keywordsList = document.createElement('div');
      keywordsList.className = 'notes-keywords-list';
      entry.keywords.forEach((keyword, keywordIndex) => {
        const chip = document.createElement('span');
        chip.className = 'notes-keyword-chip';
        const text = document.createElement('span');
        text.textContent = keyword;
        chip.appendChild(text);
        if (canMutateSection) {
          const removeKeyword = document.createElement('button');
          removeKeyword.type = 'button';
          removeKeyword.className = 'notes-keyword-remove';
          removeKeyword.setAttribute('aria-label', `Remove keyword ${keyword}`);
          removeKeyword.textContent = '×';
          removeKeyword.addEventListener('click', async (event) => {
            event.stopPropagation();
            removeKeyword.disabled = true;
            try {
              const updatedKeywords = [...(entry.keywords || [])];
              if (keywordIndex >= 0 && keywordIndex < updatedKeywords.length) {
                updatedKeywords.splice(keywordIndex, 1);
                await dependencies.mutateStore('app_guide', {
                  action: 'overwrite',
                  id: entry.id,
                  title: entry.title,
                  content: entry.content,
                  keywords: updatedKeywords.length ? updatedKeywords : [],
                  link: entry.link,
                });
              }
            } finally {
              removeKeyword.disabled = false;
            }
          });
          chip.appendChild(removeKeyword);
        }
        keywordsList.appendChild(chip);
      });
      keywords.appendChild(keywordsList);
      if (keywordsList.children.length > 0) {
        wrapper.appendChild(keywords);
      }
    }
    if (entry.link) {
      const link = document.createElement('a');
      link.href = entry.link;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'Open link';
      wrapper.appendChild(link);
    }
    el.guideList.appendChild(wrapper);
  });
  updateNotesSectionOptions();
}

// WHAT: Refresh notes-specific UI such as the section suggestions combobox.
// WHY: Section dropdowns should mirror the latest notes store entries after mutations.
// HOW: Trigger the combobox refresh helper when the guide list changes.
export function updateNotesSectionOptions() {
  el.guideSectionCombobox?.refreshOptions();
}
