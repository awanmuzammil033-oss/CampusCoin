import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, makeDefaultCategory, withCsrf } from './helpers.js';

/**
 * The guardian summary (NEW-8) — and the one suite in this app whose most
 * important assertion is a negative one.
 *
 * The single most important test in here is 'a shared body carries no
 * description, no merchant, no address and no date'. A summary that leaks one
 * merchant name has told a parent where their child ate, and a feature that is
 * otherwise entirely correct is then worse than no feature at all. The other
 * assertion that matters as much is the exact key set: because the summary
 * object is built key by key with no spread, that set is a structural proof
 * that no field nobody thought about can travel.
 *
 * Note there is no top-level import of anything under src/: the config module
 * reads MONGODB_URI when it is first evaluated, and that only happens after
 * startApp() has put the in-memory database's address into the environment.
 * This suite also mounts its own router, so it passes on its own and does not
 * depend on app.js having been told about the feature.
 */

let ctx;
let newAgent;
let guardianRoutes;
let GuardianLink;
let User;
let Transaction;
let Budget;
let toDec;
let sha256;
let issueLink;
let progressForMonth;

/* -------------------------------- fixtures ---------------------------------- */

const NOW = new Date();
const YEAR = NOW.getUTCFullYear();
const MONTH_INDEX = NOW.getUTCMonth();
const THIS_MONTH = new Date(Date.UTC(YEAR, MONTH_INDEX, 1));
const MONTH_KEY = `${YEAR}-${String(MONTH_INDEX + 1).padStart(2, '0')}`;
const LAST_MONTH = new Date(Date.UTC(YEAR, MONTH_INDEX - 1, 1));

const day = (d, month = THIS_MONTH) =>
  new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), d));

/** Strings that exist on the student's records and must not exist anywhere in
 *  a shared body. Descriptions, a scanned merchant, both of their addresses. */
const SECRETS = {
  descriptions: [
    'chai with Bilal at the canteen',
    'shawarma near the gate at midnight',
    'bus pass top-up',
    'monthly pocket money from home',
  ],
  merchant: 'Al Baraka Kebabs',
  lastMonth: 'birthday present for Sana',
};

let food;
let travel;
let allowance;

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;

  ({ default: guardianRoutes } = await import('../src/routes/guardian.js'));
  ({ default: GuardianLink } = await import('../src/models/GuardianLink.js'));
  ({ default: User } = await import('../src/models/User.js'));
  ({ default: Transaction } = await import('../src/models/Transaction.js'));
  ({ default: Budget } = await import('../src/models/Budget.js'));
  ({ toDec } = await import('../src/utils/money.js'));
  ({ sha256 } = await import('../src/services/accounts.js'));
  ({ issueLink } = await import('../src/services/guardianSummary.js'));
  ({ progressForMonth } = await import('../src/services/budgets.js'));

  food = await makeDefaultCategory({ name: 'Food', type: 'expense', icon: 'cup' });
  travel = await makeDefaultCategory({ name: 'Travel', type: 'expense', icon: 'bus' });
  allowance = await makeDefaultCategory({ name: 'Allowance', type: 'income', icon: 'wallet' });

  mountGuardian(ctx.app);
});

test.after(async () => {
  await ctx.stop();
});

/**
 * Mounts the feature's own router, in front of the /api 404 layer, the way
 * groupLedger.test.js mounts its own. Skipped if app.js has already been wired
 * up, so the suite passes either side of the integration.
 */
function mountGuardian(app) {
  const stack = app._router || app.router;
  if (!stack) throw new Error('cannot find the express router stack');

  const mounted = stack.stack.some(
    (layer) => layer.name === 'router' && String(layer.regexp?.source).includes('api\\/guardian')
  );
  if (mounted) return;

  app.use('/api/guardian', guardianRoutes);
  const layer = stack.stack.pop();
  const before = stack.stack.findIndex((row) => row.handle && row.handle.name === 'notFound');
  stack.stack.splice(before === -1 ? stack.stack.length : before, 0, layer);
}

