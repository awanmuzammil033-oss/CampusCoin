import crypto from 'node:crypto';

import GuardianLink from '../models/GuardianLink.js';
import User from '../models/User.js';
import { monthStart } from '../models/Budget.js';
import { categoryReport, parseMonth, monthKey } from './reports.js';
import { progressForMonth } from './budgets.js';
import { emailProblem, sha256 } from './accounts.js';
import { toNum } from '../utils/money.js';
import env from '../config/env.js';

/**
 * The guardian summary (NEW-8) â€” a student's own month, shared with one named
 * person, on a link that can be killed the second they change their mind.
 *
 * This is the most privacy-sensitive thing in the app, so three rules are load-
 * bearing and everything below follows from them:
 *
 *  1. **THREE things, and no others.** Month-level category totals, budget
 *     adherence as a percentage, and the savings goal. There is no code path
 *     here that can return a transaction, a description, a merchant, a note, a
 *     date of an entry, an email address, a group, a wallet or a name. The
 *     summary object below is built literally, key by key, so there is no
 *     `...row` anywhere that could carry a field nobody meant to publish.
 *
 *  2. **The link is a snapshot, not a window.** It is scoped to ONE account and
 *     ONE month. A summary that quietly became next month's numbers is a
 *     disclosure the student did not consent to, so the month the token was
 *     minted for is the month it shows forever - see the note on the TTL below.
 *
 *  3. **The token is not a session.** It is a bearer secret whose only use is
 *     the one read in routes/guardian.js. It grants no route, no cookie and no
 *     access to the app.
 */

/** 32 random bytes â†’ 43 characters of base64url, unguessable and URL-safe. */
const TOKEN_BYTES = 32;

/**
 * How long a link lives. It is a TTL measured from the moment of issue, NOT
 * "until the end of the month the link was made": a link minted on the 30th
 * would then be dead within hours, and a guardian who opens it on the 2nd
 * would get a 404 for a summary the student plainly meant to share.
 *
 * What the TTL buys is an upper bound on the life of a leaked secret. What it
 * deliberately does NOT buy is a rolling window: the month is frozen in the row
 * at issue time and never recomputed, so the 30th link keeps showing the month
 * it was made for, with a line on the page saying exactly that.
 */
export const GUARDIAN_LINK_TTL_DAYS = 30;

/* ------------------------------------------------------------------------- *
 * Errors
 *
 * Every refusal in this file carries a MACHINE code and a DICTIONARY key, and
 * never a sentence. The route sends `{ error: code, message: key }` â€” the
 * shape client/src/api.js already documents â€” and the screen renders
 * `t(err.message)`. That is what stops a piece of this feature's own copy from
 * being hard-coded in English by accident, which is exactly what a consent
 * refusal or a "that is your own address" note would otherwise become.
 * ------------------------------------------------------------------------- */

function refuse(code, key, status = 400) {
  const err = new Error(key);
  err.status = status;
  err.code = code;
  err.key = key;
  return err;
}

/* ------------------------------------------------------------------------- *
 * Validation
 * ------------------------------------------------------------------------- */

/**
 * The rules for a guardian's address. The email shape is the app's own
 * validator (services/accounts.js) so the reset form and this card cannot
 * disagree about what an address is.
 */
export function guardianEmailProblem(user, rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();

  if (!email) return { code: 'email_missing', key: 'guard.issue.emailMissing' };
  if (emailProblem(email)) return { code: 'email_invalid', key: 'guard.issue.emailInvalid' };

  // The subdocument caps the address at 100 characters, so an address that
  // passes the shape test but not the storage test would fail on save with a
  // Mongoose message. Caught here, where the student can be told why.
  if (email.length > 100) return { code: 'email_too_long', key: 'guard.issue.emailTooLong' };

  // Their own sign-in address AND their own recovery address. A student who
  // points a "share with a parent" link at themselves has misunderstood the
  // feature, and a sentence saying so is kinder than a summary they then read
  // alone thinking somebody was looking at it.
  if (email === String(user.email || '').toLowerCase() || email === String(user.recoveryEmail || '').toLowerCase()) {
    return { code: 'email_own', key: 'guard.issue.emailOwn' };
  }
  return null;
}

/* ------------------------------------------------------------------------- *
 * The summary â€” ONE function, two callers
 * ------------------------------------------------------------------------- */

/**
 * The summary for one account and one month. This is the ONLY function in the
 * app that builds one, and both the student's preview and the guardian's page
 * call it. That is the whole answer to "they will drift": there is no second
 * copy to drift from, and the test asserts the two payloads are identical for
 * the same month.
 *
 * The month figures are NOT re-derived here. `categoryReport` is the same call
 * the Reports screen makes, so a guardian and a student looking at the same
 * month are reading the same rounding of the same aggregation; and the budget
 * percentages come straight out of `progressForMonth`, which is the one place
 * the app already decides what a percentage of a budget is. A summary that
 * disagreed with the app's own report by a rounding would be a support call.
 */
