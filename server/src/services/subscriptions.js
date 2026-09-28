import mongoose from 'mongoose';
import RecurringRule from '../models/RecurringRule.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import { toNum, round2, formatMoney } from '../utils/money.js';
import { vaultReport, cancelSubscription } from './vault.js';

/**
 * Renewals (NEW-6): what is about to charge this person, and when they last
 * heard from it.
 *
 * A subscription is not a second kind of thing — it is a recurring expense,
 * and this screen says so. Everything here is read from RecurringRule rows the
 * person already owns, so nothing has to be created to be seen, and no list can
 * disagree with the ledger about what a subscription is.
 *
 * Two rules carry the feature:
 *  - The next charge date is derived, never stored. `nextChargeOn` is the only
 *    place that derivation exists, and the report and the reminder both call
 *    it, so a warning can never name a different day from the list above it.
 *  - The vault already answers "which of these am I not using?" Its verdict is
 *    read and passed through, never recomputed, so a payment can be both "not
 *    used lately" and "charging in three days" — which is the most useful thing
 *    the app can say about it, and the reason the two screens sit together.
 */

const DAY = 24 * 60 * 60 * 1000;
/** 52 weeks in 12 months — the same approximation the vault and insight.js use. */
const WEEKS_PER_MONTH = 52 / 12;

/** How close a charge gets before the bell says something, unless the rule says otherwise. */
export const DEFAULT_REMINDER_DAYS = 3;
/** Long enough for a semester, short enough that a forgotten pause cannot run for years. */
export const DEFAULT_PAUSE_DAYS = 30;
export const MAX_PAUSE_DAYS = 365;

/** The verdicts the vault has an opinion about. 'in-use' is it having none. */
const VERDICTS_WITH_SOMETHING_TO_SAY = new Set(['idle', 'duplicate', 'price-creep', 'one-off']);

/* ------------------------- the one next-charge date -------------------------- */

/**
 * The date this rule will charge next, at UTC midnight, or null when nothing
 * is coming. Derived from the same series the generator walks — the start date
 * is itself an occurrence, weekly is every seventh day from it, and a monthly
 * day of 29 to 31 lands on the last day of a shorter month.
 *
 * null means "nothing is about to happen", which is the case for a cancelled
 * entry, an entry that has run out its end date, and an entry inside a pause.
 * While a pause holds there is no charge to count down to, and the report says
 * so with `isPaused` + `pausedUntil` rather than by pointing at a date the
 * money will not move on.
 */
export function nextChargeOn(rule, today = new Date()) {
  const now = startOfDay(today);
  if (rule.isActive === false) return null;
  if (isPausedOn(rule, now)) return null;

  const end = rule.endDate ? startOfDay(rule.endDate) : null;
  if (end && end < now) return null;

  let next = firstDueOnOrAfter(rule, now);
  // A cursor already sitting on the date means that charge has been logged, so
  // the one worth warning about is the one after it.
  if (rule.lastGeneratedOn && startOfDay(rule.lastGeneratedOn) >= next) next = followingDate(rule, next);
  if (end && next > end) return null;
  return next;
}

/** A pause only holds while its last day is still ahead. */
export function isPausedOn(rule, today = new Date()) {
  return Boolean(rule.pausedUntil) && startOfDay(rule.pausedUntil) > startOfDay(today);
}

/**
 * The first occurrence on or after `now`. The start date is the first
 * occurrence of all — the generator charges it on the day the entry is set up
 * — and every later one is a fixed step away from it.
 */
function firstDueOnOrAfter(rule, now) {
  const start = startOfDay(rule.startDate);
  if (start > now) return start;

  if (rule.frequency === 'weekly') {
    const drift = daysBetween(start, now) % 7;
    return addDays(now, drift === 0 ? 0 : 7 - drift);
  }

  const thisMonth = monthlyDayOf(rule, now.getUTCFullYear(), now.getUTCMonth());
  return thisMonth >= now ? thisMonth : monthlyDayOf(rule, now.getUTCFullYear(), now.getUTCMonth() + 1);
}

