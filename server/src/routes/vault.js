import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import { vaultReport, vaultSummary, scanAndRemind, cancelSubscription } from '../services/vault.js';

/**
 * The subscription vault (HTTP layer only — every decision lives in
 * services/vault.js). Mounted at /api/vault.
 */
const router = Router();
router.use(requireStudent);

/**
 * The whole picture. Reminders run first, so opening the screen is also what
 * keeps the auto-renew trap from quietly costing a semester — scanAndRemind
 * creates at most one notification per idle subscription per month, so this
 * is safe on every load.
 */
router.get('/', async (req, res, next) => {
  try {
    // One set of aggregates: the report is read once, then handed to the
    // reminder scan so opening the screen never doubles the work.
    const report = await vaultReport(req.user);
    const reminders = await scanAndRemind(req.user, report);
    res.json({ ...report, reminders: reminders.created });
  } catch (err) {
    next(err);
  }
});

/** Headline numbers only, for the small card on another screen. */
router.get('/summary', async (req, res, next) => {
  try {
    res.json(await vaultSummary(req.user));
  } catch (err) {
    next(err);
  }
});

/** "Cancel this" on a flagged subscription: the entry stops, the past stays. */
router.post('/cancel', async (req, res, next) => {
  try {
    const ruleId = String(req.body?.ruleId || '').trim();
    if (!ruleId) return res.status(400).json({ error: 'Please choose a recurring entry to cancel.' });

    const result = await cancelSubscription(req.user, ruleId);
    res.json({ ok: true, id: result.id, wasActive: result.wasActive });
  } catch (err) {
    next(err);
  }
});

export default router;
