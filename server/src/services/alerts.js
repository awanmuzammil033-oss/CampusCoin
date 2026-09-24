import Budget, { monthStart } from '../models/Budget.js';
import Notification from '../models/Notification.js';
import Transaction from '../models/Transaction.js';
import { toNum } from '../utils/money.js';

/**
 * Budget alerts (BUD-2/3, architecture §6.1).
 * Called after any change to an expense: create, edit, delete, restore.
 *
 * The rules that matter:
 *  - the spent figure comes from a database $sum over that month only;
 *  - 80% warns, 100% alerts — and each threshold fires at most once per
 *    category per month, because the unique index in Notification rejects a
 *    second insert. Editing transactions back and forth therefore can never
 *    spam the bell.
 */
export async function checkBudgetAlerts(user, category, date) {
  const month = monthStart(date);

  const budget = await Budget.findOne({ user: user._id, category: category._id, month });
  if (!budget) return null;

  const agg = await categorySpend(user._id, category._id, month);
  const spent = agg ? toNum(agg.total) : 0;
  const limit = toNum(budget.limitAmount);
  if (limit <= 0) return null;

  const ratio = spent / limit;
  let kind = null;
  if (ratio >= 1) kind = 'budget_exceeded';
  else if (ratio >= 0.8) kind = 'budget_near';
  if (!kind) return null;

  const pct = Math.round(ratio * 100);
  const message =
    kind === 'budget_exceeded'
      ? `You're over your ${category.name} budget by ${money(limit - spent)} (${pct}% used). Small tweaks next week can balance it.`
      : `Heads up — you've used ${pct}% of your ${category.name} budget (${money(spent)} of ${money(limit)}).`;

  try {
    return await Notification.create({
      user: user._id,
      kind,
      message,
      category: category._id,
      month,
    });
  } catch (err) {
    // 11000 = this threshold already fired this month. That is the design,
    // not an error worth surfacing.
    if (err.code === 11000) return null;
    throw err;
  }
}

/** Sum of one category's expenses in one month — used by alerts and widgets. */
export async function categorySpend(userId, categoryId, month) {
  const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const rows = await Transaction.aggregate([
    {
      $match: {
        user: userId,
        category: categoryId,
        type: 'expense',
        isDeleted: false,
        date: { $gte: month, $lt: nextMonth },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return rows[0] || null;
}

function money(n) {
  return `$${Number(n).toFixed(2)}`;
}
