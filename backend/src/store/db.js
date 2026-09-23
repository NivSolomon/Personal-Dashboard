/**
 * Persistence for a multi-tenant deployment. Every function is scoped to one
 * userId; nothing here reads global configuration about "the" user.
 *
 * Provider tokens are encrypted before they are written and decrypted only by
 * getGoogleTokens / getNotionToken / getStravaTokens, so callers that merely need
 * a profile never hold a live credential.
 */
import { decryptJson, decryptSecret, encryptJson, encryptSecret } from '../lib/crypto.js';
import { connectDb, BriefingLog, Summary, User } from './models.js';

export { connectDb, disconnectDb } from './models.js';

/** Mongoose documents carry methods and secrets; callers want neither. */
function publicUser(doc) {
  if (!doc) return null;
  const user = doc.toObject({ getters: false, virtuals: false });
  delete user.google?.secret;
  delete user.notion?.secret;
  delete user.strava?.secret;
  return {
    ...user,
    id: user._id,
    connected: {
      google: Boolean(doc.google?.connectedAt),
      notion: Boolean(doc.notion?.connectedAt),
      strava: Boolean(doc.strava?.connectedAt),
    },
  };
}

export async function getUser(userId) {
  await connectDb();
  return publicUser(await User.findById(userId));
}

/** Only accounts that can still be served: the cron skips everything else. */
export async function listActiveUsers() {
  await connectDb();
  const docs = await User.find({ active: true, 'google.connectedAt': { $ne: null } });
  return docs.map(publicUser);
}

export async function upsertUserFromGoogle({ id, email, name, picture, tokens, scopes }) {
  await connectDb();
  const existing = await User.findById(id).select('+google.secret');

  // A refresh token comes back only on first consent, so a later sign-in that
  // omits it must not wipe the one already stored.
  const previous = existing?.google?.secret ? decryptJson(existing.google.secret) : null;
  const merged = { ...previous, ...tokens };

  const doc = await User.findByIdAndUpdate(
    id,
    {
      $set: {
        email,
        name: name || email,
        picture: picture || null,
        active: true,
        lastSeenAt: new Date(),
        'google.secret': encryptJson(merged),
        'google.connectedAt': existing?.google?.connectedAt || new Date(),
        ...(scopes ? { 'google.scopes': scopes } : {}),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return publicUser(doc);
}

export async function getGoogleTokens(userId) {
  await connectDb();
  const doc = await User.findById(userId).select('+google.secret');
  return doc?.google?.secret ? decryptJson(doc.google.secret) : null;
}

/** googleapis rotates the access token in the background; persist what it emits. */
export async function saveGoogleTokens(userId, tokens) {
  const current = (await getGoogleTokens(userId)) || {};
  await User.updateOne(
    { _id: userId },
    { $set: { 'google.secret': encryptJson({ ...current, ...tokens }) } },
  );
}

export async function saveNotionConnection(userId, { accessToken, workspaceName, workspaceIcon, botId }) {
  await connectDb();
  const doc = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        'notion.secret': encryptSecret(accessToken),
        'notion.connectedAt': new Date(),
        'notion.workspaceName': workspaceName || null,
        'notion.workspaceIcon': workspaceIcon || null,
        'notion.botId': botId || null,
      },
    },
    { new: true },
  );
  return publicUser(doc);
}

export async function getNotionToken(userId) {
  await connectDb();
  const doc = await User.findById(userId).select('+notion.secret');
  return doc?.notion?.secret ? decryptSecret(doc.notion.secret) : null;
}

/** Which data source to read, plus the property names resolved from its schema. */
export async function saveNotionSelection(userId, kind, selection) {
  await connectDb();
  const doc = await User.findByIdAndUpdate(
    userId,
    { $set: { [`notion.${kind}`]: selection } },
    { new: true },
  );
  return publicUser(doc);
}

