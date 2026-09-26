import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { list, summary, create, update, remove } from '../services/bankRates.js';

/**
 * Compare Savings Options — the administrator's half (ADV-3).
 *
 * Everything here sits behind `requireAdmin`, exactly like the other control
 * routes, because publishing a rate is how a number a student may act on
 * reaches the table. A student gets 403 and a signed-out caller gets 401 —
 * the public list stays open, the writes do not.
 *
 * Mount: app.use('/api/control/savings-options', savingsOptionsAdminRoutes)
 */
const router = Router();
router.use(requireAdmin);

/**
 * The whole table, retired rows included — an administrator has to be able to
 * see a row they switched off, and the public list only ever shows active ones.
 */
router.get('/', async (req, res, next) => {
  try {
    const [rows, totals] = await Promise.all([list({ includeInactive: true, sort: req.query.sort }), summary()]);
    res.json({ rows, summary: totals });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    // The bank name is a separate argument on purpose: it is the one field an
    // administrator must always type, so it can never be lost in a spread of
    // arbitrary body keys.
    const rate = await create(req.body?.bank, req.body || {});
    res.status(201).json({ rate });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const rate = await update(req.params.id, req.body || {});
    res.json({ rate });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const rate = await remove(req.params.id);
    res.json({ ok: true, rate });
  } catch (err) {
    next(err);
  }
});

export default router;
