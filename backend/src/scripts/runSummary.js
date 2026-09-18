/**
 * Runs the 07:00 job once, right now, for every connected account.
 * Handy for testing the prompt without waiting for the cron tick:
 *   npm --workspace backend run summary:run
 */
import { runMorningSummaryForAllUsers } from '../jobs/morningSummary.js';
import { connectDb, disconnectDb } from '../store/db.js';

const logger = {
  info: (...args) => console.log('[info]', ...args),
  warn: (...args) => console.warn('[warn]', ...args),
  error: (...args) => console.error('[error]', ...args),
};

await connectDb();
const results = await runMorningSummaryForAllUsers(logger);

for (const result of results) {
  if (result.ok) {
    console.log(`\n--- ${result.userId} ---\n${result.summary.text}\n`);
  } else {
    console.error(`\n--- ${result.userId} failed: ${result.error}\n`);
  }
}

await disconnectDb();
