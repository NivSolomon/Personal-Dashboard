/**
 * The dashboard is a per-user grid of widgets. This catalog is the server's
 * source of truth for ids, defaults, and which data source each tile needs.
 * Keep the ids in sync with frontend/src/lib/widgets.js.
 */

export const WIDGET_IDS = [
  'summary',
  'tip',
  'weather',
  'schedule',
  'tasks',
  'emails',
  'parcels',
  'nutrition',
  'notion',
  'activity',
  'usd',
  'watchlist',
];

/** Shown to a new account (and to anyone who has not saved a layout yet). */
export const DEFAULT_WIDGETS = [
  { id: 'summary', enabled: true },
  { id: 'tip', enabled: true },
  { id: 'weather', enabled: true },
  { id: 'schedule', enabled: true },
  { id: 'tasks', enabled: true },
  { id: 'emails', enabled: true },
  { id: 'parcels', enabled: true },
  { id: 'nutrition', enabled: true },
  { id: 'notion', enabled: true },
  { id: 'activity', enabled: true },
  { id: 'usd', enabled: false },
  { id: 'watchlist', enabled: true },
];

const DEFAULT_BY_ID = new Map(DEFAULT_WIDGETS.map((widget) => [widget.id, widget]));

/**
 * Saved order wins; unknown ids are dropped; widgets added in a later release
 * are appended with their catalog default so existing accounts pick them up.
 */
export function normalizeLayout(saved) {
  const incoming = Array.isArray(saved?.widgets) ? saved.widgets : [];
  const seen = new Set();
  const widgets = [];

  for (const item of incoming) {
    if (!item || !WIDGET_IDS.includes(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    const fallback = DEFAULT_BY_ID.get(item.id);
    widgets.push({
      id: item.id,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : fallback.enabled,
    });
  }

  for (const def of DEFAULT_WIDGETS) {
    if (seen.has(def.id)) continue;
    widgets.push({ id: def.id, enabled: def.enabled });
  }

  return { widgets };
}

export function isWidgetEnabled(layout, id) {
  const widget = normalizeLayout(layout).widgets.find((item) => item.id === id);
  return Boolean(widget?.enabled);
}

export function withWidgetEnabled(layout, id, enabled) {
  const widgets = normalizeLayout(layout).widgets.map((widget) =>
    widget.id === id ? { ...widget, enabled } : widget,
  );
  return { widgets };
}
