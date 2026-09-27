import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, registerStudent, withCsrf } from './helpers.js';
import groupsRoutes from '../src/routes/groups.js';
import groupLedgerRoutes from '../src/routes/groupLedger.js';
import GroupAccount from '../src/models/GroupAccount.js';
import GroupJournalEntry from '../src/models/GroupJournalEntry.js';
import GroupReconcile from '../src/models/GroupReconcile.js';

/**
 * The group's own books: GRP-3 the general journal, GRP-5 the trial balance,
 * GRP-7 the bank reconciliation.
 *
 * The harness is the one from groupChat.test.js — an in-memory database, real
 * sign-ups, real sessions, the CSRF header on every write. The groups router is
 * mounted the way that suite mounts it, and the ledger router the way app.js
 * mounts the chat, so this file stands on its own without app.js having heard
 * of it: the layer goes in front of the /api 404 layer, which leaves the app's
 * own error handler behind it.
 */

let ctx;

test.before(async () => {
  ctx = await startApp();
  // The seed is guarded by a unique index, and the race test below depends on
  // that index existing before the first request rather than after it.
  await Promise.all([GroupAccount.init(), GroupJournalEntry.init(), GroupReconcile.init()]);
  mountGroups(ctx.app);
  mountLedger(ctx.app);
});

test.after(async () => {
  await ctx.stop();
});

/** The groups router is mounted by src/app.js; mount it only if it is not. */
function mountGroups(app) {
  const stack = app._router.stack;
  const mounted = stack.some(
    (layer) => layer.name === 'router' && String(layer.regexp?.source).includes('api\\/groups')
  );
  if (mounted) return;

  app.use('/api/groups', groupsRoutes);
  const layer = stack.pop();
  const beforeStatic = stack.findIndex((row) => row.name === 'serveStatic');
  stack.splice(beforeStatic === -1 ? stack.length : beforeStatic, 0, layer);
}

/** The ledger hangs off the group, so it inherits the group's isolation. */
function mountLedger(app) {
  const stack = app._router || app.router;
  if (!stack) throw new Error('cannot find the express router stack');

  app.use('/api/groups/:id/ledger', groupLedgerRoutes);
  const layer = stack.stack.pop();
  const before = stack.stack.findIndex((l) => l.handle && l.handle.name === 'notFound');
  stack.stack.splice(before === -1 ? stack.stack.length : before, 0, layer);
}

/* -------------------------------- fixtures --------------------------------- */

async function session(payload) {
  const agent = ctx.newAgent();
  const account = await registerStudent(agent, payload);
  return { agent, user: account.user, csrf: account.csrf, password: account.password };
}

async function createGroup(who, { name = 'Room 204', currency = 'USD', members = [] } = {}) {
  const res = await withCsrf(who, who.agent.post('/api/groups')).send({ name, currency, members });
  assert.equal(res.status, 201, res.text);
  return res.body.group;
}

/** A group with one signed-in roommate, so the roles below have somebody to be. */
async function withRoommate(label = 'room') {
  const owner = await session({ name: 'Aisha' });
  const email = addr(label);
  const group = await createGroup(owner, { members: [{ name: 'Bilal', email }] });
  const roommate = await session({ name: 'Bilal', email });
  const setRole = (index, role) =>
    withCsrf(owner, owner.agent.patch(`/api/groups/${group.id}/members/${index}/role`)).send({ role });
  return { owner, roommate, group, setRole };
}

const ledger = (groupId, tail = '') => `/api/groups/${groupId}/ledger${tail}`;

function journal(who, groupId, query = '') {
  return who.agent.get(ledger(groupId, `/journal${query}`));
}

function trialBalance(who, groupId) {
  return who.agent.get(ledger(groupId, '/trial-balance'));
}

function post(who, groupId, body = {}) {
  return withCsrf(who, who.agent.post(ledger(groupId, '/journal'))).send({
    date: '2026-09-10',
    memo: 'chai for the society fund',
    lines: [
      { code: '5000', debit: '25.00' },
      { code: '1000', credit: '25.00' },
    ],
    ...body,
  });
}

const reconcile = (who, groupId) => who.agent.get(ledger(groupId, '/reconcile'));
const startReconcile = (who, groupId, body) =>
  withCsrf(who, who.agent.post(ledger(groupId, '/reconcile'))).send(body);
const classify = (who, groupId, sessionId, key, body) =>
  withCsrf(who, who.agent.patch(ledger(groupId, `/reconcile/${sessionId}/lines/${key}`))).send(body);
const markOut = (who, groupId, sessionId, lineId, body) =>
  withCsrf(who, who.agent.patch(ledger(groupId, `/reconcile/${sessionId}/book/${lineId}`))).send(body);
const closeSession = (who, groupId, sessionId) =>
  withCsrf(who, who.agent.post(ledger(groupId, `/reconcile/${sessionId}/close`))).send({});

/** The chart, the way a page would fetch it, so the codes are never re-typed. */
async function chartOf(who, groupId) {
  const res = await journal(who, groupId);
  assert.equal(res.status, 200, res.text);
  return res.body.accounts;
}

const cents = (n) => Math.round(n * 100);
const sum = (rows, key) => rows.reduce((total, row) => total + cents(row[key]), 0);
const oid = (id) => new mongoose.Types.ObjectId(id);
let seq = 0;
const addr = (label) => `${label}-${Date.now().toString(36)}-${(seq += 1)}@test.local`;

/* ============================== the chart (GRP-3) =========================== */

test('the chart is seeded on first use, and a race cannot seed it twice', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);
  assert.equal(await GroupAccount.countDocuments({ group: oid(group.id) }), 0, 'a new group has no books yet');

  // Ten first opens at once. Each finds nothing, each tries to insert the
  // eleven rows, and the unique index on {group, code} refuses all but one.
  const opens = await Promise.all(
    Array.from({ length: 10 }, () => Promise.all([journal(owner, group.id), trialBalance(owner, group.id)]))
  );
  for (const pair of opens) {
    assert.equal(pair[0].status, 200, pair[0].text);
    assert.equal(pair[1].status, 200, pair[1].text);
  }

  const accounts = await chartOf(owner, group.id);
  assert.equal(accounts.length, 12, 'the seeded accounts, once');
  assert.deepEqual(
    accounts.map((row) => [row.code, row.name, row.type]),
    [
      ['1000', 'Cash in hand', 'asset'],
      ['1010', 'Bank account', 'asset'],
      ['1100', 'Receivable from members', 'asset'],
      ['2000', 'Payable to members', 'liability'],
      ['3000', 'Group fund', 'equity'],
      ['4000', 'Income', 'income'],
      ['5000', 'Food & drinks', 'expense'],
      ['5010', 'Transport', 'expense'],
      ['5020', 'Rent & bills', 'expense'],
      ['5030', 'Utilities', 'expense'],
      ['5040', 'Supplies', 'expense'],
      ['5090', 'Other expenses', 'expense'],
    ]
  );
  assert.ok(
    accounts.every((row) => row.system === true),
    'every seeded row is marked as the system’s own'
  );
  assert.equal(await GroupAccount.countDocuments({ group: oid(group.id) }), 12, 'and the collection agrees');

  // The other two reads also leave the chart alone.
  await reconcile(owner, group.id);
  assert.equal(await GroupAccount.countDocuments({ group: oid(group.id) }), 12);
});

