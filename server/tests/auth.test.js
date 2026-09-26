import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerStudent, makeDefaultCategory, withCsrf } from './helpers.js';

let ctx;
let newAgent;

test.before(async () => {
  ctx = await startApp();
  newAgent = ctx.newAgent;
});

test.after(async () => {
  await ctx.stop();
});

/* ------------------------------- registration ------------------------------- */

test('register creates a student session and returns their profile', async () => {
  const agent = newAgent();
  const student = await registerStudent(agent);

  assert.equal(student.user.role, 'student');
  assert.ok(student.csrf, 'csrf token should come back with the profile');
  assert.ok(!JSON.stringify(student.user).includes('passwordHash'), 'hash must never leave the server');
});

test('register rejects a bad email, a short password and a duplicate email', async () => {
  const agent = newAgent();
  const stamp = Math.random().toString(36).slice(2);

  const weak = await agent.post('/api/auth/register').send({
    name: 'X', email: 'nope', recoveryEmail: `w-${stamp}@test.local`, password: 'whatever1',
  });
  assert.equal(weak.status, 400);

  const short = await agent.post('/api/auth/register').send({
    name: 'X', email: 'a@b.co', recoveryEmail: `s-${stamp}@test.local`, password: '123',
  });
  assert.equal(short.status, 400);

  const email = `dup-${stamp}@test.local`;
  const first = await agent.post('/api/auth/register').send({
    name: 'A', email, recoveryEmail: `r-${stamp}@test.local`, password: 'Str0ngPass!',
  });
  assert.equal(first.status, 201);

  const again = await newAgent().post('/api/auth/register').send({
    name: 'B', email, recoveryEmail: `r2-${stamp}@test.local`, password: 'Str0ngPass!',
  });
  assert.equal(again.status, 409);
});

/* --------------------------------- the doors -------------------------------- */

test('the student door refuses an administrator and the control door refuses a student', async () => {
  const { default: User } = await import('../src/models/User.js');
  const bcrypt = (await import('bcryptjs')).default;
  await User.create({
    name: 'Coordinator',
    email: 'staff@test.local',
    recoveryEmail: 'staff.recovery@test.local',
    passwordHash: await bcrypt.hash('Str0ngPass!', 4),
    role: 'admin',
  });

  const adminTriesStudentDoor = await newAgent()
    .post('/api/auth/login')
    .send({ email: 'staff@test.local', password: 'Str0ngPass!' });
  assert.equal(adminTriesStudentDoor.status, 401);

  const studentAgent = newAgent();
  const student = await registerStudent(studentAgent);
  const studentTriesControlDoor = await newAgent()
    .post('/api/auth/control-login')
    .send({ email: student.email, password: student.password });
  assert.equal(studentTriesControlDoor.status, 403);

  const adminEnters = await newAgent()
    .post('/api/auth/control-login')
    .send({ email: 'staff@test.local', password: 'Str0ngPass!' });
  assert.equal(adminEnters.status, 200);
  assert.equal(adminEnters.body.user.role, 'admin');
});

test('wrong password and unknown account give the same answer', async () => {
  const wrong = await newAgent().post('/api/auth/login').send({ email: 'staff@test.local', password: 'nope-nope' });
  const unknown = await newAgent().post('/api/auth/login').send({ email: 'ghost@test.local', password: 'nope-nope' });
  assert.equal(wrong.status, unknown.status);
  assert.deepEqual(wrong.body, unknown.body);
});

/* ----------------------------- password reset (AUTH-5) ---------------------- */
/* The full recovery flow — a six-digit code, the recovery address, guessing,
   expiry — lives in tests/password-reset.test.js. What belongs here is the one
   thing that is a property of the account rather than of the flow: a password
   reset never answers to the sign-in address. */
test('a reset request never answers to the sign-in address', async () => {
  const agent = newAgent();
  const student = await registerStudent(agent);

  const asked = await newAgent().post('/api/auth/password-reset/request').send({ email: student.email });
  assert.equal(asked.status, 200);
  assert.equal(asked.body.devCode, undefined, 'the sign-in address is not a recovery address');

  const { default: User } = await import('../src/models/User.js');
  const fresh = await User.findById(student.user.id).select('+resetCodeHash +resetCodeExpires');
  assert.equal(fresh.resetCodeHash, null, 'no code is created for it either');
});

test('a disabled student cannot use their session anymore', async () => {
  const agent = newAgent();
  const student = await registerStudent(agent);

  const { default: User } = await import('../src/models/User.js');
  await User.updateOne({ _id: student.user.id }, { $set: { isActive: false } });

  const blocked = await agent.get('/api/dashboard/summary');
  assert.equal(blocked.status, 401);
});

/* ------------------------------ CSRF protection ----------------------------- */

test('a signed-in POST without the CSRF header is refused', async () => {
  const agent = newAgent();
  const student = await registerStudent(agent);
  const category = await makeDefaultCategory({ name: 'Allowance', type: 'income' });
  const payload = { type: 'income', amount: '10.00', categoryId: category._id.toString(), date: '2026-09-01' };

  const noHeader = await agent.post('/api/transactions').send(payload);
  assert.equal(noHeader.status, 403);

  const withHeader = await withCsrf(student, agent.post('/api/transactions')).send(payload);
  assert.equal(withHeader.status, 201);
});
