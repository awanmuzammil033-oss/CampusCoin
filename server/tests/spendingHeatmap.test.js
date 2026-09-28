import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, makeDefaultCategory } from './helpers.js';
import { toDec } from '../src/utils/money.js';
import Transaction from '../src/models/Transaction.js';

/**
 * The spending calendar (NEW-5): one month as seven columns, shaded by quantile.
 *
 * The harness is the one from vault.test.js - an in-memory database, real
 * sign-ups, real sessions - and the router is mounted by this file exactly where
 * app.js mounts the others: in front of the /api 404 layer, behind the session
 * and CSRF middleware. The suite therefore stands on its own without the shell
 * having to hear of it.
 *
 * The fixtures are written straight to the model so every entry lands on an
 * exact day of an exact month: the grid's shape, the February case and the
 * quantiles all turn on which day a row is on, and a row on "about the 5th"
 * would make every one of those assertions a coin toss.
 */

let ctx;
let food;
let rent;

test.before(async () => {
  ctx = await startApp();
  food = await makeDefaultCategory({ name: 'Food', type: 'expense', icon: 'burger' });
  rent = await makeDefaultCategory({ name: 'Rent', type: 'expense', icon: 'home' });
  await mountHeatmap();
});

test.after(async () => {
  await ctx.stop();
});

async function mountHeatmap() {
  const { default: heatmapRouter } = await import('../src/routes/spendingHeatmap.js');
  const stack = (ctx.app._router || ctx.app.router).stack;

  ctx.app.use('/api/heatmap', heatmapRouter);
  const layer = stack.pop();
  const before = stack.findIndex((l) => l.handle && l.handle.name === 'notFound');
  stack.splice(before === -1 ? stack.length : before, 0, layer);
}

/* -------------------------------- fixtures --------------------------------- */

async function student(name = 'Aisha') {
  const agent = ctx.newAgent();
  const account = await registerStudent(agent, { name });
  return { agent, user: account.user };
}

/** One row, on an exact day. `date` is "YYYY-MM-DD" and is stored at UTC midnight. */
function add(userId, { date, amount, type = 'expense', category = null, isDeleted = false, description = '' }) {
  return Transaction.create({
    user: userId,
    category: (category || food)._id,
    amount: toDec(amount),
    type,
    date: new Date(`${date}T00:00:00.000Z`),
    isDeleted,
    description,
  });
}

/** The month, plus whatever else the caller wants to ask for. */
async function heatmap(session, month, extra = {}) {
  const search = new URLSearchParams({ ...(month ? { month } : {}), ...extra });
  return session.agent.get(`/api/heatmap?${search.toString()}`);
}

const day = (grid, date) => grid.days.find((d) => d.date === date);
const inMonth = (grid) => grid.days.filter((d) => d.inMonth);

/* --------------------------------- the tests -------------------------------- */