/* ============================ posting an entry ============================= */

test('a balanced entry posts as J-0001, and the next one as J-0002', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);

  const first = await post(owner, group.id);
  assert.equal(first.status, 201, first.text);
  const entry = first.body.entry;
  assert.equal(entry.ref, 'J-0001', 'the server numbers it');
  assert.equal(entry.memo, 'chai for the society fund');
  assert.match(entry.date, /^2026-09-10/);
  assert.equal(entry.source, 'manual');
  assert.equal(entry.sourceRef, null);
  assert.equal(entry.by.index, 0);
  assert.equal(entry.isYou, true);
  assert.deepEqual(
    entry.lines.map((line) => [line.code, line.name, line.side, line.debit, line.credit]),
    [
      ['5000', 'Food & drinks', 'debit', 25, 0],
      ['1000', 'Cash in hand', 'credit', 0, 25],
    ]
  );
  assert.equal(entry.debits, 25, 'the header carries both columns');
  assert.equal(entry.credits, 25);
  assert.equal(entry.flag, null);
  assert.ok(entry.createdAt);

  const second = await post(owner, group.id, { memo: 'bus fare home', lines: [{ code: '5010', debit: '2.50' }, { code: '1000', credit: '2.50' }] });
  assert.equal(second.body.entry.ref, 'J-0002');

  const page = await journal(owner, group.id);
  assert.equal(page.body.rows.length, 2);
  assert.equal(page.body.rows[0].ref, 'J-0002', 'newest first');
  assert.equal(page.body.rows[1].ref, 'J-0001');

  // A page can be asked for, and the page before is the oldest row’s own id, so
  // two entries on one day cannot be served twice.
  const one = await journal(owner, group.id, '?limit=1');
  assert.equal(one.body.rows.length, 1);
  assert.equal(one.body.rows[0].ref, 'J-0002');
  assert.equal(one.body.nextCursor, one.body.rows[0].id);
  const back = await journal(owner, group.id, `?limit=1&before=${one.body.nextCursor}`);
  assert.deepEqual(back.body.rows.map((row) => row.ref), ['J-0001']);
  assert.equal(back.body.nextCursor, null, 'the end of the journal says so');
  assert.equal((await journal(owner, group.id, '?limit=1000')).status, 200, 'a silly limit is capped, not refused');
  assert.equal((await journal(owner, group.id, '?limit=0')).status, 400);
  assert.equal((await journal(owner, group.id, '?before=yesterday')).status, 400);
  assert.equal((await journal(owner, group.id, '?before=2026-09-11')).status, 200);
});

test('an unbalanced entry is refused, and nothing is written', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);

  const bad = [
    { why: 'a cent short on the credit', lines: [{ code: '5000', debit: '25.00' }, { code: '1000', credit: '24.99' }] },
    { why: 'a cent over on the credit', lines: [{ code: '5000', debit: '25.00' }, { code: '1000', credit: '25.01' }] },
    { why: 'a cent over on the debit', lines: [{ code: '5000', debit: '25.01' }, { code: '1000', credit: '25.00' }] },
    {
      why: 'the last line out by a cent',
      lines: [
        { code: '5000', debit: '10.00' },
        { code: '1000', credit: '10.00' },
        { code: '5090', debit: '0.01' },
      ],
    },
    { why: 'a single line', lines: [{ code: '5000', debit: '25.00' }] },
    { why: 'no lines at all', lines: [] },
    { why: 'lines that are not a list', lines: 'two lines please' },
    {
      why: 'one line carrying both sides',
      lines: [
        { code: '5000', debit: '25.00', credit: '25.00' },
        { code: '1000', credit: '25.00' },
      ],
    },
  ];

  for (const attempt of bad) {
    const res = await post(owner, group.id, attempt);
    assert.equal(res.status, 400, `${attempt.why} — expected a refusal, got ${res.status}`);
    assert.ok(res.body.error, `${attempt.why} — and a sentence the student can read`);
  }

  // The refusals named the gap and the offending line, rather than just "no".
  const oneCent = await post(owner, group.id, {
    lines: [{ code: '5000', debit: '25.00' }, { code: '1000', credit: '24.99' }],
  });
  assert.match(oneCent.body.error, /0\.01/, 'the difference is named');
  assert.match(oneCent.body.error, /balance/i);
  const both = await post(owner, group.id, {
    lines: [{ code: '5000', debit: '25.00', credit: '25.00' }, { code: '1000', credit: '25.00' }],
  });
  assert.match(both.body.error, /line 1/i, 'and the line at fault is named, not quietly netted');
  assert.match(both.body.error, /one side only/i);

  assert.equal(await GroupJournalEntry.countDocuments({ group: oid(group.id) }), 0, 'not one of them was stored');
  assert.deepEqual((await journal(owner, group.id)).body.rows, []);
});

test('an amount that is not money is refused, by name', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);

  for (const amount of ['12.345', 'abc', -5, 0, '1,000.00', '1e3', '', null, {}, '25.00.00']) {
    const res = await post(owner, group.id, { lines: [{ code: '5000', debit: amount }, { code: '1000', credit: '25.00' }] });
    assert.equal(res.status, 400, `expected ${JSON.stringify(amount)} to be refused`);
    assert.ok(res.body.error, 'and a sentence');
  }
  // A line with no amount on either side is refused too — a zero is not money.
  const empty = await post(owner, group.id, { lines: [{ code: '5000', debit: '0' }, { code: '1000', credit: '0' }] });
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /line 1/i);

  assert.equal(await GroupJournalEntry.countDocuments({ group: oid(group.id) }), 0);

  // Twenty lines is the ceiling, and the memo has to say something.
  const twenty = Array.from({ length: 19 }, () => ({ code: '5000', debit: '1.00' })).concat({ code: '1000', credit: '19.00' });
  assert.equal((await post(owner, group.id, { lines: twenty })).status, 201);
  assert.equal((await post(owner, group.id, { lines: [...twenty, { code: '5090', debit: '1.00' }, { code: '1000', credit: '2.00' }] })).status, 400);
  assert.equal((await post(owner, group.id, { memo: '   ' })).status, 400);
  assert.equal((await post(owner, group.id, { date: 'the 10th' })).status, 400);
});

