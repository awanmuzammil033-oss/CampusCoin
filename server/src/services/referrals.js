import crypto from 'node:crypto';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import ReferralReward from '../models/ReferralReward.js';
import env from '../config/env.js';

/**
 * Invite a friend, and reward the people who actually turn up (NEW-10).
 *
 * The whole feature is three decisions, and every rule below exists because of
 * one of them:
 *
 *  1. **A code, not an account.** The thing that gets shared is `ABC7K2MPD` and
 *     the link is built from it, so resolving a code needs no session and no
 *     round trip through anything the visitor has. The code is generated the
 *     first time the owner reads their own card and never changes afterwards —
 *     a code that could be reissued is a link that could point at somebody else
 *     next month.
 *
 *  2. **A reward needs proof the invitee came to USE the app.** Registering
 *     through a link is one line of typing. Logging a transaction is the whole
 *     point of the app. So the reward waits for the first entry, and the id of
 *     that entry is stored on the reward row, which makes the claim auditable
 *     instead of a boast on a screen.
 *
 *  3. **A reward must not be cheaper to fake than to earn.** The cap, the
 *     one-per-invitee rule, the 24-hour floor on the inviter's age and the
 *     write-once referral are all enforced here, and the two that a race could
 *     beat are enforced by unique indexes in ReferralReward.js rather than by a
 *     check-then-write.
 *
 * What is NOT here, and is not pretended to be: there is no device fingerprint,
 * no IP record, no phone-number check and no proof of identity. The one
 * powerful attack this feature cannot see is a set of accounts made by one
 * person, spread over several addresses, each left alone for a day. The rules
 * raise the cost of that attack; they do not close it. Anything claiming
 * otherwise would be worse than saying so.
 */

/**
 * The alphabet a code is built from, and the reason it is not A-Z0-9.
 *
 * 0 O and 1 l are the pairs a person gets wrong when they read a code out on a
 * phone call or type it off a screenshot — and a mistyped code is a support
 * ticket, not a lost referral. I and L go with them: the code is uppercased
 * before it is stored, so excluding the *lowercase* 'l' means excluding the
 * capital L, and a capital I next to a capital L is the same confusion again.
 *
 * 31 characters to the power of 8, so a code is not guessable and a stranger
 * cannot walk the space.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 8;

/** Rewards one inviter can ever earn. The 6th qualifying referral earns nothing. */
export const REFERRAL_CAP = 5;

/**
 * How old an account must be before its code can bring anybody in. A chain of
 * fresh accounts is the other obvious way to farm a badge, and one day is the
 * cheapest thing that breaks most of it: you cannot make six accounts and have
 * the first one old enough. It stops the lazy version and not the determined
 * one — see the note at the top of this file.
 */
export const INVITER_MIN_AGE_HOURS = 24;

/** Attempts before a code collision is treated as a real failure. */
const CODE_ATTEMPTS = 6;

/** Attempts at claiming a free slot before the award is left for the next read. */
const AWARD_ATTEMPTS = 6;

const HOUR = 60 * 60 * 1000;

/* --------------------------------- the code --------------------------------- */

/** Eight characters from the safe alphabet, from the CSPRNG and not Math.random. */
export function randomCode() {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    // randomInt is uniform, so no character is a little more likely than another
    out += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * A code as it can exist, or ''. A shape that fails this can never have been
 * issued, so it is a 404 without a database round trip — and it is also the
 * guard that keeps a `$` or a very long string out of a query.
 */
export function normaliseCode(raw) {
  const code = String(raw ?? '').trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return '';
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return '';
  return code;
}

/**
 * The owner's code, made on first read and never again.
 *
 * The write is a compare-and-set: the filter only matches while the field is
 * still ABSENT, so two people opening the card in the same second cannot both
 * write one — the loser matches nothing and reads the winner's. (`referralCode`
 * is `default: undefined` on the model precisely so that "absent" is a state
 * the database can see; with a null default every account without a code would
 * be indistinguishable from every other one.)
 *
 * A collision on the unique index is NOT a failure: another account already
 * holds that code, so a new one is drawn and the insert is tried again. The
 * generator is a parameter so that retry can be tested without mocking this
 * module — see tests/referrals.test.js.
 */
export async function ensureReferralCode(user, { makeCode = randomCode } = {}) {
  if (user.referralCode) return user.referralCode;

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    // A code that fails the shape check could never be resolved again, so a
    // broken generator is skipped rather than stored.
    const code = normaliseCode(makeCode());
    if (!code) continue;
    try {
      const updated = await User.findOneAndUpdate(
        // absent OR empty, so an account whose field somehow holds a null is
        // repaired rather than 500-ing on every read of its own card
        { _id: user._id, $or: [{ referralCode: { $exists: false } }, { referralCode: null }] },
        { $set: { referralCode: code } },
        { new: true }
      );
      if (updated?.referralCode) {
        user.referralCode = updated.referralCode;
        return updated.referralCode;
      }
      // Matched nothing: somebody else wrote the field between our read and
      // this update, so their code is the code.
      const fresh = await User.findById(user._id).select('referralCode');
      if (fresh?.referralCode) {
        user.referralCode = fresh.referralCode;
        return fresh.referralCode;
      }
    } catch (err) {
      if (err.code !== 11000) throw err;
      // 11000 = this exact code is already somebody else's. Draw another.
    }
  }

  const err = new Error('Could not set a referral code. Please try again.');
  err.status = 500;
  throw err;
}

