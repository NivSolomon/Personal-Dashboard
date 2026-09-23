/** Last board snapshot for this tab, so a reload can paint widgets before the API returns. */

const KEY = 'mydashi-board-v1';
const MAX_AGE_MS = 15 * 60 * 1000;

export function readBoardSnapshot() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!parsed?.userId || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeBoardSnapshot({ userId, dashboard, summary }) {
  if (!userId) return;
  try {
    const prev = readBoardSnapshot();
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        userId,
        dashboard: dashboard || prev?.dashboard || null,
        summary: summary === undefined ? prev?.summary || null : summary,
        at: Date.now(),
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearBoardSnapshot() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function dashboardLooksReady(data) {
  return Boolean(
    data?.fetchedAt ||
      data?.attempted > 0 ||
      data?.weather ||
      data?.dayPlan ||
      data?.events?.length ||
      data?.tasks?.length,
  );
}

/** A fast (partial) response must not wipe parcels we already showed. */
export function mergeDashboard(prev, next) {
  if (!next) return prev;
  if (!next.partial) return next;
  const merged = { ...next };
  if (Array.isArray(prev?.parcels) && prev.parcels.length > 0 && !next.parcels?.length) {
    merged.parcels = prev.parcels;
  }
  if (Array.isArray(prev?.emails) && prev.emails.length > 0 && !next.emails?.length) {
    merged.emails = prev.emails;
  }
  return merged;
}
