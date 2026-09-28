/**
 * Wallets, and the one property the whole feature rests on (NEW-11).
 *
 * A transfer is not income and not an expense. If that were ever untrue the reader
 * would be told they earned money they did not earn and spent money they did not
 * spend, and they would act on it. So the tests below are weighted towards that
 * one claim rather than spread evenly over the endpoints:
 *
 *   - a transfer does not move the income figure, the expense figure, the month
 *     total, the balance, a category's spending or a budget (the same report the
 *     budget alert reads, so the budget cannot be eaten by a top-up);
 *   - it DOES move both wallet balances, by the same amount, in opposite
 *     directions, and the two balances still add up to what they were;
 *   - a balance is derived, never stored, and survives a month of spending;
 *   - the whole thing is refused by name where it should be: the same wallet twice,
 *     more than the wallet holds, a stranger's wallet (404, never 403), an amount
 *     that is not money;
 *   - and the arithmetic is in whole cents, which is checked with a number that a
 *     float would get wrong.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, withCsrf, makeDefaultCategory } from './helpers.js';

let ctx;
let newAgent;

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
});

test.after(async () => {
  await ctx.stop();
});

const session = async (name) => {
  const agent = newAgent();
  const user = await registerStudent(agent, { name });
  return { agent, user };
};

let FOOD;
let SALARY;

test.before(async () => {
  FOOD = String((await makeDefaultCategory({ name: 'Food', type: 'expense', icon: 'cup' })).id);
  SALARY = String((await makeDefaultCategory({ name: 'Allowance', type: 'income', icon: 'card' })).id);
});

const get = (who, path) => who.agent.get(path);
const post = (who, path, body) => withCsrf(who.user, who.agent.post(path)).send(body);
const patch = (who, path, body) => withCsrf(who.user, who.agent.patch(path)).send(body);
const del = (who, path) => withCsrf(who.user, who.agent.delete(path)).send();

/** A person with three wallets, an income and an expense, and a known balance. */
async function withMoney(name, { expense = '0', income = '0' } = {}) {
  const who = await session(name);
  const wallets = (await get(who, '/api/wallets')).body;
  assert.equal(wallets.wallets.length, 3, 'three wallets are seeded on first read');
  if (expense !== '0') {
    const res = await post(who, '/api/transactions', {
      type: 'expense',
      amount: expense,
      description: 'Lunch',
      date: '2026-09-04',
      categoryId: FOOD,
      walletId: wallets.wallets[0].id,
    });
    assert.equal(res.status, 201, res.text);
  }
  if (income !== '0') {
    const res = await post(who, '/api/transactions', {
      type: 'income',
      amount: income,
      description: 'Allowance',
      date: '2026-09-01',
      categoryId: SALARY,
      walletId: wallets.wallets[0].id,
    });
    assert.equal(res.status, 201, res.text);
  }
  return { ...who, walletIds: wallets.wallets.map((w) => w.id), defaultId: wallets.defaultId };
}

const balanceOf = async (who, id) => {
  const rows = (await get(who, '/api/wallets')).body.wallets;
  return Number(rows.find((w) => w.id === id)?.balance);
};

/* ============================== the balances ============================== */

test('three wallets are seeded once, and never seeded twice', async () => {
  const who = await session('Seeded');
  const first = await get(who, '/api/wallets');
  assert.equal(first.status, 200, first.text);
  assert.deepEqual(
    first.body.wallets.map((w) => w.kind),
    ['cash', 'bank', 'mobile'],
    'the three pockets a student has, in that order'
  );
  assert.equal(first.body.defaultId, first.body.wallets[0].id, 'and exactly one is the default');
  assert.equal(first.body.wallets.filter((w) => w.isDefault).length, 1);

  const again = await get(who, '/api/wallets');
  assert.equal(again.body.wallets.length, 3, 'a second read creates nothing');
  assert.deepEqual(again.body.wallets.map((w) => w.id), first.body.wallets.map((w) => w.id));
});

