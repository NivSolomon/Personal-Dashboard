/** Shared input rules for events, tasks, and settings. */

export const TITLE_MAX = 200;
export const LOCATION_MAX = 200;
export const DESCRIPTION_MAX = 2000;
export const PLACE_MAX = 200;
export const GOAL_MAX_KM = 1000;
export const GOAL_MAX_KCAL = 10000;
export const LANGUAGES = ['Hebrew', 'English'];

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

export function parseEventBody(body = {}) {
  const title = clipped(body.title, TITLE_MAX);
  if (!title) return { error: 'invalid_title' };

  const date = String(body.date || '').slice(0, 10);
  if (!isValidDate(date)) return { error: 'invalid_date' };

  const allDay = Boolean(body.allDay);
  let startTime = '';
  let endTime = '';
  if (!allDay) {
    startTime = String(body.startTime || '').slice(0, 5);
    endTime = String(body.endTime || '').slice(0, 5);
    if (!isValidClock(startTime) || !isValidClock(endTime)) return { error: 'invalid_time' };
    if (!isClockRangeValid(startTime, endTime)) return { error: 'invalid_range' };
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

export function parseTaskBody(body = {}) {
  const title = clipped(body.title, TITLE_MAX);
  if (!title) return { error: 'invalid_title' };

  let due = null;
  if (body.due) {
    const raw = String(body.due).slice(0, 10);
    if (!isValidDate(raw)) return { error: 'invalid_due' };
    due = `${raw}T00:00:00.000Z`;
  }

  let time = '';
  if (body.time) {
    time = String(body.time);
    if (!isValidClock(time)) return { error: 'invalid_time' };
    if (!due) return { error: 'time_without_due' };
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
  const empty = lat === null && lon === null;
  const pair =
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Number.isFinite(lon) &&
    Math.abs(lon) <= 180;
  if (!empty && !pair) return { error: 'invalid_coordinates' };
  return { value: { lat: empty ? null : lat, lon: empty ? null : lon } };
}

export function isPositivePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0;
}
