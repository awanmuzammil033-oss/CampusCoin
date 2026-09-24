import app from './app.js';
import env from './config/env.js';
import { connectDb } from './config/db.js';

/**
 * Boot order matters: no traffic until the database answers, otherwise the
 * first requests would fail with confusing connection errors instead of a
 * clear message in the console.
 */
async function main() {
  try {
    await connectDb();
    console.log('Database connected.');
  } catch (err) {
    console.error('Could not reach the database:', err.message);
    console.error('Check MONGODB_URI in your .env file.');
    process.exit(1);
  }

  // Categories and starter templates must exist on a brand-new database too,
  // not only after someone runs the seed — upserts make this safe to repeat.
  try {
    const { ensureDefaults } = await import('./services/defaults.js');
    const counts = await ensureDefaults();
    console.log(`Defaults ready (${counts.categories} categories, ${counts.templates} templates).`);
  } catch (err) {
    console.error('Could not prepare default data:', err.message);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`Campus Coin API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

main();