test('an account code from another group cannot be reached', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, { name: 'Room 204' });
  const other = await createGroup(owner, { name: 'Room 7' });

  // A second group with an account of its own that the first group does not have.
  await GroupAccount.create({ group: oid(other.id), code: '1200', name: 'Advance to a member', type: 'asset' });

  const crossed = await post(owner, group.id, { lines: [{ code: '1200', debit: '10.00' }, { code: '1000', credit: '10.00' }] });
  assert.equal(crossed.status, 400);
  assert.match(crossed.body.error, /not in this group/i, 'and it says whose books it means');

  const missing = await post(owner, group.id, { lines: [{ code: '9999', debit: '10.00' }, { code: '1000', credit: '10.00' }] });
  assert.equal(missing.status, 400);
  const notACode = await post(owner, group.id, { lines: [{ code: 'Bank', debit: '10.00' }, { code: '1000', credit: '10.00' }] });
  assert.equal(notACode.status, 400);
  assert.match(notACode.body.error, /four digits/i);

  assert.equal(await GroupJournalEntry.countDocuments({ group: oid(group.id) }), 0, 'and nothing crossed over');
});

test('the books work in the group’s own currency, and in another group’s', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, { name: 'Room 204', currency: 'USD' });
  const rupees = await createGroup(owner, { name: 'Room 7', currency: 'PKR' });

  const there = await post(owner, group.id);
  const here = await post(owner, rupees.id, {
    memo: 'chai, karachi prices',
    lines: [{ code: '5000', debit: '250.00' }, { code: '1000', credit: '250.00' }],
  });
  assert.equal(there.status, 201, there.text);
  assert.equal(here.status, 201, here.text);

  const usd = await trialBalance(owner, group.id);
  const pkr = await trialBalance(owner, rupees.id);
  assert.equal(usd.body.group.currency, 'USD');
  assert.equal(pkr.body.group.currency, 'PKR');
  assert.equal(usd.body.balanced, true);
  assert.equal(pkr.body.balanced, true);
  assert.equal(usd.body.totals.debits, 25);
  assert.equal(pkr.body.totals.debits, 250, 'no rate anywhere: each group is kept in its own money');

  // 33.33 three times over, which is the number that drifts in a float.
  for (let i = 0; i < 3; i += 1) {
    const res = await post(owner, group.id, {
      memo: `third of a bill ${i}`,
      lines: [{ code: '5000', debit: '33.33' }, { code: '4000', credit: '33.33' }],
    });
    assert.equal(res.status, 201, res.text);
  }
  const drift = await trialBalance(owner, group.id);
  assert.equal(drift.body.balanced, true);
  assert.equal(sum(drift.body.rows, 'debits'), 12499, '25.00 + 33.33 x 3, to the cent');
  assert.equal(drift.body.rows.find((row) => row.code === '4000').credits, 99.99, 'not 99.98999999999999');
  assert.equal(drift.body.rows.find((row) => row.code === '5000').balance, 124.99, 'nor 124.98999999999999');
  assert.equal(drift.body.rows.find((row) => row.code === '1000').balance, -25);
});

/* ========================== the trial balance (GRP-5) ======================= */

test('the trial balance lists every account, both columns, and its totals are the journal', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);

  await post(owner, group.id, { lines: [{ code: '1010', debit: '500.00' }, { code: '4000', credit: '500.00' }] });
  await post(owner, group.id, { lines: [{ code: '5000', debit: '40.00' }, { code: '1010', credit: '40.00' }] });
  await post(owner, group.id, { lines: [{ code: '1000', debit: '20.00' }, { code: '2000', credit: '20.00' }] });

  const res = await trialBalance(owner, group.id);
  assert.equal(res.status, 200, res.text);
  const rows = res.body.rows;
  assert.equal(rows.length, 12, 'every account, including the ones nobody has touched');

  const byCode = new Map(rows.map((row) => [row.code, row]));
  assert.deepEqual(
    rows.filter((row) => row.debits === 0 && row.credits === 0).map((row) => row.code),
    ['1100', '3000', '5010', '5020', '5030', '5040', '5090'],
    'an account with no movement is still listed, with zeros'
  );

  assert.deepEqual(byCode.get('1010'), {
    code: '1010', name: 'Bank account', type: 'asset', system: true,
    debits: 500, credits: 40, balance: 460, side: 'debit',
  });
  assert.equal(byCode.get('5000').balance, 40);
  assert.equal(byCode.get('5000').side, 'debit', 'an expense reads on the debit side');
  assert.equal(byCode.get('4000').balance, -500);
  assert.equal(byCode.get('4000').side, 'credit', 'and income on the credit side');
  assert.equal(byCode.get('1000').balance, 20);
  assert.equal(byCode.get('2000').balance, -20);
  assert.equal(byCode.get('2000').side, 'credit');
  assert.equal(byCode.get('1100').side, 'debit');

  assert.equal(res.body.balanced, true);
  assert.equal(res.body.totals.debits, res.body.totals.credits, 'the two columns are equal');
  // the columns AS PRESENTED: 460 on the bank account (its two lines net to one
  // figure), 40 on the food, 20 in cash — which is the whole point of a trial
  // balance being a net per account
  assert.equal(res.body.totals.debits, 520);
  assert.equal(res.body.totals.credits, 520);
  assert.equal(sum(rows, 'debits'), 56000, 'and the journal underneath carries 500 + 40 + 20');
  assert.equal(sum(rows, 'debits'), sum(rows, 'credits'), 'the columns add up to what the page shows');

  // The split board comes along for comparison, and is not part of the ledger.
  assert.deepEqual(res.body.context, {
    bills: { count: 0, total: 0 },
    settlements: { count: 0, total: 0 },
  });
  const bill = await withCsrf(owner, owner.agent.post(`/api/groups/${group.id}/expenses`)).send({
    title: 'Mess bill', amount: '100.00', date: '2026-09-10', splitType: 'equal', paidByIndex: 0,
  });
  assert.equal(bill.status, 201, bill.text);
  const withBill = await trialBalance(owner, group.id);
  assert.deepEqual(withBill.body.context.bills, { count: 1, total: 100 });
  assert.equal(withBill.body.totals.debits, 520, 'a bill is not money in the ledger until somebody posts it');
});