test('a month with spending reads as a fixed 7-column grid, sharded by quartile', async () => {
  const s = await student();
  // Ten spending days with a clear spread, so the quartiles have something to cut.
  const spends = { 2: 10, 4: 20, 6: 30, 8: 40, 10: 50, 12: 60, 14: 70, 16: 80, 18: 90, 20: 100 };
  for (const [d, amount] of Object.entries(spends)) {
    await add(s.user.id, { date: `2026-09-${String(d).padStart(2, '0')}`, amount });
  }

  const res = await heatmap(s, '2026-09');
  assert.equal(res.status, 200, res.text);

  const { month, currency, grid, scale, totals } = res.body;
  assert.equal(month, '2026-09');
  assert.equal(currency, 'USD', 'the scale says which currency it is in');
  assert.equal(scale.unit, 'ledger', 'and it is the ledger currency, not a converted one');

  // The shape: 7 columns, whole weeks, and the cells that pad the first and last
  // row are present rather than omitted.
  assert.equal(grid.weeks, 5, '30 days beginning on a Tuesday need five rows');
  assert.equal(grid.days.length, grid.weeks * 7);
  assert.equal(inMonth(grid).length, 30);
  assert.equal(grid.days.filter((d) => !d.inMonth).length, 5);
  assert.equal(grid.days[0].weekday, 0, 'Monday is column 0');
  assert.equal(grid.days[0].date, null, 'a cell outside the month has no date to be wrong about');
  // 1 September 2026 is a Tuesday, so exactly one cell pads the first row.
  assert.equal(grid.days[0].inMonth, false);
  assert.equal(grid.days[1].date, '2026-09-01');
  assert.equal(grid.days[1].weekday, 1);

  // Every spending day is on its own date with its own figure and count.
  const tenth = day(grid, '2026-09-10');
  assert.equal(tenth.spend, 50);
  assert.equal(tenth.count, 1);
  assert.equal(tenth.inMonth, true);

  // The scale: three edges, all of them amounts that really happened. A legend
  // that prints "up to 30" has to mean a day somebody actually had, so an edge
  // between two days would be a number no day carries.
  const amounts = Object.values(spends);
  assert.equal(scale.defined, true);
  assert.equal(scale.breakpoints.length, 3);
  assert.ok(scale.breakpoints.every((edge) => amounts.includes(edge)));
  assert.deepEqual([...scale.breakpoints].sort((a, b) => a - b), scale.breakpoints, 'and in order');
  assert.equal(scale.min, 10);
  assert.equal(scale.max, 100);

  // The whole reason for quantiles: the cheapest day is in the lowest band and
  // the dearest day is in the highest band, whatever the month looks like.
  assert.equal(day(grid, '2026-09-02').bucket, 1);
  assert.equal(day(grid, '2026-09-20').bucket, 4);

  // A day with no spending is bucket 0, never bucket 1: "nothing here" and "the
  // cheapest day of the month" are different facts.
  assert.equal(day(grid, '2026-09-03').spend, 0);
  assert.equal(day(grid, '2026-09-03').bucket, 0);
  assert.equal(day(grid, '2026-09-03').count, 0);

  // Totals, from the database rather than from the cells.
  assert.equal(totals.monthSpend, 550);
  assert.equal(totals.daysWithSpend, 10);
  assert.deepEqual(totals.busiest, { date: '2026-09-20', amount: 100 });
  assert.equal(totals.averageOfDaysWithSpend, 55);
});

test('a month where nothing was spent does not crash and invents no scale', async () => {
  const s = await student();
  // Income only. A spending heatmap that showed income would be answering a
  // different question than the one it was asked, so this month must read empty.
  await add(s.user.id, { date: '2026-03-10', amount: 500, type: 'income' });

  const res = await heatmap(s, '2026-03');
  assert.equal(res.status, 200, res.text);

  const { grid, scale, totals } = res.body;
  assert.equal(scale.defined, false, 'no spending means no scale, not a scale of 0 to 0');
  assert.deepEqual(scale.breakpoints, []);
  assert.equal(scale.min, 0);
  assert.equal(scale.max, 0);

  // The grid is still a full grid, so the shape does not change between months.
  // March 2026 is the awkward one: 31 days beginning on a Sunday needs six rows.
  assert.equal(grid.weeks, 6);
  assert.equal(grid.days.length, 42);
  assert.equal(inMonth(grid).length, 31);
  assert.equal(grid.days.filter((d) => !d.inMonth).length, 11);
  assert.ok(grid.days.every((d) => d.spend === 0 && d.bucket === 0));

  assert.equal(totals.monthSpend, 0);
  assert.equal(totals.daysWithSpend, 0);
  assert.equal(totals.busiest, null);
  assert.equal(totals.averageOfDaysWithSpend, null, 'no division that was never done');
});

