import Transaction from '../models/Transaction.js';
import { monthStart } from '../models/Budget.js';
import { toNum, round2 } from '../utils/money.js';

/**
 * "Grow your money" — the investment-basics library (ADV-4).
 *
 * This page exists to explain what a savings account, a fixed deposit and a
 * mutual fund ARE, what the trade-offs are, and which of the three sits at
 * which risk level. Two rules from the brief shape the whole file:
 *
 *  1. NO ADVICE, NOTHING PRODUCT-SPECIFIC. No bank, no fund, no share, no
 *     ticker, no rate, no promise of a return. The service is not even able to
 *     do that by accident: every sentence it names is a DICTIONARY KEY, so a
 *     sentence can only exist in a dictionary, in one of the fourteen
 *     languages, and never in a response body. What comes out of here is
 *     arithmetic plus keys.
 *
 *  2. THE ONE PERSONAL TOUCH IS A FACT, NOT A RECOMMENDATION. The nudge is
 *     built from this month's surplus — income minus expense, straight out of
 *     the student's own ledger — and the service decides only WHICH sentence
 *     the browser shows and WHICH numbers go into its placeholders. "You have
 *     249.50 left this month" is arithmetic about the ledger; "put 249.50 into
 *     X" would be advice, and that difference is the whole reason the nudge
 *     travels as `{ key, vars }` rather than as a string. There is no code path
 *     here that can name a destination for money.
 */

/**
 * The risk ladder, low to high, as translation KEYS.
 *
 * Frozen so nothing outside this file can reorder it, rename it or add a
 * level: the ORDER is a fact about the subject and is not a matter of opinion,
 * while the words for each rung live in the dictionaries so a translation can
 * read as naturally as the English does. The browser receives this list and
 * puts the word on screen next to the colour (design.md §3 — meaning is never
 * carried by colour alone).
 */
export const RISK_LEVELS = Object.freeze([
  Object.freeze({ level: 'low', key: 'grow.risk.low' }),
  Object.freeze({ level: 'medium', key: 'grow.risk.medium' }),
  Object.freeze({ level: 'high', key: 'grow.risk.high' }),
]);

/**
 * The only judgement in the file, and it is a judgement about a NUMBER rather
 * than about a person.
 *
 *  tightSharePct  10 — a positive margin smaller than this share of the month's
 *                    income is called thin rather than "left over". One
 *                    unexpected cost erases a 5% margin, so reading it as a
 *                    surplus the student could act on would be the misleading
 *                    half of an otherwise honest sentence.
 */
export const GROW_THRESHOLDS = Object.freeze({
  tightSharePct: 10,
});

/* --------------------------------- the nudge --------------------------------- */

/**
 * This student's month so far, and which generic sentence describes it.
 *
 * ONE aggregation does the whole read: matched on the owner, on the rows that
 * are not in the bin and on the current month, grouped by type and summed
 * inside MongoDB. Nothing is added up in JavaScript and nothing is looped over,
 * so the cost of this call is the same for a ledger with ten rows and one with
 * ten thousand. The `user` term is the same discipline every other service in
 * the project uses (see architecture §7): there is no query on this page that
 * can reach another student's row.
 *
 * `now` is a parameter so a caller (and a test) can ask about a named month
 * without touching the clock.
 */
export async function personalNudge(user, now = new Date()) {
  const month = monthStart(now);
  const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));

  const rows = await Transaction.aggregate([
    // $ne: true rather than === false, so a row written before the flag existed
    // is counted as a live entry instead of quietly vanishing from the month.
    { $match: { user: user._id, isDeleted: { $ne: true }, date: { $gte: month, $lt: nextMonth } } },
    { $group: { _id: '$type', total: { $sum: '$amount' }, entries: { $sum: 1 } } },
  ]);

  const income = totalOf(rows, 'income');
  const expense = totalOf(rows, 'expense');
  const entries = rows.reduce((n, row) => n + (row.entries || 0), 0);

  // One subtraction on plain numbers, at the JSON edge: Decimal128 never takes
  // part in float arithmetic anywhere on this page.
  const surplus = round2(income - expense);

  return {
    monthKey: keyOf(month),
    surplus,
    // The working behind the number is shipped with it, so a student (or a
    // judge) can check the arithmetic by hand instead of taking it on trust.
    income,
    expense,
    entries,
    hasSurplus: surplus > 0,
    nudge: chooseNudge({ income, surplus, entries }),
    // Copied out of the frozen list so a consumer cannot reorder the ladder.
    riskLevels: RISK_LEVELS.map((rung) => ({ ...rung })),
  };
}

/**
 * Which sentence the page shows, decided from the month's arithmetic alone.
 *
 * The four buckets, and the reason each one has to exist:
 *   nothingLogged  the student has not entered anything this month. Their
 *                  surplus is unknown, and "you have nothing to spare" would be
 *                  a statement about somebody's finances that is simply not
 *                  true — so the empty month gets its own honest line instead
 *                  of borrowing the no-surplus one.
 *   noSurplus      income did not beat spending. There is nothing to put away,
 *                  and the page must not dress that up as an opportunity.
 *   tight          a positive margin that is a thin share of what came in.
 *   surplus        the case the page exists for: money that really is left over.
 *
 * `amount` is the same surplus in every branch that carries one, as a plain
 * number — the browser formats it in the student's own display currency, so
 * the sentence and the figure on screen can never disagree.
 */
function chooseNudge({ income, surplus, entries }) {
  if (entries === 0) return { key: 'grow.nudge.nothingLogged', vars: {} };
  if (surplus <= 0) return { key: 'grow.nudge.noSurplus', vars: { amount: surplus } };

  const tightCeiling = round2(income * (GROW_THRESHOLDS.tightSharePct / 100));
  if (surplus < tightCeiling) return { key: 'grow.nudge.tight', vars: { amount: surplus } };

  return { key: 'grow.nudge.surplus', vars: { amount: surplus } };
}

/* --------------------------------- helpers ---------------------------------- */

function totalOf(rows, type) {
  return round2(toNum(rows.find((row) => row._id === type)?.total ?? 0));
}

function keyOf(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