/** A signed-in student, with the categories and ledger rows the feature reads. */
async function student(label, { goal = null, entries = [], budget = null, lastMonthSpend = null } = {}) {
  const agent = newAgent();
  const account = await registerStudent(agent, { name: label });

  for (const entry of entries) {
    const categoryId = entry.type === 'income' ? allowance._id : (entry.category === 'Travel' ? travel._id : food._id);
    await Transaction.create({
      user: account.user.id,
      category: categoryId,
      amount: toDec(entry.amount),
      type: entry.type || 'expense',
      date: day(entry.day),
      description: entry.description || '',
      // The scanned-payment block is the field a merchant name hides in; it has
      // to be impossible for that name to reach a shared body.
      ...(entry.merchant ? { scan: { merchant: entry.merchant } } : {}),
    });
  }

  if (budget) {
    await Budget.create({
      user: account.user.id,
      category: food._id,
      month: THIS_MONTH,
      limitAmount: toDec(budget),
    });
  }

  if (lastMonthSpend) {
    await Transaction.create({
      user: account.user.id,
      category: food._id,
      amount: toDec(lastMonthSpend),
      type: 'expense',
      date: day(9, LAST_MONTH),
      description: SECRETS.lastMonth,
    });
  }

  if (goal !== null) {
    await User.updateOne({ _id: account.user.id }, { $set: { monthlySavingsGoal: toDec(goal) } });
  }

  return { agent, ...account };
}

/** The ledger the main fixture shares: 300.00 in, 64.75 out, 52.25 of it Food. */
const MAIN_ENTRIES = [
  { type: 'income', amount: '300.00', day: 2, description: SECRETS.descriptions[3] },
  { amount: '45.00', day: 3, description: SECRETS.descriptions[0], merchant: SECRETS.merchant },
  { category: 'Travel', amount: '12.50', day: 11, description: SECRETS.descriptions[2] },
  { amount: '7.25', day: 19, description: SECRETS.descriptions[1] },
];

/** Set up, consent and mint a link. Returns everything the tests need. */
async function issueFor(who, email = 'parent@example.test') {
  const res = await withCsrf(who, who.agent.post('/api/guardian/link')).send({ email, consent: true });
  assert.equal(res.status, 201, res.text);
  return res.body;
}

/** The reader's own request: no session, no cookie, nothing but the token. */
function stranger(token) {
  return ctx.request(ctx.app).get(`/api/guardian/summary/${token}`);
}

/* ------------------------------ A. the consent ------------------------------ */

test('no tick, no link — and the field, not the request, is what authorises it', async () => {
  const who = await student('No Tick');

  const unticked = await withCsrf(who, who.agent.post('/api/guardian/link')).send({ email: 'parent@example.test' });
  assert.equal(unticked.status, 400);
  assert.equal(unticked.body.error, 'not_consented');
  // a key, never a sentence: the screen renders t(err.message)
  assert.equal(unticked.body.message, 'guard.issue.notConsented');

  const refused = await withCsrf(who, who.agent.post('/api/guardian/link')).send({
    email: 'parent@example.test',
    consent: 'yes',
  });
  assert.equal(refused.status, 400, 'only a real tick is a tick');

  assert.equal(await GuardianLink.countDocuments({ user: who.user.id }), 0, 'not one link was written');

  const state = await who.agent.get('/api/guardian/link');
  assert.equal(state.status, 200);
  assert.deepEqual(state.body, { configured: false, consentedAt: null, email: null, lastIssuedAt: null });

  // The service is the gate, not the route: called directly, with no consent on
  // the account, it refuses to mint anything.
  const fresh = await User.findById(who.user.id);
  await assert.rejects(() => issueLink(fresh), (err) => err.code === 'not_consented');
  assert.equal(await GuardianLink.countDocuments({ user: who.user.id }), 0);
});

test('a student cannot point the link at their own address', async () => {
  const who = await student('Self Send');

  const own = await withCsrf(who, who.agent.post('/api/guardian/link')).send({
    email: who.email,
    consent: true,
  });
  assert.equal(own.status, 400);
  assert.equal(own.body.error, 'email_own');
  assert.equal(own.body.message, 'guard.issue.emailOwn');

  // the recovery address counts too: it is the same inbox the student owns
  const recovery = await withCsrf(who, who.agent.post('/api/guardian/link')).send({
    email: who.recoveryEmail,
    consent: true,
  });
  assert.equal(recovery.status, 400);
  assert.equal(recovery.body.error, 'email_own');

  assert.equal(await GuardianLink.countDocuments({ user: who.user.id }), 0);
});

