import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, registerStudent, makeDefaultCategory, withCsrf } from './helpers.js';
import groupsRoutes from '../src/routes/groups.js';
import groupChatRoutes from '../src/routes/groupChat.js';
import Group from '../src/models/Group.js';
import GroupExpense from '../src/models/GroupExpense.js';
import GroupMessage from '../src/models/GroupMessage.js';
import { linkGroupsForEmail } from '../src/services/groups.js';

/**
 * Three server-side features, one file:
 *
 *   GRP-1  a member's email links their account, so a group they were added to
 *          before they signed up is simply there afterwards;
 *   GRP-2  a bill can name the people it is split between, and the odd-cent rule
 *          is the same one everybody has always used;
 *   GRP-4  a group chat with small poll cards, ticked by the members.
 *
 * The harness is the one from groups.test.js: an in-memory database, real
 * sign-ups, real sessions, the CSRF header on every write. The groups router is
 * mounted the way that suite mounts it, and the chat router the way
 * vault.test.js mounts the vault — app.js is not ours to edit, so each router
 * hangs itself in front of the /api 404 layer, behind the session and CSRF
 * middleware.
 */

let ctx;
let mess;

test.before(async () => {
  ctx = await startApp();
  mess = await makeDefaultCategory({ name: 'Mess', type: 'expense', icon: 'cup' });
  mountGroups(ctx.app);
  mountChat(ctx.app);
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

/** The chat router belongs at /api/groups/:id/chat, in the group's isolation. */
function mountChat(app) {
  const stack = app._router || app.router;
  if (!stack) throw new Error('cannot find the express router stack');

  app.use('/api/groups/:id/chat', groupChatRoutes);
  const layer = stack.stack.pop();
  const before = stack.stack.findIndex((l) => l.handle && l.handle.name === 'notFound');
  stack.stack.splice(before === -1 ? stack.stack.length : before, 0, layer);
}

/* -------------------------------- fixtures --------------------------------- */

/**
 * One signed-in student: the agent that carries their cookie, their public
 * account, and the CSRF token / password the write calls below need.
 */
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

function addBill(who, groupId, body = {}) {
  return withCsrf(who, who.agent.post(`/api/groups/${groupId}/expenses`)).send({
    title: 'Mess bill',
    amount: '100.00',
    date: '2026-09-10',
    splitType: 'equal',
    paidByIndex: 0,
    ...body,
  });
}

const oid = (id) => new mongoose.Types.ObjectId(id);

const chat = (who, groupId) => who.agent.get(`/api/groups/${groupId}/chat`);
const postText = (who, groupId, text) =>
  withCsrf(who, who.agent.post(`/api/groups/${groupId}/chat/messages`)).send({ text });
const postCard = (who, groupId, payload = {}) =>
  withCsrf(who, who.agent.post(`/api/groups/${groupId}/chat/polls`)).send({
    category: 'chai',
    rate: '350',
    time: '16:00',
    ...payload,
  });
const tick = (who, groupId, messageId, payload = { yes: true }) =>
  withCsrf(who, who.agent.patch(`/api/groups/${groupId}/chat/polls/${messageId}/respond`)).send(payload);
const removeLine = (who, groupId, messageId) =>
  withCsrf(who, who.agent.delete(`/api/groups/${groupId}/chat/messages/${messageId}`));

const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const cents = (n) => Math.round(n * 100);
let seq = 0;
const addr = (label) => `${label}-${Date.now().toString(36)}-${(seq += 1)}@test.local`;

/* =========================== GRP-1: the email link =========================== */

/**
 * A roommate is added with an email, before they have an account. The link
 * between the two has to happen on its own — at sign-up, at sign-in, and on the
 * groups list itself, for accounts that predate the feature.
 */
test('a roommate’s email links their account, and the group is already there', async () => {
  const owner = await session({ name: 'Aisha' });
  const email = addr('roommate');

  const group = await createGroup(owner, {
    name: 'Room 204',
    members: [{ name: 'Bilal', email }, { name: 'Sana', email: addr('nobody') }],
  });

  // before the account exists, the row is a promise and the owner can see it
  const before = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(before.status, 200);
  assert.equal(before.body.members[1].user, null, 'no account yet, so no link');
  assert.equal(before.body.members[1].email, email);

  // the roommate signs up with the address the group is holding
  const roommate = await session({ name: 'Bilal', email });

  // ...and the group is in their list, with nothing for them to do
  const listed = await roommate.agent.get('/api/groups');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.rows.length, 1, 'the group waited for them');
  assert.equal(listed.body.rows[0].id, group.id);
  assert.equal(listed.body.rows[0].isOwner, false);

  const detail = await roommate.agent.get(`/api/groups/${group.id}`);
  assert.equal(detail.status, 200, 'and the room itself opens');
  assert.equal(detail.body.members[1].user, roommate.user.id, 'the member row carries the account');
  assert.equal(detail.body.members[1].name, 'Bilal');

  // the owner still sees exactly their own room, and the bill still splits three ways
  assert.equal((await owner.agent.get('/api/groups')).body.rows.length, 1);
  const split = await addBill(owner, group.id, { categoryId: mess._id.toString() });
  assert.equal(split.status, 201, split.text);
  assert.deepEqual(split.body.expense.split.map((l) => l.amount), [33.34, 33.33, 33.33]);

  // a third student, with an address nobody invited, gets nothing at all
  const stranger = await session({ name: 'Noor' });
  assert.deepEqual((await stranger.agent.get('/api/groups')).body.rows, []);
  assert.equal((await stranger.agent.get(`/api/groups/${group.id}`)).status, 404);
  assert.equal((await postText(stranger, group.id, 'hello?')).status, 404);
});

test('signing in links a group that was left unlinked', async () => {
  const owner = await session({ name: 'Aisha' });
  const email = addr('roommate');
  const group = await createGroup(owner, { name: 'Room 7', members: [{ name: 'Bilal', email }] });
  const roommate = await session({ name: 'Bilal', email });
  assert.equal((await roommate.agent.get('/api/groups')).body.rows.length, 1);

  // the link goes missing again (an old row, a restore, a hand-edited group)
  await Group.collection.updateOne({ _id: oid(group.id) }, { $set: { 'members.1.user': null } });
  assert.equal((await roommate.agent.get(`/api/groups/${group.id}`)).status, 404, 'unlinked again');

  // a fresh sign-in on a clean cookie jar is enough to put it back
  const agent = ctx.newAgent();
  const signedIn = await agent
    .post('/api/auth/login')
    .send({ email, password: roommate.password });
  assert.equal(signedIn.status, 200, signedIn.text);
  assert.equal((await agent.get('/api/auth/me')).body.user.email, email);
  assert.equal((await agent.get('/api/groups')).body.rows.length, 1, 'signing in linked the group');
});

test('the groups list heals a row that was never linked, once and only once', async () => {
  const owner = await session({ name: 'Aisha' });
  const email = addr('roommate');
  const group = await createGroup(owner, { name: 'Room 9', members: [{ name: 'Bilal', email }] });
  const roommate = await session({ name: 'Bilal', email });

  // an account that already existed when this feature shipped: the group is
  // still holding an unlinked row, so even the group itself is out of reach
  await Group.collection.updateOne({ _id: oid(group.id) }, { $set: { 'members.1.user': null } });
  assert.equal((await roommate.agent.get(`/api/groups/${group.id}`)).status, 404, 'not linked yet');

  const healed = await roommate.agent.get('/api/groups');
  assert.equal(healed.body.rows.length, 1, 'the sweep linked it without being asked');
  assert.equal(healed.body.rows[0].id, group.id);
  assert.equal((await roommate.agent.get(`/api/groups/${group.id}`)).body.members[1].user, roommate.user.id);

  // the sweep is idempotent: an already-linked member is never touched again
  assert.deepEqual(await linkGroupsForEmail({ _id: roommate.user.id, email }), { linked: 0 });
  const raw = await Group.collection.findOne({ _id: oid(group.id) });
  assert.equal(String(raw.members[1].user), roommate.user.id, 'still the same account');
  assert.equal(String(raw.members[0].user), owner.user.id, 'and the owner’s own row was never in the way');
});

test('the link never crosses to a different member’s row', async () => {
  const owner = await session({ name: 'Aisha' });
  const invited = addr('invited');
  const group = await createGroup(owner, {
    name: 'Room 12',
    members: [
      { name: 'Bilal', email: invited },
      { name: 'Sana', email: addr('other') },
    ],
  });

  // Somebody else's account is already sitting on the second row, with the
  // first row's email still on it — the shape a careless earlier write leaves.
  const other = await session({ name: 'Noor' });
  await Group.collection.updateOne({ _id: oid(group.id) }, { $set: { 'members.2.user': oid(other.user.id) } });

  // the invited address now arrives: it must fill its OWN row, not the one beside it
  const roommate = await session({ name: 'Bilal', email: invited });
  const members = (await roommate.agent.get(`/api/groups/${group.id}`)).body.members;
  assert.equal(members.length, 3);
  assert.equal(members[1].user, roommate.user.id, 'filled the matching row');
  assert.equal(members[2].user, other.user.id, 'left the other account where it was');

  // and an account with no matching email links nothing at all
  const stranger = await session({ name: 'Zara' });
  assert.deepEqual(await linkGroupsForEmail({ _id: stranger.user.id, email: stranger.user.email }), { linked: 0 });
  assert.deepEqual((await stranger.agent.get('/api/groups')).body.rows, []);
  assert.equal((await stranger.agent.get(`/api/groups/${group.id}`)).status, 404);
});

/* ========================== GRP-2: who is in the bill ====================== */

test('a bill can be split between a subset, and the odd cent still follows the rule', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, {
    name: 'Room 204',
    members: [{ name: 'Bilal' }, { name: 'Sana' }, { name: 'Deepa' }],
  });

  // 100.00 between members 0, 2 and 3 — member 1 is not on this bill
  const three = await addBill(owner, group.id, { includedIndexes: [2, 0, 3] });
  assert.equal(three.status, 201, three.text);
  assert.deepEqual(three.body.expense.includedIndexes, [0, 2, 3], 'stored sorted, whatever order they ticked');
  assert.deepEqual(
    three.body.expense.split.map((line) => [line.memberIndex, line.amount]),
    [
      [0, 33.34],
      [2, 33.33],
      [3, 33.33],
    ],
    'the same remainder rule: largest cut-off fraction first, ties by member order'
  );
  assert.deepEqual(three.body.balances.map((b) => b.net), [66.66, 0, -33.33, -33.33]);
  assert.equal(three.body.balances[1].share, 0, 'the member who was not ticked is not on the bill');
  assert.equal(cents(sum(three.body.balances, 'share')), 10000, 'the shares add up to the bill, to the cent');
  assert.equal(cents(sum(three.body.balances, 'net')), 0, 'the board still balances to zero');

  // the same three people, but the earliest is not the owner: the odd cent goes
  // to the earliest person IN the split, not to index 0 (so Bilal pays this one)
  const later = await addBill(owner, group.id, { includedIndexes: [1, 2, 3], paidByIndex: 1 });
  assert.equal(later.status, 201, later.text);
  assert.deepEqual(
    later.body.expense.split.map((line) => [line.memberIndex, line.amount]),
    [
      [1, 33.34],
      [2, 33.33],
      [3, 33.33],
    ]
  );

  // a subset shares split, and one exact split
  const weighted = await addBill(owner, group.id, {
    amount: '10.00',
    splitType: 'shares',
    includedIndexes: [0, 3],
    shares: [
      { memberIndex: 0, value: 1 },
      { memberIndex: 3, value: 2 },
    ],
  });
  assert.equal(weighted.status, 201, weighted.text);
  assert.deepEqual(weighted.body.expense.split.map((line) => line.amount), [3.33, 6.67]);
  assert.deepEqual(weighted.body.expense.shares, [
    { memberIndex: 0, value: 1 },
    { memberIndex: 3, value: 2 },
  ]);

  const exact = await addBill(owner, group.id, {
    amount: '25.00',
    splitType: 'exact',
    includedIndexes: [0, 1],
    shares: [
      { memberIndex: 0, value: '10.00' },
      { memberIndex: 1, value: '15.00' },
    ],
  });
  assert.equal(exact.status, 201, exact.text);
  assert.deepEqual(exact.body.expense.split.map((line) => [line.memberIndex, line.amount]), [
    [0, 10],
    [1, 15],
  ]);

  // the board is the sum of every bill, and a subset split is one of them
  const board = exact.body.balances;
  assert.deepEqual(
    board.map((b) => b.share),
    [46.67, 48.34, 66.66, 73.33],
    '46.67 = 33.34 + 3.33 + 10, and the member who was never ticked still has a row'
  );
  assert.equal(cents(sum(board, 'share')), 23500, '235.00 of bills, with no rounding drift');
  assert.equal(cents(sum(board, 'net')), 0);
});

