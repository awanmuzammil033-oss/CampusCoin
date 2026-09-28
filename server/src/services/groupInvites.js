import crypto from 'node:crypto';
import mongoose from 'mongoose';
import QRCode from 'qrcode';

import GroupInvite from '../models/GroupInvite.js';
import Group from '../models/Group.js';
import env from '../config/env.js';
import { loadGroupFor, requireCapability } from './groups.js';

/**
 * A group's QR invite (NEW-7): the paper version of "add a roommate".
 *
 * WHAT IS AND IS NOT AN INVITE
 * ---------------------------
 * The permission is `manage`, taken from the same table as everything else in a
 * group (services/groups.js → GROUP_ROLES / requireCapability). In that table
 * `manage` belongs to `admin` ALONE, and the owner is an admin by construction
 * (models/Group.js — members[0]). So today the people who can issue an invite
 * are the OWNER and any ADMIN. A treasurer can add bills, settle up, post
 * journal entries and run the reconciliation, and cannot do this: issuing an
 * invite is a way of changing who is in the group, which is the same power as
 * "add a roommate" and "set a role" — the two things `manage` means.
 *
 * The capability is asked for, never the role name. If `manage` is ever widened
 * to the treasurer in that one table, this module follows it for free.
 *
 * THE TOKEN
 * ---------
 * 32 bytes from `crypto.randomBytes`, base64url'd: 43 characters, 256 bits, and
 * URL-safe, so it survives a printed poster and a copy-paste without escaping.
 * Only `sha256(token)` is stored (`select: false` on the field), which means a
 * dump of the collection is not a list of working invites — the same property
 * the password reset relies on.
 *
 * The comparison is `crypto.timingSafeEqual` over equal-length buffers, run
 * against the row that a hash lookup has already produced. Be clear about what
 * that is and is not: the LOOKUP is an indexed seek on the same hash, so a
 * wrong token never reaches a string comparison in the first place, and the
 * real defences are the 256 bits of entropy and the fact that nothing is
 * stored in plain text. The timing-safe compare is belt and braces for the
 * path where the row is already in hand. It is cheap and it removes a habit
 * worth not having, not a hole that was open.
 *
 * THE SENTENCES
 * -------------
 * Nothing in this file writes a sentence a reader will see. Every refusal is a
 * CODE, and the client turns a code into a dictionary key (see
 * routes/groupInvites.js and components/JoinGroupPanel.jsx). That is the whole
 * reason an invite can be refused in fourteen languages: the server has no
 * English to translate. `requireCapability` does still throw groups.js's own
 * English sentence, because that is shared middleware and not this feature's
 * to change — the client maps any 403 onto `invite.noPermission` rather than
 * showing whatever arrived.
 *
 * The one caller-visible table of codes:
 *
 *   expired        expired, revoked, unknown, already-used — deliberately the
 *                  same answer for all four, so nothing can be learned by
 *                  probing which of them a token is
 *   alreadyMember  this account is already in the group
 *                  (mirrors services/groups.js → addMember)
 *   groupFull      the group is at MAX_MEMBERS
 *                  (mirrors the sentence addMember uses)
 *   groupClosed    the group is archived
 *   groupGone      the group no longer exists
 *   liveExists     a live invite already exists for this group
 *   tooManyTries   this account has redeemed too many links in the window
 *                  (carries `waitMinutes`)
 *   noGroup        the group is not yours to see
 *   noInvite       no such invite in this group
 *
 * `requireCapability` and `loadGroupFor` still raise groups.js's own English
 * sentences, because those are shared and not this feature's to change. Both
 * arrive as a bare 404 or 403 with no `code`, and the client maps those two
 * statuses onto `invite.noGroup` and `invite.noPermission` rather than
 * printing whatever came back.
 */

/** 48 hours, as asked — an absolute instant, never a duration recomputed. */
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
export const INVITE_TTL_HOURS = 48;

/**
 * How many live invites one group may hold.
 *
 * ONE, and that is a decision rather than a default. The alternative —
 * revoke the old code and mint a new one on every request — is friendlier to
 * the owner pressing the button twice and worse for everybody else: a code that
 * has already been photographed off a noticeboard would go quietly dead, and
 * the person holding it would be told "this link has expired" with nothing to
 * act on. Refusing keeps a link that is already in the world working for its
 * full 48 hours, and the owner is given the one action that should follow from
 * "I want a new code": revoke it on purpose.
 *
 * It is a named constant and a `countDocuments` against the live set rather
 * than a special case, so raising it later changes nothing else.
 */
