import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, makeDefaultCategory, withCsrf } from './helpers.js';
import { toDec } from '../src/utils/money.js';
import RecurringRule from '../src/models/RecurringRule.js';
import Transaction from '../src/models/Transaction.js';
import Notification from '../src/models/Notification.js';
import User from '../src/models/User.js';
import { nextChargeOn, isPausedOn } from '../src/services/subscriptions.js';
import { generateForUser } from '../src/services/recurring.js';

/**
 * Renewals (NEW-6): the next charge, the warning about it, and the three
 * things a person can do about it.
 *
 * The harness is the one from vault.test.js — an in-memory database, real
 * sign-ups, real sessions, the CSRF header on every write. This router is
 * mounted by src/app.js; the suite mounts it itself when it is not, so the file
 * stands alone either way.
 *
 * Dates are the point of this feature, so they are never left to "roughly a
 * month from now": the derivation is checked against fixed dates, and the
 * fixtures are built from exact day offsets so a test that passes today passes
 * in February too.
 */

const DAY = 24 * 60 * 60 * 1000;

const ROW_FIELDS = [
  'ruleId',
  'description',
  'categoryId',
  'categoryName',
  'amount',
  'currency',
  'frequency',
  'dayOfPeriod',
  'nextChargeOn',
  'daysUntil',
  'reminderDays',
  'isActive',
  'isPaused',
  'pausedUntil',
  'vaultVerdict',
  'lastChargeOn',
  'monthsCharged',
].sort();

