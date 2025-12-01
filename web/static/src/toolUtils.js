import { CALENDAR_FIELD_LAYOUT, FIELD_LAYOUTS } from './shared.js';

export function fieldHasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return true;
}

export function applyFieldLayout(wrapper, intent, action, key) {
  if (!wrapper) {
    return;
  }
  if (intent === 'calendar_edit') {
    const timelineAllowed = !['delete', 'find'].includes(action || '');
    if (timelineAllowed) {
      const layout = CALENDAR_FIELD_LAYOUT[key];
      if (layout) {
        wrapper.style.gridColumn = layout.column;
        wrapper.style.gridRow = layout.row;
        return;
      }
    }
  }
  const intentLayout = FIELD_LAYOUTS[intent];
  if (!intentLayout) {
    return;
  }
  const actionLayout = intentLayout.actions?.[action];
  const config = actionLayout?.[key] || intentLayout.default?.[key];
  if (config) {
    wrapper.style.gridColumn = config.column;
    wrapper.style.gridRow = config.row;
  }
}

function formatISODate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(date) {
  return date.toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function addDays(date, amount) {
  const clone = new Date(date.getTime());
  clone.setDate(clone.getDate() + amount);
  return clone;
}

export function buildRelativeDateOptions(baseDate) {
  const options = [];
  const labels = [
    { label: 'Today', offset: 0, keyword: 'today' },
    { label: 'Tomorrow', offset: 1, keyword: 'tomorrow' },
    { label: 'Yesterday', offset: -1, keyword: 'yesterday' },
  ];
  labels.forEach((entry) => {
    const target = addDays(baseDate, entry.offset);
    options.push({
      label: entry.label,
      iso: formatISODate(target),
      keyword: entry.keyword,
      display: formatDisplayDate(target),
    });
  });
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  weekdays.forEach((dayName) => {
    const target = addDays(baseDate, (7 + weekdays.indexOf(dayName) - baseDate.getDay()) % 7 || 7);
    options.push({
      label: dayName,
      iso: formatISODate(target),
      keyword: dayName.toLowerCase(),
      display: formatDisplayDate(target),
    });
  });
  return options;
}

export function buildRelativeTimeOptions(baseDate) {
  const baseTime = baseDate.toTimeString().slice(0, 5);
  return [
    { label: 'Now', time: baseTime, keyword: 'now' },
    { label: 'Morning', time: '09:00', keyword: 'morning' },
    { label: 'Midday', time: '12:00', keyword: 'midday' },
    { label: 'Afternoon', time: '15:00', keyword: 'afternoon' },
    { label: 'Evening', time: '19:00', keyword: 'evening' },
    { label: 'Night', time: '22:00', keyword: 'night' },
  ];
}

function stripOptionDisplaySuffix(value) {
  if (!value || typeof value !== 'string') return value;
  return value.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export function parseDateInput(value, baseDate) {
  if (!value) return { iso: '', keyword: '', display: '' };
  const trimmed = stripOptionDisplaySuffix(value).trim();
  const options = buildRelativeDateOptions(baseDate);
  const match = options.find((opt) => opt.label.toLowerCase() === trimmed.toLowerCase());
  if (match) {
    return { iso: match.iso, keyword: match.keyword, display: match.display, label: match.label };
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return { iso: trimmed, keyword: '', display: formatDisplayDate(new Date(trimmed)) };
  }
  const shortMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2}|\d{4}))?$/);
  if (shortMatch) {
    const day = shortMatch[1].padStart(2, '0');
    const month = shortMatch[2].padStart(2, '0');
    const baseYear = baseDate.getFullYear();
    const rawYear = shortMatch[3];
    let yearNumber;
    if (!rawYear) {
      yearNumber = baseYear;
    } else if (rawYear.length === 2) {
      const baseCentury = Math.floor(baseYear / 100) * 100;
      const parsed = Number(rawYear);
      yearNumber = baseCentury + parsed;
      if (yearNumber < baseYear - 50) {
        yearNumber += 100;
      } else if (yearNumber > baseYear + 50) {
        yearNumber -= 100;
      }
    } else {
      yearNumber = Number(rawYear);
    }
    const iso = `${String(yearNumber).padStart(4, '0')}-${month}-${day}`;
    return { iso, keyword: '', display: formatDisplayDate(new Date(iso)) };
  }
  return { iso: '', keyword: trimmed.toLowerCase(), display: trimmed, label: trimmed };
}

export function parseTimeInput(value) {
  if (!value) return { time: '', keyword: '' };
  const trimmed = stripOptionDisplaySuffix(value).trim();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (match) {
    const hour = match[1].padStart(2, '0');
    const minute = (match[2] || '00').padStart(2, '0');
    return { time: `${hour}:${minute}`, keyword: '' };
  }
  const lower = trimmed.toLowerCase();
  const map = {
    morning: '09:00',
    midday: '12:00',
    afternoon: '15:00',
    evening: '19:00',
    night: '22:00',
  };
  if (map[lower]) {
    return { time: map[lower], keyword: lower };
  }
  if (lower === 'now') {
    const now = new Date();
    return { time: now.toTimeString().slice(0, 5), keyword: 'now' };
  }
  return { time: '', keyword: lower };
}
