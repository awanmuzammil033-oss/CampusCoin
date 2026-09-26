import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, makeDefaultCategory, withCsrf } from './helpers.js';
import { toDec } from '../src/utils/money.js';
import RecurringRule from '../src/models/RecurringRule.js';
import Transaction from '../src/models/Transaction.js';
import Notification from '../src/models/Notification.js';

/**
 * The subscription vault: what leaves an account every month, which of those
 * payments look like they are being paid for nothing, and the reminders that
 * stop an auto-renew quietly costing a semester.
 *
 * The fixtures are written straight to the models so every charge lands on an
 * exact day — the verdicts turn on how long ago a charge was, and a test that
 * depends on "roughly a month ago" is a test that fails next month. The
 * harness itself (an in-memory database, real sign-ups, real sessions) is
 * copied from budgets.test.js.
 */

const DAY = 24 * 60 * 60 * 1000;

/** An ISO date exactly `days` before today (UTC midnight, as the ledger stores). */
function daysAgo(days) {
  const d = new Date(Date.now() - days * DAY);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

let ctx;
let entertainment;
let health;
let phone;

test.before(async () => {
  ctx = await startApp();
  entertainment = await makeDefaultCategory({ name: 'Entertainment', type: 'expense', icon: 'film' });
  health = await makeDefaultCategory({ name: 'Health', type: 'expense', icon: 'health' });
  phone = await makeDefaultCategory({ name: 'Phone', type: 'expense', icon: 'phone' });
  await mountVault();
});

/**
 * app.js is the shell the whole API hangs off, and the vault router belongs in
 * it. The suite mounts it exactly where the other routers sit — in front of the
 * /api 404 layer, behind the session and CSRF middleware — so the HTTP surface
 * is exercised end to end without the shell having to know about this file.
 */
async function mountVault() {
  const { default: vaultRouter } = await import('../src/routes/vault.js');
  const stack = (ctx.app._router || ctx.app.router).stack;

  ctx.app.use('/api/vault', vaultRouter);
  const layer = stack.pop();
  const before = stack.findIndex((l) => l.handle && l.handle.name === 'notFound');
  stack.splice(before === -1 ? stack.length : before, 0, layer);
}

test.after(async () => {
  await ctx.stop();
});

/* -------------------------------- fixtures --------------------------------- */

/** One charge of an expense, on an exact day. */
function addCharge(userId, { category, amount, description, on, rule = null }) {
  return Transaction.create({
    user: userId,
    category: category._id,
    amount: toDec(amount),
    type: 'expense',
    description,
    date: new Date(`${on}T00:00:00.000Z`),
    recurringRule: rule,
  });
}

/** A recurring entry plus the charges the generator would have made for it. */
async function addRule(userId, { name, category, amount, frequency = 'monthly', charges }) {
  const rule = await RecurringRule.create({
    user: userId,
    category: category._id,
    type: 'expense',
    amount: toDec(amount),
    description: name,
    frequency,
    dayOfPeriod: 1,
    startDate: new Date(`${charges[0].on}T00:00:00.000Z`),
    lastGeneratedOn: new Date(`${charges[charges.length - 1].on}T00:00:00.000Z`),
    isActive: true,
  });

  for (const charge of charges) {
    await addCharge(userId, {
      category,
      amount: charge.amount ?? amount,
      description: name,
      on: charge.on,
      rule: rule._id,
    });
  }
  return rule;
}

/**
 * The one student this file is really about: six subscriptions covering every
 * verdict the vault can reach.
 *   Netflix           in use, charged nine days ago
 *   Gym membership    idle, and an active rule, so the auto-renew will bill again
 *   Cloud backup      one-off: a steady monthly charge with no rule behind it
 *   Phone plan        price creep: 9.99 in the spring, 12.00 now
 *   Spotify           in use, and the copy that is worth keeping
 *   Spotify Family    the same thing paid twice
 */
async function seed(userId) {
  await addRule(userId, {
    name: 'Netflix',
    category: entertainment,
    amount: '9.99',
    charges: [{ on: daysAgo(70) }, { on: daysAgo(40) }, { on: daysAgo(9) }],
  });

  const gym = await addRule(userId, {
    name: 'Gym membership',
    category: health,
    amount: '30.00',
    charges: [{ on: daysAgo(105) }, { on: daysAgo(75) }, { on: daysAgo(44) }],
  });

  for (const on of [daysAgo(67), daysAgo(37), daysAgo(7)]) {
    await addCharge(userId, { category: phone, amount: '3.00', description: 'Cloud backup', on });
  }

  const phonePlan = await addRule(userId, {
    name: 'Phone plan',
    category: phone,
    amount: '12.00',
    charges: [
      { on: daysAgo(140), amount: '9.99' },
      { on: daysAgo(110), amount: '9.99' },
      { on: daysAgo(80), amount: '9.99' },
      { on: daysAgo(50), amount: '9.99' },
      { on: daysAgo(20), amount: '12.00' },
    ],
  });

  const spotify = await addRule(userId, {
    name: 'Spotify',
    category: entertainment,
    amount: '6.99',
    charges: [{ on: daysAgo(74) }, { on: daysAgo(43) }, { on: daysAgo(11) }],
  });

  const family = await addRule(userId, {
    name: 'Spotify Family',
    category: entertainment,
    amount: '6.99',
    charges: [{ on: daysAgo(73) }, { on: daysAgo(42) }, { on: daysAgo(12) }],
  });

  return { gym, phonePlan, spotify, family };
}

async function signIn({ withFixtures = true } = {}) {
  const agent = ctx.newAgent();
  const session = await registerStudent(agent);
  if (withFixtures) await seed(session.user.id);
  return { agent, session, userId: session.user.id };
}

async function vault(agent) {
  const res = await agent.get('/api/vault');
  assert.equal(res.status, 200);
  return res.body;
}

function rowFor(body, title) {
  const row = body.detected.find((r) => r.title === title);
  assert.ok(row, `expected a detection for "${title}" (saw: ${body.detected.map((r) => r.title).join(', ')})`);
  return row;
}

async function bell(agent) {
  const res = await agent.get('/api/notifications');
  return res.body.rows.filter((r) => r.source === 'app');
}

/* ----------------------------- the whole picture ---------------------------- */

test('the vault totals every subscription, flags the ones going nowhere, and annualises it', async () => {
  const { agent } = await signIn();
  const body = await vault(agent);

  // 9.99 Netflix + 30.00 gym + 0.75 cloud backup + 12.00 phone plan + 6.99 +
  // 6.99 Spotify — the sum of the cards on screen, to the cent.
  assert.equal(body.detected.length, 6);
  assert.equal(body.monthlyTotal, 66.72);
  assert.equal(body.annualTotal, 800.64);
  assert.equal(body.annualTotal, Math.round(body.monthlyTotal * 12 * 100) / 100, 'a year is twelve months');
  // Committed is the rules only — everything above except the rule-less backup.
  assert.equal(body.committedMonthly, 65.97);
  assert.equal(body.flaggedCount, 4);

  const netflix = rowFor(body, 'Netflix');
  assert.equal(netflix.verdict, 'in-use');
  assert.equal(netflix.monthly, 9.99);
  assert.equal(netflix.annual, 119.88);
  assert.equal(netflix.daysSinceLastCharge, 9);
  assert.equal(netflix.frequency, 'monthly');
  assert.equal(netflix.active, true);
  assert.equal(netflix.category.name, 'Entertainment');
  assert.equal(netflix.noteKey, 'vault.noteInUse');

  const gym = rowFor(body, 'Gym membership');
  assert.equal(gym.verdict, 'idle');
  assert.equal(gym.daysSinceLastCharge, 44);
  assert.equal(gym.monthly, 30, 'an active rule states the price, not last year’s average');
  assert.ok(gym.ruleId, 'the gym has a recurring entry the page can cancel');
  assert.equal(gym.severity, 'high');

  const backup = rowFor(body, 'Cloud backup');
  assert.equal(backup.verdict, 'one-off');
  assert.equal(backup.hasRule, false, 'nobody ever set up a rule for the backup');
  assert.equal(backup.monthly, 0.75, 'three charges of 3.00 in a year is 0.75 a month');
  assert.equal(backup.annual, 9);

  const phonePlan = rowFor(body, 'Phone plan');
  assert.equal(phonePlan.verdict, 'price-creep');
  assert.deepEqual(phonePlan.growth, { from: 9.99, to: 12, pct: 20, creep: true });

  // The copy of Spotify worth cancelling is the one flagged; the other is in use.
  const spotify = rowFor(body, 'Spotify');
  const family = rowFor(body, 'Spotify Family');
  assert.equal(family.verdict, 'duplicate');
  assert.equal(family.duplicateOf, spotify.key);
  assert.equal(spotify.verdict, 'in-use');

  assert.deepEqual(body.savings, { cancelIdle: 30, cutDuplicates: 6.99, total: 36.99, annual: 443.88 });

  assert.deepEqual(
    body.alerts.map((a) => a.kind).sort(),
    ['duplicate', 'idle', 'one-off', 'price-creep'],
    'one alert per flagged card, and nothing for the healthy ones'
  );
  for (const alert of body.alerts) {
    assert.ok(body.detected.some((d) => d.key === alert.subscriptionKey), 'alerts point back at a card');
    assert.ok(alert.title && alert.detail && alert.severity);
  }
});

test('a weekly entry is a monthly cost too, and the vault needs a sign-in', async () => {
  const anonymous = await ctx.newAgent().get('/api/vault');
  assert.equal(anonymous.status, 401, 'the vault is behind the student guard');

  const { agent, userId } = await signIn({ withFixtures: false });
  await addRule(userId, {
    name: 'Swimming pool',
    category: health,
    amount: '6.00',
    frequency: 'weekly',
    charges: [{ on: daysAgo(28) }, { on: daysAgo(21) }, { on: daysAgo(14) }, { on: daysAgo(7) }],
  });

  const mine = await vault(agent);
  const pool = rowFor(mine, 'Swimming pool');
  assert.equal(pool.frequency, 'weekly');
  assert.equal(pool.monthly, 26, '6.00 a week is 26.00 a month (52 weeks over 12 months)');
  assert.equal(pool.verdict, 'in-use');
  assert.equal(mine.monthlyTotal, 26);
  assert.equal(mine.annualTotal, 312);
});

test('the summary endpoint carries the headline numbers only', async () => {
  const { agent } = await signIn();

  const res = await agent.get('/api/vault/summary');
  assert.equal(res.status, 200);
  assert.equal(res.body.monthlyTotal, 66.72);
  assert.equal(res.body.annualTotal, 800.64);
  assert.equal(res.body.committedMonthly, 65.97);
  assert.equal(res.body.flaggedCount, 4);
  assert.equal(res.body.verdicts.idle, 1);
  assert.equal(res.body.verdicts.duplicate, 1);
  assert.equal(res.body.savings.total, 36.99);
  assert.equal(res.body.detected, undefined, 'the small card does not need the list');
});

/* --------------------------------- reminders -------------------------------- */

test('an idle subscription raises exactly one reminder, and a second visit in the month adds nothing', async () => {
  const { agent } = await signIn();

  const first = await vault(agent);
  assert.equal(first.reminders, 1, 'only the gym qualifies');

  const reminders = await bell(agent);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].kind, 'system');
  assert.match(reminders[0].message, /^Gym membership — /);
  assert.match(reminders[0].message, /44 days/);
  assert.match(reminders[0].message, /\$30\.00/);

  // Re-opening the screen, and the summary card, must not ring the bell again.
  const second = await vault(agent);
  assert.equal(second.reminders, 0);
  const third = await vault(agent);
  assert.equal(third.reminders, 0);
  await agent.get('/api/vault/summary');
  assert.equal((await bell(agent)).length, 1, 'still just the one reminder');
});

