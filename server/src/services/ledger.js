import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import TransactionHistory from '../models/TransactionHistory.js';
import Category from '../models/Category.js';
import RecentActivity from '../models/RecentActivity.js';
import { toDec, toNum, isPositiveAmount } from '../utils/money.js';
import { checkBudgetAlerts } from './alerts.js';
import { flagTransaction } from './anomaly.js';

/**
 * Every write to a transaction passes through here (TXN-1/4/6).
 * Views stay thin: they check the request, call one of these, respond.
 *
 * Invariants this module guarantees:
 *  - the category belongs to this person (default or their own) and its type
 *    matches the transaction type;
 *  - amount is a positive decimal with at most two decimals;
 *  - nothing is ever hard-deleted — `isDeleted` flips and a history row
 *    records the before/after snapshot;
 *  - budget alerts and the odd-entry badge run after each change.
 */

export async function createTransaction(user, input) {
  const category = await usableCategory(user, input.categoryId, input.type);
  const error = validate(input);
  if (error) throw badRequest(error);

  const txn = await Transaction.create({
    user: user._id,
    category: category._id,
    amount: toDec(input.amount),
    type: input.type,
    description: String(input.description || '').trim().slice(0, 255),
    date: startOfDay(input.date),
    suggestedCategory: input.suggestedCategory || null,
    suggestionSource: input.suggestionSource || null,
    recurringRule: input.recurringRule || null,
  });

  await writeHistory(txn, 'create', null, snapshot(txn, category.name));
  await flagTransaction(txn);
  await learnIfCorrected(user, txn, input.suggestedCategory, category._id);

  if (txn.type === 'expense') {
    await checkBudgetAlerts(user, category, txn.date);
  }
  return txn;
}

/**
 * When the person ignored the proposed category and picked another one,
 * each word of the description votes for their choice — the next suggestion
 * for similar wording will lean that way. Silent background step: a failure
 * here must never block saving the transaction itself.
 */
async function learnIfCorrected(user, txn, suggestedId, chosenId) {
  if (!suggestedId || String(suggestedId) === String(chosenId)) return;
  if (txn.suggestionSource !== 'history' && txn.suggestionSource !== 'keywords') return;
  try {
    const { learnFromCorrection } = await import('./categoriser.js');
    await learnFromCorrection(user, txn.description, chosenId);
  } catch {
    // learning is a convenience — the entry itself is already saved
  }
}

export async function updateTransaction(user, txnId, input) {
  const txn = await ownTransaction(user, txnId);
  const before = snapshot(txn);

  const category = await usableCategory(user, input.categoryId ?? txn.category, input.type ?? txn.type);
  const merged = {
    ...input,
    amount: input.amount ?? txn.amount,
    type: input.type ?? txn.type,
    date: input.date ?? txn.date,
    description: input.description ?? txn.description,
  };
  const error = validate(merged);
  if (error) throw badRequest(error);

  txn.category = category._id;
  txn.amount = toDec(merged.amount);
  txn.type = merged.type;
  txn.description = String(merged.description || '').trim().slice(0, 255);
  if (merged.date !== undefined) txn.date = startOfDay(merged.date);
  if (merged.suggestedCategory !== undefined) txn.suggestedCategory = merged.suggestedCategory || null;
  if (merged.suggestionSource !== undefined) txn.suggestionSource = merged.suggestionSource || null;
  await txn.save();

  await writeHistory(txn, 'update', before, snapshot(txn, category.name));
  await rememberActivity(user, txn._id, 'edited');
  await flagTransaction(txn);
  if (input.suggestedCategory !== undefined) {
    await learnIfCorrected(user, txn, input.suggestedCategory, category._id);
  }

  if (txn.type === 'expense') {
    await checkBudgetAlerts(user, category, txn.date);
  }
  return txn;
}

/** Soft delete (TXN-4): the row stays, the list hides it, history keeps proof. */
export async function softDeleteTransaction(user, txnId) {
  const txn = await ownTransaction(user, txnId);
  if (txn.isDeleted) return txn;

  txn.isDeleted = true;
  await txn.save();
  await writeHistory(txn, 'delete', snapshot(txn), null);

  const category = await Category.findById(txn.category);
  if (category && txn.type === 'expense') {
    // Deleting an overspending entry can bring the month back under 80%;
    // re-running the check keeps the numbers on the dashboard honest.
    await checkBudgetAlerts(user, category, txn.date);
  }
  return txn;
}

