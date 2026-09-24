import { cleanSymbol, kindFromQuoteType, normalizeCurrency } from '../lib/watchlist.js';

const SEARCH_URL = 'https://query2.finance.yahoo.com/v1/finance/search';
const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const ALLOWED_TYPES = new Set(['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX']);
const HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'application/json',
};

function round(value, digits) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function getJson(url) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Yahoo Finance ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

/**
 * Name/ticker lookup so people can add a stock or fund without memorising the
 * Yahoo symbol. Only equities, ETFs, mutual funds and indices are offered.
 */
export async function searchQuotes(query) {
  const q = String(query || '').trim().slice(0, 40);
  if (q.length < 1) return [];

  const url = `${SEARCH_URL}?${new URLSearchParams({
    q,
    quotesCount: '8',
    newsCount: '0',
    listsCount: '0',
  })}`;
  const payload = await getJson(url);

  const candidates = (payload.quotes || [])
    .filter((row) => ALLOWED_TYPES.has(String(row.quoteType || '').toUpperCase()) && row.symbol)
    .slice(0, 12);

  const quotes = await fetchQuotes(candidates.map((row) => row.symbol));

  return candidates
    .map((row) => {
      const live = quotes.get(String(row.symbol).toUpperCase());
      const currency = normalizeCurrency(live?.currency);
      if (!currency) return null;
      return {
        symbol: String(row.symbol).toUpperCase(),
        name: row.shortname || row.longname || live?.name || row.symbol,
        kind: kindFromQuoteType(row.quoteType),
        quoteType: row.quoteType || null,
        exchange: row.exchDisp || row.exchange || null,
        currency,
        price: live?.price ?? null,
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function scaleQuote(metaCurrency, price, previous) {
  const raw = String(metaCurrency || '').toUpperCase();
  // TASE prints agorot (ILA). Convert to shekels so the board only speaks NIS.
  const scale = raw === 'ILA' ? 0.01 : 1;
  const change = Number.isFinite(previous) ? price - previous : null;
  return {
    currency: normalizeCurrency(raw),
    price: round(price * scale, 4),
    previous: Number.isFinite(previous) ? round(previous * scale, 4) : null,
    change: change == null ? null : round(change * scale, 4),
    changePct:
      change == null || !previous ? null : round((change / previous) * 100, 2),
  };
}

async function fetchOneQuote(symbol) {
  const url = `${CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const payload = await getJson(url);
  const meta = payload.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!meta || !Number.isFinite(price)) {
    throw new Error(`No quote for ${symbol}`);
  }
  const previous = Number(meta.chartPreviousClose ?? meta.previousClose);
  const money = scaleQuote(meta.currency, price, previous);

  return {
    symbol: meta.symbol || symbol,
    name: meta.shortName || meta.longName || symbol,
    kind: kindFromQuoteType(meta.instrumentType),
    currency: money.currency,
    price: money.price,
    previous: money.previous,
    change: money.change,
    changePct: money.changePct,
  };
}

/** Live prices for the user's saved symbols. Failures are omitted, not fatal. */
export async function fetchQuotes(symbols) {
  const unique = [...new Set((symbols || []).map((s) => String(s).toUpperCase()).filter(Boolean))];
  const quotes = new Map();
  const results = await Promise.allSettled(unique.map((symbol) => fetchOneQuote(symbol)));
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') quotes.set(unique[index], result.value);
  });
  return quotes;
}

export async function fetchQuote(symbol) {
  const quotes = await fetchQuotes([symbol]);
  return quotes.get(String(symbol || '').toUpperCase()) || null;
}

function fail(statusCode, code) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/**
 * Daily bars for the chart popup. `days` is 30, 90, or 365.
 * TASE prices arrive in agorot (ILA) and are scaled to shekels, matching live quotes.
 */
export async function fetchQuoteHistory(symbol, days = 90) {
  const clean = cleanSymbol(symbol);
  if (!clean) throw fail(400, 'invalid_symbol');

  const span = [30, 90, 365].includes(Number(days)) ? Number(days) : 90;
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - span * 86400;
  const url = `${CHART_URL}/${encodeURIComponent(clean)}?interval=1d&period1=${period1}&period2=${period2}`;
  const payload = await getJson(url);
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const bars = result?.indicators?.quote?.[0] || {};
  const closes = bars.close || [];
  if (!result || !timestamps.length) throw fail(502, 'quote_empty');

  const scale = String(result.meta?.currency || '').toUpperCase() === 'ILA' ? 0.01 : 1;
  const points = [];
  const count = Math.min(timestamps.length, closes.length);

  for (let index = 0; index < count; index += 1) {
    const close = Number(closes[index]);
    if (!Number.isFinite(close)) continue;
    const open = Number(bars.open?.[index]);
    const high = Number(bars.high?.[index]);
    const low = Number(bars.low?.[index]);
    const volume = Number(bars.volume?.[index]);
    points.push({
      date: new Date(timestamps[index] * 1000).toISOString().slice(0, 10),
      price: round(close * scale, 4),
      open: Number.isFinite(open) ? round(open * scale, 4) : null,
      high: Number.isFinite(high) ? round(high * scale, 4) : null,
      low: Number.isFinite(low) ? round(low * scale, 4) : null,
      volume: Number.isFinite(volume) ? Math.round(volume) : null,
    });
  }

  if (!points.length) throw fail(502, 'quote_empty');

  const first = points[0].price;
  const last = points.at(-1).price;
  const change = last - first;
  const highs = points.map((point) => point.high ?? point.price);
  const lows = points.map((point) => point.low ?? point.price);

  return {
    symbol: result.meta?.symbol || clean,
    currency: normalizeCurrency(result.meta?.currency),
    points,
    first,
    last,
    change: round(change, 4),
    changePct: first ? round((change / first) * 100, 2) : null,
    low: round(Math.min(...lows), 4),
    high: round(Math.max(...highs), 4),
  };
}
