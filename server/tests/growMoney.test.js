import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, makeDefaultCategory } from './helpers.js';
import { toDec } from '../src/utils/money.js';
import Transaction from '../src/models/Transaction.js';
import { RISK_LEVELS, GROW_THRESHOLDS } from '../src/services/growMoney.js';

/**
 * Grow your money (ADV-4): the educational page about savings accounts, fixed
 * deposits and mutual funds, plus the one personal number it is allowed to
 * show — this month's surplus.
 *
 * The fixtures are written straight to the models so every entry lands on an
 * exact day of a named month; the nudge reads the CURRENT month, and a test
 * that leaned on "roughly this month" would be a test that fails on the first
 * of the month. The harness itself (an in-memory database, real sign-ups, real
 * sessions) is copied from budgets.test.js.
 *
 * The point of most of these tests is not the arithmetic — it is that the
 * server cannot write a sentence. The nudge is a key and some numbers, so
 * there is no code path by which this API could name a fund, quote a rate or
 * tell anybody what to buy.
 */

let ctx;
let newAgent;
let incomeCat;
let expenseCat;
let otherExpenseCat;

const now = new Date();
const MONTH_KEY = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

/** A date on an exact day of a month offset from the current one. */
function day(offset, dayOfMonth) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, dayOfMonth));
}

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
  incomeCat = await makeDefaultCategory({ name: 'Scholarship', type: 'income', icon: 'wallet' });
  expenseCat = await makeDefaultCategory({ name: 'Rent', type: 'expense', icon: 'home' });
  otherExpenseCat = await makeDefaultCategory({ name: 'Books', type: 'expense', icon: 'book' });
  await mountGrowMoney();
});

/**
 * app.js is the shell the whole API hangs off, and the grow-money router
 * belongs in it. The suite mounts it exactly where the other routers sit — in
 * front of the /api 404 layer, behind the session and CSRF middleware — so the
 * HTTP surface is exercised end to end without the shell having to know about
 * this file.
 */
async function mountGrowMoney() {
  const { default: growRouter } = await import('../src/routes/growMoney.js');
  const stack = (ctx.app._router || ctx.app.router).stack;

  ctx.app.use('/api/grow-money', growRouter);
  const layer = stack.pop();
  const before = stack.findIndex((l) => l.handle && l.handle.name === 'notFound');
  stack.splice(before === -1 ? stack.length : before, 0, layer);
}

test.after(async () => {
  await ctx.stop();
});

/* -------------------------------- fixtures --------------------------------- */

function entry(userId, { type, amount, on, category, description = '' }) {
  return Transaction.create({
    user: userId,
    category: (category || (type === 'income' ? incomeCat : expenseCat))._id,
    amount: toDec(amount),
    type,
    description,
    date: on,
  });
}

async function signIn() {
  const agent = newAgent();
  const session = await registerStudent(agent);
  return { agent, session, userId: session.user.id };
}

async function grow(agent) {
  const res = await agent.get('/api/grow-money');
  assert.equal(res.status, 200, `expected the nudge payload, got ${res.status}`);
  return res.body;
}

/* ------------------------------ the arithmetic ----------------------------- */

test("this month's surplus comes out of the student's own ledger, and the nudge quotes it", async () => {
  const { agent, userId } = await signIn();

  // a month with income on two days and spending on two
  await entry(userId, { type: 'income', amount: '1200.00', on: day(0, 2), description: 'bursary' });
  await entry(userId, { type: 'income', amount: '60.00', on: day(0, 20), description: 'weekend shift' });
  await entry(userId, { type: 'expense', amount: '950.50', on: day(0, 3) });
  await entry(userId, { type: 'expense', amount: '40.25', on: day(0, 21), category: otherExpenseCat });

  // last month must not be in the answer, and a binned row must not either
  await entry(userId, { type: 'income', amount: '5000.00', on: day(-1, 1) });
  const binned = await entry(userId, { type: 'expense', amount: '999.99', on: day(0, 5) });
  await Transaction.updateOne({ _id: binned._id }, { $set: { isDeleted: true } });

  const body = await grow(agent);

  assert.equal(body.monthKey, MONTH_KEY);
  assert.equal(body.income, 1260);
  assert.equal(body.expense, 990.75);
  assert.equal(body.surplus, 269.25, '1260 in, 990.75 out');
  assert.equal(body.hasSurplus, true);
  assert.equal(body.entries, 4, 'the row in the bin is not one of them');

  assert.equal(body.nudge.key, 'grow.nudge.surplus');
  assert.deepEqual(body.nudge.vars, { amount: 269.25 }, 'the number travels, the sentence does not');
});

test('spending above income gets the no-surplus nudge and a non-positive number', async () => {
  const { agent, userId } = await signIn();

  await entry(userId, { type: 'income', amount: '500.00', on: day(0, 1) });
  await entry(userId, { type: 'expense', amount: '640.00', on: day(0, 2) });

  const body = await grow(agent);
  assert.equal(body.surplus, -140);
  assert.ok(body.surplus <= 0, 'the figure must not be dressed up as spare money');
  assert.equal(body.hasSurplus, false);
  assert.equal(body.nudge.key, 'grow.nudge.noSurplus');
  assert.equal(body.nudge.vars.amount, -140, 'the same number, so the panel and the sentence agree');
});