/** An ISO date exactly `days` from today, at UTC midnight like the ledger. */
function on(dayOffset) {
  const d = new Date(Date.now() + dayOffset * DAY);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function ymd(date) {
  return date ? new Date(date).toISOString().slice(0, 10) : null;
}

let ctx;
let entertainment;
let phone;
let allowance;

test.before(async () => {
  ctx = await startApp();
  entertainment = await makeDefaultCategory({ name: 'Entertainment', type: 'expense', icon: 'film' });
  phone = await makeDefaultCategory({ name: 'Phone', type: 'expense', icon: 'phone' });
  allowance = await makeDefaultCategory({ name: 'Allowance', type: 'income', icon: 'coin' });
  await mountSubscriptions();
});

/** app.js mounts this router; mount it here when the shell has not. */
async function mountSubscriptions() {
  const { default: router } = await import('../src/routes/subscriptions.js');
  const stack = (ctx.app._router || ctx.app.router).stack;
  const mounted = stack.some(
    (layer) => layer.name === 'router' && String(layer.regexp?.source).includes('api\\/subscriptions')
  );
  if (mounted) return;

  ctx.app.use('/api/subscriptions', router);
  const layer = stack.pop();
  const before = stack.findIndex((l) => l.handle && l.handle.name === 'notFound');
  stack.splice(before === -1 ? stack.length : before, 0, layer);
}

test.after(async () => {
  await ctx.stop();
});

/* -------------------------------- fixtures --------------------------------- */

async function student() {
  const agent = ctx.newAgent();
  const session = await registerStudent(agent);
  return { agent, session, userId: session.user.id };
}

/**
 * A recurring entry written straight to the model, so every fixture lands on
 * an exact day. A weekly entry is anchored on its start date: one that began
 * five days ago is due in two days, whatever day of the week that is.
 */
async function addRule(userId, options = {}) {
  const {
    name = 'Netflix',
    category = entertainment,
    amount = '9.99',
    type = 'expense',
    frequency = 'monthly',
    dayOfPeriod = 1,
    startDate = on(-60),
    endDate = null,
    lastGeneratedOn = null,
    isActive = true,
    pausedUntil = null,
    reminderDays = null,
  } = options;

  return RecurringRule.create({
    user: userId,
    category: category._id,
    type,
    amount: toDec(amount),
    description: name,
    frequency,
    dayOfPeriod,
    startDate: new Date(`${startDate}T00:00:00.000Z`),
    endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : null,
    lastGeneratedOn: lastGeneratedOn ? new Date(`${lastGeneratedOn}T00:00:00.000Z`) : null,
    isActive,
    pausedUntil: pausedUntil ? new Date(`${pausedUntil}T00:00:00.000Z`) : null,
    reminderDays,
  });
}

/** A weekly entry due in exactly `days` days: start + 7k, so the offset is fixed. */
function weekly(userId, days, options = {}) {
  return addRule(userId, {
    frequency: 'weekly',
    dayOfPeriod: 1,
    startDate: on(days - 7),
    ...options,
  });
}

async function list(who, query = '') {
  const res = await who.agent.get(`/api/subscriptions${query}`);
  assert.equal(res.status, 200, res.text);
  return res.body;
}

function rowFor(body, description) {
  return body.rows.find((r) => r.description === description);
}

function reminders(userId) {
  return Notification.find({ user: userId, kind: 'renewal_reminder' }).sort({ createdAt: 1 });
}

/* ------------------------------- the derivation ----------------------------- */

test('the next charge is derived from the entry, and the same day every time', () => {
  // Plain objects, fixed dates: this is pure arithmetic and it must not drift
  // with the day the suite happens to run on.
  const monthly = (over) => ({
    frequency: 'monthly',
    dayOfPeriod: 15,
    startDate: '2026-01-15',
    isActive: true,
    lastGeneratedOn: null,
    endDate: null,
    ...over,
  });
  const weekly = (over) => ({
    frequency: 'weekly',
    dayOfPeriod: 1,
    startDate: '2026-09-01',
    isActive: true,
    lastGeneratedOn: null,
    endDate: null,
    ...over,
  });

  // a monthly entry charges on its day, this month or the next
  assert.equal(ymd(nextChargeOn(monthly(), new Date(Date.UTC(2026, 8, 20)))), '2026-10-15');
  assert.equal(ymd(nextChargeOn(monthly(), new Date(Date.UTC(2026, 8, 10)))), '2026-09-15');
  // ... and never twice: a cursor already on the date means it has been logged
  assert.equal(
    ymd(nextChargeOn(monthly({ lastGeneratedOn: '2026-09-15' }), new Date(Date.UTC(2026, 8, 20)))),
    '2026-10-15'
  );
  assert.equal(
    ymd(nextChargeOn(monthly({ lastGeneratedOn: '2026-09-15' }), new Date(Date.UTC(2026, 8, 15)))),
    '2026-10-15',
    'the charge logged today is not the charge to warn about'
  );

  // a weekly entry is every seventh day from the day it started
  assert.equal(ymd(nextChargeOn(weekly(), new Date(Date.UTC(2026, 8, 10)))), '2026-09-15');
  assert.equal(ymd(nextChargeOn(weekly(), new Date(Date.UTC(2026, 8, 15)))), '2026-09-15');
  assert.equal(
    ymd(nextChargeOn(weekly({ lastGeneratedOn: '2026-09-08' }), new Date(Date.UTC(2026, 8, 10)))),
    '2026-09-15'
  );

  // an entry that has not started yet is due on the day it starts
  assert.equal(
    ymd(nextChargeOn(monthly({ startDate: '2026-11-02' }), new Date(Date.UTC(2026, 8, 20)))),
    '2026-11-02'
  );

  // day 29 to 31 lands on the last day of a shorter month
  const on31 = monthly({ dayOfPeriod: 31, startDate: '2026-01-31' });
  assert.equal(ymd(nextChargeOn(on31, new Date(Date.UTC(2026, 1, 1)))), '2026-02-28', 'February 2026');
  assert.equal(
    ymd(nextChargeOn(monthly({ dayOfPeriod: 31, startDate: '2028-01-31' }), new Date(Date.UTC(2028, 1, 1)))),
    '2028-02-29',
    'February 2028 is a leap February'
  );
  assert.equal(ymd(nextChargeOn(monthly({ dayOfPeriod: 30 }), new Date(Date.UTC(2026, 1, 1)))), '2026-02-28');
  assert.equal(ymd(nextChargeOn(monthly({ dayOfPeriod: 29 }), new Date(Date.UTC(2026, 1, 1)))), '2026-02-28');
  // ... and the clamp does not stick: March is long again
  assert.equal(
    ymd(nextChargeOn(on31, new Date(Date.UTC(2026, 2, 1)))),
    '2026-03-31',
    'a February charge does not drag the entry into the 28th of every month'
  );

  // nothing coming: cancelled, finished, or inside a pause
  assert.equal(nextChargeOn(monthly({ isActive: false }), new Date(Date.UTC(2026, 8, 20))), null);
  assert.equal(
    nextChargeOn(monthly({ endDate: '2026-08-31' }), new Date(Date.UTC(2026, 8, 20))),
    null,
    'an entry past its end date has nothing left to charge'
  );
  assert.equal(
    ymd(nextChargeOn(monthly({ endDate: '2026-10-20' }), new Date(Date.UTC(2026, 8, 20)))),
    '2026-10-15',
    'the last charge that still falls inside the end date'
  );
  assert.equal(
    nextChargeOn(monthly({ endDate: '2026-10-10' }), new Date(Date.UTC(2026, 8, 20))),
    null,
    'nothing left once the next one would fall past the end date'
  );
  assert.equal(
    nextChargeOn(monthly({ pausedUntil: '2026-10-10' }), new Date(Date.UTC(2026, 8, 20))),
    null,
    'a pause means no charge to count down to'
  );

  // a pause that has run out is not a pause
  assert.equal(isPausedOn(monthly({ pausedUntil: '2026-09-20' }), new Date(Date.UTC(2026, 8, 20))), false);
  assert.equal(isPausedOn(monthly({ pausedUntil: '2026-09-21' }), new Date(Date.UTC(2026, 8, 20))), true);
  assert.equal(ymd(nextChargeOn(monthly({ pausedUntil: '2026-09-20' }), new Date(Date.UTC(2026, 8, 20)))), '2026-10-15');
});

/* ---------------------------------- report --------------------------------- */

test('the list is every recurring expense, soonest charge first, with the month it costs', async () => {
  const { agent, session, userId } = await student();

  await addRule(userId, { name: 'Monthly rent share', amount: '120.00', dayOfPeriod: 15 });
  await addRule(userId, { name: 'Gym membership', frequency: 'weekly', startDate: on(-19), dayOfPeriod: 1 });
  await addRule(userId, { name: 'Old streaming pack', amount: '7.50', isActive: false });
  // an allowance is not a subscription, and neither is an entry sitting in a
  // category that is not a spending one
  await addRule(userId, {
    name: 'Monthly allowance',
    category: allowance,
    type: 'income',
    amount: '400.00',
  });
  await addRule(userId, { name: 'Mislabelled entry', category: allowance, amount: '25.00' });

  const body = await list({ agent });
  assert.deepEqual(Object.keys(body.totals).sort(), ['active', 'dueIn30', 'dueIn7', 'monthly', 'paused']);
  assert.deepEqual(
    body.rows.map((r) => r.description).sort(),
    ['Gym membership', 'Monthly rent share', 'Old streaming pack']
  );
  for (const row of body.rows) {
    assert.deepEqual(Object.keys(row).sort(), ROW_FIELDS, 'the row shape is what the page renders');
  }

  // a cancelled entry has no charge coming and sorts last
  const dead = rowFor(body, 'Old streaming pack');
  assert.equal(dead.isActive, false);
  assert.equal(dead.nextChargeOn, null);
  assert.equal(dead.daysUntil, null);
  assert.equal(body.rows[body.rows.length - 1].description, 'Old streaming pack');

  // the currency is the person's own ledger currency, not a guess
  const gym = rowFor(body, 'Gym membership');
  assert.equal(gym.currency, session.user.ledgerCurrency);
  assert.equal(gym.categoryName, 'Entertainment');
  assert.equal(gym.categoryId, entertainment._id.toString());
  assert.equal(gym.amount, 9.99);

  // a week of 10.00 is 52/12 of a month; the total is the sum of the live rows
  await RecurringRule.updateOne(
    { _id: rowFor(body, 'Gym membership').ruleId },
    { $set: { amount: toDec('10.00') } }
  );
  const after = await list({ agent });
  assert.equal(after.totals.monthly, 163.33, '120.00 a month plus 52/12 of 10.00, rounded once');
  assert.equal(after.totals.active, 2, 'the cancelled entry is not a live charge');
  assert.equal(after.totals.paused, 0);
  assert.ok(after.totals.dueIn7 <= after.totals.dueIn30);
});

test('a category narrows the list without changing what a subscription is', async () => {
  const { agent, userId } = await student();
  await addRule(userId, { name: 'Phone plan', category: phone, amount: '15.00' });
  await addRule(userId, { name: 'Netflix', category: entertainment, amount: '9.99' });

  const all = await list({ agent });
  assert.equal(all.rows.length, 2);
  assert.equal(all.totals.monthly, 24.99);

  const one = await list({ agent }, `?categoryId=${phone._id.toString()}`);
  assert.equal(one.rows.length, 1);
  assert.equal(one.rows[0].description, 'Phone plan');
  assert.equal(one.totals.monthly, 15.0, 'the headline matches the list underneath it');
  assert.equal(one.totals.active, 1);
});

test('a payment can be both unused and about to charge — both are reported', async () => {
  const { agent, userId } = await student();
  // a live entry, charged 40 days ago and nothing since: the vault calls that
  // unused, and it is due today, so the renewal screen has both halves
  const gym = await addRule(userId, {
    name: 'Gym membership',
    amount: '35.00',
    dayOfPeriod: new Date().getUTCDate(),
    startDate: on(-100),
    lastGeneratedOn: on(-40),
  });
  for (const day of [-100, -70, -40]) {
    await Transaction.create({
      user: userId,
      category: entertainment._id,
      amount: toDec('35.00'),
      type: 'expense',
      description: 'Gym membership',
      date: new Date(`${on(day)}T00:00:00.000Z`),
      recurringRule: gym._id,
    });
  }

  const body = await list({ agent });
  const row = rowFor(body, 'Gym membership');
  assert.equal(row.vaultVerdict, 'idle', "the vault's own verdict, not a second opinion");
  assert.equal(ymd(row.nextChargeOn), on(0));
  assert.equal(row.daysUntil, 0);
  assert.equal(row.lastChargeOn, new Date(`${on(-40)}T00:00:00.000Z`).toISOString());
  assert.equal(row.monthsCharged, 3);

  // and it was still warned about, because it is about to charge
  const notes = await reminders(userId);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].kind, 'renewal_reminder');
  assert.equal(notes[0].messageKey, 'sub.notify.daysLeft');
  assert.equal(ymd(notes[0].dueOn), on(0));
  assert.equal(String(notes[0].rule), gym._id.toString());
  assert.deepEqual(notes[0].data, {
    name: 'Gym membership',
    amount: 35,
    currency: row.currency,
    days: 0,
  });
  assert.ok(notes[0].message.length > 0 && notes[0].message.length <= 400, 'a short fallback, still English');
});