export const MAX_LIVE_INVITES = 1;

/**
 * The size of a group.
 *
 * `services/groups.js` owns this number and does not export it, and that file
 * is not this feature's to edit. Rather than let the two drift apart quietly,
 * the suite drives `addMember` itself until it refuses, and asserts that this
 * value and that refusal agree on both the count and the wording — so if the
 * real cap is ever changed, this test fails and says so.
 */
export const MAX_MEMBERS = 20;

/**
 * A real rate limit, not a comment about needing one.
 *
 * The abuse this bounds is VOLUME, not guessing: a QR on a poster is walked
 * into by people, and a token with 256 bits behind it cannot be brute-forced
 * whatever this number is. What this stops is one account carrying a stack of
 * printed links through a dorm block and redeeming them all, which is a real
 * shape for "a group a roommate was invited to" and would otherwise be
 * unlimited.
 *
 * Successful joins COUNT towards the budget on purpose — the abuse is links
 * redeemed, not links mistyped — so the limit is "ten groups in a quarter of
 * an hour", which is far more than any person joining a group ever needs and
 * far less than a stack of posters.
 *
 * In-process and per-process, like the login limiter in middleware/rateLimit.js
 * (express-rate-limit's default memory store). A restart clearing the window is
 * acceptable for the same reason it is there: this is a speed bump on one
 * account, not the account-level brute-force guard.
 */
export const JOIN_WINDOW_MS = 15 * 60 * 1000;
export const JOIN_ATTEMPT_LIMIT = 10;

/** account id -> the timestamps of that account's recent join attempts. */
const joinAttempts = new Map();

/** Where the link points, as a path. The client route is /join/:token. */
export const INVITE_PATH = '/join';

/**
 * A fresh token, and the hash of it. Two values, because the plain one has a
 * lifetime of a single response and the hashed one has to outlive it.
 */
export function newInviteToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: sha256(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) };
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * The one place two hashes are compared. `timingSafeEqual` throws when the
 * buffers are different lengths, so the length check is part of the comparison
 * and not a shortcut around it.
 */
export function tokenMatches(hash, token) {
  const a = Buffer.from(String(hash || ''), 'utf8');
  const b = Buffer.from(sha256(token), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** The shape a token has to have before it is worth hashing. */
function looksLikeToken(value) {
  return /^[A-Za-z0-9_-]{43}$/.test(String(value || ''));
}

/** LIVE = not used, not revoked, and still inside its own 48 hours. */
export function isLive(invite, now = new Date()) {
  if (!invite) return false;
  if (invite.usedAt || invite.revokedAt) return false;
  return invite.expiresAt instanceof Date && invite.expiresAt.getTime() > now.getTime();
}

/* ------------------------------- issuing -------------------------------- */

/**
 * Mint a code for a group. Permission-checked on `manage`; the plain token and
 * the rendered code go back in this one response and nowhere else, ever.
 *
 * The refusal order is deliberate. A FULL group is refused before the live-
 * invite cap, so "this group cannot take another person" is never masked by
 * "you already have a code out there" — an invite nobody could accept is worse
 * than no invite, and the reason has to be the true one.
 */
export async function issueInvite(user, groupId) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'manage');

  if (group.archived) throw fail(400, 'groupClosed');
  if (group.members.length >= MAX_MEMBERS) throw fail(400, 'groupFull');

  const live = await GroupInvite.countDocuments(liveQuery(group._id));
  if (live >= MAX_LIVE_INVITES) throw fail(400, 'liveExists');

  const { token, hash, expiresAt } = newInviteToken();
  const invite = await GroupInvite.create({
    group: group._id,
    tokenHash: hash,
    createdBy: user._id,
    expiresAt,
  });

  const url = inviteUrl(token);
  return {
    invite: {
      id: invite._id.toString(),
      token,
      url,
      svg: await codeSvg(url),
      expiresAt: new Date(expiresAt).toISOString(),
      groupName: group.name,
    },
  };
}

/** The link a stranger's phone opens, built from the base URL the app is served on. */
export function inviteUrl(token) {
  return `${String(env.appUrl || '').replace(/\/+$/, '')}${INVITE_PATH}/${token}`;
}