export async function saveStravaTokens(userId, tokens) {
  await connectDb();
  const current = (await getStravaTokens(userId)) || {};
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'strava.secret': encryptJson({ ...current, ...tokens }),
        'strava.connectedAt': new Date(),
      },
    },
  );
}

export async function getStravaTokens(userId) {
  await connectDb();
  const doc = await User.findById(userId).select('+strava.secret');
  return doc?.strava?.secret ? decryptJson(doc.strava.secret) : null;
}

export async function saveNutritionLog(userId, nutritionLog) {
  await connectDb();
  const doc = await User.findByIdAndUpdate(userId, { $set: { nutritionLog } }, { new: true });
  return publicUser(doc);
}

export async function updateSettings(userId, settings) {
  await connectDb();
  const set = {};
  for (const [key, value] of Object.entries(settings)) set[`settings.${key}`] = value;
  const doc = await User.findByIdAndUpdate(userId, { $set: set }, { new: true });
  return publicUser(doc);
}

export async function completeOnboarding(userId, payload) {
  await connectDb();
  const set = {
    hasCompletedOnboarding: true,
    preferences: payload.preferences,
    'settings.layout': payload.layout,
  };
  if (payload.summaryHour != null) set['settings.summaryHour'] = payload.summaryHour;
  if (payload.weeklyGoalKm != null) set['settings.weeklyGoalKm'] = payload.weeklyGoalKm;
    if (payload.customAIPrompt != null) set.customAIPrompt = payload.customAIPrompt;
    if (payload.language) set['settings.language'] = payload.language;
  const doc = await User.findByIdAndUpdate(userId, { $set: set }, { returnDocument: 'after' });
  return publicUser(doc);
}

export async function saveCustomPrompt(userId, customAIPrompt) {
  await connectDb();
  const doc = await User.findByIdAndUpdate(
    userId,
    { $set: { customAIPrompt } },
    { returnDocument: 'after' },
  );
  return publicUser(doc);
}

/** Forgets one provider without touching the account itself. */
export async function disconnectProvider(userId, provider) {
  await connectDb();
  const reset = {
    [`${provider}.secret`]: null,
    [`${provider}.connectedAt`]: null,
  };
  if (provider === 'google') {
    reset['google.scopes'] = [];
  }
  if (provider === 'notion') {
    Object.assign(reset, {
      'notion.workspaceName': null,
      'notion.workspaceIcon': null,
      'notion.botId': null,
      'notion.deadlines': {},
      'notion.workouts': {},
    });
  }
  const doc = await User.findByIdAndUpdate(userId, { $set: reset }, { new: true });
  return publicUser(doc);
}

export async function touchLastSeen(userId) {
  await connectDb();
  await User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } });
}

export async function deleteUser(userId) {
  await connectDb();
  await Promise.all([
    User.deleteOne({ _id: userId }),
    Summary.deleteOne({ userId }),
    BriefingLog.deleteMany({ userId }),
  ]);
}

export async function getSummary(userId) {
  await connectDb();
  const doc = await Summary.findOne({ userId });
  return doc ? doc.toObject() : null;
}

export async function saveSummary(userId, summary) {
  await connectDb();
  const doc = await Summary.findOneAndUpdate(
    { userId },
    { $set: { ...summary, userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return doc.toObject();
}

export async function saveBriefingLog(userId, { date, language, text, dailyTip }) {
  await connectDb();
  if (!date || !text) return null;
  await BriefingLog.findOneAndUpdate(
    { userId, date },
    { $set: { userId, date, language: language || '', text, dailyTip: dailyTip || '' } },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

export async function listBriefingLogs(userId, { sinceDate, limit = 8 } = {}) {
  await connectDb();
  const filter = { userId };
  if (sinceDate) filter.date = { $gte: sinceDate };
  const docs = await BriefingLog.find(filter).sort({ date: -1 }).limit(limit);
  return docs.map((doc) => doc.toObject());
}
