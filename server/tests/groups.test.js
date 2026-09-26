import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, makeDefaultCategory, withCsrf } from './helpers.js';
import groupsRoutes from '../src/routes/groups.js';

let ctx;
let newAgent;
let mess;

const today = new Date();
const todayStr = today.toISOString().slice(0, 10);

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
  mess = await makeDefaultCategory({ name: 'Mess', type: 'expense', icon: 'cup' });
  mountGroups(ctx.app);
});

test.after(async () => {
  await ctx.stop();
});

/**
 * The groups router is mounted by the app itself in src/app.js. This suite
 * mounts it the same way when it is not there yet, so the tests stand on their
 * own: the layer goes in front of the static handler, exactly where app.js hangs
 * its routers, which leaves the app's own error handler behind it. When the
 * app already mounts the router, nothing is touched at all.
 */
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

async function session(payload) {
  const agent = newAgent();
  const user = await registerStudent(agent, payload);
  return { agent, user };
}

async function createGroup(who, { name = 'Room 204', currency = 'USD', members = [] } = {}) {
  const res = await withCsrf(who.user, who.agent.post('/api/groups')).send({ name, currency, members });
  assert.equal(res.status, 201, res.text);
  return res.body.group;
}

function addBill(who, groupId, body) {
  return withCsrf(who.user, who.agent.post(`/api/groups/${groupId}/expenses`)).send(body);
}

function bill(body = {}) {
  return {
    title: 'Mess bill',
    amount: '100.00',
    date: '2026-09-10',
    splitType: 'equal',
    paidByIndex: 0,
    ...body,
  };
}

const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const cents = (n) => Math.round(n * 100);

/* -------------------------------- creation -------------------------------- */

test('a new group lists with its members, and its bills show up in the counters', async () => {
  const owner = await session({ name: 'Aisha' });

  const group = await createGroup(owner, {
    name: 'Room 204',
    members: [
      { name: 'Bilal', email: 'bilal-room204@test.local' },
      { name: 'Sana', email: 'sana-room204@test.local' },
    ],
  });
  assert.equal(group.name, 'Room 204');
  assert.equal(group.currency, 'USD');
  assert.equal(group.memberCount, 3, 'the creator counts as a member');
  assert.equal(group.isOwner, true);

  const empty = await owner.agent.get('/api/groups');
  assert.equal(empty.status, 200);
  assert.equal(empty.body.rows.length, 1);
  assert.equal(empty.body.rows[0].memberCount, 3);
  assert.equal(empty.body.rows[0].expenseCount, 0);
  assert.equal(empty.body.rows[0].billedTotal, 0);

  const added = await addBill(owner, group.id, bill({ categoryId: mess._id.toString() }));
  assert.equal(added.status, 201, added.text);
  assert.equal(added.body.expense.amount, 100);
  assert.equal(added.body.expense.paidByIndex, 0);
  assert.equal(added.body.expense.paidByName, 'Aisha');
  assert.equal(added.body.expense.splitType, 'equal');
  assert.match(added.body.expense.date, /^2026-09-10/);
  assert.equal(added.body.expense.category.name, 'Mess');

  const detail = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(
    Object.keys(detail.body).sort(),
    ['balances', 'expenses', 'group', 'members', 'settlements']
  );
  assert.equal(detail.body.members.length, 3);
  assert.equal(detail.body.members[0].isOwner, true);
  assert.equal(detail.body.members[0].name, 'Aisha');
  assert.equal(detail.body.expenses.length, 1);
  assert.equal(detail.body.settlements.length, 0);

  // the counters come out of an aggregation, so the list follows the bills
  const listed = await owner.agent.get('/api/groups');
  assert.equal(listed.body.rows[0].expenseCount, 1);
  assert.equal(listed.body.rows[0].billedTotal, 100);
  assert.ok(listed.body.rows[0].lastActivity, 'last activity is reported');
});

