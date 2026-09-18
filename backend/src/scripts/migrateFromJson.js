/**
 * One-off move from the retired JSON file store into MongoDB, encrypting the
 * provider tokens on the way in:
 *   npm --workspace backend run migrate:json
 *
 * Safe to re-run: users are upserted by id and summaries by userId. The JSON file
 * is left untouched, so it stays available as a fallback until you delete it.
 */
import fs from 'node:fs/promises';
import { assertRequiredConfig, config } from '../config.js';
import { encryptJson } from '../lib/crypto.js';
import { connectDb, disconnectDb, Summary, User } from '../store/models.js';

assertRequiredConfig();

const raw = await fs.readFile(config.dataFile, 'utf8').catch((error) => {
  if (error.code === 'ENOENT') {
    console.error(`Nothing to migrate: ${config.dataFile} does not exist.`);
    process.exit(0);
  }
  throw error;
});

const data = JSON.parse(raw);
const users = Object.values(data.users || {});
const summaries = Object.entries(data.summaries || {});

await connectDb();
console.log(`Migrating ${users.length} user(s) and ${summaries.length} summary/summaries…`);

for (const user of users) {
  // The old shape kept Google tokens on `tokens` and Strava's on `strava`.
  await User.findByIdAndUpdate(
    user.id,
    {
      $set: {
        email: user.email,
        name: user.name || user.email,
        picture: user.picture || null,
        active: true,
        'google.secret': encryptJson(user.tokens || null),
        'google.connectedAt': user.createdAt ? new Date(user.createdAt) : new Date(),
        'strava.secret': user.strava ? encryptJson(user.strava) : null,
        'strava.connectedAt': user.strava ? new Date() : null,
        // Settings previously came from environment variables shared by everyone,
        // so the old values are carried onto this account as its starting point.
        'settings.timeZone': config.defaults.timeZone,
        'settings.language': config.defaults.language,
        'settings.summaryHour': config.defaults.summaryHour,
        'settings.weeklyGoalKm': config.defaults.weeklyGoalKm,
        'settings.weather': {
          lat: process.env.WEATHER_LAT ? Number(process.env.WEATHER_LAT) : null,
          lon: process.env.WEATHER_LON ? Number(process.env.WEATHER_LON) : null,
        },
      },
    },
    { upsert: true, setDefaultsOnInsert: true, new: true },
  );
  console.log(`  user ${user.email} (${user.id})`);
}

for (const [userId, summary] of summaries) {
  const { promptHash, errors, ...rest } = summary;
  await Summary.findOneAndUpdate(
    { userId },
    {
      $set: {
        ...rest,
        userId,
        sourceErrors: errors || [],
        // Dropped on purpose: prompts now carry per-user language and timezone, so
        // an old hash would wrongly report "nothing changed" and reuse stale text.
        promptHash: null,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
  console.log(`  summary for ${userId} (${summary.date})`);
}

console.log('\nDone. Notion must be reconnected per user via Settings: the old');
console.log('deployment shared one internal integration token, which is not per-user.');

await disconnectDb();
