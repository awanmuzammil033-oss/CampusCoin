import RecurringRule from '../models/RecurringRule.js';
import Transaction from '../models/Transaction.js';
import { monthStart } from '../models/Budget.js';
import { toNum } from '../utils/money.js';

/**
 * Survival mode (SURV-1).
 *
 * Late in the month, when the balance stops covering the month, a student does
 * not need another chart — they need one number: how much may I spend per day
 * until this is over. This service works that number out and ships the working
 * alongside it, because a budget nobody can follow is worse than no budget.
 *
 * The arithmetic, stated plainly:
 *   days left  = whole days from today to the last day of the month (1 on the
 *                30th of a 30-day month)
 *   committed  = the recurring BILLS that still land before then (a monthly bill
 *                counts once if its day-of-month is still ahead; a weekly bill
 *                counts once per remaining occurrence)
 *   expected   = the recurring INCOME that lands before then, because money that
 *                is already on its way can be spent
 *   free money = balance + expected − committed        (never below zero)
 *   daily      = free money ÷ days left
 * beside that, what the student has actually been spending per day since the
 * 1st — a strict number only means something next to the habit it changes.
 *
 * Nothing is stored but the on/off switch: the plan is recomputed from the
 * ledger on every read, so it can never go stale, and it is identical for
 * everyone running the same numbers.
 */

const MS_DAY = 24 * 60 * 60 * 1000;

/**
 * Midnight UTC of the given day. The ledger stores transaction dates at UTC
 * midnight (services/ledger.js `startOfDay`), so the plan has to count days on
 * the same clock — a student east or west of UTC must not lose a day of
 * allowance to a timezone.
 */
function dayOf(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(date, n) {
  return new Date(date.getTime() + n * MS_DAY);
}

function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / MS_DAY);
}

/** Number of days in the month `d` sits in. */
function daysInMonth(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Whole days from today to the end of the current month, 1-based. */
export function daysLeftInMonth(now = new Date()) {
  const today = dayOf(now);
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), daysInMonth(today)));
  return Math.max(1, daysBetween(today, end) + 1);
}

/**
 * How many times a recurring rule still fires before the month ends.
 *
 * Mirrors the generator in services/recurring.js exactly: weekly walks +7 days
 * from the start date, monthly lands on the same day-of-month clamped to the
 * length of the month. Getting this wrong would promise money the student does
 * not have, so the two functions are deliberately the same rule.
 */
function occurrencesBeforeMonthEnd(rule, today, monthEnd) {
  if (rule.endDate && dayOf(rule.endDate) < today) return 0; // already finished

  if (rule.frequency === 'weekly') {
    const start = dayOf(rule.startDate);
    const from = start > today ? start : today;
    // walk forward to the first occurrence on or after `from`
    const drift = daysBetween(start, from) % 7;
    const first = addDays(from, drift === 0 ? 0 : 7 - drift);
    if (first < start) return 0;
    if (first > monthEnd) return 0;
    return Math.floor(daysBetween(first, monthEnd) / 7) + 1;
  }

  // monthly: the day-of-month this month, clamped to a short month
  const start = dayOf(rule.startDate);
  const thisMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), Math.min(rule.dayOfPeriod || 1, daysInMonth(today)))
  );
  // a rule that only starts next month has nothing due this month
  if (start.getUTCFullYear() > today.getUTCFullYear() || start.getUTCMonth() > today.getUTCMonth()) return 0;
  if (thisMonth < start) return 0; // its day already passed before it began
  if (thisMonth < today) return 0; // already charged this month
  if (thisMonth > monthEnd) return 0;
  return 1;
}

/**
 * What the recurring rules will move before the month ends: bills going out
 * and income coming in, with a line per rule so the UI can show them.
 */
