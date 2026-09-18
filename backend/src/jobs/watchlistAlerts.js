import cron from 'node-cron';
import { config } from '../config.js';
import { listActiveUsers } from '../store/db.js';
import { invalidateDashboardCache } from '../services/dashboard.js';
import { loadWatchlistForUser, userNeedsWatchlistCheck } from '../services/watchlist.js';

/**
 * Checks saved price lines even when the dashboard is closed, so a crossing is
 * waiting on the next visit (and in the morning briefing) rather than missed.
 */
export async function runWatchlistAlerts(logger) {
  const users = await listActiveUsers();
  const results = [];

  for (const user of users) {
    if (!userNeedsWatchlistCheck(user)) continue;
    try {
      const payload = await loadWatchlistForUser(user, { persist: true });
      if (payload.changed) invalidateDashboardCache(user.id);
      if (payload.fired?.length) {
        logger?.info(
          { userId: user.id, count: payload.fired.length },
          'watchlist price alert fired',
        );
      }
      results.push({ userId: user.id, ok: true, fired: payload.fired?.length || 0 });
    } catch (error) {
      logger?.error({ err: error, userId: user.id }, 'watchlist alert check failed');
      results.push({ userId: user.id, ok: false, error: error.message });
    }
  }

  return results;
}

export function startWatchlistAlertJob(logger) {
  const spec = config.watchlist.cron;
  if (!cron.validate(spec)) {
    logger?.error({ cron: spec }, 'invalid WATCHLIST_CRON; job not scheduled');
    return null;
  }

  const task = cron.schedule(spec, () => {
    void runWatchlistAlerts(logger);
  });

  logger?.info({ cron: spec }, 'watchlist price-alert scheduler started');
  return task;
}
