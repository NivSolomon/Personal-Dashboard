/** ECB currencies exposed by Frankfurter, plus the home-currency defaults. */

export const FX_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'ILS',
  'CHF',
  'JPY',
  'CAD',
  'AUD',
  'CNY',
  'HKD',
  'SGD',
  'INR',
  'KRW',
  'BRL',
  'MXN',
  'ZAR',
  'TRY',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'HUF',
  'RON',
  'BGN',
  'THB',
  'IDR',
  'MYR',
  'PHP',
  'NZD',
  'ISK',
];

export const FX_CURRENCY_SET = new Set(FX_CURRENCIES);
export const DEFAULT_FX_BASE = 'ILS';
export const DEFAULT_FX_QUOTES = ['USD'];
export const MAX_FX_QUOTES = 8;

export function normalizeFxCode(value) {
  const code = String(value || '')
    .trim()
    .toUpperCase();
  const iso = code === 'NIS' || code === 'ILA' ? 'ILS' : code;
  return FX_CURRENCY_SET.has(iso) ? iso : null;
}

export function normalizeFxSettings(raw) {
  const base = normalizeFxCode(raw?.base) || DEFAULT_FX_BASE;
  const incoming = Array.isArray(raw?.quotes) ? raw.quotes : DEFAULT_FX_QUOTES;
  const seen = new Set();
  const quotes = [];
  for (const item of incoming) {
    const code = normalizeFxCode(item);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    quotes.push(code);
    if (quotes.length >= MAX_FX_QUOTES) break;
  }
  return { base, quotes };
}

export function parseFxPatch(body = {}) {
  if (body.fx === undefined && body.base === undefined && body.quotes === undefined) {
    return { skip: true };
  }
  const raw = body.fx && typeof body.fx === 'object' ? body.fx : body;
  const parsed = normalizeFxSettings(raw);
  if (Array.isArray(raw.quotes) && raw.quotes.length > MAX_FX_QUOTES) {
    return { error: 'fx_full' };
  }
  return { value: parsed };
}