/** The shareable link. Absolute, because it is read on somebody else's phone. */
export function shareUrlFor(code) {
  return `${String(env.appUrl || '').replace(/\/+$/, '')}/r/${code}`;
}

/* ------------------------------ the public read ------------------------------ */

/**
 * A code resolved to a NAME and nothing else.
 *
 * This is the one read in the feature that a stranger can make, so it is
 * deliberately the smallest answer the screen can be built from: the inviter's
 * display name. No id, no email, no referral count, no created date — every one
 * of those would turn a shareable link into a directory of who uses this app.
 * Returns null for anything that is not a live student account with that code.
 */
export async function resolvePublicCode(rawCode) {
  const code = normaliseCode(rawCode);
  if (!code) return null;

  const inviter = await User.findOne({ referralCode: code, role: 'student', isActive: true })
    .select('name')
    .lean();
  if (!inviter) return null;
  return { name: inviter.name };
}

/* ------------------------------ at sign-up only ------------------------------ */

/**
 * Read the code out of a registration, and say whether it may be used.
 *
 * The three refusals, in the order they are cheapest to check:
 *  - the code is not a code, or belongs to nobody  → the account is simply
 *    created with no inviter. A student must never be told "that code is
 *    invalid" — it would be an oracle for guessing codes, and it would be a
 *    sentence in the wrong language on a screen nobody wrote;
 *  - the code belongs to the address being registered → refused. This is the
 *    same person signing up twice, and it is caught at the only place it can
 *    be: the addresses. It is NOT caught for a second, unrelated address
 *    belonging to the same human, and it cannot be without identity checks;
 *  - the inviter's account is younger than a day → refused. Same outcome (no
 *    inviter), because a refusal the student can see is an invitation to try
 *    the next code.
 *
 * `refused` is a machine word for the service's own log and for tests. The
 * route that reads a code does NOT show it: a signup always succeeds, with or
 * without an inviter.
 */
export async function readReferralFromSignup(rawCode, { email, recoveryEmail } = {}) {
  const code = normaliseCode(rawCode);
  if (!code) return { inviter: null, refused: null };

  const inviter = await User.findOne({ referralCode: code, role: 'student', isActive: true })
    .select('_id name email recoveryEmail createdAt');
  if (!inviter) return { inviter: null, refused: 'unknown-code' };

  if (isSamePerson(inviter, email, recoveryEmail)) return { inviter: null, refused: 'self' };
  if (ageMs(inviter) < INVITER_MIN_AGE_HOURS * HOUR) return { inviter: null, refused: 'inviter-too-new' };

  return { inviter, refused: null };
}

/**
 * Whether the addresses being registered are the inviter's own. Both the sign-in
 * address and the recovery address are compared, because either one on its own
 * is enough for somebody to prove the two accounts are theirs.
 */
function isSamePerson(inviter, email, recoveryEmail) {
  const clean = (value) => String(value || '').trim().toLowerCase();
  const mine = [clean(inviter.email), clean(inviter.recoveryEmail)].filter(Boolean);
  const theirs = [clean(email), clean(recoveryEmail)].filter(Boolean);
  return mine.some((address) => theirs.includes(address));
}

/** Milliseconds since the account was created. Timestamps are always present. */
function ageMs(user, now = new Date()) {
  return now.getTime() - new Date(user.createdAt).getTime();
}