/* --------------------------------- reminder -------------------------------- */

test('the reminder fires once for a charge, however many times the list is read', async () => {
  const { agent, session, userId } = await student();
  await weekly(userId, 2, { name: 'Netflix', amount: '9.99' });

  const first = await list({ agent });
  assert.equal(first.rows[0].daysUntil, 2);
  assert.equal(first.reminders, 1);

  const again = await list({ agent });
  assert.equal(again.reminders, 0, 'the second read creates nothing');

  const check = await withCsrf(session, agent.post('/api/subscriptions/check')).send({});
  assert.equal(check.status, 200, check.text);
  assert.equal(check.body.created, 0);
  assert.equal(check.body.due, 1, 'it is still due, it is just already said');

  const notes = await reminders(userId);
  assert.equal(notes.length, 1, 'one row in the bell, not three');
  assert.equal(notes[0].data.days, 2);
});

test('a charge further off than the window is left alone', async () => {
  const { agent, userId } = await student();
  await weekly(userId, 5, { name: 'Netflix' });

  const body = await list({ agent });
  assert.equal(body.rows[0].daysUntil, 5);
  assert.equal(body.reminders, 0);
  assert.equal((await reminders(userId)).length, 0);
  assert.equal(body.totals.dueIn7, 1, 'it is still on the list, and counted in the week');
});