test('the same leak earns one reminder per month, not one per page load', async () => {
  const { agent, userId } = await signIn();
  await vault(agent);
  assert.equal((await bell(agent)).length, 1);

  // 31 days later the window has passed, so the leak is worth a nudge again.
  // The raw collection is used because createdAt is a timestamp mongoose will
  // not let an update move.
  const reminders = await Notification.find({ user: userId, kind: 'system' }).select('_id').lean();
  await Notification.collection.updateMany(
    { _id: { $in: reminders.map((r) => r._id) } },
    { $set: { createdAt: new Date(Date.now() - 31 * DAY) } }
  );

  assert.equal((await vault(agent)).reminders, 1);
  assert.equal((await bell(agent)).length, 2);
});

/* ------------------------------ the family gate ----------------------------- */

test('a rule set up after months of hand-typed charges is one subscription, not two', async () => {
  const { agent, userId } = await signIn({ withFixtures: false });

  // six months of typing "Netflix" by hand…
  for (const on of [daysAgo(65), daysAgo(35), daysAgo(5)]) {
    await addCharge(userId, { category: entertainment, amount: '9.99', description: 'Netflix', on });
  }
  // …and only then setting up the entry, whose generator has not run yet
  await RecurringRule.create({
    user: userId,
    category: entertainment._id,
    type: 'expense',
    amount: toDec('9.99'),
    description: 'Netflix',
    frequency: 'monthly',
    dayOfPeriod: 1,
    startDate: new Date(`${daysAgo(60)}T00:00:00.000Z`),
    isActive: true,
  });

  const body = await vault(agent);
  assert.equal(body.detected.length, 1, 'the same thing paid once is one card');
  const netflix = rowFor(body, 'Netflix');
  assert.equal(netflix.hasRule, true, 'the entry is now watching it');
  assert.equal(netflix.monthly, 9.99, 'and the rule states the price');
  assert.equal(netflix.charges, 3);
  assert.equal(body.monthlyTotal, 9.99, 'counted once, not twice');
  assert.equal(body.committedMonthly, 9.99);
});

