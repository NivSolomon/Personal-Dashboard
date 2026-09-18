import { config, isNotionConfigured, isStravaConfigured, isWeatherConfigured } from '../config.js';
import {
  parseEventBody,
  parseTaskBody,
  parseCoordinates,
  LANGUAGES,
  GOAL_MAX_KM,
  GOAL_MAX_KCAL,
} from '../lib/validate.js';
import { nutritionRoutes } from './nutrition.js';
import { readSession } from '../lib/session.js';
import { normalizeLayout } from '../lib/widgets.js';
import {
  completeOnboarding,
  getNotionToken,
  getUser,
  saveCustomPrompt,
  saveNotionSelection,
  touchLastSeen,
  updateSettings,
} from '../store/db.js';
import {
  applyOnboardingLayout,
  parseCustomPrompt,
  parseOnboarding,
  suggestedCustomPrompt,
  summaryHourFromRoutine,
} from '../lib/onboarding.js';
import { MissingAuthError, getAuthedClient, isGoogleScopeError } from '../google/client.js';
import { collectDashboardData, invalidateDashboardCache } from '../services/dashboard.js';
import { getOrBuildSummary } from '../services/morningSummary.js';
import { describeSelection, listNotionDataSources } from '../integrations/notionOAuth.js';
import { completeTask, createTask, deleteTask, reopenTask } from '../google/tasks.js';
import { createCalendarEvent, deleteCalendarEvent } from '../google/calendar.js';
import { searchQuotes, fetchQuote } from '../integrations/quotes.js';
import { normalizeCurrency } from '../lib/watchlist.js';
import { suggestPlaces } from '../integrations/places.js';
import { estimateArrivals } from '../integrations/waze.js';
import {
  acknowledgeWatchlistAlerts,
  addWatchlistAlert,
  addWatchlistItem,
  loadWatchlistForUser,
  removeWatchlistAlert,
  removeWatchlistItem,
} from '../services/watchlist.js';

/** What the deployment can offer at all, before any per-user consent. */
function offered() {
  return {
    weather: isWeatherConfigured(),
    notion: isNotionConfigured(),
    strava: isStravaConfigured(),
  };
}

/** The shape both /api/me and /api/settings return, so the UI has one contract. */
function accountPayload(user) {
  return {
    user: { id: user.id, email: user.email, name: user.name, picture: user.picture },
    timeZone: user.settings.timeZone,
    hasCompletedOnboarding: Boolean(user.hasCompletedOnboarding),
    preferences: {
      primaryFocus: user.preferences?.primaryFocus || null,
      hobbies: Array.isArray(user.preferences?.hobbies) ? user.preferences.hobbies : [],
      dailyRoutine: user.preferences?.dailyRoutine || null,
    },
    customAIPrompt: user.customAIPrompt || '',
    settings: {
      ...user.settings,
      layout: normalizeLayout(user.settings?.layout),
    },
    offered: offered(),
    connected: user.connected,
    notion: {
      workspaceName: user.notion?.workspaceName || null,
      deadlines: user.notion?.deadlines || {},
      workouts: user.notion?.workouts || {},
    },
  };
}

