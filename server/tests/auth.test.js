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

  const weak = await agent.post('/api/auth/register').send({ name: 'X', email: 'nope', password: 'whatever1' });
  assert.equal(weak.status, 400);

  const short = await agent.post('/api/auth/register').send({ name: 'X', email: 'a@b.co', password: '123' });
  assert.equal(short.status, 400);

  const email = `dup-${Math.random().toString(36).slice(2)}@test.local`;
  const first = await agent.post('/api/auth/register').send({ name: 'A', email, password: 'Str0ngPass!' });
  assert.equal(first.status, 201);

  const again = await newAgent().post('/api/auth/register').send({ name: 'B', email, password: 'Str0ngPass!' });
  assert.equal(again.status, 409);
});

/* --------------------------------- the doors -------------------------------- */

test('the student door refuses an administrator and the control door refuses a student', async () => {
  const { default: User } = await import('../src/models/User.js');
  const bcrypt = (await import('bcryptjs')).default;
  await User.create({
    name: 'Coordinator',
    email: 'staff@test.local',
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

test('reset link works once, then the same token is rejected', async () => {
  const agent = newAgent();
  const student = await registerStudent(agent);

  // Recovery is done while signed out — a fresh browser session, no CSRF token.
  const asked = await newAgent().post('/api/auth/password-reset/request').send({ email: student.email });
  assert.equal(asked.status, 200);

  const { default: User } = await import('../src/models/User.js');
  const fresh = await User.findById(student.user.id).select('+resetTokenHash');
  assert.ok(fresh.resetTokenHash, 'a token hash should be stored');

  // The plaintext token only ever exists inside the emailed link, so the
  // test mints one the same way the service does and attaches it.
  const { newResetToken, applyReset } = await import('../src/services/accounts.js');
  const { token, hash, expires } = newResetToken();
  fresh.resetTokenHash = hash;
  fresh.resetTokenExpires = expires;
  await fresh.save();

  const first = await newAgent().post('/api/auth/password-reset/confirm').send({ token, password: 'BrandNewPass!' });
  assert.equal(first.status, 200);

  const reuse = await newAgent().post('/api/auth/password-reset/confirm').send({ token, password: 'AnotherPass!' });
  assert.equal(reuse.status, 400, 'a used token must not work twice');

  // and the new password actually signs you in
  const signin = await newAgent().post('/api/auth/login').send({ email: student.email, password: 'BrandNewPass!' });
  assert.equal(signin.status, 200);
  void applyReset;
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
