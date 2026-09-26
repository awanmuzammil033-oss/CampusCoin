import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { startApp, registerStudent, withCsrf } from './helpers.js';
import wishlistRoutes from '../src/routes/wishlist.js';

let ctx;
let newAgent;

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
  mountWishlist(ctx.app);
});

test.after(async () => {
  await ctx.stop();
});

/**
 * app.js mounts the wishlist router itself; this suite also has to stand on its
 * own, so when the shared app has not been given the mount yet we slot the very
 * same router into the same place — in front of the built-client catch-all,
 * which would otherwise answer every /api path with "not found". A no-op the
 * moment the real mount is there.
 */
function mountWishlist(app) {
  const stack = app._router?.stack || [];
  const mounted = stack.some((layer) => layer.handle === wishlistRoutes);
  if (mounted) return;

  const probe = express();
  probe.use('/api/wishlist', wishlistRoutes);
  const layer = probe._router.stack[probe._router.stack.length - 1];
  const before = stack.findIndex((l) => l.name === 'serveStatic');
  app._router.stack.splice(before === -1 ? stack.length : before, 0, layer);
}

async function session() {
  const agent = newAgent();
  const user = await registerStudent(agent);
  return { agent, user };
}

function createWish(who, body = {}) {
  return withCsrf(who.user, who.agent.post('/api/wishlist'))
    .send({ title: 'Headphones', targetAmount: '100.00', ...body })
    .then((res) => {
      assert.equal(res.status, 201, res.text);
      return res.body.wish;
    });
}

function move(who, kind, body) {
  return withCsrf(who.user, who.agent.post(`/api/wishlist/jar/${kind}`)).send(body);
}

/* ------------------------- create, list and the maths ------------------------ */

test('a new wish lists with its progress, the jar balance and the summary', async () => {
  const who = await session();
  const created = await createWish(who, { title: 'Headphones', targetAmount: '100.00', icon: '🎧' });

  assert.equal(created.title, 'Headphones');
  assert.equal(created.icon, '🎧'); // the chosen emoji is stored as text
  assert.equal(created.targetAmount, 100);
  assert.equal(created.savedAmount, 0);
  assert.equal(created.progress, 0);
  assert.equal(created.remaining, 100);
  assert.equal(created.pct, 0);
  assert.equal(created.status, 'saving');

  const list = await who.agent.get('/api/wishlist');
  assert.equal(list.status, 200);
  assert.equal(list.body.rows.length, 1);
  assert.equal(list.body.rows[0].id, created.id);
  assert.equal(list.body.jarBalance, 0);
  assert.deepEqual(list.body.summary, { totalTarget: 100, totalSaved: 0, count: 1, countAchieved: 0 });
});

test('a wish needs a name and a sane positive target', async () => {
  const who = await session();

  const noName = await withCsrf(who.user, who.agent.post('/api/wishlist')).send({ targetAmount: '10.00' });
  assert.equal(noName.status, 400);
  assert.match(noName.body.error, /name/i);

  const noTarget = await createWishFails(who, { targetAmount: '0' });
  assert.equal(noTarget.status, 400);

  const tooBig = await createWishFails(who, { targetAmount: '9999999999' });
  assert.equal(tooBig.status, 400);
});

function createWishFails(who, body) {
  return withCsrf(who.user, who.agent.post('/api/wishlist')).send({ title: 'Headphones', targetAmount: '10.00', ...body });
}

/* ------------------------------ the jar moves ------------------------------- */

test('a deposit raises the jar and the wish it was for, and is not a transaction', async () => {
  const who = await session();
  const wish = await createWish(who, { targetAmount: '100.00' });

  const put = await move(who, 'deposit', { amount: '25.00', wishItemId: wish.id, note: 'skipped the campus coffee' });
  assert.equal(put.status, 201, put.text);
  assert.equal(put.body.jarBalance, 25);
  assert.equal(put.body.wish.savedAmount, 25);
  assert.equal(put.body.wish.progress, 0.25);
  assert.equal(put.body.wish.remaining, 75);
  assert.equal(put.body.wish.status, 'saving');

  // A plain deposit fills the jar without promising it to any wish.
  const plain = await move(who, 'deposit', { amount: '10.00' });
  assert.equal(plain.status, 201);
  assert.equal(plain.body.jarBalance, 35);
  assert.equal(plain.body.wish, null);

  // The jar is a pot inside the app, never spending: neither the ledger nor the
  // report may show a single cent of it.
  const ledger = await who.agent.get('/api/transactions');
  assert.equal(ledger.body.rows.length, 0);
  const report = await who.agent.get('/api/reports?tab=filtered');
  assert.equal(report.body.totals.income, 0);
  assert.equal(report.body.totals.expense, 0);
  assert.equal(report.body.total, 0);
});