test('a month with a single spending day has no spread, and says so', async () => {
  const s = await student();
  await add(s.user.id, { date: '2026-05-17', amount: 42.5 });

  const res = await heatmap(s, '2026-05');
  assert.equal(res.status, 200, res.text);

  const { grid, scale, totals } = res.body;
  // One value and four quantiles is the case that divides by nothing.
  assert.equal(scale.defined, false);
  assert.deepEqual(scale.breakpoints, []);
  assert.equal(scale.min, 42.5);
  assert.equal(scale.max, 42.5);

  // It is tied for the dearest day of the month, so it wears the top band rather
  // than a light one that would call a 42.50 day the cheapest thing here.
  assert.equal(day(grid, '2026-05-17').spend, 42.5);
  assert.equal(day(grid, '2026-05-17').bucket, 4);
  assert.equal(day(grid, '2026-05-16').bucket, 0);

  assert.equal(totals.daysWithSpend, 1);
  assert.equal(totals.monthSpend, 42.5);
  assert.equal(totals.averageOfDaysWithSpend, 42.5, 'the average of one day is that day');
});

test('one huge day out of four quiet ones is the top band, and the quiet days share the bottom', async () => {
  const s = await student();
  for (const d of ['04', '05', '06', '07']) {
    await add(s.user.id, { date: `2026-06-${d}`, amount: 20 });
  }
  await add(s.user.id, { date: '2026-06-08', amount: 900 });

  const res = await heatmap(s, '2026-06');
  assert.equal(res.status, 200, res.text);

  const { grid, scale, totals } = res.body;
  assert.equal(scale.defined, true);
  // Equal ranges would have needed a maximum first, and the maximum is the one
  // value a month gets wrong: with 0-250-500-750-1000 the 20s all sat in the
  // bottom band and the 900 fell off the top of the scale entirely.
  assert.deepEqual(scale.breakpoints, [20, 20, 20], 'the quartiles of these five days are all 20');

  for (const d of ['04', '05', '06', '07']) {
    assert.equal(day(grid, `2026-06-${d}`).bucket, 1, `the 20 on the ${d}th is the cheapest day here`);
  }
  assert.equal(day(grid, '2026-06-08').bucket, 4, 'and the 900 is the dearest day, not off the scale');

  assert.equal(totals.monthSpend, 980);
  assert.equal(totals.daysWithSpend, 5);
  assert.deepEqual(totals.busiest, { date: '2026-06-08', amount: 900 });
  assert.equal(totals.averageOfDaysWithSpend, 196);
});

test('days that all cost the same have no scale to rank, so none of them is called cheap', async () => {
  const s = await student();
  for (const d of ['02', '03', '04', '05']) {
    await add(s.user.id, { date: `2026-07-${d}`, amount: 15 });
  }

  const res = await heatmap(s, '2026-07');
  assert.equal(res.status, 200, res.text);

  const { grid, scale } = res.body;
  assert.equal(scale.defined, false, 'four days at the same price are not a four-band scale');
  assert.deepEqual(scale.breakpoints, []);
  assert.equal(scale.min, 15);
  assert.equal(scale.max, 15);
  // All tied for the maximum, so all in the top band: a lighter tint on any of
  // them would be a claim the month cannot support.
  for (const d of ['02', '03', '04', '05']) {
    assert.equal(day(grid, `2026-07-${d}`).bucket, 4);
  }
  assert.equal(day(grid, '2026-07-06').bucket, 0);
});

test('February in a non-leap year is 28 days in exactly 4 weeks', async () => {
  const s = await student();
  // 2027-02-01 is a Monday, so the month needs no padding at all.
  await add(s.user.id, { date: '2027-02-01', amount: 30 });
  await add(s.user.id, { date: '2027-02-28', amount: 70 });

  const res = await heatmap(s, '2027-02');
  assert.equal(res.status, 200, res.text);

  const { grid, scale, totals } = res.body;
  assert.equal(grid.weeks, 4, '28 days that start on a Monday are four whole weeks');
  assert.equal(grid.days.length, 28);
  assert.equal(inMonth(grid).length, 28);
  assert.equal(grid.days.filter((d) => !d.inMonth).length, 0, 'and no padding cells at all');
  assert.equal(grid.days[0].date, '2027-02-01');
  assert.equal(grid.days[27].date, '2027-02-28');

  assert.equal(scale.defined, true);
  assert.equal(day(grid, '2027-02-01').bucket, 1);
  assert.equal(day(grid, '2027-02-28').bucket, 4);
  assert.equal(totals.monthSpend, 100);
  assert.equal(totals.daysWithSpend, 2);
  assert.equal(totals.averageOfDaysWithSpend, 50);
});

