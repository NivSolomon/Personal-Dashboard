/**
 * USD/ILS from the ECB via Frankfurter. No API key, and only fetched when a
 * user has actually pinned the dollar widget to their grid.
 */
const RANGE_URL = 'https://api.frankfurter.app';

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export async function fetchUsdIls() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);

  const query = new URLSearchParams({ from: 'USD', to: 'ILS' });
  const response = await fetch(`${RANGE_URL}/${isoDate(start)}..${isoDate(end)}?${query}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Frankfurter ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  const days = Object.entries(payload.rates || {}).sort(([a], [b]) => a.localeCompare(b));
  const latest = days.at(-1);
  const previous = days.at(-2);
  if (!latest) throw new Error('Frankfurter returned no USD/ILS rates');

  const [asOf, latestRates] = latest;
  const rate = Number(latestRates.ILS);
  const previousRate = previous ? Number(previous[1].ILS) : null;
  const change = Number.isFinite(previousRate) ? rate - previousRate : null;

  return {
    base: 'USD',
    quote: 'ILS',
    rate: round(rate, 4),
    previous: Number.isFinite(previousRate) ? round(previousRate, 4) : null,
    change: change == null ? null : round(change, 4),
    changePct: change == null || !previousRate ? null : round((change / previousRate) * 100, 2),
    asOf,
  };
}