test("a rule's own warning distance wins over the default", async () => {
  const { agent, session, userId } = await student();
  // five days out: outside the three-day default
  await weekly(userId, 5, { name: 'Wants ten days', reminderDays: 10 });
  await weekly(userId, 5, { name: 'Takes the default' });
  // due today, but this one only wants to hear about it on the day
  await weekly(userId, 0, { name: 'Wants the day itself', reminderDays: 0 });
  // four days out with a wider warning: still inside it
  await weekly(userId, 4, { name: 'Wants four days', reminderDays: 4 });

  const body = await list({ agent });
  const names = (await reminders(userId)).map((n) => n.data.name).sort();
  assert.deepEqual(
    names,
    ['Wants four days', 'Wants ten days', 'Wants the day itself'],
    'the default did not speak for the two five-day entries, and the day itself is a warning like any other'
  );
  assert.equal(body.reminders, 3);

  // the row shows the choice the person made, null where they made none
  assert.equal(rowFor(body, 'Wants ten days').reminderDays, 10);
  assert.equal(rowFor(body, 'Takes the default').reminderDays, null);

  // a wider window on the request warns about the rest, once each
  const wider = await withCsrf(session, agent.post('/api/subscriptions/check')).send({ withinDays: 30 });
  assert.equal(wider.status, 200, wider.text);
  assert.equal(wider.body.created, 1, 'only the entry that had left the default');
  assert.equal((await reminders(userId)).length, 4);
  assert.equal((await list({ agent })).reminders, 0, 'and the fifth read adds nothing');
});