/** The occurrence after `from` — the same step the generator takes. */
function followingDate(rule, from) {
  if (rule.frequency === 'weekly') return addDays(from, 7);
  return monthlyDayOf(rule, from.getUTCFullYear(), from.getUTCMonth() + 1);
}

/** Day 29–31 lands on the last day of a month that has fewer. */
function monthlyDayOf(rule, year, month) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(rule.dayOfPeriod || 1, last)));
}

/* --------------------------------- report ---------------------------------- */

/**
 * Every recurring expense this person has, soonest charge first.
 *
 * `categoryId` narrows the list without changing what a subscription is: the
 * response always says which category each row is in, so a filtered view can
 * never quietly look like a smaller bill than the one the person has.
 * The reminder is not run here — the route calls `checkRenewals` beside this,
 * exactly the way alerts.js runs after a change.
 */
export async function subscriptionReport(user, options = {}) {
  const today = startOfDay(new Date());
  const [rules, history, vault] = await Promise.all([
    expenseRules(user._id),
    chargeHistory(user._id),
    vaultReport(user),
  ]);

  const verdicts = verdictsByRule(vault);
  const currency = user.ledgerCurrency || 'USD';
  let rows = rules.map((rule) => toRow(rule, { today, history, verdicts, currency }));

  const wanted = String(options.categoryId || '').trim();
  if (wanted) rows = rows.filter((row) => row.categoryId === wanted);

  return { rows: sortRows(rows), totals: totalsOf(rows) };
}

/**
 * Recurring entries that cost money.
 *
 * The rule's own type already says 'expense', and a rule and its category are
 * checked against each other when the entry is created — this repeats that
 * check, so a row that predates it cannot turn an allowance into a
 * subscription. A category that has since been removed still counts: the
 * payment is real, and the report says the category is unknown.
 */
async function expenseRules(userId) {
  const rules = await RecurringRule.find({ user: userId, type: 'expense' }).populate('category', 'name type icon');
  return rules.filter((rule) => !rule.category || rule.category.type === 'expense');
}

function toRow(rule, { today, history, verdicts, currency }) {
  const next = nextChargeOn(rule, today);
  const past = history ? history.get(rule._id.toString()) : null;

  return {
    ruleId: rule._id.toString(),
    description: rule.description || '',
    categoryId: rule.category ? rule.category._id.toString() : null,
    categoryName: rule.category ? rule.category.name : null,
    amount: round2(toNum(rule.amount) || 0),
    currency,
    frequency: rule.frequency,
    dayOfPeriod: rule.dayOfPeriod,
    nextChargeOn: next,
    daysUntil: next ? daysBetween(today, next) : null,
    reminderDays: rule.reminderDays ?? null,
    isActive: Boolean(rule.isActive),
    isPaused: isPausedOn(rule, today),
    pausedUntil: rule.pausedUntil || null,
    vaultVerdict: verdicts ? verdicts.get(rule._id.toString()) ?? null : null,
    lastChargeOn: past ? past.last : null,
    monthsCharged: past ? past.months : 0,
  };
}

/** Soonest first, and anything with no charge coming at the bottom. */
function sortRows(rows) {
  return [...rows].sort((a, b) => {
    if (!a.nextChargeOn && !b.nextChargeOn) return a.description.localeCompare(b.description);
    if (!a.nextChargeOn) return 1;
    if (!b.nextChargeOn) return -1;
    return a.nextChargeOn - b.nextChargeOn || a.description.localeCompare(b.description);
  });
}

/**
 * What a month of the list costs. Only live entries are counted: a cancelled
 * one is not going to charge again, and a paused one still will once the pause
 * is over, so its money is counted but its warning is not sent.
 */
function totalsOf(rows) {
  const monthly = rows.filter((row) => row.isActive).reduce((total, row) => total + monthlyOf(row), 0);
  return {
    monthly: round2(monthly),
    active: rows.filter((row) => row.isActive).length,
    paused: rows.filter((row) => row.isPaused).length,
    dueIn7: rows.filter((row) => dueWithin(row, 7)).length,
    dueIn30: rows.filter((row) => dueWithin(row, 30)).length,
  };
}

function dueWithin(row, days) {
  return row.daysUntil !== null && row.daysUntil <= days;
}

