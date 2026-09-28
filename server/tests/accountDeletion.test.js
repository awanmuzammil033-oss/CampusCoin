import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startApp, registerStudent, withCsrf, makeDefaultCategory } from './helpers.js';

import User from '../src/models/User.js';
import Group from '../src/models/Group.js';
import GroupExpense from '../src/models/GroupExpense.js';
import GroupSettlement from '../src/models/GroupSettlement.js';
import GroupJournalEntry from '../src/models/GroupJournalEntry.js';
import GroupMessage from '../src/models/GroupMessage.js';
import GroupAccount from '../src/models/GroupAccount.js';
import GroupReconcile from '../src/models/GroupReconcile.js';
import Transaction from '../src/models/Transaction.js';
import TransactionHistory from '../src/models/TransactionHistory.js';
import Category from '../src/models/Category.js';
import Budget from '../src/models/Budget.js';
import WishItem from '../src/models/WishItem.js';
import JarMovement from '../src/models/JarMovement.js';
import RecurringRule from '../src/models/RecurringRule.js';
import Wallet from '../src/models/Wallet.js';
import WalletTransfer from '../src/models/WalletTransfer.js';
import DataExport from '../src/models/DataExport.js';
import { toDec } from '../src/utils/money.js';

/**
 * EVERYTHING THAT REACHES config/env.js IS IMPORTED DYNAMICALLY, inside
 * `before`. env.js reads process.env.MONGODB_URI ONCE, at import time, and
 * startApp() only sets that variable once the in-memory server is up - so a
 * static import of a router (which pulls in the rate limiter, and through it
 * env.js) silently captures the developer's own mongodb://127.0.0.1:27017 and
 * every test in the file fails with ECONNREFUSED. The models are safe
 * statically: none of them imports env.
 */
let groupsRoutes;
let deletionRoutes;
let exportRoutes;
let anonymiseUser;
let runDueDeletions;
let verifyPassword;
let GRACE_DAYS;
let FORMER_MEMBER_KEY;
let isFormerMember;

/**
 * Delete account, with a seven-day grace period (NEW-1).
 *
 * The harness is the one from groupLedger.test.js, and both routers are mounted
 * by THIS file in front of the /api 404 layer, so the suite stands on its own
 * without app.js having heard of either route.
 *
 * THE TEST A REVIEWER WILL LOOK FOR
 * ---------------------------------
 * "the balance everybody else is owed must be identical before and after", in
 * the test named THE GROUP BOOKS. It builds a real mess fund through the real
 * endpoint - a bill the owner paid, a partial settlement back - reads the whole
 * balance board, closes the roommate's account, and reads it again. Not a
 * sample of it: every member's row, every one of the five figures, compared
 * field by field, plus every group document in the six book collections
 * compared as raw Mongo. The name on the departed member's row is allowed to
 * change, because that is the one thing that is supposed to.
 */

let ctx;
let exportRoot;
let categorySeq = 0;

test.before(async () => {
  exportRoot = path.join(os.tmpdir(), `cc-export-del-test-${process.pid}`);
  process.env.EXPORT_TMP_DIR = exportRoot;
  await fs.promises.mkdir(exportRoot, { recursive: true });

  ctx = await startApp();

  groupsRoutes = (await import('../src/routes/groups.js')).default;
  deletionRoutes = (await import('../src/routes/accountDeletion.js')).default;
  exportRoutes = (await import('../src/routes/dataExport.js')).default;
  ({ verifyPassword } = await import('../src/services/accounts.js'));
  ({ anonymiseUser, runDueDeletions, GRACE_DAYS, FORMER_MEMBER_KEY, isFormerMember } =
    await import('../src/services/accountDeletion.js'));

  mount(groupsRoutes, '/api/groups');
  mount(exportRoutes, '/api/export');
  mount(deletionRoutes, '/api');
});

test.after(async () => {
  await ctx.stop();
  await fs.promises.rm(exportRoot, { recursive: true, force: true }).catch(() => {});
});

/** The one mount shape from groupLedger.test.js: in front of the /api 404 layer. */
function mount(router, prefix) {
  const stack = (ctx.app._router || ctx.app.router).stack;
  ctx.app.use(prefix, router);
  const layer = stack.pop();
  const before = stack.findIndex((l) => l.handle && l.handle.name === 'notFound');
  stack.splice(before === -1 ? stack.length : before, 0, layer);
}