test('reaching the target flips the wish to achieved and stamps the day', async () => {
  const who = await session();
  const wish = await createWish(who, { targetAmount: '60.00' });

  await move(who, 'deposit', { amount: '40.00', wishItemId: wish.id });
  const done = await move(who, 'deposit', { amount: '20.00', wishItemId: wish.id });
  assert.equal(done.status, 201);

  assert.equal(done.body.wish.status, 'achieved');
  assert.equal(done.body.wish.savedAmount, 60);
  assert.equal(done.body.wish.progress, 1);
  assert.equal(done.body.wish.remaining, 0);
  assert.ok(done.body.wish.achievedAt, 'the day it was reached is recorded');

  const list = await who.agent.get('/api/wishlist');
  assert.equal(list.body.rows[0].status, 'achieved');
  assert.equal(list.body.summary.countAchieved, 1);
  assert.equal(list.body.summary.totalSaved, 60);
});

test('the jar can never be taken below zero', async () => {
  const who = await session();
  await move(who, 'deposit', { amount: '20.00' });

  const tooMuch = await move(who, 'withdraw', { amount: '20.01' });
  assert.equal(tooMuch.status, 400);
  assert.match(tooMuch.body.error, /jar/i);

  const stillThere = await who.agent.get('/api/wishlist/jar');
  assert.equal(stillThere.body.jarBalance, 20, 'a refused withdrawal changes nothing');

  // exactly what the jar holds is fine
  const exact = await move(who, 'withdraw', { amount: '20.00' });
  assert.equal(exact.status, 201);
  assert.equal(exact.body.jarBalance, 0);

  const empty = await move(who, 'withdraw', { amount: '0.01' });
  assert.equal(empty.status, 400);
  assert.equal((await who.agent.get('/api/wishlist')).body.jarBalance, 0);
});

test('withdrawing from an achieved wish un-achieves it', async () => {
  const who = await session();
  const wish = await createWish(who, { targetAmount: '50.00' });
  await move(who, 'deposit', { amount: '50.00', wishItemId: wish.id });

  const taken = await move(who, 'withdraw', { amount: '10.00', wishItemId: wish.id });
  assert.equal(taken.status, 201);
  assert.equal(taken.body.jarBalance, 40);
  assert.equal(taken.body.wish.status, 'saving');
  assert.equal(taken.body.wish.savedAmount, 40);
  assert.equal(taken.body.wish.achievedAt, null, 'the achievement is undone with the money');

  // a wish can never be pushed below the zero it was saved at
  const floor = await move(who, 'withdraw', { amount: '38.00', wishItemId: wish.id });
  assert.equal(floor.status, 201);
  assert.equal(floor.body.wish.savedAmount, 2);
  const drain = await move(who, 'withdraw', { amount: '2.00', wishItemId: wish.id });
  assert.equal(drain.body.jarBalance, 0);

  const row = (await who.agent.get('/api/wishlist')).body.rows[0];
  assert.equal(row.savedAmount, 0);
  assert.equal(row.remaining, 50);
  assert.equal(row.status, 'saving');
});

test('a target can move, but never under what is already saved', async () => {
  const who = await session();
  const wish = await createWish(who, { targetAmount: '100.00' });
  await move(who, 'deposit', { amount: '80.00', wishItemId: wish.id });

  const tooLow = await withCsrf(who.user, who.agent.patch(`/api/wishlist/${wish.id}`)).send({ targetAmount: '50.00' });
  assert.equal(tooLow.status, 400);
  assert.match(tooLow.body.error, /saved/i);

  const fine = await withCsrf(who.user, who.agent.patch(`/api/wishlist/${wish.id}`)).send({
    targetAmount: '80.00',
    title: 'Good headphones',
  });
  assert.equal(fine.status, 200);
  assert.equal(fine.body.wish.title, 'Good headphones');
  assert.equal(fine.body.wish.targetAmount, 80);
  assert.equal(fine.body.wish.savedAmount, 80);
  assert.equal(fine.body.wish.status, 'achieved', 'landing the target on the saved amount reaches it');

  // "achieved" is earned by the arithmetic, never typed in
  const claimed = await withCsrf(who.user, who.agent.patch(`/api/wishlist/${wish.id}`)).send({ status: 'achieved' });
  assert.equal(claimed.status, 400);
});

/* ----------------------------- per-user isolation --------------------------- */

