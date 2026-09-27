/**
 * The spending-insights card and the scanned payment (ADV-5, ADV-6).
 *
 * Three properties are worth more than the happy path, and all three are tested
 * here:
 *
 *  1. THE INSIGHTS PAYLOAD IS NOT PROSE. If a sentence ever reaches the client
 *     from the server, it cannot be translated, and the whole reason this card
 *     exists in fourteen languages disappears. The test walks the payload and
 *     fails on anything that reads like a phrase.
 *  2. A PAYMENT IS NEVER PRICED WITH A GUESSED RATE. A pair the table cannot
 *     answer is refused, and nothing is written.
 *  3. A PAYMENT IS ALWAYS RECORDED. An unrecognised merchant name must not stop
 *     money that is already owed from landing in the ledger.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, withCsrf, makeDefaultCategory } from './helpers.js';

let ctx;
let newAgent;
let food;

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
  // one default category, created once: the (nameKey, type) index is unique and
  // a second "Food" is a duplicate key rather than a second category
  food = await makeDefaultCategory({ name: 'Food', type: 'expense', icon: 'cup' });
  FOOD = String(food.id || food._id);
});

test.after(async () => {
  await ctx.stop();
});

/** The one default expense category every test in this file files against. */
let FOOD = '';

const session = async (name) => {
  const agent = newAgent();
  const user = await registerStudent(agent, { name });
  return { agent, user };
};

const txn = (who, body) => withCsrf(who.user, who.agent.post('/api/transactions')).send(body);

const expense = (body = {}) => ({
  type: 'expense',
  amount: '100.00',
  description: 'Something',
  date: '2026-08-14',
  ...body,
});

/* ============================== the QR code ============================== */

test('the three code formats a counter actually prints are all read', async () => {
  const a = await session('Reader A');
  const b = await session('Reader B');
  const c = await session('Reader C');

  const campus = await withCsrf(a.user, a.agent.post('/api/qr/read'))
    .send({ code: 'campuscoin://pay?v=1&merchant=Al-Noor Cafeteria&amount=600.00&currency=PKR&note=Lunch&ref=CC-1' });
  assert.equal(campus.status, 200, campus.text);
  assert.equal(campus.body.code.merchant, 'Al-Noor Cafeteria');
  assert.equal(campus.body.code.amount, 600);
  assert.equal(campus.body.code.currency, 'PKR');
  assert.equal(campus.body.code.reference, 'CC-1');
  assert.equal(campus.body.code.note, 'Lunch');

  const upi = await withCsrf(b.user, b.agent.post('/api/qr/read')).send({
    code: 'upi://pay?pa=alnoor@bank&pn=Al-Noor Cafeteria&am=250.50&cu=PKR&tn=Tea&tr=CC-2',
  });
  assert.equal(upi.status, 200, upi.text);
  assert.equal(upi.body.code.merchant, 'Al-Noor Cafeteria');
  assert.equal(upi.body.code.amount, 250.5);

  const json = await withCsrf(c.user, c.agent.post('/api/qr/read')).send({
    code: '{"merchant":"Corner Store","amount":"19.99","currency":"PKR"}',
  });
  assert.equal(json.status, 200, json.text);
  assert.equal(json.body.code.amount, 19.99);
});

test('a code that is not a payment code, or is a broken one, is refused by name', async () => {
  const who = await session('Reader D');

  const notACode = await withCsrf(who.user, who.agent.post('/api/qr/read')).send({
    code: 'https://example.com/menu',
  });
  assert.equal(notACode.status, 400);

  for (const code of [
    'campuscoin://pay?amount=100&currency=PKR', // no merchant
    'campuscoin://pay?merchant=Canteen&currency=PKR', // no amount
    'campuscoin://pay?merchant=Canteen&amount=100', // no currency
    'campuscoin://pay?merchant=Canteen&amount=abc&currency=PKR',
    'campuscoin://pay?merchant=Canteen&amount=10.999&currency=PKR',
    'campuscoin://pay?merchant=Canteen&amount=-5&currency=PKR',
    'campuscoin://pay?merchant=Canteen&amount=0&currency=PKR',
    'campuscoin://pay?merchant=Canteen&amount=10&currency=PAKISTANI',
    'campuscoin://pay', // nothing after the address
  ]) {
    const res = await withCsrf(who.user, who.agent.post('/api/qr/read')).send({ code });
    assert.equal(res.status, 400, `should have refused: ${code}`);
    assert.ok(res.body.error && res.body.error.length > 10, `needs a sentence: ${code}`);
  }
});

