import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth, requireStudent } from '../middleware/auth.js';
import { loginLimiter, accountLimiter } from '../middleware/rateLimit.js';
import {
  hashPassword,
  verifyPassword,
  passwordProblem,
  emailProblem,
  requestPasswordReset,
  applyResetCode,
  sendMail,
} from '../services/accounts.js';
import { linkGroupsForEmail } from '../services/groups.js';
import env from '../config/env.js';

const router = Router();

/* ----------------------------- register (AUTH-1) ---------------------------- */

router.post('/register', accountLimiter, async (req, res, next) => {
  try {
    const { name, email, recoveryEmail, password, currency } = req.body;

    const emailErr = emailProblem(email);
    if (emailErr) return res.status(400).json({ error: emailErr });
    const pwErr = passwordProblem(password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    if (!String(name || '').trim()) return res.status(400).json({ error: 'Please enter your name.' });
    if (currency !== undefined && (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency))) {
      return res.status(400).json({ error: 'Unknown currency code.' });
    }

    // The recovery address is not optional: without it the student has no way
    // back into the account if they forget the password.
    const recoveryErr = emailProblem(recoveryEmail);
    if (recoveryErr) {
      return res.status(400).json({ error: `Recovery email: ${recoveryErr}` });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanRecovery = String(recoveryEmail).trim().toLowerCase();
    if (await User.exists({ email: cleanEmail })) {
      // Same wording whether or not the address exists keeps us from
      // telling strangers who has an account here.
      return res.status(409).json({ error: 'That email is already registered. Try signing in.' });
    }
    if (await User.exists({ recoveryEmail: cleanRecovery })) {
      return res.status(409).json({ error: 'That recovery email is already used by another account.' });
    }

    const user = await User.create({
      name: String(name).trim().slice(0, 100),
      email: cleanEmail,
      recoveryEmail: cleanRecovery,
      recoveryEmailChosen: true,
      passwordHash: await hashPassword(password),
      role: 'student',
      // What the student picks at sign-up is what their amounts are in. The
      // topbar picker can display them in anything else later, but the ledger
      // itself starts — and stays — in their own currency.
      ...(currency ? { currency, ledgerCurrency: currency } : {}),
    });

    // GRP-1: a roommate is added to a group by email long before they have an
    // account, and the sign-up address is the only thing that can connect the
    // two. The group a student was invited to is linked to their new account
    // here, so it is waiting in their list from the first load. The groups list
    // runs the same repair for accounts that predate it, so a group can never
    // stay unlinked (see services/groups.js → linkGroupsForEmail).
    await linkGroupsForEmail(user);

    startSession(req, user);
    res.status(201).json({ user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- login (AUTH-2) ------------------------------ */

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const user = await User.findOne({ email }).select('+passwordHash');
    const badCredentials = { error: 'Email or password is incorrect.' };

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json(badCredentials);
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'This account has been disabled. Please contact support.' });
    }
    // Students and administrators have separate doors (AUTH-3): this
    // endpoint belongs to the student page, so a staff account is refused
    // here with the *same* answer as a wrong password — the door must not
    // reveal that the address it tried belongs to an administrator.
    if (user.role !== 'student') {
      return res.status(401).json(badCredentials);
    }

    // GRP-1: the group this student was invited to before they had an account is
    // linked here, so it is waiting in their list the moment they sign in. It is
    // a plain database repair that needs nothing from the session, and it goes
    // BEFORE the session is written so the sign-in flow below is left exactly as
    // it was (see services/groups.js → linkGroupsForEmail).
    await linkGroupsForEmail(user);

    await regenerateSession(req);
    startSession(req, user);
    res.json({ user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

/* ------------------------- administrator door (AUTH-3) ------------------------ */
// Same credential check as above, but only role=admin passes — and the
// student door already refuses administrators. Two doors, two roles.
router.post('/control-login', loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'This account has been disabled.' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'This door is for administrators only.' });
    }

    await regenerateSession(req);
    startSession(req, user);
    res.json({ user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- logout ------------------------------------ */

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('campuscoin.sid');
    res.json({ ok: true });
  });
});

/* --------------------------- password reset (AUTH-5) ------------------------- */
/*
 * Two steps on one screen: ask for the RECOVERY address, get a six-digit code,
 * type the code with a new password. The sign-in address is not accepted here
 * on purpose — it is the name that shows up in screenshots and on shared
 * machines, so anyone who can type it must not be able to take the account.
 */

router.post('/password-reset/request', accountLimiter, async (req, res, next) => {
  try {
    const result = await requestPasswordReset(req.body.email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/password-reset/confirm', accountLimiter, async (req, res, next) => {
  try {
    const result = await applyResetCode({
      email: req.body.email,
      code: req.body.code,
      password: req.body.password,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* --------------------------- whoami + preferences ---------------------------- */

router.get('/me', async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.json({ user: null, csrfToken: null });
    const user = await User.findById(req.session.userId);
    if (!user || !user.isActive) return res.json({ user: null, csrfToken: null });
    res.json({ user: user.toPublic(), csrfToken: req.session.csrfToken });
  } catch (err) {
    next(err);
  }
});

/**
 * Display preferences (UX-1/UX-2 + the topbar pickers) persist on the
 * account, not the device: theme, font size, display currency, language.
 * Currency/language only change how things are SHOWN on the client.
 */
router.patch('/me/preferences', requireAuth, async (req, res, next) => {
  try {
    const { theme, fontScale, currency, ledgerCurrency, language } = req.body;
    if (theme !== undefined) {
      if (!['light', 'dark'].includes(theme)) return res.status(400).json({ error: 'Unknown theme.' });
      req.user.theme = theme;
    }
    if (fontScale !== undefined) {
      const n = Number(fontScale);
      if (![1, 2, 3, 4].includes(n)) return res.status(400).json({ error: 'Font scale must be 1–4.' });
      req.user.fontScale = n;
    }
    if (currency !== undefined) {
      if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
        return res.status(400).json({ error: 'Unknown currency code.' });
      }
      req.user.currency = currency;
    }
    // The student's own currency — what the stored amounts are in. Kept apart
    // from the display currency so switching the picker converts the display
    // instead of mislabelling the ledger.
    if (ledgerCurrency !== undefined) {
      if (typeof ledgerCurrency !== 'string' || !/^[A-Z]{3}$/.test(ledgerCurrency)) {
        return res.status(400).json({ error: 'Unknown currency code.' });
      }
      req.user.ledgerCurrency = ledgerCurrency;
    }
    if (language !== undefined) {
      if (typeof language !== 'string' || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(language)) {
        return res.status(400).json({ error: 'Unknown language code.' });
      }
      req.user.language = language;
    }
    await req.user.save();
    res.json({ user: req.user.toPublic() });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- profile (AUTH-6) --------------------------- */

router.patch('/me/profile', requireStudent, async (req, res, next) => {
  try {
    const { name, academicYear, monthlyAllowanceBaseline, monthlySavingsGoal, recoveryEmail } = req.body;

    if (name !== undefined) {
      const clean = String(name).trim();
      if (!clean) return res.status(400).json({ error: 'Name cannot be empty.' });
      req.user.name = clean.slice(0, 100);
    }
    if (recoveryEmail !== undefined) {
      const err = emailProblem(recoveryEmail);
      if (err) return res.status(400).json({ error: err });
      const clean = String(recoveryEmail).trim().toLowerCase();
      const taken = await User.exists({ recoveryEmail: clean, _id: { $ne: req.user._id } });
      if (taken) return res.status(409).json({ error: 'That recovery email is already used by another account.' });
      req.user.recoveryEmail = clean;
      req.user.recoveryEmailChosen = true;
    }
    if (academicYear !== undefined) {
      req.user.academicYear = String(academicYear).trim().slice(0, 30);
    }
    if (monthlyAllowanceBaseline !== undefined) {
      const parsed = parseAmount(monthlyAllowanceBaseline);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      req.user.monthlyAllowanceBaseline = parsed.value;
    }
    if (monthlySavingsGoal !== undefined) {
      const parsed = parseAmount(monthlySavingsGoal);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      req.user.monthlySavingsGoal = parsed.value;
    }

    await req.user.save();
    res.json({ user: req.user.toPublic() });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- helpers ------------------------------------ */

function startSession(req, user) {
  req.session.userId = user._id.toString();
  req.session.startedAt = Date.now();
  req.session.idleExpiry = Date.now() + env.sessionIdleMinutes * 60 * 1000;
  req.session.csrfToken = req.session.csrfToken || randomToken();
}

/** Fresh session id on login blocks session-fixation attacks. */
function regenerateSession(req) {
  return new Promise((resolve) => req.session.regenerate(resolve));
}

function randomToken() {
  let out = '';
  for (let i = 0; i < 32; i += 1) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

/** Shared rule for profile money fields: positive, max two decimals, or blank. */
function parseAmount(value) {
  if (value === null || value === '') return { ok: true, value: null };
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s) || Number(s) <= 0) {
    return { ok: false, error: 'Amounts must be a positive number with up to 2 decimals.' };
  }
  return { ok: true, value: s };
}

export default router;
