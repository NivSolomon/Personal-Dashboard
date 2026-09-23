import { localeOf, tr, uiLanguage } from './i18n.jsx';

function loc(language) {
  return localeOf(language || uiLanguage());
}

export function timeLabel(iso, timeZone) {
  if (!iso) return '';
  return new Intl.DateTimeFormat(loc(), { timeZone, hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

/** Clock time if it is still today in `timeZone`; otherwise a short weekday. */
export function mailTime(iso, timeZone) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const dayOf = (value) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  if (timeZone && dayOf(date) === dayOf(new Date())) return timeLabel(iso, timeZone);
  return new Intl.DateTimeFormat(loc(), { timeZone, weekday: 'short' }).format(date);
}

/** Compact drive time for the Home/Work chips. */
export function driveDurationLabel(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (value < 1) return tr('underMinute');
  if (value === 1) return tr('minute');
  if (value < 60) return tr('minutesShort', { n: value });
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  const hourPart =
    hours === 1 ? tr('hour') : hours === 2 ? tr('twoHours') : tr('hoursShort', { n: hours });
  if (!rest) return hourPart;
  return `${hourPart} ${tr('minutesShort', { n: rest })}`;
}

export function todayLabel(timeZone) {
  return new Intl.DateTimeFormat(loc(), {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

/** `due` from Google Tasks is a date-only RFC3339 value, so compare calendar days. */
export function dueLabel(due, timeZone) {
  const dayKey = (date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(date);

  if (!due) return null;

  const dueKey = due.slice(0, 10);
  const todayKey = dayKey(new Date());
  if (dueKey === todayKey) return { text: tr('today'), tone: 'today' };
  if (dueKey < todayKey) return { text: tr('overdue'), tone: 'overdue' };

  const text = new Intl.DateTimeFormat(loc(), {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${dueKey}T12:00:00Z`));
  return { text, tone: 'upcoming' };
}

function agoLabel(count, [one, two, many]) {
  if (count === 1) return tr('agoOne', { unit: one });
  if (count === 2) return tr('agoOne', { unit: two });
  return tr('agoMany', { n: count, unit: many });
}

export function relativeTime(iso) {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return tr('now');
  if (minutes < 60) return agoLabel(minutes, [tr('unit.minute'), tr('unit.twoMinutes'), tr('unit.minutes')]);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return agoLabel(hours, [tr('unit.hour'), tr('unit.twoHours'), tr('unit.hours')]);
  return agoLabel(Math.round(hours / 24), [tr('unit.day'), tr('unit.twoDays'), tr('unit.days')]);
}

/** Spoken name for a quote currency. Only USD and NIS are used on this board. */
export function currencyLabel(code) {
  if (!code) return null;
  const key = String(code).trim().toUpperCase();
  if (key === 'USD') return 'USD';
  if (key === 'ILS' || key === 'ILA' || key === 'NIS') return 'NIS';
  return null;
}

export function moneyLabel(value, currency) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const amount = Number(value).toLocaleString(loc(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(value) >= 100 ? 2 : 4,
  });
  const name = currencyLabel(currency);
  return name ? `${amount} ${name}` : amount;
}

export function alertSideLabel(op) {
  return op === 'below' ? tr('alert.below') : tr('alert.above');
}

export function alertOpLabel(op, currency) {
  const side = alertSideLabel(op);
  const name = currencyLabel(currency);
  return name ? `${side} (${name})` : side;
}

/** ETA from the parcels widget: ISO dates are formatted; free text is shown as-is. */
export function deliveryDateLabel(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return String(value).trim();
  return new Intl.DateTimeFormat(loc(), {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${match[1]}T12:00:00Z`));
}

export function deliveryArrivalLabel(parcel, timeZone) {
  const datePart = deliveryDateLabel(parcel?.estimatedDeliveryDate);
  const timePart = String(parcel?.estimatedDeliveryTime || '').trim();
  if (datePart && timePart) return `${datePart} · ${timePart}`;
  return datePart || timePart || null;
}
