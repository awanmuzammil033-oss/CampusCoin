/**
 * A group that somebody was added to, from the other side of the invite (GRP-1).
 *
 * The whole feature is one sentence long — "add a person to a group and the group
 * turns up in their own list" — and it was the one part of the groups work with no
 * test at all. It is also the part that breaks silently: the list query is
 * `{ $or: [{ owner }, { 'members.user' }] }`, the link is a one-field match on
 * `members.email`, and if either half stops working the group simply does not
 * appear. Nothing errors. A student is told they are in a hostel mess fund and
 * their dashboard has never heard of it.
 *
 * So the behaviour is pinned here, in the order a real person meets it:
 *
 *   1. the owner adds a roommate by an email address they do not have an account
 *      for yet, which is the normal case - a hostel block is full of people you
 *      know and have never met;
 *   2. that person signs up, and the group is waiting in their list with no action
 *      from them;
 *   3. the group's whole activity is readable to them: the bills, the balances,
 *      the thread, the polls - the same numbers the owner sees;
 *   4. and the part this test is most careful about, because it is the part that
 *      is easy to get wrong in BOTH directions: they see everything, and they can
 *      join the conversation, but adding a bill or changing the group follows the
 *      role table rather than the fact that they were added. A new row has no
 *      role, an absent role reads as `member`, and `member` may only `view`.
 *
 * The alternative - making every invited person an admin - is one line, and it is
 * the wrong line: it would hand spending and deletion rights to everybody a
 * student ever typed an address for. The owner promoting someone is one tap, and
 * the last test here is that the tap works.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { startApp, registerStudent, withCsrf, makeDefaultCategory } from './helpers.js';
import groupRoutes from '../src/routes/groups.js';
import groupChatRoutes from '../src/routes/groupChat.js';
import { default as Group } from '../src/models/Group.js';

let ctx;
let newAgent;
let mess;

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
  mess = await makeDefaultCategory({ name: 'Mess', type: 'expense', icon: 'cup' });
  mountGroups(ctx.app);
  mountChat(ctx.app);
});

test.after(async () => {
  await ctx.stop();
});

/** src/app.js mounts both of these; mount them only when it has not. */
function mountGroups(app) {
  const stack = app._router.stack;
  const mounted = stack.some(
    (layer) => layer.name === 'router' && String(layer.regexp?.source).includes('api\\/groups')
  );
  if (mounted) return;
  app.use('/api/groups', groupRoutes);
  const layer = stack.pop();
  const before = stack.findIndex((row) => row.name === 'serveStatic');
  stack.splice(before === -1 ? stack.length : before, 0, layer);
}

/** The chat hangs off the group, so it inherits the group's isolation. */
function mountChat(app) {
  app.use('/api/groups/:id/chat', groupChatRoutes);
  const stack = app._router || app.router;
  const layer = stack.stack.pop();
  const before = stack.stack.findIndex((l) => l.handle && l.handle.name === 'notFound');
  stack.stack.splice(before === -1 ? stack.stack.length : before, 0, layer);
}

/* -------------------------------- fixtures --------------------------------- */

async function session(payload) {
  const agent = newAgent();
  // the WHOLE account, not `account.user`: withCsrf reads the CSRF token off it,
  // and every other suite in this folder holds it the same way
  const user = await registerStudent(agent, payload);
  return { agent, user };
}

async function createGroup(who, { name = 'Hostel mess', members = [] } = {}) {
  const res = await withCsrf(who.user, who.agent.post('/api/groups')).send({
    name,
    currency: 'PKR',
    members,
  });
  assert.equal(res.status, 201, res.text);
  return res.body.group;
}

const addMember = (who, groupId, body) =>
  withCsrf(who.user, who.agent.post(`/api/groups/${groupId}/members`)).send(body);

const addBill = (who, groupId, body = {}) =>
  withCsrf(who.user, who.agent.post(`/api/groups/${groupId}/expenses`)).send({
    title: 'Mess bill',
    amount: '450.00',
    date: '2026-09-10',
    splitType: 'equal',
    paidByIndex: 0,
    categoryId: mess._id.toString(),
    ...body,
  });

const post = (who, path, body = {}) => withCsrf(who.user, who.agent.post(path)).send(body);
const patch = (who, path, body = {}) => withCsrf(who.user, who.agent.patch(path)).send(body);
const chat = (who, groupId) => who.agent.get(`/api/groups/${groupId}/chat`);
const list = async (who) => (await who.agent.get('/api/groups')).body.rows;

/**
 * The whole scenario, once: an owner, a group, and a roommate invited by an email
 * address that has no account behind it yet.
 *
 * The address is stamped per call. A fixed one worked in the first test and made
 * every later one a 409, which reads like the feature is broken when it is only
 * the fixture colliding with itself.
 */
let invitation = 0;
async function invited() {
  const email = `bilal-hostel-${invitation++}@test.local`;
  const owner = await session({ name: 'Aisha' });
  const group = await createGroup(owner, {
    name: 'Hostel mess',
    members: [{ name: 'Bilal', email }],
  });
  return { owner, group, email };
}

/* =========================================================================== */

