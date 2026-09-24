/**
 * Spot and history rates from the ECB via Frankfurter. No API key.
 * Rates are stored as home units per 1 foreign unit (1 USD = 3.72 ILS).
 */
import { normalizeFxCode, normalizeFxSettings } from '../lib/fx.js';

const RANGE_URL = 'https://api.frankfurter.app';

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function daysAgo(days) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return { start: isoDate(start), end: isoDate(end) };
}

async function frankfurter(path) {
  const response = await fetch(`${RANGE_URL}${path}`, {
    credentials: 'include',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Frankfurter ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

function homePerForeign(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return null;
  return 1 / n;
}

function quoteFromDays(code, days, unit) {
  const latest = days.at(-1);
  const previous = days.at(-2);
  const rate = latest ? homePerForeign(latest[1]?.[code]) : null;
  const previousRate = previous ? homePerForeign(previous[1]?.[code]) : null;
  if (rate == null) return null;
  const change = previousRate == null ? null : rate - previousRate;
  return {
    code,
    unit,
    rate: round(rate, 4),
    previous: previousRate == null ? null : round(previousRate, 4),
    change: change == null ? null : round(change, 4),
    changePct: change == null || !previousRate ? null : round((change / previousRate) * 100, 2),
  };
}

function invertQuote(row, code) {
  if (!row?.rate) return null;
  const rate = 1 / row.rate;
  const previous = row.previous ? 1 / row.previous : null;
  const change = previous == null ? null : rate - previous;
  return {
    code,
    unit: row.code,
    rate: round(rate, 4),
    previous: previous == null ? null : round(previous, 4),
    change: change == null ? null : round(change, 4),
    changePct: change == null || !previous ? null : round((change / previous) * 100, 2),
  };
}

export async function fetchUsdIls() {
  const bundle = await fetchFxQuotes({ base: 'ILS', quotes: ['USD'] });
  return bundle.quotes[0]
    ? { ...bundle.quotes[0], base: bundle.base, quote: 'USD', asOf: bundle.asOf }
    : null;
}

export async function fetchFxQuotes(raw) {
  const { base, quotes } = normalizeFxSettings(raw);
  const fallback = base === 'ILS' ? 'USD' : 'ILS';
  const wanted = [...new Set(quotes.filter((code) => code !== base).concat(quotes.includes(base) ? [fallback] : []))];
  if (!wanted.length) return { base, asOf: null, quotes: [] };

  const { start, end } = daysAgo(7);
  const query = new URLSearchParams({ from: base, to: wanted.join(',') });
  const payload = await frankfurter(`/${start}..${end}?${query}`);
  const days = Object.entries(payload.rates || {}).sort(([a], [b]) => a.localeCompare(b));
  const asOf = days.at(-1)?.[0] || null;

  return {
    base,
    asOf,
    quotes: quotes
      .map((code) =>
        code === base
          ? invertQuote(quoteFromDays(fallback, days, base), code)
          : quoteFromDays(code, days, base),
      )
      .filter(Boolean),
  };
}

export async function fetchFxHistory({ from, to, days = 90 } = {}) {
  const foreign = normalizeFxCode(from);
  const home = normalizeFxCode(to);
  if (!foreign || !home || foreign === home) {
    const error = new Error('invalid_fx_pair');
    error.statusCode = 400;
    error.code = 'invalid_fx_pair';
    throw error;
  }

  const span = Math.min(366, Math.max(7, Number(days) || 90));
  const range = daysAgo(span);
  const query = new URLSearchParams({ from: home, to: foreign });
  const payload = await frankfurter(`/${range.start}..${range.end}?${query}`);
  const points = Object.entries(payload.rates || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rates]) => {
      const rate = homePerForeign(rates[foreign]);
      return rate == null ? null : { date, rate: round(rate, 4) };
    })
    .filter(Boolean);

  if (!points.length) {
    const error = new Error('fx_empty');
    error.statusCode = 502;
    error.code = 'fx_empty';
    throw error;
  }

  const first = points[0].rate;
  const last = points.at(-1).rate;
  const change = last - first;
  return {
    from: foreign,
    to: home,
    points,
    first,
    last,
    change: round(change, 4),
    changePct: first ? round((change / first) * 100, 2) : null,
    low: Math.min(...points.map((point) => point.rate)),
    high: Math.max(...points.map((point) => point.rate)),
  };
}
