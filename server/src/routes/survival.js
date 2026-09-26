import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import { survivalPlan, setSurvivalMode } from '../services/survival.js';

/**
 * Survival mode endpoints (SURV-1).
 *
 * GET   /api/survival        → the plan as it stands right now
 * PATCH /api/survival        → { enabled: true|false } switches the mode
 *
 * Mount: app.use('/api/survival', survivalRoutes). Thin views, like the rest:
 * the arithmetic lives in services/survival.js.
 */

const router = Router();
router.use(requireStudent);

router.get('/', async (req, res, next) => {
  try {
    res.json({ plan: await survivalPlan(req.user) });
  } catch (err) {
    next(err);
  }
});

router.patch('/', async (req, res, next) => {
  try {
    if (typeof req.body?.enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be true or false.' });
    }
    res.json({ plan: await setSurvivalMode(req.user, req.body.enabled) });
  } catch (err) {
    next(err);
  }
});

export default router;