test('a bill the payer is not in is refused, and the group keeps its numbers', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, { name: 'Room 7', members: [{ name: 'Bilal' }, { name: 'Sana' }] });

  const first = await addBill(owner, group.id, { amount: '90.00' });
  assert.equal(first.status, 201, first.text);
  const before = first.body.balances;

  const payerExcluded = await addBill(owner, group.id, { includedIndexes: [1, 2] });
  assert.equal(payerExcluded.status, 400);
  assert.match(payerExcluded.body.error, /split between/i, 'the reason is spelled out');

  const board = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(board.body.expenses.length, 1, 'nothing was written');
  assert.deepEqual(board.body.balances, before, 'and the board is exactly as it was');
});

test('a bad included list is refused, and nothing is written', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, { name: 'Room 7', members: [{ name: 'Bilal' }] });

  const bad = [
    [], // nobody at all
    [0, 0], // the same person twice
    [0, 5], // not a member of this group
    [-1], // not a position
    ['1'], // a <select> string, not a position
    [1.5], // not a whole number
    'everyone', // not a list
    { 0: true },
  ];

  for (const includedIndexes of bad) {
    const res = await addBill(owner, group.id, { includedIndexes });
    assert.equal(res.status, 400, `expected a refusal for ${JSON.stringify(includedIndexes)}`);
    assert.ok(res.body.error, 'and a sentence the student can read');
  }

  assert.equal((await owner.agent.get('/api/groups')).body.rows[0].expenseCount, 0, 'not one of them was stored');
  assert.deepEqual((await owner.agent.get(`/api/groups/${group.id}`)).body.expenses, []);
});

