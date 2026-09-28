import { MongoMemoryServer } from 'mongodb-memory-server';
import os from 'node:os';

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

  // A PINNED mongod version, and a BOUNDED start. Both are here rather than in
  // each suite, because a suite that forgets either one hangs with no output at
  // all, and a hang is the one failure a reader cannot diagnose.
  //
  // mongodb-memory-server resolves a version by itself, and what it resolved to on
  // this machine crashed on start. That is not in a log - it is in the download
  // cache: four mongod-x64-win32-7.0.24.<timestamp>.mdmp minidumps written on the
  // day this was added, in the same folder where 7.0.14 sits with none. A crashed
  // mongod leaves the process waiting forever, outside the test timeout, so the
  // whole run reports nothing until it is killed by hand.
  //
  // 7.0.14 is pinned for two reasons: it does not crash here, and it is already in
  // the cache, so it does not download either - and the download is the other half
  // of the wait. An MONGOMS_VERSION from outside still wins, so a machine that
  // needs a different build can have one without editing this file.
  const MONGOMS_DEFAULT = '7.0.14';
  if (!process.env.MONGOMS_VERSION) {
    process.env.MONGOMS_VERSION = MONGOMS_DEFAULT;
  }
  const startupTimeoutMs = Number(process.env.MEMORY_SERVER_TIMEOUT_MS || 60000);

  let mongod;
  try {
    mongod = await MongoMemoryServer.create({ instance: { startupTimeout: startupTimeoutMs } });
  } catch (err) {
    // Two failures look identical from the outside and need opposite fixes, so the
    // message draws the distinction rather than making the reader go and look.
    const cache = [USERPROFILE, HOME].filter(Boolean).map((h) => h + "/.cache/mongodb-binaries").join(" or ");
    throw new Error(
      [
        'The in-memory database did not start within ' + startupTimeoutMs + 'ms.',
        '  version asked for:  ' + process.env.MONGOMS_VERSION,
        '  download cache:    ' + cache,
        '  TEMP:              ' + (process.env.TEMP || process.env.TMP || '(unset)'),
        '  a .mdmp file next to the cached binary means that binary CRASHED.',
        '  a slow start with no .mdmp means the binary is being DOWNLOADED.',
        '  cause: ' + err.message,
      ].join('\n')
    );
  }
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
