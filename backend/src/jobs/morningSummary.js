import cron from 'node-cron';
import { config } from '../config.js';
import { getSummary, listActiveUsers } from '../store/db.js';
import { localDateKey } from '../lib/time.js';
import { buildSummaryForUser } from '../services/morningSummary.js';

/** The user's own wall-clock hour, which is what their delivery time refers to. */
function localHour(timeZone, now) {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(now),
  );
}

/**
 * Tenants live in different timezones, so a single "07:00" cron would be wrong for
 * most of them. Instead the scheduler wakes frequently and asks, per user, whether
 * their local delivery hour has arrived and today's briefing is still missing.
 * The date check makes this idempotent: extra ticks inside the hour do nothing.
 */
export async function runDueSummaries(logger, now = new Date()) {
  const users = await listActiveUsers();
  const results = [];

  for (const user of users) {
    const { timeZone, summaryHour } = user.settings;
    try {
      if (localHour(timeZone, now) !== summaryHour) continue;

      const existing = await getSummary(user.id);
      if (existing?.date === localDateKey(timeZone, now)) continue;

      const summary = await buildSummaryForUser(user.id, { logger });
      results.push({ userId: user.id, ok: true, summary });
      logger?.info({ userId: user.id, timeZone }, 'morning summary generated on schedule');
    } catch (error) {
      logger?.error({ err: error, userId: user.id }, 'morning summary failed for user');
      results.push({ userId: user.id, ok: false, error: error.message });
    }
  }
  return results;
}

/** Ignores delivery hours and rebuilds for everyone; used by the manual script. */
export async function runMorningSummaryForAllUsers(logger) {
  const users = await listActiveUsers();
  if (users.length === 0) {
    logger?.info('morning summary job: no connected accounts, nothing to do');
    return [];
  }

  const results = [];
  for (const user of users) {
    try {
      const summary = await buildSummaryForUser(user.id, { logger });
      results.push({ userId: user.id, ok: true, summary });
    } catch (error) {
      logger?.error({ err: error, userId: user.id }, 'morning summary job failed for user');
      results.push({ userId: user.id, ok: false, error: error.message });
    }
  }
  return results;
}

export function startMorningSummaryJob(logger) {
  if (!cron.validate(config.summary.cron)) {
    logger?.error({ cron: config.summary.cron }, 'invalid SUMMARY_CRON; job not scheduled');
    return null;
  }

  const task = cron.schedule(config.summary.cron, () => {
    void runDueSummaries(logger);
  });

  logger?.info(
    { cron: config.summary.cron },
    'morning summary scheduler started; delivery hour is per user',
  );
  return task;
}
