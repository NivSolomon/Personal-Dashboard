/** Client-side mirrors of the API input rules. */

export const TITLE_MAX = 200;
export const LOCATION_MAX = 200;
export const DESCRIPTION_MAX = 2000;
export const GOAL_MAX_KM = 1000;
export const GOAL_MAX_KCAL = 10000;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const CLOCK_RE = /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/;
const CLOCK_STEP = 15;

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

function padClock(value) {
  return String(value).padStart(2, '0');
}

export function localDateKey(timeZone, now = new Date()) {
  if (!timeZone) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function localClockMinutes(timeZone, now = new Date()) {
  if (!timeZone) return 0;
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

/** Last 15-minute slot that has already started — TimeSelect treats this as exclusive min. */
export function clockFloor(timeZone, now = new Date()) {
  const snapped = Math.floor(localClockMinutes(timeZone, now) / CLOCK_STEP) * CLOCK_STEP;
  return `${padClock(Math.floor(snapped / 60))}:${padClock(snapped % 60)}`;
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

export function isClockRangeValid(startTime, endTime) {
  const start = clockMinutes(startTime);
  const end = clockMinutes(endTime);
  return start != null && end != null && end > start;
}

export function hasIssues(issues) {
  return Object.keys(issues).length > 0;
}

export function eventFormIssues(form, { timeZone } = {}) {
  const issues = {};
  const title = String(form.title || '').trim();
  if (!title) issues.title = 'required';
  else if (title.length > TITLE_MAX) issues.title = 'too_long';

  if (!isValidDate(form.date)) issues.date = 'invalid';
  else if (isDateBeforeToday(form.date, timeZone)) issues.date = 'date_in_past';

  if (!form.allDay) {
    if (!isValidClock(form.startTime)) issues.startTime = 'invalid';
    else if (!issues.date && isClockBeforeNow(form.date, form.startTime, timeZone)) {
      issues.startTime = 'time_in_past';
    }
    if (!isValidClock(form.endTime)) issues.endTime = 'invalid';
    if (!issues.startTime && !issues.endTime && !isClockRangeValid(form.startTime, form.endTime)) {
      issues.endTime = isClockRangeValid(form.startTime, '23:45') ? 'before_start' : 'no_room';
    }
  }

  if (String(form.location || '').length > LOCATION_MAX) issues.location = 'too_long';
  if (String(form.description || '').length > DESCRIPTION_MAX) issues.description = 'too_long';
  return issues;
}

export function taskFormIssues({ title, due, dueTime, location }, { timeZone } = {}) {
  const issues = {};
  const nextTitle = String(title || '').trim();
  if (!nextTitle) issues.title = 'required';
  else if (nextTitle.length > TITLE_MAX) issues.title = 'too_long';

  if (due && !isValidDate(due)) issues.due = 'invalid';
  else if (due && isDateBeforeToday(due, timeZone)) issues.due = 'date_in_past';
  if (dueTime && !due) issues.dueTime = 'time_without_due';
  if (dueTime && !isValidClock(dueTime)) issues.dueTime = 'invalid';
  else if (dueTime && due && isClockBeforeNow(due, dueTime, timeZone)) issues.dueTime = 'time_in_past';
  if (String(location || '').length > LOCATION_MAX) issues.location = 'too_long';
  return issues;
}

export function settingsFormIssues(form, { weatherOffered = false } = {}) {
  const issues = {};
  const goal = Number(form.weeklyGoalKm);
  if (!Number.isFinite(goal) || goal < 0 || goal > GOAL_MAX_KM) issues.weeklyGoalKm = 'invalid';
  const calories = Number(form.calorieGoal);
  if (!Number.isFinite(calories) || calories < 0 || calories > GOAL_MAX_KCAL) {
    issues.calorieGoal = 'invalid';
  }

  if (!String(form.home || '').trim()) issues.home = 'required';
  else if (String(form.home).trim().length > LOCATION_MAX) issues.home = 'too_long';
  if (!String(form.work || '').trim()) issues.work = 'required';
  else if (String(form.work).trim().length > LOCATION_MAX) issues.work = 'too_long';

  if (weatherOffered) {
    const latEmpty = form.lat === '' || form.lat == null;
    const lonEmpty = form.lon === '' || form.lon == null;
    if (latEmpty !== lonEmpty) issues.coords = 'pair';
    else if (!latEmpty) {
      const lat = Number(form.lat);
      const lon = Number(form.lon);
      if (
        !Number.isFinite(lat) ||
        Math.abs(lat) > 90 ||
        !Number.isFinite(lon) ||
        Math.abs(lon) > 180
      ) {
        issues.coords = 'invalid';
      }
    }
  }
  return issues;
}

export function isPositivePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0;
}
