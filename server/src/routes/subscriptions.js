import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import {
  subscriptionReport,
  checkRenewals,
  pauseRule,
  resumeRule,
  cancelRule,
  setReminderDays,
} from '../services/subscriptions.js';

/**
 * Renewals (NEW-6) — HTTP layer only, every decision lives in
 * services/subscriptions.js. Mounted at /api/subscriptions.
 */
const router = Router();
router.use(requireStudent);

/**
 * The list: every recurring expense this person has, soonest charge first,
 * with the vault's own verdict beside each row.
 *
 * The reminder runs on every read, the way a budget alert runs after a change,
 * so opening the screen is also what keeps a renewal from arriving unannounced.
 * It is run over *every* rule rather than the rows on screen: a category filter
 * is a way of looking at the list, not a reason to stop warning somebody.
 */
router.get('/', async (req, res, next) => {
  try {
    const [report, reminders] = await Promise.all([
      subscriptionReport(req.user, { categoryId: req.query?.categoryId }),
      checkRenewals(req.user, { withinDays: req.query?.withinDays }),
    ]);
    res.json({ ...report, reminders: reminders.created });
  } catch (err) {
    next(err);
  }
});

/**
 * The reminder on its own, for a client that is not showing the list — a
 * badge that asks "anything due soon?" without paying for the whole report.
 * The unique index makes it safe to call as often as the client likes.
 */
router.post('/check', async (req, res, next) => {
  try {
    res.json(await checkRenewals(req.user, { withinDays: req.body?.withinDays }));
  } catch (err) {
    next(err);
  }
});

/** Hold this entry: no charge, and the dates before the pause are skipped. */
router.post('/:ruleId/pause', async (req, res, next) => {
  try {
    const result = await pauseRule(req.user, req.params.ruleId, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.post('/:ruleId/resume', async (req, res, next) => {
  try {
    const result = await resumeRule(req.user, req.params.ruleId);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/** Stop it here and keep the history; the payment itself stops with the company. */
router.post('/:ruleId/cancel', async (req, res, next) => {
  try {
    const result = await cancelRule(req.user, req.params.ruleId);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/** How many days before the next charge this one entry should warn. */
router.patch('/:ruleId', async (req, res, next) => {
  try {
    const result = await setReminderDays(req.user, req.params.ruleId, req.body?.reminderDays);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
