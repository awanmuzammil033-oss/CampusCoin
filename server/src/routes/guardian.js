import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import {
  buildSummary,
  guardianState,
  issueLink,
  readSharedSummary,
  recordConsent,
  revokeGuardianLink,
} from '../services/guardianSummary.js';

const router = Router();

/**
 * The guardian summary (NEW-8) — the student's half, and the one public read.
 *
 * The guards are attached PER ROUTE rather than with a `router.use`, because
 * this router has to carry one endpoint that no session may reach: the
 * guardian's own page. A `router.use(requireStudent)` here would be the tidier
 * spelling and would also lock the reader out of the very thing they came for.
 *
 * Every refusal answers with `{ error: <machine code>, message: <i18n key> }`,
 * never a sentence. The client renders `t(err.message)`, so a piece of this
 * feature's own copy cannot be hard-coded in English by accident — which is
 * exactly what "you have to tick the box" and "that is your own address" would
 * otherwise quietly become.
 */
function sendProblem(res, next, err) {
  if (err.status === 400 || err.status === 404) {
    return res.status(err.status).json({ error: err.code || 'refused', message: err.key || err.message });
  }
  return next(err);
}

/* ------------------------------ the student's side -------------------------- */

/**
 * The current state: whether a link exists, when the guardian agreed, and the
 * address they agreed to. The address is the student's own data — they typed
 * it onto their own account — so it is shown to them and to nobody else.
 */
router.get('/link', requireStudent, async (req, res, next) => {
  try {
    res.json(await guardianState(req.user));
  } catch (err) {
    sendProblem(res, next, err);
  }
});

/**
 * Consent, and then a link.
 *
 * The two travel together because a tick is what produces both, but they are
 * two steps in the service and only the second one mints anything: the tick is
 * recorded on the account, and `issueLink` then refuses to do anything at all
 * unless that record exists. The permission is the field, not the request.
 */
router.post('/link', requireStudent, async (req, res, next) => {
  try {
    await recordConsent(req.user, { email: req.body?.email, consent: req.body?.consent });
    const issued = await issueLink(req.user);
    res.status(201).json({ ...issued, state: await guardianState(req.user) });
  } catch (err) {
    sendProblem(res, next, err);
  }
});

/**
 * Revoke. Deletes the links and clears the address and the consent in one call,
 * so the token is a clean miss from the very next request.
 */
router.delete('/link', requireStudent, async (req, res, next) => {
  try {
    await revokeGuardianLink(req.user);
    res.json(await guardianState(req.user));
  } catch (err) {
    sendProblem(res, next, err);
  }
});

/**
 * The preview — the very same summary function the guardian's page will call,
 * for the same month, so what the student agrees to and what the guardian reads
 * cannot differ. That is asserted as byte-identical in tests/guardian.test.js.
 */
router.get('/preview', requireStudent, async (req, res, next) => {
  try {
    // No ?month= here on purpose: the preview and the link are about the month
    // they are made in, and accepting a month would let the two disagree.
    res.json({ summary: await buildSummary(req.user, new Date()) });
  } catch (err) {
    sendProblem(res, next, err);
  }
});

/* ------------------------------- the reader's ------------------------------ */

/**
 * The only endpoint in the app a guardian token opens, and it opens nothing
 * else: no session carrying a user is created, no other route consults the
 * GuardianLink collection, and a token presented anywhere else in the API is
 * just a string to a router that never heard of it. (The app's CSRF layer does
 * hand every anonymous visitor a bare session cookie — see middleware/csrf.js —
 * but it holds a nonce and no userId, and tests/guardian.test.js replays it to
 * prove it opens nothing.)
 *
 * No rate limiter here, deliberately. Guessing 43 characters of base64url from
 * a cryptographic source is not an attack anyone mounts, and a limiter in front
 * of a page a parent opens on a phone in bad signal would be a support call
 * instead of a defence.
 */
router.get('/summary/:token', async (req, res, next) => {
  try {
    const summary = await readSharedSummary(req.params.token);
    // Unknown, expired, revoked and malformed are ONE answer. A 403 here would
    // confirm the token exists, which is the only thing a stranger wanted to
    // know; a different 404 body per cause would do the same job more slowly.
    if (!summary) return res.status(404).json({ error: 'not_found', message: 'guard.link.gone' });
    res.json({ summary });
  } catch (err) {
    sendProblem(res, next, err);
  }
});

export default router;
