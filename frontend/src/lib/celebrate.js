const KEY = 'mydashi-welcome';

let snapshot;

export function markOnboardComplete() {
  snapshot = undefined;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Same result for the rest of this page load, including Strict Mode remounts. */
export function takeOnboardWelcome() {
  if (snapshot !== undefined) return snapshot;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) {
      snapshot = null;
      return snapshot;
    }
    sessionStorage.removeItem(KEY);
    const at = Number(raw);
    snapshot = { at, late: Number.isFinite(at) && Date.now() - at > 4000 };
    return snapshot;
  } catch {
    snapshot = null;
    return snapshot;
  }
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
