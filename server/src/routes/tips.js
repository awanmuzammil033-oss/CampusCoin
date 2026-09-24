import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import {
  ensureTipsForMonth,
  topTips,
  listTips,
  dismissTip,
  pinTip,
  unpinTip,
  bookmarkTip,
} from '../services/tips.js';
import { toNum } from '../utils/money.js';

const router = Router();
router.use(requireStudent);

/** Current month's tips (generate-on-open; safe to re-run any time). */
router.get('/', async (req, res, next) => {
  try {
    const month = monthParam(req.query.month);
    const rows = await listTips(req.user, month);
    res.json({ rows: rows.map(present) });
  } catch (err) {
    next(err);
  }
});

router.post('/generate', async (req, res, next) => {
  try {
    const rows = await ensureTipsForMonth(req.user, req.body.month ? new Date(req.body.month) : new Date());
    res.json({ rows: rows.map(present) });
  } catch (err) {
    next(err);
  }
});

/** Dashboard asks only for the top few (DASH-2). */
router.get('/top', async (req, res, next) => {
  try {
    const rows = await topTips(req.user);
    res.json({ rows: rows.map(present) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/dismiss', handle((user, id) => dismissTip(user, id)));
router.post('/:id/pin', handle((user, id) => pinTip(user, id)));
router.post('/:id/unpin', handle((user, id) => unpinTip(user, id)));
router.post('/:id/bookmark', async (req, res, next) => {
  try {
    const tip = await bookmarkTip(req.user, req.params.id, true, req.body.note ?? null);
    if (!tip) return res.status(404).json({ error: 'Tip not found.' });
    res.json({ tip: present(tip) });
  } catch (err) {
    next(err);
  }
});

function handle(fn) {
  return async (req, res, next) => {
    try {
      const tip = await fn(req.user, req.params.id);
      if (!tip) return res.status(404).json({ error: 'Tip not found.' });
      res.json({ tip: present(tip) });
    } catch (err) {
      next(err);
    }
  };
}

function present(t) {
  return {
    id: t._id.toString(),
    text: t.textRendered,
    month: t.month,
    potentialSavings: toNum(t.potentialSavings),
    status: t.status,
    isBookmarked: t.isBookmarked,
    note: t.note,
    createdAt: t.createdAt,
  };
}

function monthParam(value) {
  if (!value) return new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export default router;
