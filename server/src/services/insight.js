import Insight from '../models/Insight.js';
import Budget, { monthStart } from '../models/Budget.js';
import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import env from '../config/env.js';
import { toNum, round2, formatMoney } from '../utils/money.js';

/**
 * The monthly spending insight (PRD §3.7, architecture §6.5).
 *
 * One short, friendly paragraph about the month plus a single piece of
 * advice, built only from database aggregates: totals, the top categories,
 * each category's change against the person's own last three months, their
 * biggest single expense (amount only) and any budget breaches. No
 * descriptions, names or email addresses take part, and nothing here is a
 * verdict — every response carries the advisory disclaimer.
 *
 * The narrative is a readable template by default. When a remote text
 * endpoint is configured in the environment, only the aggregated facts are
 * sent to it, and any failure — timeout, bad payload, network trouble —
 * quietly falls back to the template, so a month always generates.
 *
 * One row per person per month (unique user+month): regenerating overwrites
 * the text but keeps the bookmark and note the person attached.
 */

export const DISCLAIMER = 'Suggestions only — not financial advice.';

const WORD_LIMIT = 120;
const REMOTE_TIMEOUT_MS = 3000;

/* --------------------------------- entry point --------------------------------- */

export async function generateInsight(user, month) {
  const start = monthStart(month || new Date());
  const facts = await gatherFacts(user, start);

  let summaryText = writeSummary(facts);
  let source = 'template';

  const remoteText = await fetchRemoteSummary(facts);
  if (remoteText) {
    summaryText = remoteText;
    source = 'remote';
  }

  return Insight.findOneAndUpdate(
    { user: user._id, month: start },
    {
      $set: {
        summaryText,
        tipText: writeTip(facts),
        // Stored without the extra working numbers the writer needs.
        flags: facts.flags.map((flag) => ({
          category: flag.category,
          pctChange: flag.pctChange,
          amount: flag.amount,
        })),
        source,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/* ----------------------------------- facts ------------------------------------- */

/** Everything the writer and the remote endpoint may see — aggregates only. */
async function gatherFacts(user, month) {
  const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const threeBack = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 3, 1));
  const now = new Date();

  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const isCurrent = month.getTime() === monthStart(now).getTime();
  const partial = isCurrent && now.getUTCDate() < daysInMonth;

  const [typeTotals, monthlyByCategory, largestRows, budgets] = await Promise.all([
    Transaction.aggregate([
      { $match: { user: user._id, isDeleted: false, date: { $gte: month, $lt: nextMonth } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      {
        $match: {
          user: user._id,
          isDeleted: false,
          type: 'expense',
          date: { $gte: threeBack, $lt: nextMonth },
        },
      },
      {
        $group: {
          _id: { month: { $dateToString: { format: '%Y-%m', date: '$date' } }, category: '$category' },
          total: { $sum: '$amount' },
        },
      },
    ]),
    Transaction.aggregate([
      { $match: { user: user._id, isDeleted: false, type: 'expense', date: { $gte: month, $lt: nextMonth } } },
      { $group: { _id: null, largest: { $max: '$amount' } } },
    ]),
    Budget.find({ user: user._id, month }).populate('category', 'name type'),
  ]);

  const monthKey = keyOf(month);
  const previousKeys = [1, 2, 3].map((back) => keyOf(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - back, 1))));

  const current = new Map();
  const history = new Map(); // categoryId -> (monthKey -> amount) for the three baseline months
  for (const row of monthlyByCategory) {
    const catId = String(row._id.category);
    const amount = toNum(row.total);
    if (row._id.month === monthKey) {
      current.set(catId, amount);
    } else if (previousKeys.includes(row._id.month)) {
      let bucket = history.get(catId);
      if (!bucket) {
        bucket = new Map();
        history.set(catId, bucket);
      }
      bucket.set(row._id.month, amount);
    }
  }

  const names = await loadNames([...current.keys()]);
  const categories = [...current.entries()]
    .map(([catId, amount]) => {
      const baseline = baselineOf(previousKeys, history.get(catId));
      return {
        id: catId,
        name: names.get(catId) || 'Another category',
        amount: round2(amount),
        baseline,
        pctChange: baseline > 0 ? Math.round(((amount - baseline) / baseline) * 100) : null,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // A category only counts as "rising" when there is a baseline to rise
  // against: +25% and at least $5 more, so pocket change never gets flagged.
  const flags = categories
    .filter((c) => c.pctChange !== null && c.pctChange >= 25 && round2(c.amount - c.baseline) >= 5)
    .map((c) => ({ ...c, rise: round2(c.amount - c.baseline) }))
    .sort((a, b) => b.rise - a.rise)
    .slice(0, 3);

  const breaches = budgets
    .filter((b) => b.category)
    .map((b) => {
      const limit = toNum(b.limitAmount);
      const spent = round2(current.get(b.category._id.toString()) || 0);
      return {
        name: b.category.name,
        limit,
        spent,
        pct: limit > 0 ? Math.round((spent / limit) * 100) : 0,
        over: limit > 0 && spent >= limit,
      };
    })
    .filter((b) => b.limit > 0 && b.pct >= 80)
    .sort((a, b) => Number(b.over) - Number(a.over) || b.pct - a.pct);

  const income = sumOfType(typeTotals, 'income');
  const expense = sumOfType(typeTotals, 'expense');

  return {
    month,
    partial,
    income,
    expense,
    top: categories.slice(0, 3),
    flags,
    breaches,
    biggest: largestRows[0] ? round2(toNum(largestRows[0].largest)) : 0,
  };
}

/* ---------------------------------- writing ------------------------------------ */

function writeSummary(f) {
  const sentences = [];

  if (f.expense === 0 && f.income === 0) {
    sentences.push('No money in or out this month yet — add an entry and this summary starts taking shape.');
    return sentences.join(' ');
  }

  if (f.expense === 0) {
    sentences.push(`You took in ${money(f.income)} this month and recorded no spending.`);
  } else if (f.partial) {
    sentences.push(`You have spent ${money(f.expense)} so far this month, after taking in ${money(f.income)}.`);
  } else {
    sentences.push(`You spent ${money(f.expense)} this month against ${money(f.income)} in.`);
  }

  const top = f.top[0];
  if (top && f.expense > 0) {
    const share = Math.round((top.amount / f.expense) * 100);
    sentences.push(`Most of that went to ${top.name} (${money(top.amount)}) — ${share}% of your spending.`);
  }

  for (const flag of f.flags.slice(0, 2)) {
    sentences.push(`${flag.category} rose ${flag.pctChange}% against your usual ${money(flag.baseline)} a month.`);
  }

  const fresh = f.top.find((c) => c.baseline === 0 && c.amount >= 25);
  if (fresh && f.flags.length === 0) {
    sentences.push(`${fresh.name} (${money(fresh.amount)}) is a new one for you this month.`);
  }

  for (const breach of f.breaches.slice(0, 2)) {
    sentences.push(
      breach.over
        ? `You are over your ${breach.name} budget by ${money(breach.spent - breach.limit)}.`
        : `You have used ${breach.pct}% of your ${breach.name} budget.`
    );
  }

  if (f.biggest > 0) {
    sentences.push(`Your largest single expense was ${money(f.biggest)}.`);
  }

  if (f.expense > 0 && f.flags.length === 0 && f.breaches.length === 0) {
    sentences.push('Nothing ran off trend — your spending stayed close to your usual pattern.');
  }

  return limitWords(sentences);
}

function writeTip(f) {
  const flag = f.flags[0];
  if (flag) {
    // Weekly cap from the three-month average: 4.3 weeks in a month keeps
    // the advice in the same ballpark as the trend that triggered it.
    const weekly = round2(flag.baseline / 4.3);
    return `Try holding ${flag.category} to about ${money(weekly)} a week — that lands near your usual ${money(flag.baseline)} a month.`;
  }

  const over = f.breaches.find((b) => b.over);
  if (over) {
    return `Ease off ${over.name} for the rest of the month to get back under your ${money(over.limit)} limit.`;
  }
  const near = f.breaches[0];
  if (near) {
    return `About ${money(round2(near.limit / 4.3))} a week keeps ${near.name} inside your ${money(near.limit)} limit.`;
  }
  if (f.top[0]) {
    const saving = round2(f.top[0].amount * 0.1);
    if (saving >= 0.5) return `Trimming a tenth off ${f.top[0].name} would keep about ${money(saving)} with you.`;
  }
  return 'Keep logging each entry — the summary gets sharper with a full month of data.';
}

/* ------------------------------- optional remote ------------------------------- */

/**
 * Send only the aggregated facts to the configured endpoint and expect
 * {text} back. Three seconds, then give up: the caller keeps the template.
 */
async function fetchRemoteSummary(facts) {
  if (!env.narrativeApiKey || !env.narrativeApiUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    const res = await fetch(env.narrativeApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.narrativeApiKey}`,
      },
      body: JSON.stringify({
        month: keyOf(facts.month),
        income: facts.income,
        expense: facts.expense,
        categories: facts.categories.map((c) => ({
          name: c.name,
          amount: c.amount,
          pctChange: c.pctChange,
        })),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    return text ? text.slice(0, 700) : null;
  } catch {
    // Timeout, network trouble or an odd payload — the template summary is
    // already written, so the month still generates without a hitch.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------- helpers ------------------------------------ */

function baselineOf(previousKeys, bucket) {
  if (!bucket) return 0;
  let sum = 0;
  for (const key of previousKeys) sum += bucket.get(key) || 0;
  return round2(sum / 3);
}

async function loadNames(categoryIds) {
  if (categoryIds.length === 0) return new Map();
  const rows = await Category.find({ _id: { $in: categoryIds } }).select('name');
  return new Map(rows.map((c) => [c._id.toString(), c.name]));
}

function sumOfType(typeTotals, type) {
  const row = typeTotals.find((r) => r._id === type);
  return round2(toNum(row?.total ?? 0));
}

function limitWords(sentences) {
  const kept = [];
  let words = 0;
  for (const sentence of sentences) {
    const count = sentence.split(/\s+/).length;
    if (words + count > WORD_LIMIT) break;
    kept.push(sentence);
    words += count;
  }
  return kept.join(' ');
}

function money(n) {
  return `$${formatMoney(n)}`;
}

function keyOf(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