export async function buildSummary(user, month) {
  const start = parseMonth(month);

  const [report, budgets] = await Promise.all([
    categoryReport(user, { month: start }),
    progressForMonth(user, start),
  ]);

  // Savings: the goal is the student's own (User.monthlySavingsGoal) and "saved"
  // is the month's balance â€” income minus expenses â€” which is precisely the
  // `saved` the dashboard's goal card already shows for the same month and the
  // same arithmetic (`round2(income - expense)`). Reusing it means the guardian
  // and the student see the same savings number, not two plausible ones.
  //
  // The savings JAR is read here on purpose and deliberately NOT sent: it is the
  // pot behind a private wishlist (ReadMe: "a private wishlist fed by a
  // micro-savings jar"), it is not the figure the goal card measures itself
  // against, and publishing its existence would publish a private thing. A
  // feature whose third section is a metric nobody can check is worse than one
  // that says plainly what it does and does not have.
  const goal = toNum(user.monthlySavingsGoal);
  const saved = report.totals.balance;
  const hasGoal = goal !== null && goal > 0;
  const pct = hasGoal ? Math.min(100, Math.round((saved / goal) * 100)) : null;

  return {
    // "2026-09" â€” a machine key, not a sentence, and the month the summary is
    // ABOUT. The page turns it into the reader's own month name.
    month: monthKey(start),
    // The name on the account, which is the name the student chose to be
    // called. Nothing else about them is here: not their sign-in address, not
    // their recovery address, not their year, not a group, not a wallet.
    studentName: user.name,
    // The unit the amounts are actually denominated in. Money without a unit
    // is not information, and this is a three-letter code rather than a fact
    // about the person.
    currency: user.ledgerCurrency || user.currency || 'USD',

    /* 1 of 3 â€” month-level category totals. Name and total, no dates. */
    categories: report.rows
      // A category that was used LAST month and not this one arrives with an
      // amount of 0; showing it would tell the guardian something about a month
      // the summary is not about.
      .filter((row) => row.amount > 0)
      .map((row) => ({ category: row.name, amount: row.amount })),

    /* 2 of 3 â€” budget adherence, as a percentage and nothing more. The limit
       and the spend are both deliberately left out: the percentage is what the
       feature promised, and the other two numbers are somebody else's plan. */
    budgets: budgets
      // A budget whose category has been deleted cannot be named, and inventing
      // a label here would be the server writing a sentence.
      .filter((b) => b.category?.name)
      .map((b) => ({ category: b.category.name, pct: b.pct, tone: b.tone })),

    /* 3 of 3 â€” the savings goal against what is saved this month. `state` is a
       machine token, not copy: it lets the page say "no goal set" or "nothing
       saved yet" honestly instead of printing a 0% that reads like a verdict. */
    savings: {
      goal: hasGoal ? goal : null,
      saved,
      pct,
      state: !hasGoal ? 'no-goal' : saved <= 0 ? 'nothing-saved' : pct >= 100 ? 'met' : 'short',
    },
  };
}

/* ------------------------------------------------------------------------- *
 * Consent
 * ------------------------------------------------------------------------- */

/**
 * Record the permission: the address, and the moment it was given.
 *
 * Both are stored together on the account (see the `guardian` subdocument in
 * models/User.js) so consent can never be inferred from the address merely
 * being there. `consentedAt` is written ONCE â€” a student who re-confirms a
 * month later has not agreed again on that later day, and the date the
 * agreement was first given is the date worth keeping.
 *
 * No tick, no record: `consent` has to be exactly true, which is what the
 * checkbox in the card is sending.
 */
export async function recordConsent(user, { email, consent }) {
  const problem = guardianEmailProblem(user, email);
  if (problem) throw refuse(problem.code, problem.key);
  if (consent !== true) throw refuse('not_consented', 'guard.issue.notConsented');

  const clean = String(email).trim().toLowerCase();
  const already = user.guardian?.consentedAt ? new Date(user.guardian.consentedAt) : null;

  user.guardian = {
    email: clean,
    consentedAt: already || new Date(),
    lastIssuedAt: user.guardian?.lastIssuedAt || null,
  };
  await user.save();
  return user;
}

/* ------------------------------------------------------------------------- *
 * Issuing, reading and revoking the link
 * ------------------------------------------------------------------------- */

/**
 * Mint a link. It REFUSES without a stored `consentedAt` â€” that field is the
 * permission, not a note about one â€” so no caller, no route and no future
 * endpoint can produce a shareable link out of nothing.
 */
