import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, registerStudent, withCsrf, makeDefaultCategory } from './helpers.js';
import ReferralReward from '../src/models/ReferralReward.js';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';

/**
 * Invite a friend, and the rules that decide whether a reward is safe to give.
 *
 * The harness is the one from groupLedger.test.js — an in-memory database, real
 * sign-ups, real sessions, the CSRF header on every write — and this file
 * mounts its own router, so it stands on its own without app.js having heard of
 * it. The referral router goes in front of the /api 404 layer, which leaves the
 * app's own error handler behind it.
 *
 * WHY THE SERVICE IS IMPORTED IN `before` AND NOT AT THE TOP OF THE FILE:
 * services/referrals.js reads config/env.js at import time, and env.js captures
 * MONGODB_URI when it loads. The harness points that at its own in-memory
 * server from inside startApp(), so a top-level import would freeze the default
 * mongodb://127.0.0.1:27017 in place and every test here would fail on a
 * database that is not there. The models import mongoose only, so those are
 * safe to load up front.
 *
 * A note on the fixtures: an inviter in these tests is always a DAY old before
 * they refer anybody, because that is the rule the feature ships with
 * (services/referrals.js → INVITER_MIN_AGE_HOURS). The age is moved with the
 * raw driver rather than through the model, since Mongoose's timestamps would
 * stamp a new createdAt on an update and undo the point of the fixture.
 */

let ctx;
/** The referral service, once the harness has chosen a database. */
let ref;
let referralRoutes;
let categorySeq = 0;

test.before(async () => {
  ctx = await startApp();
  ref = await import('../src/services/referrals.js');
  ({ default: referralRoutes } = await import('../src/routes/referrals.js'));
  // The two unique indexes are the anti-abuse, and the race test below depends
  // on them existing before the first request rather than after it.
  await ReferralReward.init();
  mountReferrals(ctx.app);
});

test.after(async () => {
  await ctx.stop();
});

/** src/app.js mounts this router; mount it only if it is not already there. */
function mountReferrals(app) {
  const stack = app._router.stack;
  const mounted = stack.some(
    (layer) => layer.name === 'router' && String(layer.regexp?.source).includes('api\\/referrals')
  );
  if (mounted) return;

  app.use('/api/referrals', referralRoutes);
  const layer = stack.pop();
  const beforeStatic = stack.findIndex((row) => row.name === 'serveStatic');
  stack.splice(beforeStatic === -1 ? stack.length : beforeStatic, 0, layer);
}

/* -------------------------------- fixtures -------------------------------- */

async function session(payload = {}) {
  const agent = ctx.newAgent();
  const account = await registerStudent(agent, payload);
  return { agent, user: account.user, csrf: account.csrf, email: account.email, recoveryEmail: account.recoveryEmail };
}

/** Move an account into the past. The raw driver, so timestamps do not fight it. */
async function ageAccount(userId, hours = 48) {
  await User.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(String(userId)) },
    { $set: { createdAt: new Date(Date.now() - hours * 60 * 60 * 1000) } }
  );
}

/** The inviter's own card, which is also what makes their code. */
async function mine(who) {
  const res = await who.agent.get('/api/referrals/mine');
  assert.equal(res.status, 200, res.text);
  return res.body;
}

/** An inviter who is old enough to refer, and has a code to share. */
async function inviter(label) {
  const who = await session({ name: `Inviter ${label}` });
  await ageAccount(who.user.id);
  const card = await mine(who);
  return { ...who, code: card.code, url: card.url };
}

/**
 * Sign-up referral, run exactly the way routes/auth.js will run it: read the
 * code out of the registration, then attach the inviter to the new account.
 */
async function signUpThrough(inviterWho, inviteeWho) {
  const invitee = await User.findById(inviteeWho.user.id);
  const { inviter: found, refused } = await ref.readReferralFromSignup(inviterWho.code, {
    email: inviteeWho.email,
    recoveryEmail: inviteeWho.recoveryEmail,
  });
  if (!found) return { ok: false, refused };
  return ref.attachReferral(found, invitee);
}