test('the trial balance reports an imbalance rather than hiding it', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);
  const accounts = await chartOf(owner, group.id);
  const bank = accounts.find((row) => row.code === '1010');
  const income = accounts.find((row) => row.code === '4000');

  // THE ONLY WAY TO MAKE THIS HAPPEN. No call in the service will write an
  // unbalanced entry — that is the whole rule — so the row is put straight into
  // the collection. It is the shape a bad restore from a backup leaves behind,
  // and a trial balance that cannot report it is a decoration.
  await GroupJournalEntry.collection.insertOne({
    group: oid(group.id),
    ref: 'J-0001',
    date: new Date('2026-09-01T00:00:00.000Z'),
    memo: 'written by hand, and a cent out',
    lines: [
      { account: oid(bank.id), debit: mongoose.Types.Decimal128.fromString('100.00'), credit: null },
      { account: oid(income.id), debit: null, credit: mongoose.Types.Decimal128.fromString('99.99') },
    ],
    source: 'manual',
    sourceRef: null,
    by: 0,
    createdBy: oid(owner.user.id),
  });

  const res = await trialBalance(owner, group.id);
  assert.equal(res.body.balanced, false, 'and the page is told, in a word');
  assert.equal(res.body.totals.debits, 100);
  assert.equal(res.body.totals.credits, 99.99, 'with both columns, so the gap can be seen');
  assert.equal(cents(res.body.totals.debits) - cents(res.body.totals.credits), 1, 'a cent out, to the cent');
  assert.equal(res.body.rows.find((row) => row.code === '1010').balance, 100);

  // And nothing else in the module pretends it is fine.
  const posted = await post(owner, group.id, { lines: [{ code: '5000', debit: '5.00' }, { code: '1000', credit: '5.00' }] });
  assert.equal(posted.status, 201, 'the next real entry is still J-0002, beside the broken row');
  assert.equal(posted.body.entry.ref, 'J-0002');
});

/* ============================== the correction ============================= */

test('a reversal leaves the original alone, posts the mirror, and puts the books back', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);

  const first = await post(owner, group.id, {
    date: '2026-09-10',
    memo: 'chai, counted wrong',
    lines: [{ code: '5000', debit: '33.33' }, { code: '1000', credit: '33.33' }],
  });
  const original = first.body.entry;
  const before = await trialBalance(owner, group.id);
  const cashBefore = before.body.rows.find((row) => row.code === '1000');
  const foodBefore = before.body.rows.find((row) => row.code === '5000');
  assert.deepEqual([cashBefore.balance, foodBefore.balance], [-33.33, 33.33], 'one entry, two sides');

  const reversed = await withCsrf(owner, owner.agent.post(ledger(group.id, `/journal/${original.id}/reverse`))).send({});
  assert.equal(reversed.status, 201, reversed.text);
  const mirror = reversed.body.entry;
  assert.equal(mirror.ref, 'J-0002');
  assert.match(mirror.date, /^2026-09-10/, 'same day, unless the treasurer says otherwise');
  assert.match(mirror.memo, /reversal/i, 'the memo says what this is');
  assert.match(mirror.memo, /J-0001/, 'and names the entry it undoes');
  assert.deepEqual(
    mirror.lines.map((line) => [line.code, line.side, line.debit, line.credit]),
    [
      ['5000', 'credit', 0, 33.33],
      ['1000', 'debit', 33.33, 0],
    ],
    'every debit becomes a credit of the same amount, and the other way round'
  );
  assert.equal(mirror.debits, mirror.credits);

  // The original is exactly as it was posted — there is no edit anywhere.
  const page = await journal(owner, group.id);
  const still = page.body.rows.find((row) => row.id === original.id);
  assert.deepEqual(still, original, 'not one field of it moved');
  assert.equal(page.body.rows.length, 2, 'and the correction is a second entry, beside it');

  const after = await trialBalance(owner, group.id);
  assert.equal(after.body.balanced, true);
  assert.ok(
    after.body.rows.every((row) => row.balance === 0),
    'the books are back to empty — the two entries together move nothing'
  );
  assert.equal(sum(after.body.rows, 'debits'), 6666, 'and both entries are still in the journal');

  // A reversal may be dated, and a reversal of a correction is a correction too.
  const second = await post(owner, group.id, {
    date: '2026-09-12',
    memo: 'bus fare',
    lines: [{ code: '5010', debit: '10.00' }, { code: '1000', credit: '10.00' }],
  });
  const dated = await withCsrf(
    owner,
    owner.agent.post(ledger(group.id, `/journal/${second.body.entry.id}/reverse`))
  ).send({ date: '2026-09-30' });
  assert.equal(dated.status, 201, dated.text);
  assert.match(dated.body.entry.date, /^2026-09-30/);

  const closed = await trialBalance(owner, group.id);
  assert.equal(closed.body.balanced, true);
  assert.equal(sum(closed.body.rows, 'balance'), 0, 'four entries and nothing left in any account');
  // Any entry may be reversed, including a reversal — the books keep every one
  // of them, so there is nothing to undo about the undo.
  assert.equal((await withCsrf(owner, owner.agent.post(ledger(group.id, '/journal/not-an-id/reverse'))).send({})).status, 404);
});

/* =============================== who may see it ============================ */