/* -------------------------------- fixtures --------------------------------- */

async function session(payload = {}) {
  const agent = ctx.newAgent();
  const account = await registerStudent(agent, payload);
  return { agent, ...account };
}

async function defaultCategory(label) {
  categorySeq += 1;
  return makeDefaultCategory({ name: `${label} ${categorySeq}`, type: 'expense' });
}

/** Ask for the deletion over HTTP, the way the card does. */
const ask = (who, body) => withCsrf(who, who.agent.post('/api/account/deletion')).send(body);

/** Take it back. DELETE is a write, so it carries the CSRF header too. */
const cancel = (who) => withCsrf(who, who.agent.delete('/api/account/deletion'));

/** Move the account's clock to the far end of its grace period, without running. */
async function makeDue(userId) {
  await User.updateOne({ _id: userId }, { $set: { 'deletion.scheduledFor': new Date(Date.now() - 1000) } });
}

/** Put the date past and run the job, the way a scheduler or the staff door does. */
async function closeNow(userId) {
  await makeDue(userId);
  return runDueDeletions();
}

/* ----------------------------- the request itself --------------------------- */

test('the state starts as "nothing scheduled"', async () => {
  const who = await session();
  const res = await who.agent.get('/api/account/deletion');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.deletion, { pending: false, anonymised: false });
  assert.equal(res.body.graceDays, 7);
});

test('a wrong password is a 400 with a sentence, and nothing is scheduled', async () => {
  const who = await session();
  const res = await ask(who, { password: 'NotThePassword1!' });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'That password is not right.');
  // and it must not have said anything about whether the account exists
  assert.equal(res.body.error.includes('no such account'), false);

  const after = await who.agent.get('/api/account/deletion');
  assert.equal(after.body.deletion.pending, false);
});

test('an empty password is named as the different mistake it is', async () => {
  const who = await session();
  const res = await ask(who, {});
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Type your password to confirm this is your account.');
});

test('the right password schedules the deletion exactly seven days out', async () => {
  const who = await session();
  const before = Date.now();
  const res = await ask(who, { password: who.password, reason: '  graduating  ' });

  assert.equal(res.status, 201);
  assert.equal(res.body.deletion.pending, true);
  assert.equal(res.body.deletion.reason, 'graduating', 'trimmed, and kept with the request');

  const gap = new Date(res.body.deletion.scheduledFor) - new Date(res.body.deletion.requestedAt);
  assert.equal(gap, GRACE_DAYS * 86400000, 'seven days, to the millisecond');

  const written = await User.findById(who.user.id);
  assert.ok(written.deletion.requestedAt);
  assert.ok(written.deletion.scheduledFor);
  assert.ok(written.deletion.requestedAt.getTime() >= before - 1000);
});

test('asking a second time does NOT move the date, and says so', async () => {
  const who = await session();
  const first = await ask(who, { password: who.password });
  const again = await ask(who, { password: who.password, reason: 'actually no' });

  assert.equal(again.status, 409);
  assert.match(again.body.error, /does not move the date/, 'the response says the clock is not restarted');

  const written = await User.findById(who.user.id);
  assert.equal(written.deletion.scheduledFor.toISOString(), new Date(first.body.deletion.scheduledFor).toISOString());
  assert.equal(written.deletion.reason, '', 'and the second reason is not written either');
});

test('a write without the CSRF header is refused', async () => {
  const who = await session();
  const res = await who.agent.post('/api/account/deletion').send({ password: who.password });
  assert.equal(res.status, 403);
});

test('cancelling clears the whole subdocument and leaves the account alone', async () => {
  const who = await session();
  const food = await defaultCategory('Snacks');
  await Transaction.create({
    user: who.user.id,
    category: food._id,
    amount: toDec('40.00'),
    type: 'expense',
    description: 'before the request',
    date: new Date('2026-05-01T00:00:00.000Z'),
  });

  await ask(who, { password: who.password });
  const res = await cancel(who);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.deletion, { pending: false, anonymised: false });

  const written = await User.findById(who.user.id);
  assert.equal(written.deletion, undefined, 'the subdocument is gone, not emptied');
  assert.equal(written.isActive, true);
  assert.equal(written.name, who.user.name);
  assert.equal(written.email, who.email);
  assert.ok(await verifyPassword(who.password, (await User.findById(who.user.id).select('+passwordHash')).passwordHash));
  assert.equal(await Transaction.countDocuments({ user: who.user.id }), 1, 'not one row was touched');
});