test('an address that is not an address, or is too long to store, is refused', async () => {
  const who = await student('Bad Address');

  for (const bad of ['not-an-address', 'two@@ats.test', 'trailing@dot.', 'spaced out@x.test']) {
    const res = await withCsrf(who, who.agent.post('/api/guardian/link')).send({ email: bad, consent: true });
    assert.equal(res.status, 400, `${bad} must be refused`);
    assert.equal(res.body.error, 'email_invalid');
  }

  const long = `${'a'.repeat(95)}@example.test`; // 108 characters, over the subdocument's 100
  const res = await withCsrf(who, who.agent.post('/api/guardian/link')).send({ email: long, consent: true });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'email_too_long');

  const missing = await withCsrf(who, who.agent.post('/api/guardian/link')).send({ consent: true });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, 'email_missing');

  assert.equal(await GuardianLink.countDocuments({ user: who.user.id }), 0);
});

/* ------------------------------- B. the link -------------------------------- */

test('the token is stored hashed, and the plain token exists in no field at all', async () => {
  const who = await student('Hashed');
  const issued = await issueFor(who);

  assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/, 'a long, URL-safe, unpadded token');
  assert.equal(issued.month, MONTH_KEY);
  assert.ok(issued.url.endsWith(`/guardian/${issued.token}`));

  const rows = await GuardianLink.find({ user: who.user.id }).lean();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tokenHash, sha256(issued.token), 'the row holds the sha256 of the token');
  assert.equal(rows[0].month.toISOString(), THIS_MONTH.toISOString(), 'the month is the 1st, UTC');
  assert.equal(
    new Date(rows[0].expiresAt).getTime() - new Date(rows[0].issuedAt).getTime(),
    30 * 24 * 60 * 60 * 1000,
    'a link lives 30 days from the moment it was made'
  );

  // the whole document, serialised, in any field: nowhere is the secret itself
  const serialised = JSON.stringify(rows[0], (key, value) => (key === '_id' || key === 'user' ? undefined : value));
  assert.equal(serialised.includes(issued.token), false, 'the plain token is not in the row');
});

test('the preview and the shared page are byte-identical for the same month', async () => {
  const who = await student('Same Page', { entries: MAIN_ENTRIES, budget: '100.00', goal: '400.00' });

  const preview = await who.agent.get('/api/guardian/preview');
  assert.equal(preview.status, 200, preview.text);
  assert.equal(preview.body.summary.month, MONTH_KEY);

  const issued = await issueFor(who);
  const shared = await stranger(issued.token);
  assert.equal(shared.status, 200, shared.text);

  // The same function, so the same bytes. This is the test that stops consent
  // being given for one thing and the guardian being shown another.
  assert.equal(shared.text, preview.text, 'the preview IS the page, character for character');
  assert.deepEqual(shared.body.summary, preview.body.summary);
});

test('revoking kills the link on the very next request, not on the next month', async () => {
  const who = await student('Revoke');
  const issued = await issueFor(who);

  assert.equal((await stranger(issued.token)).status, 200, 'it works first');

  const revoked = await withCsrf(who, who.agent.delete('/api/guardian/link'));
  assert.equal(revoked.status, 200);
  assert.deepEqual(revoked.body, { configured: false, consentedAt: null, email: null, lastIssuedAt: null });

  // the storage layer, not just the branch: there is no row left to be served
  assert.equal(await GuardianLink.countDocuments({ user: who.user.id }), 0, 'the row is gone');

  const after = await stranger(issued.token);
  assert.equal(after.status, 404, 'dead on the very next request');
  assert.equal(after.body.error, 'not_found');
  // and it stays dead — nothing is merely cached
  assert.equal((await stranger(issued.token)).status, 404);

  const stored = await User.findById(who.user.id).lean();
  assert.equal(stored.guardian.email, '', 'the address is cleared too');
  assert.equal(stored.guardian.consentedAt, null, 'and so is the consent');
});

test('issuing again replaces the old link rather than stacking a second one up', async () => {
  const who = await student('Reissue');
  const first = await issueFor(who);
  const second = await issueFor(who, 'other-parent@example.test');

  assert.notEqual(first.token, second.token);
  assert.equal((await stranger(first.token)).status, 404, 'the replaced link is dead');
  assert.equal((await stranger(second.token)).status, 200);
  assert.equal(await GuardianLink.countDocuments({ user: who.user.id }), 1, 'one live link, always');
});