test('a stranger gets a 404 on every read and every write, never a 403', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);
  const entry = (await post(owner, group.id)).body.entry;
  const stranger = await session({ name: 'Noor' });
  const strangerGroup = await createGroup(stranger, { name: 'Room 9' });

  const writes = [
    stranger.agent.get(ledger(group.id, '/journal')),
    stranger.agent.get(ledger(group.id, '/trial-balance')),
    stranger.agent.get(ledger(group.id, '/reconcile')),
    withCsrf(stranger, stranger.agent.post(ledger(group.id, '/journal'))).send({}),
    withCsrf(stranger, stranger.agent.post(ledger(group.id, `/journal/${entry.id}/reverse`))).send({}),
    withCsrf(stranger, stranger.agent.post(ledger(group.id, `/journal/${entry.id}/flag`))).send({ reason: 'hmm' }),
    withCsrf(stranger, stranger.agent.post(ledger(group.id, `/journal/${entry.id}/flag/clear`))).send({ note: 'ok' }),
    withCsrf(stranger, stranger.agent.post(ledger(group.id, '/reconcile'))).send({ accountCode: '1010' }),
    withCsrf(stranger, stranger.agent.patch(ledger(group.id, '/reconcile/000000000000000000000000/lines/S1'))).send({ as: 'open' }),
    withCsrf(stranger, stranger.agent.patch(ledger(group.id, '/reconcile/000000000000000000000000/book/000000000000000000000000'))).send({ outstanding: true }),
    withCsrf(stranger, stranger.agent.post(ledger(group.id, '/reconcile/000000000000000000000000/close'))).send({}),
  ];

  for (const res of await Promise.all(writes)) {
    assert.equal(res.status, 404, `expected a 404, got ${res.status} ${res.text}`);
  }
  assert.equal(
    (await stranger.agent.get(ledger(strangerGroup.id, '/journal'))).status,
    200,
    'their own group still works'
  );
  assert.equal((await stranger.agent.get(ledger('not-an-id', '/journal'))).status, 404);
  assert.equal((await stranger.agent.get(ledger('000000000000000000000000', '/trial-balance'))).status, 404);
  assert.equal(await GroupJournalEntry.countDocuments({ group: oid(group.id) }), 1, 'and nothing was written');
  assert.equal(await GroupReconcile.countDocuments({ group: oid(group.id) }), 0);
});

test('a plain member can read the books and is refused a post, in the module’s own words', async () => {
  const { owner, roommate, group } = await withRoommate();

  const read = await journal(roommate, group.id);
  assert.equal(read.status, 200, read.text);
  assert.equal((await trialBalance(roommate, group.id)).status, 200);
  assert.equal((await reconcile(roommate, group.id)).status, 200);

  const refused = await post(roommate, group.id);
  assert.equal(refused.status, 403);
  // the sentence comes from requireCapability, not from this module
  assert.match(refused.body.error, /You are a member in this group/);
  assert.match(refused.body.error, /cannot post journal entries/);
  assert.match(refused.body.error, /ask the group owner or the treasurer/);
  assert.equal(await GroupJournalEntry.countDocuments({ group: oid(group.id) }), 0);

  const refusedReconcile = await startReconcile(roommate, group.id, { accountCode: '1010' });
  assert.equal(refusedReconcile.status, 403);
  assert.match(refusedReconcile.body.error, /cannot reconcile/);
  assert.equal(await GroupReconcile.countDocuments({ group: oid(group.id) }), 0);
  assert.equal((await post(owner, group.id)).status, 201, 'and the owner can');
});

test('a treasurer posts; an auditor can flag an entry and cannot post one', async () => {
  const { owner, roommate, group, setRole } = await withRoommate();
  assert.equal((await setRole(1, 'treasurer')).status, 200);

  const posted = await post(roommate, group.id);
  assert.equal(posted.status, 201, posted.text);
  assert.equal(posted.body.entry.by.index, 1);
  assert.equal(posted.body.entry.by.name, 'Bilal');
  assert.equal(posted.body.entry.isYou, true);

  const seen = await journal(owner, group.id);
  const entry = seen.body.rows[0];
  assert.equal(entry.isYou, false, 'the owner can tell it is not their own entry');
  assert.equal(entry.by.name, 'Bilal');

  // and the auditor
  assert.equal((await setRole(1, 'auditor')).status, 200);
  const cannotPost = await post(roommate, group.id);
  assert.equal(cannotPost.status, 403);
  assert.match(cannotPost.body.error, /auditor in this group/);
  assert.match(cannotPost.body.error, /cannot post journal entries/);
  assert.equal(await GroupJournalEntry.countDocuments({ group: oid(group.id) }), 1, 'nothing was written');

  const flagged = await withCsrf(roommate, roommate.agent.post(ledger(group.id, `/journal/${entry.id}/flag`))).send({
    reason: 'this is the society’s money, not ours',
  });
  assert.equal(flagged.status, 201, flagged.text);
  assert.equal(flagged.body.entry.flag.reason, 'this is the society’s money, not ours');
  assert.equal(flagged.body.entry.flag.byName, 'Bilal');
  assert.equal(flagged.body.entry.flag.open, true);
  assert.ok(flagged.body.entry.flag.at);

  // a flag changes no money
  assert.equal(sum((await trialBalance(owner, group.id)).body.rows, 'balance'), 0, 'the entry still stands as posted');
  assert.equal((await withCsrf(roommate, roommate.agent.post(ledger(group.id, `/journal/${entry.id}/flag`))).send({ reason: 'x' })).status, 400);
  assert.equal((await withCsrf(owner, owner.agent.post(ledger(group.id, `/journal/${entry.id}/flag/clear`))).send({ note: 'agreed, it is' })).status, 200);

  const cleared = await journal(owner, group.id);
  assert.equal(cleared.body.rows[0].flag.open, false);
  assert.equal(cleared.body.rows[0].flag.resolution, 'agreed, it is');
  assert.equal((await withCsrf(roommate, roommate.agent.post(ledger(group.id, '/journal/not-an-id/flag'))).send({ reason: 'hmm' })).status, 404);
});

/* ========================== the reconciliation (GRP-7) ====================== */