/** The first entry in the app, which is the thing a reward waits for. */
async function logFirstEntry(who, overrides = {}) {
  categorySeq += 1;
  const category = await makeDefaultCategory({ name: `Ref cat ${categorySeq}`, type: 'expense' });
  const res = await withCsrf(who, who.agent.post('/api/transactions')).send({
    categoryId: category._id.toString(),
    type: 'expense',
    amount: '25',
    description: 'chai at 4pm',
    date: '2026-02-10',
    ...overrides,
  });
  assert.equal(res.status, 201, res.text);
  return res.body.transaction.id;
}

/** One invited friend, all the way through the first entry. */
async function friendWhoQualifies(inviterWho, label) {
  const friend = await session({ name: `Friend ${label}` });
  const attached = await signUpThrough(inviterWho, friend);
  assert.equal(attached.ok, true, `referral refused: ${attached.refused}`);
  await logFirstEntry(friend);
  return friend;
}

/* --------------------------------- the code --------------------------------- */

test('the invite card is for a signed-in student, and asks for nothing else', async () => {
  const anonymous = await ctx.request(ctx.app).get('/api/referrals/mine');
  assert.equal(anonymous.status, 401);

  const who = await session();
  const card = await mine(who);
  assert.match(card.code, /^[A-Z0-9]{8}$/);
  // absolute, because the link is read on somebody else's phone
  assert.ok(card.url.startsWith('http'), card.url);
  assert.ok(card.url.endsWith(`/r/${card.code}`), card.url);
  assert.deepEqual(card.joined, []);
  assert.equal(card.rewarded, 0);
  assert.equal(card.cap, ref.REFERRAL_CAP);
  assert.equal(card.capReached, false);
  // the server writes no sentence: the share message is a key and its values
  assert.equal(card.shareText.key, 'ref.share.body');
  assert.equal(card.shareText.vars.link, card.url);
  assert.ok(
    !JSON.stringify(card.shareText.vars).includes('Join'),
    'a whole sentence was written server-side'
  );
});

test('a code is made once, on the first read, and the same one comes back after that', async () => {
  const who = await session();
  const first = await mine(who);
  const second = await mine(who);
  const third = await mine(who);

  assert.equal(second.code, first.code);
  assert.equal(third.code, first.code);
  // and it is on the account, not only in the response
  const stored = await User.findById(who.user.id).select('referralCode');
  assert.equal(stored.referralCode, first.code);
});

test('the alphabet has no 0/O and no 1/l, because a code is read out loud', async () => {
  for (const banned of ['0', 'O', '1', 'I', 'l', 'L']) {
    assert.ok(!ref.CODE_ALPHABET.includes(banned), `${banned} is in the alphabet`);
  }
  // 31^8 is not a space anybody can walk
  assert.equal(ref.CODE_ALPHABET.length, 31);

  for (let i = 0; i < 400; i += 1) {
    const code = ref.randomCode();
    assert.equal(code, code.toUpperCase());
    assert.equal(code.length, 8);
    for (const ch of code) assert.ok(ref.CODE_ALPHABET.includes(ch), `${ch} is not in the alphabet`);
  }

  // a code that could not have been issued resolves to nothing at all
  assert.equal(ref.normaliseCode('O1L0I1L0'), '');
  assert.equal(ref.normaliseCode('SHORT'), '');
  assert.equal(ref.normaliseCode('AAAAAAAA'), 'AAAAAAAA');
  assert.equal(ref.normaliseCode(' aaaaaaaa '), 'AAAAAAAA');
});

test('a code that is already somebody else\u2019s is drawn again, not a 500', async () => {
  const holder = await session();
  await mine(holder);
  const stored = await User.findById(holder.user.id).select('referralCode');

  const latecomer = await session();
  const fresh = await User.findById(latecomer.user.id);
  const taken = stored.referralCode;

  // the first draw collides on the unique index, the second one is free
  const queue = [taken, 'B7KM2XQD'];
  const code = await ref.ensureReferralCode(fresh, { makeCode: () => queue.shift() });
  assert.equal(code, 'B7KM2XQD');

  const after = await User.findById(latecomer.user.id).select('referralCode');
  assert.equal(after.referralCode, 'B7KM2XQD');
  // the account that already had a code still has its own
  const untouched = await User.findById(holder.user.id).select('referralCode');
  assert.equal(untouched.referralCode, taken);
});

test('two people opening the card in the same second end up with one code between them', async () => {
  const who = await session();
  const [a, b] = await Promise.all([mine(who), mine(who)]);
  assert.equal(a.code, b.code);

  const fresh = await session();
  const [c, d] = await Promise.all([mine(fresh), mine(fresh)]);
  assert.equal(c.code, d.code);
  assert.notEqual(c.code, a.code);
});