/* ------------------------------- C. the page -------------------------------- */

test('a shared body carries exactly these keys, and nothing else', async () => {
  const who = await student('Exact Keys', { entries: MAIN_ENTRIES, budget: '100.00', goal: '400.00' });
  const issued = await issueFor(who);
  const shared = await stranger(issued.token);
  assert.equal(shared.status, 200, shared.text);

  const { summary } = shared.body;

  assert.deepEqual(Object.keys(shared.body).sort(), ['summary']);
  assert.deepEqual(Object.keys(summary).sort(), [
    'budgets',
    'categories',
    'currency',
    'month',
    'savings',
    'studentName',
  ]);

  assert.deepEqual(Object.keys(summary.categories[0]).sort(), ['amount', 'category']);
  assert.deepEqual(Object.keys(summary.budgets[0]).sort(), ['category', 'pct', 'tone']);
  assert.deepEqual(Object.keys(summary.savings).sort(), ['goal', 'pct', 'saved', 'state']);

  // and the values are the three things the feature promised
  assert.deepEqual(summary.categories, [
    { category: 'Food', amount: 52.25 },
    { category: 'Travel', amount: 12.5 },
  ]);
  assert.deepEqual(summary.budgets, [{ category: 'Food', pct: 52, tone: 'ok' }]);
  assert.equal(summary.month, MONTH_KEY);
  assert.equal(summary.studentName, 'Exact Keys');
  assert.equal(typeof summary.currency, 'string');
});

test('a shared body carries no description, no merchant, no address and no date', async () => {
  const who = await student('No Leaks', {
    entries: MAIN_ENTRIES,
    budget: '100.00',
    goal: '400.00',
    lastMonthSpend: '999.00',
  });
  const issued = await issueFor(who);
  const shared = await stranger(issued.token);
  assert.equal(shared.status, 200, shared.text);

  const raw = shared.text;

  for (const secret of [...SECRETS.descriptions, SECRETS.merchant, SECRETS.lastMonth]) {
    assert.equal(raw.includes(secret), false, `a shared body must not contain "${secret}"`);
  }
  for (const address of [who.email, who.recoveryEmail]) {
    assert.equal(raw.includes(address), false, `a shared body must not contain ${address}`);
  }

  // No day, ever. The month the summary is ABOUT is the one date-shaped value
  // allowed through, and it is a "YYYY-MM" key, not an entry's date.
  assert.equal(/\d{4}-\d{2}-\d{2}/.test(raw), false, 'no individual date appears');
  assert.equal(/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(raw), false, 'no individual date, written any other way');
  const months = raw.match(/\d{4}-\d{2}/g) || [];
  assert.deepEqual([...new Set(months)], [MONTH_KEY], 'the only date-shaped value is the summary month');

  // The last month's 999.00 was never in the scope, and its amount is absent too.
  assert.equal(raw.includes('999'), false, 'a month the link was not issued for is not in the body');
});

test('the link is scoped to one month, not a window onto everything', async () => {
  const who = await student('One Month', { entries: MAIN_ENTRIES, goal: '400.00' });
  const issued = await issueFor(who);

  const before = await stranger(issued.token);
  assert.equal(before.status, 200);

  // A month that goes on without the student noticing changes nothing.
  await Transaction.create({
    user: who.user.id,
    category: food._id,
    amount: toDec('500.00'),
    type: 'expense',
    date: day(9, LAST_MONTH),
    description: SECRETS.lastMonth,
  });

  const after = await stranger(issued.token);
  assert.deepEqual(after.body.summary.categories, before.body.summary.categories, 'the month in view does not move');
  assert.equal(after.text.includes('500'), false);
  assert.equal(after.text.includes(SECRETS.lastMonth), false);
});