/* ---------------------------------- actions -------------------------------- */

test('pause, resume and cancel walk one entry all the way round', async () => {
  const { agent, session, userId } = await student();
  const rule = await weekly(userId, 2, { name: 'Netflix', amount: '9.99' });
  const id = rule._id.toString();

  // the warning exists before the pause does
  assert.equal((await list({ agent })).reminders, 1);
  assert.equal((await reminders(userId)).length, 1);

  const paused = await withCsrf(session, agent.post(`/api/subscriptions/${id}/pause`)).send({ days: 30 });
  assert.equal(paused.status, 200, paused.text);
  assert.equal(paused.body.ok, true);
  assert.equal(ymd(paused.body.pausedUntil), on(30));
  assert.equal((await reminders(userId)).length, 0, 'a warning about a charge that will not happen is gone');

  const held = await list({ agent });
  const heldRow = rowFor(held, 'Netflix');
  assert.equal(heldRow.isPaused, true);
  assert.equal(heldRow.nextChargeOn, null, 'nothing to count down to while the pause holds');
  assert.equal(heldRow.daysUntil, null);
  assert.equal(ymd(heldRow.pausedUntil), on(30));
  assert.equal(held.totals.paused, 1);
  assert.equal(held.totals.dueIn7, 0);
  assert.equal(held.reminders, 0, 'and nothing warns about it while it is held');
  assert.equal(held.totals.monthly, 43.29, 'but the money is still coming after the pause');

  // pausing again only moves the date; it is not an error
  const longer = await withCsrf(session, agent.post(`/api/subscriptions/${id}/pause`)).send({ days: 90 });
  assert.equal(longer.status, 200);
  assert.equal(ymd(longer.body.pausedUntil), on(90));
  // and a year is as long as a pause goes
  const capped = await withCsrf(session, agent.post(`/api/subscriptions/${id}/pause`)).send({ days: 4000 });
  assert.equal(ymd(capped.body.pausedUntil), on(365));

  const resumed = await withCsrf(session, agent.post(`/api/subscriptions/${id}/resume`)).send({});
  assert.equal(resumed.status, 200, resumed.text);
  assert.equal(resumed.body.pausedUntil, null);
  assert.equal(ymd(resumed.body.nextChargeOn), on(2));

  const live = await list({ agent });
  assert.equal(rowFor(live, 'Netflix').isPaused, false);
  assert.equal(rowFor(live, 'Netflix').daysUntil, 2);
  assert.equal(live.totals.paused, 0);

  // cancelling stops the entry and keeps its history
  const before = await Transaction.countDocuments({ user: userId, recurringRule: id });
  const cancelled = await withCsrf(session, agent.post(`/api/subscriptions/${id}/cancel`)).send({});
  assert.equal(cancelled.status, 200, cancelled.text);
  assert.equal(cancelled.body.wasActive, true);
  assert.equal((await RecurringRule.findById(id)).isActive, false);
  assert.equal(await Transaction.countDocuments({ user: userId, recurringRule: id }), before);
  const stopped = await list({ agent });
  assert.equal(rowFor(stopped, 'Netflix').nextChargeOn, null);
  assert.equal(stopped.totals.monthly, 0, 'a cancelled entry is not money anyone is waiting for');
  assert.equal(stopped.totals.active, 0);
  assert.equal((await reminders(userId)).length, 0);

  // doing it twice is not an error, it is the same answer
  const again = await withCsrf(session, agent.post(`/api/subscriptions/${id}/cancel`)).send({});
  assert.equal(again.status, 200);
  assert.equal(again.body.wasActive, false);
});

