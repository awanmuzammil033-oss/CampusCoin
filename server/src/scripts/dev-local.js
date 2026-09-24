/**
 * `npm run dev:local` — run the whole API without any cloud database.
 *
 * The data lives on disk (db/data/, next to db/schema.md), so anything you
 * create — accounts, entries, budgets — survives server restarts. Nothing
 * cloud-side is touched: the server still reads MONGODB_URI like it always
 * does; this script just fills that variable in first.
 *
 * This script supervises the two processes it starts, because a dev session
 * must not fall over half-dead:
 *   - the database runs on a FIXED port (default 27351) and is pinged every
 *     few seconds; if it stops answering — it has been seen to die mid-run —
 *     it is brought back with the same data. Because the port does not
 *     change, the API's driver reconnects on its own, no restart needed.
 *   - the API runs as a child process and is restarted if it ever exits
 *     (for example when the database was still coming up at boot).
 *
 * To start over from a clean slate, stop the server and delete db/data/.
 *
 * SEED=1 npm run dev:local   → also loads the demo accounts and sample history
 *                              (safe to repeat: existing accounts are reused).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// NOTE: nothing that reads MONGODB_URI may be imported statically here —
// config/env.js captures the variable when it first loads, and this script
// has to set it BEFORE that happens. (That is why config/db.js is not
// imported: mongoose itself reads no environment at load time.)

const dbPath = fileURLToPath(new URL('../../../db/data', import.meta.url));
await mkdir(dbPath, { recursive: true });

// Fixed on purpose: a restart on the same port keeps MONGODB_URI valid, so
// the API reconnects without being told anything changed.
const dbPort = Number(process.env.MONGO_PORT || 27351);
const MONGODB_URI = `mongodb://127.0.0.1:${dbPort}/campuscoin`;

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
let db = await startDatabase();
console.log(
  db
    ? `Local database started on port ${dbPort} — data kept in ${dbPath} (survives restarts).`
    : `Local database ready on port ${dbPort} — data kept in ${dbPath} (survives restarts).`
);

process.env.MONGODB_URI = MONGODB_URI;
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

if (process.env.SEED === '1') {
  const { runSeed } = await import('./seed.js');
  await runSeed();
  // The seed opened a connection in THIS process; the parent does not serve
  // requests, so let it go — only the watchdog below needs the database.
  await mongoose.disconnect().catch(() => {});
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

const watchdog = setInterval(ensureDatabase, 8000);

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
