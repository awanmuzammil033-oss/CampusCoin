import User from '../models/User.js';

/**
 * Route guards. There is no way to reach another person's data without
 * passing one of these first, and every query after them still goes through
 * forUser(userId) — belt and braces (see architecture §7).
 */

async function loadActiveUser(req, res, next) {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Please sign in to continue.' });
    }
    const user = await User.findById(req.session.userId);
    if (!user || !user.isActive) {
      // Disabled accounts lose access on the very next request (ADM-3).
      return req.session.destroy(() => {
        res.status(401).json({ error: 'Your account is not available. Please contact support.' });
      });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export const requireStudent = [
  loadActiveUser,
  (req, res, next) => {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'This area is for student accounts.' });
    }
    next();
  },
];

export const requireAdmin = [
  loadActiveUser,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Administrator access required.' });
    }
    next();
  },
];

/** Any signed-in account (profile, preferences). */
export const requireAuth = loadActiveUser;
