import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Test bootstrap: an in-memory MongoDB per test file (each file runs in its
 * own process under `node --test`), so tests never touch the real database
 * and can run without any external setup.
 */
export async function startApp() {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-secret-do-not-reuse';
  process.env.EMAIL_BACKEND = 'console';
  process.env.SESSION_IDLE_MINUTES = '30';
  // A suite that walks the whole reset flow makes dozens of calls in a row from
  // one address. The production numbers (5 sign-ins, 15 account calls) are the
  // right ones for a real server, so the test raises them instead of the guard
  // being weakened.
  process.env.RATE_LIMIT_LOGIN = '500';
  process.env.RATE_LIMIT_ACCOUNT = '1000';

  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('campuscoin-test');

  const { connectDb, disconnectDb } = await import('../src/config/db.js');
  await connectDb();

  const { default: app } = await import('../src/app.js');
  const request = (await import('supertest')).default;

  /** Fresh cookie jar per call — tests stay independent of each other. */
  const newAgent = () => request.agent(app);

  return {
    app,
    request,
    newAgent,
    async stop() {
      await disconnectDb();
      await mongod.stop();
    },
  };
}

/** Registers a student through the real endpoint and returns their session. */
export async function registerStudent(agent, payload = {}) {
  const stamp = Math.random().toString(36).slice(2);
  const body = {
    name: payload.name || 'Test Student',
    email: payload.email || `student-${stamp}@test.local`,
    // the reset page only answers to this address, so every test account needs
    // one of its own (AUTH-5)
    recoveryEmail: payload.recoveryEmail || `recovery-${stamp}@test.local`,
    password: payload.password || 'Str0ngPass!',
  };

  const res = await agent.post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${res.text}`);

  const me = await agent.get('/api/auth/me');
  return {
    user: me.body.user,
    csrf: me.body.csrfToken,
    password: body.password,
    email: body.email,
    recoveryEmail: body.recoveryEmail,
  };
}

/** Creates a default category directly — students cannot create defaults. */
export async function makeDefaultCategory({ name, type, icon = 'dots' }) {
  const { default: Category } = await import('../src/models/Category.js');
  return Category.create({ name, nameKey: name.toLowerCase(), type, isDefault: true, icon });
}

/** Every state-changing call from a test needs the CSRF header (AUTH-4). */
export function withCsrf(session, req) {
  return req.set('X-CSRF-Token', session.csrf);
}