test('a group with no name, no members and a bad currency is refused', async () => {
  const owner = await session();

  const nameless = await withCsrf(owner.user, owner.agent.post('/api/groups')).send({ name: '  ' });
  assert.equal(nameless.status, 400);

  const badCurrency = await withCsrf(owner.user, owner.agent.post('/api/groups')).send({
    name: 'Flat B',
    currency: 'rupees',
  });
  assert.equal(badCurrency.status, 400);

  const namelessRoommate = await withCsrf(owner.user, owner.agent.post('/api/groups')).send({
    name: 'Flat B',
    members: [{ email: 'ghost@test.local' }],
  });
  assert.equal(namelessRoommate.status, 400, 'a roommate needs a name we can print');
});

/* --------------------------- per-user isolation --------------------------- */

test("another student's group reads as 404, never as data", async () => {
  const owner = await session({ name: 'Aisha' });
  const stranger = await session({ name: 'Noor' });
  const group = await createGroup(owner, { name: 'Room 118', members: [{ name: 'Bilal' }] });

  const read = await stranger.agent.get(`/api/groups/${group.id}`);
  assert.equal(read.status, 404);

  const edit = await withCsrf(stranger.user, stranger.agent.patch(`/api/groups/${group.id}`)).send({ name: 'Mine now' });
  assert.equal(edit.status, 404);

  const billRes = await addBill(stranger, group.id, bill());
  assert.equal(billRes.status, 404);

  const addMate = await withCsrf(stranger.user, stranger.agent.post(`/api/groups/${group.id}/members`)).send({ name: 'Sneaky' });
  assert.equal(addMate.status, 404);

  const settle = await withCsrf(stranger.user, stranger.agent.post(`/api/groups/${group.id}/settle`)).send({
    fromIndex: 1,
    toIndex: 0,
    amount: '10.00',
  });
  assert.equal(settle.status, 404);

  const remove = await withCsrf(stranger.user, stranger.agent.delete(`/api/groups/${group.id}`));
  assert.equal(remove.status, 404);

  // ...and the group itself is untouched
  const list = await owner.agent.get('/api/groups');
  assert.equal(list.body.rows.length, 1);
  assert.equal(list.body.rows[0].name, 'Room 118');
});

/* ------------------------------ the split maths ---------------------------- */

test('three ways splits exactly, and the odd cent goes to the first member', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, {
    name: 'Room 7',
    members: [{ name: 'Bilal' }, { name: 'Sana' }],
  });

  const res = await addBill(owner, group.id, bill({ amount: '100.00' }));
  assert.equal(res.status, 201, res.text);

  // 100 / 3 = 33.333...  Every member's cut is floored to a whole cent and
  // the one cent that will not divide goes to the largest cut-off fraction —
  // all three are equal here, so member order decides and index 0 takes it.
  const { balances } = res.body;
  assert.deepEqual(balances.map((b) => b.share), [33.34, 33.33, 33.33]);
  assert.deepEqual(balances.map((b) => b.paid), [100, 0, 0]);
  assert.deepEqual(balances.map((b) => b.net), [66.66, -33.33, -33.33]);
  assert.equal(sum(balances, 'share'), 100, 'the shares add up to the bill, to the cent');
  assert.equal(sum(balances, 'net'), 0, 'the board balances to zero');

  // the stored split is money, and a client-sent split is ignored
  assert.deepEqual(
    res.body.expense.split.map((line) => line.amount),
    [33.34, 33.33, 33.33]
  );
  const tampered = await addBill(owner, group.id, bill({
    amount: '60.00',
    title: 'Groceries',
    split: [{ memberIndex: 0, amount: 60 }],
    shares: [{ memberIndex: 0, value: 60 }],
  }));
  assert.equal(tampered.status, 201);
  assert.deepEqual(
    tampered.body.expense.split.map((line) => line.amount),
    [20, 20, 20],
    'the server re-computes the split and ignores what the client asked for'
  );
});