test('a 30-day month and a 31-day month each come back whole', async () => {
  const s = await student();
  await add(s.user.id, { date: '2026-04-30', amount: 11 }); // April, 30 days
  await add(s.user.id, { date: '2026-01-31', amount: 13 }); // January, 31 days

  const april = await heatmap(s, '2026-04');
  assert.equal(april.status, 200, april.text);
  assert.equal(april.body.grid.weeks, 5);
  assert.equal(inMonth(april.body.grid).length, 30);
  assert.equal(april.body.grid.days.length, 35);
  assert.equal(day(april.body.grid, '2026-04-30').spend, 11, 'the last day of a 30-day month is in the grid');
  assert.equal(april.body.totals.daysWithSpend, 1);

  const january = await heatmap(s, '2026-01');
  assert.equal(january.status, 200, january.text);
  assert.equal(january.body.grid.weeks, 5);
  assert.equal(inMonth(january.body.grid).length, 31);
  assert.equal(january.body.grid.days.length, 35);
  assert.equal(day(january.body.grid, '2026-01-31').spend, 13, 'the last day of a 31-day month is in the grid');
});

test('income never appears in a spending heatmap, and a deleted entry does not either', async () => {
  const s = await student();
  // A big income on a day that also has a small expense. If income counted, the
  // day would be the dearest of the month and the answer would be a lie.
  await add(s.user.id, { date: '2026-08-05', amount: 5000, type: 'income' });
  await add(s.user.id, { date: '2026-08-05', amount: 25, type: 'expense' });
  // The largest expense of the month, in the bin. Every other report excludes
  // deleted rows and so does this one.
  await add(s.user.id, { date: '2026-08-09', amount: 999, isDeleted: true });
  await add(s.user.id, { date: '2026-08-11', amount: 60, category: rent });

  const res = await heatmap(s, '2026-08');
  assert.equal(res.status, 200, res.text);

  const { grid, scale, totals } = res.body;
  assert.equal(day(grid, '2026-08-05').spend, 25, 'the income on this day is not spending');
  assert.equal(day(grid, '2026-08-09').spend, 0, 'a deleted entry is not spending either');
  assert.equal(day(grid, '2026-08-09').bucket, 0);
  assert.equal(day(grid, '2026-08-09').count, 0);
  assert.equal(day(grid, '2026-08-11').spend, 60);

  assert.equal(totals.monthSpend, 85, 'the month total is the two live expenses and nothing else');
  assert.equal(totals.daysWithSpend, 2);
  assert.deepEqual(totals.busiest, { date: '2026-08-11', amount: 60 });

  // And the scale is built from the two live days, not from the 999 that is not
  // there any more: a 999 in the breakpoints would push both real days into the
  // bottom band and make an ordinary month look flat.
  assert.deepEqual(scale.breakpoints, [25, 25, 25]);
  assert.equal(day(grid, '2026-08-05').bucket, 1);
  assert.equal(day(grid, '2026-08-11').bucket, 4);
});

test("one student's month is nobody else's, and asking for a stranger's is a 404", async () => {
  const aisha = await student('Aisha');
  const bilal = await student('Bilal');
  await add(aisha.user.id, { date: '2026-02-14', amount: 77 });
  await add(bilal.user.id, { date: '2026-02-15', amount: 33 });

  // Each sees their own month and nobody else's.
  const hers = await heatmap(aisha, '2026-02');
  assert.equal(hers.body.totals.monthSpend, 77);
  assert.equal(day(hers.body.grid, '2026-02-15').spend, 0);

  const his = await heatmap(bilal, '2026-02');
  assert.equal(his.body.totals.monthSpend, 33);
  assert.equal(day(his.body.grid, '2026-02-14').spend, 0);

  // Naming somebody else is a 404, never a 403 that would confirm the id is real.
  const foreign = await heatmap(bilal, '2026-02', { user: aisha.user.id });
  assert.equal(foreign.status, 404, 'their month does not exist as far as this reader is concerned');

  // A malformed id is the same 404: "broken" and "not yours" must not be
  // tellable apart, or the answer confirms that an id belongs to somebody.
  for (const id of ['not-an-id', '000000000000000000000000', aisha.user.id.toUpperCase()]) {
    const res = await heatmap(bilal, '2026-02', { user: id });
    assert.equal(res.status, 404, `expected a 404 for ${id}, got ${res.status}`);
  }

  // Naming yourself is not a stranger.
  const mine = await heatmap(bilal, '2026-02', { user: bilal.user.id });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.totals.monthSpend, 33);
});

