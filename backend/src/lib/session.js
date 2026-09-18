const SESSION_COOKIE = 'sid';
const STATE_COOKIE = 'oauth_state';

const baseOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  signed: true,
  secure: process.env.NODE_ENV === 'production',
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