test('an opening balance is kept, and the balance is derived from it', async () => {
  const who = await session('Opening');
  const created = await post(who, '/api/wallets', { name: 'Notes', kind: 'cash', openingBalance: '3000.00' });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.wallet.openingBalance, 3000);
  assert.equal(created.body.wallet.balance, 3000, 'an empty wallet holds its opening figure');
  assert.equal(
    Number((await get(who, '/api/wallets')).body.wallets.find((w) => w.id === created.body.wallet.id).balance),
    3000,
    'and the list agrees with the answer that created it'
  );

  const rows = (await get(who, '/api/wallets')).body.wallets;
  assert.equal(rows.length, 4);
  assert.equal(Number(rows.find((w) => w.id === created.body.wallet.id).balance), 3000);
});

test('a balance follows the entries filed to that wallet, and only that wallet', async () => {
  const who = await withMoney('Filed', { income: '1000.00', expense: '250.50' });
  const [cash, bank] = who.walletIds;

  assert.equal(await balanceOf(who, cash), 749.5, '1000 in, 250.50 out');
  assert.equal(await balanceOf(who, bank), 0, 'the other wallet is untouched');
});

test('cents are whole: 0.1 + 0.2 does not leave a cent out of a wallet', async () => {
  const who = await session('Cents');
  const cash = (await get(who, '/api/wallets')).body.wallets[0].id;

  for (const amount of ['0.10', '0.20']) {
    const res = await post(who, '/api/transactions', {
      type: 'expense',
      amount,
      description: 'tea',
      date: '2026-09-05',
      categoryId: FOOD,
      walletId: cash,
    });
    assert.equal(res.status, 201, res.text);
  }

  const rows = (await get(who, '/api/wallets')).body.wallets;
  const balance = Number(rows.find((w) => w.id === cash).balance);
  assert.equal(balance, -0.3, `expected -0.30 exactly, got ${balance}`);
  assert.equal(balance.toFixed(2), '-0.30', 'and it reads as money, not as 0.30000000000000004');
});

/* ============================ THE ONE BIG CLAIM =========================== */

test('a transfer moves both wallets and NOTHING else - not income, not expense, not the balance, not a budget', async () => {
  const who = await withMoney('Transfer', { income: '1000.00', expense: '100.00' });
  const [cash, bank] = who.walletIds;
  const cashBefore = await balanceOf(who, cash);
  const bankBefore = await balanceOf(who, bank);

  const summaryBefore = (await get(who, '/api/dashboard/summary')).body;
  const reportBefore = (await get(who, '/api/reports?tab=category&month=2026-09')).body;

  const moved = await post(who, '/api/wallets/transfer', {
    fromId: cash,
    toId: bank,
    amount: '300.00',
    date: '2026-09-20',
    note: 'moved for the week',
  });
  assert.equal(moved.status, 201, moved.text);
  assert.equal(moved.body.transfer.amount, 300);
  assert.equal(moved.body.transfer.from.name, 'Cash');
  assert.equal(moved.body.transfer.to.name, 'Bank account');

  /* the two wallets moved, by the same amount, in opposite directions */
  assert.equal(await balanceOf(who, cash), cashBefore - 300, 'the wallet it left is 300 lighter');
  assert.equal(await balanceOf(who, bank), bankBefore + 300, 'the wallet it reached is 300 heavier');
  assert.equal(
    (await balanceOf(who, cash)) + (await balanceOf(who, bank)),
    cashBefore + bankBefore,
    'and the two together are worth exactly what they were'
  );

  /* and not one of the figures a person reads as "money in" or "money out" moved */
  const summaryAfter = (await get(who, '/api/dashboard/summary')).body;
  assert.equal(summaryAfter.income, summaryBefore.income, 'income is untouched');
  assert.equal(summaryAfter.expense, summaryBefore.expense, 'expense is untouched');
  assert.equal(summaryAfter.balance, summaryBefore.balance, 'the balance is untouched');

  const reportAfter = (await get(who, '/api/reports?tab=category&month=2026-09')).body;
  assert.equal(reportAfter.totals.expense, reportBefore.totals.expense, 'the category report is untouched');
  assert.equal(reportAfter.totals.income, reportBefore.totals.income, 'its income figure too');
  const foodRow = (rows) => rows.find((r) => r.name === 'Food');
  assert.equal(
    Number(foodRow(reportAfter.rows)?.amount),
    Number(foodRow(reportBefore.rows)?.amount),
    'and the amount spent on food did not grow by the transfer'
  );

  /* a budget reads the same number, so a top-up cannot eat one */
  const budget = await post(who, '/api/budgets', {
    categoryId: FOOD,
    limitAmount: '500.00',
    month: '2026-09',
  });
  assert.equal(budget.status, 201, budget.text);
  const progress = (await get(who, '/api/budgets/progress?month=2026-09')).body.rows
    .find((r) => r.category?.id === FOOD);
  assert.ok(progress, 'the budget is there to be read');
  assert.equal(
    Number(progress.spent),
    100,
    'the budget still counts the 100 of lunch, and not the 300 moved'
  );
  assert.ok(progress.pct < 80, `and it is nowhere near its limit: ${progress.pct}%`);
});

