const DATE_INPUT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function toJsDate(value) {
  if (!value) return null;
  return value?.toDate ? value.toDate() : new Date(value);
}

function isUtcMidnight(date) {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

export function getCalendarDateParts(date) {
  if (isUtcMidnight(date)) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  }

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

export function parseDateInput(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (DATE_INPUT_REGEX.test(trimmed)) {
    const date = new Date(`${trimmed}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toLocalCalendarDate(value) {
  if (!value) return null;

  if (typeof value === 'string' && DATE_INPUT_REGEX.test(value.trim())) {
    return parseDateInput(value);
  }

  const date = toJsDate(value);
  if (!date || Number.isNaN(date.getTime())) return null;

  const { year, month, day } = getCalendarDateParts(date);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function formatDate(value) {
  if (!value) return '—';

  const date = toLocalCalendarDate(value);
  if (!date) return '—';

  const { year, month, day } = getCalendarDateParts(date);
  return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
}

export function formatDateTime(value) {
  if (!value) return '—';

  const date = toJsDate(value);
  if (!date || Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function toDateInputValue(value) {
  if (!value) return '';

  const date = toLocalCalendarDate(value);
  if (!date) return '';

  const { year, month, day } = getCalendarDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function toDateInputString(date) {
  return toDateInputValue(date);
}
