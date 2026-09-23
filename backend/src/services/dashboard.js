import { config, isStravaConfigured, isWeatherConfigured } from '../config.js';
import { createTtlCache } from '../lib/ttlCache.js';
import { isWidgetEnabled } from '../lib/widgets.js';
import { normalizeLanguage } from '../lib/validate.js';
import { getNotionToken, getUser } from '../store/db.js';
import { getAuthedClient } from '../google/client.js';
import { fetchTodayEvents } from '../google/calendar.js';
import { fetchOpenTasks } from '../google/tasks.js';
import { fetchImportantEmails, fetchShippingEmails } from '../google/gmail.js';
import { fetchWeather } from '../integrations/weather.js';
import { fetchFxQuotes } from '../integrations/fx.js';
import { normalizeFxSettings } from '../lib/fx.js';
import { fetchNotionActivity, fetchNotionDeadlines } from '../integrations/notion.js';
import { fetchWeeklyProgress } from '../integrations/strava.js';
import { geocodeAddress, estimateDrive } from '../integrations/waze.js';
import { loadWatchlistForUser } from './watchlist.js';
import { extractPackages } from '../ai/packages.js';
import { nutritionSummary } from '../lib/nutrition.js';
import { buildDayPlan } from '../lib/dayplan.js';

/** Shape returned even when every source is unconfigured or failing. */
const EMPTY = {
  events: [],
  tasks: [],
  emails: [],
  parcels: [],
  notion: [],
  weather: null,
  activity: null,
  fx: { base: 'ILS', asOf: null, quotes: [] },
  watchlist: { items: [], fired: [] },
  nutrition: null,
  commute: null,
  dayPlan: null,
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

const IL_BIAS = { lat: 31.768, lon: 35.214 };

/** Drive minutes between saved home and work. Failures stay null, never throw. */
async function estimateCommute(user, logger) {
  const home = String(user.settings?.places?.home || '').trim();
  const work = String(user.settings?.places?.work || '').trim();
  if (!home || !work) return null;
  const bias = weatherCoordsFor(user) || IL_BIAS;
  try {
    const [homePt, workPt] = await Promise.all([
      geocodeAddress(home, bias),
      geocodeAddress(work, bias),
    ]);
    if (!homePt || !workPt) return null;
    const [toWork, toHome] = await Promise.all([
      estimateDrive(homePt, workPt),
      estimateDrive(workPt, homePt),
    ]);
    return {
      toWorkMinutes: toWork?.minutes ?? null,
      toHomeMinutes: toHome?.minutes ?? null,
    };
  } catch (error) {
    logger?.warn({ err: error }, 'commute estimate failed');
    return null;
  }
}

const cache = createTtlCache({ ttlMs: config.cache.dashboardTtlMs });

/**
 * Mail, calendar and tasks are not translated. Keep the Google snapshot on a
 * language switch so the board does not wait on Gmail or the parcel model.
 */
function reuseDashboardForLanguage(user, previous) {
  const layout = user.settings?.layout;
  const wants = (id) => isWidgetEnabled(layout, id);
  return {
    ...previous,
    nutrition: wants('nutrition') ? nutritionSummary(user) : previous.nutrition,
    settings: user.settings,
    timeZone: user.settings.timeZone,
    attempted: previous.attempted || 1,
  };
}

/** Finish a fast first paint by filling Gmail tiles that were skipped. */
async function completeDashboardDeferred(user, previous, { logger } = {}) {
  const layout = user.settings?.layout;
  const wants = (id) => isWidgetEnabled(layout, id);
  const timeZone = user.settings.timeZone;
  const errors = (previous.errors || []).filter(
    (error) => error.source !== 'parcels' && error.source !== 'emails',
  );
  const next = {
    ...previous,
    partial: false,
    settings: user.settings,
    timeZone,
    errors,
    nutrition: wants('nutrition') ? nutritionSummary(user) : previous.nutrition,
  };

  if (!wants('emails')) next.emails = [];
  if (!wants('parcels')) next.parcels = [];
  if (!wants('emails') && !wants('parcels')) return next;

  try {
    const auth = await getAuthedClient(user.id);
    const jobs = [];
    if (wants('emails')) jobs.push(['emails', () => fetchImportantEmails(auth)]);
    if (wants('parcels')) {
      jobs.push([
        'parcels',
        async () => {
          const shipping = await fetchShippingEmails(auth);
          return extractPackages({
            emails: shipping,
            language: user.settings.language,
            timeZone,
            logger,
          });
        },
      ]);
    }
    const settled = await Promise.allSettled(jobs.map(([, run]) => run()));
    settled.forEach((result, index) => {
      const name = jobs[index][0];
      if (result.status === 'fulfilled') {
        next[name] = result.value;
        return;
      }
      next.errors.push({
        source: name,
        code: isScopeError(result.reason) ? 'insufficient_scope' : 'unavailable',
      });
      logger?.warn({ err: result.reason, source: name }, 'dashboard source failed');
    });
  } catch (reason) {
    logger?.warn({ err: reason }, 'dashboard deferred sources failed');
  }

  return next;
}

/**
 * One dashboard render costs ~20 Google API calls, most of them the per-message
 * Gmail lookups, so repeat loads inside the TTL window are served from memory.
 */
async function fetchDashboardData(userId, { logger, force = false, previous, fast = false } = {}) {
  const user = await getUser(userId);
  if (!user) throw new Error(`Unknown user ${userId}`);

  if (
    previous &&
    !force &&
    previous.settings?.language &&
    normalizeLanguage(previous.settings.language) !== normalizeLanguage(user.settings.language)
  ) {
    return reuseDashboardForLanguage(user, previous);
  }

  if (!fast && !force && previous?.partial) {
    return completeDashboardDeferred(user, previous, { logger });
  }

  const now = new Date();
  const { timeZone } = user.settings;
  const layout = user.settings?.layout;
  const wants = (id) => isWidgetEnabled(layout, id);
  const fetchers = {};

  // Skip Google entirely when this user hid every Google tile — those calls are
  // the expensive part of a page load.
  const needsGoogle =
    wants('timeline') ||
    wants('ask') ||
    wants('tasks') ||
    wants('emails') ||
    wants('parcels') ||
    wants('tip');
  if (needsGoogle) {
    const auth = await getAuthedClient(userId);
    if (wants('timeline') || wants('tip') || wants('ask')) {
      fetchers.events = () => fetchTodayEvents(auth, { timeZone, now });
    }
    if (wants('tasks') || wants('tip') || wants('ask')) fetchers.tasks = () => fetchOpenTasks(auth);
    if (wants('emails') && !fast) fetchers.emails = () => fetchImportantEmails(auth);
    if (wants('parcels') && !fast) {
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

  if (wants('usd')) fetchers.fx = () => fetchFxQuotes(normalizeFxSettings(user.settings?.fx));

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

  if (wants('timeline')) {
    fetchers.commute = () => estimateCommute(user, logger);
  }

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

  if (fast && previous) {
    if (wants('parcels') && previous.parcels?.length) data.parcels = previous.parcels;
    if (wants('emails') && previous.emails?.length) data.emails = previous.emails;
  }

  if (wants('timeline')) {
    data.dayPlan = buildDayPlan({
      events: data.events || [],
      weather: data.weather,
      commute: data.commute,
      timeZone,
    });
  }

  return {
    ...data,
    errors,
    attempted: names.length,
    partial: Boolean(fast && (wants('parcels') || wants('emails'))),
    settings: user.settings,
    fetchedAt: now.toISOString(),
    timeZone,
  };
}

/**
 * Everything the dashboard renders, fetched in parallel and cached briefly.
 *
 * The snapshot is one copy per user, not one per language. Language only affects
 * LLM copy (parcel status); source items stay in their original language.
 *
 * One failing Google API (a disabled API, a scope the user declined) should not
 * blank the whole dashboard, so failures are collected per source and returned
 * alongside whatever did load.
 */
export async function collectDashboardData(userId, { logger, force = false, fast = false } = {}) {
  const user = await getUser(userId);
  if (!user) throw new Error(`Unknown user ${userId}`);
  const language = normalizeLanguage(user.settings.language);

  const { value, cached } = await cache.wrap(
    `dashboard:${userId}`,
    () =>
      fetchDashboardData(userId, {
        logger,
        force,
        fast,
        previous: force ? undefined : cache.read(`dashboard:${userId}`),
      }),
    {
      force,
      isFresh: (result) => {
        if (normalizeLanguage(result.settings?.language) !== language) return false;
        if (!fast && result.partial) return false;
        return true;
      },
      // A total wipeout is usually transient (network, expired token); caching it
      // would keep the dashboard empty for the rest of the TTL window.
      shouldCache: (result) => result.errors.length < Math.max(result.attempted, 1),
    },
  );

  if (cached) logger?.debug({ userId }, 'dashboard served from cache');
  return { ...value, cached };
}

export function invalidateDashboardCache(userId) {
  cache.invalidate(`dashboard:${userId}`);
}