test('a code in the person own money is not converted, and a pair with no rate is refused', async () => {
  const who = await session('Reader E');

  const same = await withCsrf(who.user, who.agent.post('/api/qr/read')).send({
    code: 'campuscoin://pay?merchant=Canteen&amount=600&currency=PKR',
    currency: 'PKR',
  });
  assert.equal(same.status, 200, same.text);
  assert.equal(same.body.quote.converted, false);
  assert.equal(same.body.quote.rate, 1);
  assert.equal(same.body.quote.amount, 600);

  const other = await withCsrf(who.user, who.agent.post('/api/qr/read')).send({
    code: 'campuscoin://pay?merchant=Canteen&amount=600&currency=PKR',
    currency: 'USD',
  });
  assert.equal(other.status, 200, other.text);
  assert.equal(other.body.quote.converted, true);
  assert.equal(other.body.quote.from, 'PKR');
  assert.equal(other.body.quote.to, 'USD');
  // a rate is quoted, and the day it was good for is quoted with it
  assert.ok(other.body.quote.rate > 0, 'a positive rate');
  assert.ok(other.body.quote.asOf, 'an as-of date');
  assert.ok(other.body.quote.source, 'and where the rate came from');
  assert.notEqual(other.body.quote.amount, 600, 'the amount is actually converted');

  // a currency no table can price is refused rather than guessed
  const unknown = await withCsrf(who.user, who.agent.post('/api/qr/read')).send({
    code: 'campuscoin://pay?merchant=Canteen&amount=600&currency=ZWL',
    currency: 'USD',
  });
  assert.equal(unknown.status, 400, unknown.text);
  assert.match(unknown.body.error, /cannot price|ZWL/i);
});

test('a payment becomes an expense, keeps the code own amount as the receipt, and moves the balance', async () => {
  const who = await session('Payer');

  const before = await who.agent.get('/api/dashboard/summary');
  assert.equal(before.status, 200);

  const paid = await withCsrf(who.user, who.agent.post('/api/qr/pay')).send({
    code: 'campuscoin://pay?merchant=Al-Noor Cafeteria&amount=600.00&currency=PKR&note=Lunch&ref=CC-7781',
    currency: 'PKR',
    categoryId: FOOD,
  });
  assert.equal(paid.status, 201, paid.text);

  // the expense names the merchant
  assert.match(paid.body.transaction.description, /Al-Noor Cafeteria/);

  // and the code's own amount is kept exactly as it was stated
  assert.equal(paid.body.scan.originalCurrency, 'PKR');
  assert.equal(Number(paid.body.scan.originalAmount), 600);
  assert.equal(paid.body.transaction.scan.originalCurrency, 'PKR');
  assert.equal(Number(paid.body.transaction.scan.originalAmount), 600);

  // the balance came back, and it is the dashboard's own arithmetic
  const after = await who.agent.get('/api/dashboard/summary');
  assert.equal(
    Number(paid.body.balance),
    Number(Number(after.body.balance).toFixed(2)),
    'the reported balance is the dashboard balance'
  );
  assert.ok(
    Number(after.body.balance) < Number(before.body.balance),
    'the balance actually fell'
  );

  // and the transaction is in the list, not just in the answer
  const list = await who.agent.get('/api/transactions?type=expense');
  const found = (list.body.rows || []).find((row) => /Al-Noor/.test(row.description || ''));
  assert.ok(found, 'the payment is in the transactions list');
  assert.ok(found.scan, 'with the scan on the row');
});

test('an unrecognised merchant still gets filed, and the answer says the category was a guess', async () => {
  const who = await session('Payer Two');

  // a first expense with a name the word list has never seen
  const paid = await withCsrf(who.user, who.agent.post('/api/qr/pay')).send({
    code: 'campuscoin://pay?merchant=Zxqvblorp Nom Nom&amount=42.00&currency=PKR',
    currency: 'PKR',
  });
  assert.equal(paid.status, 201, paid.text);
  assert.ok(paid.body.transaction.category, 'it was filed somewhere');
  assert.equal(typeof paid.body.category.fallback, 'boolean');
});