test("another student's subscriptions never show up", async () => {
  const mine = await signIn();

  const other = await signIn({ withFixtures: false });
  for (const on of [daysAgo(80), daysAgo(50), daysAgo(20)]) {
    await addCharge(other.userId, {
      category: entertainment,
      amount: '12.99',
      description: 'Hulu',
      on,
    });
  }
  await addRule(other.userId, {
    name: 'Someone else data plan',
    category: phone,
    amount: '19.00',
    charges: [{ on: daysAgo(70) }, { on: daysAgo(40) }, { on: daysAgo(10) }],
  });

  const body = await vault(mine.agent);
  const titles = body.detected.map((r) => r.title);
  assert.ok(!titles.includes('Hulu'), "another student's charges stay out of the vault");
  assert.ok(!titles.includes('Someone else data plan'));
  assert.equal(body.monthlyTotal, 66.72, "the headline is this student's own money");
  assert.ok(!JSON.stringify(body).includes('Hulu'), 'and not anywhere in the payload either');

  // and the other way round: they see their own two subscriptions, not these six
  const theirs = await vault(other.agent);
  assert.deepEqual(
    theirs.detected.map((r) => r.title).sort(),
    ['Hulu', 'Someone else data plan']
  );
  assert.ok(!JSON.stringify(theirs).includes('Netflix'));
});

