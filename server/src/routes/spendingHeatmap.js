import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import { spendingHeatmap, ownMonth } from '../services/spendingHeatmap.js';

/**
 * The spending calendar, read only.
 *
 * The shape of this module is the same as every other router here: check who is
 * asking, call one service, answer. Every rule - what a band is, what a month
 * with no spread in it says, why income is not in here - lives in
 * services/spendingHeatmap.js where it can be read without a server.
 *
 *   GET /api/heatmap?month=YYYY-MM[&user=<id>]
 *
 * A stranger's month is a 404 and never a 403, and so is a malformed id: this
 * app does not confirm that an id belongs to somebody else, and the two answers
 * must not be told apart.
 *
 * Mount: app.use('/api/heatmap', heatmapRoutes)
 */
const router = Router();
router.use(requireStudent);

router.get('/', async (req, res, next) => {
  try {
    // Resolved before anything is read, so a stranger's request never reaches a
    // query at all rather than reaching one and being filtered out afterwards.
    const user = ownMonth(req.user, req.query.user);
    res.json(await spendingHeatmap(user, { month: req.query.month }));
  } catch (err) {
    // A bad month is the reports service's own plain-language wording, exactly
    // as /api/reports answers it, so the two read alike. Everything else - a bug,
    // a database hiccup - goes to the shared handler with generic wording.
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err.status === 404) return res.status(404).json({ error: err.message });
    return next(err);
  }
});

export default router;
