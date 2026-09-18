import { config, isStravaConfigured, isWeatherConfigured } from '../config.js';
import { createTtlCache } from '../lib/ttlCache.js';
import { isWidgetEnabled } from '../lib/widgets.js';
import { getNotionToken, getUser } from '../store/db.js';
import { getAuthedClient } from '../google/client.js';
import { fetchTodayEvents } from '../google/calendar.js';
import { fetchOpenTasks } from '../google/tasks.js';
import { fetchImportantEmails, fetchShippingEmails } from '../google/gmail.js';
import { fetchWeather } from '../integrations/weather.js';
import { fetchUsdIls } from '../integrations/fx.js';
import { fetchNotionActivity, fetchNotionDeadlines } from '../integrations/notion.js';
import { fetchWeeklyProgress } from '../integrations/strava.js';
import { loadWatchlistForUser } from './watchlist.js';
import { extractPackages } from '../ai/packages.js';
import { nutritionSummary } from '../lib/nutrition.js';

/** Shape returned even when every source is unconfigured or failing. */
const EMPTY = {
  events: [],
  tasks: [],
  emails: [],
  parcels: [],
  notion: [],
  weather: null,
  activity: null,
  fx: null,
  watchlist: { items: [], fired: [] },
  nutrition: null,
};

/**
 * Weekly activity can come from a user's Notion workout log or from their Strava
 * account. Notion wins when both are linked: it costs nothing and carries no
 * restriction on passing the data to a language model.
 */
function activityFetcher(userId, { notionToken, user }) {
  const selection = user.notion?.workouts;
  if (notionToken && selection?.dataSourceId) {
    return () =>
      fetchNotionActivity({
        token: notionToken,
        selection,
        timeZone: user.settings.timeZone,
        weeklyGoalKm: user.settings.weeklyGoalKm,
      });
  }
  if (isStravaConfigured() && user.connected.strava) {
    return () =>
      fetchWeeklyProgress(userId, {
        timeZone: user.settings.timeZone,
        weeklyGoalKm: user.settings.weeklyGoalKm,
      });
  }
  return null;
}

/**
 * A source whose scope the stored token predates fails with 403 and an
 * `insufficient` reason. That is fixed by consenting again, not by retrying, so it
 * is flagged for the UI to offer a reconnect link instead of a failure to load.
 */
function isScopeError(reason) {
  if (reason?.response?.status !== 403 && reason?.code !== 403) return false;
  return /insufficient/i.test(JSON.stringify(reason?.response?.data ?? reason?.message ?? ''));
}

/** User pin first; otherwise WEATHER_LAT/LON so the header chip still has data. */
function weatherCoordsFor(user) {
  const pinnedLat = user.settings?.weather?.lat;
  const pinnedLon = user.settings?.weather?.lon;
  if (pinnedLat != null && pinnedLon != null) {
    const lat = Number(pinnedLat);
    const lon = Number(pinnedLon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  const lat = Number(config.weather.defaultLat);
  const lon = Number(config.weather.defaultLon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  return null;
}

const cache = createTtlCache({ ttlMs: config.cache.dashboardTtlMs });

/**
 * One dashboard render costs ~20 Google API calls, most of them the per-message
 * Gmail lookups, so repeat loads inside the TTL window are served from memory.
 */
async function fetchDashboardData(userId, { logger } = {}) {
  const user = await getUser(userId);
  if (!user) throw new Error(`Unknown user ${userId}`);

  const now = new Date();
  const { timeZone } = user.settings;
  const layout = user.settings?.layout;
  const wants = (id) => isWidgetEnabled(layout, id);
  const fetchers = {};

  // Skip Google entirely when this user hid every Google tile — those calls are
  // the expensive part of a page load.
  const needsGoogle =
    wants('schedule') || wants('tasks') || wants('emails') || wants('parcels') || wants('tip');
  if (needsGoogle) {
    const auth = await getAuthedClient(userId);
    if (wants('schedule') || wants('tip')) {
      fetchers.events = () => fetchTodayEvents(auth, { timeZone, now });
    }
    if (wants('tasks') || wants('tip')) fetchers.tasks = () => fetchOpenTasks(auth);
    if (wants('emails')) fetchers.emails = () => fetchImportantEmails(auth);
    if (wants('parcels')) {
      fetchers.parcels = async () => {
        const shipping = await fetchShippingEmails(auth);
        return extractPackages({
          emails: shipping,
          language: user.settings.language,
          timeZone,
          logger,
        });
      };
    }
  }

  const coords = weatherCoordsFor(user);
  // Header chip uses this even when the weather tile is hidden.
  if (isWeatherConfigured() && coords) {
    fetchers.weather = () => fetchWeather({ ...coords, timeZone });
  }

  if (wants('usd')) fetchers.fx = () => fetchUsdIls();

  // Quotes feed the header chip as well as the tile, so they load whenever the
  // person has saved symbols — even if the watchlist card is currently hidden.
  if ((user.settings?.watchlist?.items || []).length > 0) {
    fetchers.watchlist = () => loadWatchlistForUser(user, { persist: true });
  }

  const notionToken = user.connected.notion ? await getNotionToken(userId) : null;
  if (wants('notion') && notionToken && user.notion?.deadlines?.dataSourceId) {
    fetchers.notion = () =>
      fetchNotionDeadlines({ token: notionToken, selection: user.notion.deadlines, timeZone });
  }

  const activity = wants('activity') ? activityFetcher(userId, { notionToken, user }) : null;
  if (activity) fetchers.activity = activity;

  const names = Object.keys(fetchers);
  const settled = await Promise.allSettled(names.map((name) => fetchers[name]()));

  const data = { ...EMPTY };
  const errors = [];

  settled.forEach((result, index) => {
    const name = names[index];
    if (result.status === 'fulfilled') {
      data[name] = result.value;
      return;
    }
    // Not linked yet is a state the card handles itself, not a failure to report.
    if (result.reason?.code === 'strava_not_connected') return;

    const message = result.reason?.message || String(result.reason);
    errors.push({
      source: name,
      code: isScopeError(result.reason) ? 'insufficient_scope' : 'unavailable',
    });
    logger?.warn({ err: result.reason, source: name, message }, 'dashboard source failed');
  });

  if (wants('nutrition')) {
    data.nutrition = nutritionSummary(user);
  }

  return {
    ...data,
    errors,
    attempted: names.length,
    settings: user.settings,
    fetchedAt: now.toISOString(),
    timeZone,
  };
}

/**
 * Everything the dashboard renders, fetched in parallel and cached briefly.
 *
 * One failing Google API (a disabled API, a scope the user declined) should not
 * blank the whole dashboard, so failures are collected per source and returned
 * alongside whatever did load.
 */
export async function collectDashboardData(userId, { logger, force = false } = {}) {
  const { value, cached } = await cache.wrap(
    `dashboard:${userId}`,
    () => fetchDashboardData(userId, { logger }),
    {
      force,
      // A total wipeout is usually transient (network, expired token); caching it
      // would keep the dashboard empty for the rest of the TTL window.
      shouldCache: (result) => result.errors.length < result.attempted,
    },
  );

  if (cached) logger?.debug({ userId }, 'dashboard served from cache');
  return { ...value, cached };
}

export function invalidateDashboardCache(userId) {
  cache.invalidate(`dashboard:${userId}`);
}