test('a share or exact line outside the split is refused, not quietly dropped', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, { name: 'Room 7', members: [{ name: 'Bilal' }, { name: 'Sana' }] });

  const shares = await addBill(owner, group.id, {
    amount: '30.00',
    splitType: 'shares',
    includedIndexes: [0, 2],
    shares: [
      { memberIndex: 0, value: 1 },
      { memberIndex: 1, value: 1 },
    ],
  });
  assert.equal(shares.status, 400, 'a weight for somebody who was not ticked');
  assert.match(shares.body.error, /not in this/i);

  const exact = await addBill(owner, group.id, {
    amount: '30.00',
    splitType: 'exact',
    includedIndexes: [0, 2],
    shares: [
      { memberIndex: 0, value: '10.00' },
      { memberIndex: 1, value: '20.00' },
    ],
  });
  assert.equal(exact.status, 400, 'an exact line for somebody who was not ticked');

  const withAnEmpty = await addBill(owner, group.id, {
    amount: '30.00',
    splitType: 'exact',
    includedIndexes: [0, 2],
    shares: [
      { memberIndex: 0, value: '10.00' },
      { memberIndex: 2, value: '20.00' },
    ],
  });
  assert.equal(withAnEmpty.status, 201, 'everybody in the split can be spelled out', withAnEmpty.text);
  assert.deepEqual(withAnEmpty.body.expense.split.map((line) => [line.memberIndex, line.amount]), [
    [0, 10],
    [2, 20],
  ]);

  const wrongTotal = await addBill(owner, group.id, {
    amount: '30.00',
    splitType: 'exact',
    includedIndexes: [0, 2],
    shares: [
      { memberIndex: 0, value: '10.00' },
      { memberIndex: 2, value: '10.00' },
    ],
  });
  assert.equal(wrongTotal.status, 400, 'and the amounts still have to add up to the bill');
});