/** A weekly entry is a monthly cost too: 52 weeks over 12 months. */
function monthlyOf(row) {
  return row.frequency === 'weekly' ? round2(row.amount * WEEKS_PER_MONTH) : row.amount;
}

function verdictsByRule(vault) {
  const map = new Map();
  for (const row of vault.detected) {
    if (!row.ruleId || !VERDICTS_WITH_SOMETHING_TO_SAY.has(row.verdict)) continue;
    if (!map.has(row.ruleId)) map.set(row.ruleId, row.verdict);
  }
  return map;
}

/**
 * How long this person's rules have been running: the last charge the
 * generator made for each, and how many different months it has charged in.
 * Grouped inside MongoDB — the loop above never adds up money.
 */
async function chargeHistory(userId) {
  const rows = await Transaction.aggregate([
    { $match: { user: userId, type: 'expense', isDeleted: false, recurringRule: { $ne: null } } },
    {
      $group: {
        _id: '$recurringRule',
        last: { $max: '$date' },
        months: { $addToSet: { $dateToString: { format: '%Y-%m', date: '$date' } } },
      },
    },
  ]);

  const map = new Map();
  for (const row of rows) map.set(String(row._id), { last: row.last, months: row.months.length });
  return map;
}

/* -------------------------------- reminder --------------------------------- */

/**
 * One warning per rule per due date, for every rule that is live, not paused
 * and charging within the window. Called on every read of the screen and from
 * POST /api/subscriptions/check.
 *
 * The window is the caller's `withinDays`, except for a rule that carries its
 * own `reminderDays` — that is the person choosing their own warning distance,
 * and it wins.
 *
 * The rows are read here rather than handed in from the list on purpose: a
 * category filter is a way of looking at the screen, not a reason to stop
 * warning somebody about the entries that are not on it. The dates still come
 * from the one `nextChargeOn` the list uses, so the two cannot disagree.
 *
 * Running this twice inserts nothing the second time: the unique index on
 * (user, kind, rule, dueOn) rejects the duplicate and 11000 is swallowed, the
 * same way budget alerts handle a second crossing of the same threshold.
 */
export async function checkRenewals(user, options = {}) {
  const within = reminderWindow(options.withinDays, DEFAULT_REMINDER_DAYS);
  const today = startOfDay(new Date());

  const rules = await expenseRules(user._id);
  const currency = user.ledgerCurrency || 'USD';
  const rows = rules.map((rule) => toRow(rule, { today, history: null, verdicts: null, currency }));

  let created = 0;
  let due = 0;

  for (const row of rows) {
    if (!row.isActive || row.isPaused || row.daysUntil === null) continue;
    if (row.daysUntil > (row.reminderDays ?? within)) continue;

    due += 1;
    const note = await writeReminder(user, row);
    if (note) created += 1;
  }

  return { created, due, withinDays: within };
}

async function writeReminder(user, row) {
  try {
    return await Notification.create({
      user: user._id,
      kind: 'renewal_reminder',
      // A short English line for anything reading the raw field. The client
      // renders `messageKey` with `data`, so this sentence is a fallback and
      // never the one the reader sees.
      message: fallbackMessage(row),
      category: row.categoryId,
      rule: row.ruleId,
      dueOn: row.nextChargeOn,
      messageKey: 'sub.notify.daysLeft',
      data: { name: row.description, amount: row.amount, currency: row.currency, days: row.daysUntil },
    });
  } catch (err) {
    // 11000 = this rule already has a reminder for this exact due date. That
    // is the design working, not an error worth surfacing.
    if (err.code === 11000) return null;
    throw err;
  }
}

function fallbackMessage(row) {
  const name = row.description || row.categoryName || 'Subscription';
  const amount = `${formatMoney(row.amount)} ${row.currency}`;
  return `${name} renews in ${row.daysUntil} days — ${amount}.`.slice(0, 400);
}

/* --------------------------------- actions --------------------------------- */

/**
 * Hold this entry for a while: no charge until `pausedUntil`, and the
 * generator skips every occurrence before that date rather than catching up
 * afterwards. Any reminder about a charge that is no longer coming goes with
 * it. A second call simply moves the date again.
 */
