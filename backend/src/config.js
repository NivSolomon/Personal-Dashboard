import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
export const backendDir = path.resolve(srcDir, '..');
export const repoRoot = path.resolve(backendDir, '..');

// The repo keeps a single .env at the root; backend/.env may override it locally.
loadEnv({ path: path.join(backendDir, '.env'), quiet: true });
loadEnv({ path: path.join(repoRoot, '.env'), quiet: true });

const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || '',
  // 32 bytes of hex; guards provider refresh tokens at rest.
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  mongoUri: process.env.MONGODB_URI || '',
  mongoDbName: process.env.MONGODB_DB_NAME || 'user_dashboard',
  // The server's own zone, used only for logging and as a default for new accounts.
  timeZone: process.env.TIMEZONE || systemTimeZone,
  // Retained solely so the one-off migration script can read the retired store.
  dataFile: process.env.DATA_FILE || path.join(backendDir, 'data', 'db.json'),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  summary: {
    // How often the scheduler wakes to look for users whose local hour has arrived.
    // Language and delivery hour are per-user, so neither lives here.
    cron: process.env.SUMMARY_CRON || '*/15 * * * *',
    // Floor between manual regenerations, so a click-happy user cannot spam the job.
    minRefreshMs: Number(process.env.SUMMARY_MIN_REFRESH_SECONDS || 60) * 1000,
  },
  cache: {
    // How long a set of Google results is reused across dashboard requests.
    dashboardTtlMs: Number(process.env.DASHBOARD_CACHE_TTL_SECONDS || 90) * 1000,
  },
  watchlist: {
    // How often saved price lines are checked while the dashboard is closed.
    cron: process.env.WATCHLIST_CRON || '*/5 * * * *',
  },
  // The deployment's own OpenWeather key; each user supplies their own coordinates.
  weather: {
    apiKey: process.env.OPENWEATHER_API_KEY || '',
    // Used when a user has not set their own pin yet, so the header chip still has data.
    defaultLat: process.env.WEATHER_LAT || '',
    defaultLon: process.env.WEATHER_LON || '',
  },
  // A public Notion integration, authorised per user via OAuth. Which databases to
  // read is a per-user choice, so no database ids live here any more.
  notion: {
    clientId: process.env.NOTION_CLIENT_ID || '',
    clientSecret: process.env.NOTION_CLIENT_SECRET || '',
    redirectUri: process.env.NOTION_REDIRECT_URI || 'http://localhost:3000/auth/notion/callback',
  },
  strava: {
    clientId: process.env.STRAVA_CLIENT_ID || '',
    clientSecret: process.env.STRAVA_CLIENT_SECRET || '',
    redirectUri: process.env.STRAVA_REDIRECT_URI || 'http://localhost:3000/auth/strava/callback',
  },
  /** Starting values for a newly created account; each is editable in Settings. */
  defaults: {
    timeZone: process.env.TIMEZONE || systemTimeZone,
    language: process.env.SUMMARY_LANGUAGE || 'Hebrew',
    summaryHour: Number(process.env.SUMMARY_HOUR || 7),
    weeklyGoalKm: Number(process.env.ACTIVITY_WEEKLY_GOAL_KM || 0),
    calorieGoal: Number(process.env.NUTRITION_DAILY_GOAL_KCAL || 2000),
  },
};

const PLACEHOLDER = /^(your_|change_me)/i;

function missing(value) {
  return !value || PLACEHOLDER.test(value);
}

/**
 * Values without which the server cannot serve a login flow. Checked at boot so
 * the failure is a clear message instead of an opaque Google error later on.
 */
export function assertRequiredConfig() {
  const problems = [];
  if (missing(config.google.clientId)) problems.push('GOOGLE_CLIENT_ID');
  if (missing(config.google.clientSecret)) problems.push('GOOGLE_CLIENT_SECRET');
  if (missing(config.sessionSecret) || config.sessionSecret.length < 32) {
    problems.push('SESSION_SECRET (needs at least 32 characters)');
  }
  if (missing(config.mongoUri)) problems.push('MONGODB_URI');
  // Required now rather than optional: without it, tokens cannot be stored at all.
  if (!/^[0-9a-f]{64}$/i.test(config.encryptionKey)) {
    problems.push('ENCRYPTION_KEY (needs 64 hex characters)');
  }
  // A malformed redirect URI otherwise fails much later, as an opaque Google error.
  try {
    const url = new URL(config.google.redirectUri);
    if (!url.protocol.startsWith('http')) throw new Error('not http');
  } catch {
    problems.push(`GOOGLE_REDIRECT_URI (not a valid http URL: "${config.google.redirectUri}")`);
  }
  if (problems.length > 0) {
    throw new Error(
      `Missing or placeholder environment variables: ${problems.join(', ')}. ` +
        'Copy .env.example to .env and fill it in.',
    );
  }
}

export function isOpenAiConfigured() {
  return !missing(config.openai.apiKey);
}

/**
 * These report only whether the deployment holds the credentials to *offer* a
 * provider. Whether a given user has connected it, and with what settings, lives
 * on their own record — so none of these belong in assertRequiredConfig.
 */
export function isWeatherConfigured() {
  return !missing(config.weather.apiKey);
}

export function isNotionConfigured() {
  return !missing(config.notion.clientId) && !missing(config.notion.clientSecret);
}

export function isStravaConfigured() {
  return !missing(config.strava.clientId) && !missing(config.strava.clientSecret);
}
