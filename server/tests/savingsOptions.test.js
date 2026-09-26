import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, withCsrf } from './helpers.js';

let ctx;
let newAgent;
let adminAgent;
let admin; // { csrf } — the shape withCsrf() expects

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;

  // The control door needs a real administrator: the panel is not a role flag
  // on a student account, so the suite signs in through the same endpoint the
  // coordinator uses.
  const { default: User } = await import('../src/models/User.js');
  const bcrypt = (await import('bcryptjs')).default;
  await User.create({
    name: 'Coordinator',
    email: 'rates.admin@test.local',
    recoveryEmail: 'rates.admin.recovery@test.local',
    passwordHash: await bcrypt.hash('Str0ngPass!', 4),
    role: 'admin',
  });

  adminAgent = newAgent();
  const login = await adminAgent
    .post('/api/auth/control-login')
    .send({ email: 'rates.admin@test.local', password: 'Str0ngPass!' });
  assert.equal(login.status, 200, 'the administrator signs in through the control door');

  // The CSRF token rides on /me, not on the sign-in response — the same two
  // calls the browser makes.
  const me = await adminAgent.get('/api/auth/me');
  assert.equal(me.body.user.role, 'admin');
  assert.ok(me.body.csrfToken, 'a session without a CSRF token cannot write anything');
  admin = { user: me.body.user, csrf: me.body.csrfToken };
});

test.after(async () => {
  await ctx.stop();
});

/* --------------------------------- helpers ---------------------------------- */

function createRate(body) {
  return withCsrf(admin, adminAgent.post('/api/control/savings-options')).send(body);
}

function patchRate(id, body) {
  return withCsrf(admin, adminAgent.patch(`/api/control/savings-options/${id}`)).send(body);
}

function panelList() {
  return adminAgent.get('/api/control/savings-options');
}

/* ------------------------- the public list, no session ---------------------- */

test('the public list answers without any session, and the summary counts it', async () => {
  await createRate({ bank: 'Civic Union Bank', accountType: 'savings', ratePercent: '4.25', sourceNote: 'Bank website, Sep 2026' });
  await createRate({ bank: 'Civic Union Bank', accountType: 'fd', ratePercent: '7.1', tenureMonths: '12', minAmount: '500.00' });
  await createRate({ bank: 'Harbour Savings', accountType: 'savings', ratePercent: '5.5' });
  await createRate({ bank: 'Old Town Co-op', accountType: 'savings', ratePercent: '9.99', isActive: false });

  // A brand new agent has no cookie: the page is linked from the home page and
  // must work signed out.
  const anonymous = await newAgent().get('/api/savings-options');
  assert.equal(anonymous.status, 200, 'no session required for reference rates');

  const { rows, summary } = anonymous.body;
  assert.equal(rows.length, 3, 'the retired row stays out of the public list');

  const civic = rows.filter((r) => r.bank === 'Civic Union Bank');
  assert.equal(civic.length, 2, 'one row per product type at the same bank');
  assert.ok(rows.every((r) => typeof r.ratePercent === 'number'));
  assert.equal(rows.find((r) => r.bank === 'Harbour Savings').minAmount, null, 'no minimum is null, never a fake 0');
  assert.equal(rows.find((r) => r.accountType === 'fd').minAmount, 500);
  assert.equal(rows.find((r) => r.accountType === 'fd').tenureMonths, 12);

  // The three headline numbers come from one aggregation.
  assert.equal(summary.total, 3);
  assert.equal(summary.banks, 2);
  assert.equal(summary.savings.count, 2);
  assert.equal(summary.fd.count, 1);
  assert.equal(summary.savings.bestRate, 5.5);
  assert.equal(summary.fd.bestRate, 7.1);
  assert.ok(summary.asOf, 'a snapshot without a date would be dishonest');
});

test('the best-rate marker is per bank and per product type', async () => {
  const res = await newAgent().get('/api/savings-options');
  const rows = res.body.rows;

  const civicSavings = rows.find((r) => r.bank === 'Civic Union Bank' && r.accountType === 'savings');
  assert.equal(civicSavings.isBest, true, 'the only savings offer at that bank is its best');
  assert.equal(civicSavings.bestRate, 4.25);
  assert.equal(civicSavings.offerCount, 1);

  // A savings rate is never ranked against an FD rate — different products.
  const harbour = rows.find((r) => r.bank === 'Harbour Savings');
  assert.equal(harbour.isBest, true);
  assert.equal(harbour.bestRate, 5.5);

  const retired = await panelList();
  assert.equal(
    retired.body.rows.filter((r) => r.bank === 'Old Town Co-op').length,
    1,
    'the administrator still sees a retired row'
  );
});

