import { Router } from 'express';
import { list, summary } from '../services/bankRates.js';

/**
 * Compare Savings Options — the public half (ADV-3).
 *
 * Deliberately open: the home page links here whether or not anyone is signed
 * in, and a table of published rates is not personal data — it belongs to no
 * one and holds nothing about the person reading it. That is also why this
 * router has no `requireStudent` and no per-user scoping: there is no "mine"
 * version of a reference rate.
 *
 * No `/disclaimer` endpoint on purpose. The disclaimer is copy, not data: it
 * lives in the i18n dictionary as `sav.disclaimer` so the page, the admin form
 * and any print of the page all read one sentence that cannot drift apart.
 *
 * Mount: app.use('/api/savings-options', savingsOptionsRoutes)
 */
const router = Router();

/** The table plus its headline numbers, in one read. */
router.get('/', async (req, res, next) => {
  try {
    const [rows, totals] = await Promise.all([
      list({ accountType: req.query.accountType, bank: req.query.bank, sort: req.query.sort }),
      summary(),
    ]);
    res.json({ rows, summary: totals });
  } catch (err) {
    next(err);
  }
});

export default router;