test('a cancelled entry can be paused and resumed like any other', async () => {
  const { agent, session, userId } = await student();
  const id = (await addRule(userId, { name: 'Phone plan', isActive: false }))._id.toString();

  const paused = await withCsrf(session, agent.post(`/api/subscriptions/${id}/pause`)).send({});
  assert.equal(paused.status, 200, paused.text);
  assert.equal(ymd(paused.body.pausedUntil), on(30));

  const resumed = await withCsrf(session, agent.post(`/api/subscriptions/${id}/resume`)).send({});
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.nextChargeOn, null, 'still cancelled: resuming is not un-cancelling');
  const row = rowFor(await list({ agent }), 'Phone plan');
  assert.equal(row.isActive, false);
  assert.equal(row.isPaused, false);
});

test("the warning distance is the person's own choice, and a bad one is refused", async () => {
  const { agent, session, userId } = await student();
  const id = (await addRule(userId, { name: 'Netflix' }))._id.toString();

  for (const value of [30, 0, 7, null]) {
    const res = await withCsrf(session, agent.patch(`/api/subscriptions/${id}`)).send({ reminderDays: value });
    assert.equal(res.status, 200, `${value} should be allowed: ${res.text}`);
    assert.equal(res.body.reminderDays, value);
  }
  assert.equal((await RecurringRule.findById(id)).reminderDays, null, 'null hands the choice back');

  for (const value of [31, -1, 2.5, 'soon', true, []]) {
    const res = await withCsrf(session, agent.patch(`/api/subscriptions/${id}`)).send({ reminderDays: value });
    assert.equal(res.status, 400, `${JSON.stringify(value)} should be refused`);
    assert.ok(res.body.error, 'and the sentence says what is wrong');
  }
  const missing = await withCsrf(session, agent.patch(`/api/subscriptions/${id}`)).send({});
  assert.equal(missing.status, 400, 'a patch that changes nothing is a mistake, not a no-op');
  assert.equal((await RecurringRule.findById(id)).reminderDays, null);
});

test('a pause of nothing, or nothing at all, is refused with a sentence', async () => {
  const { agent, session, userId } = await student();
  const id = (await addRule(userId, { name: 'Netflix' }))._id.toString();

  for (const days of [0, -3, 1.5, 'soon', true]) {
    const res = await withCsrf(session, agent.post(`/api/subscriptions/${id}/pause`)).send({ days });
    assert.equal(res.status, 400, `${JSON.stringify(days)} should be refused`);
    assert.match(res.body.error, /day/i);
  }
  assert.equal((await RecurringRule.findById(id)).pausedUntil, null, 'and nothing was half-done');

  // no days at all is the default, not a mistake
  const fallback = await withCsrf(session, agent.post(`/api/subscriptions/${id}/pause`)).send({});
  assert.equal(fallback.status, 200, fallback.text);
  assert.equal(fallback.body.days, 30);
  assert.equal(ymd(fallback.body.pausedUntil), on(30));
});

/* --------------------------------- isolation -------------------------------- */

test("somebody else's entry is a 404, never a 403, and never on the list", async () => {
  const owner = await student();
  const id = (await weekly(owner.userId, 2, { name: 'Netflix' }))._id.toString();
  await list(owner);

  const stranger = await student();
  await weekly(stranger.userId, 2, { name: 'Their own' });

  const calls = [
    ['post', `/api/subscriptions/${id}/pause`, { days: 30 }],
    ['post', `/api/subscriptions/${id}/resume`, {}],
    ['post', `/api/subscriptions/${id}/cancel`, {}],
    ['patch', `/api/subscriptions/${id}`, { reminderDays: 5 }],
  ];
  for (const [method, url, body] of calls) {
    const res = await withCsrf(stranger.session, stranger.agent[method](url)).send(body);
    assert.equal(res.status, 404, `${method.toUpperCase()} ${url} should be a 404: ${res.text}`);
    assert.ok(res.body.error, 'with a sentence');
  }
  // an id that is not an id is the same answer
  const broken = await withCsrf(stranger.session, stranger.agent.get('/api/subscriptions?categoryId=nope'));
  assert.equal(broken.status, 200, 'a bad filter is tuning, not a request about somebody else');
  const noSuch = await withCsrf(stranger.session, stranger.agent.post('/api/subscriptions/nonsense/cancel')).send({});
  assert.equal(noSuch.status, 404);
  const nobody = await withCsrf(stranger.session, stranger.agent.post(`/api/subscriptions/${'0'.repeat(24)}/pause`)).send({});
  assert.equal(nobody.status, 404, 'an entry that does not exist is a 404');

  const untouched = await RecurringRule.findById(id);
  assert.equal(untouched.pausedUntil, null);
  assert.equal(untouched.isActive, true);

  // and each person only ever sees their own
  const mine = await list(stranger);
  assert.deepEqual(mine.rows.map((r) => r.description), ['Their own']);
  assert.equal((await reminders(stranger.userId)).length, 1);
  assert.equal((await reminders(owner.userId)).length, 1, 'and the owner still has exactly their own');
});

