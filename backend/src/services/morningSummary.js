import { config } from '../config.js';
import { hashText } from '../lib/hash.js';
import { localDateKey } from '../lib/time.js';
import { getSummary, saveSummary, getUser } from '../store/db.js';
import { collectDashboardData } from './dashboard.js';
import { buildSummaryPrompt, generateMorningSummary } from '../ai/summary.js';

/**
 * Fetches Google data, asks the model for a briefing, and caches the result.
 *
 * `freshData` bypasses the dashboard cache; `reuseUnchanged` keeps the previous
 * text when the prompt fingerprint is identical, which is the guard that stops
 * repeated refreshes from costing tokens.
 */
export async function buildSummaryForUser(
  userId,
  { logger, freshData = true, reuseUnchanged = true } = {},
) {
  const user = await getUser(userId);
  if (!user) throw new Error(`Unknown user ${userId}`);

  const { timeZone, language } = user.settings;
  const data = await collectDashboardData(userId, { logger, force: freshData });
  const prompt = buildSummaryPrompt({ user, data, timeZone, language });
  const promptHash = hashText(prompt);
  const previous = await getSummary(userId);
  const now = new Date().toISOString();

  // The prompt carries the date, so a new morning always produces a new hash.
  if (reuseUnchanged && previous?.text && previous.promptHash === promptHash) {
    const reused = {
      ...previous,
      date: localDateKey(timeZone),
      checkedAt: now,
      reused: true,
    };
    await saveSummary(userId, reused);
    logger?.info({ userId }, 'summary inputs unchanged; skipped the OpenAI call');
    return reused;
  }

  const { text, dailyTip, model, busyness } = await generateMorningSummary({
    user,
    data,
    prompt,
    timeZone,
    language,
    logger,
  });

  const summary = {
    date: localDateKey(timeZone),
    text,
    dailyTip,
    model,
    promptHash,
    generatedAt: now,
    checkedAt: now,
    reused: false,
    stats: {
      events: (data.events || []).length,
      tasks: (data.tasks || []).length,
      emails: (data.emails || []).length,
      parcels: (data.parcels || []).length,
      busyness,
    },
    sourceErrors: data.errors,
  };

  await saveSummary(userId, summary);
  logger?.info({ userId, model, stats: summary.stats }, 'morning summary generated');
  return summary;
}

/**
 * The cached briefing for today, generating it on demand when the cron job has
 * not run yet (first login, machine was asleep at 07:00, `force` refresh).
 */
export async function getOrBuildSummary(userId, { logger, force = false } = {}) {
  const user = await getUser(userId);
  if (!user) throw new Error(`Unknown user ${userId}`);

  const cached = await getSummary(userId);
  const today = localDateKey(user.settings.timeZone);

  if (!force && cached?.date === today && String(cached.dailyTip || '').trim()) {
    return { ...cached, cached: true };
  }

  if (force && cached) {
    const lastAttempt = new Date(cached.checkedAt || cached.generatedAt).getTime();
    const elapsed = Date.now() - lastAttempt;
    if (elapsed < config.summary.minRefreshMs) {
      logger?.info({ userId }, 'refresh throttled; returning the cached briefing');
      return {
        ...cached,
        cached: true,
        throttled: true,
        retryInSeconds: Math.ceil((config.summary.minRefreshMs - elapsed) / 1000),
      };
    }
  }

  // A first build of the day can reuse the data the page load just fetched;
  // an explicit refresh means the user wants Google queried again.
  const fresh = await buildSummaryForUser(userId, { logger, freshData: force });
  return { ...fresh, cached: false };
}
