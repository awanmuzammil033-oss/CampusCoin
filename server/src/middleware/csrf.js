/**
 * Double-submit CSRF. The session cookie is unreadable to other origins,
 * so pairing it with a header value the client must echo back means a
 * cross-site form post can never carry a valid combination.
 * The token lives in the session and is handed out by GET /api/auth/me.
 */
export function issueCsrf(req, res, next) {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = cryptoRandom();
  }
  next();
}

export function checkCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Login/register must work before a session exists — they are already
  // covered by SameSite=Lax + the rate limiter.
  if (!req.session?.userId) return next();

  const sent = req.get('x-csrf-token') || '';
  if (!req.session.csrfToken || sent !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Security check failed. Refresh the page and try again.' });
  }
  next();
}

function cryptoRandom() {
  // 32 hex characters is plenty for a per-session nonce.
  let out = '';
  for (let i = 0; i < 32; i += 1) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}
