import { kindFromQuoteType, normalizeCurrency } from '../lib/watchlist.js';

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
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
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