export async function restoreTransaction(user, txnId) {
  const txn = await ownTransaction(user, txnId, { includeDeleted: true });
  if (!txn.isDeleted) return txn;

  const category = await usableCategory(user, txn.category, txn.type);
  txn.isDeleted = false;
  await txn.save();
  await writeHistory(txn, 'restore', null, snapshot(txn, category.name));
  if (txn.type === 'expense') await checkBudgetAlerts(user, category, txn.date);
  return txn;
}

/**
 * The list view (TXN-5): search text, optional type/category/date filters,
 * newest first, paginated. Total spend for the same filter set comes back
 * alongside so the header matches the rows exactly.
 */
export async function listTransactions(user, query) {
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(5, Number(query.perPage) || 15));
  const filter = buildFilter(user, query);

  const [rows, total, sums] = await Promise.all([
    Transaction.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .populate('category', 'name type icon'),
    Transaction.countDocuments(filter),
    Transaction.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const income = sums.find((s) => s._id === 'income');
  const expense = sums.find((s) => s._id === 'expense');

  return {
    rows,
    page,
    perPage,
    total,
    // Totals were summed as Decimal128 in the database; toNum turns either
    // shape (Decimal128 or a plain number) into one rounded JSON figure.
    income: toNum(income?.total ?? 0),
    expense: toNum(expense?.total ?? 0),
  };
}

function buildFilter(user, query) {
  const filter = { user: user._id, isDeleted: false };

  if (query.type && ['income', 'expense'].includes(query.type)) filter.type = query.type;
  if (query.category && mongoose.isValidObjectId(query.category)) filter.category = query.category;
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = startOfDay(query.from);
    if (query.to) filter.date.$lte = startOfDay(query.to);
  }
  if (query.q) {
    // Escape user text before it becomes a regex — "$" or "(" must be
    // treated as literal characters, not operators.
    const safe = String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.description = { $regex: safe, $options: 'i' };
  }
  if (query.flag && ['large', 'duplicate'].includes(query.flag)) filter.flag = query.flag;
  return filter;
}

/* --------------------------------- helpers ---------------------------------- */

export async function ownTransaction(user, txnId, { includeDeleted = false } = {}) {
  if (!mongoose.isValidObjectId(txnId)) throw notFound();
  const txn = await Transaction.findOne({
    _id: txnId,
    user: user._id,
    ...(includeDeleted ? {} : { isDeleted: false }),
  });
  if (!txn) throw notFound();
  return txn;
}

async function usableCategory(user, categoryId, type) {
  if (!mongoose.isValidObjectId(categoryId)) throw badRequest('Please choose a category.');
  const category = await Category.findOne({
    _id: categoryId,
    $or: [{ user: user._id }, { user: null, isDefault: true }],
    isActive: true,
  });
  if (!category) throw badRequest('That category does not exist.');
  if (category.type !== type) throw badRequest(`"${category.name}" is an ${category.type} category.`);
  return category;
}

function validate(input) {
  if (!['income', 'expense'].includes(input.type)) return 'Type must be income or expense.';
  if (!isPositiveAmount(input.amount)) return 'Amount must be more than 0 with at most 2 decimals.';
  if (!input.date || Number.isNaN(new Date(input.date).getTime())) return 'Please pick a valid date.';
  return null;
}

/**
 * Calendar dates are stored at UTC midnight, never at the server's local
 * midnight: the database groups months with $dateToString (UTC) and the UI
 * slices the ISO string, so anything else shifts the day in time zones east
 * or west of UTC (entering 1 Sep would otherwise save as 31 Aug).
 */
function startOfDay(value) {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(String(value));
  if (day) return new Date(`${day[0].slice(0, 10)}T00:00:00.000Z`);
  const d = new Date(value);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function snapshot(txn, categoryName) {
  return {
    amount: Number(txn.amount.$numberDecimal ?? txn.amount),
    type: txn.type,
    category: txn.category.toString(),
    categoryName: categoryName || undefined,
    description: txn.description,
    date: txn.date.toISOString().slice(0, 10),
  };
}

async function writeHistory(txn, action, before, after) {
  await TransactionHistory.create({
    transaction: txn._id,
    user: txn.user,
    action,
    before,
    after,
    changedAt: new Date(),
  });
}

/** SYS-1: keep only the newest 20 entries per person. */
export async function rememberActivity(user, txnId, action) {
  await RecentActivity.deleteMany({ user: user._id, transaction: txnId });
  await RecentActivity.create({ user: user._id, transaction: txnId, action, at: new Date() });

  const mine = await RecentActivity.find({ user: user._id }).sort({ at: -1 }).select('_id');
  if (mine.length > 20) {
    const drop = mine.slice(20).map((r) => r._id);
    await RecentActivity.deleteMany({ _id: { $in: drop } });
  }
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound() {
  const err = new Error('Transaction not found.');
  err.status = 404;
  return err;
}
