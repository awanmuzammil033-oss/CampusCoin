import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import { monthStart } from '../models/Budget.js';
import { toNum, round2 } from '../utils/money.js';

/**
 * Report queries (REP-1..4). One aggregation pipeline per question: MongoDB
 * groups the rows and hands back a few dozen totals — the raw history never
 * travels through JavaScript. Amounts stay Decimal128 from the $group to the
 * last line of each function, where toNum/round2 shape the JSON once, so a
 * month of cents never drifts through floating point. Every $match starts
 * with { user }, which is what keeps one student's report out of another's
 * (architecture §7).
 */

const MONTH_HELP = 'Please choose a month in the format YYYY-MM (for example 2026-09).';
const DAY_HELP = 'Please use dates like 2026-09-24 for the date range.';

/* ------------------------------ month helpers ------------------------------ */

/** "2026-09" (or a Date, or nothing → current month) → the 1st of that month
 *  in UTC, the same key budgets use, so reports and budgets line up. */
export function parseMonth(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw badRequest(MONTH_HELP);
    return monthStart(value);
  }
  const text = String(value ?? '').trim();
  if (!text) return monthStart(new Date()); // no ?month= asked for → this month

  const parts = /^(\d{4})-(\d{1,2})$/.exec(text);
  if (parts) {
    const month = Number(parts[2]);
    if (month < 1 || month > 12) throw badRequest(MONTH_HELP);
    return new Date(Date.UTC(Number(parts[1]), month - 1, 1));
  }
  const fallback = new Date(text);
  if (Number.isNaN(fallback.getTime())) throw badRequest(MONTH_HELP);
  return monthStart(fallback);
}

/** Canonical key for filenames and responses: "2026-09". */
export function monthKey(start) {
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "September 2026" — report headings, the PDF subtitle and the share email
 *  all read the month the same way because of this one function. */
export function monthLabel(start) {
  return start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/* ------------------------------- REP-1 ------------------------------------- */

/**
 * Category-wise spending for one month with the previous month alongside
 * (REP-1). Rows cover a category if it was used in *either* month, so a
 * category the student stopped spending on still appears with its drop
 * instead of vanishing from the comparison.
 */
export async function categoryReport(user, { month } = {}) {
  const start = parseMonth(month);
  const next = nextMonth(start);
  const prev = previousMonth(start);

  const [current, previous, typeTotals] = await Promise.all([
    expensesIn(user._id, start, next),
    expensesIn(user._id, prev, start),
    totalsByType(user._id, start, next),
  ]);

  const now = new Map(current.map((r) => [r._id.toString(), r.total]));
  const before = new Map(previous.map((r) => [r._id.toString(), r.total]));
  const ids = [...new Set([...now.keys(), ...before.keys()])];
  const info = await categoryNames(ids);

  const income = typeTotal(typeTotals, 'income');
  const expense = typeTotal(typeTotals, 'expense');

  // Merging two grouped months (~a dozen rows) is shaping the answer, not
  // crunching history — the transaction rows never leave the database.
  const rows = ids
    .map((id) => {
      const amount = toNum(now.get(id) ?? 0);
      const prevAmount = toNum(before.get(id) ?? 0);
      const change = round2(amount - prevAmount);
      const cat = info.get(id);
      return {
        categoryId: id,
        name: cat?.name || 'Other',
        icon: cat?.icon || '',
        amount,
        pct: expense > 0 ? round2((amount / expense) * 100) : 0,
        prevAmount,
        change,
        // null means "nothing here last month" — the screen and the PDF say
        // "New" rather than inventing a percentage.
        changePct: prevAmount > 0 ? round2((change / prevAmount) * 100) : null,
      };
    })
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  return {
    month: monthKey(start),
    monthLabel: monthLabel(start),
    totals: { income, expense, balance: round2(income - expense) },
    rows,
  };
}

/* ------------------------------- REP-2 ------------------------------------- */

/** Income vs expense per month for the last `months` months including the
 *  requested one (REP-2). Months nobody used stay in the series as zeroes so
 *  the axis never shifts. `month` anchors the end, which keeps a PDF exported
 *  for March showing the six months that end in March. */
export async function trendReport(user, { months = 6, month } = {}) {
  const end = parseMonth(month);
  // A silly ?months= value must not be able to open a range scan over decades.
  const count = Math.min(36, Math.max(1, Math.trunc(Number(months)) || 6));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (count - 1), 1));
  const next = nextMonth(end);

  const grouped = await Transaction.aggregate([
    { $match: { user: user._id, isDeleted: false, date: { $gte: start, $lt: next } } },
    {
      $group: {
        _id: { month: { $dateToString: { format: '%Y-%m', date: '$date' } }, type: '$type' },
        total: { $sum: '$amount' },
      },
    },
  ]);

  const totals = new Map(grouped.map((r) => [`${r._id.month}|${r._id.type}`, r.total]));
  const rows = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const day = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - back, 1));
    const key = monthKey(day);
    const income = toNum(totals.get(`${key}|income`) ?? 0);
    const expense = toNum(totals.get(`${key}|expense`) ?? 0);
    rows.push({
      key,
      label: day.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      income,
      expense,
      balance: round2(income - expense),
    });
  }
  return { rows };
}

