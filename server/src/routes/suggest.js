import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import { suggest } from '../services/categoriser.js';

/**
 * One small endpoint the quick-add form calls while a description is being
 * typed (debounced on the client). It only ever answers with a suggestion
 * the person is free to ignore — see services/categoriser.js.
 *
 * Mount: app.use('/api', suggestRoutes)  →  GET /api/suggest-category?q=…
 */

const router = Router();

router.get('/suggest-category', requireStudent, async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    // Too short to mean anything, or long past what a description holds:
    // answer quietly instead of doing work nobody will see.
    if (q.length < 3 || q.length > 120) return res.json({ suggestion: null });

    const suggestion = await suggest(req.user, q);
    res.json({ suggestion });
  } catch (err) {
    next(err);
  }
});

export default router;