/* --------------------------------- the generator ---------------------------- */

test('the generator skips the dates a pause covers, and does not catch up later', async () => {
  const { agent, session, userId } = await student();
  const user = await User.findById(userId);

  // a weekly entry that began 22 days ago: four charges are already due
  const held = await addRule(userId, {
    name: 'Gym membership',
    frequency: 'weekly',
    startDate: on(-22),
    pausedUntil: on(10),
  });
  const plain = await addRule(userId, { name: 'Laundry', frequency: 'weekly', startDate: on(-22) });

  const first = await generateForUser(user);
  assert.equal(first, 4, 'only the entry that is not paused is charged');
  assert.equal(await Transaction.countDocuments({ user: userId, recurringRule: held._id }), 0);
  assert.equal(await Transaction.countDocuments({ user: userId, recurringRule: plain._id }), 4);
  assert.equal(ymd((await RecurringRule.findById(held._id)).lastGeneratedOn), on(-1), 'the cursor moved past them');

  // A pause neither saves the skipped charges up nor invents one when it ends.
  //
  // This used to assert the opposite, and the number it asserted was the bug: a
  // weekly rule that began 22 days ago falls due on on(-22), on(-15), on(-8) and
  // on(-1), and then on(6). Today is on(0), which is not on that series at all -
  // so the charge the generator used to log "the first charge after the pause" was
  // the phantom charge, landing on the one day that made it look like a real one.
  // The correct claim is the stronger one: on the day the pause ends there is
  // nothing due, and the cursor is left where the series says it is.
  const resumed = await withCsrf(session, agent.post(`/api/subscriptions/${held._id}/resume`)).send({});
  assert.equal(resumed.status, 200, resumed.text);
  await generateForUser(user);

  assert.equal(
    await Transaction.countDocuments({ user: userId, recurringRule: held._id }),
    0,
    'resuming a pause charges nothing on the day it ends, because nothing is due on that day'
  );
  assert.equal(
    ymd((await RecurringRule.findById(held._id)).lastGeneratedOn),
    on(-1),
    'and the cursor stays on the series instead of stepping a day forward to find work'
  );

  for (const day of [-22, -15, -8, -1, 0]) {
    assert.equal(
      await Transaction.countDocuments({
        user: userId,
        recurringRule: held._id,
        date: new Date(`${on(day)}T00:00:00.000Z`),
      }),
      0,
      `nothing was saved up for ${on(day)}`
    );
  }

  // a pause that has ended is not a pause: the entry walks as it did before, and
  // running it again is still nothing - there is no charge due before its next date
  await generateForUser(user);
  assert.equal(
    await Transaction.countDocuments({ user: userId, recurringRule: held._id }),
    0,
    'and nothing extra appears on the days the pause swallowed'
  );

  // The screen that warns about renewals derives its date from the rule's schedule
  // while the generator walks the ledger, so the two could disagree - and did, while
  // the ledger was logging phantom charges. They must name the same day.
  const listed = (await agent.get('/api/subscriptions')).body.rows.find((r) => r.ruleId === held._id.toString());
  assert.ok(listed, 'the entry is on the renewal list');
  assert.equal(
    // ymd() because the list answers a full ISO instant while on() answers a plain
    // calendar date. The day is the claim - a substring match would also pass for
    // 14 October, which is the sort of loose check that hides a wrong date.
    ymd(listed.nextChargeOn),
    on(6),
    'the next charge the screen names is the rule own next date, and the ledger agrees with it'
  );
});
