import { fetchQuotes } from '../integrations/quotes.js';
import { withWidgetEnabled } from '../lib/widgets.js';
import {
  MAX_ALERTS_PER_ITEM,
  MAX_WATCHLIST_ITEMS,
  cleanSymbol,
  evaluateWatchlist,
  hasEnabledAlerts,
  markAlertsSeen,
  newWatchlistId,
  normalizeCurrency,
  normalizeWatchlist,
  unseenAlerts,
} from '../lib/watchlist.js';
import { getUser, updateSettings } from '../store/db.js';

function emptyPayload() {
  return { items: [], fired: [] };
}

function fail(code, statusCode = 400) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

async function freshUser(user) {
  return (await getUser(user.id)) || user;
}

async function writeWatchlist(user, next, { enableIfFirst = false } = {}) {
  const current = normalizeWatchlist(user.settings?.watchlist);
  const watchlist = normalizeWatchlist(next);
  const patch = { watchlist };
  if (enableIfFirst && current.items.length === 0 && watchlist.items.length > 0) {
    patch.layout = withWidgetEnabled(user.settings?.layout, 'watchlist', true);
  }
  return updateSettings(user.id, patch);
}

/**
 * Quotes plus the current alert state. When `persist` is true, a crossing is
 * written back so the next visit (and the morning briefing) still know about it.
 */
export async function loadWatchlistForUser(user, { persist = false } = {}) {
  const watchlist = normalizeWatchlist(user.settings?.watchlist);
  if (watchlist.items.length === 0) return emptyPayload();

  const quotes = await fetchQuotes(watchlist.items.map((item) => item.symbol));
  const evaluated = evaluateWatchlist(watchlist, quotes);

  if (persist && evaluated.changed) {
    await updateSettings(user.id, { watchlist: evaluated.watchlist });
  }

  const items = evaluated.watchlist.items.map((item) => {
    const quote = quotes.get(item.symbol) || null;
    return {
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      kind: item.kind,
      currency: quote?.currency || item.currency,
      alerts: item.alerts,
      quote,
    };
  });

  return {
    items,
    fired: unseenAlerts(evaluated.watchlist).map((hit) => {
      const quote = quotes.get(hit.symbol);
      const item = items.find((entry) => entry.id === hit.itemId);
      return { ...hit, currency: quote?.currency || item?.currency || hit.currency };
    }),
    changed: evaluated.changed,
  };
}

export function userNeedsWatchlistCheck(user) {
  return hasEnabledAlerts(normalizeWatchlist(user.settings?.watchlist));
}

export async function addWatchlistItem(user, body) {
  user = await freshUser(user);
  const current = normalizeWatchlist(user.settings?.watchlist);
  const symbol = cleanSymbol(body?.symbol);
  if (!symbol) fail('invalid_symbol');
  if (current.items.some((item) => item.symbol === symbol)) fail('duplicate_symbol', 409);
  if (current.items.length >= MAX_WATCHLIST_ITEMS) fail('watchlist_full');

  const quotes = await fetchQuotes([symbol]);
  const quote = quotes.get(symbol);
  if (!quote) fail('unknown_symbol', 404);
  const currency = normalizeCurrency(quote.currency);
  if (!currency) fail('unsupported_currency');

  const item = {
    id: newWatchlistId(),
    symbol,
    name: String(body?.name || quote.name || symbol).trim().slice(0, 80),
    kind: body?.kind === 'fund' || body?.kind === 'stock' ? body.kind : quote.kind,
    currency,
    alerts: [],
  };

  if (body?.alert) {
    const op = body.alert.op;
    const price = Number(body.alert.price);
    if ((op !== 'above' && op !== 'below') || !Number.isFinite(price) || price <= 0) {
      fail('invalid_price');
    }
    item.alerts.push({
      id: newWatchlistId(),
      op,
      price,
      enabled: true,
    });
  }

  return writeWatchlist(user, { items: [...current.items, item] }, { enableIfFirst: true });
}

export async function removeWatchlistItem(user, itemId) {
  user = await freshUser(user);
  const current = normalizeWatchlist(user.settings?.watchlist);
  const items = current.items.filter((item) => item.id !== itemId);
  if (items.length === current.items.length) fail('not_found', 404);
  return writeWatchlist(user, { items });
}

export async function addWatchlistAlert(user, itemId, body) {
  user = await freshUser(user);
  const current = normalizeWatchlist(user.settings?.watchlist);
  const item = current.items.find((entry) => entry.id === itemId);
  if (!item) fail('not_found', 404);
  if (item.alerts.length >= MAX_ALERTS_PER_ITEM) fail('alerts_full');
  const op = body?.op;
  const price = Number(body?.price);
  if ((op !== 'above' && op !== 'below') || !Number.isFinite(price) || price <= 0) {
    fail('invalid_price');
  }
  item.alerts.push({
    id: newWatchlistId(),
    op,
    price,
    enabled: true,
  });
  return writeWatchlist(user, current);
}

export async function removeWatchlistAlert(user, itemId, alertId) {
  user = await freshUser(user);
  const current = normalizeWatchlist(user.settings?.watchlist);
  const item = current.items.find((entry) => entry.id === itemId);
  if (!item) fail('not_found', 404);
  const alerts = item.alerts.filter((alert) => alert.id !== alertId);
  if (alerts.length === item.alerts.length) fail('not_found', 404);
  item.alerts = alerts;
  return writeWatchlist(user, current);
}

export async function acknowledgeWatchlistAlerts(user, alertIds) {
  user = await freshUser(user);
  const current = normalizeWatchlist(user.settings?.watchlist);
  return writeWatchlist(user, markAlertsSeen(current, alertIds));
}

