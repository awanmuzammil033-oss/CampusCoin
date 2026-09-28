import Transaction from '../models/Transaction.js';
import { parseMonth, monthKey } from './reports.js';
import { monthWindow } from '../utils/dates.js';
import { toNum } from '../utils/money.js';

/**
 * The spending calendar: one month, shaded by day.
 *
 * WHAT THIS ANSWERS
 *
 * "Which days did the money go out on?" — the one question the daily line chart
 * beside it cannot answer, because a line over thirty points shows a shape and
 * not the days. A calendar shows the days; the shading says how heavy each one
 * was, and the amount is printed in the cell so the shading is a summary of a
 * number rather than a replacement for it.
 *
 * THE GRID IS A FIXED SHAPE
 *
 * Seven columns, one row per week, Monday first (the same Monday-first weeks
 * `dailyWeeklyReport` already labels, so the two views of one month line up).
 * Days outside the month are drawn as empty cells rather than left out, because
 * a grid whose cells move when you page from one month to the next is a grid
 * nobody can learn to read.
 *
 * QUANTILE BUCKETS, NOT EQUAL RANGES
 *
 * Equal ranges need a maximum first, and the maximum is the one value a month
 * gets wrong: four days of 20 and one of 900 makes 20 sit in the bottom band
 * and 900 sit above the top of the scale. A heatmap that does that is not
 * showing a rare day, it is showing a broken scale. So the breakpoints are
 * QUARTILES of the days that actually spent something, computed by index on the
 * sorted spends - which means the cheapest day is always in the lowest band and
 * the dearest day is always in the highest band, whatever the month looks like.
 *
 * The breakpoints come back in the response rather than being kept here, because
 * a legend that says "darker is more" without saying where the edges are is a
 * picture, not a scale. The client is told the numbers and writes the words.
 *
 * TWO CASES WITH NO SPREAD TO DIVIDE
 *
 *  - Nothing spent at all. There is no scale, and inventing one (0 to 0, or 0 to
 *    the smallest value) would draw four bands over one identical fact. The
 *    response says `defined: false`, and the grid is still a full grid so the
 *    shape never changes between months.
 *  - Everything spent the same amount, or only one day spent anything. There is
 *    no ordering to show. Every day that spent is placed in the TOP band: they
 *    are tied for the dearest day of the month, and a lighter tint would be
 *    claiming they were cheap.
 *
 * THE MONEY RULES
 *
 * Expenses only - income is not spending, and a cell showing income would be a
 * chart lying about the question it was asked. Deleted rows are excluded, as
 * every other report in the app excludes them. Both sums happen inside MongoDB
 * as Decimal128, including the average over the days that spent, so no month of
 * cents ever passes through a float; `toNum` runs once, at the edge, and rounds
 * to two decimals there and nowhere else.
 */

/**
 * The month, the grid, the scale and the totals - in that order, because that is
 * the order a reader needs them in: what month, on which days, how dark, and how
 * much in all.
 */
export async function spendingHeatmap(user, { month } = {}) {
  const start = parseMonth(month);
  const key = monthKey(start);
  // The month boundary comes from the shared helper rather than being built a
  // fifth time here: this is the same window budgets and wallets narrow to, and
  // a heatmap that disagreed with the budget beside it would be worse than none.
  const window = monthWindow(start);

  // One $match for both pipelines, and it is the same shape reports.js uses:
  // this user's rows only, not deleted, expenses only, inside the month.
  const match = { user: user._id, isDeleted: false, type: 'expense', date: window };

  // The per-day rows (with their entry counts) and the month figures, asked for
  // together. The average is a $avg over the day totals INSIDE the database - a
  // month total divided by a day count in JavaScript is a float sum, and this
  // module does not do float sums.
  const [byDay, monthTotals] = await Promise.all([
    Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]),
    Transaction.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, total: { $sum: '$amount' } } },
      {
        $group: {
          _id: null,
          monthSpend: { $sum: '$total' },
          daysWithSpend: { $sum: 1 },
          averageOfDaysWithSpend: { $avg: '$total' },
        },
      },
    ]),
  ]);

  const spending = new Map(
    byDay
      .filter((row) => toNum(row.total) > 0) // a day with no spending is not a band
      .map((row) => [row._id, { spend: toNum(row.total), count: row.count }])
  );

  // The quartile edges, over the days that spent and nothing else. Zeroes are
  // excluded BEFORE the quantiles, not after: three-quarters of a month spent
  // nothing is a fact about spending days, and including twenty-eight zeroes
  // would push every real amount into the top band.
  const spends = [...spending.values()].map((day) => day.spend).sort((a, b) => a - b);
  const min = spends.length ? spends[0] : 0;
  const max = spends.length ? spends[spends.length - 1] : 0;
  // A scale needs a spread. Zero spending days, or one amount repeated, is not a
  // four-band scale however many days happened to carry it.
  const defined = spends.length > 1 && max > min;
  const breakpoints = defined ? quartiles(spends) : [];

  const grid = buildGrid(start, key, spending, breakpoints, defined);

  const busiest = busiestDay(spending);
  const totals = monthTotals[0];

  return {
    month: key,
    // The scale is denominated in the currency the amounts are STORED in, not in
    // whatever the reader's screen happens to be showing. Saying which one it is
    // is part of the answer: a legend in the wrong currency is a wrong legend.
    currency: user.ledgerCurrency || user.currency || 'USD',
    grid,
    scale: { min, max, breakpoints, defined, unit: 'ledger' },
    totals: {
      monthSpend: totals ? toNum(totals.monthSpend) : 0,
      daysWithSpend: totals ? totals.daysWithSpend : 0,
      busiest,
      // null rather than 0 for a month with nothing in it: "0.00 per spending
      // day" over zero days is a division that was never done, and the client
      // would have to guess what to do with the answer.
      averageOfDaysWithSpend: totals && totals.daysWithSpend > 0 ? toNum(totals.averageOfDaysWithSpend) : null,
    },
  };
}

