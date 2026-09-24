import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import { progressForMonth, setBudget, copyFromPreviousMonth } from '../services/budgets.js';

const router = Router();
router.use(requireStudent);

/** The budgets page: every limit for the requested month with live progress. */
router.get('/', async (req, res, next) => {
  try {
    const rows = await progressForMonth(req.user, req.query.month || Date.now());
    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

/** Save one category limit (BUD-1). */
router.post('/', async (req, res, next) => {
  try {
    await setBudget(req.user, req.body);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Dashboard widget asks for a short list: nearest limits first. */
router.get('/progress', async (req, res, next) => {
  try {
    const rows = await progressForMonth(req.user, req.query.month || Date.now());
    rows.sort((a, b) => b.pct - a.pct);
    res.json({ rows: rows.slice(0, 6) });
  } catch (err) {
    next(err);
  }
});

router.post('/copy-previous', async (req, res, next) => {
  try {
    const copied = await copyFromPreviousMonth(req.user, req.body.month);
    res.json({ copied });
  } catch (err) {
    next(err);
  }
});

/** Remove a limit without touching the transactions behind it. */
router.delete('/:id', async (req, res, next) => {
  try {
    const { default: Budget } = await import('../models/Budget.js');
    const removed = await Budget.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!removed) return res.status(404).json({ error: 'Budget not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