test('a bill written before the selection existed still reads as everyone', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, { name: 'Room 7', members: [{ name: 'Bilal' }, { name: 'Sana' }] });

  const created = await addBill(owner, group.id, { amount: '100.00' });
  assert.equal(created.status, 201, created.text);
  assert.deepEqual(created.body.expense.includedIndexes, [0, 1, 2], 'a bill with no selection is everyone');

  // take the field off, exactly as the collection looked before this feature
  await GroupExpense.collection.updateOne({ _id: oid(created.body.expense.id) }, { $unset: { includedIndexes: '' } });
  assert.equal(
    (await GroupExpense.findById(created.body.expense.id).lean()).includedIndexes,
    undefined,
    'the old bill has no set at all'
  );

  const read = await owner.agent.get(`/api/groups/${group.id}`);
  const old = read.body.expenses[0];
  assert.deepEqual(old.includedIndexes, [0, 1, 2], 'so it reads as the whole group');
  assert.deepEqual(old.split.map((line) => line.amount), [33.34, 33.33, 33.33], 'and the money never moved');
  assert.deepEqual(read.body.balances.map((b) => b.net), [66.66, -33.33, -33.33]);
  assert.equal(cents(sum(read.body.balances, 'share')), 10000);
});

/* ============================== GRP-4: the chat ============================ */