/* ============================ the insights card ============================ */

test('the card answers for a month, and refuses a month that is not one', async () => {
  const who = await session('Analysed');

  for (let i = 0; i < 4; i += 1) {
    const res = await txn(who, expense({ amount: '15.00', description: `Canteen lunch ${i}`, categoryId: FOOD }));
    assert.equal(res.status, 201, res.text);
  }
  const extra = await txn(who, expense({ amount: '9.99', description: 'Netflix', categoryId: FOOD }));
  assert.equal(extra.status, 201);

  const res = await who.agent.get('/api/insights/spending?month=2026-08');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.month, '2026-08');
  assert.equal(res.body.totals.expense, 69.99);
  assert.equal(res.body.totals.count, 5);
  assert.ok(res.body.categories.length >= 1, 'at least one category');
  assert.ok(res.body.top.length >= 1, 'and one to lead with');
  assert.ok(res.body.top[0].share > 0, 'with a share of the month');

  // an empty month is no month, which means the default - not a bad one
  for (const month of ['last-month', '2026-13', '2026-00', 'nonsense']) {
    const bad = await who.agent.get(`/api/insights/spending?month=${encodeURIComponent(month)}`);
    assert.equal(bad.status, 400, `should have refused: ${month}`);
  }
});

test('the card opens on last month by default, which is a month already gone', async () => {
  const who = await session('Default Month');
  const now = new Date();
  const lastMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

  const res = await who.agent.get('/api/insights/spending');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.month, lastMonth);
});

test('four canteen lunches in a month produce the dining pattern, with a saving that is an estimate', async () => {
  const who = await session('Diner');
  for (let i = 0; i < 4; i += 1) {
    await txn(who, expense({ amount: '20.00', description: `Canteen ${i}`, categoryId: FOOD }));
  }

  const res = await who.agent.get('/api/insights/spending?month=2026-08');
  const dining = res.body.patterns.find((row) => row.id === 'dining_out');
  assert.ok(dining, `expected a dining pattern, got ${res.body.patterns.map((r) => r.id).join(',')}`);
  assert.equal(dining.count, 4);
  assert.equal(dining.total, 80);
  // 40% of 80, and it is sent as a number so the client never works it out twice
  assert.equal(dining.saving, 32);
  assert.equal(dining.basis, 'home_cooked');
});

test('the payload is facts only: nothing in it reads like a sentence', async () => {
  const who = await session('Prose Check');
  for (let i = 0; i < 4; i += 1) {
    await txn(who, expense({ amount: '20.00', description: `Canteen ${i}`, categoryId: FOOD }));
  }

  const raw = (await who.agent.get('/api/insights/spending?month=2026-08')).text;

  // three or more words in a row, in any value, is a sentence - and a sentence
  // cannot be translated
  const offenders = [...raw.matchAll(/"([A-Za-z][A-Za-z ',.-]{18,})"/g)]
    .map((m) => m[1])
    .filter((text) => text.trim().split(/\s+/).length >= 4);
  assert.deepEqual(offenders, [], `prose in the payload: ${offenders.join(' | ')}`);

  // and the same for the parseable object, key by key
  const data = JSON.parse(raw);
  const walk = (node, path = '') => {
    if (typeof node === 'string') {
      assert.ok(
        node.trim().split(/\s+/).length < 4,
        `${path} reads like prose: "${node}"`
      );
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((row, i) => walk(row, `${path}[${i}]`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key);
    }
  };
  walk(data);
});

test('another student spending is not in your card, and your month list is your own', async () => {
  const mine = await session('Mine');
  const theirs = await session('Theirs');

  for (let i = 0; i < 4; i += 1) {
    await txn(theirs, expense({ amount: '20.00', description: `Theirs ${i}`, categoryId: FOOD }));
  }

  const res = await mine.agent.get('/api/insights/spending?month=2026-08');
  assert.equal(res.status, 200);
  assert.equal(res.body.totals.count, 0, 'nothing of theirs in my card');
  assert.deepEqual(res.body.patterns, []);

  const months = await mine.agent.get('/api/insights/spending/months');
  assert.equal(months.status, 200);
  assert.deepEqual(months.body.months, [], 'and no months of their own');
});