test('shares split the bill by weight, and exact splits are checked against the total', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, {
    name: 'Project team',
    members: [{ name: 'Bilal' }, { name: 'Sana' }],
  });

  const weighted = await addBill(owner, group.id, bill({
    amount: '90.00',
    title: 'Team dinner',
    splitType: 'shares',
    shares: [
      { memberIndex: 0, value: 1 },
      { memberIndex: 1, value: 2 },
      { memberIndex: 2, value: 1 },
    ],
  }));
  assert.equal(weighted.status, 201, weighted.text);
  assert.deepEqual(weighted.body.balances.map((b) => b.share), [22.5, 45, 22.5]);
  assert.deepEqual(weighted.body.expense.shares, [
    { memberIndex: 0, value: 1 },
    { memberIndex: 1, value: 2 },
    { memberIndex: 2, value: 1 },
  ]);
  assert.deepEqual(weighted.body.balances.map((b) => b.net), [67.5, -45, -22.5]);

  // 10 split 1 : 2 : 4. Everyone's cut is floored to 142 / 285 / 571 cents and
  // the two leftover cents go to the two largest cut-off fractions — the
  // seventh share loses the most, so the smallest cut is the one that gains.
  const uneven = await addBill(owner, group.id, bill({
    amount: '10.00',
    title: 'Taxi home',
    splitType: 'shares',
    shares: [
      { memberIndex: 0, value: 1 },
      { memberIndex: 1, value: 2 },
      { memberIndex: 2, value: 4 },
    ],
  }));
  assert.deepEqual(uneven.body.expense.split.map((line) => line.amount), [1.43, 2.86, 5.71]);
  assert.equal(cents(sum(uneven.body.balances, 'share')), 10000, '90 + 10 = 100, still exact');

  // exact: the client may spell the amounts out, and they must add up
  const exact = await addBill(owner, group.id, bill({
    amount: '25.00',
    title: 'Print shop',
    splitType: 'exact',
    shares: [
      { memberIndex: 0, value: '10.00' },
      { memberIndex: 1, value: '7.50' },
      { memberIndex: 2, value: '7.50' },
    ],
  }));
  assert.equal(exact.status, 201, exact.text);
  assert.deepEqual(exact.body.expense.split.map((line) => line.amount), [10, 7.5, 7.5]);

  const wrongTotal = await addBill(owner, group.id, bill({
    amount: '25.00',
    splitType: 'exact',
    shares: [
      { memberIndex: 0, value: '10.00' },
      { memberIndex: 1, value: '7.50' },
    ],
  }));
  assert.equal(wrongTotal.status, 400, 'the exact amounts must add up to the bill');

  // no payer, no amount, no split — each answered in plain words
  assert.equal((await addBill(owner, group.id, bill({ paidByIndex: 9 }))).status, 400);
  assert.equal((await addBill(owner, group.id, bill({ amount: '0' }))).status, 400);
  assert.equal((await addBill(owner, group.id, bill({ amount: '1.999' }))).status, 400);
  assert.equal((await addBill(owner, group.id, bill({ title: '' }))).status, 400);
  assert.equal(
    (await addBill(owner, group.id, bill({ splitType: 'shares', shares: [] }))).status,
    400
  );
});

/* -------------------------------- settle up ------------------------------- */

test('settling up zeroes the balance and stays on the record', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, {
    name: 'Room 7',
    members: [{ name: 'Bilal' }, { name: 'Sana' }],
  });

  await addBill(owner, group.id, bill({
    amount: '90.00',
    splitType: 'shares',
    shares: [
      { memberIndex: 0, value: 1 },
      { memberIndex: 1, value: 2 },
      { memberIndex: 2, value: 1 },
    ],
  }));

  const first = await withCsrf(owner.user, owner.agent.post(`/api/groups/${group.id}/settle`)).send({
    fromIndex: 1,
    toIndex: 0,
    amount: '45.00',
    note: 'cash in the kitchen',
  });
  assert.equal(first.status, 201, first.text);
  assert.equal(first.body.settlement.amount, 45);
  assert.equal(first.body.settlement.fromName, 'Bilal');
  assert.equal(first.body.settlement.toName, 'Aisha');
  assert.equal(first.body.balances[1].net, 0, 'Bilal is square');
  assert.equal(first.body.balances[1].settledOut, 45);
  assert.equal(first.body.balances[0].net, 22.5);

  const second = await withCsrf(owner.user, owner.agent.post(`/api/groups/${group.id}/settle`)).send({
    fromIndex: 2,
    toIndex: 0,
    amount: '22.50',
  });
  assert.equal(second.status, 201);
  assert.deepEqual(second.body.balances.map((b) => b.net), [0, 0, 0], 'the whole board is zero');
  assert.equal(sum(second.body.balances, 'net'), 0);

  const detail = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(detail.body.settlements.length, 2, 'both settlements stay on the record');
  assert.equal(detail.body.settlements[0].amount, 22.5, 'newest first');
  assert.equal(detail.body.settlements[1].note, 'cash in the kitchen');
});

