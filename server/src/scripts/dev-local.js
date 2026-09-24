/**
 * `npm run dev:local` — run the whole API against an in-memory database.
 *
 * Useful when you do not want to point the project at a cloud database while
 * developing: the data lives for as long as the process runs and vanishes
 * afterwards. The server itself is untouched — it reads MONGODB_URI like it
 * always does; this script just fills that variable in first.
 *
 * SEED=1 npm run dev:local   → also loads the demo accounts and sample history.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('campuscoin');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

console.log('In-memory database started (data resets on restart).');

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
