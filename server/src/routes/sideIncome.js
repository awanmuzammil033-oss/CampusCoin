import { Router } from 'express';
import { list, readOne, stats, DISCLAIMER } from '../services/incomeIdeas.js';

/**
 * The side-income library, public (HTTP layer only — every decision lives in
 * services/incomeIdeas.js).
 *
 * No session is required: the library is shared, unchanging reference
 * material, and the landing page quotes it before anyone signs in. Nothing
 * here reads a person, so there is no account data behind these routes to
 * guard. Administrators edit the same rows through /api/control/side-income.
 *
 * Mount: app.use('/api/side-income', sideIncomeRoutes)
 */
const router = Router();

/**
 * The grid: the rows plus the counts the page shows above it, and the
 * standing disclaimer so a caller cannot present the list as advice.
 */
router.get('/', async (req, res, next) => {
  try {
    const [page, counts] = await Promise.all([
      list({ category: req.query.category, trending: req.query.trending, q: req.query.q, page: req.query.page, perPage: req.query.perPage }),
      stats(),
    ]);
    res.json({ ...page, stats: counts, disclaimer: DISCLAIMER });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const idea = await readOne(req.params.id);
    if (!idea) return res.status(404).json({ error: 'That income idea was not found.' });
    res.json({ idea, disclaimer: DISCLAIMER });
  } catch (err) {
    next(err);
  }
});

export default router;
