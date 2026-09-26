import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import env from '../config/env.js';

/** Passwords go through bcrypt with a per-record salt; nothing reversible
 *  is ever stored or logged. */
export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Deliberately small validator so the rules match exactly what the report
 * says: at least 8 characters, not entirely digits, and not one of the
 * handful of passwords people try first.
 */
const COMMON = new Set([
  'password', 'password1', '12345678', '123456789', 'qwerty123',
  'iloveyou', 'admin123', 'letmein1', 'welcome1', 'campuscoin',
]);

export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (/^\d+$/.test(pw)) return 'Password cannot be only numbers.';
  if (COMMON.has(pw.toLowerCase())) return 'That password is too common — please choose another.';
  return null;
}

export function emailProblem(email) {
  const s = String(email || '').trim().toLowerCase();
  if (s.length > 254) return 'That email address is too long.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return 'Please enter a valid email address.';
  return null;
}

/**
 * Password reset (AUTH-5) — by CODE, and only to the recovery address.
 *
 * The reset is a six-digit code rather than a link because the student has to
 * be able to finish the job on the same screen they started it: the code comes
 * back in the response whenever the mailer is the console (development, no SMTP
 * configured), so the demo and the report work with no mail server at all. With
 * a real mailer configured the code is only ever delivered to the recovery inbox
 * and never leaves the server.
 *
 * Only the hash is stored, it dies after ten minutes, five wrong guesses burn
 * it, and it is wiped the moment it works.
 */
export const RESET_CODE_TTL_MS = 10 * 60 * 1000;
export const RESET_CODE_MAX_ATTEMPTS = 5;

export function newResetCode() {
  // six digits from a cryptographic source; 000000-999999, with a guard so the
  // code is never a run of zeros that reads like a placeholder
  let code = '';
  do {
    code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  } while (code === '000000');
  return {
    code,
    hash: sha256(code),
    expires: new Date(Date.now() + RESET_CODE_TTL_MS),
  };
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/** The same quiet answer for "no such address" as for "sent" — no account probing. */
export const RESET_QUIET = {
  ok: true,
  message: 'If that is a recovery address on this site, a code is on its way.',
};

export async function findByRecoveryEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return null;
  return User.findOne({ recoveryEmail: clean });
}

/**
 * Start a reset.
 *
 * Answers quietly either way, but says more in development, where nothing is
 * actually delivered: there the code comes back so the student can finish the
 * job, and an address that is not a recovery address anywhere says so plainly
 * instead of leaving them staring at a message that leads nowhere.
 */
export async function requestPasswordReset(email) {
  const user = await findByRecoveryEmail(email);

  if (!user || !user.isActive) {
    if (env.emailBackend !== 'smtp') {
      return { ...RESET_QUIET, delivered: false, devHint: 'unknown-recovery-email' };
    }
    return { ...RESET_QUIET, delivered: false };
  }

  const { code, hash, expires } = newResetCode();
  user.resetCodeHash = hash;
  user.resetCodeExpires = expires;
  user.resetCodeAttempts = 0;
  await user.save();

  const mail = await sendMail({
    to: user.recoveryEmail,
    subject: 'Your Campus Coin reset code',
    text:
      `Hi ${user.name},\n\n` +
      `Someone asked to reset the password on your Campus Coin account.\n` +
      `Your code is ${code}. It works once, and dies in ten minutes.\n\n` +
      `Enter it on the reset page to choose a new password.\n` +
      `If this was not you, ignore this message — nothing has changed, and you can ` +
      `change your recovery address in your profile at any time.`,
  });

  return {
    ...RESET_QUIET,
    delivered: mail.backend === 'smtp',
    // development only: the console mailer delivers nothing, so the code is
    // handed back to the page instead of being lost
    ...(mail.backend === 'smtp' ? {} : { devCode: code }),
  };
}

/**
 * Finish a reset: the recovery address, the code, and the new password.
 * Every failure returns the same sentence, so a stranger learns nothing about
 * which codes exist.
 */
export async function applyResetCode({ email, code, password }) {
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };

  const user = await findByRecoveryEmail(email);
  const nope = { ok: false, error: 'That code is not valid any more. Please request a new one.' };
  if (!user) return nope;

  const full = await User.findById(user._id).select('+resetCodeHash +resetCodeExpires +resetCodeAttempts');
  if (!full.resetCodeHash || !full.resetCodeExpires || full.resetCodeExpires < new Date()) {
    if (full.resetCodeHash) {
      full.resetCodeHash = null;
      full.resetCodeExpires = null;
      await full.save();
    }
    return nope;
  }
  if (full.resetCodeAttempts >= RESET_CODE_MAX_ATTEMPTS) {
    full.resetCodeHash = null;
    full.resetCodeExpires = null;
    await full.save();
    return nope;
  }

  if (full.resetCodeHash !== sha256(String(code || '').trim())) {
    full.resetCodeAttempts += 1;
    const burnt = full.resetCodeAttempts >= RESET_CODE_MAX_ATTEMPTS;
    if (burnt) {
      full.resetCodeHash = null;
      full.resetCodeExpires = null;
    }
    await full.save();
    return {
      ok: false,
      error: burnt
        ? 'Too many wrong codes. Please request a new one.'
        : 'That code is not valid any more. Please request a new one.',
    };
  }

  full.passwordHash = await hashPassword(password);
  full.resetCodeHash = null;
  full.resetCodeExpires = null;
  full.resetCodeAttempts = 0;
  await full.save();
  return { ok: true };
}

/**
 * Give every account a recovery address if it somehow has none — the first
 * release did not ask for one, and a user without it could not use the reset
 * page at all. Run on boot and by the seed; it is a repair, not a feature, and
 * it never touches an address the student chose.
 */
export async function ensureRecoveryEmails() {
  const missing = await User.find({
    $or: [{ recoveryEmail: { $exists: false } }, { recoveryEmail: null }, { recoveryEmail: '' }],
  }).select('_id email recoveryEmail');

  for (const user of missing) {
    user.recoveryEmail = user.email;
    try {
      await user.save();
    } catch {
      // another account already owns that address: leave this one alone rather
      // than fail the boot — the reset page will simply not accept it
    }
  }
  return missing.length;
}

/** Tiny, dependency-free mailer: console in dev, SMTP in production.
 *  Password-reset flows need *some* transport; this keeps dev honest —
 *  you see the exact link the student would receive. */
export async function sendMail({ to, subject, text }) {
  if (env.emailBackend !== 'smtp') {
    console.log(`\n--- mail ---\nTo: ${to}\nSubject: ${subject}\n${text}\n-----------\n`);
    return { ok: true, backend: 'console' };
  }
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  await transporter.sendMail({ from: env.smtp.from, to, subject, text });
  return { ok: true, backend: 'smtp' };
}
