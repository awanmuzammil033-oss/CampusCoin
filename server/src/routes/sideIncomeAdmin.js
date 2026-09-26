import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { list, stats, create, update, remove } from '../services/incomeIdeas.js';

/**
 * Admin CRUD for the side-income library (ADV-5, ADM-2). It is a separate
 * router rather than more endpoints on routes/control.js so the library can be
 * read and maintained as one unit; `requireAdmin` is the same guard the
 * control panel uses, so a student gets 403 and an anonymous caller 401.
 *
 * The list asks for retired rows as well, the way routes/control.js lists its
 * tip templates: a row switched off has to stay findable so it can be brought
 * back with its citation intact.
 *
 * Mount: app.use('/api/control/side-income', sideIncomeAdminRoutes)
 */
const router = Router();
router.use(requireAdmin);

router.get('/', async (req, res, next) => {
  try {
    const [page, counts] = await Promise.all([
      list({
        category: req.query.category,
        trending: req.query.trending,
        q: req.query.q,
        page: req.query.page,
        // Every row in one read: the panel shows the whole library at once so a
        // duplicate or a stale entry can be spotted, and the library is tens
        // of rows rather than thousands.
        perPage: req.query.perPage || 100,
        includeRetired: true,
      }),
      stats(),
    ]);
    res.json({ ...page, stats: counts });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json({ idea: await create(req.body || {}) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    res.json({ idea: await update(req.params.id, req.body || {}) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await remove(req.params.id));
  } catch (err) {
    next(err);
  }
});

export default router;
