import MongoStore from 'connect-mongo';
import env, { isProd } from '../config/env.js';

/**
 * Session rules (AUTH-4):
 *  - the cookie is HttpOnly + SameSite=Lax so scripts on other origins
 *    cannot read or ride it,
 *  - Secure in production where everything runs over HTTPS,
 *  - `idleExpiry` inside the session gives us an idle timeout: a session
 *    that has been quiet longer than the limit is destroyed on the next
 *    request, no matter how long the tab stayed open.
 */
export function sessionOptions() {
  const options = {
    name: 'campuscoin.sid',
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 8 * 60 * 60 * 1000, // hard stop after 8 hours regardless of activity
    },
  };

  // Sessions live in the database in production so a restart doesn't sign
  // everyone out. The built-in memory store is fine for local development.
  if (isProd) {
    options.store = MongoStore.create({ mongoUrl: env.mongodbUri, ttl: 8 * 60 * 60 });
  }

  return options;
}

export function touchSession(req, res, next) {
  const session = req.session;
  if (!session?.userId) return next();

  const idleMs = env.sessionIdleMinutes * 60 * 1000;
  const now = Date.now();

  if (session.idleExpiry && now > session.idleExpiry) {
    return session.destroy(() => {
      res.status(401).json({ error: 'Your session expired. Please sign in again.' });
    });
  }

  session.idleExpiry = now + idleMs;
  next();
}