test('a student with nothing logged this month gets the nothing-logged key, not "no surplus"', async () => {
  const { agent, userId } = await signIn();

  // last month's spending exists and still must not answer the question
  await entry(userId, { type: 'expense', amount: '300.00', on: day(-1, 12) });

  const body = await grow(agent);
  assert.equal(body.entries, 0);
  assert.equal(body.surplus, 0);
  assert.equal(body.hasSurplus, false);
  assert.equal(
    body.nudge.key,
    'grow.nudge.nothingLogged',
    'an empty month is not a month with nothing to spare'
  );
  assert.deepEqual(body.nudge.vars, {});
});

test('the thin-margin boundary: a tenth of the income or more counts as a surplus', async () => {
  const { agent, userId } = await signIn();

  await entry(userId, { type: 'income', amount: '1000.00', on: day(0, 1) });
  await entry(userId, { type: 'expense', amount: '900.00', on: day(0, 2) });
  const tenth = await grow(agent);
  assert.equal(tenth.surplus, 100);
  assert.equal(
    tenth.nudge.key,
    'grow.nudge.surplus',
    'exactly the threshold counts as spare, so the line is not hair-trigger'
  );

  await entry(userId, { type: 'expense', amount: '0.01', on: day(0, 3) });
  const under = await grow(agent);
  assert.equal(under.surplus, 99.99);
  assert.equal(
    under.nudge.key,
    'grow.nudge.tight',
    'a positive margin this thin is called thin, not "left over"'
  );
  assert.equal(GROW_THRESHOLDS.tightSharePct, 10, 'and the threshold is published, not hidden in the service');
});

test("another student's transactions never reach the number", async () => {
  const { agent, userId } = await signIn();
  await entry(userId, { type: 'income', amount: '800.00', on: day(0, 1) });
  await entry(userId, { type: 'expense', amount: '500.00', on: day(0, 2) });

  const other = await signIn();
  await entry(other.userId, { type: 'income', amount: '9000.00', on: day(0, 1) });
  await entry(other.userId, { type: 'expense', amount: '4000.00', on: day(0, 2) });

  const mine = await grow(agent);
  assert.equal(mine.income, 800);
  assert.equal(mine.expense, 500);
  assert.equal(mine.surplus, 300);
  assert.equal(mine.nudge.vars.amount, 300);

  // and the other way round: they see their own month, not this one
  const theirs = await grow(other.agent);
  assert.equal(theirs.surplus, 5000);
  assert.ok(!JSON.stringify(mine).includes('9000'), "the other student's income is nowhere in the payload");
});

/* ------------------------------ the boundaries ----------------------------- */

test('the nudge is a key and some numbers — never a sentence', async () => {
  const { agent, userId } = await signIn();
  await entry(userId, { type: 'income', amount: '1500.00', on: day(0, 1) });
  await entry(userId, { type: 'expense', amount: '1100.00', on: day(0, 2) });

  const body = await grow(agent);
  const { monthKey, ...rest } = body;

  assert.match(monthKey, /^\d{4}-\d{2}$/, 'the month is a key, not a date written in English');
  walk(rest, 'body');

  // Belt and braces: nothing in the response reads like a recommendation.
  const text = JSON.stringify(body);
  for (const banned of [
    'advice',
    'recommend',
    'buy',
    'sell',
    'stock',
    'ticker',
    'guarantee',
    'rate of',
    'per cent',
    'percent',
  ]) {
    assert.ok(!new RegExp(`\\b${banned}`, 'i').test(text), `the response must never contain "${banned}"`);
  }
});

test('the risk ladder hands over translation keys, not risk sentences', async () => {
  assert.deepEqual(
    RISK_LEVELS.map((rung) => rung.level),
    ['low', 'medium', 'high'],
    'the order is the fact; the words are the dictionary’s'
  );

  for (const rung of RISK_LEVELS) {
    assert.deepEqual(Object.keys(rung).sort(), ['key', 'level'], 'a rung is a level and a key, nothing else');
    assert.equal(rung.key, `grow.risk.${rung.level}`);
    assert.ok(!/\s/.test(rung.key), 'a rung must not carry prose');
  }

  const { agent } = await signIn();
  const body = await grow(agent);
  assert.deepEqual(body.riskLevels, RISK_LEVELS.map((rung) => ({ ...rung })));
  assert.ok(Object.isFrozen(RISK_LEVELS), 'and the ladder cannot be reordered from outside the service');
});

test('the page sits behind the student guard', async () => {
  const anonymous = await newAgent().get('/api/grow-money');
  assert.equal(anonymous.status, 401, 'the surplus is the reader’s own and must never be fetched unsigned');
});

/* --------------------------------- helpers --------------------------------- */

/**
 * Walk a payload and prove every leaf is a translation key, a finite number
 * or a flag — the three things this API is allowed to carry. Anything else,
 * above all a string with a space in it, is a sentence trying to get out.
 * `monthKey` is checked separately because a YYYY-MM key is data, not prose.
 */
function walk(node, path) {
  if (typeof node === 'number') {
    assert.ok(Number.isFinite(node), `${path} must be a finite number`);
    return;
  }
  if (typeof node === 'boolean') return; // hasSurplus: a flag, not a claim
  if (typeof node === 'string') {
    assert.ok(!/\s/.test(node), `${path} must not be a sentence (saw "${node}")`);
    // Either a dictionary key, or a machine slug ("low") that the client
    // resolves through the ladder's own key. Nothing a reader could mistake
    // for a word on screen.
    assert.match(node, /^grow\.[A-Za-z0-9.]+$|^[a-z][a-z-]*$/, `${path} must be a key or a slug (saw "${node}")`);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, `${path}[${i}]`));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
    return;
  }
  assert.fail(`${path} must be a number, a flag, a key or an object — saw ${node === null ? 'null' : typeof node}`);
}