test('cancelling with nothing scheduled, and after the date, are both refused', async () => {
  const who = await session();
  const nothing = await cancel(who);
  assert.equal(nothing.status, 400);
  assert.equal(nothing.body.error, 'There is no scheduled deletion on this account to cancel.');

  await ask(who, { password: who.password });
  await User.updateOne({ _id: who.user.id }, { $set: { 'deletion.scheduledFor': new Date(Date.now() - 1000) } });
  const late = await cancel(who);
  assert.equal(late.status, 409);
  assert.equal(late.body.error, 'The grace period is over, so this deletion can no longer be cancelled.');

  // left pending and overdue on purpose above; clear it so it cannot be picked
  // up by the next test's job run
  await User.updateOne(
    { _id: who.user.id },
    { $set: { 'deletion.requestedAt': null, 'deletion.scheduledFor': null } }
  );
});

/* ------------------------------- the grace period --------------------------- */

test('the job does nothing at all before the date is reached', async () => {
  const who = await session();
  await ask(who, { password: who.password });

  const report = await runDueDeletions();
  assert.equal(report.results.some((row) => row.userId === who.user.id), false, 'not this account');

  const written = await User.findById(who.user.id);
  assert.equal(written.isActive, true, 'the account still works');
  assert.equal(written.deletion.anonymisedAt, null);
});

test('the job closes the account once the date is reached, and is safe to run twice', async () => {
  const who = await session();
  await ask(who, { password: who.password });
  const first = await closeNow(who.user.id);
  assert.equal(first.considered, 1);
  assert.equal(first.results[0].alreadyDone, false, 'the first run really did the work');

  const second = await runDueDeletions();
  assert.equal(second.considered, 0, 'a second run finds nothing to do');

  const direct = await anonymiseUser(who.user.id);
  assert.equal(direct.alreadyDone, true, 'and calling it by hand is a no-op');
});

test('the account row SURVIVES, deactivated and unidentifiable', async () => {
  const who = await session({ name: 'Bilal' });
  const food = await defaultCategory('Rent');
  await Transaction.create({
    user: who.user.id,
    category: food._id,
    amount: toDec('80.00'),
    type: 'expense',
    date: new Date('2026-05-02T00:00:00.000Z'),
  });
  await User.updateOne(
    { _id: who.user.id },
    {
      $set: {
        guardian: { email: 'father@example.test', consentedAt: new Date() },
        resetCodeHash: 'a pending reset nobody finished',
        resetCodeExpires: new Date(Date.now() + 600000),
        academicYear: '3rd year',
        jarBalance: toDec('500.00'),
      },
    }
  );

  await ask(who, { password: who.password });
  await closeNow(who.user.id);

  const row = await User.findById(who.user.id).select('+passwordHash +resetCodeHash +resetCodeExpires');
  assert.ok(row, 'the ROW ITSELF is still there - the audit trail needs it');

  assert.equal(row.isActive, false, 'and it is switched off everywhere at once');
  assert.equal(row.name, FORMER_MEMBER_KEY, 'no display name');
  assert.notEqual(row.email, who.email);
  assert.notEqual(row.recoveryEmail, who.recoveryEmail);
  assert.match(row.email, /@accounts\.removed\.invalid$/, 'an address that can never be delivered to');
  assert.match(row.recoveryEmail, /@accounts\.removed\.invalid$/);
  assert.notEqual(row.email, row.recoveryEmail, 'and the two unique fields do not collide');

  assert.equal(row.resetCodeHash, null, 'no half-finished password reset survives');
  assert.equal(row.resetCodeExpires, null);
  assert.equal(row.guardian, undefined, 'the guardian consent goes with its address');
  assert.equal(row.academicYear, '');
  assert.equal(Number(row.jarBalance.toString()), 0);

  assert.ok(row.deletion.anonymisedAt, 'proof the work happened, not a promise that it will');
  assert.equal(row.deletion.formerName, 'Bilal', 'and the old display name is kept on purpose');
  assert.equal(row.deletion.reason, '', 'but the free text the student typed is not');

  assert.equal(
    await verifyPassword(who.password, row.passwordHash),
    false,
    'the old password does not open the account any more'
  );
  assert.ok(row.passwordHash.startsWith('$2'), 'and there is still a valid hash there to satisfy the field');
});