/**
 * The code, rendered ON THE SERVER.
 *
 * The brief asked for `segno`, which does not exist on npm (it is a Python
 * package; the JavaScript port is published under other names), so this uses
 * `qrcode` — same security shape as the brief wanted, and worth being exact
 * about what that shape is:
 *
 *   - the SVG is produced by code in THIS repository, from a string this
 *     server built. There is no third-party renderer, no CDN and no browser
 *     library encoding the token, so the secret never leaves the process in
 *     anything but this response.
 *   - rendering it in the browser instead would put the encoding in the page
 *     and add a client dependency for a one-line string; the token would still
 *     be in the response either way, so nothing is gained and the reviewer
 *     would have two different security stories to check.
 *
 * The colours are the library's own defaults — black on white, which is what a
 * printed poster needs — so no colour literal is written here at all.
 */
export async function codeSvg(url) {
  return QRCode.toString(String(url), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
  });
}

/** What is out there for this group right now. `manage` only. */
export async function listInvites(user, groupId) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'manage');

  const rows = await GroupInvite.find(liveQuery(group._id)).sort({ createdAt: -1 });
  return {
    invites: rows.map((row) => ({
      id: row._id.toString(),
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      expiresAt: new Date(row.expiresAt).toISOString(),
    })),
  };
}

/**
 * Revoke. Idempotent on purpose: pressing the button twice must not produce a
 * 404 the second time, because the state it was trying to reach is already
 * true. A spent invite revokes to a no-op too — a code that has already been
 * used is not out there to be taken back.
 */
export async function revokeInvite(user, groupId, inviteId) {
  const group = await loadGroupFor(user, groupId);
  requireCapability(group, user, 'manage');

  // A malformed id and an id from another group are the same 404: the caller
  // has already been shown they may manage THIS group, so there is nothing
  // left to disclose about a row that is not theirs.
  if (!mongoose.isValidObjectId(inviteId)) throw notFound('noInvite');
  const invite = await GroupInvite.findOne({ _id: inviteId, group: group._id });
  if (!invite) throw notFound('noInvite');

  if (!invite.usedAt && !invite.revokedAt) {
    invite.revokedAt = new Date();
    await invite.save();
  }
  return {
    invite: {
      id: invite._id.toString(),
      revokedAt: invite.revokedAt ? new Date(invite.revokedAt).toISOString() : null,
    },
  };
}

/* ---------------------------- the public read ---------------------------- */

/**
 * What a confirmation screen is allowed to know, and nothing else.
 *
 * THREE FIELDS. The group's name, how many people are in it, and whether the
 * code still works. Not the members, not the bills, not the balances, not the
 * currency, not who issued it — a stranger with a photograph of somebody's
 * noticeboard gets a name and a headcount, which is what they need to decide
 * whether to walk into a group they were invited to, and not one byte more.
 *
 * There is deliberately NO `requireStudent` on this route: the person holding
 * the code is, by definition, not signed in yet. That makes the 256-bit token
 * the only thing standing between a stranger and the group's name, which is
 * why the token is long, hashed at rest, and single-use.
 *
 * EVERY DEAD TOKEN IS THE SAME ANSWER. Expired, revoked, unknown, already
 * used, and — see below — a group that has been archived or deleted all come
 * back as `{ ok: false }` with a 200. Distinguishing them would hand a prober a
 * way to ask "does this code exist, and has it been used yet", which is the one
 * question a token nobody owns should not answer. An archived group reads as
 * dead for the same reason: "this group is closed" is a fact about somebody
 * else's group that a stranger has no business learning from a code.
 */
export async function readInvite(token) {
  if (!looksLikeToken(token)) return DEAD;

  const invite = await GroupInvite.findOne({ tokenHash: sha256(token) });
  if (!isLive(invite)) return DEAD;

  // `members` is selected because its LENGTH is an answer the screen needs, and
  // nothing else about a member row is ever read here. `archived` is selected
  // for the same reason: without it the closed-group check below reads
  // `undefined`, which is falsy, and a closed group answers as though it were
  // open. A projection that omits the field a check depends on is a silent
  // inversion of that check.
  const group = await Group.findById(invite.group).select('name members archived');
  if (!group || group.archived) return DEAD;

  return { ok: true, groupName: group.name, memberCount: group.members.length };
}

const DEAD = { ok: false };

/* -------------------------------- joining -------------------------------- */

