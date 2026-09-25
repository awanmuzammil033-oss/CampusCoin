/**
 * `npm run dev` / `npm start` / `npm run dev:local` / `npm run seed` — one
 * boot that can never point at a database that is not there.
 *
 * The database rule: a URI configured in `.env` or the environment (a cloud
 * database, for example) is used exactly as given; with NO configuration the
 * API runs against the on-disk database below. So a fresh clone, a judge's
 * laptop or a half-finished setup all work with zero configuration and no
 * connection errors — the data lives in db/data/ (next to db/schema.md) and
 * survives restarts.
 *
 * This script supervises the processes it starts, because a dev session
 * must not fall over half-dead:
 *   - the local database runs on a FIXED port (default 27351) and is pinged
 *     every few seconds; if it stops answering it is brought back with the
 *     same data. Because the port does not change, the API's driver
 *     reconnects on its own, no restart needed.
 *   - the API runs as a child process and is restarted if it ever exits
 *     (for example when the database was still coming up at boot).
 *
 * To start over from a clean slate, stop the server and delete db/data/.
 *
 * SEED=1            → loads the demo accounts and sample history before the
 *                      API starts (safe to repeat: accounts are reused).
 * `--seed-only`     → same seed, then exit without starting the API — this
 *                      is what `npm run seed` runs.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import dotenv from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Load .env here too (config/env.js does it for the API child): the decision
// whether to use a configured database or the local one is made in THIS file
// before anything else reads the variable.
dotenv.config({ path: process.env.ENV_FILE || '.env' });

// NOTE: nothing else that reads MONGODB_URI may be imported statically here —
// config/env.js captures the variable when it first loads, and this script
// has to set it BEFORE that happens. (That is why config/db.js is not
// imported: mongoose itself reads no environment at load time.)

const dbPath = fileURLToPath(new URL('../../../db/data', import.meta.url));
await mkdir(dbPath, { recursive: true });

// Fixed on purpose: a restart on the same port keeps MONGODB_URI valid, so
// the API reconnects without being told anything changed.
const dbPort = Number(process.env.MONGO_PORT || 27351);

// A URI from .env / the environment wins; without one we run the on-disk
// database — so plain `npm run dev`, `npm start` and `npm run seed` all work
// with zero configuration instead of failing against a mongod that is not
// listening on the default port.
const configuredUri = String(process.env.MONGODB_URI || '').trim();
const seedOnly = process.argv.includes('--seed-only');
const MONGODB_URI = configuredUri || `mongodb://127.0.0.1:${dbPort}/campuscoin`;

/** Never let user:part-password@ reach the console. */
function maskUri(uri) {
  return uri.replace(/\/\/[^@/]+@/, '//***:***@');
}

/** True when a mongod answers a driver-level ping on our URI right now. */
async function dbAnswers() {
  const conn = mongoose.createConnection(MONGODB_URI, {
    serverSelectionTimeoutMS: 1500,
    connectTimeoutMS: 1500,
  });
  conn.on('error', () => {}); // the caller only wants the yes/no answer
  try {
    await conn.asPromise();
    return true;
  } catch {
    return false;
  } finally {
    try {
      await conn.close();
    } catch {}
  }
}

async function startDatabase() {
  try {
    return await MongoMemoryServer.create({
      instance: { dbPath, port: dbPort, storageEngine: 'wiredTiger' },
    });
  } catch (err) {
    // A database left behind by an interrupted run may still hold the port.
    if (await dbAnswers()) {
      console.warn(`Reusing the database already listening on port ${dbPort}.`);
      return null;
    }
    console.error('Could not start the local database:', err.message);
    process.exit(1);
  }
}

let stopping = false;
let db = null;

if (configuredUri) {
  console.log(`Using the database configured in the environment: ${maskUri(configuredUri)}`);
} else {
  db = await startDatabase();
  console.log(
    db
      ? `Local database started on port ${dbPort} — data kept in ${dbPath} (survives restarts).`
      : `Local database ready on port ${dbPort} — data kept in ${dbPath} (survives restarts).`
  );
}

process.env.MONGODB_URI = MONGODB_URI;
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

if (seedOnly || process.env.SEED === '1') {
  const { runSeed } = await import('./seed.js');
  await runSeed();
  // The seed opened a connection in THIS process; the parent does not serve
  // requests, so let it go — only the watchdog below needs the database.
  await mongoose.disconnect().catch(() => {});
}

// `npm run seed` (--seed-only): seed whatever database is in play, then get
// out of the way — no API, and only a database WE started is stopped again.
if (seedOnly) {
  if (db) {
    try { await db.stop(); } catch {}
  }
  console.log('Seed complete.');
  process.exit(0);
}

/* ------------------------------- API child -------------------------------- */

const serverFile = fileURLToPath(new URL('../server.js', import.meta.url));
let api = null;

function startApi() {
  api = spawn(process.execPath, [serverFile], {
    stdio: 'inherit',
    env: { ...process.env, MONGODB_URI, NODE_ENV: process.env.NODE_ENV || 'development' },
  });
  api.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`API exited (${signal || code}) — restarting in 2s…`);
    setTimeout(startApi, 2000);
  });
}

startApi();

/* ------------------------------ DB watchdog ------------------------------- */

let restartingDb = false;

async function ensureDatabase() {
  if (stopping || restartingDb) return;
  if (await dbAnswers()) return;

  restartingDb = true;
  console.warn('Database stopped answering — restarting it with the same data…');
  try {
    if (db) await db.stop();
  } catch {
    // already gone; what matters is the fresh start below
  }
  try {
    db = await startDatabase();
    console.log('Database is back on the same port — the API reconnects by itself.');
  } catch (err) {
    console.error('Database restart failed:', err.message);
  } finally {
    restartingDb = false;
  }
}

// Only the on-disk database is watched; a configured database manages
// itself (its own server, its own retries).
const watchdog = configuredUri ? null : setInterval(ensureDatabase, 8000);

/* -------------------------------- shutdown -------------------------------- */

const stop = async () => {
  stopping = true;
  clearInterval(watchdog);
  if (api && api.exitCode === null && !api.killed) api.kill();
  if (db) {
    try {
      await db.stop();
    } catch {}
  }
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
