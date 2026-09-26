import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, makeDefaultCategory, withCsrf } from './helpers.js';
import { parseQuickText, parseQuickDate, matchCategory } from '../src/services/quickText.js';
import { daysLeftInMonth, committedBeforeMonthEnd } from '../src/services/survival.js';

let ctx;
let newAgent;
let food;
let transport;
let allowance;
let todayStr;

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
  food = await makeDefaultCategory({ name: 'Food', type: 'expense', icon: 'cup' });
  transport = await makeDefaultCategory({ name: 'Transport', type: 'expense', icon: 'bus' });
  allowance = await makeDefaultCategory({ name: 'Allowance', type: 'income', icon: 'wallet' });
  todayStr = new Date().toISOString().slice(0, 10);
});

test.after(async () => {
  await ctx.stop();
});

/* ----------------------------- the parser (pure) ---------------------------- */

test('reads the amount out of a sentence the way a student says it', () => {
  const cases = [
    ['yaar aaj canteen par 350 kharch kiye', 350],
    ['lunch was 250 rs', 250],
    ['paid 1,200 for the hostel rent', 1200],
    ['uber ride ₹340', 340],
    ['coffee $4.50', 4.5],
    ['book 1.5k', 1500],
  ];
  for (const [text, amount] of cases) {
    const draft = parseQuickText(text);
    assert.equal(draft.ok, true, text);
    assert.equal(draft.amount, amount, text);
  }
});

test('a decimal comma is cents, not thousands', () => {
  // the translated placeholder in Spanish, French, German and Portuguese reads
  // "3,50" — reading that as 350 would log a coffee as a small loan
  for (const [text, amount, category] of [
    ['hoy comí en la cafetería por 3,50', 3.5, 'Food'],
    ['cantine 3,50 aujourd\'hui', 3.5, 'Food'],
    ['heute Mensa 12,50', 12.5, 'Food'],
    ['almço 18,90 no refeitório', 18.9, 'Food'],
  ]) {
    const draft = parseQuickText(text);
    assert.equal(draft.ok, true, text);
    assert.equal(draft.amount, amount, text);
    assert.equal(draft.categoryName, category, text);
  }
  // …while English-style thousands still work
  assert.equal(parseQuickText('rent 1,200').amount, 1200);
  assert.equal(parseQuickText('rent 12,500').amount, 12500);
});

test('the sentence each language is taught in the app really parses', () => {
  // these are the translated `quick.placeholder` values: the words the
  // interface suggests must be words the parser knows, or the app would teach
  // a category it then refuses to use
  const taught = [
    ['जैसे यार आज कैंटीन पर 350 खर्च किए', 350, 'Food'], // hi
    ['مثلاً یار آج کینٹین پر 350 خرچ کر دیے', 350, 'Food'], // ur
    ['مثال: يا صديقي اليوم مطعم 350', 350, 'Food'], // ar
    ['bugün kantinde 350 harcadım', 350, 'Food'], // tr
    ['今天在食堂花了 350', 350, 'Food'], // zh
  ];
  for (const [text, amount, category] of taught) {
    const draft = parseQuickText(text);
    assert.equal(draft.ok, true, text);
    assert.equal(draft.amount, amount, text);
    assert.equal(draft.categoryName, category, text);
    assert.notEqual(draft.categoryHint, 'fallback', `${text} should not fall back to Miscellaneous`);
  }
});

test('"yesterday" is understood in the scripts the app is read in', () => {
  const now = new Date(Date.UTC(2026, 8, 25, 9, 0));
  for (const text of ['yesterday canteen 100', 'कल कैंटीन 100', 'أمس مطعم 100', 'gestern Mensa 100']) {
    const { date, from } = parseQuickDate(text, now);
    assert.equal(from, 'yesterday', text);
    assert.equal(date.toISOString().slice(0, 10), '2026-09-24', text);
  }
  for (const text of ['aaj 100', 'आज 100', 'اليوم 100', 'heute 100']) {
    assert.equal(parseQuickDate(text, now).from, 'today', text);
  }
});

test('refuses a sentence with no amount instead of inventing one', () => {
  const draft = parseQuickText('bought some food');
  assert.equal(draft.ok, false);
  assert.equal(draft.reason, 'no-amount');
});

