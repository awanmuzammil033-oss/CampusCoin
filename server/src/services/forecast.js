import Transaction from '../models/Transaction.js';
import RecurringRule from '../models/RecurringRule.js';
import Category from '../models/Category.js';
import { toNum, round2 } from '../utils/money.js';

/**
 * Next-month forecast (PRD §3.12 SYS-2, architecture §6.7).
 *
 * Per expense category: the last three *full* months are weighted
 * 0.5 / 0.3 / 0.2 so the most recent month matters most, then anything the
 * person has already scheduled (active recurring rules that fall in the
 * coming month) is added on top. A quiet month counts as zero — that is
 * deliberate, it pulls the estimate down the way reality would.
 *
 * History is read with one database aggregation grouped by month+category;
 * nothing loops over individual transactions in JavaScript. The result is
 * always labelled an estimate by the caller — it is a helpful guess from
 * past behaviour, never a promise.
 */

export async function forecastNextMonth(user) {
  const now = new Date();
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  // The last three full months: the previous one is m1, then m2, then m3 —
  // so the window has to open three month-starts back, on m3's first day.
  const threeMonthsBack = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const monthKeys = [
    keyOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))),
    keyOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))),
    keyOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1))),
  ];
  const weights = [0.5, 0.3, 0.2];

  const [history, rules] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          user: user._id,
          isDeleted: false,
          type: 'expense',
          date: { $gte: threeMonthsBack, $lt: currentMonth },
        },
      },
      {
        $group: {
          _id: { month: { $dateToString: { format: '%Y-%m', date: '$date' } }, category: '$category' },
          total: { $sum: '$amount' },
        },
      },
    ]),
    RecurringRule.find({ user: user._id, isActive: true, type: 'expense' }),
  ]);

  const byCategory = new Map(); // catId -> weighted history estimate
  for (const row of history) {
    const index = monthKeys.indexOf(row._id.month);
    if (index === -1) continue; // outside the three-month window
    const catId = String(row._id.category);
    byCategory.set(catId, (byCategory.get(catId) || 0) + toNum(row.total) * weights[index]);
  }

  // Scheduled entries for the coming month sit on top of the trend.
  const upcoming = new Map(); // catId -> total recurring amount due next month
  for (const rule of rules) {
    const occurrences = occurrencesIn(rule, nextMonth);
    if (occurrences === 0) continue;
    const catId = rule.category.toString();
    upcoming.set(catId, (upcoming.get(catId) || 0) + toNum(rule.amount) * occurrences);
  }

  const categoryIds = new Set([...byCategory.keys(), ...upcoming.keys()]);
  if (categoryIds.size === 0) return [];

  const rows = await Category.find({ _id: { $in: [...categoryIds] }, isActive: true }).select('name icon');
  const info = new Map(rows.map((c) => [c._id.toString(), c]));

  return [...categoryIds]
    .map((catId) => {
      const category = info.get(catId);
      if (!category) return null;
      const estimated = round2((byCategory.get(catId) || 0) + (upcoming.get(catId) || 0));
      if (estimated <= 0) return null;
      return {
        category: { id: category._id.toString(), name: category.name, icon: category.icon },
        estimated,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.estimated - a.estimated);
}

/** How often a rule fires inside the given month (always 0 or 1 monthly). */
function occurrencesIn(rule, monthStart) {
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
  const start = new Date(rule.startDate);
  const end = rule.endDate ? new Date(rule.endDate) : null;

  if (end && end < monthStart) return 0;

  if (rule.frequency === 'monthly') {
    return start <= monthEnd && (!end || end >= monthStart) ? 1 : 0;
  }

  // Weekly: jump straight to the first occurrence on or after the month,
  // then count the seven-day steps that still land inside it.
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  if (start > monthEnd) return 0;
  const first = start.getTime() + Math.ceil((monthStart - start) / WEEK) * WEEK;
  let count = 0;
  for (let at = first; at <= monthEnd.getTime(); at += WEEK) {
    if (!end || new Date(at) <= end) count += 1;
  }
  return count;
}

function keyOf(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
