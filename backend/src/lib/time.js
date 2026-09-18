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