/* ------------------------------ the public read ----------------------------- */

test('a code resolves to a display name and to nothing else at all', async () => {
  const who = await inviter('public');
  const resolve = await ctx.request(ctx.app).get(`/api/referrals/resolve/${who.code}`);

  assert.equal(resolve.status, 200);
  assert.deepEqual(resolve.body, { name: who.user.name });
  // no address, no id, no counters — a shareable link is not a directory
  const body = JSON.stringify(resolve.body);
  assert.ok(!body.includes(who.email), 'the resolve leaked an address');
  assert.ok(!body.includes(who.recoveryEmail), 'the resolve leaked a recovery address');
  assert.ok(!body.includes(who.user.id), 'the resolve leaked an account id');

  // lower case in the URL is the same code, because the alphabet is upper case
  const lower = await ctx.request(ctx.app).get(`/api/referrals/resolve/${who.code.toLowerCase()}`);
  assert.equal(lower.status, 200);
  assert.deepEqual(lower.body, { name: who.user.name });
});

test('a code that is not one is a 404, and it says so with a key rather than a sentence', async () => {
  for (const code of ['ZZZZZZZZ', 'nonsense', 'O1L0I1L0', 'AAAAAAAA']) {
    const res = await ctx.request(ctx.app).get(`/api/referrals/resolve/${code}`);
    assert.equal(res.status, 404, `${code} answered ${res.status}`);
    assert.equal(res.body.error, 'invite_not_found');
    assert.equal(res.body.messageKey, 'ref.invite.notFound');
  }
});

test('a disabled account\u2019s code stops resolving', async () => {
  const who = await inviter('disabled');
  await User.updateOne({ _id: who.user.id }, { $set: { isActive: false } });

  const res = await ctx.request(ctx.app).get(`/api/referrals/resolve/${who.code}`);
  assert.equal(res.status, 404);
});

/* ------------------------------ refusing a signup ---------------------------- */

test('an account cannot refer itself, by id or by address', async () => {
  const who = await inviter('self');
  const doc = await User.findById(who.user.id);

  // by id: the inviter is handed the invitee that is already themselves
  const byId = await ref.attachReferral(doc, doc);
  assert.equal(byId.ok, false);
  assert.equal(byId.refused, 'self');

  // by address: the same person signing up again with their own address, and
  // again with their own recovery address
  const byEmail = await ref.readReferralFromSignup(who.code, {
    email: who.email,
    recoveryEmail: 'brand-new-address@test.local',
  });
  assert.equal(byEmail.inviter, null);
  assert.equal(byEmail.refused, 'self');

  const byRecovery = await ref.readReferralFromSignup(who.code, {
    email: 'brand-new-address@test.local',
    recoveryEmail: who.recoveryEmail,
  });
  assert.equal(byRecovery.inviter, null);
  assert.equal(byRecovery.refused, 'self');
});

test('a code that belongs to nobody is simply not a referral, and says so with no word', async () => {
  const result = await ref.readReferralFromSignup('ZZZZZZZZ', {
    email: 'someone@test.local',
    recoveryEmail: 'someone-recovery@test.local',
  });
  assert.equal(result.inviter, null);
  // the machine word is for the service's own log; the signup carries on either
  // way, because a student is never told that a code they typed was invalid
  assert.equal(result.refused, 'unknown-code');
});

test('an account younger than a day cannot bring anybody in', async () => {
  const who = await session({ name: 'Brand New' });
  const card = await mine(who);
  const invitee = await session({ name: 'Too Early' });

  const result = await ref.readReferralFromSignup(card.code, {
    email: invitee.email,
    recoveryEmail: invitee.recoveryEmail,
  });
  assert.equal(result.inviter, null);
  assert.equal(result.refused, 'inviter-too-new');

  // an hour past the floor and the same code works
  await ageAccount(who.user.id, 25);
  const later = await ref.readReferralFromSignup(card.code, {
    email: invitee.email,
    recoveryEmail: invitee.recoveryEmail,
  });
  assert.ok(later.inviter, 'a 25-hour-old account should be allowed to refer');
  assert.equal(later.refused, null);
});

/* ------------------------------ who brought whom ----------------------------- */

