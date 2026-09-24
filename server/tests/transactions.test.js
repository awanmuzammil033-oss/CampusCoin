import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, makeDefaultCategory, withCsrf } from './helpers.js';

let ctx;
let newAgent;
let food;
let allowance;

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
  food = await makeDefaultCategory({ name: 'Food', type: 'expense', icon: 'cup' });
  allowance = await makeDefaultCategory({ name: 'Allowance', type: 'income', icon: 'wallet' });
});

test.after(async () => {
  await ctx.stop();
});

async function session() {
  const agent = newAgent();
  const user = await registerStudent(agent);
  return { agent, user };
}

function txnPayload(overrides = {}) {
  return {
    type: 'expense',
    amount: '12.50',
    categoryId: food._id.toString(),
    date: '2026-09-10',
    description: 'Campus cafe lunch',
    ...overrides,
  };
}

/* ------------------------------ calendar days ------------------------------ */

test('the saved calendar day is exactly the day that was entered', async () => {
  const { agent, user } = await session();

  // Regression: a date-only value must survive the round trip byte for byte.
  // Local-midnight storage shifted entries back one day on any server whose
  // time zone sits east of UTC — entering 1 Sep saved 31 Aug instead.
  const created = await withCsrf(user, agent.post('/api/transactions')).send(
    txnPayload({
      type: 'income',
      categoryId: allowance._id.toString(),
      amount: '1000',
      date: '2026-09-01',
      description: 'mehnat ki kamai',
    })
  );
  assert.equal(created.status, 201);
  assert.match(created.body.transaction.date, /^2026-09-01/);

  // The very same day comes back through the list and its day filter.
  const day = await agent.get('/api/transactions?from=2026-09-01&to=2026-09-01');
  assert.equal(day.status, 200);
  assert.equal(day.body.pagination.total, 1);
  assert.match(day.body.rows[0].date, /^2026-09-01/);

  // ...and reports file it under September, not August.
  const sep = await agent.get('/api/reports?tab=daily&month=2026-09');
  assert.equal(sep.status, 200);
  assert.equal(sep.body.days[0].income, 1000);

  const aug = await agent.get('/api/reports?tab=daily&month=2026-08');
  assert.equal(aug.status, 200);
  assert.equal(aug.body.days.reduce((sum, d) => sum + d.income, 0), 0);
});

/* --------------------------------- creation --------------------------------- */

test('creates a transaction and refuses invalid amounts and mismatched types', async () => {
  const { agent, user } = await session();

  const ok = await withCsrf(user, agent.post('/api/transactions')).send(txnPayload());
  assert.equal(ok.status, 201);
  assert.equal(ok.body.transaction.amount, 12.5);
  assert.equal(ok.body.transaction.flag, 'none');

  const zero = await withCsrf(user, agent.post('/api/transactions')).send(txnPayload({ amount: '0' }));
  assert.equal(zero.status, 400);

  const negative = await withCsrf(user, agent.post('/api/transactions')).send(txnPayload({ amount: '-5' }));
  assert.equal(negative.status, 400);

  const tooManyDecimals = await withCsrf(user, agent.post('/api/transactions')).send(txnPayload({ amount: '1.999' }));
  assert.equal(tooManyDecimals.status, 400);

  // an expense cannot be filed under an income category
  const mismatch = await withCsrf(user, agent.post('/api/transactions')).send(
    txnPayload({ categoryId: allowance._id.toString() })
  );
  assert.equal(mismatch.status, 400);
});

test('duplicate-looking entries get the duplicate badge and can clear it', async () => {
  const { agent, user } = await session();

  const first = await withCsrf(user, agent.post('/api/transactions')).send(txnPayload());
  assert.equal(first.body.transaction.flag, 'none');

  const second = await withCsrf(user, agent.post('/api/transactions')).send(txnPayload());
  assert.equal(second.body.transaction.flag, 'duplicate');

  const cleared = await withCsrf(user, agent.post(`/api/transactions/${second.body.transaction.id}/not-duplicate`)).send({});
  assert.equal(cleared.body.transaction.flag, 'none');
});

