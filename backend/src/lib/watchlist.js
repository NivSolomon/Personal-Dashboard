import { randomUUID } from 'node:crypto';

export const MAX_WATCHLIST_ITEMS = 20;
export const MAX_ALERTS_PER_ITEM = 4;

const SYMBOL = /^[A-Za-z0-9.=^-]{1,20}$/;
const KINDS = new Set(['stock', 'fund']);
const OPS = new Set(['above', 'below']);

/** Quotes and alerts are USD or Israeli shekel only. */
export function normalizeCurrency(code) {
  const key = String(code || '').trim().toUpperCase();
  if (key === 'USD') return 'USD';
  if (key === 'ILS' || key === 'ILA' || key === 'NIS') return 'ILS';
  return null;
}

export function isAllowedCurrency(code) {
  return Boolean(normalizeCurrency(code));
}

/** What we print next to a price: USD or NIS. */
export function displayCurrency(code) {
  const n = normalizeCurrency(code);
  if (n === 'USD') return 'USD';
  if (n === 'ILS') return 'NIS';
  return null;
}

export function newWatchlistId() {
  return randomUUID();
}

export function kindFromQuoteType(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'ETF' || t === 'MUTUALFUND' || t === 'INDEX' || t.includes('FUND')) return 'fund';
  return 'stock';
}

export function cleanSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  return SYMBOL.test(symbol) ? symbol : null;
}

function cleanPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1e9) return null;
  return Math.round(n * 10000) / 10000;
}

function cleanId(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 80 ? value : null;
}

function normalizeAlert(raw) {
  const op = OPS.has(raw?.op) ? raw.op : null;
  const price = cleanPrice(raw?.price);
  if (!op || price == null) return null;
  return {
    id: cleanId(raw.id) || newWatchlistId(),
    op,
    price,
    enabled: raw.enabled !== false,
    armed: raw.armed !== false,
    triggered: Boolean(raw.triggered),
    lastPrice: Number.isFinite(Number(raw.lastPrice)) ? Number(raw.lastPrice) : null,
    firedAt: raw.firedAt || null,
    seenAt: raw.seenAt || null,
  };
}

export function normalizeWatchlist(saved) {
  const incoming = Array.isArray(saved?.items) ? saved.items : [];
  const seen = new Set();
  const items = [];

  for (const raw of incoming) {
    if (items.length >= MAX_WATCHLIST_ITEMS) break;
    const symbol = cleanSymbol(raw?.symbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);

    const alerts = [];
    const alertIds = new Set();
    for (const entry of Array.isArray(raw?.alerts) ? raw.alerts : []) {
      if (alerts.length >= MAX_ALERTS_PER_ITEM) break;
      const alert = normalizeAlert(entry);
      if (!alert || alertIds.has(alert.id)) continue;
      alertIds.add(alert.id);
      alerts.push(alert);
    }

    items.push({
      id: cleanId(raw.id) || newWatchlistId(),
      symbol,
      name: String(raw?.name || symbol).trim().slice(0, 80) || symbol,
      kind: KINDS.has(raw?.kind) ? raw.kind : 'stock',
      currency: normalizeCurrency(raw?.currency) || null,
      alerts,
    });
  }

  return { items };
}

export function alertBreached(alert, price) {
  if (alert.op === 'above') return price >= alert.price;
  return price <= alert.price;
}

/**
 * Fire once when the price crosses the line, then re-arm after it returns.
 * Opening the dashboard with a price already past the line counts as a first cross.
 */
export function evaluateWatchlist(watchlist, quotesBySymbol) {
  const fired = [];
  let changed = false;
  const now = new Date().toISOString();

  const items = (watchlist.items || []).map((item) => {
    const quote = quotesBySymbol.get(item.symbol);
    if (!quote || quote.price == null) return item;

    const alerts = item.alerts.map((alert) => {
      if (!alert.enabled) return alert;
      const breached = alertBreached(alert, quote.price);
      const next = { ...alert, lastPrice: quote.price };

      if (breached) {
        next.triggered = true;
        if (alert.armed) {
          next.armed = false;
          next.firedAt = now;
          next.seenAt = null;
          fired.push({
            itemId: item.id,
            alertId: next.id,
            symbol: item.symbol,
            name: item.name,
            kind: item.kind,
            op: next.op,
            target: next.price,
            price: quote.price,
            currency: quote.currency || item.currency,
            firedAt: now,
          });
        }
      } else {
        next.triggered = false;
        next.armed = true;
      }

      if (
        next.triggered !== alert.triggered ||
        next.armed !== alert.armed ||
        next.firedAt !== alert.firedAt ||
        next.seenAt !== alert.seenAt ||
        next.lastPrice !== alert.lastPrice
      ) {
        changed = true;
      }
      return next;
    });

    return { ...item, alerts };
  });

  return { watchlist: { items }, fired, changed };
}

export function unseenAlerts(watchlist) {
  const out = [];
  for (const item of watchlist.items || []) {
    for (const alert of item.alerts || []) {
      if (alert.enabled && alert.triggered && alert.firedAt && !alert.seenAt) {
        out.push({
          itemId: item.id,
          alertId: alert.id,
          symbol: item.symbol,
          name: item.name,
          kind: item.kind,
          op: alert.op,
          target: alert.price,
          price: alert.lastPrice,
          currency: item.currency || null,
          firedAt: alert.firedAt,
        });
      }
    }
  }
  return out;
}

export function markAlertsSeen(watchlist, alertIds) {
  const ids = new Set((alertIds || []).filter(Boolean));
  if (ids.size === 0) return watchlist;
  return {
    items: (watchlist.items || []).map((item) => ({
      ...item,
      alerts: (item.alerts || []).map((alert) =>
        ids.has(alert.id) ? { ...alert, seenAt: new Date().toISOString() } : alert,
      ),
    })),
  };
}

export function hasEnabledAlerts(watchlist) {
  return (watchlist?.items || []).some((item) =>
    (item.alerts || []).some((alert) => alert.enabled !== false),
  );
}