export async function apiRoutes(app) {
  app.decorateRequest('currentUser', null);

  app.addHook('preHandler', async (request, reply) => {
    const userId = readSession(request);
    const user = userId ? await getUser(userId) : null;
    if (!user) {
      return reply.code(401).send({ error: 'not_authenticated', loginUrl: '/auth/google' });
    }
    request.currentUser = user;
  });

  // Google can revoke a refresh token at any time; surface that as "log in again".
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof MissingAuthError || error?.response?.status === 401) {
      return reply.code(401).send({ error: 'reauth_required', loginUrl: '/auth/google' });
    }
    request.log.error({ err: error }, 'api request failed');
    return reply.code(error.statusCode || 500).send({ error: 'internal_error' });
  });

  app.get('/api/me', async (request) => {
    void touchLastSeen(request.currentUser.id);
    return accountPayload(request.currentUser);
  });

  app.get('/api/dashboard', async (request) =>
    collectDashboardData(request.currentUser.id, { logger: request.log }),
  );

  app.post('/api/events', async (request, reply) => {
    const parsed = parseEventBody(request.body);
    if (parsed.error) return reply.code(400).send({ error: parsed.error });
    const { title, date, allDay, startTime, endTime, location, description } = parsed.value;
    const timeZone = request.currentUser.settings.timeZone;

    try {
      const auth = await getAuthedClient(request.currentUser.id);
      const event = await createCalendarEvent(auth, {
        title,
        date,
        startTime,
        endTime,
        allDay,
        location,
        description,
        timeZone,
      });
      invalidateDashboardCache(request.currentUser.id);
      return event;
    } catch (error) {
      if (isGoogleScopeError(error)) {
        return reply.code(403).send({ error: 'insufficient_scope' });
      }
      throw error;
    }
  });

  app.delete('/api/events/:eventId', async (request, reply) => {
    const eventId = String(request.params.eventId || '');
    if (!eventId) return reply.code(400).send({ error: 'invalid_event' });

    try {
      const auth = await getAuthedClient(request.currentUser.id);
      await deleteCalendarEvent(auth, eventId);
      invalidateDashboardCache(request.currentUser.id);
      return { ok: true };
    } catch (error) {
      if (isGoogleScopeError(error)) {
        return reply.code(403).send({ error: 'insufficient_scope' });
      }
      throw error;
    }
  });

  app.post('/api/tasks', async (request, reply) => {
    const parsed = parseTaskBody(request.body);
    if (parsed.error) return reply.code(400).send({ error: parsed.error });
    const { title, due, time, location } = parsed.value;

    let notes = null;
    const bits = [];
    if (time) bits.push(`שעה: ${time}`);
    if (location) bits.push(location);
    if (bits.length) notes = bits.join('\n');

    try {
      const auth = await getAuthedClient(request.currentUser.id);
      const task = await createTask(auth, { title, due, notes });
      invalidateDashboardCache(request.currentUser.id);
      return task;
    } catch (error) {
      if (isGoogleScopeError(error)) {
        return reply.code(403).send({ error: 'insufficient_scope' });
      }
      throw error;
    }
  });

  app.post('/api/tasks/:listId/:taskId/complete', async (request, reply) => {
    const listId = String(request.params.listId || '');
    const taskId = String(request.params.taskId || '');
    if (!listId || !taskId) return reply.code(400).send({ error: 'invalid_task' });

    try {
      const auth = await getAuthedClient(request.currentUser.id);
      await completeTask(auth, { listId, taskId });
      invalidateDashboardCache(request.currentUser.id);
      return { ok: true };
    } catch (error) {
      if (isGoogleScopeError(error)) {
        return reply.code(403).send({ error: 'insufficient_scope' });
      }
      throw error;
    }
  });

  app.post('/api/tasks/:listId/:taskId/reopen', async (request, reply) => {
    const listId = String(request.params.listId || '');
    const taskId = String(request.params.taskId || '');
    if (!listId || !taskId) return reply.code(400).send({ error: 'invalid_task' });

    try {
      const auth = await getAuthedClient(request.currentUser.id);
      await reopenTask(auth, { listId, taskId });
      invalidateDashboardCache(request.currentUser.id);
      return { ok: true };
    } catch (error) {
      if (isGoogleScopeError(error)) {
        return reply.code(403).send({ error: 'insufficient_scope' });
      }
      throw error;
    }
  });

  app.delete('/api/tasks/:listId/:taskId', async (request, reply) => {
    const listId = String(request.params.listId || '');
    const taskId = String(request.params.taskId || '');
    if (!listId || !taskId) return reply.code(400).send({ error: 'invalid_task' });

    try {
      const auth = await getAuthedClient(request.currentUser.id);
      await deleteTask(auth, { listId, taskId });
      invalidateDashboardCache(request.currentUser.id);
      return { ok: true };
    } catch (error) {
      if (isGoogleScopeError(error)) {
        return reply.code(403).send({ error: 'insufficient_scope' });
      }
      throw error;
    }
  });

  app.get('/api/summary', async (request) =>
    getOrBuildSummary(request.currentUser.id, {
      logger: request.log,
      force: request.query.refresh === 'true' || request.query.refresh === '1',
    }),
  );

  app.post('/api/summary/refresh', async (request) =>
    getOrBuildSummary(request.currentUser.id, { logger: request.log, force: true }),
  );

  app.get('/api/settings', async (request) => accountPayload(request.currentUser));

  app.patch('/api/settings', async (request, reply) => {
    const { timeZone, language, summaryHour, weeklyGoalKm, calorieGoal, weather, places, layout } =
      request.body || {};
    const patch = {};

    if (timeZone !== undefined) {
      // Reject unknown zones here: stored garbage would break every Intl call later.
      try {
        new Intl.DateTimeFormat('en-GB', { timeZone });
      } catch {
        return reply.code(400).send({ error: 'invalid_timezone' });
      }
      patch.timeZone = timeZone;
    }
    if (language !== undefined) {
      if (!LANGUAGES.includes(String(language).trim())) {
        return reply.code(400).send({ error: 'invalid_language' });
      }
      patch.language = String(language).trim();
    }
    if (summaryHour !== undefined) {
      const hour = Number(summaryHour);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        return reply.code(400).send({ error: 'invalid_hour' });
      }
      patch.summaryHour = hour;
    }
    if (weeklyGoalKm !== undefined) {
      const goal = Number(weeklyGoalKm);
      if (!Number.isFinite(goal) || goal < 0 || goal > GOAL_MAX_KM) {
        return reply.code(400).send({ error: 'invalid_goal' });
      }
      patch.weeklyGoalKm = goal;
    }
    if (weather !== undefined) {
      const parsed = parseCoordinates(weather);
      if (parsed.error) return reply.code(400).send({ error: parsed.error });
      patch.weather = parsed.value;
    }
    if (places !== undefined) {
      const home = String(places?.home || '').trim().slice(0, 200);
      const work = String(places?.work || '').trim().slice(0, 200);
      patch.places = { home, work };
    }
    if (calorieGoal !== undefined) {
      const goal = Number(calorieGoal);
      if (!Number.isFinite(goal) || goal < 0 || goal > GOAL_MAX_KCAL) {
        return reply.code(400).send({ error: 'invalid_calorie_goal' });
      }
      patch.calorieGoal = Math.round(goal);
    }
    if (layout !== undefined) {
      patch.layout = normalizeLayout(layout);
    }

    const updated = await updateSettings(request.currentUser.id, patch);
    // Settings change what the sources return, so the cached bundle is now stale.
    invalidateDashboardCache(updated.id);
    return accountPayload(updated);
  });

  app.post('/api/user/onboarding', async (request, reply) => {
    const parsed = parseOnboarding(request.body);
    if (parsed.error) return reply.code(400).send({ error: parsed.error });

    const preferences = parsed.value;
    const languageRaw = String(request.body?.language || '').trim();
    const language = LANGUAGES.includes(languageRaw) ? languageRaw : undefined;
    const savedLayout = request.currentUser.settings?.layout;
    const hadLayout = Array.isArray(savedLayout?.widgets) && savedLayout.widgets.length > 0;
    const layout = applyOnboardingLayout(savedLayout, preferences);
    const summaryHour = hadLayout ? undefined : summaryHourFromRoutine(preferences.dailyRoutine);
    const outdoor = preferences.hobbies.some(
      (hobby) => hobby === 'running' || hobby === 'mountain_biking',
    );
    const weeklyGoalKm =
      outdoor && !(Number(request.currentUser.settings?.weeklyGoalKm) > 0) ? 20 : undefined;
    const existingPrompt = String(request.currentUser.customAIPrompt || '').trim();
    const customAIPrompt =
      existingPrompt ||
      suggestedCustomPrompt(preferences, language || request.currentUser.settings?.language);

    const updated = await completeOnboarding(request.currentUser.id, {
      preferences,
      layout,
      summaryHour,
      weeklyGoalKm,
      customAIPrompt,
      language,
    });
    invalidateDashboardCache(updated.id);
    return accountPayload(updated);
  });

  app.patch('/api/user/custom-prompt', async (request, reply) => {
    const parsed = parseCustomPrompt(request.body);
    if (parsed.error) return reply.code(400).send({ error: parsed.error });
    const updated = await saveCustomPrompt(request.currentUser.id, parsed.value);
    return accountPayload(updated);
  });

  async function watchlistReply(reply, work) {
    try {
      const updated = await work();
      invalidateDashboardCache(updated.id);
      // Quotes for this list only — not a full dashboard rebuild.
      const watchlist = await loadWatchlistForUser(updated, { persist: true });
      const fresh = watchlist.changed ? await getUser(updated.id) : updated;
      return { ...accountPayload(fresh), watchlist: { items: watchlist.items, fired: watchlist.fired } };
    } catch (error) {
      if (error.code && error.statusCode) {
        return reply.code(error.statusCode).send({ error: error.code });
      }
      throw error;
    }
  }

  app.get('/api/places/suggest', async (request, reply) => {
    const q = String(request.query.q || '').trim();
    if (q.length < 2) return { places: [] };
    if (q.length > 80) return reply.code(400).send({ error: 'invalid_query' });
    const lat = request.query.lat != null ? Number(request.query.lat) : null;
    const lon = request.query.lon != null ? Number(request.query.lon) : null;
    try {
      return {
        places: await suggestPlaces(q, {
          lat: Number.isFinite(lat) ? lat : null,
          lon: Number.isFinite(lon) ? lon : null,
        }),
      };
    } catch (error) {
      request.log.warn({ err: error }, 'place search failed');
      return { places: [] };
    }
  });

  app.get('/api/places/eta', async (request) => {
    const queryLat = request.query.lat != null ? Number(request.query.lat) : NaN;
    const queryLon = request.query.lon != null ? Number(request.query.lon) : NaN;
    const weatherLat = Number(request.currentUser.settings?.weather?.lat);
    const weatherLon = Number(request.currentUser.settings?.weather?.lon);
    const origin =
      Number.isFinite(queryLat) && Number.isFinite(queryLon)
        ? { lat: queryLat, lon: queryLon }
        : Number.isFinite(weatherLat) && Number.isFinite(weatherLon)
          ? { lat: weatherLat, lon: weatherLon }
          : null;

    if (
      origin &&
      (origin.lat < -90 || origin.lat > 90 || origin.lon < -180 || origin.lon > 180)
    ) {
      return { home: null, work: null };
    }

    const places = request.currentUser.settings?.places || {};
    return estimateArrivals({
      origin,
      home: places.home,
      work: places.work,
      logger: request.log,
    });
  });

  app.get('/api/quotes/search', async (request, reply) => {
    const q = String(request.query.q || '').trim();
    if (q.length < 1) return { quotes: [] };
    if (q.length > 40) return reply.code(400).send({ error: 'invalid_query' });
    try {
      return { quotes: await searchQuotes(q) };
    } catch (error) {
      request.log.warn({ err: error }, 'quote search failed');
      return reply.code(502).send({ error: 'search_unavailable' });
    }
  });

  app.get('/api/quotes/one', async (request, reply) => {
    const symbol = String(request.query.symbol || '').trim();
    if (symbol.length < 1) return reply.code(400).send({ error: 'invalid_symbol' });
    try {
      const quote = await fetchQuote(symbol);
      if (!quote) return reply.code(404).send({ error: 'unknown_symbol' });
      const currency = normalizeCurrency(quote.currency);
      if (!currency) return reply.code(400).send({ error: 'unsupported_currency' });
      return { quote: { ...quote, currency } };
    } catch (error) {
      request.log.warn({ err: error }, 'quote lookup failed');
      return reply.code(502).send({ error: 'search_unavailable' });
    }
  });

  app.post('/api/watchlist/items', async (request, reply) =>
    watchlistReply(reply, () => addWatchlistItem(request.currentUser, request.body || {})),
  );

  app.delete('/api/watchlist/items/:itemId', async (request, reply) =>
    watchlistReply(reply, () => removeWatchlistItem(request.currentUser, request.params.itemId)),
  );

  app.post('/api/watchlist/items/:itemId/alerts', async (request, reply) =>
    watchlistReply(reply, () =>
      addWatchlistAlert(request.currentUser, request.params.itemId, request.body || {}),
    ),
  );

  app.delete('/api/watchlist/items/:itemId/alerts/:alertId', async (request, reply) =>
    watchlistReply(reply, () =>
      removeWatchlistAlert(request.currentUser, request.params.itemId, request.params.alertId),
    ),
  );

  app.post('/api/watchlist/ack', async (request, reply) =>
    watchlistReply(reply, () =>
      acknowledgeWatchlistAlerts(request.currentUser, request.body?.ids || []),
    ),
  );

  /** Everything this user shared with the integration, for the Settings pickers. */
  app.get('/api/notion/data-sources', async (request, reply) => {
    const token = await getNotionToken(request.currentUser.id);
    if (!token) return reply.code(409).send({ error: 'notion_not_connected' });
    return { dataSources: await listNotionDataSources(token) };
  });

  app.put('/api/notion/selection', async (request, reply) => {
    const { kind, dataSourceId } = request.body || {};
    if (!['deadlines', 'workouts'].includes(kind)) {
      return reply.code(400).send({ error: 'invalid_kind' });
    }

    const userId = request.currentUser.id;
    const token = await getNotionToken(userId);
    if (!token) return reply.code(409).send({ error: 'notion_not_connected' });

    // Clearing a choice is how a user stops that card appearing.
    if (!dataSourceId) {
      const cleared = await saveNotionSelection(userId, kind, {});
      invalidateDashboardCache(userId);
      return accountPayload(cleared);
    }

    // Property names are inferred from the schema rather than typed by hand.
    const selection = await describeSelection(token, dataSourceId, kind);
    const updated = await saveNotionSelection(userId, kind, selection);
    invalidateDashboardCache(userId);
    return accountPayload(updated);
  });

  app.get('/api/config', async () => ({
    offered: offered(),
    openaiModel: config.openai.model,
  }));

  await nutritionRoutes(app);
}