/* --------------------------- per-user isolation ----------------------------- */

test("another student's transaction reads as 404, never as data", async () => {
  const alice = await session();
  const bob = await session();

  const created = await withCsrf(alice.user, alice.agent.post('/api/transactions')).send(txnPayload());
  const id = created.body.transaction.id;

  const read = await bob.agent.get(`/api/transactions/${id}`);
  assert.equal(read.status, 404);

  const edit = await withCsrf(bob.user, bob.agent.patch(`/api/transactions/${id}`)).send({ amount: '999.00' });
  assert.equal(edit.status, 404);

  const remove = await withCsrf(bob.user, bob.agent.delete(`/api/transactions/${id}`));
  assert.equal(remove.status, 404);

  const history = await bob.agent.get(`/api/transactions/${id}/history`);
  assert.equal(history.status, 404);

  // and Alice's own copy is untouched
  const mine = await alice.agent.get(`/api/transactions/${id}`);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.transaction.amount, 12.5);
});

/* --------------------- edit / delete / restore + history -------------------- */

test('every change leaves an audit row, delete is soft and restorable', async () => {
  const { agent, user } = await session();

  const created = await withCsrf(user, agent.post('/api/transactions')).send(txnPayload());
  const id = created.body.transaction.id;

  const edited = await withCsrf(user, agent.patch(`/api/transactions/${id}`)).send({ amount: '15.00', description: 'Lunch + coffee' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.transaction.amount, 15);

  const deleted = await withCsrf(user, agent.delete(`/api/transactions/${id}`));
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.transaction.isDeleted, true);

  const goneFromList = await agent.get('/api/transactions');
  assert.equal(goneFromList.body.rows.length, 0);

  const bin = await agent.get('/api/transactions/deleted/list');
  assert.equal(bin.body.rows.length, 1);

  const restored = await withCsrf(user, agent.post(`/api/transactions/${id}/restore`)).send({});
  assert.equal(restored.body.transaction.isDeleted, false);

  const history = await agent.get(`/api/transactions/${id}/history`);
  const actions = history.body.rows.map((r) => r.action);
  assert.deepEqual(actions, ['restore', 'delete', 'update', 'create']);

  const updateRow = history.body.rows.find((r) => r.action === 'update');
  assert.equal(updateRow.before.amount, 12.5, 'the audit keeps what it was before the edit');
  assert.equal(updateRow.after.amount, 15);
});

/* --------------------------- list filters (TXN-5) --------------------------- */

test('search, type and category filters combine correctly', async () => {
  const { agent, user } = await session();

  await withCsrf(user, agent.post('/api/transactions')).send(txnPayload({ description: 'Pizza night', amount: '18.00' }));
  await withCsrf(user, agent.post('/api/transactions')).send(
    txnPayload({ description: 'Bus fare', amount: '2.00', date: '2026-09-11' })
  );
  await withCsrf(user, agent.post('/api/transactions')).send(
    txnPayload({ type: 'income', amount: '600.00', categoryId: allowance._id.toString(), description: 'Monthly allowance', date: '2026-09-01' })
  );

  const all = await agent.get('/api/transactions');
  assert.equal(all.body.rows.length, 3);
  assert.equal(all.body.totals.income, 600);
  assert.equal(all.body.totals.expense, 20);

  const search = await agent.get('/api/transactions?q=pizza');
  assert.equal(search.body.rows.length, 1);
  assert.equal(search.body.rows[0].description, 'Pizza night');

  const incomesOnly = await agent.get('/api/transactions?type=income');
  assert.equal(incomesOnly.body.rows.length, 1);
  assert.equal(incomesOnly.body.rows[0].type, 'income');

  const oneDay = await agent.get('/api/transactions?from=2026-09-11&to=2026-09-11');
  assert.equal(oneDay.body.rows.length, 1);
  assert.equal(oneDay.body.rows[0].description, 'Bus fare');

  // regex metacharacters in the search box are literal, not operators
  const weird = await agent.get('/api/transactions?q=(');
  assert.equal(weird.status, 200);
  assert.equal(weird.body.rows.length, 0);
});
