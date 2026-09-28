/**
 * Two things the new module needed and the codebase did not have in one place.
 *
 * 1. `startOfDay` was written privately in four services - ledger, groups,
 *    recurring and vault - each a correct copy of the same rule: a calendar date
 *    is stored at UTC midnight, because the database groups months with UTC
 *    `$dateToString` and the UI slices the ISO string, so local midnight would put
 *    1 September into 31 August east of Greenwich. Copying a fifth copy is how
 *    the five drift apart, so it lives here and the new module imports it.
 *
 * 2. `monthStart` is the app's own calendar-month helper; the wallet balances
 *    narrow a month with it rather than building a month boundary of their own.
 *
 * Nothing is changed in the four services that already have a private copy: they
 * are not wrong, and touching four call paths to remove a duplicate is a bigger
 * risk than the duplicate. This is the home for the next one.
 */
import { monthStart } from '../models/Budget.js';

/** UTC midnight of the calendar day named by a date, a Date, or "2026-09-01". */
export function startOfDay(value) {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(String(value));
  if (day) return new Date(`${day[0].slice(0, 10)}T00:00:00.000Z`);
  const d = new Date(value);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** The first instant of the next calendar month, in UTC. */
export function startOfNextMonth(value) {
  const d = startOfDay(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/** The window a "this month" query needs: from the 1st, up to but not including the next. */
export function monthWindow(value) {
  const from = monthStart(startOfDay(value));
  return { $gte: from, $lt: startOfNextMonth(from) };
}

export { monthStart };
