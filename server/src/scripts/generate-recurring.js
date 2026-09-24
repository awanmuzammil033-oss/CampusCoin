/**
 * Daily job: create this period's transactions for every active recurring
 * rule (architecture §9 "scheduled jobs"). The generator only ever walks
 * forward from each rule's lastGeneratedOn, so running it twice a day — or
 * from cron and by hand — never duplicates an entry.
 *
 * Wire it up as:  node src/scripts/generate-recurring.js
 */
import { connectDb, disconnectDb } from '../config/db.js';
import { generateForEveryone } from '../services/recurring.js';

async function main() {
  await connectDb();
  const created = await generateForEveryone();
  console.log(`Recurring entries created: ${created}`);
  await disconnectDb();
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Recurring generation failed:', err);
    try {
      await disconnectDb();
    } catch {
      // exiting either way
    }
    process.exit(1);
  });