test('a roommate invited by email finds the group waiting the moment they sign up', async () => {
  const { owner, group, email } = await invited();

  // the bill exists BEFORE the roommate has an account, so the group has real
  // activity for them to be shown
  assert.equal((await addBill(owner, group.id)).status, 201);

  const roommate = await session({ name: 'Bilal', email });

  const rows = await list(roommate);
  assert.equal(rows.length, 1, 'the group an owner added them to is in their own list, unasked');
  assert.equal(rows[0].id, group.id);
  assert.equal(rows[0].name, 'Hostel mess');
  assert.equal(rows[0].isOwner, false, 'and they are not its owner');
  assert.equal(rows[0].memberCount, 2);
  assert.equal(rows[0].expenseCount, 1, 'with the activity already on it');
  assert.equal(rows[0].viewer.index, 1, 'and the list says which seat is theirs');
  assert.equal(rows[0].viewer.role, 'member', 'a new row has no role, and an absent role reads as member');
  assert.equal(rows[0].viewer.can.view, true, 'so it may read the group');
  assert.equal(
    rows[0].viewer.can.addBill,
    false,
    'and the list says so too, rather than leaving the screen to guess'
  );
  assert.equal(rows[0].viewer.can.manage, false);
});

test('the group list alone repairs a link that was missed, with no re-sign-up', async () => {
  const { group, email } = await invited();
  const roommate = await session({ name: 'Bilal', email });

  // Take the account link away behind the app's back, which is what an account
  // that already existed on the day the linking shipped looks like: a member row
  // with an email and no user. The list is documented to sweep it.
  const stored = await Group.findById(group.id);
  stored.members[1].user = null;
  await stored.save();

  assert.equal(
    (await Group.findById(group.id)).members[1].user,
    null,
    'the link really is gone, so this is a repair and not an accident'
  );

  // There is deliberately no read in between that shows the group missing. The
  // sweep runs inside the list request itself, before the aggregation that needs
  // the link, so the one read that could catch somebody missing their group is the
  // read that repairs it. A group can never blink out of a list and back, and this
  // is the assertion for that - an earlier version of this test looked for the
  // window and could not, because there is not one.
  const rows = await list(roommate);
  const row = rows.find((r) => r.id === group.id);
  assert.ok(row, 'the group is there on the very next read');
  assert.equal(row.viewer.index, 1);
  assert.equal(row.viewer.role, 'member');

  assert.ok(
    (await Group.findById(group.id)).members[1].user,
    'and the stored link was filled in, rather than the answer merely looking right'
  );
});

test('somebody who already has an account is linked the moment they are added', async () => {
  const owner = await session({ name: 'Aisha' });
  const roommate = await session({ name: 'Bilal', email: 'bilal-existing@test.local' });

  const group = await createGroup(owner, { name: 'Lab group' });
  assert.equal((await list(roommate)).length, 0, 'not in it yet');

  const added = await addMember(owner, group.id, { name: 'Bilal', email: 'bilal-existing@test.local' });
  assert.equal(added.status, 201, added.text);

  const rows = await list(roommate);
  assert.equal(rows.length, 1, 'and in it on their next read, with nothing to do');
  assert.equal(rows[0].viewer.index, 1);
});

test('a member sees the whole activity: the bills, the balances, the thread and the polls', async () => {
  const { owner, group, email } = await invited();
  await addBill(owner, group.id, { amount: '450.00' });
  assert.equal(
    (await post(owner, `/api/groups/${group.id}/chat/messages`, { text: 'chai at 4?' })).status,
    201
  );
  // the card's category is a closed list of what a card can be ABOUT - chai,
  // transport, food, an outing, shopping, something else - not one of the group's
  // own money categories. Sending 'Mess' was mine being wrong, and the refusal was
  // the server being right.
  assert.equal(
    (await post(owner, `/api/groups/${group.id}/chat/polls`, {
      category: 'chai',
      rate: '50',
      time: '16:00',
    })).status,
    201
  );

  const roommate = await session({ name: 'Bilal', email });

  /* the detail read: the same bills and the same balances as the owner sees */
  const theirs = await roommate.agent.get(`/api/groups/${group.id}`);
  assert.equal(theirs.status, 200, theirs.text);
  assert.equal(theirs.body.expenses.length, 1);
  assert.equal(Number(theirs.body.expenses[0].amount), 450);

  /* the board, and its sign: the payer is owed, the other half owes. There is no
     `amount` on a balance row - the five figures a balance is made of are named,
     and `net` is the one that is the balance. */
  const board = theirs.body.balances;
  assert.equal(board.length, 2, 'one row per member, both of them');
  assert.equal(board[0].paid, 450, 'the owner paid the whole bill');
  assert.equal(board[0].share, 225, 'and owes a 450 share of it');
  assert.equal(board[0].net, 225, 'so the owner is owed 225');
  assert.equal(board[1].paid, 0, 'the roommate paid nothing');
  assert.equal(board[1].share, 225, 'and owes their share');
  assert.equal(board[1].net, -225, 'a 450 bill split two ways is 225 each, and the two nets cancel');

  /* the thread, with both messages and the poll intact */
  const room = await chat(roommate, group.id);
  assert.equal(room.status, 200, room.text);
  assert.equal(room.body.rows.length, 2, 'the message and the poll, both readable');
  const poll = room.body.rows.find((r) => r.poll);
  assert.ok(poll, 'the poll is there');
  assert.equal(poll.poll.rate, 50);
  assert.equal(poll.poll.yesCount, 0, 'and nobody has answered it yet');
  assert.equal(poll.poll.noCount, 0);
  // the card is a snapshot of who was asked, so "has not answered" is a stored
  // row rather than an absent one - which is the only way the card can show who
  // is still to reply
  assert.equal(poll.poll.pendingCount, 2, 'both members are still pending, one row each');
  assert.equal(poll.poll.responses.length, 2);

  /* and the list counts it, so the group is visibly alive rather than empty */
  const rows = await list(roommate);
  assert.equal(rows[0].expenseCount, 1);
});