test('a reconciliation matches what it can, counts the rest, and closes only when the bank agrees', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);

  // The books know about the room fund going in, and nothing else.
  await post(owner, group.id, {
    date: '2026-09-10',
    memo: 'room fund in',
    lines: [{ code: '1010', debit: '500.00' }, { code: '4000', credit: '500.00' }],
  });

  const none = await reconcile(owner, group.id);
  assert.equal(none.status, 200, none.text);
  assert.equal(none.body.session, null, 'no session, so nothing to show');
  assert.equal(none.body.accounts.length, 12);

  const started = await startReconcile(owner, group.id, {
    accountCode: '1010',
    statementDate: '2026-09-30',
    statementBalance: '460.00',
    lines: [
      { date: '2026-09-10', description: 'Room fund in', amount: '500.00' },
      { date: '2026-09-12', description: 'Wifi bill', amount: '-40.00' },
      { date: '2026-09-14', description: 'Transfer from a housemate', amount: '-15.00' },
    ],
  });
  assert.equal(started.status, 201, started.text);
  assert.equal(started.body.matched, 1, 'the same amount, the same day — the books already had that one');

  const view = started.body.session;
  assert.equal(view.status, 'draft');
  assert.equal(view.account.code, '1010');
  assert.deepEqual(view.counts, { matched: 1, toBook: 0, ignored: 0, open: 2, outstanding: 0 });
  assert.deepEqual(view.totals, {
    bookBalance: 500, unbooked: 0, adjustedBook: 500, statementBalance: 460, difference: -40,
  });
  assert.equal(view.closeable, false);
  assert.match(view.reason, /2 statement lines still open/);
  assert.match(view.reason, /S2, S3/);
  assert.match(view.reason, /40\.00/, 'and the difference is named before anybody asks');
  assert.equal(view.ledger.items.length, 1);
  assert.deepEqual(
    view.ledger.items.map((item) => [item.ref, item.amount, item.side, item.matchedBy]),
    [['J-0001', 500, 'debit', 'S1']],
    'the book side says which statement line it is matched to'
  );
  assert.equal(view.statement.date, '2026-09-30');
  assert.equal(view.statement.balance, 460);
  assert.equal(view.statement.lines[0].as, 'matched');
  assert.ok(view.statement.lines[0].entryId);

  // Somebody else's money on a shared account: the line is written down, not dropped.
  const ignored = await classify(owner, group.id, view.id, 'S3', {
    as: 'ignore',
    reason: 'a housemate shares this account',
  });
  assert.equal(ignored.status, 200, ignored.text);
  assert.equal(ignored.body.session.counts.ignored, 1);
  assert.equal(ignored.body.session.statement.lines[2].reason, 'a housemate shares this account');
  assert.equal(
    (await classify(owner, group.id, view.id, 'S3', { as: 'ignore' })).status,
    400,
    'and it still needs a reason'
  );

  // Closing now would stamp a difference and call it explained.
  const tooSoon = await closeSession(owner, group.id, view.id);
  assert.equal(tooSoon.status, 409);
  assert.match(tooSoon.body.error, /still open/);
  assert.match(tooSoon.body.error, /S2/);
  assert.match(tooSoon.body.error, /40\.00/);

  // The wifi bill is the group's money and the books have not been told.
  const booked = await classify(owner, group.id, view.id, 'S2', { as: 'book', expenseCode: '5030' });
  assert.equal(booked.status, 200, booked.text);
  const after = booked.body.session;
  assert.deepEqual(after.counts, { matched: 1, toBook: 1, ignored: 1, open: 0, outstanding: 0 });
  assert.deepEqual(after.totals, {
    bookBalance: 460, unbooked: 0, adjustedBook: 460, statementBalance: 460, difference: 0,
  }, 'the books now say what the bank says');
  assert.equal(after.closeable, true);
  assert.equal(after.reason, '');

  // The entry it wrote is the right double entry, in the ledger like any other.
  const rows = (await journal(owner, group.id)).body.rows;
  const written = rows.find((row) => row.sourceRef === 'S2');
  assert.equal(written.source, 'reconcile');
  assert.equal(written.ref, 'J-0002');
  assert.match(written.date, /^2026-09-12/, 'dated the day the bank says');
  assert.deepEqual(
    written.lines.map((line) => [line.code, line.side, line.debit, line.credit]),
    [
      ['1010', 'credit', 0, 40],
      ['5030', 'debit', 40, 0],
    ]
  );

  const closed = await closeSession(owner, group.id, view.id);
  assert.equal(closed.status, 200, closed.text);
  assert.equal(closed.body.session.status, 'reconciled');
  assert.ok(closed.body.session.reconciledAt);

  assert.equal((await reconcile(owner, group.id)).body.session, null, 'and the workbench is cleared');
  assert.equal((await closeSession(owner, group.id, view.id)).status, 400, 'it cannot be closed twice');
  assert.equal(await GroupReconcile.countDocuments({ group: oid(group.id) }), 1);

  // One open session per group, and the database is what says so.
  const again = await startReconcile(owner, group.id, {
    accountCode: '1010', statementDate: '2026-10-31', statementBalance: '460.00',
    lines: [{ date: '2026-10-01', description: 'nothing', amount: '-1.00' }],
  });
  assert.equal(again.status, 201, again.text);
  const second = await startReconcile(owner, group.id, {
    accountCode: '1010', statementDate: '2026-10-31', statementBalance: '460.00',
    lines: [{ date: '2026-10-01', description: 'nothing', amount: '-1.00' }],
  });
  assert.equal(second.status, 409);
  assert.match(second.body.error, /already has an open reconciliation/);
  assert.equal(await GroupReconcile.countDocuments({ group: oid(group.id) }), 2, 'the second one was refused');
});

test('the statement lines are readable under either name, and a session survives being read back', async () => {
  const owner = await session({ name: 'Reader' });
  const group = await createGroup(owner);

  await post(owner, group.id, {
    date: '2026-09-10',
    memo: 'pot in',
    lines: [{ code: '1010', debit: '900.00' }, { code: '4000', credit: '900.00' }],
  });

  const started = await startReconcile(owner, group.id, {
    accountCode: '1010',
    statementDate: '2026-09-30',
    statementBalance: '855.00',
    lines: [
      { date: '2026-09-10', description: 'pot in', amount: '900.00' },
      { date: '2026-09-18', description: 'bottled water', amount: '-45.00' },
    ],
  });
  assert.equal(started.status, 201, started.text);
  assert.equal(started.body.matched, 1);

  // The array the answer carries, under both of the names a caller may use.
  const posted = started.body.session;
  assert.equal(posted.lines.length, 2, 'session.lines is there');
  assert.deepEqual(
    posted.lines.map((line) => line.key),
    posted.statement.lines.map((line) => line.key),
    'and it is the same lines as statement.lines, in the same order'
  );
  assert.deepEqual(posted.lines, posted.statement.lines, 'the very same figures, not a second copy');

  // And it is all still there after a fresh read, which is what a page reload is.
  const read = await reconcile(owner, group.id);
  assert.equal(read.status, 200, read.text);
  const reloaded = read.body.session;
  assert.equal(reloaded.lines.length, 2, 'the lines are not lost by being re-read');
  assert.equal(reloaded.statement.lines.length, 2, 'under the other name either');
  assert.deepEqual(
    reloaded.lines.map((line) => [line.key, line.description, line.amount, line.as]),
    posted.lines.map((line) => [line.key, line.description, line.amount, line.as]),
    'a session you come back to is the session you left'
  );
  assert.equal(reloaded.totals.bookBalance, 900);
  assert.equal(reloaded.totals.difference, -45, 'and the difference is still the truth');
  assert.equal(reloaded.closeable, false, 'so it cannot be closed behind your back');
  assert.match(reloaded.reason, /45\.00/);
});