test('a member can say something, and a stranger gets a 404', async () => {
  const owner = await session({ name: 'Aisha' });
  const email = addr('roommate');
  const group = await createGroup(owner, { name: 'Room 204', members: [{ name: 'Bilal Khan', email }] });
  const roommate = await session({ name: 'Bilal Khan', email });
  const stranger = await session({ name: 'Noor' });

  const room = await chat(owner, group.id);
  assert.equal(room.status, 200, room.text);
  assert.deepEqual(Object.keys(room.body).sort(), ['group', 'rows']);
  assert.equal(room.body.group.currency, 'USD', 'the room carries the group’s own currency');
  assert.deepEqual(
    room.body.group.members.map((m) => [m.index, m.name, m.initials, m.isOwner, m.isYou]),
    [
      [0, 'Aisha', 'A', true, true],
      [1, 'Bilal Khan', 'BK', false, false],
    ]
  );
  assert.deepEqual(room.body.rows, [], 'a new room is empty');

  const said = await postText(owner, group.id, '  mess bill is in  ');
  assert.equal(said.status, 201, said.text);
  assert.equal(said.body.message.kind, 'text');
  assert.equal(said.body.message.text, 'mess bill is in', 'trimmed, and kept');
  assert.equal(said.body.message.isYou, true);
  assert.deepEqual(said.body.message.sender, { index: 0, name: 'Aisha', initials: 'A', user: owner.user.id });
  assert.ok(said.body.message.createdAt, 'the thread is in time order, so it is stamped');

  const fromMate = await postText(roommate, group.id, 'on my way');
  assert.equal(fromMate.status, 201, fromMate.text);
  assert.equal(fromMate.body.message.isYou, true, 'their own line is their own');
  assert.equal(fromMate.body.message.sender.initials, 'BK', 'first and last letter');

  const read = await chat(roommate, group.id);
  assert.equal(read.body.rows.length, 2);
  assert.equal(read.body.rows[0].text, 'mess bill is in', 'oldest first');
  assert.equal(read.body.rows[0].isYou, false, 'and Aisha’s line is not theirs');
  assert.equal(read.body.rows[1].isYou, true);
  assert.equal(read.body.group.members[1].isYou, true);

  // nothing empty, nothing enormous
  assert.equal((await postText(owner, group.id, '   ')).status, 400);
  assert.equal((await postText(owner, group.id, 'x'.repeat(1001))).status, 400);
  assert.equal((await chat(owner, group.id)).body.rows.length, 2, 'and neither was stored');

  // the stranger is not in the room, so there is no room
  assert.equal((await chat(stranger, group.id)).status, 404);
  assert.equal((await postText(stranger, group.id, 'let me in')).status, 404);
  assert.equal((await postCard(stranger, group.id)).status, 404);
  assert.equal((await tick(stranger, group.id, said.body.message.id)).status, 404);
  assert.equal((await removeLine(stranger, group.id, said.body.message.id)).status, 404);
  assert.equal((await chat(owner, 'not-an-id')).status, 404);
});

