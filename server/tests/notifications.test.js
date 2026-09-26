import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, withCsrf } from './helpers.js';

/**
 * The notification panel's server half.
 *
 * The panel can mark a row read AND unread, so the endpoint has to do both,
 * keep the count honest, refuse to touch somebody else's row, and answer a
 * rubbish id with a 404 rather than a stack trace. The harness (in-memory
 * database, real sign-ups, real sessions) is copied from the other suites.
 */

let ctx;
let hassan; // { user, csrf, agent }
let ayesha; // a second student, to prove rows stay personal

test.before(async () => {
  ctx = await startApp();
  const { default: Notification } = await import('../src/models/Notification.js');

  // each student gets their own cookie jar, and registerStudent() hands back the
  // session the CSRF token lives on
  const hassanAgent = ctx.newAgent();
  const ayeshaAgent = ctx.newAgent();
  hassan = { agent: hassanAgent, ...(await registerStudent(hassanAgent, { email: 'bell.one@test.local', name: 'Hassan' })) };
  ayesha = { agent: ayeshaAgent, ...(await registerStudent(ayeshaAgent, { email: 'bell.two@test.local', name: 'Ayesha' })) };

  // three rows for Hassan, one for Ayesha, written straight to the model so the
  // test does not depend on how a budget happens to be crossed this month
  await Notification.create([
    { user: hassan.user.id, kind: 'budget_near', message: 'Food is at 82% of its limit.' },
    { user: hassan.user.id, kind: 'budget_exceeded', message: 'Transport is over its limit.' },
    { user: hassan.user.id, kind: 'system', message: 'Your recurring rent was added.' },
  ]);
  await Notification.create({
    user: ayesha.user.id,
    kind: 'budget_near',
    message: 'Ayesha has her own warning.',
  });

  // and one row marked read already, so "mark as unread" has something to undo
  const read = await Notification.create({
    user: hassan.user.id,
    kind: 'system',
    message: 'An older notice that was already read.',
  });
  read.isRead = true;
  await read.save();
});

test.after(async () => {
  await ctx.stop();
});

/* --------------------------------- helpers --------------------------------- */

const feed = (who) => who.agent.get('/api/notifications');

async function findRow(who, message) {
  const res = await feed(who);
  assert.equal(res.status, 200);
  return res.body.rows.find((r) => r.message === message);
}

function setRead(who, id, isRead) {
  return withCsrf(who, who.agent.patch(`/api/notifications/${id}`)).send({ isRead });
}

/* ---------------------------------- tests ---------------------------------- */

test('the feed is the person’s own rows, newest first, with an unread count', async () => {
  const mine = await feed(hassan);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.unread, 3, 'three of Hassan\'s four rows start unread');

  const messages = mine.body.rows.map((r) => r.message);
  assert.equal(messages.some((m) => m.includes('Ayesha')), false, 'another student’s row never appears');
  assert.equal(messages.length, 4);

  const times = mine.body.rows.map((r) => new Date(r.createdAt).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a), 'newest on top');

  const theirs = await feed(ayesha);
  assert.equal(theirs.body.rows.length, 1, 'the other student sees exactly her own row');
  assert.equal(theirs.body.rows[0].message, 'Ayesha has her own warning.');
});

test('marking as read clears the row and the count, and comes back in the answer', async () => {
  const row = await findRow(hassan, 'Food is at 82% of its limit.');
  assert.equal(row.isRead, false);

  const res = await setRead(hassan, row.id, true);
  assert.equal(res.status, 200);
  assert.equal(res.body.isRead, true, 'the answer says what the row now is');
  assert.equal(res.body.unread, 2, 'and the count it sent matches');

  const after = await findRow(hassan, 'Food is at 82% of its limit.');
  assert.equal(after.isRead, true, 'and it really was written');
});

test('marking as unread puts it back — people clear a warning before they act on it', async () => {
  const row = await findRow(hassan, 'Food is at 82% of its limit.');
  const res = await setRead(hassan, row.id, false);
  assert.equal(res.status, 200);
  assert.equal(res.body.isRead, false);
  assert.equal(res.body.unread, 3, 'the count is back where it started');

  const after = await findRow(hassan, 'Food is at 82% of its limit.');
  assert.equal(after.isRead, false);
});

test('read-all clears the person’s rows and nothing else', async () => {
  const res = await withCsrf(hassan, hassan.agent.post('/api/notifications/read-all'));
  assert.equal(res.status, 200);

  const mine = await feed(hassan);
  assert.equal(mine.body.unread, 0, 'nothing of Hassan’s is unread any more');
  assert.equal(mine.body.rows.every((r) => r.isRead || String(r.id).startsWith('ann-')), true);

  const theirs = await feed(ayesha);
  assert.equal(theirs.body.unread, 1, 'Ayesha’s own unread row is untouched');
});

test('a row that belongs to somebody else is a 404, not a silent no-op', async () => {
  const herRow = await findRow(ayesha, 'Ayesha has her own warning.');

  const res = await setRead(hassan, herRow.id, true);
  assert.equal(res.status, 404, 'Hassan cannot reach Ayesha’s notification');
  assert.match(res.body.error, /not in your list/i);

  const still = await findRow(ayesha, 'Ayesha has her own warning.');
  assert.equal(still.isRead, false, 'and it is still unread for her');
});

test('a rubbish id is a 404, and a missing flag is a 400 — both readable', async () => {
  const notAnId = await setRead(hassan, 'not-an-object-id', true);
  assert.equal(notAnId.status, 404, 'a malformed id never reaches the database as a cast error');

  const unknown = await setRead(hassan, '507f1f77bcf86cd799439011', true);
  assert.equal(unknown.status, 404);

  const row = await findRow(hassan, 'An older notice that was already read.');
  for (const body of [{}, { isRead: 'yes' }, { isRead: 1 }, { read: true }]) {
    const res = await withCsrf(hassan, hassan.agent.patch(`/api/notifications/${row.id}`)).send(body);
    assert.equal(res.status, 400, `${JSON.stringify(body)} is refused`);
    assert.match(res.body.error, /isRead/i, 'and the answer says what was wrong');
  }
});

test('the panel needs a session, and a write needs the CSRF token', async () => {
  const stranger = ctx.newAgent();

  const read = await stranger.get('/api/notifications');
  assert.equal(read.status, 401, 'the feed is not public');

  const row = await findRow(hassan, 'Your recurring rent was added.');
  const noToken = await stranger.patch(`/api/notifications/${row.id}`).send({ isRead: true });
  assert.equal(noToken.status, 401, 'a signed-out caller cannot write either');

  const noCsrf = await hassan.agent.patch(`/api/notifications/${row.id}`).send({ isRead: true });
  assert.equal(noCsrf.status, 403, 'a session without the token cannot write');
});