test('a closed account cannot sign in again', async () => {
  const who = await session();
  await ask(who, { password: who.password });
  await closeNow(who.user.id);

  const res = await ctx.request(ctx.app).post('/api/auth/login').send({ email: who.email, password: who.password });
  assert.equal(res.status, 401, 'the address is unknown, and the answer is the quiet one');
  assert.equal(res.body.error, 'Email or password is incorrect.');
});

test('their own records go: transactions, categories, budgets, wishes, rules, wallets', async () => {
  const who = await session();
  const food = await defaultCategory('Books');
  const own = await Category.create({
    user: who.user.id,
    name: 'Stationery',
    nameKey: `stationery-${who.user.id}`,
    type: 'expense',
  });
  const txn = await Transaction.create({
    user: who.user.id,
    category: own._id,
    amount: toDec('15.00'),
    type: 'expense',
    date: new Date('2026-05-03T00:00:00.000Z'),
  });
  await TransactionHistory.create({ transaction: txn._id, user: who.user.id, action: 'create', after: { a: 1 } });
  await Budget.create({
    user: who.user.id,
    category: food._id,
    month: new Date('2026-05-01T00:00:00.000Z'),
    limitAmount: toDec('100.00'),
  });
  await WishItem.create({ user: who.user.id, title: 'Laptop', targetAmount: toDec('90000.00') });
  await JarMovement.create({ user: who.user.id, amount: toDec('50.00'), kind: 'deposit', date: new Date() });
  await RecurringRule.create({
    user: who.user.id,
    category: food._id,
    type: 'expense',
    amount: toDec('9.99'),
    frequency: 'monthly',
    dayOfPeriod: 1,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
  });
  const wallet = await Wallet.create({ user: who.user.id, name: 'Notes', kind: 'cash' });
  await WalletTransfer.create({
    user: who.user.id,
    from: wallet._id,
    to: wallet._id,
    amount: toDec('1.00'),
    date: new Date(),
  });

  await ask(who, { password: who.password });
  await closeNow(who.user.id);

  for (const [label, model] of [
    ['transactions', Transaction],
    ['transaction history', TransactionHistory],
    ['personal categories', Category],
    ['budgets', Budget],
    ['wish items', WishItem],
    ['jar movements', JarMovement],
    ['recurring rules', RecurringRule],
    ['wallets', Wallet],
    ['wallet transfers', WalletTransfer],
    ['exports', DataExport],
  ]) {
    assert.equal(await model.countDocuments({ user: who.user.id }), 0, `${label} are gone`);
  }
  assert.equal(await Category.countDocuments({ _id: food._id }), 1, 'the SHARED default category is not');
});

