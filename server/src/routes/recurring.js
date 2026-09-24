import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import {
  listRules,
  createRule,
  updateRule,
  removeRule,
  generateForUser,
} from '../services/recurring.js';
import { toNum } from '../utils/money.js';

const router = Router();
router.use(requireStudent);

router.get('/', async (req, res, next) => {
  try {
    const rules = await listRules(req.user);
    res.json({
      rows: rules.map((r) => ({
        id: r._id.toString(),
        amount: toNum(r.amount),
        type: r.type,
        description: r.description,
        frequency: r.frequency,
        dayOfPeriod: r.dayOfPeriod,
        startDate: r.startDate,
        endDate: r.endDate,
        lastGeneratedOn: r.lastGeneratedOn,
        isActive: r.isActive,
        category: r.category
          ? { id: r.category._id.toString(), name: r.category.name, type: r.category.type, icon: r.category.icon }
          : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const rule = await createRule(req.user, req.body);
    res.status(201).json({ rule: { id: rule._id.toString() } });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    await updateRule(req.user, req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await removeRule(req.user, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Catch-up button: the same generator the daily job runs, scoped to this
 * person. Useful right after logging in from a different device.
 */
router.post('/generate', async (req, res, next) => {
  try {
    const created = await generateForUser(req.user);
    res.json({ created });
  } catch (err) {
    next(err);
  }
});

export default router;
