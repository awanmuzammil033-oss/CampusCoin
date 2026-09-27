/**
 * services/insights.js — the numbers behind the spending-insights card.
 *
 * THE RULE OF THIS FILE: it returns FACTS. A total, a count, a share, a weekday
 * split, an id. It never returns a sentence, and it never decides what anybody
 * should buy or stop buying — the client turns each pattern into words from the
 * dictionary, which is the only reason a tip can exist in fourteen languages and
 * still be the same tip everywhere.
 *
 * The percentages it does send (the "about 40%" in the dining tip) are planning
 * arithmetic, stated as named constants with the reasoning attached: a person who
 * eats out four times in a month has four chances to eat at home instead, and a
 * rough figure is more honest than a precise one. They are estimates, and the
 * wording in the dictionary says "about".
 */
import mongoose from 'mongoose';

import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import { toNum, round2 } from '../utils/money.js';
import { vaultSummary } from './vault.js';

/* ------------------------------ the buckets ------------------------------- */

/**
 * Which kind of spending a category is, decided by its NAME, because that is
 * the only thing both a default category and a person's own category share. It
 * is a word list, not a guess: a category called "Hostel" is rent whatever
 * anybody calls it, and a category whose name matches nothing is simply "other".
 */
const BUCKETS = [
  { bucket: 'food', words: ['food', 'dining', 'cafe', 'cafeteria', 'canteen', 'restaurant', 'meal', 'eat', 'grocery', 'groceries', 'snack', 'coffee', 'chai', 'tea', 'bakery'] },
  { bucket: 'transport', words: ['transport', 'travel', 'ride', 'fuel', 'petrol', 'bus', 'train', 'taxi', 'uber', 'careem', 'parking', 'toll'] },
  { bucket: 'subscriptions', words: ['subscription', 'membership', 'streaming', 'netflix', 'spotify', 'youtube', 'gym', 'plan'] },
  { bucket: 'shopping', words: ['shopping', 'clothes', 'clothing', 'electronics', 'phone', 'gift', 'toys'] },
  { bucket: 'entertainment', words: ['entertainment', 'movie', 'movies', 'cinema', 'games', 'concert', 'hobby', 'sport'] },
  { bucket: 'rent', words: ['rent', 'hostel', 'room', 'flat', 'accommodation', 'utility', 'utilities', 'electric', 'water', 'gas', 'internet', 'wifi'] },
  { bucket: 'studies', words: ['academic', 'book', 'books', 'course', 'tuition', 'fees', 'stationery', 'exam'] },
];

function bucketOf(name) {
  const text = String(name || '').toLowerCase();
  for (const row of BUCKETS) {
    if (row.words.some((word) => text.includes(word))) return row.bucket;
  }
  return 'other';
}

/* ------------------------------- the estimates ---------------------------- */

/**
 * What one avoided meal is worth, and what an unused subscription is worth. Both
 * are round numbers on purpose: a tip that says "PKR 137" reads as a measurement,
 * and this is not one.
 */
const HOME_COOKED_WORTH = 0.4; // of the dining spend in the month
const SMALL_BUDGET_CENTS = 20000; // "a small purchase" ceiling, in cents of the ledger currency
const SMALL_SPEND_COUNT = 4; // how many of them make a habit
const WEEKEND_SHARE_WORTH_A_LOOK = 0.35; // of the month's spending

/* --------------------------------- helpers -------------------------------- */

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Last month by default: a card about a month you are still living in is a to-do list, not an insight. */
function previousMonth() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return monthKey(first);
}