test('a budget percentage is the one the app already computes', async () => {
  // 52.25 of Food against a 52.25 limit: exactly on the line, which is where
  // two useful things happen at once — the percentage is 100 and the tone
  // turns over.
  const who = await student('Same Pct', { entries: MAIN_ENTRIES, budget: '52.25' });
  const issued = await issueFor(who);
  const shared = await stranger(issued.token);
  assert.equal(shared.status, 200, shared.text);

  // the very same call the Budgets screen makes, on the very same document
  const app = await progressForMonth(await User.findById(who.user.id), THIS_MONTH);
  assert.equal(shared.body.summary.budgets[0].pct, app[0].pct);
  assert.equal(shared.body.summary.budgets[0].tone, app[0].tone);
  assert.equal(shared.body.summary.budgets[0].pct, 100);
  assert.equal(shared.body.summary.budgets[0].tone, 'over');
});

test('savings is the app\'s own figure, and says so when there is nothing to show', async () => {
  const withGoal = await student('Goal Set', { entries: MAIN_ENTRIES, goal: '400.00' });
  const goalLink = (await issueFor(withGoal)).token;
  const goalBody = (await stranger(goalLink)).body.summary;
  // income 300.00 − expense 64.75, exactly as the dashboard's goal card reads it
  assert.equal(goalBody.savings.saved, 235.25);
  assert.equal(goalBody.savings.goal, 400);
  assert.equal(goalBody.savings.pct, 59);
  assert.equal(goalBody.savings.state, 'short');

  const noGoal = await student('No Goal', { entries: MAIN_ENTRIES });
  const noGoalLink = (await issueFor(noGoal)).token;
  const noGoalBody = (await stranger(noGoalLink)).body.summary;
  assert.equal(noGoalBody.savings.goal, null);
  assert.equal(noGoalBody.savings.pct, null);
  assert.equal(noGoalBody.savings.state, 'no-goal', 'no goal is stated, never a 0% that reads like a verdict');

  const spentItAll = await student('Spent It', {
    entries: [{ amount: '150.00', day: 4, description: 'term fee' }],
    goal: '100.00',
  });
  const spentLink = (await issueFor(spentItAll)).token;
  const spentBody = (await stranger(spentLink)).body.summary;
  assert.equal(spentBody.savings.saved, -150);
  assert.equal(spentBody.savings.state, 'nothing-saved', 'the honest line, not an invented figure');

  const reached = await student('Reached It', {
    entries: [{ type: 'income', amount: '500.00', day: 4, description: 'scholarship' }],
    goal: '100.00',
  });
  const reachedLink = (await issueFor(reached)).token;
  const reachedBody = (await stranger(reachedLink)).body.summary;
  assert.equal(reachedBody.savings.state, 'met');
  assert.equal(reachedBody.savings.pct, 100);
});

/* ----------------------------- D. the 404 rules ----------------------------- */

test('unknown, malformed, expired and revoked all give the same plain 404', async () => {
  const who = await student('Dead Links');

  const answers = [];

  // 1. a well-formed token that was never issued
  answers.push(await stranger(`${'z'.repeat(43)}`));
  // 2. and two that are not tokens at all
  answers.push(await stranger('not-a-token'));
  answers.push(await stranger('abc'));

  // 3. expired: the row is still there, the clock is simply past it
  const issued = await issueFor(who);
  await GuardianLink.updateOne(
    { tokenHash: sha256(issued.token) },
    { $set: { expiresAt: new Date(Date.now() - 1000) } }
  );
  answers.push(await stranger(issued.token));

  // 4. revoked: it worked, and then the student changed their mind
  const live = await freshTokenFor(who);
  assert.equal((await stranger(live)).status, 200, 'it is alive before the revoke');
  await withCsrf(who, who.agent.delete('/api/guardian/link'));
  answers.push(await stranger(live));

  for (const res of answers) {
    assert.equal(res.status, 404, 'a 404 and never a 403 — a 403 would confirm the token exists');
    assert.deepEqual(res.body, { error: 'not_found', message: 'guard.link.gone' });
  }
  // byte-identical, so nothing distinguishes a live token from a dead one
  assert.equal(new Set(answers.map((r) => r.text)).size, 1, 'one plain answer, whatever was wrong');
});

/** Mint a link and hand back only the token (the issue response has it). */
async function freshTokenFor(who) {
  const res = await withCsrf(who, who.agent.post('/api/guardian/link')).send({
    email: 'parent@example.test',
    consent: true,
  });
  assert.equal(res.status, 201, res.text);
  return res.body.token;
}

