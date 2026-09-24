import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import Notification from '../models/Notification.js';
import RecentActivity from '../models/RecentActivity.js';
import { monthStart } from '../models/Budget.js';
import { progressForMonth } from '../services/budgets.js';
import { ensureTipsForMonth, topTips } from '../services/tips.js';
import { toNum, round2 } from '../utils/money.js';

const router = Router();
router.use(requireStudent);

/**
 * Dashboard payload (DASH-1..4). Every number is a database aggregate over
 * the current month — the response never grows with the size of the history,
 * which is what keeps the page under two seconds with thousands of rows.
 */
router.get('/summary', async (req, res, next) => {
  try {
    const month = monthStart(req.query.month || Date.now());
    const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));

    const [totals, topCategory, budgets, unread] = await Promise.all([
      Transaction.aggregate([
        { $match: { user: req.user._id, isDeleted: false, date: { $gte: month, $lt: next } } },
        { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { user: req.user._id, isDeleted: false, type: 'expense', date: { $gte: month, $lt: next } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
        { $limit: 1 },
      ]),
      progressForMonth(req.user, month),
      Notification.countDocuments({ user: req.user._id, isRead: false }),
    ]);

    const income = pickTotal(totals, 'income');
    const expense = pickTotal(totals, 'expense');

    let top = null;
    if (topCategory.length) {
      const category = await Category.findById(topCategory[0]._id).select('name icon');
      if (category) {
        const total = toNum(topCategory[0].total);
        top = {
          id: category._id.toString(),
          name: category.name,
          icon: category.icon,
          amount: total,
          share: expense > 0 ? Math.round((total / expense) * 100) : 0,
        };
      }
    }

    const goal = toNum(req.user.monthlySavingsGoal);
    const saved = round2(income - expense);

    // Tips are part of the first paint (DASH-2): generate-on-read keeps them
    // fresh without needing a scheduled job.
    let tips = await topTips(req.user);
    if (!tips.length) await ensureTipsForMonth(req.user);
    tips = await topTips(req.user);

    const recent = await RecentActivity.find({ user: req.user._id })
      .sort({ at: -1 })
      .limit(5)
      .populate({ path: 'transaction', select: 'description amount type date category', populate: { path: 'category', select: 'name' } });

    res.json({
      month,
      balance: round2(income - expense),
      income,
      expense,
      counts: {
        income: pickCount(totals, 'income'),
        expense: pickCount(totals, 'expense'),
      },
      topCategory: top,
      budgets: budgets.slice(0, 5),
      savingsGoal: goal ? { goal, saved, pct: Math.min(100, Math.round((saved / goal) * 100)) } : null,
      tips: tips.map((t) => ({
        id: t._id.toString(),
        text: t.textRendered,
        potentialSavings: toNum(t.potentialSavings),
        status: t.status,
      })),
      unread,
      recent: recent
        .filter((r) => r.transaction && !r.transaction.isDeleted)
        .map((r) => ({
          id: r.transaction._id.toString(),
          description: r.transaction.description,
          amount: toNum(r.transaction.amount),
          type: r.transaction.type,
          date: r.transaction.date,
          category: r.transaction.category?.name || null,
        })),
    });
  } catch (err) {
    next(err);
  }
});

/** Chart data (DASH-4): two small aggregations, months as labels. */
router.get('/charts', async (req, res, next) => {
  try {
    const month = monthStart(req.query.month || Date.now());
    const sixStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 5, 1));
    const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));

    const [byMonth, byCategory] = await Promise.all([
      Transaction.aggregate([
        { $match: { user: req.user._id, isDeleted: false, date: { $gte: sixStart, $lt: next } } },
        {
          $group: {
            _id: {
              month: { $dateToString: { format: '%Y-%m', date: '$date' } },
              type: '$type',
            },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { '_id.month': 1 } },
      ]),
      Transaction.aggregate([
        { $match: { user: req.user._id, isDeleted: false, type: 'expense', date: { $gte: month, $lt: next } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
      ]),
    ]);

    // Six month labels ending with the requested month — gaps show as zero
    // so the axis never shifts when a month was simply not used.
    const labels = [];
    for (let back = 5; back >= 0; back -= 1) {
      const d = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - back, 1));
      labels.push({
        key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      });
    }

    const trend = labels.map((l) => {
      const rows = byMonth.filter((r) => r._id.month === l.key);
      return {
        label: l.label,
        income: round2(toNum(rows.find((r) => r._id.type === 'income')?.total ?? 0)),
        expense: round2(toNum(rows.find((r) => r._id.type === 'expense')?.total ?? 0)),
      };
    });

    const names = await Category.find({
      _id: { $in: byCategory.map((r) => r._id) },
    }).select('name icon');

    const doughnut = byCategory.map((r) => {
      const cat = names.find((n) => n._id.equals(r._id));
      return {
        category: cat?.name || 'Other',
        icon: cat?.icon || '',
        total: toNum(r.total),
      };
    });

    res.json({ trend, doughnut });
  } catch (err) {
    next(err);
  }
});

function pickTotal(rows, type) {
  return round2(toNum(rows.find((r) => r._id === type)?.total ?? 0));
}

function pickCount(rows, type) {
  return rows.find((r) => r._id === type)?.count ?? 0;
}

export default router;