/**
 * Point a new account at the person who brought it. ONCE, ever.
 *
 * The filter is the whole rule: it only matches while `referredBy` is still
 * null, so a second call rewrites nothing and the account keeps the first
 * inviter it ever had. That is why a referral cannot be reassigned — a
 * reassignable referral is a referral that can be moved to whichever account is
 * closest to the cap, as often as somebody likes.
 */
export async function attachReferral(inviter, invitee) {
  if (!inviter?._id || !invitee?._id) return { ok: false, refused: 'no-such-person' };
  if (String(inviter._id) === String(invitee._id)) return { ok: false, refused: 'self' };

  const at = new Date();
  const result = await User.updateOne(
    { _id: invitee._id, referredBy: null },
    { $set: { referredBy: inviter._id, referredAt: at } }
  );
  if (!result.matchedCount) return { ok: false, refused: 'already-set' };
  return { ok: true, referredAt: at };
}

/* ------------------------------ earning a reward ----------------------------- */

/**
 * The first entry each referred account has logged, in one query.
 *
 * `createdAt` is the sort, not `date`: the qualifying moment is that somebody
 * *logged* something, and an entry backdated to last month is still logged now.
 * A wallet transfer is not a transaction (NEW-11 keeps those in their own
 * collection), so anything in this collection is a real use of the app.
 */
async function firstTransactionsOf(userIds) {
  if (userIds.length === 0) return new Map();

  const rows = await Transaction.aggregate([
    { $match: { user: { $in: userIds }, isDeleted: false } },
    { $sort: { createdAt: 1 } },
    { $group: { _id: '$user', transactionId: { $first: '$_id' }, at: { $first: '$createdAt' } } },
  ]);

  const map = new Map();
  for (const row of rows) map.set(String(row._id), row);
  return map;
}

/** The slots already taken by this inviter, and the invitees they belong to. */
async function rewardState(inviterId) {
  const rows = await ReferralReward.find({ inviter: inviterId }).select('invitee slot').lean();
  const taken = new Set();
  const rewarded = new Set();
  for (const row of rows) {
    taken.add(row.slot);
    rewarded.add(String(row.invitee));
  }
  return { taken, rewarded };
}

function firstFreeSlot(taken) {
  for (let slot = 1; slot <= REFERRAL_CAP; slot += 1) if (!taken.has(slot)) return slot;
  return null;
}

/**
 * Write one reward, or say why not.
 *
 * The two unique indexes are what make this safe under concurrency, and the
 * error tells them apart:
 *  - the (inviter, invitee) index says no  → this invitee has already been
 *    rewarded, which is the correct outcome and not an error. It is treated as
 *    success-with-nothing-written, exactly as the reminders treat a duplicate
 *    due date (see services/subscriptions.js → writeReminder);
 *  - the (inviter, slot) index says no   → another request took that seat
 *    while we were writing. The taken seats are re-read and the next free one
 *    tried, so two people qualifying at the same second both get their reward
 *    when there is room, and the one that has no room is refused rather than
 *    counted.
 *
 * Returns `{ row }` or `{ reason }` where reason is 'already', 'cap' or 'busy'.
 */
async function awardOne(inviterId, inviteeId, transactionId, state) {
  for (let attempt = 0; attempt < AWARD_ATTEMPTS; attempt += 1) {
    if (state.rewarded.has(inviteeId)) return { row: null, reason: 'already' };

    const slot = firstFreeSlot(state.taken);
    if (slot === null) return { row: null, reason: 'cap' };

    const at = new Date();
    try {
      const row = await ReferralReward.create({
        inviter: inviterId,
        invitee: inviteeId,
        slot,
        qualifiedBy: transactionId,
        qualifiedAt: at,
        qualifiedOn: startOfDay(at),
      });
      state.taken.add(slot);
      state.rewarded.add(inviteeId);
      return { row, reason: null };
    } catch (err) {
      if (err.code !== 11000) throw err;
      if (err.keyPattern?.invitee) {
        state.rewarded.add(inviteeId);
        return { row: null, reason: 'already' };
      }
      // a seat went while we were writing — re-read and try the next one
      Object.assign(state, await rewardState(inviterId));
    }
  }
  return { row: null, reason: 'busy' };
}