test('picks the category from the words, in English and in Roman Urdu', () => {
  assert.equal(matchCategory('canteen par kharch kiya').name, 'Food');
  assert.equal(matchCategory('uber ride to campus').name, 'Transport');
  assert.equal(matchCategory('hostel rent bheja').name, 'Hostel/Rent');
  assert.equal(matchCategory('netflix subscription').name, 'Subscriptions');
  assert.equal(matchCategory('got my allowance today').name, 'Allowance');
  assert.equal(matchCategory('scholarship received').type, 'income');
  // a word nobody listed still lands somewhere safe
  assert.equal(matchCategory('some random thing 100').name, 'Miscellaneous');
});

test('whole words only: facebook must not read as a book', () => {
  const draft = parseQuickText('facebook ads 500');
  assert.equal(draft.categoryName, 'Miscellaneous');
});

test('a date in the sentence is never read as the amount', () => {
  const draft = parseQuickText('on 12/09 paid 800 to the hostel');
  assert.equal(draft.amount, 800);
});

test('understands yesterday and an explicit date', () => {
  const now = new Date(Date.UTC(2026, 8, 25, 6, 0)); // 25 Sep 2026, morning
  const y = parseQuickDate('yesterday lunch', now);
  assert.equal(y.date.getUTCDate(), 24);
  const iso = parseQuickDate('paid on 2026-09-20', now);
  assert.equal(iso.date.getUTCMonth(), 8);
  assert.equal(iso.date.getUTCDate(), 20);
  const dm = parseQuickDate('on 12/09 for the bus', now);
  assert.equal(dm.date.getUTCDate(), 12);
  const us = parseQuickDate('on 09/25 for the bus', now); // month first when it can only be
  assert.equal(us.date.getUTCDate(), 25);
  // nonsense years are treated as typos, not history
  const bad = parseQuickDate('on 1999-01-01', now);
  assert.equal(bad.from, 'today');
  // and "today" is UTC midnight, the same day the quick-add form would save
  const today = parseQuickDate('canteen 350', now);
  assert.equal(today.date.getTime(), Date.UTC(2026, 8, 25));
});

test('confidence is higher when the words and the currency agree', () => {
  const strong = parseQuickText('canteen 350 rs');
  const weak = parseQuickText('spent 350');
  assert.ok(strong.confidence > weak.confidence, `${strong.confidence} > ${weak.confidence}`);
});

/* ------------------------------ the endpoint ------------------------------- */

