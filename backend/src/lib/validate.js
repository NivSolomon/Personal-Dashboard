import { localDateKey } from './time.js';

/** Shared input rules for events, tasks, and settings. */

export const TITLE_MAX = 200;
export const LOCATION_MAX = 200;
export const DESCRIPTION_MAX = 2000;
export const PLACE_MAX = 200;
export const GOAL_MAX_KM = 1000;
export const GOAL_MAX_KCAL = 10000;
export const LANGUAGES = ['Hebrew', 'English'];

export function normalizeLanguage(value) {
  const text = String(value || '').trim();
  if (/^en/i.test(text) || text === 'English') return 'English';
  return 'Hebrew';
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const CLOCK_RE = /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/;

export function isValidDate(value) {
  if (!DATE_RE.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidClock(value) {
  return CLOCK_RE.test(String(value || ''));
}

export function clockMinutes(value) {
  if (!isValidClock(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function localClockMinutes(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0) % 24;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

export function isDateBeforeToday(date, timeZone, now = new Date()) {
  return Boolean(timeZone) && isValidDate(date) && date < localDateKey(timeZone, now);
}

export function isClockBeforeNow(date, clock, timeZone, now = new Date()) {
  if (!timeZone || !isValidDate(date)) return false;
  const today = localDateKey(timeZone, now);
  if (date > today) return false;
  if (date < today) return true;
  const mins = clockMinutes(clock);
  if (mins == null) return false;
  return mins < localClockMinutes(timeZone, now);
}

/** Timed events must end after they start, on the same calendar day. */
export function isClockRangeValid(startTime, endTime) {
  const start = clockMinutes(startTime);
  const end = clockMinutes(endTime);
  return start != null && end != null && end > start;
}

export function lastSameDayEnd(startTime) {
  return isClockRangeValid(startTime, '23:45');
}

function clipped(value, max) {
  return String(value || '').trim().slice(0, max);
}

export function parseEventBody(body = {}, { timeZone, now = new Date() } = {}) {
  const title = clipped(body.title, TITLE_MAX);
  if (!title) return { error: 'invalid_title' };

  const date = String(body.date || '').slice(0, 10);
  if (!isValidDate(date)) return { error: 'invalid_date' };
  if (isDateBeforeToday(date, timeZone, now)) return { error: 'date_in_past' };

  const allDay = Boolean(body.allDay);
  let startTime = '';
  let endTime = '';
  if (!allDay) {
    startTime = String(body.startTime || '').slice(0, 5);
    endTime = String(body.endTime || '').slice(0, 5);
    if (!isValidClock(startTime) || !isValidClock(endTime)) return { error: 'invalid_time' };
    if (!isClockRangeValid(startTime, endTime)) return { error: 'invalid_range' };
    if (isClockBeforeNow(date, startTime, timeZone, now)) return { error: 'time_in_past' };
  }

  return {
    value: {
      title,
      date,
      allDay,
      startTime,
      endTime,
      location: clipped(body.location, LOCATION_MAX),
      description: clipped(body.description, DESCRIPTION_MAX),
    },
  };
}

export function parseEventMove(body = {}, { timeZone, now = new Date() } = {}) {
  const date = String(body.date || '').slice(0, 10);
  if (!isValidDate(date)) return { error: 'invalid_date' };
  if (isDateBeforeToday(date, timeZone, now)) return { error: 'date_in_past' };

  const startTime = String(body.startTime || '').slice(0, 5);
  const endTime = String(body.endTime || '').slice(0, 5);
  if (!isValidClock(startTime) || !isValidClock(endTime)) return { error: 'invalid_time' };
  if (!isClockRangeValid(startTime, endTime)) return { error: 'invalid_range' };
  if (isClockBeforeNow(date, startTime, timeZone, now)) return { error: 'time_in_past' };

  return { value: { date, startTime, endTime } };
}

export function parseWeekQuestion(body = {}) {
  const question = String(body.question || '').trim().slice(0, 500);
  if (question.length < 3) return { error: 'invalid_question' };
  return { value: { question } };
}

export function parseTaskBody(body = {}, { timeZone, now = new Date() } = {}) {
  const title = clipped(body.title, TITLE_MAX);
  if (!title) return { error: 'invalid_title' };

  let due = null;
  let dueDate = '';
  if (body.due) {
    dueDate = String(body.due).slice(0, 10);
    if (!isValidDate(dueDate)) return { error: 'invalid_due' };
    if (isDateBeforeToday(dueDate, timeZone, now)) return { error: 'due_in_past' };
    due = `${dueDate}T00:00:00.000Z`;
  }

  let time = '';
  if (body.time) {
    time = String(body.time);
    if (!isValidClock(time)) return { error: 'invalid_time' };
    if (!due) return { error: 'time_without_due' };
    if (isClockBeforeNow(dueDate, time, timeZone, now)) return { error: 'time_in_past' };
  }

  return {
    value: {
      title,
      due,
      time,
      location: clipped(body.location, LOCATION_MAX),
    },
  };
}

export function parseCoordinates(weather) {
  const latRaw = weather?.lat;
  const lonRaw = weather?.lon;
  const lat = latRaw === null || latRaw === '' || latRaw === undefined ? null : Number(latRaw);
  const lon = lonRaw === null || lonRaw === '' || lonRaw === undefined ? null : Number(lonRaw);
  const label = String(weather?.label || '').trim().slice(0, 200);
  const empty = lat === null && lon === null;
  const pair =
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Number.isFinite(lon) &&
    Math.abs(lon) <= 180;
  if (!empty && !pair) return { error: 'invalid_coordinates' };
  return { value: { lat: empty ? null : lat, lon: empty ? null : lon, label } };
}

export function isPositivePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0;
}