test('the list filters by product type, bank name and sort order', async () => {
  const byType = await newAgent().get('/api/savings-options?accountType=fd');
  assert.equal(byType.status, 200);
  assert.deepEqual(byType.body.rows.map((r) => r.accountType), ['fd']);

  const byBank = await newAgent().get('/api/savings-options?bank=harbour');
  assert.equal(byBank.body.rows.length, 1);
  assert.equal(byBank.body.rows[0].bank, 'Harbour Savings');

  const bySort = await newAgent().get('/api/savings-options?accountType=savings&sort=bank');
  assert.deepEqual(bySort.body.rows.map((r) => r.bank), ['Civic Union Bank', 'Harbour Savings']);

  const nonsense = await newAgent().get('/api/savings-options?accountType=banana');
  assert.equal(nonsense.status, 400, 'a product type that does not exist is refused, not guessed at');

  const badSort = await newAgent().get('/api/savings-options?sort=%7B%7B$where%3A1%7D%7D');
  assert.equal(badSort.status, 200, 'an unknown sort falls back to the default instead of reaching Mongo');
});

/* ------------------------------- validation --------------------------------- */

test('create refuses a missing bank, a bad rate, a bad minimum and a bad tenure', async () => {
  const noBank = await createRate({ accountType: 'savings', ratePercent: '5' });
  assert.equal(noBank.status, 400);
  assert.match(noBank.body.error, /bank name/i);

  const blankBank = await createRate({ bank: '   ', accountType: 'savings', ratePercent: '5' });
  assert.equal(blankBank.status, 400);

  const tooHigh = await createRate({ bank: 'Test Bank', accountType: 'savings', ratePercent: '101' });
  assert.equal(tooHigh.status, 400);
  assert.match(tooHigh.body.error, /between 0 and 100/i);

  const negative = await createRate({ bank: 'Test Bank', accountType: 'savings', ratePercent: '-3' });
  assert.equal(negative.status, 400);

  const threeDecimals = await createRate({ bank: 'Test Bank', accountType: 'savings', ratePercent: '5.555' });
  assert.equal(threeDecimals.status, 400);
  assert.match(threeDecimals.body.error, /2 decimals/i);

  const noRate = await createRate({ bank: 'Test Bank', accountType: 'savings' });
  assert.equal(noRate.status, 400);

  const badType = await createRate({ bank: 'Test Bank', accountType: 'current', ratePercent: '5' });
  assert.equal(badType.status, 400);
  assert.match(badType.body.error, /savings or fixed deposit/i);

  const badMinimum = await createRate({ bank: 'Test Bank', accountType: 'savings', ratePercent: '5', minAmount: '0' });
  assert.equal(badMinimum.status, 400);
  assert.match(badMinimum.body.error, /minimum/i);

  const threeDecimalMinimum = await createRate({
    bank: 'Test Bank', accountType: 'savings', ratePercent: '5', minAmount: '10.555',
  });
  assert.equal(threeDecimalMinimum.status, 400);

  const badTenure = await createRate({ bank: 'Test Bank', accountType: 'fd', ratePercent: '5', tenureMonths: '121' });
  assert.equal(badTenure.status, 400);
  assert.match(badTenure.body.error, /tenure/i);

  const fractionalTenure = await createRate({ bank: 'Test Bank', accountType: 'fd', ratePercent: '5', tenureMonths: '6.5' });
  assert.equal(fractionalTenure.status, 400);

  const nothingSaved = await newAgent().get('/api/savings-options?bank=test%20bank');
  assert.equal(nothingSaved.body.rows.length, 0, 'no rejected rate was written');
});

/* ------------------------------ update and delete --------------------------- */