test("another student's wish is a 404, never data", async () => {
  const alice = await session();
  const bob = await session();
  const wish = await createWish(alice, { targetAmount: '30.00' });

  const read = await bob.agent.get('/api/wishlist');
  assert.equal(read.status, 200);
  assert.equal(read.body.rows.length, 0);
  assert.equal(read.body.jarBalance, 0, 'the jar is nobody else’s to read');

  const edit = await withCsrf(bob.user, bob.agent.patch(`/api/wishlist/${wish.id}`)).send({ title: 'Mine now' });
  assert.equal(edit.status, 404);

  const remove = await withCsrf(bob.user, bob.agent.delete(`/api/wishlist/${wish.id}`));
  assert.equal(remove.status, 404);

  const put = await move(bob, 'deposit', { amount: '5.00', wishItemId: wish.id });
  assert.equal(put.status, 404);
  assert.equal((await bob.agent.get('/api/wishlist/jar')).body.jarBalance, 0, 'the refused deposit left nothing behind');

  // ...and Alice's own copy is untouched
  const mine = await alice.agent.get('/api/wishlist');
  assert.equal(mine.body.rows[0].title, 'Headphones');
  assert.equal(mine.body.rows[0].savedAmount, 0);
  assert.equal(mine.body.jarBalance, 0);
});

/* ------------------------------- decimal maths ------------------------------ */

test('the jar and the wish keep their cents exactly, with no float drift', async () => {
  const who = await session();
  const wish = await createWish(who, { targetAmount: '100.00' });

  for (let i = 0; i < 3; i += 1) {
    const res = await move(who, 'deposit', { amount: '33.33', wishItemId: wish.id });
    assert.equal(res.status, 201);
  }

  const list = await who.agent.get('/api/wishlist');
  assert.equal(list.body.jarBalance, 99.99, '3 × 33.33 is 99.99, never 99.99000000000001');
  assert.equal(list.body.rows[0].savedAmount, 99.99);
  assert.equal(list.body.summary.totalSaved, 99.99);
  assert.equal(list.body.rows[0].remaining, 0.01);
  assert.equal(list.body.rows[0].pct, 100, 'rounded for the bar, exact in the amount');

  const back = await move(who, 'withdraw', { amount: '99.99', wishItemId: wish.id });
  assert.equal(back.status, 201);
  assert.equal(back.body.jarBalance, 0);
  assert.equal(back.body.wish.savedAmount, 0);
});

/* ---------------------------------- history --------------------------------- */

test('the jar keeps a short history, naming the wish when there is one', async () => {
  const who = await session();
  const wish = await createWish(who, { title: 'Concert ticket', targetAmount: '45.00' });

  await move(who, 'deposit', { amount: '45.00', wishItemId: wish.id, note: 'no pizza this week' });
  await move(who, 'deposit', { amount: '5.00' });
  await move(who, 'withdraw', { amount: '2.00' });

  const withHistory = await who.agent.get('/api/wishlist?history=1');
  assert.equal(withHistory.status, 200);
  assert.equal(withHistory.body.movements.length, 3);
  assert.equal(withHistory.body.movements[0].kind, 'withdraw', 'newest first');
  assert.equal(withHistory.body.movements[0].amount, 2);
  assert.equal(withHistory.body.movements[0].wishTitle, '', 'a plain movement has no wish to name');
  assert.equal(withHistory.body.movements[1].wishTitle, '');
  assert.equal(withHistory.body.movements[2].kind, 'deposit');
  assert.equal(withHistory.body.movements[2].wishTitle, 'Concert ticket');
  assert.equal(withHistory.body.movements[2].note, 'no pizza this week');

  const capped = await who.agent.get('/api/wishlist/jar?limit=1');
  assert.equal(capped.body.movements.length, 1);
  assert.equal(capped.body.jarBalance, 48);
});

/* ------------------------------ removing a wish ----------------------------- */

test('removing a wish leaves the saved money sitting in the jar', async () => {
  const who = await session();
  const wish = await createWish(who, { targetAmount: '30.00' });
  await move(who, 'deposit', { amount: '30.00', wishItemId: wish.id });

  const gone = await withCsrf(who.user, who.agent.delete(`/api/wishlist/${wish.id}`));
  assert.equal(gone.status, 200);

  const after = await who.agent.get('/api/wishlist');
  assert.equal(after.body.rows.length, 0);
  assert.equal(after.body.jarBalance, 30, 'the money is still the student’s, it just has no wish attached');
  assert.deepEqual(after.body.summary, { totalTarget: 0, totalSaved: 0, count: 0, countAchieved: 0 });
});
