import { hashText } from '../lib/hash.js';
import { localDateKey } from '../lib/time.js';
import { normalizeLanguage } from '../lib/validate.js';
import { getSummary, saveBriefingLog, saveSummary, getUser } from '../store/db.js';
import { collectDashboardData } from './dashboard.js';
import { buildSummaryPrompt, generateMorningSummary } from '../ai/summary.js';

/** Missing `language` is treated as unknown so a legacy row is fingerprinted, not blindly reused. */
function sameLanguage(cached, language) {
  if (!cached?.language) return false;
  return normalizeLanguage(cached.language) === normalizeLanguage(language);
}

/**
 * Fetches Google data, asks the model for a briefing, and caches the result.
 *
 * `freshData` bypasses the dashboard cache; `reuseUnchanged` keeps the previous
 * text when the prompt fingerprint is identical, which is the guard that stops
 * repeated refreshes from costing tokens.
 */
export async function buildSummaryForUser(
  userId,
  { logger, freshData = true, reuseUnchanged = true, language: languageOverride } = {},
) {
  const user = await getUser(userId);
  if (!user) throw new Error(`Unknown user ${userId}`);

  const { timeZone } = user.settings;
  const language = languageOverride
    ? normalizeLanguage(languageOverride)
    : user.settings.language;
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
      language,
      checkedAt: now,
      reused: true,
    };
    await saveSummary(userId, reused);
    await saveBriefingLog(userId, {
      date: reused.date,
      language,
      text: reused.text,
      dailyTip: reused.dailyTip,
    });
    logger?.info({ userId }, 'summary inputs unchanged; skipped the OpenAI call');
    return reused;
  }

  const { text, dailyTip, model, busyness, sentences, tipSources } = await generateMorningSummary({
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
    sentences,
    tipSources,
    language,
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
  await saveBriefingLog(userId, {
    date: summary.date,
    language,
    text,
    dailyTip,
  });
  logger?.info({ userId, model, stats: summary.stats }, 'morning summary generated');
  return summary;
}

/**
 * The cached briefing for today, generating it on demand when the cron job has
 * not run yet (first login, machine was asleep at 07:00, `force` refresh) or
 * when the user switched the app language and the stored text is now stale.
 *
 * A forced rebuild always re-reads Google. The model is skipped only when the
 * prompt fingerprint is unchanged, so adding a meeting or task in the app can
 * update the briefing without a separate Refresh click.
 */
export async function getOrBuildSummary(userId, { logger, force = false, language: languageOverride } = {}) {
  const user = await getUser(userId);
  if (!user) throw new Error(`Unknown user ${userId}`);

  const language = languageOverride
    ? normalizeLanguage(languageOverride)
    : user.settings.language;
  const cached = await getSummary(userId);
  const today = localDateKey(user.settings.timeZone);
  const languageChanged = cached && !sameLanguage(cached, language);

  if (
    !force &&
    !languageChanged &&
    cached?.date === today &&
    String(cached.dailyTip || '').trim()
  ) {
    return { ...cached, cached: true };
  }

  // A first build of the day can reuse the data the page load just fetched;
  // an explicit refresh means the user wants Google queried again.
  const fresh = await buildSummaryForUser(userId, {
    logger,
    freshData: force,
    language,
  });
  return { ...fresh, cached: false };
}