export async function pauseRule(user, ruleId, body = {}) {
  const rule = await ownRule(user, ruleId);
  const days = pauseDaysOf(body.days);

  rule.pausedUntil = addDays(startOfDay(new Date()), days);
  await rule.save();
  await clearReminders(user, rule._id);

  return { id: rule._id.toString(), days, pausedUntil: rule.pausedUntil };
}

export async function resumeRule(user, ruleId) {
  const rule = await ownRule(user, ruleId);
  rule.pausedUntil = null;
  await rule.save();

  // The skipped charges stay skipped: the generator's cursor moved past them
  // while the pause held, so the next one is a normal future charge.
  return { id: rule._id.toString(), pausedUntil: null, nextChargeOn: nextChargeOn(rule) };
}

/**
 * Stop this entry. The vault owns the answer to "how does a subscription stop
 * here" and this calls it, so both screens end a payment the same way: the
 * entry stops, and the charges it already made stay in the ledger with their
 * history. Only the reminder cleanup is added.
 */
export async function cancelRule(user, ruleId) {
  const rule = await ownRule(user, ruleId);
  const result = await cancelSubscription(user, rule._id.toString());
  await clearReminders(user, rule._id);
  return result;
}

/** How far ahead this one entry should warn. null hands the choice back. */
export async function setReminderDays(user, ruleId, value) {
  const rule = await ownRule(user, ruleId);
  if (value === undefined) {
    throw badRequest('Send reminderDays as a whole number of days between 0 and 30, or null for the default.');
  }

  rule.reminderDays = reminderDaysOf(value);
  await rule.save();
  return { id: rule._id.toString(), reminderDays: rule.reminderDays };
}

/**
 * A reminder about a charge that is not going to happen is noise, so the whole
 * row goes — read or not. Only dates from today onwards are touched: a notice
 * about a charge that already went out is history and stays where it is.
 */
async function clearReminders(user, ruleId) {
  await Notification.deleteMany({
    user: user._id,
    rule: ruleId,
    kind: 'renewal_reminder',
    dueOn: { $gte: startOfDay(new Date()) },
  });
}

/* --------------------------------- helpers --------------------------------- */

/**
 * A rule that is not this person's is a 404, never a 403 — the app does not
 * confirm that somebody else's id exists. An id that is not even an id is the
 * same answer.
 */
async function ownRule(user, ruleId) {
  const id = String(ruleId || '').trim();
  if (!mongoose.isValidObjectId(id)) throw notFound();
  const rule = await RecurringRule.findOne({ _id: id, user: user._id });
  if (!rule) throw notFound();
  return rule;
}

function pauseDaysOf(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PAUSE_DAYS;
  const days = wholeDays(value);
  if (days === null || days < 1) {
    throw badRequest('Pause must be a whole number of days, at least 1.');
  }
  return Math.min(days, MAX_PAUSE_DAYS);
}

function reminderDaysOf(value) {
  if (value === null || value === '') return null;
  const days = wholeDays(value);
  if (days === null || days < 0 || days > 30) {
    throw badRequest('Reminder must be a whole number of days between 0 and 30, or null for the default.');
  }
  return days;
}

/**
 * A whole number of days, or null when the body is not one. A form sends
 * strings, so those are read — but a boolean is not a number of days however
 * willing Number() is to oblige, and `true` quietly meaning "1 day" is the
 * kind of thing nobody would ever have chosen.
 */
function wholeDays(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

/**
 * A query parameter is tuning, not intent, so a value that is not a number
 * falls back to the default instead of failing a page load. A body is intent,
 * and a body that is wrong is refused with a sentence saying what is wrong.
 */
function reminderWindow(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const days = Number(value);
  if (!Number.isFinite(days)) return fallback;
  return Math.min(30, Math.max(0, Math.round(days)));
}

function startOfDay(value) {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(String(value));
  if (day) return new Date(`${day[0].slice(0, 10)}T00:00:00.000Z`);
  const d = new Date(value);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysBetween(from, to) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound() {
  const err = new Error('That subscription was not found.');
  err.status = 404;
  return err;
}