test('a transfer is not in the transactions list at all, and the wallet history has it', async () => {
  const who = await withMoney('History', { income: '500.00' });
  const [cash, bank] = who.walletIds;

  await post(who, '/api/wallets/transfer', { fromId: cash, toId: bank, amount: '120.00', date: '2026-09-21' });

  const list = (await get(who, '/api/transactions?perPage=50')).body;
  const described = list.rows.map((r) => r.description || '');
  assert.equal(
    described.some((text) => /120/.test(text)),
    false,
    'the transactions list is a list of income and spending, and a transfer is neither'
  );
  assert.equal(
    list.totals.expense,
    0,
    'and the list own expense total is 0, not 120 - that is the claim this test exists for'
  );

  const history = await get(who, `/api/wallets/${cash}/history`);
  assert.equal(history.status, 200, history.text);
  assert.equal(history.body.rows.length, 1);
  assert.equal(history.body.rows[0].amount, 120);
  assert.equal(history.body.rows[0].direction, 'out', 'and from this wallet it went out');
  assert.equal(history.body.rows[0].to.name, 'Bank account');

  const other = await get(who, `/api/wallets/${bank}/history`);
  assert.equal(other.body.rows[0].direction, 'in', 'the same row, seen from the other end, went in');
});

/* ================================ the refusals ============================= */

test('a transfer that is not a transfer is refused by name, and writes nothing', async () => {
  const who = await withMoney('Refused', { income: '200.00' });
  const [cash, bank] = who.walletIds;

  const same = await post(who, '/api/wallets/transfer', { fromId: cash, toId: cash, amount: '10.00' });
  assert.equal(same.status, 400);
  assert.match(same.body.error, /same wallet/i);

  for (const amount of ['0', '-5', 'abc', '', '10.999']) {
    const res = await post(who, '/api/wallets/transfer', { fromId: cash, toId: bank, amount });
    assert.equal(res.status, 400, `should have refused ${JSON.stringify(amount)}`);
    assert.ok(res.body.error.length > 8, 'with a sentence');
  }

  const tooMuch = await post(who, '/api/wallets/transfer', { fromId: cash, toId: bank, amount: '99999.00' });
  assert.equal(tooMuch.status, 400);
  assert.match(tooMuch.body.error, /holds/, 'and it says what the wallet actually holds');

  assert.equal(await balanceOf(who, cash), 200, 'nothing moved');
  assert.equal(await balanceOf(who, bank), 0);
});

test('a stranger wallet is a 404 and never a 403', async () => {
  const mine = await withMoney('Mine', { income: '300.00' });
  const theirs = await withMoney('Theirs', { income: '300.00' });
  const myBank = mine.walletIds[1];

  const res = await post(mine, '/api/wallets/transfer', {
    fromId: myBank,
    toId: theirs.walletIds[0],
    amount: '10.00',
  });
  assert.equal(res.status, 404, 'their wallet does not exist as far as this reader is concerned');
  assert.doesNotMatch(res.body.error, /403|forbidden/i);

  const read = await get(mine, `/api/wallets/${theirs.walletIds[0]}/history`);
  assert.equal(read.status, 404);

  const edit = await patch(mine, `/api/wallets/${theirs.walletIds[0]}`, { name: 'Mine now' });
  assert.equal(edit.status, 404);

  assert.equal(await balanceOf(mine, myBank), 0, 'and nothing moved');
});

