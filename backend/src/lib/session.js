import { config } from '../config.js';

const SESSION_COOKIE = 'sid';
const STATE_COOKIE = 'oauth_state';

const baseOptions = {
  httpOnly: true,
  // The browser only talks to this app's own origin (Vite in dev, Vercel in
  // production). Lax is sent on the Google redirect back and on later /api calls.
  // SameSite=None plus Secure is dropped on http://localhost, so login returns
  // here with no cookie and /api/me answers 401.
  sameSite: 'lax',
  path: '/',
  signed: true,
  secure: config.cookieSecure,
};

export function setSession(reply, userId) {
  reply.setCookie(SESSION_COOKIE, userId, { ...baseOptions, maxAge: 60 * 60 * 24 * 30 });
}

export function clearSession(reply) {
  reply.clearCookie(SESSION_COOKIE, { ...baseOptions, signed: false });
}

export function readSession(request) {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid ? unsigned.value : null;
}

export function setOAuthState(reply, state) {
  reply.setCookie(STATE_COOKIE, state, { ...baseOptions, maxAge: 60 * 10 });
}

/** Reads and immediately invalidates the one-shot CSRF state cookie. */
export function consumeOAuthState(request, reply) {
  const raw = request.cookies[STATE_COOKIE];
  reply.clearCookie(STATE_COOKIE, { ...baseOptions, signed: false });
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid ? unsigned.value : null;
}