/**
 * Award every reward that is due, for one inviter. Idempotent: running it twice
 * writes nothing the second time, because both unique indexes refuse.
 *
 * This is called on every read of the owner's own card, which is the app's own
 * idiom for a rule that must not be left to a timer (see services/groups.js →
 * linkGroupsForEmail, and subscriptions.js → checkRenewals). The invitee does
 * not have to do anything for the reward to appear, and no clock job is needed.
 *
 * Returns counts, not sentences: `{ awarded, pending, capped }` — the words are
 * written by the client from the dictionary. `capped` counts the referrals that
 * DID qualify and earn nothing because the cap was full, which is the number
 * the card has to be able to show rather than round silently to six.
 */
export async function qualifyRewardsFor(inviterId) {
  // the id is passed through as it arrives rather than cast here, so a caller
  // holding either an ObjectId or its string gets the same answer instead of a
  // BSON error it would have to know about
  // oldest referral first, so the seat numbers and the reward order both follow
  // the order people actually arrived in
  const referred = await User.find({ referredBy: inviterId }).select('_id referredAt').sort({ referredAt: 1 }).lean();
  if (referred.length === 0) return { awarded: 0, pending: 0, capped: 0 };

  const state = await rewardState(inviterId);
  const waiting = referred.filter((person) => !state.rewarded.has(String(person._id))).map((person) => person._id);
  if (waiting.length === 0) return { awarded: 0, pending: 0, capped: 0 };

  const firsts = await firstTransactionsOf(waiting);

  let awarded = 0;
  let pending = 0;
  let capped = 0;
  for (const inviteeId of waiting) {
    const first = firsts.get(String(inviteeId));
    if (!first) {
      // signed up through the link and has not logged an entry yet: the reward
      // waits. This is the case people forget, and it is most of them.
      pending += 1;
      continue;
    }
    const result = await awardOne(inviterId, inviteeId, first.transactionId, state);
    if (result.row) awarded += 1;
    else if (result.reason === 'cap' || result.reason === 'busy') capped += 1;
  }
  return { awarded, pending, capped };
}

/* --------------------------------- the card --------------------------------- */

/**
 * Everything the invite card needs, in facts only.
 *
 * `shareText` is a KEY and its values, not a sentence: the message a student
 * sends to a friend is read by that friend, and the server does not get to
 * decide in which of the fourteen languages they read it. The client calls
 * `t(shareText.key, shareText.vars)` — the same messageKey/data shape the
 * renewal notices already carry.
 *
 * The list of who joined carries a name and nothing else. An invitee who signed
 * up through this link is not a public figure, and the code owner's card has no
 * business carrying their address.
 */
export async function myReferrals(user) {
  const code = await ensureReferralCode(user);
  const url = shareUrlFor(code);

  // The repair runs BEFORE the read below, so a reward that is due is in the
  // answer to this very request rather than one refresh later.
  await qualifyRewardsFor(user._id);

  const [people, rewards] = await Promise.all([
    User.find({ referredBy: user._id })
      .select('name referredAt')
      .sort({ referredAt: 1 })
      .lean(),
    ReferralReward.find({ inviter: user._id }).select('invitee slot qualifiedOn').lean(),
  ]);

  const byInvitee = new Map();
  for (const reward of rewards) byInvitee.set(String(reward.invitee), reward);

  const joined = people.map((person) => {
    const reward = byInvitee.get(String(person._id));
    return {
      name: person.name,
      // the day, at UTC midnight, so the list cannot disagree with itself
      // depending on whose phone is reading it
      joinedOn: startOfDay(person.referredAt || person.createdAt),
      rewarded: Boolean(reward),
      slot: reward ? reward.slot : null,
      qualifiedOn: reward ? reward.qualifiedOn : null,
    };
  });

  const rewarded = rewards.length;
  return {
    code,
    url,
    shareText: { key: 'ref.share.body', vars: { name: user.name, link: url } },
    joined,
    rewarded,
    cap: REFERRAL_CAP,
    capReached: rewarded >= REFERRAL_CAP,
    // joined but not yet proved: the count the card explains rather than hides
    pending: joined.filter((row) => !row.rewarded).length,
  };
}

/* --------------------------------- helpers --------------------------------- */

/** UTC midnight — the app's rule for a calendar day. */
function startOfDay(value) {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(String(value));
  if (day) return new Date(`${day[0].slice(0, 10)}T00:00:00.000Z`);
  const d = new Date(value);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
