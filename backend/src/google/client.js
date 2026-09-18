import { google } from 'googleapis';
import { config } from '../config.js';
import { getGoogleTokens, saveGoogleTokens } from '../store/db.js';

export const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.readonly',
  // Profile Home/Work addresses only. Google Maps saved places are not available.
  'https://www.googleapis.com/auth/user.addresses.read',
];

export function createOAuthClient() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri,
  );
}

export function getAuthUrl(state) {
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    // Force the consent screen so Google reliably returns a refresh token,
    // which the cron job needs to run while nobody is logged in.
    prompt: 'consent',
    include_granted_scopes: true,
    state,
  });
}

export async function exchangeCodeForTokens(code) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  return { client, tokens };
}

export async function fetchProfile(auth) {
  const { data } = await google.oauth2({ version: 'v2', auth }).userinfo.get();
  return {
    id: data.id,
    email: data.email,
    name: data.name || data.email,
    picture: data.picture || null,
  };
}

export class MissingAuthError extends Error {
  constructor(userId) {
    super(`No stored Google credentials for user ${userId}`);
    this.name = 'MissingAuthError';
    this.statusCode = 401;
  }
}

export function isGoogleScopeError(reason) {
  if (reason?.response?.status !== 403 && reason?.code !== 403) return false;
  return /insufficient/i.test(JSON.stringify(reason?.response?.data ?? reason?.message ?? ''));
}

/**
 * An OAuth client primed with the user's stored tokens. googleapis refreshes the
 * access token on demand and emits `tokens`, which we persist so the refresh
 * token survives restarts.
 */
export async function getAuthedClient(userId) {
  const tokens = await getGoogleTokens(userId);
  if (!tokens?.refresh_token && !tokens?.access_token) {
    throw new MissingAuthError(userId);
  }

  const client = createOAuthClient();
  client.setCredentials(tokens);
  client.on('tokens', (rotated) => {
    void saveGoogleTokens(userId, rotated);
  });
  return client;
}