test('the link is not a session: no cookie, no route, no way into the app', async () => {
  const who = await student('Bearer Only', { entries: MAIN_ENTRIES });
  const issued = await issueFor(who);

  const shared = await stranger(issued.token);
  assert.equal(shared.status, 200);
  assert.equal(shared.body.user, undefined);
  assert.equal(shared.body.csrfToken, undefined);
  assert.equal(shared.body.session, undefined);

  // The app's CSRF layer hands every visitor a bare session cookie, signed in
  // or not — that is pre-existing behaviour of src/middleware/csrf.js, not
  // something the link creates. What matters is what is IN it: a CSRF nonce and
  // no user, so replaying it buys nothing.
  const cookie = shared.headers['set-cookie'];
  if (cookie) {
    const me = await ctx.request(ctx.app).get('/api/auth/me').set('Cookie', cookie);
    assert.equal(me.body.user, null, 'the cookie this page hands out carries no signed-in user');
    const data = await ctx.request(ctx.app).get('/api/transactions').set('Cookie', cookie);
    assert.equal(data.status, 401, 'and it opens nothing at all');
  }

  // presented to every other route in the app it is just a string
  const probes = [
    ['get', '/api/transactions'],
    ['get', '/api/dashboard/summary'],
    ['get', '/api/reports?tab=category'],
    ['get', '/api/wallets'],
    ['get', '/api/groups'],
  ];
  for (const [method, path] of probes) {
    const viaQuery = await ctx.request(ctx.app)[method](`${path}${path.includes('?') ? '&' : '?'}token=${issued.token}`);
    assert.equal(viaQuery.status, 401, `${path} must not accept a guardian token`);

    const viaHeader = await ctx
      .request(ctx.app)
      [method](path)
      .set('Authorization', `Bearer ${issued.token}`)
      .set('X-Guardian-Token', issued.token);
    assert.equal(viaHeader.status, 401, `${path} must not accept a guardian token in a header`);
  }

  // /api/auth/me answers 200 to a stranger by design (the client polls it on
  // every load), so the assertion there is the payload, not the status.
  const me = await ctx
    .request(ctx.app)
    .get(`/api/auth/me?token=${issued.token}`)
    .set('Authorization', `Bearer ${issued.token}`);
  assert.equal(me.body.user, null, 'a guardian token signs nobody in');

  // the token is not an email address and cannot be used to set one up
  const asSetup = await withCsrf(who, who.agent.post('/api/guardian/link')).send({
    email: issued.token,
    consent: true,
  });
  assert.equal(asSetup.status, 400);
  assert.equal(asSetup.body.error, 'email_invalid');

  // and the student's own side of the feature never hands out a summary
  const state = await who.agent.get('/api/guardian/link');
  assert.equal(state.body.summary, undefined, 'the settings state is not a summary');
  assert.deepEqual(Object.keys(state.body).sort(), ['configured', 'consentedAt', 'email', 'lastIssuedAt']);
});

test('reading a summary changes nothing at all', async () => {
  const who = await student('Read Only', { entries: MAIN_ENTRIES, goal: '400.00' });
  const issued = await issueFor(who);

  const before = await GuardianLink.findOne({ tokenHash: sha256(issued.token) }).lean();
  const beforeUser = await User.findById(who.user.id).lean();
  const beforeCount = await Transaction.countDocuments({ user: who.user.id });

  assert.equal((await stranger(issued.token)).status, 200);
  assert.equal((await stranger(issued.token)).status, 200);

  const after = await GuardianLink.findOne({ tokenHash: sha256(issued.token) }).lean();
  const afterUser = await User.findById(who.user.id).lean();
  assert.deepEqual(after, before, 'the link row is untouched — no use counter, no lastUsedAt');
  assert.deepEqual(afterUser, beforeUser, 'the account is untouched');
  assert.equal(await Transaction.countDocuments({ user: who.user.id }), beforeCount);
});

test('the student half of the feature is closed to anybody without a session', async () => {
  for (const [method, path] of [
    ['get', '/api/guardian/link'],
    ['post', '/api/guardian/link'],
    ['delete', '/api/guardian/link'],
    ['get', '/api/guardian/preview'],
  ]) {
    const res = await ctx.request(ctx.app)[method](path);
    assert.equal(res.status, 401, `${method.toUpperCase()} ${path} must need a session`);
  }
});