/* ------------------------------- REP-3 ------------------------------------- */

/** Daily and weekly summaries of one month (REP-3). Days are zero-filled for
 *  the whole month; weeks are ISO weeks (Monday-based, the way dates are
 *  taught) as they fall inside the month, labelled Week 1..n in order. */
export async function dailyWeeklyReport(user, { month } = {}) {
  const start = parseMonth(month);
  const next = nextMonth(start);
  const match = { user: user._id, isDeleted: false, date: { $gte: start, $lt: next } };

  const [byDay, byWeek, typeTotals] = await Promise.all([
    Transaction.aggregate([
      { $match: match },
      { $group: { _id: { day: { $dayOfMonth: '$date' }, type: '$type' }, total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: { year: { $isoWeekYear: '$date' }, week: { $isoWeek: '$date' }, type: '$type' },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.week': 1, '_id.type': 1 } },
    ]),
    totalsByType(user._id, start, next),
  ]);

  const income = typeTotal(typeTotals, 'income');
  const expense = typeTotal(typeTotals, 'expense');

  return {
    month: monthKey(start),
    monthLabel: monthLabel(start),
    totals: { income, expense, balance: round2(income - expense) },
    days: dayRows(start, byDay),
    weeks: weekRows(byWeek),
  };
}

/* ------------------------------- REP-4 ------------------------------------- */

/** Totals plus rows behind the shared filter form (REP-4): date range,
 *  category, income source/type. With an untouched form it shows the current
 *  month rather than the whole history, so the page always opens on numbers
 *  a student recognises. */
export async function filteredSummary(user, { from, to, categoryId, type } = {}) {
  const filter = { user: user._id, isDeleted: false };
  let range;

  if (from || to) {
    const start = from ? parseDay(from) : null;
    const end = to ? parseDay(to) : null;
    if (start && end && start > end) {
      throw badRequest('The "from" date must not be after the "to" date.');
    }
    filter.date = {};
    if (start) filter.date.$gte = start;
    if (end) filter.date.$lte = end;
    range = { from: start ? isoLocal(start) : '', to: end ? isoLocal(end) : '' };
  } else {
    const first = monthStart(new Date());
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    filter.date = { $gte: first, $lt: nextMonth(first) };
    range = { from: monthKey(first) + '-01', to: isoUtc(last) };
  }

  if (type !== undefined && type !== null && type !== '') {
    if (!['income', 'expense'].includes(type)) throw badRequest('Please pick income or expense from the list.');
    filter.type = type;
  }

  if (categoryId) {
    if (!mongoose.isValidObjectId(categoryId)) throw badRequest('Please pick a category from the list.');
    const category = await Category.findOne({
      _id: categoryId,
      $or: [{ user: user._id }, { user: null, isDefault: true }],
    });
    // The wording stays the same whether the id was malformed or simply not
    // this person's — a report must not confirm that other ids exist.
    if (!category) throw badRequest('Please pick one of your categories from the list.');
    filter.category = category._id;
  }

  const [sums, found] = await Promise.all([
    Transaction.aggregate([
      { $match: filter },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    // The header totals are computed over every matching row; the list below
    // shows the newest 100 of them so the answer never grows with the history.
    Transaction.find(filter).sort({ date: -1, createdAt: -1 }).limit(100).populate('category', 'name type icon'),
  ]);

  const income = typeTotal(sums, 'income');
  const expense = typeTotal(sums, 'expense');

  return {
    range,
    filters: { category: categoryId || null, type: type || null },
    total: sums.reduce((n, r) => n + r.count, 0),
    totals: { income, expense, balance: round2(income - expense) },
    rows: found.map(presentRow),
  };
}

/* --------------------------------- helpers --------------------------------- */

/** Expenses grouped by category, inside the database (architecture §6.8 —
 *  one GROUP BY per view, never a loop over rows in JavaScript). */
function expensesIn(userId, from, to) {
  return Transaction.aggregate([
    { $match: { user: userId, isDeleted: false, type: 'expense', date: { $gte: from, $lt: to } } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $sort: { total: -1, _id: 1 } },
  ]);
}

function totalsByType(userId, from, to) {
  return Transaction.aggregate([
    { $match: { user: userId, isDeleted: false, date: { $gte: from, $lt: to } } },
    { $group: { _id: '$type', total: { $sum: '$amount' } } },
  ]);
}

function typeTotal(rows, type) {
  return round2(toNum(rows.find((r) => r._id === type)?.total ?? 0));
}

/** One lookup for every category the two months touched. The ids come out of
 *  this person's own transactions, so there is no leak path here — one find()
 *  simply beats populating each row. */
async function categoryNames(ids) {
  if (!ids.length) return new Map();
  const found = await Category.find({ _id: { $in: ids } }).select('name icon');
  return new Map(found.map((c) => [c._id.toString(), { name: c.name, icon: c.icon }]));
}

function dayRows(start, grouped) {
  const lookup = new Map(grouped.map((r) => [`${r._id.day}|${r._id.type}`, r.total]));
  const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const rows = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    rows.push({
      label: String(day),
      date: `${monthKey(start)}-${String(day).padStart(2, '0')}`,
      expense: toNum(lookup.get(`${day}|expense`) ?? 0),
      income: toNum(lookup.get(`${day}|income`) ?? 0),
    });
  }
  return rows;
}

/** An ISO week can straddle a month (and a year) boundary, so weeks are keyed
 *  by ISO week-year + week number; the sort in the pipeline makes the labels
 *  1..n fall in chronological order. */
function weekRows(grouped) {
  const rows = [];
  const index = new Map();
  for (const r of grouped) {
    const key = `${r._id.year}-W${String(r._id.week).padStart(2, '0')}`;
    if (!index.has(key)) {
      index.set(key, rows.length);
      rows.push({ key, label: `Week ${rows.length + 1}`, expense: 0, income: 0 });
    }
    rows[index.get(key)][r._id.type] = toNum(r.total);
  }
  return rows;
}

/** Date-only strings become local midnights — the exact instant entries are
 *  stored at (see ledger.js) — so "to 2026-09-24" includes everything logged
 *  on the 24th. */
function parseDay(value) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(value).trim());
  if (!m) throw badRequest(DAY_HELP);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // The Date constructor quietly rolls 2026-02-31 into March, so round-trip
  // check every part — that is what actually rejects impossible dates.
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
    throw badRequest(DAY_HELP);
  }
  return d;
}

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoUtc(d) {
  return d.toISOString().slice(0, 10);
}

function nextMonth(start) {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

function previousMonth(start) {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
}

function presentRow(txn) {
  const cat = txn.category;
  return {
    id: txn._id.toString(),
    amount: toNum(txn.amount),
    type: txn.type,
    description: txn.description,
    date: txn.date,
    category:
      cat && typeof cat === 'object' && cat.name !== undefined
        ? { id: cat._id.toString(), name: cat.name, type: cat.type, icon: cat.icon }
        : cat,
  };
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}
