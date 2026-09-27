import { Router } from 'express';
import mongoose from 'mongoose';
import { requireStudent } from '../middleware/auth.js';
import Insight from '../models/Insight.js';
import { generateInsight, DISCLAIMER } from '../services/insight.js';
import { forecastNextMonth } from '../services/forecast.js';
import { spendingInsights, insightMonths } from '../services/spendingInsights.js';

/**
 * Insight history, generation, bookmarking and the forecast strip
 * (INS-1..5, SYS-2). Every query is scoped to the signed-in student, so
 * another person's month simply doesn't exist from here — cross-user ids
 * answer 404. Every payload carries the advisory disclaimer.
 *
 * Mount: app.use('/api/insights', insightRoutes)
 */

const router = Router();
router.use(requireStudent);

/* --------------------------------- history ----------------------------------- */

router.get('/', async (req, res, next) => {
  try {
    const rows = await Insight.find({ user: req.user._id }).sort({ month: -1 });
    res.json({ rows: rows.map(present), disclaimer: DISCLAIMER });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- generation --------------------------------- */

router.post('/generate', async (req, res, next) => {
  try {
    const month = parseMonth(req.body?.month);
    if (month === false) {
      return res.status(400).json({ error: 'Please pick a month in the format YYYY-MM.' });
    }
    const insight = await generateInsight(req.user, month || new Date());
    res.json({ insight: present(insight) });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------- forecast ----------------------------------- */

router.get('/forecast', async (req, res, next) => {
  try {
    const rows = await forecastNextMonth(req.user);
    res.json({ rows, label: 'Estimate', disclaimer: DISCLAIMER });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- one month ----------------------------------- */

/* ------------------------- the spending-insights card ------------------------ */

/**
 * One month of spending, as FACTS: totals, per-category figures, and a list of
 * patterns with ids. No sentence is produced here - the client writes the words
 * from the dictionary, which is what lets a tip exist in fourteen languages and
 * still mean the same thing in all of them. `month` is YYYY-MM and defaults to
 * last month, because a card about a month still being lived is a to-do list
 * rather than an insight.
 */
router.get('/spending', async (req, res, next) => {
  try {
    const data = await spendingInsights(req.user, { month: req.query.month });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/** The months this person can be shown, newest first, for the card's month picker. */
router.get('/spending/months', async (req, res, next) => {
  try {
    res.json({ months: await insightMonths(req.user, { limit: req.query.limit }) });
  } catch (err) {
    next(err);
  }
});

router.get('/:ym', async (req, res, next) => {
  try {
    const month = parseMonth(req.params.ym);
    if (!month) {
      return res.status(400).json({ error: 'Please use a month in the format YYYY-MM.' });
    }
    const insight = await Insight.findOne({ user: req.user._id, month });
    res.json({ insight: insight ? present(insight) : null, disclaimer: DISCLAIMER });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ bookmark + note -------------------------------- */

router.post('/:id/bookmark', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Insight not found.' });
    }
    const insight = await Insight.findOne({ _id: req.params.id, user: req.user._id });
    if (!insight) return res.status(404).json({ error: 'Insight not found.' });

    if (req.body?.note !== undefined) {
      insight.note = String(req.body.note).trim().slice(0, 500) || null;
      // Keeping a note means keeping the month around, unless told otherwise.
      insight.isBookmarked = req.body.bookmarked !== undefined ? Boolean(req.body.bookmarked) : true;
    } else if (req.body?.bookmarked !== undefined) {
      insight.isBookmarked = Boolean(req.body.bookmarked);
    } else {
      insight.isBookmarked = !insight.isBookmarked; // plain toggle
    }

    await insight.save();
    res.json({ insight: present(insight) });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------- helpers ------------------------------------ */

function present(insight) {
  return {
    id: insight._id.toString(),
    month: insight.month,
    summaryText: insight.summaryText,
    tipText: insight.tipText,
    flags: insight.flags.map((f) => ({ category: f.category, pctChange: f.pctChange, amount: f.amount })),
    source: insight.source,
    isBookmarked: insight.isBookmarked,
    note: insight.note,
    disclaimer: DISCLAIMER,
  };
}

/** 'YYYY-MM' → the 1st of that month in UTC; null when absent; false when invalid. */
function parseMonth(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) return false;
  const [year, month] = text.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

export default router;