test('update changes only the fields it is given, and refuses a bad one', async () => {
  const created = await createRate({
    bank: 'Meridian Trust', accountType: 'fd', ratePercent: '8.5', minAmount: '1000.00', tenureMonths: '24', region: 'North',
  });
  assert.equal(created.status, 201);
  const id = created.body.rate.id;
  assert.equal(created.body.rate.ratePercent, 8.5);
  assert.equal(created.body.rate.minAmount, 1000);
  assert.equal(created.body.rate.isActive, true);

  const patched = await patchRate(id, { ratePercent: '9.25', note: 'New customers only' });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.rate.ratePercent, 9.25);
  assert.equal(patched.body.rate.note, 'New customers only');
  assert.equal(patched.body.rate.bank, 'Meridian Trust', 'a partial edit never touches the rest');
  assert.equal(patched.body.rate.minAmount, 1000);
  assert.equal(patched.body.rate.tenureMonths, 24);
  assert.equal(patched.body.rate.region, 'North');

  const bad = await patchRate(id, { ratePercent: '250' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /between 0 and 100/i);

  const stillEight = (await newAgent().get('/api/savings-options?bank=meridian')).body.rows[0];
  assert.equal(stillEight.ratePercent, 9.25, 'the rejected edit changed nothing');

  const cleared = await patchRate(id, { minAmount: null, tenureMonths: null });
  assert.equal(cleared.body.rate.minAmount, null);
  assert.equal(cleared.body.rate.tenureMonths, null);

  const ghost = await patchRate('64b000000000000000000000', { ratePercent: '5' });
  assert.equal(ghost.status, 404);
  const badId = await patchRate('not-an-id', { ratePercent: '5' });
  assert.equal(badId.status, 404, 'an unparseable id is a 404, not a crash');
});

test('retiring a rate hides it from students and delete takes it off the table', async () => {
  const created = await createRate({ bank: 'Lantern Bank', accountType: 'savings', ratePercent: '3.6' });
  const id = created.body.rate.id;

  const retired = await patchRate(id, { isActive: false });
  assert.equal(retired.status, 200);
  assert.equal(retired.body.rate.isActive, false);

  const studentsSee = await newAgent().get('/api/savings-options?bank=lantern');
  assert.equal(studentsSee.body.rows.length, 0, 'a retired rate is not reference information any more');

  const panelSees = await panelList();
  assert.equal(panelSees.body.rows.filter((r) => r.id === id).length, 1, 'the panel can still find and revive it');

  const backAgain = await patchRate(id, { isActive: true });
  assert.equal(backAgain.body.rate.isActive, true);
  assert.equal((await newAgent().get('/api/savings-options?bank=lantern')).body.rows.length, 1);

  const deleted = await withCsrf(admin, adminAgent.delete(`/api/control/savings-options/${id}`));
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.ok, true);
  assert.equal((await newAgent().get('/api/savings-options?bank=lantern')).body.rows.length, 0);

  const again = await withCsrf(admin, adminAgent.delete(`/api/control/savings-options/${id}`));
  assert.equal(again.status, 404, 'a second delete has nothing left to remove');
});

/* --------------------------------- the doors -------------------------------- */

test('the admin routes refuse a student (403) and a signed-out caller (401)', async () => {
  const studentAgent = newAgent();
  const student = await registerStudent(studentAgent);

  const studentReads = await studentAgent.get('/api/control/savings-options');
  assert.equal(studentReads.status, 403, 'reference data is shared, but writing it is not');

  const studentWrites = await withCsrf(student, studentAgent.post('/api/control/savings-options')).send({
    bank: 'Sneaky Bank', accountType: 'savings', ratePercent: '99',
  });
  assert.equal(studentWrites.status, 403);

  const studentDeletes = await withCsrf(student, studentAgent.delete('/api/control/savings-options/64b000000000000000000000'));
  assert.equal(studentDeletes.status, 403);

  const signedOut = newAgent();
  assert.equal((await signedOut.get('/api/control/savings-options')).status, 401);
  assert.equal((await signedOut.post('/api/control/savings-options').send({ bank: 'X' })).status, 401);
  assert.equal((await signedOut.patch('/api/control/savings-options/64b000000000000000000000').send({})).status, 401);
  assert.equal((await signedOut.delete('/api/control/savings-options/64b000000000000000000000')).status, 401);

  const sneaky = await signedOut.get('/api/savings-options?bank=harbour');
  assert.equal(sneaky.status, 200, 'the public read stays open, exactly as the home page needs it');
  assert.equal(sneaky.body.rows.length, 1);
});
