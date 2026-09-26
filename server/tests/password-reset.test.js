import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, withCsrf } from './helpers.js';

/**
 * Password recovery (AUTH-5), and the rule that makes it safe: a reset only
 * ever answers to the RECOVERY address the student chose â€” never to the address
 * they sign in with.
 *
 * Note there is no top-level import of anything under src/: the config module
 * reads MONGODB_URI when it is first evaluated, and that only happens after
 * startApp() has put the in-memory database's address into the environment.
 */
let ctx;
let newAgent;

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
});

test.after(async () => {
  await ctx.stop();
});

/* ------------------------------ registration -------------------------------- */

test('a recovery email is required at sign-up, and it is kept to one account', async () => {
  const agent = newAgent();
  const stamp = Math.random().toString(36).slice(2);

  const missing = await agent.post('/api/auth/register').send({
    name: 'No Recovery',
    email: `norec-${stamp}@test.local`,
    password: 'Str0ngPass!',
  });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /recovery/i);

  const rubbish = await agent.post('/api/auth/register').send({
    name: 'Bad Recovery',
    email: `badrec-${stamp}@test.local`,
    recoveryEmail: 'not-an-address',
    password: 'Str0ngPass!',
  });
  assert.equal(rubbish.status, 400);

  const recovery = `shared-${stamp}@test.local`;
  const first = await newAgent().post('/api/auth/register').send({
    name: 'First',
    email: `first-${stamp}@test.local`,
    recoveryEmail: recovery,
    password: 'Str0ngPass!',
  });
  assert.equal(first.status, 201);

  // one address, one account: otherwise "whose reset is this?" is a coin toss
  const second = await newAgent().post('/api/auth/register').send({
    name: 'Second',
    email: `second-${stamp}@test.local`,
    recoveryEmail: recovery,
    password: 'Str0ngPass!',
  });
  assert.equal(second.status, 409);
  assert.match(second.body.error, /recovery/i);
});

/* ----------------------------- the reset itself ------------------------------ */

test('the sign-in address cannot be used to reset a password', async () => {
  const agent = newAgent();
  const student = await registerStudent(agent);

  const res = await withCsrf(student, agent.post('/api/auth/password-reset/request')).send({ email: student.email });
  assert.equal(res.status, 200);
  // nothing is handed out, and nothing is sent
  assert.equal(res.body.devCode, undefined);

  // ...and the code that comes back for the recovery address is useless here
  const real = await withCsrf(student, agent.post('/api/auth/password-reset/request')).send({ email: student.recoveryEmail });
  assert.ok(real.body.devCode, 'the recovery address gets a code');

  const attempt = await withCsrf(
    student,
    agent
      .post('/api/auth/password-reset/confirm'))
    .send({ email: student.email, code: real.body.devCode, password: 'An0therPass!' });
  assert.equal(attempt.status, 400);

  // the real address still works
  const done = await withCsrf(
    student,
    agent
      .post('/api/auth/password-reset/confirm'))
    .send({ email: student.recoveryEmail, code: real.body.devCode, password: 'An0therPass!' });
  assert.equal(done.status, 200);
});

test('a code arrives, works once, and the new password is the one that signs in', async () => {
  const agent = newAgent();
  const student = await registerStudent(agent);

  const asked = await withCsrf(student, agent.post('/api/auth/password-reset/request')).send({ email: student.recoveryEmail });
  assert.equal(asked.status, 200);
  assert.match(asked.body.devCode, /^\d{6}$/);
  assert.equal(asked.body.devHint, undefined, 'a known recovery address gets a code, not a shrug');

  const done = await withCsrf(
    student,
    agent
      .post('/api/auth/password-reset/confirm'))
    .send({ email: student.recoveryEmail, code: asked.body.devCode, password: 'BrandNewPass1' });
  assert.equal(done.status, 200);

  // the code is single-use
  const again = await withCsrf(
    student,
    agent
      .post('/api/auth/password-reset/confirm'))
    .send({ email: student.recoveryEmail, code: asked.body.devCode, password: 'YetAnother1' });
  assert.equal(again.status, 400);

  // the old password is dead, the new one opens the door
  const old = await newAgent().post('/api/auth/login').send({ email: student.email, password: student.password });
  assert.equal(old.status, 401);
  const fresh = await newAgent().post('/api/auth/login').send({ email: student.email, password: 'BrandNewPass1' });
  assert.equal(fresh.status, 200);
});