test('a wallet is archived, never deleted, and the default one cannot go while it is the only place entries go', async () => {
  const who = await withMoney('Archive', { income: '100.00' });
  const extra = await post(who, '/api/wallets', { name: 'Savings jar', kind: 'cash' });
  assert.equal(extra.status, 201);

  const defaultWallet = (await get(who, '/api/wallets')).body.defaultId;
  const refused = await del(who, `/api/wallets/${defaultWallet}`);
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /default/i);

  const removed = await del(who, `/api/wallets/${extra.body.wallet.id}`);
  assert.equal(removed.status, 200);
  const active = (await get(who, '/api/wallets')).body.wallets;
  assert.equal(active.length, 3, 'an archived wallet leaves the list');
  assert.equal(
    (await get(who, '/api/wallets?archived=1')).body.wallets.length,
    4,
    'and is still there when you ask for it: a transaction that points at it must resolve'
  );
});

test('two wallets cannot share a name, and a bad amount is refused by name', async () => {
  const who = await session('Names');
  const dupe = await post(who, '/api/wallets', { name: 'Cash', kind: 'cash' });
  assert.equal(dupe.status, 400);
  assert.match(dupe.body.error, /already have/i);

  const nameless = await post(who, '/api/wallets', { name: '   ', kind: 'cash' });
  assert.equal(nameless.status, 400);

  const badKind = await post(who, '/api/wallets', { name: 'Gold', kind: 'gold' });
  assert.equal(badKind.status, 400);
  assert.match(badKind.body.error, /cash|bank|mobile/i);

  const account = await post(who, '/api/wallets', { name: 'Bank', kind: 'bank', hint: '12345678' });
  assert.equal(account.status, 201, account.text);
  assert.equal(account.body.wallet.hint, '1234', 'a hint is a nickname: the last four digits, never more');
});

test('a first wallet added by hand becomes the default, and there is only ever one', async () => {
  const who = await session('Defaults');
  const before = (await get(who, '/api/wallets')).body;
  const second = await post(who, '/api/wallets', { name: 'Post office', kind: 'bank' });
  assert.equal(second.status, 201);
  const after = (await get(who, '/api/wallets')).body;
  assert.equal(after.defaultId, before.defaultId, 'the first wallet is still the default');
  assert.equal(after.wallets.filter((w) => w.isDefault).length, 1);

  const moved = await patch(who, `/api/wallets/${second.body.wallet.id}`, { isDefault: true });
  assert.equal(moved.status, 200, moved.text);
  const final = (await get(who, '/api/wallets')).body;
  assert.equal(final.defaultId, second.body.wallet.id);
  assert.equal(final.wallets.filter((w) => w.isDefault).length, 1, 'making one the default takes it from whoever had it');
});

/* ============================== the dashboard ============================= */

test('the balances endpoint answers for the month, and counts what has not been filed', async () => {
  const who = await withMoney('Balances', { income: '800.00', expense: '120.00' });
  // one entry with no wallet on it, the way everything logged before this looks
  await post(who, '/api/transactions', {
    type: 'expense',
    amount: '60.00',
    description: 'Bus',
    date: '2026-09-06',
    categoryId: FOOD,
  });

  const res = await get(who, '/api/wallets/balances?month=2026-09');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.wallets.length, 3);
  assert.equal(res.body.unfiled, 1, 'the screen is told there is an entry with no pocket, rather than guessing one');
  const cash = res.body.wallets.find((w) => w.kind === 'cash');
  assert.equal(cash.monthIncome, 800);
  assert.equal(cash.monthExpense, 120);
  assert.equal(cash.balance, 680);
});
