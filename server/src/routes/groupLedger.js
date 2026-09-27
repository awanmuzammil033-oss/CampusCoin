import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import {
  journal,
  postEntry,
  reverseEntry,
  flagEntry,
  clearEntryFlag,
  trialBalance,
  reconcileView,
  startReconcile,
  classifyStatementLine,
  markBookOutstanding,
  closeReconcile,
} from '../services/groupLedger.js';

/**
 * A group's own books (GRP-3, GRP-5, GRP-7): the general journal, the trial
 * balance, and the bank reconciliation. Mounted at /api/groups/:id/ledger so a
 * group's books sit inside the same isolation as the group itself.
 *
 * Nothing is decided in this file: the student's id and the group id go down,
 * the answer comes back up. Whether the person is a member is not even a
 * question here, and neither is whether they may post — services/groupLedger.js
 * asks the same loader the rest of the group module uses (so somebody else's
 * group is a 404, never a 403) and gets its permission sentences from
 * requireCapability in services/groups.js.
 *
 * `mergeParams` is what carries the group's id in from the mount path: a router
 * mounted at /api/groups/:id/ledger would otherwise replace `req.params` with
 * its own (`:entryId`, `:sessionId`) and the group would arrive as undefined.
 * Because of that, NO route below may name its own parameter `:id` — a route
 * parameter shadows the mount's, and `groupIdOf` would quietly read an entry id
 * as a group id. The paths are the same either way: the name of a parameter is
 * not part of the URL, so /journal/:entryId/reverse is /journal/<id>/reverse.
 * Reading both names in `groupIdOf` below means the mount can say `:id` like the
 * rest of /api/groups, or `:groupId`, without this file having to care.
 */
const router = Router({ mergeParams: true });
router.use(requireStudent);

/** A page of the journal, newest first, with the chart to post against. */
router.get('/journal', async (req, res, next) => {
  try {
    res.json(await journal(req.user, groupIdOf(req), { limit: req.query.limit, before: req.query.before }));
  } catch (err) {
    next(err);
  }
});

/** Post an entry. 201 only if the debits and credits are equal. */
router.post('/journal', async (req, res, next) => {
  try {
    res.status(201).json({ entry: await postEntry(req.user, groupIdOf(req), req.body) });
  } catch (err) {
    next(err);
  }
});

/** The correction: the mirrored entry. The original is never touched. */
router.post('/journal/:entryId/reverse', async (req, res, next) => {
  try {
    res.status(201).json({ entry: await reverseEntry(req.user, groupIdOf(req), req.params.entryId, { date: req.body?.date }) });
  } catch (err) {
    next(err);
  }
});

/** An auditor's question about an entry, and the answer to it. */
router.post('/journal/:entryId/flag', async (req, res, next) => {
  try {
    res.status(201).json({ entry: await flagEntry(req.user, groupIdOf(req), req.params.entryId, req.body) });
  } catch (err) {
    next(err);
  }
});

router.post('/journal/:entryId/flag/clear', async (req, res, next) => {
  try {
    res.json({ entry: await clearEntryFlag(req.user, groupIdOf(req), req.params.entryId, req.body) });
  } catch (err) {
    next(err);
  }
});

/** Every account, both columns, the two totals, and whether they are equal. */
router.get('/trial-balance', async (req, res, next) => {
  try {
    res.json(await trialBalance(req.user, groupIdOf(req)));
  } catch (err) {
    next(err);
  }
});

/** The open reconciliation, with the whole comparison answered. */
router.get('/reconcile', async (req, res, next) => {
  try {
    res.json(await reconcileView(req.user, groupIdOf(req)));
  } catch (err) {
    next(err);
  }
});

/** Start one: the account, the statement's date and balance, and its lines. */
router.post('/reconcile', async (req, res, next) => {
  try {
    res.status(201).json(await startReconcile(req.user, groupIdOf(req), req.body));
  } catch (err) {
    next(err);
  }
});

/** Classify one statement line. `as: 'book'` posts the entry for it. */
router.patch('/reconcile/:sessionId/lines/:key', async (req, res, next) => {
  try {
    res.json({ session: await classifyStatementLine(req.user, groupIdOf(req), req.params.sessionId, req.params.key, req.body) });
  } catch (err) {
    next(err);
  }
});

/** A book line still in transit, or no longer. */
router.patch('/reconcile/:sessionId/book/:lineId', async (req, res, next) => {
  try {
    res.json({
      session: await markBookOutstanding(req.user, groupIdOf(req), req.params.sessionId, req.params.lineId, req.body),
    });
  } catch (err) {
    next(err);
  }
});

/** Close it — 409, naming the difference, whenever it is not finished. */
router.post('/reconcile/:sessionId/close', async (req, res, next) => {
  try {
    res.json({ session: await closeReconcile(req.user, groupIdOf(req), req.params.sessionId) });
  } catch (err) {
    next(err);
  }
});

/**
 * The group id, whichever name the mount path used. The rest of /api/groups
 * calls it `:id`, so that is what this router expects; `:groupId` is read too
 * so the mount can say what it likes without the two disagreeing. No route in
 * this file may be given that `:id` of its own — see the note at the top.
 */
function groupIdOf(req) {
  return req.params.groupId || req.params.id;
}

export default router;
