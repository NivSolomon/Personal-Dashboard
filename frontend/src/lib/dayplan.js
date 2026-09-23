export const DAY_START_MIN = 6 * 60;
export const DAY_END_MIN = 22 * 60;
export const DAY_MIN = 0;
export const DAY_MAX = 24 * 60;
export const SNAP_MIN = 15;

const VIEW_PAD_MIN = 45;
const VIEW_MIN_SPAN = 6 * 60;

export function clockFromMinutes(total) {
  const clamped = Math.max(0, Math.min(DAY_MAX - SNAP_MIN, Math.round(Number(total) || 0)));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function snapMinutes(value, snap = SNAP_MIN) {
  return Math.round(Number(value) / snap) * snap;
}

/**
 * Crop empty morning/afternoon so evening events (and titles) get the strip.
 * Keep 06:00–22:00 when that already covers the day.
 */
export function visibleRange(blocks, nowMin) {
  const timed = (blocks || []).filter(
    (block) => !block.allDay && Number.isFinite(block.startMin) && Number.isFinite(block.endMin),
  );
  if (!timed.length) return { start: DAY_START_MIN, end: DAY_END_MIN };

  const contentStart = Math.min(...timed.map((block) => block.startMin));
  const contentEnd = Math.max(...timed.map((block) => block.endMin));
  const fitsDefault =
    contentStart >= DAY_START_MIN &&
    contentEnd <= DAY_END_MIN &&
    (!Number.isFinite(nowMin) || (nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN));
  if (fitsDefault) return { start: DAY_START_MIN, end: DAY_END_MIN };

  let start = Math.floor((contentStart - VIEW_PAD_MIN) / 60) * 60;
  let end = Math.ceil((contentEnd + VIEW_PAD_MIN) / 60) * 60;
  const nowNearby =
    Number.isFinite(nowMin) && nowMin >= contentStart - 3 * 60 && nowMin <= contentEnd + 3 * 60;
  if (nowNearby) {
    start = Math.min(start, Math.floor((nowMin - VIEW_PAD_MIN) / 60) * 60);
    end = Math.max(end, Math.ceil((nowMin + VIEW_PAD_MIN) / 60) * 60);
  }

  if (end - start < VIEW_MIN_SPAN) {
    const extra = VIEW_MIN_SPAN - (end - start);
    const takeLeft = Math.min(Math.max(0, start - DAY_MIN), extra);
    start -= takeLeft;
    end = Math.min(DAY_MAX, end + (extra - takeLeft));
  }

  start = Math.max(DAY_MIN, start);
  end = Math.max(start + 60, Math.min(DAY_MAX, end));
  return { start, end };
}

export function hourMarks(start, end) {
  const span = end - start;
  const step = span > 10 * 60 ? 2 : 1;
  const first = Math.ceil(start / 60 / step) * step;
  const hours = [];
  for (let hour = first; hour * 60 < end; hour += step) hours.push(hour);
  return hours;
}

export function axisPct(min, start, end) {
  const span = end - start;
  if (span <= 0) return 0;
  return ((min - start) / span) * 100;
}

const CHAR_PX = 7.2;
const LABEL_CHROME_PX = 22;

function labelNeedMin(text, pxPerMin) {
  const px = LABEL_CHROME_PX + String(text || '').length * CHAR_PX;
  return px / Math.max(pxPerMin, 0.05);
}

/**
 * Place commute titles only where they fit. On a narrow strip both “to work”
 * and “home” would sit in the same hour and paint over each other.
 */
export function planCommuteLabelSides(commutes, viewStart, viewEnd, trackPx, titles = {}) {
  const span = viewEnd - viewStart;
  const sides = {};
  const list = [...(commutes || [])].sort((a, b) => a.startMin - b.startMin);
  if (!trackPx || trackPx < 360 || span <= 0) {
    for (const block of list) sides[block.id] = null;
    return sides;
  }

  const pxPerMin = trackPx / span;
  for (let i = 0; i < list.length; i += 1) {
    const block = list[i];
    const need = labelNeedMin(titles[block.id], pxPerMin);
    const prev = list[i - 1];
    const next = list[i + 1];
    const gapBefore = block.startMin - (prev ? prev.endMin : viewStart);
    const gapAfter = (next ? next.startMin : viewEnd) - block.endMin;
    const preferBefore = block.id === 'commute-out';
    if (preferBefore && gapBefore >= need) sides[block.id] = 'before';
    else if (!preferBefore && gapAfter >= need) sides[block.id] = 'after';
    else if (gapAfter >= need) sides[block.id] = 'after';
    else if (gapBefore >= need) sides[block.id] = 'before';
    else sides[block.id] = null;
  }

  for (let i = 0; i < list.length - 1; i += 1) {
    const a = list[i];
    const b = list[i + 1];
    if (sides[a.id] !== 'after' || sides[b.id] !== 'before') continue;
    const need =
      labelNeedMin(titles[a.id], pxPerMin) + labelNeedMin(titles[b.id], pxPerMin);
    if (b.startMin - a.endMin >= need) continue;
    const prev = list[i - 1];
    const aNeed = labelNeedMin(titles[a.id], pxPerMin);
    const aBefore = a.startMin - (prev ? prev.endMin : viewStart);
    sides[a.id] = aBefore >= aNeed ? 'before' : null;
  }

  return sides;
}

/** Put a short chip’s title beside the bar when the bar is too thin to hold it. */
export function chipLabelSide(block, peers, viewStart, viewEnd, trackPx = 0, title = '') {
  const span = viewEnd - viewStart;
  if (span <= 0) return null;
  const widthPct = ((block.endMin - block.startMin) / span) * 100;
  const titlePx = 10 + String(title || '').length * CHAR_PX;
  const barPx = trackPx > 0 ? (trackPx * widthPct) / 100 : null;
  if (barPx != null ? barPx >= titlePx + 10 : widthPct >= 14) return null;

  const same = (peers || [])
    .filter((row) => row.id !== block.id && row.track === block.track)
    .sort((a, b) => a.startMin - b.startMin);
  const prev = [...same].reverse().find((row) => row.endMin <= block.startMin);
  const next = same.find((row) => row.startMin >= block.endMin);
  const gapBefore = block.startMin - (prev ? prev.endMin : viewStart);
  const gapAfter = (next ? next.startMin : viewEnd) - block.endMin;
  const pxPerMin = trackPx > 0 ? trackPx / span : 0;
  const need = pxPerMin ? titlePx / pxPerMin : Math.max(40, span * 0.08);
  const nearEnd = (block.startMin - viewStart) / span > 0.7;
  if (nearEnd && gapBefore >= need) return 'before';
  if (gapAfter >= need && (!nearEnd || gapAfter >= gapBefore)) return 'after';
  if (gapBefore >= need) return 'before';
  return null;
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

export function withConflicts(plan) {
  const blocks = plan?.blocks || [];
  return { ...plan, blocks, conflicts: findConflicts(blocks) };
}
