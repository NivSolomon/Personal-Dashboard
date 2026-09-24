import { config } from '../config.js';
import { weekRange } from '../lib/time.js';
import { getStravaTokens, saveStravaTokens } from '../store/db.js';

const AUTH_URL = 'https://www.strava.com/oauth/authorize';
const TOKEN_URL = 'https://www.strava.com/oauth/token';
const API_URL = 'https://www.strava.com/api/v3';

/** Distinct from a failure: the user simply has not linked Strava yet. */
export class StravaNotConnectedError extends Error {
  constructor() {
    super('Strava is not connected for this user');
    this.name = 'StravaNotConnectedError';
    this.code = 'strava_not_connected';
  }
}

const SPORT_FAMILIES = {
  Run: 'run',
  TrailRun: 'run',
  VirtualRun: 'run',
  Ride: 'ride',
  GravelRide: 'ride',
  MountainBikeRide: 'ride',
  VirtualRide: 'ride',
  Walk: 'walk',
  Hike: 'walk',
  Swim: 'swim',
};

export function getStravaAuthUrl(state) {
  const query = new URLSearchParams({
    client_id: config.strava.clientId,
    redirect_uri: config.strava.redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    // read_all so private activities are counted too; drop the suffix to exclude them.
    scope: 'activity:read_all',
    state,
  });
  return `${AUTH_URL}?${query}`;
}

async function tokenRequest(body) {
  const response = await fetch(TOKEN_URL, {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      ...body,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Strava token request failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return response.json();
}

export function exchangeStravaCode(code) {
  return tokenRequest({ code, grant_type: 'authorization_code' });
}

/**
 * Strava access tokens expire roughly every six hours, so each call checks the
 * stored expiry and refreshes just ahead of it, persisting the rotated tokens.
 */
async function accessTokenFor(userId) {
  const stored = await getStravaTokens(userId);
  if (!stored?.refresh_token) throw new StravaNotConnectedError();

  const validFor = (stored.expires_at || 0) * 1000 - Date.now();
  if (stored.access_token && validFor > 60 * 1000) return stored.access_token;

  const refreshed = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: stored.refresh_token,
  });
  await saveStravaTokens(userId, refreshed);
  return refreshed.access_token;
}

async function callApi(path, token, params = {}) {
  const response = await fetch(`${API_URL}${path}?${new URLSearchParams(params)}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Strava ${path} failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return response.json();
}

const km = (metres) => Math.round((metres / 1000) * 10) / 10;

/** Totals for the current week, overall and split by sport. */
export async function fetchWeeklyProgress(userId, { timeZone, weeklyGoalKm = 0 }) {
  const token = await accessTokenFor(userId);
  const { start } = weekRange(timeZone);

  const activities = await callApi('/athlete/activities', token, {
    after: Math.floor(start.getTime() / 1000),
    per_page: 100,
  });

  const bySport = new Map();
  let distance = 0;
  let movingTime = 0;
  let elevation = 0;

  for (const activity of activities) {
    distance += activity.distance || 0;
    movingTime += activity.moving_time || 0;
    elevation += activity.total_elevation_gain || 0;

    const family = SPORT_FAMILIES[activity.sport_type || activity.type] || 'other';
    const entry = bySport.get(family) || { sport: family, count: 0, distance: 0, movingTime: 0 };
    entry.count += 1;
    entry.distance += activity.distance || 0;
    entry.movingTime += activity.moving_time || 0;
    bySport.set(family, entry);
  }

  const [latest] = activities;
  const goalKm = weeklyGoalKm;

  return {
    source: 'strava',
    weekStart: start.toISOString(),
    count: activities.length,
    distanceKm: km(distance),
    movingMinutes: Math.round(movingTime / 60),
    elevationM: Math.round(elevation),
    goalKm: goalKm || null,
    goalPercent: goalKm > 0 ? Math.round((distance / 1000 / goalKm) * 100) : null,
    bySport: [...bySport.values()]
      .map((entry) => ({
        sport: entry.sport,
        count: entry.count,
        distanceKm: km(entry.distance),
        movingMinutes: Math.round(entry.movingTime / 60),
      }))
      .sort((a, b) => b.distanceKm - a.distanceKm),
    latest: latest
      ? {
          name: latest.name || '',
          sport: SPORT_FAMILIES[latest.sport_type || latest.type] || 'other',
          distanceKm: km(latest.distance || 0),
          movingMinutes: Math.round((latest.moving_time || 0) / 60),
          at: latest.start_date || null,
        }
      : null,
  };
}
