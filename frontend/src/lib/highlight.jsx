import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const WIDGET_BY_KIND = {
  event: 'timeline',
  task: 'tasks',
  email: 'emails',
  weather: 'weather',
  activity: 'activity',
  usd: 'usd',
  watch: 'watchlist',
  notion: 'notion',
  parcel: 'parcels',
  commute: 'timeline',
  briefing: 'summary',
  tip: 'tip',
};

const HighlightContext = createContext({
  active: [],
  hover: () => {},
  focusWidget: () => {},
  openedWidget: null,
});

export function widgetOfSource(sourceId) {
  const kind = String(sourceId || '').split(':')[0];
  return WIDGET_BY_KIND[kind] || null;
}

function escapeAttr(value) {
  const text = String(value || '');
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(text);
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function HighlightProvider({ children }) {
  const [active, setActive] = useState([]);
  const [openedWidget, setOpenedWidget] = useState(null);

  const hover = useCallback((ids) => {
    setActive(Array.isArray(ids) ? ids.filter(Boolean) : []);
  }, []);

  const focusWidget = useCallback((widget, sourceId) => {
    if (widget) setOpenedWidget({ widget, sourceId, at: Date.now() });
    window.setTimeout(() => {
      const item = sourceId
        ? document.querySelector(`[data-source-id="${escapeAttr(sourceId)}"]`)
        : null;
      const node =
        item || (widget ? document.querySelector(`[data-widget-id="${escapeAttr(widget)}"]`) : null);
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }, []);

  const value = useMemo(
    () => ({ active, hover, focusWidget, openedWidget }),
    [active, hover, focusWidget, openedWidget],
  );
  return <HighlightContext.Provider value={value}>{children}</HighlightContext.Provider>;
}

export function useHighlight() {
  return useContext(HighlightContext);
}

export function isSourceActive(active, sourceId) {
  return (active || []).includes(sourceId);
}

export function isWidgetCited(active, widget) {
  return (active || []).some((id) => widgetOfSource(id) === widget);
}

export function citedItemClass(on) {
  return on ? 'bg-tone-indigo/50 ring-2 ring-indigo-400/70' : '';
}