/**
 * Whose month this is.
 *
 * The endpoint answers for the person asking, and the optional `user` exists so
 * a link can name the account it is about. A name that is not the reader's is a
 * 404 rather than a 403 - this app does not confirm that an id belongs to
 * somebody else - and a malformed id is the same 404, because distinguishing
 * "broken" from "not yours" would confirm exactly that.
 */
export function ownMonth(user, askedFor) {
  if (askedFor === undefined || askedFor === null || askedFor === '') return user;
  if (String(askedFor).trim() === user._id.toString()) return user;
  throw notFound();
}

/* --------------------------------- helpers ---------------------------------- */

/**
 * The three quartile edges of the days that spent, by index on the sorted list.
 *
 * `floor(p * (n - 1))` puts every edge on an amount that really happened, which
 * matters twice over: the legend can print "up to 240" and mean a day somebody
 * actually had, and the top edge is always below the maximum, so the dearest day
 * of the month is always in the top band. No division by a spread, so a month
 * with one spending day cannot divide by nothing - it never gets here, and
 * `defined` says so.
 */
function quartiles(sorted) {
  const last = sorted.length - 1;
  return [0.25, 0.5, 0.75].map((p) => sorted[Math.floor(p * last)]);
}

/**
 * The calendar itself: 7 columns, one row per week, Monday first.
 *
 * `weekday` is the column (0 = Monday), given on every cell including the ones
 * outside the month, so the header row lines up whatever a reader's own week
 * starts on. An out-of-month cell has no date - it is not a day of this month,
 * and giving it one would be a date the reader could ask a question about and
 * get an answer for a different month.
 */
function buildGrid(start, key, spending, breakpoints, defined) {
  const year = start.getUTCFullYear();
  const monthIndex = start.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
  const weeks = Math.ceil((firstWeekday + daysInMonth) / 7);

  const days = [];
  for (let slot = 0; slot < weeks * 7; slot += 1) {
    const dayNumber = slot - firstWeekday + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      days.push({ date: null, weekday: slot % 7, inMonth: false, spend: 0, bucket: 0, count: 0 });
      continue;
    }
    const date = `${key}-${String(dayNumber).padStart(2, '0')}`;
    const found = spending.get(date);
    days.push({
      date,
      weekday: slot % 7,
      inMonth: true,
      spend: found ? found.spend : 0,
      // A day that spent nothing is bucket 0, never bucket 1: "nothing here" and
      // "the cheapest day of the month" are different facts and the grid has to
      // be able to say both.
      bucket: found ? bucketFor(found.spend, breakpoints, defined) : 0,
      count: found ? found.count : 0,
    });
  }

  return { days, weeks };
}

/** Which of the four bands an amount falls in. 0 is the empty treatment. */
function bucketFor(spend, breakpoints, defined) {
  // No scale to rank against: these days are tied for the month's maximum, so
  // they wear the top band rather than a light one that would call them cheap.
  if (!defined) return 4;
  // Strictly greater, so a day sitting exactly on an edge stays in the band
  // below it and the bands never disagree with the printed edges.
  return Math.min(4, 1 + breakpoints.filter((edge) => spend > edge).length);
}

/**
 * The dearest day, and how much it was.
 *
 * Sorting at most thirty-one already-grouped rows is shaping an answer, not
 * crunching history - the transactions never reach JavaScript. Ties break
 * towards the earlier date so the same month always answers the same way.
 */
function busiestDay(spending) {
  let best = null;
  for (const [date, day] of spending) {
    if (!best || day.spend > best.spend || (day.spend === best.spend && date < best.date)) {
      best = { date, spend: day.spend };
    }
  }
  return best ? { date: best.date, amount: best.spend } : null;
}

function notFound() {
  const err = new Error('That month is not available.');
  err.status = 404;
  return err;
}
