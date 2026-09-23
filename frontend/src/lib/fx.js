/** Keep in sync with backend/src/lib/fx.js. */

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

export const MAX_FX_QUOTES = 8;
export const FX_PINNED = ['ILS', 'USD', 'EUR', 'GBP'];

/** NIS first so it is visible without scrolling. */
export function fxSelectCodes() {
  const rest = FX_CURRENCIES.filter((code) => !FX_PINNED.includes(code));
  return [...FX_PINNED, ...rest];
}

/** ISO is ILS; the board and Israeli users call it NIS. */
export function displayFxCode(code) {
  const key = String(code || '').trim().toUpperCase();
  if (key === 'ILS' || key === 'ILA' || key === 'NIS') return 'NIS';
  return key || '';
}

export function currencyName(code, locale) {
  const iso = String(code || '').trim().toUpperCase();
  const key = iso === 'NIS' || iso === 'ILA' ? 'ILS' : iso;
  if (key === 'ILS') {
    return String(locale).startsWith('he') ? 'שקל חדש · NIS' : 'Israeli shekel · NIS';
  }
  try {
    return new Intl.DisplayNames([locale], { type: 'currency' }).of(key) || key;
  } catch {
    return key;
  }
}

export function currencySymbol(code, locale) {
  try {
    const part = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((item) => item.type === 'currency');
    return part?.value || code;
  } catch {
    return code;
  }
}
