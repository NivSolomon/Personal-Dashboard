import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const SESSION_COOKIE = 'sid';
const STATE_COOKIE = 'oauth_state';
const SESSION_MS = 60 * 60 * 24 * 30 * 1000;
const OAUTH_MS = 10 * 60 * 1000;
const LOGIN_TICKET_MS = 2 * 60 * 1000;

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

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function readPayload(token) {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Signed value Google will echo back. Valid even when the state cookie is dropped. */
export function issueOAuthState() {
  return signPayload({ typ: 'oauth', exp: Date.now() + OAUTH_MS });
}

export function oauthStateMatches(state, cookieState) {
  const payload = readPayload(state);
  if (!payload || payload.typ !== 'oauth') return false;
  if (cookieState && cookieState !== state) return false;
  return true;
}

/** Short-lived handoff from the Google redirect to the page that can store a session. */
export function issueLoginTicket(userId) {
  return signPayload({ typ: 'login', uid: userId, exp: Date.now() + LOGIN_TICKET_MS });
}

export function readLoginTicket(ticket) {
  const payload = readPayload(ticket);
  if (!payload || payload.typ !== 'login' || !payload.uid) return null;
  return payload.uid;
}

export function issueSessionToken(userId) {
  return signPayload({ typ: 'session', uid: userId, exp: Date.now() + SESSION_MS });
}

function readBearer(header) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const payload = readPayload(header.slice('Bearer '.length).trim());
  if (!payload || payload.typ !== 'session' || !payload.uid) return null;
  return payload.uid;
}

export function readSession(request) {
  const bearer = readBearer(request.headers?.authorization);
  if (bearer) return bearer;
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