test('a card starts with one pending row per member, and a tick moves the total', async () => {
  const owner = await session({ name: 'Aisha' });
  const email = addr('roommate');
  const group = await createGroup(owner, {
    name: 'Room 204',
    members: [{ name: 'Bilal', email }, { name: 'Sana' }], // Sana has no account yet
  });
  const roommate = await session({ name: 'Bilal', email });

  const card = await postCard(owner, group.id, {
    category: 'chai',
    rate: '350.00',
    location: 'canteen',
    purpose: 'before the lecture',
    date: '2026-09-16',
    note: 'bring change',
  });
  assert.equal(card.status, 201, card.text);

  const message = card.body.message;
  assert.equal(message.kind, 'poll');
  assert.equal(message.text, '', 'a card carries no sentence — the wording is the client’s');
  assert.equal(message.isYou, true);
  assert.deepEqual(message.sender, { index: 0, name: 'Aisha', initials: 'A', user: owner.user.id });

  const { responses, ...fields } = message.poll;
  assert.deepEqual(fields, {
    category: 'chai',
    location: 'canteen',
    purpose: 'before the lecture',
    date: '2026-09-16',
    time: '16:00',
    rate: 350,
    note: 'bring change',
    yesCount: 0,
    noCount: 0,
    pendingCount: 3,
    total: 0,
  });
  assert.deepEqual(
    responses.map((r) => [r.memberIndex, r.name, r.initials, r.yes, r.at]),
    [
      [0, 'Aisha', 'A', null, null],
      [1, 'Bilal', 'B', null, null],
      [2, 'Sana', 'S', null, null],
    ],
    'one row per member, every one of them still waiting'
  );

  // the card is in the room, in order
  const room = await chat(owner, group.id);
  assert.equal(room.body.rows.length, 1);
  assert.equal(room.body.rows[0].poll.total, 0);

  // Aisha ticks herself in: 350
  const first = await tick(owner, group.id, message.id);
  assert.equal(first.status, 200, first.text);
  assert.equal(first.body.total, 350, 'the running total comes back with the card');
  assert.equal(first.body.message.poll.yesCount, 1);
  assert.equal(first.body.message.poll.pendingCount, 2);
  assert.equal(first.body.message.poll.noCount, 0);
  assert.ok(first.body.message.poll.responses[0].at, 'a tick is stamped');

  // Bilal is in too: 700
  const second = await tick(roommate, group.id, message.id);
  assert.equal(second.status, 200, second.text);
  assert.equal(second.body.total, 700);
  assert.equal(second.body.message.poll.pendingCount, 1, 'Sana has not answered — the card says so');

  // ...and back out again: 350, pending once more
  const undone = await tick(roommate, group.id, message.id, { yes: null });
  assert.equal(undone.status, 200, undone.text);
  assert.equal(undone.body.total, 350);
  assert.equal(undone.body.message.poll.responses[1].yes, null, 'tapping twice takes the answer back');
  assert.equal(undone.body.message.poll.responses[1].at, null);
  assert.equal(undone.body.message.poll.pendingCount, 2);

  // a "no" is a real answer, and it adds nothing to the card
  const no = await tick(roommate, group.id, message.id, { yes: false });
  assert.equal(no.status, 200, no.text);
  assert.equal(no.body.total, 350, 'a no does not add to the card');
  assert.equal(no.body.message.poll.noCount, 1);

  // a card is not money: nothing here touched the balance board
  const detail = await owner.agent.get(`/api/groups/${group.id}`);
  assert.deepEqual(detail.body.balances.map((b) => b.net), [0, 0, 0]);
  assert.deepEqual(detail.body.expenses, []);
});

test('three ticks of 350.00 is 1050.00, and only your own row moves', async () => {
  const owner = await session({ name: 'Aisha' });
  const emails = [addr('first'), addr('second'), addr('third')];
  const group = await createGroup(owner, {
    name: 'Room 204',
    members: [
      { name: 'Bilal', email: emails[0] },
      { name: 'Sana Khan', email: emails[1] },
      { name: 'Deepa', email: emails[2] },
    ],
  });
  const [bilal, sana, deepa] = await Promise.all(
    emails.map((email, i) => session({ name: ['Bilal', 'Sana Khan', 'Deepa'][i], email }))
  );

  const card = await postCard(owner, group.id, { category: 'food', rate: '350.00', time: '' });
  assert.equal(card.status, 201, card.text);
  assert.equal(card.body.message.poll.time, '', 'the time is optional');
  const id = card.body.message.id;
  assert.equal(card.body.message.poll.responses.length, 4, 'one row per member');

  // 350 -> 700 -> 1050 as the room fills up
  assert.equal((await tick(owner, group.id, id)).body.total, 350);
  assert.equal((await tick(bilal, group.id, id)).body.total, 700);
  const three = await tick(sana, group.id, id);
  assert.equal(three.body.total, 1050, 'in whole cents, not in floats');
  assert.equal(three.body.message.poll.yesCount, 3);
  assert.equal(three.body.message.poll.pendingCount, 1);
  assert.deepEqual(
    three.body.message.poll.responses.map((r) => [r.memberIndex, r.initials, r.yes]),
    [
      [0, 'A', true],
      [1, 'B', true],
      [2, 'SK', true],
      [3, 'D', null],
    ],
    'every tick carries the person’s initials, and the last row is still waiting'
  );

  // tapping the same button again takes your answer back, and only yours
  const undone = await tick(bilal, group.id, id, { yes: null });
  assert.equal(undone.status, 200, undone.text);
  assert.equal(undone.body.total, 700);
  assert.equal(undone.body.message.poll.pendingCount, 2, 'Bilal is waiting again, and so is Deepa');
  assert.deepEqual(undone.body.message.poll.responses.map((r) => r.yes), [true, null, true, null]);

  // somebody else's row is not writable, whichever way it is asked for
  const sneaky = await tick(deepa, group.id, id, { yes: true, memberIndex: 0 });
  assert.equal(sneaky.status, 400, 'somebody else’s row is never writable');
  assert.match(sneaky.body.error, /yourself/i);
  const still = await chat(owner, group.id);
  assert.equal(still.body.rows[0].poll.responses[0].yes, true, 'the owner is untouched by that attempt');
  assert.equal(still.body.rows[0].poll.responses[3].yes, null, 'and Deepa is still pending');

  // naming your own seat in the payload is allowed — it is the same row
  const self = await tick(deepa, group.id, id, { yes: true, memberIndex: 3 });
  assert.equal(self.status, 200, self.text);
  assert.equal(self.body.total, 1050);
  assert.equal(self.body.message.poll.responses[3].yes, true);
});