export function committedBeforeMonthEnd(rules, now = new Date()) {
  const today = dayOf(now);
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), daysInMonth(today)));
  const days = daysLeftInMonth(now);

  let out = 0;
  let in_ = 0;
  const lines = [];

  for (const rule of rules) {
    if (rule.isActive === false) continue;
    const amount = toNum(rule.amount);
    if (!(amount > 0)) continue;

    const count = occurrencesBeforeMonthEnd(rule, today, monthEnd);
    if (!count) continue;

    const total = Math.round(amount * count * 100) / 100;
    if (rule.type === 'income') in_ += total;
    else out += total;
    lines.push({
      id: rule._id?.toString?.() ?? String(rule._id),
      title: rule.description || '',
      amount: total,
      occurrences: count,
      kind: rule.type === 'income' ? 'income' : 'expense',
    });
  }

  return {
    total: Math.round(out * 100) / 100,
    income: Math.round(in_ * 100) / 100,
    lines,
    days,
  };
}

/** The student's balance across everything: income minus expense, all time. */
export async function currentBalance(user) {
  const rows = await Transaction.aggregate([
    { $match: { user: user._id, isDeleted: { $ne: true } } },
    { $group: { _id: '$type', total: { $sum: '$amount' } } },
  ]);
  const income = toNum(rows.find((r) => r._id === 'income')?.total || 0);
  const expense = toNum(rows.find((r) => r._id === 'expense')?.total || 0);
  return Math.round((income - expense) * 100) / 100;
}

/** What the student has been spending per day since the 1st of this month. */
export async function monthSoFar(user, now = new Date()) {
  const from = monthStart(now);
  const to = dayOf(now);
  const rows = await Transaction.aggregate([
    { $match: { user: user._id, isDeleted: { $ne: true }, date: { $gte: from, $lte: to } } },
    { $group: { _id: '$type', total: { $sum: '$amount' } } },
  ]);
  const income = toNum(rows.find((r) => r._id === 'income')?.total || 0);
  const expense = toNum(rows.find((r) => r._id === 'expense')?.total || 0);
  const daysElapsed = Math.max(1, to.getUTCDate());
  return {
    income,
    expense,
    daysElapsed,
    perDay: Math.round((expense / daysElapsed) * 100) / 100,
  };
}

/**
 * The whole survival plan for this student, right now.
 *
 * `advice` is a list of short keys rather than finished sentences: the browser
 * renders them in the language the student picked, and the numbers behind each
 * one travel in the rest of the payload so a reviewer can check the arithmetic
 * by hand.
 */
export async function survivalPlan(user, now = new Date()) {
  const enabled = Boolean(user.survivalMode?.enabled);
  const balance = await currentBalance(user);
  const rules = await RecurringRule.find({ user: user._id }).lean();
  const committed = committedBeforeMonthEnd(rules, now);
  const soFar = await monthSoFar(user, now);
  const days = committed.days;

  const free = Math.max(0, Math.round((balance + committed.income - committed.total) * 100) / 100);
  const daily = days > 0 ? Math.round((free / days) * 100) / 100 : 0;
  const shortfall = Math.max(0, Math.round((committed.total - balance) * 100) / 100);

  const advice = [];
  if (shortfall > 0) advice.push({ key: 'short', severity: 'high', amount: shortfall });
  else if (free <= 0) advice.push({ key: 'nothing-left', severity: 'high' });
  else advice.push({ key: 'daily', severity: 'ok', amount: daily });

  if (daily > 0 && soFar.perDay > daily) {
    advice.push({ key: 'slower', severity: 'warn', current: soFar.perDay, target: daily });
  } else if (daily > 0 && soFar.perDay > 0) {
    advice.push({ key: 'holding', severity: 'ok', current: soFar.perDay, target: daily });
  }
  if (committed.lines.length) advice.push({ key: 'committed', severity: 'info', count: committed.lines.length });
  if (balance <= 0) advice.push({ key: 'negative', severity: 'high' });

  return {
    enabled,
    since: user.survivalMode?.since || null,
    today: dayOf(now),
    daysLeft: days,
    balance,
    committedTotal: committed.total,
    expectedIncome: committed.income,
    committedLines: committed.lines,
    freeMoney: free,
    dailyBudget: daily,
    shortfall,
    tight: shortfall > 0 || free <= 0,
    monthSoFar: soFar,
    advice,
  };
}

/** Turn the mode on or off. Only the switch is stored; the plan is derived. */
export async function setSurvivalMode(user, enabled) {
  user.survivalMode = {
    enabled: Boolean(enabled),
    since: enabled ? new Date() : null,
  };
  await user.save();
  return survivalPlan(user);
}
