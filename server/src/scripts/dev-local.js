/**
 * `npm run dev:local` — run the whole API without any cloud database.
 *
 * The data lives on disk (db/data/, next to db/schema.md), so anything you
 * create — accounts, entries, budgets — survives server restarts. Nothing
 * cloud-side is touched: the server still reads MONGODB_URI like it always
 * does; this script just fills that variable in first.
 *
 * To start over from a clean slate, stop the server and delete db/data/.
 *
 * SEED=1 npm run dev:local   → also loads the demo accounts and sample history
 *                              (safe to repeat: existing accounts are reused).
 */
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';

const dbPath = fileURLToPath(new URL('../../../db/data', import.meta.url));
await mkdir(dbPath, { recursive: true });

const mongod = await MongoMemoryServer.create({
  instance: { dbPath, storageEngine: 'wiredTiger' },
});
process.env.MONGODB_URI = mongod.getUri('campuscoin');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`Local database started — data kept in ${dbPath} (survives restarts).`);

if (process.env.SEED === '1') {
  const { runSeed } = await import('./seed.js');
  await runSeed();
}

// Importing the entry point boots the app on the URL it already knows.
await import('../server.js');

const stop = async () => {
  await mongod.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
