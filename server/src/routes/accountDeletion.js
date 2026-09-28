import { Router } from 'express';

import { requireStudent, requireAdmin } from '../middleware/auth.js';
import { accountLimiter } from '../middleware/rateLimit.js';
import {
  deletionState,
  requestDeletion,
  cancelDeletion,
  runDueDeletions,
  GRACE_DAYS,
} from '../services/accountDeletion.js';

/**
 * Delete account, with a seven-day grace period (NEW-1).
 *
 *   GET    /api/account/deletion                 the current state
 *   POST   /api/account/deletion                 ask, with the password again
 *   DELETE /api/account/deletion                 take it back, before the date
 *   POST   /api/control/account-deletions/run    an administrator runs the job
 *
 * ONE ROUTER, TWO PLACES, ONE MOUNT
 * ---------------------------------
 * This is mounted at `/api` (the same way suggestionRoutes already is in
 * app.js) rather than twice, because the two halves are one state machine: the
 * request, the cancellation and the running of the work all answer from
 * services/accountDeletion.js, and splitting them across two mounts would let
 * the two drift apart. The guards are therefore per route rather than one
 * `router.use` at the top - a student's own account and the staff door need
 * different ones, and `requireStudent` on the top would lock the administrator
 * out of the only route they may use.
 *
 * WHY THE JOB IS A ROUTE AND NOT ONLY A FUNCTION
 * ---------------------------------------------
 * The service function is the work, and the tests call it directly. The route is
 * on the STAFF door - behind `requireAdmin` and the CSRF check, the same door as
 * every other administrative write in this app - because this project ships
 * with no scheduler (ReadMe §3: `npm run dev:local` and a browser), so a
 * deletion that only a cron job could run would never actually run on the
 * machine it is demonstrated on. It takes NO body: which accounts are due is the
 * service's own question, and letting a caller name an account would turn
 * "delete this person" into something a request can say out loud instead of
 * something the schedule decides.
 */
const router = Router();

/* --------------------------- the student's own ------------------------------ */

/** What the card needs: whether it is pending, and the day it is scheduled for. */
router.get('/account/deletion', requireStudent, (req, res) => {
  res.json({ deletion: deletionState(req.user), graceDays: GRACE_DAYS });
});

/**
 * Ask to leave. The password comes back in the body, is checked against the
 * stored hash, and is never written anywhere. The rate limiter is the one the
 * sign-in and reset doors already use: a script trying a thousand passwords
 * here should be as slow as one doing the same against either of those.
 */
router.post('/account/deletion', requireStudent, accountLimiter, async (req, res, next) => {
  try {
    const { password, reason } = req.body || {};
    const deletion = await requestDeletion(req.user, { password, reason });
    res.status(201).json({ deletion, graceDays: GRACE_DAYS });
  } catch (err) {
    next(err);
  }
});

/** Take it back, any time before the date. Clears the whole subdocument. */
router.delete('/account/deletion', requireStudent, async (req, res, next) => {
  try {
    const deletion = await cancelDeletion(req.user);
    res.json({ deletion, graceDays: GRACE_DAYS });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------- the staff door ------------------------------- */

router.post('/control/account-deletions/run', requireAdmin, async (req, res, next) => {
  try {
    const report = await runDueDeletions();
    res.json({
      // counts, not sentences: the screen writes the words
      considered: report.considered,
      closed: report.results.filter((row) => !row.error).length,
      failed: report.results.filter((row) => row.error).length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
