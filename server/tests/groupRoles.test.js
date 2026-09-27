/**
 * Group roles and permissions (GRP-1).
 *
 * The point of this suite is the refusals: a role nobody is stopped from breaking
 * is decoration. So every capability is checked from the wrong side as well - a
 * treasurer who cannot rename the group, an auditor who cannot post, and a
 * stranger who gets a 404 rather than a 403 that would confirm the group exists.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, withCsrf } from './helpers.js';
import groupsRoutes from '../src/routes/groups.js';

let ctx;
let newAgent;
let request;

let owner;
let treasurer;
let auditor;
let plain;
let group;

/**
 * The groups router is mounted by the app itself in src/app.js. This suite
 * mounts it the same way when it is not there yet, so the tests stand on their
 * own: the layer goes in front of the static handler, exactly where app.js hangs
 * its routers, which leaves the app's own error handler behind it.
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

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
  request = ctx.request;
  mountGroups(ctx.app);

  const session = async (name) => {
    const agent = newAgent();
    const user = await registerStudent(agent, { name });
    return { agent, user };
  };

  owner = await session('Room Owner');
  treasurer = await session('Tab Treasury');
  auditor = await session('Aud Ahmed');
  plain = await session('Plain Member');

  const created = await withCsrf(owner.user, owner.agent.post('/api/groups')).send({
    name: 'Roles mess',
    currency: 'PKR',
    members: [
      { name: 'Tab Treasury', email: treasurer.user.email },
      { name: 'Aud Ahmed', email: auditor.user.email },
      { name: 'Plain Member', email: plain.user.email },
    ],
  });
  assert.equal(created.status, 201, created.text);
  group = created.body.group;
});

test.after(async () => {
  await ctx.stop();
});

/* --------------------------------- helpers -------------------------------- */

const bill = (body = {}) => ({
  title: 'Mess bill',
  amount: '1200.00',
  date: '2026-09-20',
  splitType: 'equal',
  paidByIndex: 0,
  ...body,
});

const addBill = (who, groupId, body) =>
  withCsrf(who.user, who.agent.post(`/api/groups/${groupId}/expenses`)).send(body);

const setRole = (who, groupId, memberIndex, role) =>
  withCsrf(who.user, who.agent.patch(`/api/groups/${groupId}/members/${memberIndex}/role`)).send({ role });

const read = (who, groupId) => who.agent.get(`/api/groups/${groupId}`);

// the detail answers { group, members, expenses, balances } - the roster is a
// sibling of the group, not a field inside it
const named = (body, name) => body.members.find((row) => row.name === name);

const promote = async (name, role) => {
  const res = await read(owner, group.id);
  const at = named(res.body, name).index;
  return setRole(owner, group.id, at, role);
};

/* ------------------------------------------------------- the role table -- */

test('the four roles exist, and the owner is an admin by construction', async () => {
  const res = await read(owner, group.id);
  assert.equal(res.status, 200, res.text);

  // a group written before roles existed reads as: owner admin, everybody else a
  // member. Nobody is locked out of reading, and nobody can post.
  assert.deepEqual(
    res.body.members.map((row) => row.role), [
    'admin',
    'member',
    'member',
    'member',
  ]);

  const viewer = res.body.group.viewer;
  assert.equal(viewer.role, 'admin');
  assert.equal(viewer.index, 0);
  assert.equal(viewer.can.manage, true);
  assert.equal(viewer.can.addBill, true);
  assert.equal(viewer.can.postJournal, true);
  assert.equal(viewer.can.reconcile, true);
  assert.equal(viewer.can.flag, true);
});

test('a plain member sees the group and its history, and nothing else', async () => {
  const res = await read(plain, group.id);
  assert.equal(res.status, 200, res.text);

  const viewer = res.body.group.viewer;
  assert.equal(viewer.role, 'member');
  assert.equal(viewer.can.view, true);
  assert.equal(viewer.can.addBill, false);
  assert.equal(viewer.can.postJournal, false);
  assert.equal(viewer.can.reconcile, false);
  assert.equal(viewer.can.flag, false);
  assert.equal(viewer.can.manage, false);

  assert.ok(Array.isArray(res.body.expenses));
  assert.ok(Array.isArray(res.body.balances));
});

/* --------------------------------------------------------- moving a role -- */