test('a statement line booked by the reconciliation writes the right double entry both ways', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);
  await post(owner, group.id, { date: '2026-09-01', lines: [{ code: '1010', debit: '200.00' }, { code: '4000', credit: '200.00' }] });

  const started = await startReconcile(owner, group.id, {
    accountCode: '1010',
    statementDate: '2026-09-30',
    statementBalance: '260.00',
    lines: [
      { date: '2026-09-01', description: 'Room fund in', amount: '200.00' },
      { date: '2026-09-20', description: 'Contribution in', amount: '100.00' },
      { date: '2026-09-21', description: 'Drinks for the meeting', amount: '-40.00' },
    ],
  });
  assert.equal(started.status, 201, started.text);
  assert.equal(started.body.matched, 1, 'the September deposit is already in the books; the other two are not');
  const id = started.body.session.id;

  // money IN: the bank account is debited, and the other side is income.
  const deposit = await classify(owner, group.id, id, 'S2', { as: 'book', memo: 'Sana’s share' });
  assert.equal(deposit.status, 200, deposit.text);
  let rows = (await journal(owner, group.id)).body.rows;
  let written = rows.find((row) => row.sourceRef === 'S2');
  assert.equal(written.source, 'reconcile');
  assert.deepEqual(
    written.lines.map((line) => [line.code, line.side, line.debit, line.credit]),
    [['1010', 'debit', 100, 0], ['4000', 'credit', 0, 100]],
    'money in: debit the bank, credit income by default'
  );
  assert.equal(written.memo, 'Sana’s share');

  // money OUT: the bank account is credited, and the other side is an expense.
  const withdrawal = await classify(owner, group.id, id, 'S3', { as: 'book', expenseCode: '5000' });
  assert.equal(withdrawal.status, 200, withdrawal.text);
  rows = (await journal(owner, group.id)).body.rows;
  written = rows.find((row) => row.sourceRef === 'S3');
  assert.deepEqual(
    written.lines.map((line) => [line.code, line.side, line.debit, line.credit]),
    [['1010', 'credit', 0, 40], ['5000', 'debit', 40, 0]],
    'money out: credit the bank, debit the expense'
  );
  assert.equal(withdrawal.body.session.totals.bookBalance, 260, '200 + 100 − 40');
  assert.equal(withdrawal.body.session.totals.difference, 0);
  assert.equal(withdrawal.body.session.closeable, true);
  assert.equal((await closeSession(owner, group.id, id)).status, 200);

  // The other side has to be the right KIND of account, or nothing is posted.
  const other = await createGroup(owner, { name: 'Room 7' });
  const second = await startReconcile(owner, other.id, {
    accountCode: '1000',
    statementDate: '2026-09-30',
    statementBalance: '50.00',
    lines: [
      { date: '2026-09-20', description: 'Contribution in', amount: '100.00' },
      { date: '2026-09-21', description: 'Drinks', amount: '-40.00' },
    ],
  });
  const wrong = await classify(owner, other.id, second.body.session.id, 'S1', { as: 'book', expenseCode: '5000' });
  assert.equal(wrong.status, 400, 'an expense cannot be the other side of money coming in');
  assert.match(wrong.body.error, /5000/);
  assert.match(wrong.body.error, /income/);
  assert.equal(await GroupJournalEntry.countDocuments({ group: oid(other.id) }), 0, 'and nothing was posted');

  const otherWrong = await classify(owner, other.id, second.body.session.id, 'S2', { as: 'book', expenseCode: '4000' });
  assert.equal(otherWrong.status, 400, 'and income cannot be where the money went');
  assert.match(otherWrong.body.error, /expense/);
  // And the account itself has to be one a bank statement could be about.
  const notAnAsset = await startReconcile(owner, other.id, {
    accountCode: '4000', statementDate: '2026-09-30', statementBalance: '50.00',
    lines: [{ date: '2026-09-20', description: 'x', amount: '1.00' }],
  });
  assert.equal(notAnAsset.status, 400);
  assert.match(notAnAsset.body.error, /only an account that holds money/);
  const unknown = await startReconcile(owner, other.id, {
    accountCode: '1200', statementDate: '2026-09-30', statementBalance: '50.00',
    lines: [{ date: '2026-09-20', description: 'x', amount: '1.00' }],
  });
  assert.equal(unknown.status, 400);
});

test('a statement that is not money, or not a day, is refused before a session exists', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);

  const bad = [
    { what: 'no account', body: { statementDate: '2026-09-30', statementBalance: '1.00', lines: [{ date: '2026-09-01', amount: '1.00' }] } },
    { what: 'an account of another group', body: { accountCode: '1200', statementDate: '2026-09-30', statementBalance: '1.00', lines: [{ date: '2026-09-01', amount: '1.00' }] } },
    { what: 'a date that is not one', body: { accountCode: '1010', statementDate: '30-09-2026', statementBalance: '1.00', lines: [{ date: '2026-09-01', amount: '1.00' }] } },
    { what: 'a balance that is not money', body: { accountCode: '1010', statementDate: '2026-09-30', statementBalance: 'lots', lines: [{ date: '2026-09-01', amount: '1.00' }] } },
    { what: 'a balance with three decimals', body: { accountCode: '1010', statementDate: '2026-09-30', statementBalance: '1.005', lines: [{ date: '2026-09-01', amount: '1.00' }] } },
    { what: 'no lines', body: { accountCode: '1010', statementDate: '2026-09-30', statementBalance: '1.00', lines: [] } },
    { what: 'a line with no amount', body: { accountCode: '1010', statementDate: '2026-09-30', statementBalance: '1.00', lines: [{ date: '2026-09-01' }] } },
    { what: 'a line of nothing', body: { accountCode: '1010', statementDate: '2026-09-30', statementBalance: '1.00', lines: [{ date: '2026-09-01', amount: '0' }] } },
    { what: 'a line with no date', body: { accountCode: '1010', statementDate: '2026-09-30', statementBalance: '1.00', lines: [{ amount: '1.00' }] } },
    { what: 'a line with a long description', body: { accountCode: '1010', statementDate: '2026-09-30', statementBalance: '1.00', lines: [{ date: '2026-09-01', amount: '1.00', description: 'x'.repeat(121) }] } },
  ];
  for (const attempt of bad) {
    const res = await startReconcile(owner, group.id, attempt.body);
    assert.equal(res.status, 400, `${attempt.what} — expected a refusal, got ${res.status}`);
    assert.ok(res.body.error, `${attempt.what} — and a sentence`);
  }
  assert.equal(await GroupReconcile.countDocuments({ group: oid(group.id) }), 0, 'no workbench was left open');

  const open = await startReconcile(owner, group.id, {
    accountCode: '1010', statementDate: '2026-09-30', statementBalance: '1.00',
    lines: [{ date: '2026-09-01', description: 'x', amount: '1.00' }],
  });
  assert.equal(open.status, 201, open.text);
  assert.equal((await classify(owner, group.id, open.body.session.id, 'S9', { as: 'open' })).status, 404, 'a line that is not there');
  assert.equal((await classify(owner, group.id, open.body.session.id, 'S1', { as: 'maybe' })).status, 400);
  assert.equal((await classify(owner, group.id, open.body.session.id, 'S1', { outstanding: true })).status, 400);
  assert.equal((await markOut(owner, group.id, open.body.session.id, '000000000000000000000000', { outstanding: true })).status, 404);
  assert.equal((await markOut(owner, group.id, open.body.session.id, '000000000000000000000000', {})).status, 400, 'the payload is read before the line is looked up');
  assert.equal((await markOut(owner, group.id, open.body.session.id, 'not-an-id', { outstanding: true })).status, 404);
  assert.equal((await classify(owner, group.id, '000000000000000000000000', 'S1', { as: 'open' })).status, 404, 'and a session that is not this group’s is a 404');
});

