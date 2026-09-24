import Budget, { monthStart } from '../models/Budget.js';
import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import { toDec, toNum } from '../utils/money.js';

/**
 * Budget progress (BUD-1/2). Everything comes back in one shape the UI can
 * paint directly: limit, spent, percentage and a tone — where tone always
 * travels with an icon and a text label, never colour alone (design.md §5).
 */

export async function progressForMonth(user, month) {
  const start = monthStart(month);
  const budgets = await Budget.find({ user: user._id, month: start })
    .populate('category', 'name type icon')
    .sort({ 'category.name': 1 });

  const spentByCategory = await spendInMonth(user._id, start);
  const spentMap = new Map(spentByCategory.map((r) => [r.category.toString(), toNum(r.total)]));

  return budgets.map((b) => {
    const limit = toNum(b.limitAmount);
    const spent = spentMap.get(b.category._id.toString()) || 0;
    const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    return {
      id: b._id.toString(),
      category: b.category
        ? { id: b.category._id.toString(), name: b.category.name, icon: b.category.icon }
        : null,
      month: b.month,
      limit,
      spent,
      pct,
      tone: pct >= 100 ? 'over' : pct >= 80 ? 'near' : 'ok',
    };
  });
}

/** Set (or raise/lower) one category's limit for a month. */
export async function setBudget(user, { categoryId, month, limitAmount }) {
  const start = monthStart(month || Date.now());

  if (!/^\d+(\.\d{1,2})?$/.test(String(limitAmount)) || Number(limitAmount) <= 0) {
    throw badRequest('Budget limit must be a positive amount with up to 2 decimals.');
  }

  const category = await Category.findOne({
    _id: categoryId,
    $or: [{ user: user._id }, { user: null, isDefault: true }],
    type: 'expense',
    isActive: true,
  });
  if (!category) throw badRequest('Budgets can only be set on expense categories you can use.');

  const budget = await Budget.findOneAndUpdate(
    { user: user._id, category: category._id, month: start },
    { $set: { limitAmount: toDec(limitAmount) } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return budget;
}

/** "Copy last month" — one request, all of last month's limits re-applied. */
export async function copyFromPreviousMonth(user, month) {
  const target = monthStart(month || Date.now());
  const previous = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() - 1, 1));

  const lastMonths = await Budget.find({ user: user._id, month: previous });
  let copied = 0;
  for (const b of lastMonths) {
    const exists = await Budget.exists({ user: user._id, category: b.category, month: target });
    if (exists) continue;
    await Budget.create({
      user: user._id,
      category: b.category,
      month: target,
      limitAmount: b.limitAmount,
    });
    copied += 1;
  }
  return copied;
}

/** Expenses grouped by category for one month (DB-side grouping). */
export async function spendInMonth(userId, month) {
  const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  return Transaction.aggregate([
    { $match: { user: userId, type: 'expense', isDeleted: false, date: { $gte: month, $lt: next } } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $project: { _id: 0, category: '$_id', total: 1 } },
  ]);
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}