test('a member may join the conversation but may not touch the money or the group', async () => {
  const { group, email } = await invited();
  const roommate = await session({ name: 'Bilal', email });

  /* conversation is open to every member: that is the whole point of a room, and
     the roles govern records and money, never who may speak */
  const said = await post(roommate, `/api/groups/${group.id}/chat/messages`, { text: 'in!' });
  assert.equal(said.status, 201, said.text);
  assert.equal(said.body.message.text, 'in!');

  const thread = await chat(roommate, group.id);
  const mine = thread.body.rows.find((r) => r.isYou);
  assert.ok(mine, 'and it comes back marked as theirs, not the owner sent it');

  /* the money is not open */
  const bill = await addBill(roommate, group.id);
  assert.equal(bill.status, 403, 'a member cannot log a shared bill');
  assert.match(bill.body.error, /member/i, 'and the refusal says which role they hold');

  /* nor is the group itself */
  const renamed = await patch(roommate, `/api/groups/${group.id}`, { name: 'My mess' });
  assert.equal(renamed.status, 403);
  assert.equal(
    (await addMember(roommate, group.id, { name: 'Sana', email: 'sana-x@test.local' })).status,
    403,
    'nor may they add somebody else'
  );
});

test('the owner promotes a member with one call, and the role table then opens up', async () => {
  const { owner, group, email } = await invited();
  const roommate = await session({ name: 'Bilal', email });

  const promoted = await patch(owner, `/api/groups/${group.id}/members/1/role`, { role: 'admin' });
  assert.equal(promoted.status, 200, promoted.text);

  const bill = await addBill(roommate, group.id);
  assert.equal(bill.status, 201, 'and a promoted member can log a bill', bill.text);

  const list2 = await list(roommate);
  assert.equal(list2[0].viewer.role, 'admin', 'and the list reports the new role');
  assert.equal(
    list2[0].viewer.can.addBill,
    true,
    'with the capability the write above was just allowed by, read off the list itself'
  );

  /* and a demotion takes it away again, so the promotion is not a one-way door */
  const demoted = await patch(owner, `/api/groups/${group.id}/members/1/role`, { role: 'auditor' });
  assert.equal(demoted.status, 200, demoted.text);
  assert.equal((await addBill(roommate, group.id)).status, 403, 'an auditor reads and flags, and bills nothing');
  const back = (await list(roommate))[0];
  assert.equal(back.viewer.role, 'auditor', 'and the list follows it down as well as up');
  assert.equal(back.viewer.can.addBill, false, 'the capability goes with it');
});

test('a stranger is never in the list, and a group they are not in is a 404 not a 403', async () => {
  const { group } = await invited();
  const stranger = await session({ name: 'Sana' });

  assert.equal((await list(stranger)).length, 0, 'the list is theirs alone');

  const read = await stranger.agent.get(`/api/groups/${group.id}`);
  assert.equal(read.status, 404, 'and the group does not exist as far as they are concerned');
  assert.equal((await chat(stranger, group.id)).status, 404);
  assert.equal(
    (await post(stranger, `/api/groups/${group.id}/chat/messages`, { text: 'hello' })).status,
    404,
    'and they cannot even knock'
  );
});

test('the list finds the owner and the member by the two different halves of the query', async () => {
  const { owner, group, email } = await invited();
  const roommate = await session({ name: 'Bilal', email });

  const ownerRow = (await list(owner))[0];
  assert.equal(ownerRow.isOwner, true, 'the owner is found through the owner field');
  assert.equal(ownerRow.viewer.index, 0, 'and is the first seat');
  assert.equal(
    ownerRow.viewer.role,
    'admin',
    'an owner row carries no stored role and is an admin by construction, so the list says admin'
  );
  assert.equal(ownerRow.viewer.can.manage, true, 'and can always fix the roles');

  const memberRow = (await list(roommate))[0];
  assert.equal(memberRow.isOwner, false, 'the roommate is found through members.user');
  assert.equal(memberRow.viewer.index, 1);

  /* the owner is not found a second time as a member of their own group: a group
     that appeared twice in one person's list is a bug a person notices instantly */
  assert.equal((await list(owner)).length, 1);
});