test('a card is refused when it makes no sense, and stores no English', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, { name: 'Room 7', members: [{ name: 'Bilal' }] });

  // sent raw, because the helper above fills in a valid card by default
  const sendCard = (payload) =>
    withCsrf(owner, owner.agent.post(`/api/groups/${group.id}/chat/polls`)).send(payload);

  const bad = [
    { rate: '350' }, // no category
    { category: 'tea party', rate: '350' }, // not one of the keys
    { category: 'chai' }, // no rate
    { category: 'chai', rate: '0' },
    { category: 'chai', rate: '-5' },
    { category: 'chai', rate: '350.555' },
    { category: 'chai', rate: 'lots' },
    { category: 'chai', rate: '350', date: '16-09-2026' },
    { category: 'chai', rate: '350', date: '2026-13-40' },
    { category: 'chai', rate: '350', time: '4pm' },
    { category: 'chai', rate: '350', time: '25:00' },
    { category: 'chai', rate: '350', location: 'x'.repeat(121) },
    { category: 'chai', rate: '350', purpose: 'x'.repeat(121) },
    { category: 'chai', rate: '350', note: 'x'.repeat(201) },
  ];
  for (const payload of bad) {
    const res = await sendCard(payload);
    assert.equal(res.status, 400, `expected a refusal for ${JSON.stringify(payload)}`);
    assert.ok(res.body.error, 'and a sentence the student can read');
  }
  assert.equal(await GroupMessage.countDocuments({ group: oid(group.id) }), 0, 'none of them was stored');

  // what is stored is a key and some numbers, not a sentence
  const card = await postCard(owner, group.id, { category: 'chai', rate: '350', location: 'canteen' });
  const raw = await GroupMessage.collection.findOne({ _id: oid(card.body.message.id) });
  assert.equal(raw.kind, 'poll');
  assert.equal(raw.text, '');
  assert.equal(raw.poll.category, 'chai', 'the category is a key the client turns into words');
  assert.deepEqual(Object.keys(raw.poll).sort(), [
    'category',
    'date',
    'location',
    'note',
    'purpose',
    'rate',
    'responses',
    'time',
  ]);

  const stored = JSON.stringify(raw);
  for (const word of ['Tea', 'per head', "who's in", 'Going']) {
    assert.ok(!stored.includes(word), `the card must not carry the words "${word}"`);
  }
  assert.ok(stored.includes('canteen'), 'but the student’s own place name is stored as typed');
});

