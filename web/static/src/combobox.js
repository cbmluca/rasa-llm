import { configureFieldHelpers } from './pending/pendingFieldHelpers.js';

const COMBOBOX_DEFAULT_LIMIT = 8;
let comboboxIdCounter = 0;

// WHAT: reusable combobox widget that mixes text input with dropdown suggestions.
// WHY: several Tier-5 fields (Notes sections, future title lookups, IDs) need both free-form input and scoped suggestions.
// HOW: accept a config-driven data source, render a popover with filtered options, and expose refresh hooks so other modules can share the component.
export function createCombobox(config = {}) {
  const {
    placeholder = '',
    name,
    required = false,
    getOptions = () => [],
    filterOption,
    allowCreate = false,
    createLabel = (value) => `Create "${value}"`,
    maxOptions = COMBOBOX_DEFAULT_LIMIT,
    onChange,
    initialValue = '',
    toggleLabel = 'Toggle suggestions',
  } = config;
  const wrapper = document.createElement('div');
  wrapper.className = 'notes-combobox';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'notes-combobox-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = placeholder;
  if (name) {
    input.name = name;
  }
  if (required) {
    input.required = true;
  }
  wrapper.appendChild(input);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'notes-combobox-toggle';
  toggle.setAttribute('aria-label', toggleLabel);
  toggle.tabIndex = -1;
  wrapper.appendChild(toggle);
  const dropdown = document.createElement('div');
  dropdown.className = 'notes-combobox-dropdown hidden';
  dropdown.setAttribute('role', 'listbox');
  const list = document.createElement('ul');
  dropdown.appendChild(list);
  wrapper.appendChild(dropdown);
  const dropdownId = `combobox-${comboboxIdCounter++}`;
  dropdown.id = dropdownId;
  input.setAttribute('aria-haspopup', 'listbox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', dropdownId);

  const instance = {
    wrapper,
    input,
    toggle,
    dropdown,
    list,
    onChange: typeof onChange === 'function' ? onChange : null,
    isOpen: false,
    highlightIndex: -1,
    options: [],
    blurTimeout: null,
    optionSource: [],
  };

  function notifyChange(value) {
    if (instance.onChange) {
      instance.onChange(value);
    }
  }

  function setInputValue(value, options = {}) {
    const text = value || '';
    const silent = Boolean(options.silent);
    if (input.value === text) {
      if (!silent) {
        notifyChange(text);
      }
      return;
    }
    input.value = text;
    if (!silent) {
      notifyChange(text);
    }
  }

  function selectOption(option) {
    if (!option || option.type === 'empty') return;
    setInputValue(option.value);
    closeDropdown();
    input.focus();
  }

  function getSelectableIndex(startIndex = 0, step = 1) {
    if (!instance.options.length) return -1;
    const length = instance.options.length;
    let index = startIndex;
    for (let attempts = 0; attempts < length; attempts += 1) {
      if (instance.options[index] && instance.options[index].type !== 'empty') {
        return index;
      }
      index = (index + step + length) % length;
    }
    return -1;
  }

  function normalizeOptions(rawOptions = []) {
    return rawOptions
      .map((entry) => {
        if (typeof entry === 'string') {
          const text = entry.trim();
          return text ? { value: text, label: text } : null;
        }
        if (entry && typeof entry === 'object') {
          const value = (entry.value || entry.label || '').toString().trim();
          if (!value) {
            return null;
          }
          return { value, label: entry.label ? String(entry.label) : value };
        }
        return null;
      })
      .filter(Boolean);
  }

  function defaultFilter(option, query) {
    if (!query) return true;
    const text = option.label || option.value || '';
    return text.toLowerCase().includes(query.toLowerCase());
  }

  function renderOptions(queryText = '') {
    const source = normalizeOptions(getOptions());
    instance.optionSource = source;
    const normalized = queryText.trim().toLowerCase();
    let matches = source;
    const filterFn = typeof filterOption === 'function' ? filterOption : defaultFilter;
    if (normalized) {
      matches = source.filter((option) => filterFn(option, queryText));
    }
    matches = matches.slice(0, Math.max(1, maxOptions));
    const options = matches.map((option) => ({
      type: 'option',
      label: option.label,
      value: option.value,
    }));
    if (
      allowCreate &&
      normalized &&
      !source.some((option) => option.value.toLowerCase() === normalized)
    ) {
      const trimmedValue = queryText.trim();
      options.push({
        type: 'create',
        label: createLabel(trimmedValue),
        value: trimmedValue,
      });
    }
    if (!options.length) {
      options.push({
        type: 'empty',
        label: 'No sections yet',
        value: '',
      });
    }
    instance.options = options;
    list.innerHTML = '';
    options.forEach((option, index) => {
      const item = document.createElement('li');
      item.className = 'notes-combobox-option';
      item.setAttribute('role', 'option');
      if (option.type === 'create') {
        item.classList.add('notes-combobox-option--create');
      }
      if (option.type === 'empty') {
        item.classList.add('notes-combobox-option--empty');
        item.setAttribute('aria-disabled', 'true');
      }
      if (index === instance.highlightIndex) {
        item.classList.add('active');
      }
      item.textContent = option.label;
      if (option.type !== 'empty') {
        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
          selectOption(option);
        });
      }
      list.appendChild(item);
    });
    if (
      instance.highlightIndex === -1 ||
      !instance.options[instance.highlightIndex] ||
      instance.options[instance.highlightIndex].type === 'empty'
    ) {
      instance.highlightIndex = getSelectableIndex(0, 1);
    }
    Array.from(list.children).forEach((item, idx) => {
      item.classList.toggle('active', idx === instance.highlightIndex);
    });
  }

  function openDropdown() {
    if (instance.isOpen) {
      renderOptions(input.value);
      return;
    }
    instance.isOpen = true;
    instance.dropdown.classList.remove('hidden');
    wrapper.classList.add('notes-combobox--open');
    input.setAttribute('aria-expanded', 'true');
    renderOptions(input.value);
  }

  function closeDropdown() {
    if (!instance.isOpen) return;
    instance.isOpen = false;
    wrapper.classList.remove('notes-combobox--open');
    dropdown.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    instance.highlightIndex = -1;
  }

  function cancelPendingClose() {
    if (instance.blurTimeout) {
      clearTimeout(instance.blurTimeout);
      instance.blurTimeout = null;
    }
  }

  function scheduleClose() {
    cancelPendingClose();
    instance.blurTimeout = setTimeout(() => {
      closeDropdown();
    }, 120);
  }

  function moveHighlight(step) {
    if (!instance.isOpen || !instance.options.length) return;
    const length = instance.options.length;
    if (length === 1 && instance.options[0].type === 'empty') {
      instance.highlightIndex = -1;
      return;
    }
    if (instance.highlightIndex === -1) {
      instance.highlightIndex = getSelectableIndex(step > 0 ? 0 : length - 1, step);
    } else {
      let nextIndex = instance.highlightIndex;
      for (let attempts = 0; attempts < length; attempts += 1) {
        nextIndex = (nextIndex + step + length) % length;
        if (instance.options[nextIndex] && instance.options[nextIndex].type !== 'empty') {
          instance.highlightIndex = nextIndex;
          break;
        }
      }
    }
    Array.from(list.children).forEach((item, idx) => {
      item.classList.toggle('active', idx === instance.highlightIndex);
    });
  }

  input.addEventListener('focus', () => {
    cancelPendingClose();
    openDropdown();
  });
  input.addEventListener('blur', () => {
    scheduleClose();
  });
  dropdown.addEventListener('mousedown', (event) => {
    event.preventDefault();
    cancelPendingClose();
  });
  toggle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    cancelPendingClose();
  });
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    if (instance.isOpen) {
      closeDropdown();
    } else {
      openDropdown();
      input.focus();
    }
  });
  input.addEventListener('input', () => {
    notifyChange(input.value);
    openDropdown();
    renderOptions(input.value);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openDropdown();
      moveHighlight(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openDropdown();
      moveHighlight(-1);
    } else if (event.key === 'Enter') {
      if (instance.isOpen && instance.highlightIndex !== -1) {
        const option = instance.options[instance.highlightIndex];
        if (option && option.type !== 'empty') {
          event.preventDefault();
          selectOption(option);
        }
      }
    } else if (event.key === 'Escape') {
      if (instance.isOpen) {
        event.preventDefault();
        closeDropdown();
      }
    }
  });

  if (initialValue) {
    setInputValue(initialValue, { silent: true });
  }

  const api = {
    element: wrapper,
    input,
    refreshOptions: () => {
      if (instance.isOpen) {
        renderOptions(input.value);
      }
    },
    setValue: (value, options = {}) => setInputValue(value, options),
    getValue: () => input.value,
    focus: () => input.focus(),
    close: () => closeDropdown(),
  };

  return api;
}

configureFieldHelpers({ createCombobox });