test('a settlement larger than what is owed is refused', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, { name: 'Room 7', members: [{ name: 'Bilal' }] });

  await addBill(owner, group.id, bill({ amount: '100.00' }));
  // owner paid 100 and owes 50 of it, Bilal owes 50

  const tooMuch = await withCsrf(owner.user, owner.agent.post(`/api/groups/${group.id}/settle`)).send({
    fromIndex: 1,
    toIndex: 0,
    amount: '50.01',
  });
  assert.equal(tooMuch.status, 400);
  assert.match(tooMuch.body.error, /50\.00/);

  const half = await withCsrf(owner.user, owner.agent.post(`/api/groups/${group.id}/settle`)).send({
    fromIndex: 1,
    toIndex: 0,
    amount: '20.00',
  });
  assert.equal(half.status, 201, 'a part payment is allowed');
  assert.equal(half.body.balances[1].net, -30);

  // 30.00 is all that is left, and a penny more is not
  const exact = await withCsrf(owner.user, owner.agent.post(`/api/groups/${group.id}/settle`)).send({
    fromIndex: 1,
    toIndex: 0,
    amount: '30.00',
  });
  assert.equal(exact.status, 201);
  assert.equal(exact.body.balances[1].net, 0);

  const over = await withCsrf(owner.user, owner.agent.post(`/api/groups/${group.id}/settle`)).send({
    fromIndex: 1,
    toIndex: 0,
    amount: '0.01',
  });
  assert.equal(over.status, 400, 'nothing is owed any more');

  const nobodyOwes = await withCsrf(owner.user, owner.agent.post(`/api/groups/${group.id}/settle`)).send({
    fromIndex: 0,
    toIndex: 1,
    amount: '1.00',
  });
  assert.equal(nobodyOwes.status, 400, 'the owner does not owe anything');

  const samePerson = await withCsrf(owner.user, owner.agent.post(`/api/groups/${group.id}/settle`)).send({
    fromIndex: 1,
    toIndex: 1,
    amount: '1.00',
  });
  assert.equal(samePerson.status, 400);

  const zero = await withCsrf(owner.user, owner.agent.post(`/api/groups/${group.id}/settle`)).send({
    fromIndex: 1,
    toIndex: 0,
    amount: '0',
  });
  assert.equal(zero.status, 400);
});

/* ---------------------------- Decimal128 drift ----------------------------- */

test('two uneven bills still add up to the cent', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, {
    name: 'Room 7',
    members: [{ name: 'Bilal' }, { name: 'Sana' }],
  });

  await addBill(owner, group.id, bill({ amount: '100.00', title: 'Week 1' }));
  const second = await addBill(owner, group.id, bill({ amount: '100.00', title: 'Week 2' }));
  assert.equal(second.status, 201, second.text);

  const balances = second.body.balances;
  assert.deepEqual(balances.map((b) => b.share), [66.68, 66.66, 66.66]);
  assert.deepEqual(balances.map((b) => b.net), [133.32, -66.66, -66.66]);
  assert.equal(sum(balances, 'share'), 200, 'Decimal128 in, exact cents out');
  assert.equal(sum(balances, 'paid'), 200);
  assert.equal(sum(balances, 'net'), 0);
  assert.equal(cents(sum(balances, 'share')), 20000, 'no rounding drift at the cent');

  const list = await owner.agent.get('/api/groups');
  assert.equal(list.body.rows[0].billedTotal, 200);
});

/* ------------------------------ the roommate ------------------------------ */