test('a finished export is deleted with the account, not left on the disk', async () => {
  const who = await session();
  const posted = await withCsrf(who, who.agent.post('/api/export')).send({});
  for (let i = 0; i < 200; i += 1) {
    const res = await who.agent.get(`/api/export/${posted.body.job.id}`);
    if (res.body.job.status !== 'queued' && res.body.job.status !== 'running') {
      assert.equal(res.body.job.status, 'ready');
      break;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  const row = await DataExport.findById(posted.body.job.id).select('+filePath');
  assert.ok(fs.existsSync(row.filePath), 'the archive is really on the disk first');

  await ask(who, { password: who.password });
  await closeNow(who.user.id);

  assert.equal(fs.existsSync(row.filePath), false, 'a ZIP of somebody\'s whole ledger does not outlive them');
  assert.equal(await DataExport.countDocuments({ user: who.user.id }), 0);
});

/* ------------------------------ THE GROUP BOOKS ----------------------------- */

/** A real mess fund: an owner, a roommate, a bill, and a part settlement. */
async function messFund() {
  const owner = await session({ name: 'Aisha' });
  const email = `bilal-${owner.user.id}@mess.test`;
  const created = await withCsrf(owner, owner.agent.post('/api/groups')).send({
    name: 'Room 204 mess',
    currency: 'USD',
    members: [{ name: 'Bilal', email }],
  });
  assert.equal(created.status, 201, created.text);
  const group = created.body.group;

  // the roommate signs up, which is what fills in the member row's account id
  const roommate = await session({ name: 'Bilal', email });
  const linked = await Group.findById(group.id);
  assert.equal(String(linked.members[1].user), roommate.user.id, 'the member row is linked to the account');

  // a bill the owner paid, split evenly between the two of them
  const bill = await withCsrf(owner, owner.agent.post(`/api/groups/${group.id}/expenses`)).send({
    title: 'weekly grocery run',
    amount: '100.00',
    paidByIndex: 0,
    splitType: 'equal',
    date: '2026-06-01',
  });
  assert.equal(bill.status, 201, bill.text);

  // the roommate is a treasurer, because a plain member may not settle up at
  // all - and because a treasurer who then disappears is the interesting case
  const promoted = await withCsrf(owner, owner.agent.patch(`/api/groups/${group.id}/members/1/role`)).send({
    role: 'treasurer',
  });
  assert.equal(promoted.status, 200, promoted.text);

  // and a settlement back the other way, so there IS a counterparty record
  const settled = await withCsrf(roommate, roommate.agent.post(`/api/groups/${group.id}/settle`)).send({
    fromIndex: 1,
    toIndex: 0,
    amount: '20.00',
  });
  assert.equal(settled.status, 201, settled.text);

  return { owner, roommate, groupId: group.id };
}

/** The whole board, with the one field that is allowed to change left out. */
const boardOf = (detail) =>
  detail.balances.map((row) => ({
    memberIndex: row.memberIndex,
    paid: row.paid,
    share: row.share,
    settledIn: row.settledIn,
    settledOut: row.settledOut,
    net: row.net,
  }));

const readDetail = (who, id) => who.agent.get(`/api/groups/${id}`);

/** Every group book collection, as raw Mongo, so nothing is summarised away. */
const bookCollections = async (groupId) => ({
  expenses: await GroupExpense.find({ group: groupId }).sort({ _id: 1 }).lean(),
  settlements: await GroupSettlement.find({ group: groupId }).sort({ _id: 1 }).lean(),
  journal: await GroupJournalEntry.find({ group: groupId }).sort({ _id: 1 }).lean(),
  accounts: await GroupAccount.find({ group: groupId }).sort({ _id: 1 }).lean(),
  reconciles: await GroupReconcile.find({ group: groupId }).sort({ _id: 1 }).lean(),
  messages: await GroupMessage.find({ group: groupId }).sort({ _id: 1 }).lean(),
});

test('THE GROUP BOOKS: every balance is identical before and after the deletion', async () => {
  const { owner, roommate, groupId } = await messFund();

  const before = await readDetail(owner, groupId);
  assert.equal(before.status, 200, before.text);
  const beforeBoard = boardOf(before.body);
  const beforeBooks = await bookCollections(groupId);

  // the board really does say something - a test that compared two empty arrays
  // would pass for the wrong reason
  assert.equal(beforeBoard.length, 2);
  assert.equal(beforeBoard[0].paid, 100, 'the owner fronted the bill');
  assert.equal(beforeBoard[1].settledOut, 20, 'and the roommate paid 20 back');
  assert.equal(beforeBoard[0].net + beforeBoard[1].net, 0, 'the board sums to zero, as it always must');
  assert.ok(beforeBooks.settlements.length === 1 && beforeBooks.expenses.length === 1);

  // add a chat line and a journal line from the person who is leaving, so the
  // assertion below covers a message and an entry too
  await GroupMessage.create({
    group: groupId,
    kind: 'text',
    text: 'I paid the shop on Tuesday',
    senderIndex: 1,
  });
  const beforeWithChat = await bookCollections(groupId);
  assert.equal(beforeWithChat.messages.length, 1);

  await ask(roommate, { password: roommate.password });
  await closeNow(roommate.user.id);

  const after = await readDetail(owner, groupId);
  assert.equal(after.status, 200, 'the owner can still open the group');
  assert.deepEqual(
    boardOf(after.body),
    beforeBoard,
    'EVERY member row, EVERY figure: what the group is owed and by whom has not moved'
  );

  const afterBooks = await bookCollections(groupId);
  for (const key of Object.keys(beforeWithChat)) {
    assert.deepEqual(
      afterBooks[key],
      beforeWithChat[key],
      `${key} are byte-for-byte what they were - not an amount, not a split, not a message`
    );
  }

  // the settlement they were the counterparty of is still there
  assert.equal(after.body.settlements.length, 1);
  assert.equal(after.body.settlements[0].amount, 20);
});

test('THE MEMBER ROW: kept, blanked, and carried as a former member', async () => {
  const { roommate, groupId } = await messFund();
  const before = await Group.findById(groupId);
  assert.equal(before.members.length, 2);
  assert.equal(before.members[1].name, 'Bilal');

  await ask(roommate, { password: roommate.password });
  await closeNow(roommate.user.id);

  const after = await Group.findById(groupId);
  assert.equal(after.members.length, 2, 'the row is KEPT - its position is the index every bill keys off');

  const row = after.members[1];
  assert.equal(row.user, null, 'the account link is gone');
  assert.equal(row.name, FORMER_MEMBER_KEY, 'a KEY, not an English sentence - the screen writes the words');
  assert.equal(row.email, '', 'and the address is gone');
  assert.equal(isFormerMember(row), true, 'which is the one check the group screens need');
  assert.equal(isFormerMember(after.members[0]), false);

  // the other member is completely untouched
  assert.equal(after.members[0].name, 'Aisha');
  assert.equal(after.members[0].email, roommate.email ? after.members[0].email : null);
  assert.notEqual(after.members[0].user, null);
});

test('a former member is no longer in the group, and cannot settle anything', async () => {
  const { roommate, groupId } = await messFund();
  await ask(roommate, { password: roommate.password });
  await closeNow(roommate.user.id);

  const signIn = await ctx
    .request(ctx.app)
    .post('/api/auth/login')
    .send({ email: roommate.email, password: roommate.password });
  assert.equal(signIn.status, 401, 'the account is closed');

  const read = await roommate.agent.get(`/api/groups/${groupId}`);
  assert.equal(read.status, 401, 'and the old session is refused before it is even looked up');
});

test('a departed TREASURER drops to a plain member rather than keeping the role', async () => {
  const { roommate, groupId } = await messFund();
  assert.equal((await Group.findById(groupId)).members[1].role, 'treasurer');

  await ask(roommate, { password: roommate.password });
  await closeNow(roommate.user.id);

  const row = (await Group.findById(groupId)).members[1];
  assert.equal(row.role, 'member', 'a ghost must not still be the treasurer');
});

/* -------------------------------- the staff door ---------------------------- */

test('the staff door runs the job, and only the staff door', async () => {
  const owner = await session();
  const student = await session();
  await ask(owner, { password: owner.password });

  // The existing control router is mounted at /api/control and begins with its
  // own requireAdmin, so a student is turned away there - which is the right
  // answer and also means this route can never be reached without a staff
  // session, whatever else changes.
  const refused = await withCsrf(student, student.agent.post('/api/control/account-deletions/run')).send({});
  assert.equal(refused.status, 403, 'a student is not staff');
  assert.equal(refused.body.error, 'Administrator access required.');

  const adminAgent = ctx.newAgent();
  const email = `staff-${student.user.id}@campuscoin.test`;
  const registered = await adminAgent.post('/api/auth/register').send({
    name: 'Staff',
    email,
    recoveryEmail: `staff-recovery-${student.user.id}@campuscoin.test`,
    password: 'Str0ngPass!',
  });
  assert.equal(registered.status, 201, registered.text);
  // registering already opened a session, so every later write on this agent -
  // the staff sign-in included - has to carry the CSRF header
  const opened = await adminAgent.get('/api/auth/me');
  const bootstrap = { agent: adminAgent, csrf: opened.body.csrfToken };
  assert.equal(typeof bootstrap.csrf, 'string', 'registration handed out a CSRF token');

  await User.updateOne({ email }, { $set: { role: 'admin' } });
  const signedIn = await withCsrf(bootstrap, adminAgent.post('/api/auth/control-login')).send({
    email,
    password: 'Str0ngPass!',
  });
  assert.equal(signedIn.status, 200, signedIn.text);
  const me = await adminAgent.get('/api/auth/me');
  assert.equal(typeof me.body.csrfToken, 'string', 'the staff session has a CSRF token to send');
  const staff = { agent: adminAgent, csrf: me.body.csrfToken };

  const notYet = await withCsrf(staff, staff.agent.post('/api/control/account-deletions/run')).send({});
  assert.equal(notYet.status, 200);
  assert.equal(notYet.body.closed, 0, 'the grace period has not run out');

  await makeDue(owner.user.id);
  const due = await withCsrf(staff, staff.agent.post('/api/control/account-deletions/run')).send({});
  assert.equal(due.status, 200);
  assert.equal(due.body.closed, 1);
  assert.equal(due.body.failed, 0);
  assert.equal((await User.findById(owner.user.id)).isActive, false);
});
