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
 * Password reset (AUTH-5). The emailed link carries a random token; only its
 * hash is kept, it dies after an hour and again after one use — so a copied
 * link from an old message is worthless.
 */
export function newResetToken() {
  const token = crypto.randomBytes(24).toString('hex');
  return {
    token,
    hash: sha256(token),
    expires: new Date(Date.now() + 60 * 60 * 1000),
  };
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export async function applyReset(token, newPassword) {
  const user = await User.findOne({ resetTokenHash: sha256(token) }).select('+resetTokenHash +resetTokenExpires');
  const problem =
    !user || user.resetTokenUsed || !user.resetTokenExpires || user.resetTokenExpires < new Date()
      ? 'This reset link is invalid or has expired. Please request a new one.'
      : passwordProblem(newPassword);

  if (problem) return { ok: false, error: problem };

  user.passwordHash = await hashPassword(newPassword);
  user.resetTokenHash = null;
  user.resetTokenExpires = null;
  user.resetTokenUsed = false;
  await user.save();
  return { ok: true };
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
