import { Router } from 'express';
import RateLimit from 'express-rate-limit';
import { requireStudent } from '../middleware/auth.js';
import {
  issueInvite,
  listInvites,
  revokeInvite,
  readInvite,
  joinInvite,
} from '../services/groupInvites.js';

/**
 * Group invites (NEW-7) — two routers in one file, because they are two halves
 * of one thing with opposite doors.
 *
 * THE GROUP HALF (default export), mounted at /api/groups/:id/invites
 * ---------------------------------------------------------------
 * Hangs off the group so it inherits the group's isolation: a read starts at
 * the person, and a group that is not theirs is a 404 from `loadGroupFor`
 * before any of this runs. Every route needs `manage` — the owner and any
 * admin, and deliberately NOT a treasurer (see services/groupInvites.js for
 * the table and the reasoning).
 *
 * THE PUBLIC HALF (named export), mounted at /api/invites
 * -------------------------------------------------------
 * `GET /:token` is the one deliberate exception in the app to "a read needs a
 * session": the person who scans a poster is by definition not signed in yet.
 * It answers three fields and nothing else, and the token is the only thing
 * standing between a stranger and the group's name. `POST /:token/join` is on
 * the same router but carries `requireStudent` on the route itself, because
 * joining has to know WHO is joining — that is the whole reason it is a
 * different call from reading the preview.
 *
 * NOTHING IN HERE WRITES A SENTENCE. `shapeCodes` below is the only place the
 * two halves' refusals are turned into a response, and what it puts on the wire
 * is a CODE plus whatever the code carries (a wait, a number) — the client
 * resolves the code through the dictionary, so a refusal reads correctly in
 * every language the app ships in.
 */

/* ------------------------------ the group half ---------------------------- */

/**
 * `mergeParams` is what carries the group's id in from the mount path, and it is
 * not optional. A router mounted at /api/groups/:id/invites REPLACES req.params
 * with its own (`:inviteId`), so `req.params.id` arrives undefined and every
 * request 404s with "Group not found." — a group that plainly exists. The same
 * note stands on the chat and ledger routers, which is where the option is
 * borrowed from; `groupIdOf` below reads both spellings so the mount can say
 * `:id` or `:groupId` without this file caring.
 */
const router = Router({ mergeParams: true });
router.use(requireStudent);

router.get('/', async (req, res, next) => {
  try {
    res.json(await listInvites(req.user, groupIdOf(req)));
  } catch (err) {
    next(err);
  }
});

/** 201: a code was minted, and this response is the only time it exists. */
router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await issueInvite(req.user, groupIdOf(req)));
  } catch (err) {
    next(err);
  }
});

router.delete('/:inviteId', async (req, res, next) => {
  try {
    res.json(await revokeInvite(req.user, groupIdOf(req), req.params.inviteId));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ the public half --------------------------- */

export const publicInvites = Router();

/**
 * The preview's per-address budget, exported so the suite can assert what it is
 * without spending it: exhausting a process-wide counter inside one test file
 * would change the result of every other test in it, and make the file
 * order-dependent. Exported rather than read from the environment twice, so
 * there is one number and a test can name it.
 */
export const PREVIEW_READ_LIMIT = Number(process.env.RATE_LIMIT_INVITE_READ || 120);

/**
 * A guard on the unauthenticated preview.
 *
 * The token is unguessable, so this is not there to make guessing slow — it is
 * there so that a script cannot walk the endpoint just to watch which codes
 * come back alive, which is a slower, cheaper probe than guessing and the only
 * one that could learn anything. It is per-address and generous, because the
 * people doing this legitimately are a corridor of students each loading one
 * page. config/env.js is not this feature's file to edit, so the number is read
 * from the environment here with a documented default.
 */
const previewLimiter = RateLimit({
  windowMs: 15 * 60 * 1000,
  limit: PREVIEW_READ_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  // `message` repeats the code, for the reason `shapeCodes` explains below.
  message: { error: 'invite.tooManyTries', message: 'invite.tooManyTries' },
});

/**
 * The confirmation screen's data. Three fields, tested for exactly that set.
 * Every dead token — expired, revoked, unknown, used, or belonging to a group
 * that has been closed — is the same `{ ok: false }` with a 200.
 */
publicInvites.get('/:token', previewLimiter, async (req, res, next) => {
  try {
    res.json({ invite: await readInvite(req.params.token) });
  } catch (err) {
    next(err);
  }
});

/** Joining needs a session, so the group they are walking into knows them. */
publicInvites.post('/:token/join', requireStudent, async (req, res, next) => {
  try {
    res.json(await joinInvite(req.user, req.params.token));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- the refusals ----------------------------- */

/** The group this invite belongs to, whichever name the mount path gave it. */
function groupIdOf(req) {
  return req.params.id || req.params.groupId;
}

/**
 * Turn a refusal into `{ error, message, ...extras }`, with the code prefixed.
 *
 * The service raises bare codes (`expired`, `groupFull`) because that is the
 * name they have inside the feature; the client resolves them as dictionary
 * keys, where every one of this feature's keys is prefixed `invite.`. The
 * prefix is added in exactly this one place, so no code can reach the wire
 * half translated, and the tests assert the prefixed form.
 *
 * `message` repeats the code on purpose. The shared client reads
 * `data.message || data.error` for what to show and only keeps `data.error` as
 * a machine code when BOTH are present, so a response with just `error` would
 * arrive as a readable string with no code attached and the screen would have
 * nothing to translate. Sending both makes the code the string AND the code.
 *
 * Errors with no `code` on them are somebody else's — `requireCapability`'s
 * 403, `loadGroupFor`'s 404, a CastError — and are handed straight to the
 * app's own handler, which is the right place for them.
 */
function shapeCodes(err, req, res, next) {
  if (!err?.code) return next(err);
  const code = String(err.code).startsWith('invite.') ? err.code : `invite.${err.code}`;
  const { status, code: _raw, message, stack, ...extras } = err;
  res.status(status || 400).json({ error: code, message: code, ...extras });
}

router.use(shapeCodes);
publicInvites.use(shapeCodes);

export default router;