test('a malformed month is the reports service\'s own 400, and a missing one is this month', async () => {
  const s = await student();
  for (const month of ['2026-13', 'September', '2026-00', 'soon']) {
    const res = await heatmap(s, month);
    assert.equal(res.status, 400, `expected a 400 for ${month}, got ${res.status} ${res.text}`);
    assert.match(res.body.error, /YYYY-MM/);
  }

  // No month asked for is the current month, and the grid is the current month's.
  const now = new Date();
  const key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const current = await heatmap(s, '');
  assert.equal(current.status, 200, current.text);
  assert.equal(current.body.month, key);
  // The grid is a whole calendar of the month it named, not of the one asked for.
  const [year, month] = key.split('-').map(Number);
  assert.equal(inMonth(current.body.grid).length, new Date(Date.UTC(year, month, 0)).getUTCDate());
});

test('the grid never changes shape as a student pages through months', async () => {
  const s = await student();
  // Four months with four different paddings: Feb and Mar 2026 both begin on a
  // Sunday, April on a Wednesday and May on a Friday. The column count never
  // moves; the number of padding cells is what varies.
  const shapes = [];
  for (const month of ['2026-02', '2026-03', '2026-04', '2026-05']) {
    const res = await heatmap(s, month);
    assert.equal(res.status, 200, res.text);
    const { grid } = res.body;
    shapes.push({ month, weeks: grid.weeks, cells: grid.days.length, inMonth: inMonth(grid).length });
    assert.equal(grid.days.length, grid.weeks * 7, 'every row is seven cells');
    // The column a date lands on is the date's own weekday, padding or not.
    grid.days.filter((d) => d.inMonth).forEach((d) => {
      const weekday = (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7;
      assert.equal(d.weekday, weekday, `${d.date} is column ${weekday}`);
    });
  }

  // Only the month that needs six rows has one: 31 days from a Sunday cannot fit
  // into five. The other three are all five rows of seven.
  assert.deepEqual(shapes.map((s) => s.weeks), [5, 6, 5, 5]);
  assert.deepEqual(shapes.map((s) => s.cells), [35, 42, 35, 35]);
  assert.deepEqual(shapes.map((s) => s.inMonth), [28, 31, 30, 31]);
  // And the padding is exactly the difference: no day of the month is ever
  // dropped to make a row fit, and no row is ever short of seven cells.
  shapes.forEach((shape) => {
    const pad = shape.cells - shape.inMonth;
    assert.ok(pad <= 13, `${shape.month} pads with ${pad} cells`);
    assert.equal(shape.cells % 7, 0);
  });
});

test('the ledger currency is named, so a legend is never in the wrong currency', async () => {
  const s = await student();
  const { default: User } = await import('../src/models/User.js');
  // The account's own money is PKR; the screen happens to be showing dollars.
  // A legend built in dollars would be a legend about the wrong numbers.
  const written = await User.updateOne(
    { _id: s.user.id },
    { $set: { ledgerCurrency: 'PKR', currency: 'USD' } }
  );
  assert.equal(written.modifiedCount, 1, 'the fixture really changed the account');

  const res = await heatmap(s, '2026-09');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.currency, 'PKR', 'the amounts are in PKR even though the screen shows dollars');
  assert.equal(res.body.scale.unit, 'ledger');
  assert.equal(res.body.totals.monthSpend, 0);
});
