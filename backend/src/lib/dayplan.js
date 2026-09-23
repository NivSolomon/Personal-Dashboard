/**
 * Pure layout of "today" on a 06:00–22:00 axis. The browser uses the same
 * rules for a what-if drag so preview and save cannot disagree.
 */

export const DAY_START_MIN = 6 * 60;
export const DAY_END_MIN = 22 * 60;
export const DAY_MIN = 0;
export const DAY_MAX = 24 * 60;
export const SNAP_MIN = 15;

export function minutesInZone(iso, timeZone) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

export function clockFromMinutes(total) {
  const clamped = Math.max(0, Math.min(24 * 60 - SNAP_MIN, Math.round(Number(total) || 0)));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function snapMinutes(value, snap = SNAP_MIN) {
  return Math.round(Number(value) / snap) * snap;
}

function overlaps(a, b) {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

export function findConflicts(blocks) {
  const timed = (blocks || []).filter(
    (block) =>
      block &&
      block.kind !== 'weather' &&
      Number.isFinite(block.startMin) &&
      Number.isFinite(block.endMin),
  );
  const conflicts = [];
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      if (!overlaps(timed[i], timed[j])) continue;
      conflicts.push({
        a: timed[i].id,
        b: timed[j].id,
        kind: timed[i].kind === 'commute' || timed[j].kind === 'commute' ? 'travel' : 'overlap',
      });
    }
  }
  return conflicts;
}

/**
 * Commute is re-anchored to the first and last timed meeting so a what-if
 * drag cannot leave travel overlapping the event it is meant to reach.
 */
export function attachCommute(blocks, commute) {
  const rest = (blocks || []).filter((block) => block.kind !== 'commute');
  const timed = rest
    .filter((block) => !block.allDay && Number.isFinite(block.startMin) && Number.isFinite(block.endMin))
    .sort((a, b) => a.startMin - b.startMin);
  const first = timed[0];
  const last = timed[timed.length - 1];
  const extra = [];

  const toWork = Number(commute?.toWorkMinutes);
  if (first && Number.isFinite(toWork) && toWork > 0) {
    const endMin = first.startMin;
    const startMin = Math.max(DAY_MIN, endMin - toWork);
    if (endMin > startMin) {
      extra.push({
        id: 'commute-out',
        sourceId: 'commute:work',
        kind: 'commute',
        title: 'commute-out',
        startMin,
        endMin,
        allDay: false,
        movable: false,
      });
    }
  }

  const toHome = Number(commute?.toHomeMinutes);
  if (last && Number.isFinite(toHome) && toHome > 0) {
    const startMin = last.endMin;
    const endMin = Math.min(DAY_MAX, startMin + toHome);
    if (endMin > startMin) {
      extra.push({
        id: 'commute-in',
        sourceId: 'commute:home',
        kind: 'commute',
        title: 'commute-in',
        startMin,
        endMin,
        allDay: false,
        movable: false,
      });
    }
  }

  return extra.length ? [...rest, ...extra] : rest;
}

export function applyMove(blocks, id, nextStartMin) {
  const current = (blocks || []).find((block) => block.id === id);
  if (!current?.movable) return blocks || [];
  const duration = Math.max(SNAP_MIN, current.endMin - current.startMin);
  const startMin = Math.max(
    DAY_MIN,
    Math.min(DAY_MAX - duration, snapMinutes(nextStartMin)),
  );
  return (blocks || []).map((block) =>
    block.id === id ? { ...block, startMin, endMin: startMin + duration } : block,
  );
}

export function buildDayPlan({ events = [], weather = null, commute = null, timeZone } = {}) {
  const blocks = [];

  for (const event of events || []) {
    if (event.allDay) {
      blocks.push({
        id: event.id,
        sourceId: `event:${event.id}`,
        kind: 'event',
        title: event.title,
        allDay: true,
        movable: false,
        location: event.location || null,
      });
      continue;
    }
    const startMin = minutesInZone(event.start, timeZone);
    const endMin = minutesInZone(event.end, timeZone);
    if (startMin == null || endMin == null || endMin <= startMin) continue;
    blocks.push({
      id: event.id,
      sourceId: `event:${event.id}`,
      kind: 'event',
      title: event.title,
      startMin,
      endMin,
      allDay: false,
      movable: Boolean(event.isSelfOrganized),
      location: event.location || null,
    });
  }

  for (const slot of weather?.bestWindows || []) {
    const startMin = Number(slot.hour) * 60;
    if (!Number.isFinite(startMin)) continue;
    blocks.push({
      id: `weather-${slot.hour}`,
      sourceId: 'weather',
      kind: 'weather',
      title: slot.sport?.bestFor || 'train',
      startMin,
      endMin: startMin + 60,
      allDay: false,
      movable: false,
    });
  }

  const laidOut = blocks;
  return {
    startMin: DAY_START_MIN,
    endMin: DAY_END_MIN,
    blocks: laidOut,
    conflicts: findConflicts(laidOut),
    commute,
  };
}