/**
 * Redeem a code.
 *
 * THE ORDER OF THE CHECKS IS THE DESIGN
 * -------------------------------------
 *   1. the account's rate budget      — cheapest, and it bounds the abuse
 *   2. is this account already in?     — see below
 *   3. is the code still live?
 *   4. is the code really this one?    — the timing-safe compare
 *   5. is the group full?
 *   6. claim the code atomically
 *   7. write the seat
 *
 * Membership is checked BEFORE liveness on purpose. A double-tapped confirm
 * button lands here with a code that was live a moment ago and is not now, and
 * the true answer for that person is "you are already in this group" — the one
 * sentence that tells them what actually happened. Every other caller still
 * falls through to the single undifferentiated "expired" answer.
 *
 * A person already in the group is refused with the same rule and the same
 * wording `addMember` uses. This module cannot CALL `addMember` for that,
 * because `addMember` opens with `loadAdminGroup(..., 'manage')` and the person
 * joining holds no power at all — that is the whole point of the feature. So
 * the same two rules live here, and the suite asserts they agree with the
 * original rule for rule (see tests/groupInvites.test.js), rather than a second
 * and different check quietly growing in a second place.
 *
 * THE CLAIM IS TAKEN BEFORE THE SEAT IS WRITTEN, never after. A double tap
 * sends two requests; the `findOneAndUpdate` below only matches a row that is
 * still unset, so exactly one of them can win it and the loser never reaches
 * the push. Two member rows for one tap are impossible. The price is that a
 * failure AFTER the claim costs one invite, which is the cheap way round: a
 * burnt code is a support question, a duplicated member is wrong data in
 * somebody's split maths.
 */
export async function joinInvite(user, token) {
  takeJoinAttempt(user._id);

  if (!looksLikeToken(token)) throw fail(400, 'expired');

  const invite = await GroupInvite.findOne({ tokenHash: sha256(token) }).select('+tokenHash');
  if (!invite) throw fail(400, 'expired');

  const group = await Group.findById(invite.group);
  if (!group) throw fail(400, 'groupGone');
  if (group.archived) throw fail(400, 'groupClosed');

  const seat = group.members.find(
    (m) => (m.user && String(m.user) === String(user._id)) ||
      (user.email && m.email === String(user.email).toLowerCase())
  );
  if (seat) throw fail(400, 'alreadyMember');

  if (!isLive(invite)) throw fail(400, 'expired');
  if (!tokenMatches(invite.tokenHash, token)) throw fail(400, 'expired');
  if (group.members.length >= MAX_MEMBERS) throw fail(400, 'groupFull');

  const claimed = await GroupInvite.findOneAndUpdate(
    { _id: invite._id, usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date(), usedBy: user._id } },
    { new: true }
  );
  if (!claimed) throw fail(400, 'expired'); // somebody else won it while we read it

  // The role is written down rather than left out. `roleOf` reads a missing
  // role as `member` anyway, so this is not needed for today's behaviour — it
  // is here so the intent survives a future change to that default, and so a
  // reader of the row can see that an invite never carried a power.
  group.members.push({
    user: user._id,
    name: String(user.name || '').slice(0, 80),
    email: String(user.email || '').toLowerCase(),
    role: 'member',
    addedAt: new Date(),
  });
  await group.save();

  return {
    joined: true,
    group: {
      id: group._id.toString(),
      name: group.name,
      // The least power in GROUP_ROLES: it may only `view`.
      role: 'member',
    },
  };
}

/* -------------------------------- helpers -------------------------------- */

/** Every live invite of one group: the one rule the cap and the list share. */
function liveQuery(groupId) {
  return {
    group: groupId,
    usedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  };
}

/**
 * Spend one unit of this account's budget. Refused at the limit with a code
 * that says how long to wait, so the client can write the wait in a sentence.
 */
function takeJoinAttempt(userId) {
  const key = String(userId);
  const now = Date.now();
  const recent = (joinAttempts.get(key) || []).filter((at) => now - at < JOIN_WINDOW_MS);
  if (recent.length >= JOIN_ATTEMPT_LIMIT) {
    const waitMinutes = Math.max(1, Math.ceil((JOIN_WINDOW_MS - (now - recent[0])) / 60000));
    throw fail(429, 'tooManyTries', { waitMinutes });
  }
  recent.push(now);
  joinAttempts.set(key, recent);
}

/**
 * A refusal as a CODE. The status matches how services/groups.js phrases its
 * own 400s (a status and a short reason) while the reason itself stays a key,
 * because a sentence written here could only ever be read in English.
 */
function fail(status, code, extra = {}) {
  const err = new Error(code);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function notFound(code) {
  return fail(404, code || 'noGroup');
}
