import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import UserTip from '../models/UserTip.js';
import Insight from '../models/Insight.js';
import { toNum } from '../utils/money.js';

const router = Router();
router.use(requireStudent);

/**
 * Bookmarks & notes (BKM-1) in one feed: saved tips from any month plus
 * saved monthly insights, newest first. Two small queries — the lists are
 * short by nature (only what the person deliberately kept).
 */
router.get('/', async (req, res, next) => {
  try {
    const [tips, insights] = await Promise.all([
      UserTip.find({ user: req.user._id, isBookmarked: true }).sort({ month: -1 }),
      Insight.find({ user: req.user._id, isBookmarked: true }).sort({ month: -1 }),
    ]);

    res.json({
      tips: tips.map((t) => ({
        id: t._id.toString(),
        kind: 'tip',
        month: t.month,
        text: t.textRendered,
        note: t.note,
        potentialSavings: toNum(t.potentialSavings),
        savedAt: t.updatedAt,
      })),
      insights: insights.map((i) => ({
        id: i._id.toString(),
        kind: 'insight',
        month: i.month,
        text: i.summaryText,
        note: i.note,
        tip: i.tipText,
        savedAt: i.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Update or clear the personal note attached to a bookmark. */
router.patch('/:kind/:id/note', async (req, res, next) => {
  try {
    const note = String(req.body.note ?? '').slice(0, 500);
    const Model = req.params.kind === 'tip' ? UserTip : Insight;
    const row = await Model.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id, isBookmarked: true },
      { $set: { note: note || null } },
      { new: true }
    );
    if (!row) return res.status(404).json({ error: 'Bookmark not found.' });
    res.json({ ok: true, note: row.note });
  } catch (err) {
    next(err);
  }
});

/** Remove from bookmarks (the item itself stays). */
router.delete('/:kind/:id', async (req, res, next) => {
  try {
    const Model = req.params.kind === 'tip' ? UserTip : Insight;
    const row = await Model.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id, isBookmarked: true },
      { $set: { isBookmarked: false, note: null } }
    );
    if (!row) return res.status(404).json({ error: 'Bookmark not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