test('the owner promotes a treasurer, and the powers change on both sides at once', async () => {
  const before = await read(plain, group.id);
  const at = named(before.body, 'Tab Treasury').index;

  // a treasurer who is not one yet cannot log a bill
  assert.equal((await addBill(treasurer, group.id, bill())).status, 403);

  const moved = await setRole(owner, group.id, at, 'treasurer');
  assert.equal(moved.status, 200, moved.text);
  assert.equal(moved.body.group.viewer.role, 'admin');

  // a role change answers with the group alone, so the roster is read again
  const after = await read(owner, group.id);
  assert.equal(named(after.body, 'Tab Treasury').role, 'treasurer');

  // the very same request now succeeds
  const logged = await addBill(treasurer, group.id, bill());
  assert.equal(logged.status, 201, logged.text);
  assert.equal(logged.body.expense.title, 'Mess bill');
});

test('a treasurer cannot change roles, rename the group, add a roommate or delete it', async () => {
  const res = await read(owner, group.id);
  const at = named(res.body, 'Aud Ahmed').index;

  const role = await setRole(treasurer, group.id, at, 'member');
  assert.equal(role.status, 403);
  assert.match(role.body.error, /treasurer|owner/i);

  const rename = await withCsrf(treasurer.user, treasurer.agent.patch(`/api/groups/${group.id}`)).send({
    name: 'Not your group',
  });
  assert.equal(rename.status, 403);

  const add = await withCsrf(treasurer.user, treasurer.agent.post(`/api/groups/${group.id}/members`)).send({
    name: 'Someone New',
  });
  assert.equal(add.status, 403);

  const remove = await withCsrf(treasurer.user, treasurer.agent.delete(`/api/groups/${group.id}`)).send();
  assert.equal(remove.status, 403);

  // and none of it took effect
  const after = await read(owner, group.id);
  assert.equal(after.body.group.name, group.name);
  assert.equal(after.body.members.length, 4);
});

test("the owner's own row cannot be demoted, and an account-less roommate cannot be given a role", async () => {
  const demote = await setRole(owner, group.id, 0, 'member');
  assert.equal(demote.status, 400);
  assert.match(demote.body.error, /owner/i);

  const invited = await withCsrf(owner.user, owner.agent.post(`/api/groups/${group.id}/members`)).send({
    name: 'No Account Yet',
    email: 'ghost-roles@test.local',
  });
  assert.equal(invited.status, 201, invited.text);
  const invitedAgain = await read(owner, group.id);
  const ghost = named(invitedAgain.body, 'No Account Yet');
  assert.equal(ghost.user, null);
  assert.equal(ghost.role, 'member');

  const promoteGhost = await setRole(owner, group.id, ghost.index, 'treasurer');
  assert.equal(promoteGhost.status, 400);
  assert.match(promoteGhost.body.error, /has not signed up/);
});

test('a role that does not exist is refused, and nothing is written', async () => {
  const before = await read(owner, group.id);
  const at = named(before.body, 'Plain Member').index;

  const bad = await setRole(owner, group.id, at, 'chief');
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /four group roles/);

  const after = await read(owner, group.id);
  assert.equal(named(after.body, 'Plain Member').role, 'member');
});

/* --------------------------------------------------------- money is gated -- */

test('a plain member cannot log a bill or settle up, and the refusal says what to do', async () => {
  const logged = await addBill(plain, group.id, bill({ title: 'Not mine to add' }));
  assert.equal(logged.status, 403);
  assert.match(logged.body.error, /treasurer|owner/i);

  const settled = await withCsrf(plain.user, plain.agent.post(`/api/groups/${group.id}/settle`)).send({
    fromIndex: 1,
    toIndex: 0,
    amount: '100.00',
    date: '2026-09-20',
  });
  assert.equal(settled.status, 403);
});

test('an auditor can read everything and change nothing', async () => {
  assert.equal((await promote('Aud Ahmed', 'auditor')).status, 200);

  const res = await read(auditor, group.id);
  assert.equal(res.status, 200, res.text);
  const viewer = res.body.group.viewer;
  assert.equal(viewer.role, 'auditor');
  assert.equal(viewer.can.view, true);
  assert.equal(viewer.can.flag, true);
  assert.equal(viewer.can.addBill, false);
  assert.equal(viewer.can.postJournal, false);
  assert.equal(viewer.can.reconcile, false);
  assert.equal(viewer.can.manage, false);

  const logged = await addBill(auditor, group.id, bill({ title: 'Auditor bill' }));
  assert.equal(logged.status, 403);
});

