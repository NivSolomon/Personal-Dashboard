/**
 * Timezone helpers built on Intl so the project stays dependency-free for dates.
 * Everything the dashboard shows is "today in the user's timezone", which does
 * not line up with the server's UTC day.
 */

function offsetMs(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(instant)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/** Start (inclusive) and end (exclusive) of the calendar day containing `now`. */
export function dayRange(timeZone, now = new Date()) {
  const wallClock = new Date(now.getTime() + offsetMs(now, timeZone));
  const startWall = Date.UTC(
    wallClock.getUTCFullYear(),
    wallClock.getUTCMonth(),
    wallClock.getUTCDate(),
  );
  const endWall = startWall + 24 * 60 * 60 * 1000;

  // Resolve twice: the offset can differ on either side of a DST transition.
  const resolve = (wall) => {
    const guess = new Date(wall - offsetMs(now, timeZone));
    return new Date(wall - offsetMs(guess, timeZone));
  };

  return { start: resolve(startWall), end: resolve(endWall) };
}

/**
 * Start (inclusive) and end (exclusive) of the calendar week containing `now`.
 * `startsOn` follows getUTCDay, so 0 is Sunday — the working week here.
 */
export function weekRange(timeZone, now = new Date(), startsOn = 0) {
  const wallClock = new Date(now.getTime() + offsetMs(now, timeZone));
  const daysBack = (wallClock.getUTCDay() - startsOn + 7) % 7;
  const firstDay = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return { start: dayRange(timeZone, firstDay).start, end: dayRange(timeZone, now).end };
}

/** `YYYY-MM-DD` plus `days` on the calendar, not elapsed hours (DST-safe). */
export function shiftDateKey(ymd, days) {
  const [year, month, day] = String(ymd || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(Date.UTC(year, month - 1, day + Number(days || 0))).toISOString().slice(0, 10);
}

/**
 * Inclusive local days behind `now`, exclusive end after `future` local days
 * ahead. Used so week Q&A can see both recent history and tomorrow's calendar.
 */
export function aroundDaysRange(timeZone, { past = 7, future = 7, now = new Date() } = {}) {
  const startAt = new Date(now.getTime() - Math.max(0, past - 1) * 24 * 60 * 60 * 1000);
  const endAt = new Date(now.getTime() + Math.max(0, future) * 24 * 60 * 60 * 1000);
  return { start: dayRange(timeZone, startAt).start, end: dayRange(timeZone, endAt).end };
}

/** `YYYY-MM-DD` for the given instant in `timeZone`; used as the summary cache key. */
export function localDateKey(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function formatTime(isoOrDate, timeZone) {
  if (!isoOrDate) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoOrDate));
}

export function formatLongDate(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
}
