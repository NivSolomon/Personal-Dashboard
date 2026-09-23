import { randomUUID } from 'node:crypto';
import { config, isNotionConfigured, isStravaConfigured } from '../config.js';
import { exchangeCodeForTokens, fetchProfile, getAuthUrl } from '../google/client.js';
import { fetchProfileAddresses } from '../google/people.js';
import { exchangeStravaCode, getStravaAuthUrl } from '../integrations/strava.js';
import { exchangeNotionCode, getNotionAuthUrl } from '../integrations/notionOAuth.js';
import {
  deleteUser,
  disconnectProvider,
  saveNotionConnection,
  saveStravaTokens,
  updateSettings,
  upsertUserFromGoogle,
} from '../store/db.js';
import {
  clearSession,
  consumeOAuthState,
  readSession,
  setOAuthState,
  setSession,
} from '../lib/session.js';

export async function authRoutes(app) {
  // Step 1: send the browser to Google's consent screen.
  app.get('/auth/google', {
    config: { rateLimit: { max: 15, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const state = randomUUID();
    setOAuthState(reply, state);
    return reply.redirect(getAuthUrl(state));
  });

  // Step 2: Google redirects back with a one-time code.
  app.get('/auth/google/callback', async (request, reply) => {
    const { code, state, error } = request.query;
    const expectedState = consumeOAuthState(request, reply);

    if (error) return reply.redirect(`${config.frontendUrl}/?error=${encodeURIComponent(error)}`);
    if (!code) return reply.redirect(`${config.frontendUrl}/?error=missing_code`);
    if (!state || state !== expectedState) {
      return reply.redirect(`${config.frontendUrl}/?error=state_mismatch`);
    }

    try {
      const { client, tokens } = await exchangeCodeForTokens(code);
      const profile = await fetchProfile(client);
      const user = await upsertUserFromGoogle({
        ...profile,
        tokens,
        scopes: tokens.scope ? tokens.scope.split(' ') : undefined,
      });
      setSession(reply, profile.id);

      // Prefill Home/Work from the Google profile when the user has not set them yet.
      const current = user.settings?.places || {};
      if (!String(current.home || '').trim() || !String(current.work || '').trim()) {
        try {
          const guessed = await fetchProfileAddresses(client);
          const places = {
            home: String(current.home || '').trim() || guessed.home || '',
            work: String(current.work || '').trim() || guessed.work || '',
          };
          if (places.home || places.work) await updateSettings(user.id, { places });
        } catch (err) {
          request.log.warn({ err }, 'could not read google profile addresses');
        }
      }

      request.log.info({ userId: profile.id }, 'google account connected');
      return reply.redirect(config.frontendUrl);
    } catch (err) {
      request.log.error({ err }, 'oauth callback failed');
      return reply.redirect(`${config.frontendUrl}/?error=oauth_failed`);
    }
  });

  app.post('/auth/logout', async (request, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  // Notion is authorised per user, on top of an existing session. Which databases
  // to read is chosen afterwards in Settings, since consent decides what we can see.
  if (isNotionConfigured()) {
    app.get('/auth/notion', async (request, reply) => {
      if (!readSession(request)) return reply.redirect(`${config.frontendUrl}/?error=login_first`);
      const state = randomUUID();
      setOAuthState(reply, state);
      return reply.redirect(getNotionAuthUrl(state));
    });

    app.get('/auth/notion/callback', async (request, reply) => {
      const { code, state, error } = request.query;
      const expectedState = consumeOAuthState(request, reply);
      const userId = readSession(request);
      const settings = `${config.frontendUrl}/settings`;
      const back = (reason) => reply.redirect(reason ? `${settings}?error=${reason}` : settings);

      if (error) return back(encodeURIComponent(error));
      if (!userId) return back('login_first');
      if (!code) return back('missing_code');
      if (!state || state !== expectedState) return back('state_mismatch');

      try {
        const connection = await exchangeNotionCode(code);
        await saveNotionConnection(userId, connection);
        request.log.info({ userId }, 'notion workspace connected');
        return back(null);
      } catch (err) {
        request.log.error({ err }, 'notion callback failed');
        return back('notion_failed');
      }
    });
  }

  // Strava is a second, later consent on top of an existing session, so these
  // routes only exist when the app has Strava credentials to offer.
  if (isStravaConfigured()) {
    app.get('/auth/strava', async (request, reply) => {
      if (!readSession(request)) return reply.redirect(`${config.frontendUrl}/?error=login_first`);
      const state = randomUUID();
      setOAuthState(reply, state);
      return reply.redirect(getStravaAuthUrl(state));
    });

    app.get('/auth/strava/callback', async (request, reply) => {
      const { code, state, error } = request.query;
      const expectedState = consumeOAuthState(request, reply);
      const userId = readSession(request);
      // Both provider connections are started from Settings, so both return there.
      const settings = `${config.frontendUrl}/settings`;
      const back = (reason) => reply.redirect(reason ? `${settings}?error=${reason}` : settings);

      if (error) return back(encodeURIComponent(error));
      if (!userId) return back('login_first');
      if (!code) return back('missing_code');
      if (!state || state !== expectedState) return back('state_mismatch');

      try {
        const tokens = await exchangeStravaCode(code);
        await saveStravaTokens(userId, tokens);
        request.log.info({ userId }, 'strava account connected');
        return back(null);
      } catch (err) {
        request.log.error({ err }, 'strava callback failed');
        return back('strava_failed');
      }
    });
  }

  // Registered before /auth/:provider so "google" is not treated as an unknown
  // extra integration. Disconnecting Google signs the user out, but the account
  // (and any Notion/Strava tokens) stays so a later login restores the same tenant.
  app.delete('/auth/google', async (request, reply) => {
    const userId = readSession(request);
    if (userId) await disconnectProvider(userId, 'google');
    clearSession(reply);
    return { ok: true };
  });

  // Forget the account entirely, including every stored refresh token.
  app.delete('/auth/account', async (request, reply) => {
    const userId = readSession(request);
    if (userId) await deleteUser(userId);
    clearSession(reply);
    return { ok: true };
  });

  /** Forgets one extra provider's tokens while leaving the account signed in. */
  app.delete('/auth/:provider', async (request, reply) => {
    const { provider } = request.params;
    if (!['notion', 'strava'].includes(provider)) {
      return reply.code(404).send({ error: 'unknown_provider' });
    }
    const userId = readSession(request);
    if (!userId) return reply.code(401).send({ error: 'not_authenticated' });

    await disconnectProvider(userId, provider);
    request.log.info({ userId, provider }, 'provider disconnected');
    return { ok: true };
  });
}