test('the inviter is written once, and a second attempt to set it is refused', async () => {
  const first = await inviter('first');
  const second = await inviter('second');
  const invitee = await session({ name: 'Wanted By Two' });

  const one = await signUpThrough(first, invitee);
  assert.equal(one.ok, true);

  const two = await signUpThrough(second, invitee);
  assert.equal(two.ok, false);
  assert.equal(two.refused, 'already-set');

  const stored = await User.findById(invitee.user.id).select('referredBy referredAt');
  assert.equal(String(stored.referredBy), String(first.user.id));
  // the first inviter, and the moment it was written, are both still there
  assert.ok(stored.referredAt instanceof Date);
});

test('a friend who signed up through the link is on the inviter\u2019s list, by name only', async () => {
  const who = await inviter('list');
  const friend = await session({ name: 'Bilal Khan' });
  await signUpThrough(who, friend);

  const card = await mine(who);
  assert.equal(card.joined.length, 1);
  const row = card.joined[0];
  assert.equal(row.name, 'Bilal Khan');
  assert.equal(row.rewarded, false);
  assert.equal(row.slot, null);
  // a calendar day, at UTC midnight, so the list cannot disagree with itself
  assert.equal(String(row.joinedOn).slice(11), '00:00:00.000Z');
  assert.ok(!JSON.stringify(card).includes(friend.email), 'the card leaked an address');
  assert.ok(!JSON.stringify(card).includes(friend.recoveryEmail), 'the card leaked a recovery address');
});

/* --------------------------------- the reward -------------------------------- */

test('a referral earns nothing until the friend logs their first entry', async () => {
  const who = await inviter('pending');
  const friend = await session({ name: 'Signed Up Only' });
  await signUpThrough(who, friend);

  let card = await mine(who);
  assert.equal(card.rewarded, 0);
  assert.equal(card.pending, 1);
  assert.equal(card.joined[0].rewarded, false);

  await logFirstEntry(friend);
  card = await mine(who);

  assert.equal(card.rewarded, 1);
  assert.equal(card.pending, 0);
  assert.equal(card.joined[0].rewarded, true);
  assert.equal(card.joined[0].slot, 1);
  assert.equal(card.capReached, false);
});

test('the reward row names the entry that proved it, and a binned entry is not one', async () => {
  const who = await inviter('audit');
  const friend = await session({ name: 'Changes Mind' });
  await signUpThrough(who, friend);

  const first = await logFirstEntry(friend);
  const bin = await withCsrf(friend, friend.agent.delete(`/api/transactions/${first}`));
  assert.equal(bin.status, 200, bin.text);

  // nothing yet: the only entry this account has is in the bin
  assert.equal((await mine(who)).rewarded, 0);

  const second = await logFirstEntry(friend);
  assert.equal((await mine(who)).rewarded, 1);

  const reward = await ReferralReward.findOne({ inviter: who.user.id });
  assert.ok(reward, 'no reward row was written');
  assert.equal(String(reward.qualifiedBy), second);
  assert.notEqual(String(reward.qualifiedBy), first);
  assert.equal(String(reward.invitee), friend.user.id);
  assert.ok(reward.qualifiedAt instanceof Date);
  // the day it is counted by is UTC midnight; the moment it happened is exact
  assert.equal(reward.qualifiedOn.toISOString().slice(11), '00:00:00.000Z');
  assert.ok(reward.qualifiedAt.getTime() >= reward.qualifiedOn.getTime());
});

test('the sixth qualifying referral earns nothing, and the card says the cap is full', async () => {
  const who = await inviter('cap');
  for (let i = 1; i <= ref.REFERRAL_CAP + 1; i += 1) {
    await friendWhoQualifies(who, `${i}`);
  }

  const card = await mine(who);
  assert.equal(card.joined.length, ref.REFERRAL_CAP + 1);
  assert.equal(card.rewarded, ref.REFERRAL_CAP);
  assert.equal(card.capReached, true);
  // the sixth row is on the list as joined and NOT rewarded, rather than the
  // list quietly stopping at five
  const unrewarded = card.joined.filter((row) => !row.rewarded);
  assert.equal(unrewarded.length, 1);
  assert.equal(unrewarded[0].slot, null);

  // and the database agrees: five rows, one per seat, no sixth
  const rows = await ReferralReward.find({ inviter: who.user.id }).sort({ slot: 1 });
  assert.equal(rows.length, ref.REFERRAL_CAP);
  assert.deepEqual(rows.map((row) => row.slot), [1, 2, 3, 4, 5]);

  // reading it again does not quietly promote the sixth
  assert.equal((await mine(who)).rewarded, ref.REFERRAL_CAP);
  assert.equal(await ReferralReward.countDocuments({ inviter: who.user.id }), ref.REFERRAL_CAP);
});