test('a roommate can add bills; only the owner can change the group', async () => {
  const owner = await session({ name: 'Aisha' });
  const roommate = await session({ name: 'Bilal' });
  const stranger = await session({ name: 'Noor' });

  const group = await createGroup(owner, {
    name: 'Room 204',
    members: [{ name: 'Bilal', email: roommate.user.email }],
  });

  // the email already belongs to an account, so the member row is linked
  const detail = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(detail.body.members[1].user, roommate.user.user.id);
  assert.equal(detail.body.members[1].name, 'Bilal');

  // a linked member sees the group, and can put a bill on it
  assert.equal((await roommate.agent.get('/api/groups')).body.rows.length, 1);
  const billByMember = await addBill(roommate, group.id, bill({ amount: '30.00', paidByIndex: 1, title: 'Soap' }));
  assert.equal(billByMember.status, 201, billByMember.text);
  assert.equal(billByMember.body.balances[1].net, 15, 'Bilal fronted 30 and owes 15 of it');
  assert.equal(billByMember.body.balances[0].net, -15);

  // ...but not change who is in it
  const asMember = await withCsrf(roommate.user, roommate.agent.post(`/api/groups/${group.id}/members`)).send({
    name: 'Sana',
    email: 'sana-room204@test.local',
  });
  assert.equal(asMember.status, 403);

  const twice = await withCsrf(owner.user, owner.agent.post(`/api/groups/${group.id}/members`)).send({
    name: 'Bilal',
    email: roommate.email,
  });
  assert.equal(twice.status, 400, 'the same person cannot be added twice');

  // a roommate who has not registered yet still gets a share
  const guest = await withCsrf(owner.user, owner.agent.post(`/api/groups/${group.id}/members`)).send({
    name: 'Sana',
    email: 'sana-room204@test.local',
  });
  assert.equal(guest.status, 201, guest.text);
  const withGuest = await addBill(owner, group.id, bill({ amount: '45.00', title: 'Rice and lentils' }));
  assert.deepEqual(
    withGuest.body.expense.split.map((line) => line.amount),
    [15, 15, 15],
    'a roommate who has not registered still gets a third of the bill'
  );
  assert.deepEqual(
    withGuest.body.balances.map((b) => b.share),
    [30, 30, 15],
    'the board keeps every bill: 15 each from the 30, 15 each from the 45'
  );
  assert.equal(sum(withGuest.body.balances, 'share'), 75, '30 + 45 across the group');

  const stillOut = await stranger.agent.get(`/api/groups/${group.id}`);
  assert.equal(stillOut.status, 404);
});

test('the owner can rename, close and finally delete a group', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, { name: 'Old room', members: [{ name: 'Bilal' }] });
  await addBill(owner, group.id, bill({ amount: '10.00' }));

  const renamed = await withCsrf(owner.user, owner.agent.patch(`/api/groups/${group.id}`)).send({ name: 'Room 5B' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.group.name, 'Room 5B');

  const closed = await withCsrf(owner.user, owner.agent.patch(`/api/groups/${group.id}`)).send({ archived: true });
  assert.equal(closed.body.group.archived, true);
  const visible = await owner.agent.get('/api/groups');
  assert.equal(visible.body.rows.length, 0, 'a closed group leaves the list but keeps its data');
  assert.equal((await owner.agent.get(`/api/groups/${group.id}`)).status, 200);

  const removed = await withCsrf(owner.user, owner.agent.delete(`/api/groups/${group.id}`));
  assert.equal(removed.status, 200);
  assert.equal((await owner.agent.get(`/api/groups/${group.id}`)).status, 404);
  assert.equal((await owner.agent.get('/api/groups')).body.rows.length, 0);
});

test('a bill cannot be dated with nonsense, and a missing id is a 404', async () => {
  const owner = await session();
  const group = await createGroup(owner, { name: 'Room 204' });

  const bad = await addBill(owner, group.id, bill({ date: 'not-a-date' }));
  assert.equal(bad.status, 400);

  const nonsense = await owner.agent.get('/api/groups/not-an-id');
  assert.equal(nonsense.status, 404);

  const stranger = await session();
  const empty = await stranger.agent.get('/api/groups');
  assert.deepEqual(empty.body.rows, [], 'a new account has no groups yet');
  assert.equal(todayStr.length, 10);
});
