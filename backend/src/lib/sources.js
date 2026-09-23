/** Stable ids so a briefing sentence, a timeline block and a chat citation point at the same row. */

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

export function sourceId(kind, id) {
  if (id == null || id === '') return String(kind);
  return `${kind}:${id}`;
}

export function widgetOfSource(sourceIdValue) {
  const kind = String(sourceIdValue || '').split(':')[0];
  return WIDGET_BY_KIND[kind] || null;
}

export function catalogFromDashboard(data = {}) {
  const ids = new Set();
  for (const event of data.events || []) ids.add(sourceId('event', event.id));
  for (const task of data.tasks || []) ids.add(sourceId('task', task.id));
  for (const email of data.emails || []) ids.add(sourceId('email', email.id));
  for (const item of data.notion || []) ids.add(sourceId('notion', item.id));
  for (const parcel of data.parcels || []) ids.add(sourceId('parcel', parcel.id || parcel.trackingNumber));
  for (const item of data.watchlist?.items || []) ids.add(sourceId('watch', item.symbol));
  if (data.weather) ids.add('weather');
  if (data.activity) ids.add('activity');
  if (data.fx) ids.add('usd');
  ids.add('commute:work');
  ids.add('commute:home');
  return ids;
}

export function filterSources(list, allowed) {
  const known = allowed instanceof Set ? allowed : new Set(allowed || []);
  return [...new Set((Array.isArray(list) ? list : []).map(String).filter((id) => known.has(id)))];
}

export function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