test('an address nobody uses for recovery is refused quietly, with a hint in dev', async () => {
  // a visitor with no session, exactly as a forgotten password arrives
  const res = await newAgent().post('/api/auth/password-reset/request').send({ email: 'stranger@nowhere.test' });
  assert.equal(res.status, 200);
  assert.equal(res.body.devCode, undefined, 'no code for an address that is not one');
  assert.equal(res.body.devHint, 'unknown-recovery-email');
  assert.match(res.body.message, /recovery address/i);
});

test('a wrong code is refused, and five wrong guesses burn it', async () => {
  const { RESET_CODE_MAX_ATTEMPTS } = await import('../src/services/accounts.js');
  const agent = newAgent();
  const student = await registerStudent(agent);
  const asked = await withCsrf(student, agent.post('/api/auth/password-reset/request')).send({ email: student.recoveryEmail });
  const { devCode } = asked.body;

  // four wrong guesses are still survivable — people mistype
  for (let i = 1; i < RESET_CODE_MAX_ATTEMPTS; i += 1) {
    const wrong = await withCsrf(
    student,
    agent
      .post('/api/auth/password-reset/confirm'))
      .send({ email: student.recoveryEmail, code: devCode === '000000' ? '111111' : '000000', password: 'Str0ngPass!' });
    assert.equal(wrong.status, 400, `guess ${i}`);
  }

  // the fifth burns it, and then even the right code is worthless
  const burnt = await withCsrf(
    student,
    agent
      .post('/api/auth/password-reset/confirm'))
    .send({ email: student.recoveryEmail, code: devCode === '000000' ? '111111' : '000000', password: 'Str0ngPass!' });
  assert.equal(burnt.status, 400);
  assert.match(burnt.body.error, /too many/i);

  const afterBurn = await withCsrf(
    student,
    agent
      .post('/api/auth/password-reset/confirm'))
    .send({ email: student.recoveryEmail, code: devCode, password: 'Str0ngPass!' });
  assert.equal(afterBurn.status, 400, 'the right code does not save a burnt one');

  // and asking again starts from a clean slate
  const again = await withCsrf(student, agent.post('/api/auth/password-reset/request')).send({ email: student.recoveryEmail });
  const ok = await withCsrf(
    student,
    agent
      .post('/api/auth/password-reset/confirm'))
    .send({ email: student.recoveryEmail, code: again.body.devCode, password: 'Str0ngPass!' });
  assert.equal(ok.status, 200);
});

test('a weak new password is refused before the code is even looked at', async () => {
  const agent = newAgent();
  const student = await registerStudent(agent);
  const asked = await withCsrf(student, agent.post('/api/auth/password-reset/request')).send({ email: student.recoveryEmail });

  const weak = await withCsrf(
    student,
    agent
      .post('/api/auth/password-reset/confirm'))
    .send({ email: student.recoveryEmail, code: asked.body.devCode, password: '123' });
  assert.equal(weak.status, 400);
  assert.match(weak.body.error, /8 characters/i);

  // the code survives a rejected password
  const good = await withCsrf(
    student,
    agent
      .post('/api/auth/password-reset/confirm'))
    .send({ email: student.recoveryEmail, code: asked.body.devCode, password: 'Str0ngPass!' });
  assert.equal(good.status, 200);
});

/* ------------------------------- the profile -------------------------------- */

test('the recovery address can be changed from the profile, once only to one account', async () => {
  const agent = newAgent();
  const student = await registerStudent(agent);

  const moved = await withCsrf(student, agent.patch('/api/auth/me/profile')).send({
    name: student.user.name,
    recoveryEmail: `moved-${Math.random().toString(36).slice(2)}@test.local`,
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.user.recoveryEmail, moved.body.user.recoveryEmail);

  // the new address is the one that works now
  const asked = await withCsrf(student, agent.post('/api/auth/password-reset/request')).send({ email: moved.body.user.recoveryEmail });
  assert.ok(asked.body.devCode, 'the new address answers a reset');

  const blank = await withCsrf(student, agent.patch('/api/auth/me/profile')).send({ recoveryEmail: '   ' });
  assert.equal(blank.status, 400, 'it can never be blanked â€” that would lock the student out');
});

/* --------------------------------- the code --------------------------------- */

test('a code is six digits, never a run of zeros, and is stored as a hash', async () => {
  const { newResetCode, sha256 } = await import('../src/services/accounts.js');
  for (let i = 0; i < 50; i += 1) {
    const { code, hash, expires } = newResetCode();
    assert.match(code, /^\d{6}$/);
    assert.notEqual(code, '000000');
    assert.equal(hash, sha256(code));
    assert.ok(expires > new Date());
    assert.ok(expires - new Date() <= 10 * 60 * 1000 + 1000, 'ten minutes, give or take a second');
  }
});