function monthBounds(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return { from: new Date(year, month - 1, 1), to: new Date(year, month, 1) };
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

const cents = (value) => Math.round(Number(value || 0) * 100);
const fromCents = (value) => round2(value / 100);

/* -------------------------------- the service ----------------------------- */

/**
 * The facts behind one month of spending. Read-only: this module never writes,
 * and its only inputs are the person's own transactions, their own categories and
 * their own vault.
 */
export async function spendingInsights(user, { month } = {}) {
  const key = month ? String(month) : previousMonth();
  const bounds = monthBounds(key);
  if (!bounds) throw badRequest('Ask for a month as YYYY-MM, e.g. 2026-08.');

  const rows = await Transaction.find({
    user: user._id,
    isDeleted: { $ne: true },
    date: { $gte: bounds.from, $lt: bounds.to },
  })
    .populate('category', 'name type')
    .lean();

  const categories = new Map();
  let income = 0;
  let expense = 0;
  let weekendCents = 0;
  let weekendCount = 0;

  for (const row of rows) {
    const value = toNum(row.amount) || 0;
    const isWeekend = [0, 6].includes(new Date(row.date).getDay());

    if (row.type === 'income') {
      income += value;
      continue;
    }

    expense += value;
    if (isWeekend) {
      weekendCents += cents(value);
      weekendCount += 1;
    }

    const id = row.category?._id ? String(row.category._id) : 'none';
    const name = row.category?.name || 'Uncategorised';
    const bucket = bucketOf(name);
    if (!categories.has(id)) {
      categories.set(id, { id, name, bucket, total: 0, count: 0, weekend: 0 });
    }
    const bucketRow = categories.get(id);
    bucketRow.total += value;
    bucketRow.count += 1;
    if (isWeekend) bucketRow.weekend += value;
  }

  const list = [...categories.values()].sort((a, b) => b.total - a.total);
  for (const row of list) row.share = expense > 0 ? round2(row.total / expense) : 0;

  const patterns = [];
  const byBucket = new Map();
  for (const row of list) {
    if (!byBucket.has(row.bucket)) byBucket.set(row.bucket, { total: 0, count: 0, rows: [] });
    const bucket = byBucket.get(row.bucket);
    bucket.total += row.total;
    bucket.count += row.count;
    bucket.rows.push(row);
  }

  // 1. eating out: several chances in a month is a habit, not an accident
  const food = byBucket.get('food');
  if (food && food.count >= 3) {
    patterns.push({
      id: 'dining_out',
      total: round2(food.total),
      count: food.count,
      category: food.rows[0]?.name || '',
      // the estimate, sent as a number so the client never has to do it twice
      saving: fromCents(Math.round(cents(food.total) * HOME_COOKED_WORTH)),
      basis: 'home_cooked',
    });
  }

  // 2. the same category, again and again, at a price that adds up to nothing
  for (const row of list) {
    if (row.count < SMALL_SPEND_COUNT) continue;
    if (cents(row.total) / row.count > SMALL_BUDGET_CENTS) continue;
    patterns.push({
      id: 'many_small',
      total: round2(row.total),
      count: row.count,
      category: row.name,
      average: round2(row.total / row.count),
      basis: 'many_small',
    });
  }

  // 3. the weekend, when the month has one
  if (expense > 0 && weekendCents > 0) {
    const share = round2(weekendCents / cents(expense));
    if (share >= WEEKEND_SHARE_WORTH_A_LOOK) {
      patterns.push({
        id: 'weekend',
        total: fromCents(weekendCents),
        count: weekendCount,
        share,
        basis: 'weekend',
      });
    }
  }

  // 4. subscriptions nobody has used - the vault already knows which
  let vault = null;
  try {
    vault = await vaultSummary(user);
  } catch {
    // the vault is a convenience here, never a reason to fail the card
    vault = null;
  }
  if (vault && vault.verdicts?.idle > 0 && vault.monthlyTotal > 0) {
    patterns.push({
      id: 'idle_subscriptions',
      total: round2(vault.monthlyTotal),
      count: vault.verdicts.idle,
      basis: 'vault',
    });
  }

  patterns.sort((a, b) => (b.saving || 0) - (a.saving || 0) || b.total - a.total);

  return {
    month: key,
    totals: {
      income: round2(income),
      expense: round2(expense),
      balance: round2(income - expense),
      count: rows.length,
    },
    categories: list,
    patterns,
    // the two categories worth naming first, which is the "Analysis" line
    top: list.slice(0, 2).map((row) => ({ name: row.name, total: round2(row.total), share: row.share })),
    estimates: {
      // stated here so the client can label them and the tests can see them
      homeCooked: HOME_COOKED_WORTH,
      weekendLook: WEEKEND_SHARE_WORTH_A_LOOK,
    },
  };
}

/**
 * The months a person can be shown, newest first, for the card's month picker.
 * A month with nothing in it is not offered: there is nothing to say about it.
 */
export async function insightMonths(user, { limit = 12 } = {}) {
  const rows = await Transaction.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(String(user._id)), isDeleted: { $ne: true } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, count: { $sum: 1 } } },
    { $sort: { _id: -1 } },
    { $limit: Math.min(Math.max(Number(limit) || 12, 1), 36) },
  ]);

  return rows.map((row) => ({ month: row._id, count: row.count }));
}
