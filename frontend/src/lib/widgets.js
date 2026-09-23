/**
 * UI metadata for the dashboard grid. Ids must match backend/src/lib/widgets.js.
 * Titles live in i18n; availability is separate from "enabled".
 */
export const WIDGET_META = {
  summary: { span: 2, pin: 'briefing' },
  tip: { span: 2, pin: 'top' },
  weather: { span: 1 },
  timeline: { span: 2 },
  tasks: { span: 1 },
  emails: { span: 1 },
  ask: { span: 2 },
  parcels: { span: 1 },
  nutrition: { span: 1 },
  notion: { span: 1 },
  activity: { span: 1 },
  usd: { span: 1 },
  watchlist: { span: 1 },
};

const PIN_RANK = { top: 0, briefing: 1 };

/** Day-planning tiles sit in the first column. Everything else stacks beside them. */
export const DAY_WIDGET_IDS = ['timeline', 'tasks', 'emails', 'ask'];
const DAY_WIDGET_SET = new Set(DAY_WIDGET_IDS);

export function isWidgetAvailable(id, session) {
  const offered = session?.offered || {};
  const connected = session?.connected || {};
  const notion = session?.notion || {};

  if (id === 'weather') return Boolean(offered.weather);
  if (id === 'notion') return Boolean(connected.notion && notion.deadlines?.dataSourceId);
  if (id === 'activity') {
    return Boolean((connected.notion && notion.workouts?.dataSourceId) || offered.strava);
  }
  return Boolean(WIDGET_META[id]);
}

export function layoutWidgets(session) {
  return session?.settings?.layout?.widgets || [];
}

export function visibleWidgets(session) {
  return layoutWidgets(session).filter(
    (widget) => widget.enabled && isWidgetAvailable(widget.id, session),
  );
}

/** Pinned tiles render above the two-column board (tip, then morning briefing). */
export function pinnedWidgets(session) {
  return visibleWidgets(session)
    .filter((widget) => WIDGET_META[widget.id]?.pin)
    .sort(
      (a, b) =>
        (PIN_RANK[WIDGET_META[a.id]?.pin] ?? 9) - (PIN_RANK[WIDGET_META[b.id]?.pin] ?? 9),
    );
}

export function gridWidgets(session) {
  return visibleWidgets(session).filter((widget) => !WIDGET_META[widget.id]?.pin);
}

export function isDayWidget(id) {
  return DAY_WIDGET_SET.has(id);
}

/** Status rows on a Today tile before “open the rest”. */
export const SCAN_PREVIEW = 2;
/** Around-you tiles shown before “More”. */
export const AROUND_CAP = 3;

export function hiddenWidgets(session) {
  return layoutWidgets(session).filter(
    (widget) => !widget.enabled && isWidgetAvailable(widget.id, session),
  );
}

/**
 * Enabled widget ids only. Used so a reorder does not look like a data-source
 * change and reload the dashboard.
 */
export function enabledWidgetsKey(layout) {
  return (layout?.widgets || [])
    .filter((widget) => widget.enabled)
    .map((widget) => widget.id)
    .sort()
    .join(',');
}

export function withWidgetEnabled(layout, id, enabled) {
  return {
    widgets: (layout?.widgets || []).map((widget) =>
      widget.id === id ? { ...widget, enabled } : widget,
    ),
  };
}

export function moveWidget(layout, id, direction) {
  const widgets = [...(layout?.widgets || [])];
  const index = widgets.findIndex((widget) => widget.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= widgets.length) return { widgets };
  const copy = [...widgets];
  [copy[index], copy[next]] = [copy[next], copy[index]];
  return { widgets: copy };
}

/** Move a widget to another widget's slot. Used by drag-and-drop on the grid. */
export function reorderWidgets(layout, fromId, toId) {
  const widgets = [...(layout?.widgets || [])];
  const from = widgets.findIndex((widget) => widget.id === fromId);
  const to = widgets.findIndex((widget) => widget.id === toId);
  if (from < 0 || to < 0 || from === to) return { widgets };
  const next = [...widgets];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return { widgets: next };
}
