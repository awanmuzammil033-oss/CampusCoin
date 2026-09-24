import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import Notification from '../models/Notification.js';
import Announcement from '../models/Announcement.js';

const router = Router();
router.use(requireStudent);

/**
 * The bell (BUD-3): stored alerts first, then any live campus announcement
 * merged into the same feed — one list to read, newest on top.
 */
router.get('/', async (req, res, next) => {
  try {
    const [alerts, announcements] = await Promise.all([
      Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(40),
      Announcement.live().limit(10),
    ]);

    const items = [
      ...alerts.map((a) => ({
        id: a._id.toString(),
        kind: a.kind,
        message: a.message,
        isRead: a.isRead,
        createdAt: a.createdAt,
        source: 'app',
      })),
      ...announcements.map((a) => ({
        id: `ann-${a._id}`,
        kind: 'announcement',
        message: `${a.title} — ${a.body}`,
        isRead: false, // campus notices are always shown; they are not stored per person
        createdAt: a.createdAt,
        source: 'campus',
      })),
    ].sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));

    const unread = alerts.filter((a) => !a.isRead).length;
    res.json({ rows: items.slice(0, 40), unread });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    await Notification.updateOne(
      { _id: req.params.id, user: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await Notification.updateMany({ user: req.user._id, isRead: false }, { $set: { isRead: true } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