test('two requests qualifying the same friend at once produce one reward, not two', async () => {
  const who = await inviter('race');
  const friend = await session({ name: 'Racing' });
  await signUpThrough(who, friend);
  await logFirstEntry(friend);

  const cards = await Promise.all([mine(who), mine(who), mine(who)]);
  for (const card of cards) assert.equal(card.rewarded, 1);

  const rows = await ReferralReward.find({ inviter: who.user.id });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slot, 1);
});

test('the same friend qualifying twice over is still one reward, ever', async () => {
  const who = await inviter('twice');
  const friend = await session({ name: 'Twice' });
  await signUpThrough(who, friend);
  await logFirstEntry(friend);
  await logFirstEntry(friend, { amount: '40' });
  await logFirstEntry(friend, { amount: '55' });

  await mine(who);
  await mine(who);
  assert.equal(await ReferralReward.countDocuments({ inviter: who.user.id }), 1);
  assert.equal(await ReferralReward.countDocuments({ invitee: friend.user.id }), 1);
});

test('a reward lands on the inviter who earned it, and on nobody else\u2019s card', async () => {
  const first = await inviter('mine a');
  const second = await inviter('mine b');
  await friendWhoQualifies(first, 'a');

  const mineA = await mine(first);
  const mineB = await mine(second);
  assert.equal(mineA.rewarded, 1);
  assert.equal(mineB.rewarded, 0);
  assert.equal(mineB.joined.length, 0);

  const rows = await ReferralReward.find({ invitee: { $exists: true } }).populate('inviter', 'name');
  const row = rows.find((r) => String(r.inviter._id) === String(first.user.id));
  assert.ok(row);
  assert.notEqual(String(row.inviter._id), String(second.user.id));
});

test('a stranger\u2019s code is a 404 on everything except the one public read', async () => {
  const who = await inviter('stranger');
  const other = await session({ name: 'Nosy' });

  // the only routes on this router are `mine` and `resolve/:code`, so there is
  // nothing else that takes a code and could confirm one exists
  const ownCard = await other.agent.get('/api/referrals/mine');
  assert.equal(ownCard.status, 200);
  assert.notEqual(ownCard.body.code, who.code);
  assert.equal(ownCard.body.joined.length, 0);
  assert.equal(ownCard.body.rewarded, 0);

  const gone = await other.agent.get(`/api/referrals/resolve/${'Q'.repeat(8)}`);
  assert.equal(gone.status, 404);
});

test('moving money between your own pockets is not a first entry', async () => {
  const who = await inviter('transfer');
  const friend = await session({ name: 'Moves Money' });
  await signUpThrough(who, friend);

  // a wallet transfer lives in its own collection (NEW-11) and must not qualify
  // anybody, or the badge would go to a person who only moved money between
  // their own pockets. The opening balance is what makes the transfer possible
  // WITHOUT an entry: logging an entry is exactly what earns the reward, so a
  // transaction here would have proved the opposite of what this test is about.
  const wallets = await withCsrf(friend, friend.agent.get('/api/wallets'));
  assert.equal(wallets.status, 200, wallets.text);
  const pockets = wallets.body.wallets || [];
  assert.ok(pockets.length >= 2, `expected the default pockets, saw ${pockets.length}`);

  const funded = await withCsrf(friend, friend.agent.patch(`/api/wallets/${pockets[0].id}`)).send({
    openingBalance: '500',
  });
  assert.equal(funded.status, 200, funded.text);

  const move = await withCsrf(friend, friend.agent.post('/api/wallets/transfer')).send({
    fromId: pockets[0].id,
    toId: pockets[1].id,
    amount: '10',
    date: '2026-09-20',
  });
  assert.equal(move.status, 201, move.text);

  assert.equal((await mine(who)).rewarded, 0, 'a transfer qualified a reward');
  assert.equal(await Transaction.countDocuments({ user: friend.user.id, isDeleted: false }), 0);
});