/* ---------------------------------- cancel ---------------------------------- */

test('cancelling a flagged subscription stops it, and only its owner can do that', async () => {
  const { agent, session, userId } = await signIn();

  const before = await vault(agent);
  const gym = rowFor(before, 'Gym membership');
  assert.equal(gym.active, true);

  const res = await withCsrf(session, agent.post('/api/vault/cancel')).send({ ruleId: gym.ruleId });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.wasActive, true);

  const after = await vault(agent);
  const now = rowFor(after, 'Gym membership');
  assert.equal(now.active, false, 'the entry is stopped');
  assert.equal(now.noteKey, 'vault.noteIdlePaused');
  assert.equal(after.savings.cancelIdle, 0, 'a paused entry frees nothing');
  assert.equal(after.committedMonthly, 35.97, 'only the gym left the commitment');
  assert.equal(after.detected.length, 6, 'the card is still there, with its history');

  // history is never rewritten: the charges it generated stay in the ledger
  assert.equal(
    await Transaction.countDocuments({ user: userId, recurringRule: gym.ruleId, isDeleted: false }),
    3
  );

  // cancelling twice is not an error
  const again = await withCsrf(session, agent.post('/api/vault/cancel')).send({ ruleId: gym.ruleId });
  assert.equal(again.status, 200);
  assert.equal(again.body.wasActive, false);

  // somebody else's rule is a 404, and a missing or broken id is a 400
  const stranger = await signIn({ withFixtures: false });
  const foreign = await withCsrf(stranger.session, stranger.agent.post('/api/vault/cancel')).send({
    ruleId: gym.ruleId,
  });
  assert.equal(foreign.status, 404);
  assert.ok(foreign.body.error);

  const blank = await withCsrf(session, agent.post('/api/vault/cancel')).send({});
  assert.equal(blank.status, 400);
  assert.ok(blank.body.error);

  const bad = await withCsrf(session, agent.post('/api/vault/cancel')).send({ ruleId: 'not-an-id' });
  assert.equal(bad.status, 400);
});

/* ------------------------------ habits stay out ----------------------------- */
test('a habit is not a subscription, and the vault would rather say nothing than guess', async () => {
  const { agent, userId } = await signIn({ withFixtures: false });

  // coffee, six times, whenever the mood takes them — no steady beat
  for (const on of [daysAgo(95), daysAgo(60), daysAgo(48), daysAgo(30), daysAgo(12), daysAgo(3)]) {
    await addCharge(userId, {
      category: entertainment,
      amount: '4.50',
      description: 'coffee with flatmates',
      on,
    });
  }

  const body = await vault(agent);
  assert.equal(body.detected.length, 0, 'a coffee habit is not a subscription');
  assert.equal(body.monthlyTotal, 0);
  assert.equal(body.annualTotal, 0);
  assert.equal(body.savings.total, 0);
  assert.equal(body.flaggedCount, 0);
  assert.equal((await bell(agent)).length, 0, 'and nothing to nag anyone about');

  // a charge with no words and no rule cannot be grouped at all
  await addCharge(userId, { category: entertainment, amount: '2.00', description: '', on: daysAgo(2) });
  assert.equal((await vault(agent)).detected.length, 0);
});