test('a member who joins later gets no row on an old card', async () => {
  const owner = await session({ name: 'Aisha' });
  const email = addr('roommate');
  const group = await createGroup(owner, { name: 'Room 204', members: [{ name: 'Bilal', email }] });
  const roommate = await session({ name: 'Bilal', email });

  const old = await postCard(owner, group.id, { rate: '350' });
  assert.equal(old.body.message.poll.responses.length, 2, 'asked the two people in the room');

  // a new roommate registers and is added after the card was posted
  const latecomer = await session({ name: 'Zara' });
  const added = await withCsrf(owner, owner.agent.post(`/api/groups/${group.id}/members`)).send({
    name: 'Zara',
    email: latecomer.user.email,
  });
  assert.equal(added.status, 201, added.text);

  const refused = await tick(latecomer, group.id, old.body.message.id);
  assert.equal(refused.status, 400, 'an old card does not grow a row for somebody who joined later');
  assert.match(refused.body.error, /after/i);
  assert.equal(
    (await chat(owner, group.id)).body.rows[0].poll.responses.length,
    2,
    'the card still asks the two people it asked'
  );

  // a card posted now does ask her
  const fresh = await postCard(owner, group.id, { rate: '350' });
  assert.equal(fresh.body.message.poll.responses.length, 3);
  const joined = await tick(latecomer, group.id, fresh.body.message.id);
  assert.equal(joined.status, 200, joined.text);
  assert.equal(joined.body.total, 350);
  assert.equal(joined.body.message.poll.responses[2].initials, 'Z');

  // a typed message is not a card
  const text = await postText(owner, group.id, 'just saying');
  assert.equal((await tick(owner, group.id, text.body.message.id)).status, 400);
  assert.equal((await tick(roommate, group.id, text.body.message.id, { yes: 'yes' })).status, 400);
  assert.equal((await tick(owner, group.id, 'not-an-id')).status, 404);
});

test('the sender can delete their own line, the owner anybody’s, and nobody else’s', async () => {
  const owner = await session({ name: 'Aisha' });
  const emails = [addr('first'), addr('second'), addr('third')];
  const group = await createGroup(owner, {
    name: 'Room 204',
    members: [
      { name: 'Bilal', email: emails[0] },
      { name: 'Sana', email: emails[1] },
      { name: 'Deepa', email: emails[2] },
    ],
  });
  const [roommate, third] = await Promise.all([
    session({ name: 'Bilal', email: emails[0] }),
    session({ name: 'Deepa', email: emails[2] }),
  ]);

  const mine = await postText(owner, group.id, 'owner speaks');
  const theirs = await postText(roommate, group.id, 'roommate speaks');
  const card = await postCard(owner, group.id, { rate: '350' });

  // a bill, to prove a deleted card changes nothing money-wise
  const billRes = await addBill(owner, group.id, { amount: '60.00' });
  assert.equal(billRes.status, 201, billRes.text);
  const board = billRes.body.balances;

  // a member who is neither the sender nor the owner can delete neither
  assert.equal((await removeLine(third, group.id, theirs.body.message.id)).status, 404);
  assert.equal((await removeLine(third, group.id, mine.body.message.id)).status, 404);
  assert.equal((await removeLine(third, group.id, card.body.message.id)).status, 404);
  assert.equal((await chat(owner, group.id)).body.rows.length, 3, 'all three lines are still there');

  // the sender deletes their own
  const gone = await removeLine(roommate, group.id, theirs.body.message.id);
  assert.equal(gone.status, 200, gone.text);
  assert.equal(gone.body.ok, true);

  // the owner deletes anybody's, a card included
  assert.equal((await removeLine(owner, group.id, mine.body.message.id)).status, 200);
  assert.equal((await removeLine(owner, group.id, card.body.message.id)).status, 200);

  const after = await owner.agent.get(`/api/groups/${group.id}`);
  assert.equal(after.body.expenses.length, 1, 'the bill is untouched');
  assert.deepEqual(after.body.balances, board, 'and so is every balance — a card was never money');
  assert.deepEqual((await chat(owner, group.id)).body.rows, []);
  assert.equal((await removeLine(owner, group.id, card.body.message.id)).status, 404, 'it is gone');
  assert.equal((await removeLine(owner, group.id, 'not-an-id')).status, 404);
});

test('the room keeps the last hundred lines, oldest first', async () => {
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, { name: 'Room 7' });

  for (let i = 1; i <= 104; i += 1) {
    const res = await postText(owner, group.id, `line ${i}`);
    assert.equal(res.status, 201, `line ${i}`);
  }

  const room = await chat(owner, group.id);
  assert.equal(room.body.rows.length, 100, 'a hundred lines is a screenful, not a memory dump');
  assert.equal(room.body.rows[0].text, 'line 5', 'the oldest of the hundred kept');
  assert.equal(room.body.rows.at(-1).text, 'line 104', 'and the newest is last');
  const times = room.body.rows.map((row) => new Date(row.createdAt).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b), 'the thread reads in order');
});
