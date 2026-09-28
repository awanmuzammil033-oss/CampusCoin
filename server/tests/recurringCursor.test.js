/**
 * The recurring generator charged a bill twice (NEW-6, found while shipping the
 * renewal reminders).
 *
 * The generator keeps its place with `lastGeneratedOn` and, before this was
 * fixed, resumed from the day AFTER it:
 *
 *     const cursor = rule.lastGeneratedOn ? addDays(startOfDay(rule.lastGeneratedOn), 1) : start;
 *
 * `+ 1 day` is not where a recurrence continues - it is where the DAY AFTER the
 * last charge is. A monthly bus pass on the 1st therefore resumed on the 2nd, did
 * not find a charge there, and logged one: two charges for one subscription. Each
 * further run stepped one day further and added another, so pressing the catch-up
 * button twenty-eight times in a month produced twenty-eight charges, and the
 * daily job (`scripts/generate-recurring.js`) produced one phantom per day. For a
 * weekly rule it was worse in a quieter way: the whole series slid a day later
 * forever, because every subsequent occurrence was measured from the phantom.
 *
 * The test below needs no clock control at all, which is the point. The
 * catch-up button is real and the client offers it, so calling the generator
 * twice in a row on the same afternoon is something a person can do by accident.
 * The rule starts in the past so the first call has a charge to log, and the
 * second call is the one that used to double it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, withCsrf, makeDefaultCategory } from './helpers.js';

let ctx;
let newAgent;
let transport;
let food;

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
  transport = await makeDefaultCategory({ name: 'Transport', type: 'expense', icon: 'bus' });
  food = await makeDefaultCategory({ name: 'Food', type: 'expense', icon: 'cup' });
});

test.after(async () => {
  await ctx.stop();
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** The first of this month, so a call today has an occurrence to log. */
const firstOfThisMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12, 0, 0)).toISOString();
};

async function studentWithRule(overrides = {}) {
  const agent = newAgent();
  const user = await registerStudent(agent);
  const created = await withCsrf(user, agent.post('/api/recurring')).send({
    type: 'expense',
    amount: '300',
    categoryId: transport._id.toString(),
    frequency: 'monthly',
    startDate: firstOfThisMonth(),
    description: 'monthly bus pass',
    ...overrides,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return { agent, user };
}

const generate = async ({ agent, user }) => {
  const res = await withCsrf(user, agent.post('/api/recurring/generate')).send();
  assert.equal(res.status, 200, res.text);
  return res.body.created;
};

/** Every charge this person's recurring rules produced, as ISO dates. */
const chargeDates = async ({ agent, user }) => {
  const res = await agent.get('/api/transactions?perPage=100');
  assert.equal(res.status, 200, res.text);
  return res.body.rows
    .filter((row) => row.recurringRule)
    .map((row) => String(row.date).slice(0, 10))
    .sort();
};

/* --------------------------------------------------------------------------- */

test('running the generator twice in a row charges a monthly bill once, not twice', async () => {
  const who = await studentWithRule();

  const first = await generate(who);
  assert.equal(first, 1, 'the first call logs the occurrence that is due');

  const second = await generate(who);
  assert.equal(second, 0, 'the second call has nothing left to log - this is the bug');

  const dates = await chargeDates(who);
  assert.equal(dates.length, 1, `a monthly bill was charged ${dates.length} times: ${dates.join(', ')}`);
});

test('a weekly rule logs its own series and nothing beside it', async () => {
  const who = await studentWithRule({ frequency: 'weekly', amount: '20', categoryId: food._id.toString() });

  await generate(who);

  // the expectation, stated as the series rather than as a count: every seven days
  // from the 1st, up to today and no further. An earlier version of this test
  // expected ONE charge here, which was simply wrong - a rule that began three and
  // a half weeks ago has four occurrences due, and a test that says otherwise is
  // a test that has to be edited the day the day of the month changes.
  const start = new Date(firstOfThisMonth());
  const today = new Date();
  const expected = [];
  for (let d = new Date(start); d <= today; d = new Date(d.getTime() + 7 * DAY_MS)) {
    expected.push(d.toISOString().slice(0, 10));
  }
  assert.ok(expected.length >= 4, `the fixture should be catch-up-able, got ${expected.length}`);

  const dates = await chargeDates(who);
  assert.deepEqual(dates, expected, 'every occurrence on the series, and not a day beside one');

  // and a second run on the same day must not step off the series to find work
  await generate(who);
  assert.deepEqual(await chargeDates(who), expected, 'a second run on the same day adds nothing at all');
});

test('ten runs on the same day still produce exactly one charge', async () => {
  const who = await studentWithRule();

  let total = 0;
  for (let i = 0; i < 10; i += 1) total += await generate(who);

  assert.equal(total, 1, `ten runs logged ${total} charges for one subscription`);
  const dates = await chargeDates(who);
  assert.equal(dates.length, 1, `and the ledger holds ${dates.length}: ${dates.join(', ')}`);
});

test('a rule that already holds a phantom recovers onto its own series', async () => {
  // The fix cannot rewrite history, so it has to cope with a ledger that already
  // has the extra charge in it: resuming from a date that is not on the series
  // must re-align rather than keep walking forward from the wrong day.
  const who = await studentWithRule();
  const rules = (await who.agent.get('/api/recurring')).body.rows;
  const ruleId = rules[0].id;

  await generate(who);
  const dates = await chargeDates(who);
  assert.equal(dates.length, 1);

  // pretend the stored cursor drifted, the way a bad run left it
  const { default: RecurringRule } = await import('../src/models/RecurringRule.js');
  const rule = await RecurringRule.findById(ruleId);
  rule.lastGeneratedOn = new Date(`${dates[0]}T00:00:00.000Z`);
  rule.lastGeneratedOn.setUTCDate(rule.lastGeneratedOn.getUTCDate() + 1); // the phantom day
  await rule.save();

  const created = await generate(who);
  assert.equal(created, 0, 'and the next run does not pile another charge on the wrong day');
});