export async function issueLink(user) {
  if (!user.guardian?.email || !user.guardian?.consentedAt) {
    throw refuse('not_consented', 'guard.issue.notConsented');
  }

  // One live link per account, always. Issuing again retires the previous one
  // rather than stacking up: a student who issues a new link in October is
  // replacing the September one in their chat, and the old link dying with it
  // is the behaviour they expect rather than a surprise.
  await GuardianLink.deleteMany({ user: user._id });

  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const month = monthStart(new Date());
  const issuedAt = new Date();

  await GuardianLink.create({
    user: user._id,
    // The hash is the row's identity. The token itself exists for exactly as
    // long as this HTTP response and is never written anywhere.
    tokenHash: sha256(token),
    month,
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + GUARDIAN_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
  });

  // Written field by field rather than spread: the subdocument has exactly
  // three fields and a spread would quietly carry a fourth along if one is ever
  // added, which is how consent could start travelling somewhere it should not.
  user.guardian = {
    email: user.guardian.email,
    consentedAt: user.guardian.consentedAt,
    lastIssuedAt: issuedAt,
  };
  await user.save();

  return {
    // The whole of the capability, in plain text, exactly once.
    token,
    url: `${env.appUrl}/guardian/${token}`,
    month: monthKey(month),
    expiresAt: new Date(issuedAt.getTime() + GUARDIAN_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

/**
 * Revoke. The rows are DELETED and the address, the consent and the issue time
 * are all cleared, so the link is dead at the storage layer and not merely in
 * the branch that happens to test a flag. The very next request for that token
 * is a miss, with nothing left to serve.
 *
 * `lastIssuedAt` goes too: after a revoke there is no issue time to report,
 * and leaving one behind would be the app telling the student a link exists
 * when none does.
 */
export async function revokeGuardianLink(user) {
  const result = await GuardianLink.deleteMany({ user: user._id });
  user.guardian = { email: '', consentedAt: null, lastIssuedAt: null };
  await user.save();
  return { removed: result.deletedCount || 0 };
}

/**
 * The state the student's own settings card reads. The student's own guardian
 * address is their own data â€” it is on their account and they typed it â€” so it
 * is shown to them. It is never part of a shared summary.
 *
 * `configured` means "a link exists and is still inside its TTL", which is what
 * the card needs to know in order to offer "issue" or "issue a new one".
 */
export async function guardianState(user) {
  const link = await GuardianLink.findOne({ user: user._id, expiresAt: { $gt: new Date() } })
    .select('_id')
    .lean();

  return {
    configured: Boolean(link),
    consentedAt: user.guardian?.consentedAt || null,
    email: user.guardian?.email || null,
    lastIssuedAt: user.guardian?.lastIssuedAt || null,
  };
}

/**
 * The public read. Returns the summary, or `null` for anything at all that is
 * not a live link â€” unknown, malformed, expired, deleted by a revoke. All four
 * are the SAME null, so the route can only ever answer one plain 404 and a
 * stranger cannot tell a real token from a dead one, a revoked one from a
 * guessed one, or a live one from somebody else's.
 *
 * A bad token is never told what was wrong, and the read performs no writes:
 * opening the page cannot change a thing.
 */
export async function readSharedSummary(token) {
  const raw = String(token || '');
  // A token is 43 base64url characters. Checking the length first is not an
  // optimisation: it keeps a junk path off the database entirely, and it means
  // the constant-time compare below is only ever given a well-formed candidate.
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;

  const candidate = sha256(raw);
  const link = await GuardianLink.findOne({ tokenHash: candidate }).lean();
  if (!link) return null;
  if (sameHash(candidate, link.tokenHash) !== true) return null;
  if (!link.expiresAt || new Date(link.expiresAt).getTime() <= Date.now()) return null;

  const user = await User.findById(link.user);
  // The account is the summary's only subject. An account that has been removed
  // leaves a link with nothing behind it, which is a 404 like any other.
  if (!user || !user.isActive) return null;

  return buildSummary(user, link.month);
}

/**
 * Constant-time hash comparison. The lookup above already matched on an
 * indexed exact value, so this is belt and braces rather than the thing standing
 * between us and a timing attack â€” but the password reset discipline is copied
 * wholesale rather than half-copied, and a reader looking for the check finds
 * it. `timingSafeEqual` throws on a length mismatch, so the lengths are
 * compared first (that comparison leaks nothing: both are fixed-length digests
 * of a value that passed the shape test above).
 */
function sameHash(a, b) {
  const left = Buffer.from(String(a), 'hex');
  const right = Buffer.from(String(b), 'hex');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
