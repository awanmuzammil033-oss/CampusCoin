import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, makeDefaultCategory, withCsrf } from './helpers.js';

let ctx;
let newAgent;
let food;
const today = new Date();
const month = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`;
const todayStr = today.toISOString().slice(0, 10);

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
  food = await makeDefaultCategory({ name: 'Food', type: 'expense', icon: 'cup' });
});

test.after(async () => {
  await ctx.stop();
});

async function setup() {
  const agent = newAgent();
  const user = await registerStudent(agent);
  await withCsrf(user, agent.post('/api/budgets')).send({
    categoryId: food._id.toString(),
    month,
    limitAmount: '10.00',
  });
  return { agent, user };
}

function addExpense(agent, user, amount) {
  return withCsrf(user, agent.post('/api/transactions')).send({
    type: 'expense',
    amount,
    categoryId: food._id.toString(),
    date: todayStr,
    description: `grocery ${amount}`,
  });
}

async function notificationKinds(agent) {
  const res = await agent.get('/api/notifications');
  return res.body.rows.filter((r) => r.source === 'app').map((r) => r.kind).sort();
}

/* ------------------------- the 80% / 100% boundaries ------------------------ */

test('crossing 80% and 100% each notifies exactly once, no matter how often you edit', async () => {
  const { agent, user } = await setup();

  await addExpense(agent, user, '7.90'); // 79% — under the wire
  assert.deepEqual(await notificationKinds(agent), [], '79% must stay quiet');

  await addExpense(agent, user, '0.11'); // 80.1% — first warning
  assert.deepEqual(await notificationKinds(agent), ['budget_near']);

  await addExpense(agent, user, '1.00'); // 90.1% — still only one warning
  assert.deepEqual(await notificationKinds(agent), ['budget_near']);

  await addExpense(agent, user, '1.00'); // 101.1% — over budget
  assert.deepEqual(await notificationKinds(agent), ['budget_exceeded', 'budget_near']);

  // bouncing back under and over the line must not stack new alerts
  const list = await agent.get('/api/transactions');
  const rows = list.body.rows;
  await withCsrf(user, agent.delete(`/api/transactions/${rows[0].id}`));
  await addExpense(agent, user, '3.00');
  await addExpense(agent, user, '2.00');

  assert.deepEqual(await notificationKinds(agent), ['budget_exceeded', 'budget_near']);
});

/* ------------------------------- progress view ------------------------------ */

let shared;
test('budget progress widget returns correct numbers', async () => {
  shared = await setup();
  const { agent } = shared;
  await addExpense(agent, shared.user, '4.00');

  const res = await agent.get(`/api/budgets?month=${month}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.rows.length, 1);
  const row = res.body.rows[0];
  assert.equal(row.limit, 10);
  assert.equal(row.spent, 4);
  assert.equal(row.pct, 40);
  assert.equal(row.tone, 'ok');
  assert.ok(row.category.name === 'Food');
});

test('copying last month only adds budgets that do not exist yet', async () => {
  const { agent, user } = await setup();

  const res = await withCsrf(user, agent.post('/api/budgets/copy-previous')).send({ month });
  assert.equal(res.status, 200);
  assert.equal(res.body.copied, 0, 'nothing to copy in this test database');

  const again = await withCsrf(user, agent.post('/api/budgets')).send({
    categoryId: food._id.toString(),
    month,
    limitAmount: '12.00',
  });
  assert.equal(again.status, 201, 'the same category+month upserts instead of duplicating');

  const rows = (await agent.get(`/api/budgets?month=${month}`)).body.rows;
  const forFood = rows.filter((r) => r.category.id === food._id.toString());
  assert.equal(forFood.length, 1);
});