test('a sentence becomes a real entry, with a friendly confirmation payload', async () => {
  const agent = newAgent();
  const user = await registerStudent(agent);

  const res = await withCsrf(user, agent.post('/api/quick-text')).send({ text: 'yaar aaj canteen par 350 kharch kiye' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.transaction.amount, 350, JSON.stringify(res.body));
  assert.equal(res.body.category.name, 'Food');
  assert.equal(res.body.transaction.type, 'expense');
  assert.equal(res.body.draft.confidence > 0.5, true);

  // and it is in the ledger like any other entry
  const list = await agent.get('/api/transactions');
  const row = list.body.rows.find((r) => r.description.includes('canteen'));
  assert.ok(row, 'entry should be listed');
  assert.equal(Number(row.amount), 350);
});

test('an income sentence is saved as income in the income category', async () => {
  const agent = newAgent();
  const user = await registerStudent(agent);
  const res = await withCsrf(user, agent.post('/api/quick-text')).send({ text: 'received my allowance 5000' });
  assert.equal(res.status, 201);
  assert.equal(res.body.transaction.type, 'income');
  assert.equal(res.body.category.name, 'Allowance');
});

test('a sentence with no amount is rejected with a readable reason', async () => {
  const agent = newAgent();
  const user = await registerStudent(agent);
  const res = await withCsrf(user, agent.post('/api/quick-text')).send({ text: 'bought food' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /amount/i);
});

test('preview parses without writing anything', async () => {
  const agent = newAgent();
  const user = await registerStudent(agent);
  const res = await withCsrf(user, agent.post('/api/quick-text/preview')).send({ text: 'bus pass 300' });
  assert.equal(res.body.draft.amount, 300);
  assert.equal(res.body.draft.categoryName, 'Transport');

  const list = await agent.get('/api/transactions');
  assert.equal(list.body.rows.length, 0, 'preview must not save');
});

test('one student can never see or log into another student\'s data', async () => {
  const agentA = newAgent();
  const userA = await registerStudent(agentA);
  await withCsrf(userA, agentA.post('/api/quick-text')).send({ text: 'canteen 100' });

  const agentB = newAgent();
  await registerStudent(agentB);
  const list = await agentB.get('/api/transactions');
  assert.equal(list.body.rows.length, 0);
});

/* ------------------------------- survival mode ------------------------------ */

test('survival mode works out one number and shows the working', async () => {
  const agent = newAgent();
  const user = await registerStudent(agent);

  // 1000 in, 600 out → balance 400
  await withCsrf(user, agent.post('/api/transactions')).send({
    type: 'income', amount: '1000', categoryId: allowance._id.toString(), date: todayStr, description: 'allowance',
  });
  await withCsrf(user, agent.post('/api/transactions')).send({
    type: 'expense', amount: '600', categoryId: food._id.toString(), date: todayStr, description: 'food so far',
  });

  const off = await agent.get('/api/survival');
  assert.equal(off.body.plan.enabled, false);
  assert.equal(off.body.plan.balance, 400);

  const on = await withCsrf(user, agent.patch('/api/survival')).send({ enabled: true });
  assert.equal(on.status, 200);
  const plan = on.body.plan;
  assert.equal(plan.enabled, true);
  assert.equal(plan.balance, 400);
  assert.ok(plan.daysLeft >= 1);
  // no recurring rules yet, so the whole balance is free to spend
  assert.equal(plan.committedTotal, 0);
  assert.equal(plan.dailyBudget, Math.round((400 / plan.daysLeft) * 100) / 100);
  assert.ok(Array.isArray(plan.advice) && plan.advice.length > 0);
});

/** A date a few days ahead this month, as an ISO string the API accepts. */
function soon(dayOffset = 3) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString();
}

test('a recurring bill still to come is held back before the daily number', async () => {
  const agent = newAgent();
  const user = await registerStudent(agent);
  await withCsrf(user, agent.post('/api/transactions')).send({
    type: 'income', amount: '1000', categoryId: allowance._id.toString(), date: todayStr, description: 'allowance',
  });
  const rule = await withCsrf(user, agent.post('/api/recurring')).send({
    type: 'expense',
    amount: '300',
    categoryId: transport._id.toString(),
    frequency: 'monthly',
    startDate: soon(3),
    description: 'monthly bus pass',
  });
  assert.equal(rule.status, 201, JSON.stringify(rule.body));

  const res = await withCsrf(user, agent.patch('/api/survival')).send({ enabled: true });
  const plan = res.body.plan;
  assert.equal(plan.committedTotal, 300, 'the bill due before month end is held back');
  assert.equal(plan.freeMoney, 700);
  assert.equal(plan.dailyBudget, Math.round((700 / plan.daysLeft) * 100) / 100);
});

test('a weekly bill counts once per remaining week', async () => {
  const agent = newAgent();
  const user = await registerStudent(agent);
  const bill = await withCsrf(user, agent.post('/api/recurring')).send({
    type: 'expense',
    amount: '20',
    categoryId: food._id.toString(),
    frequency: 'weekly',
    startDate: soon(0),
    description: 'weekly laundry',
  });
  assert.equal(bill.status, 201, JSON.stringify(bill.body));

  const res = await withCsrf(user, agent.patch('/api/survival')).send({ enabled: true });
  const plan = res.body.plan;
  const weeks = Math.floor(plan.daysLeft / 7) + 1;
  assert.equal(plan.committedTotal, 20 * weeks, 'every remaining week is counted');
  // free money is never negative — a plan cannot promise money that is not there
  assert.equal(plan.freeMoney, Math.max(0, plan.balance - 20 * weeks));
});

test('income still to land this month is money in hand, and next month is not', () => {
  // 20 Sep: a monthly payday on the 25th is still ahead and can be spent on; one
  // on the 5th of next month has not started, and pretending otherwise would
  // hand the student an allowance they do not have yet
  const now = new Date(Date.UTC(2026, 8, 20));
  const payday = (day, month, year) => [
    { _id: 'p', isActive: true, type: 'income', amount: '500', frequency: 'monthly', dayOfPeriod: day, startDate: new Date(Date.UTC(year, month, day)) },
  ];

  const ahead = committedBeforeMonthEnd(payday(25, 8, 2026), now);
  assert.equal(ahead.income, 500);
  assert.equal(ahead.total, 0, 'income is not a bill: it is not held back');

  const nextMonth = committedBeforeMonthEnd(payday(5, 9, 2026), now);
  assert.equal(nextMonth.income, 0, 'an allowance that starts next month is not in this month\'s plan');
});

test('a balance below the committed bills is reported as a shortfall, not a plan', async () => {
  const agent = newAgent();
  const user = await registerStudent(agent);
  const rule = await withCsrf(user, agent.post('/api/recurring')).send({
    type: 'expense',
    amount: '900',
    categoryId: transport._id.toString(),
    frequency: 'monthly',
    startDate: soon(3),
    description: 'rent share',
  });
  assert.equal(rule.status, 201, JSON.stringify(rule.body));

  const res = await withCsrf(user, agent.patch('/api/survival')).send({ enabled: true });
  const plan = res.body.plan;
  assert.equal(plan.balance, 0);
  assert.equal(plan.shortfall, 900);
  assert.equal(plan.tight, true);
  assert.equal(plan.dailyBudget, 0);
  assert.ok(plan.advice.some((a) => a.key === 'short'));
});

test('the switch needs a real boolean', async () => {
  const agent = newAgent();
  const user = await registerStudent(agent);
  const res = await withCsrf(user, agent.patch('/api/survival')).send({ enabled: 'yes' });
  assert.equal(res.status, 400);
});

test('days-left and committed maths behave at the edges', () => {
  // UTC on purpose: the plan counts days on the same clock as the ledger
  // (services/ledger.js stores dates at UTC midnight), so the test must not
  // drift by a day depending on the machine's timezone.
  const last = new Date(Date.UTC(2026, 8, 30)); // 30 Sep: the last day
  assert.equal(daysLeftInMonth(last), 1);
  const feb = new Date(Date.UTC(2026, 1, 27)); // 27 Feb 2026, not a leap year
  assert.equal(daysLeftInMonth(feb), 2);

  const mid = new Date(Date.UTC(2026, 8, 20)); // 20 Sep: 11 days left
  assert.equal(daysLeftInMonth(mid), 11);

  const rules = [
    // weekly, started today → fires on the 20th and the 27th
    { _id: 'a', isActive: true, type: 'expense', amount: '100', frequency: 'weekly', dayOfPeriod: 1, startDate: mid },
    // paused: never counts
    { _id: 'b', isActive: false, type: 'expense', amount: '500', frequency: 'monthly', dayOfPeriod: 25, startDate: mid },
    // monthly on the 1st: already charged this month
    { _id: 'c', isActive: true, type: 'expense', amount: '50', frequency: 'monthly', dayOfPeriod: 1, startDate: new Date(Date.UTC(2026, 0, 1)) },
    // monthly on the 25th: still ahead
    { _id: 'd', isActive: true, type: 'expense', amount: '30', frequency: 'monthly', dayOfPeriod: 25, startDate: new Date(Date.UTC(2026, 0, 25)) },
    // finished last month
    { _id: 'e', isActive: true, type: 'expense', amount: '70', frequency: 'monthly', dayOfPeriod: 15, startDate: new Date(Date.UTC(2026, 5, 15)), endDate: new Date(Date.UTC(2026, 7, 15)) },
  ];
  const out = committedBeforeMonthEnd(rules, mid);
  assert.equal(out.lines.length, 2, 'only active rules that still land count');
  assert.equal(out.total, 230, 'two weekly firings plus the 25th bill');

  // a short month clamps the day-of-month: a 31st bill lands on the 28th
  const febRules = [{ _id: 'f', isActive: true, type: 'expense', amount: '10', frequency: 'monthly', dayOfPeriod: 31, startDate: new Date(Date.UTC(2026, 0, 31)) }];
  assert.equal(committedBeforeMonthEnd(febRules, new Date(Date.UTC(2026, 1, 1))).total, 10);
  // …still due on the 27th, because it lands on the 28th …
  assert.equal(committedBeforeMonthEnd(febRules, new Date(Date.UTC(2026, 1, 27))).total, 10);
  // …and due today, on the 28th — the same day the generator pays it
  assert.equal(committedBeforeMonthEnd(febRules, new Date(Date.UTC(2026, 1, 28))).total, 10);

  // a day-of-month that has passed is not held back again
  const passed = [{ ...febRules[0], dayOfPeriod: 10 }];
  assert.equal(committedBeforeMonthEnd(passed, new Date(Date.UTC(2026, 1, 20))).total, 0);
});

test('a rule that only starts next month is not counted this month', () => {
  const now = new Date(Date.UTC(2026, 8, 20));
  const nextMonth = [{ _id: 'g', isActive: true, type: 'expense', amount: '99', frequency: 'monthly', dayOfPeriod: 5, startDate: new Date(Date.UTC(2026, 9, 5)) }];
  assert.equal(committedBeforeMonthEnd(nextMonth, now).total, 0);
});