test('a session cannot close with a line still open, and an outstanding book line is not a book line to explain', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);
  // A cheque the treasurer has paid but the bank has not shown yet.
  await post(owner, group.id, {
    date: '2026-09-01',
    memo: 'cheque 0042, not yet cleared',
    lines: [{ code: '1010', debit: '100.00' }, { code: '4000', credit: '100.00' }],
  });

  const started = await startReconcile(owner, group.id, {
    accountCode: '1010',
    statementDate: '2026-09-30',
    statementBalance: '100.00',
    lines: [{ date: '2026-09-05', description: 'A transfer from a housemate', amount: '-25.00' }],
  });
  const id = started.body.session.id;
  assert.equal(started.body.matched, 0);
  assert.deepEqual(started.body.session.counts, { matched: 0, toBook: 0, ignored: 0, open: 1, outstanding: 0 });
  assert.equal(started.body.session.totals.difference, 0, 'the bank and the books already agree on the money');

  await classify(owner, group.id, id, 'S1', { as: 'ignore', reason: 'a housemate shares this account' });
  const waiting = await classify(owner, group.id, id, 'S1', { as: 'open' });
  assert.equal(waiting.body.session.counts.open, 1, 'a line can be put back to open');
  assert.equal(waiting.body.session.counts.ignored, 0);

  const notYet = await closeSession(owner, group.id, id);
  assert.equal(notYet.status, 409, 'the difference is zero, and it still cannot close');
  assert.match(notYet.body.error, /1 statement line still open/);
  assert.match(notYet.body.error, /S1/);

  await classify(owner, group.id, id, 'S1', { as: 'ignore', reason: 'a housemate shares this account' });
  const unclassified = await closeSession(owner, group.id, id);
  assert.equal(unclassified.status, 409, 'now it is the book line that is unexplained');
  assert.match(unclassified.body.error, /book line/);
  assert.match(unclassified.body.error, /J-0001/);

  // The read is the same report the writes hand back, at the top level and
  // under `session`, so the page can read it either way.
  const view = await reconcile(owner, group.id);
  assert.equal(view.status, 200, view.text);
  assert.ok(view.body.session, view.text);
  assert.equal(view.body.session.id, view.body.id);
  const line = view.body.ledger.items[0];
  const moved = await markOut(owner, group.id, id, line.lineId, { outstanding: true });
  assert.equal(moved.status, 200, moved.text);
  assert.equal(moved.body.session.counts.outstanding, 1, 'the counts move');
  assert.equal(moved.body.session.totals.difference, 0, 'and the difference does not');
  assert.equal(moved.body.session.totals.bookBalance, 100, 'the money has not moved either');
  assert.equal(moved.body.session.closeable, true);
  assert.equal(moved.body.session.reason, '');

  // the mark can be taken back
  const back = await markOut(owner, group.id, id, line.lineId, { outstanding: false });
  assert.equal(back.body.session.counts.outstanding, 0);
  assert.equal(back.body.session.closeable, false);
  assert.equal((await markOut(owner, group.id, id, line.lineId, { outstanding: 'yes' })).status, 400);

  await markOut(owner, group.id, id, line.lineId, { outstanding: true });
  const closed = await closeSession(owner, group.id, id);
  assert.equal(closed.status, 200, closed.text);
  assert.equal(closed.body.session.status, 'reconciled');
});

test('a line with an entry behind it cannot be re-classified, and a matched book line is not in transit', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner);
  await post(owner, group.id, { date: '2026-09-01', lines: [{ code: '1010', debit: '100.00' }, { code: '4000', credit: '100.00' }] });

  const started = await startReconcile(owner, group.id, {
    accountCode: '1010', statementDate: '2026-09-30', statementBalance: '60.00',
    lines: [
      { date: '2026-09-01', description: 'Room fund in', amount: '100.00' },
      { date: '2026-09-02', description: 'Meter', amount: '-40.00' },
    ],
  });
  assert.equal(started.body.matched, 1);
  const id = started.body.session.id;

  const again = await classify(owner, group.id, id, 'S2', { as: 'book' });
  assert.equal(again.status, 200, again.text);
  const reclassified = await classify(owner, group.id, id, 'S2', { as: 'ignore', reason: 'changed my mind' });
  assert.equal(reclassified.status, 400, 'the books keep the entry, so the line cannot be quietly un-booked');
  assert.match(reclassified.body.error, /S2/);
  assert.match(reclassified.body.error, /Reverse that entry/);
  assert.equal(again.body.session.totals.difference, 0, 'and the money is still where the entry put it');

  // A book line that a statement line is already matched to is not in transit.
  const view = await reconcile(owner, group.id);
  const matchedItem = view.body.session.ledger.items.find((item) => item.matchedBy === 'S1');
  const flagged = await markOut(owner, group.id, id, matchedItem.lineId, { outstanding: true });
  assert.equal(flagged.status, 400);
  assert.match(flagged.body.error, /already matched/);
  assert.equal((await closeSession(owner, group.id, id)).status, 200, 'nothing is left to explain');
});