test('somebody outside the group gets a 404, never a 403 that would confirm it exists', async () => {
  const stranger = newAgent();
  const user = await registerStudent(stranger, { name: 'No Access' });

  const seen = await stranger.get(`/api/groups/${group.id}`);
  assert.equal(seen.status, 404);

  const moved = await withCsrf(user, stranger.patch(`/api/groups/${group.id}/members/1/role`)).send({
    role: 'treasurer',
  });
  assert.equal(moved.status, 404);

  const logged = await withCsrf(user, stranger.post(`/api/groups/${group.id}/expenses`)).send(bill());
  assert.equal(logged.status, 404);
});

/* ------------------------------------------------------------- flagging -- */

test('an auditor flags a bill with a reason, and the money on the row does not move', async () => {
  const list = await read(owner, group.id);
  const target = list.body.expenses[0];
  assert.ok(target, 'the treasurer logged a bill earlier');

  const empty = await withCsrf(
    auditor.user,
    auditor.agent.post(`/api/groups/${group.id}/expenses/${target.id}/flag`)
  ).send({ reason: '' });
  assert.equal(empty.status, 400);

  const flagged = await withCsrf(
    auditor.user,
    auditor.agent.post(`/api/groups/${group.id}/expenses/${target.id}/flag`)
  ).send({ reason: 'The receipt says 12 bags, this bill says 6.' });

  assert.equal(flagged.status, 201, flagged.text);
  assert.equal(flagged.body.expense.flag.open, true);
  assert.equal(flagged.body.expense.flag.reason, 'The receipt says 12 bags, this bill says 6.');
  assert.equal(flagged.body.expense.flag.byName, 'Aud Ahmed');

  // a flag is a question, not an edit
  assert.equal(flagged.body.expense.amount, 1200);
  assert.equal(flagged.body.expense.split.length, 4);
  assert.equal(flagged.body.expense.paidByIndex, 0);

  const denied = await withCsrf(
    plain.user,
    plain.agent.post(`/api/groups/${group.id}/expenses/${target.id}/flag`)
  ).send({ reason: 'I do not like it' });
  assert.equal(denied.status, 403);
});

test('the treasurer closes the flag with a note, and the question itself stays on the row', async () => {
  const list = await read(treasurer, group.id);
  const open = list.body.expenses.find((row) => row.flag && row.flag.open);
  assert.ok(open, 'the flag from the previous test is still open');

  const cleared = await withCsrf(
    treasurer.user,
    treasurer.agent.post(`/api/groups/${group.id}/expenses/${open.id}/flag/clear`)
  ).send({ note: 'Checked the receipt: 6 bags, the shop wrote 12 by mistake.' });

  assert.equal(cleared.status, 200, cleared.text);
  assert.equal(cleared.body.expense.flag.open, false);
  assert.ok(cleared.body.expense.flag.resolvedAt);
  assert.match(cleared.body.expense.flag.resolution, /receipt/);
  assert.match(cleared.body.expense.flag.reason, /receipt says 12 bags/);
});

/* ----------------------------------------------------- the powers travel -- */

test('the groups list carries the role, so a button is never offered that would be refused', async () => {
  const seen = await auditor.agent.get('/api/groups');
  assert.equal(seen.status, 200, seen.text);
  const row = seen.body.rows.find((entry) => entry.id === group.id);
  assert.ok(row, 'the group is in the list');
  assert.equal(row.viewer.role, 'auditor');
  assert.equal(row.viewer.can.flag, true);
  assert.equal(row.viewer.can.addBill, false);
  assert.equal(row.viewer.can.manage, false);

  const mine = await owner.agent.get('/api/groups');
  const ownerRow = mine.body.rows.find((entry) => entry.id === group.id);
  assert.equal(ownerRow.viewer.role, 'admin');
  assert.equal(ownerRow.viewer.can.manage, true);
});

test('the chat stays open to every member: roles govern records, not conversation', async () => {
  const sent = await withCsrf(plain.user, plain.agent.post(`/api/groups/${group.id}/chat/messages`)).send({
    text: 'just asking',
  });
  assert.equal(sent.status, 201, sent.text);
  assert.equal(sent.body.message.sender.name, 'Plain Member');
});
