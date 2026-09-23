import mongoose from 'mongoose';
import { config } from '../config.js';

const { Schema } = mongoose;

/**
 * Anything named `secret` holds ciphertext produced by lib/crypto.js, never a
 * usable token. `select: false` keeps them out of query results unless a caller
 * asks explicitly, so ordinary reads cannot leak them into logs or responses.
 */
const providerTokens = {
  secret: { type: String, default: null, select: false },
  connectedAt: { type: Date, default: null },
};

const userSchema = new Schema(
  {
    // Google's stable subject id; the session cookie carries this value.
    _id: { type: String, required: true },
    email: { type: String, required: true, index: true },
    name: { type: String, default: '' },
    picture: { type: String, default: null },
    active: { type: Boolean, default: true, index: true },

    google: {
      ...providerTokens,
      // Recorded so a scope added later can be detected without a failed call.
      scopes: { type: [String], default: [] },
    },

    notion: {
      ...providerTokens,
      workspaceName: { type: String, default: null },
      workspaceIcon: { type: String, default: null },
      botId: { type: String, default: null },
      // Chosen by the user in Settings: OAuth grants access to pages we cannot
      // guess, so the data sources to read are a per-user decision.
      deadlines: {
        dataSourceId: { type: String, default: null },
        title: { type: String, default: null },
        dateProperty: { type: String, default: null },
      },
      workouts: {
        dataSourceId: { type: String, default: null },
        title: { type: String, default: null },
        dateProperty: { type: String, default: null },
        distanceProperty: { type: String, default: null },
        durationProperty: { type: String, default: null },
        sportProperty: { type: String, default: null },
      },
    },

    strava: providerTokens,

    // First-login wizard. Existing accounts without this field still count as incomplete.
    hasCompletedOnboarding: { type: Boolean, default: false },
    preferences: {
      primaryFocus: { type: String, default: null },
      hobbies: { type: [String], default: [] },
      dailyRoutine: { type: String, default: null },
    },
    customAIPrompt: { type: String, default: '' },

    settings: {
      timeZone: { type: String, default: () => config.defaults.timeZone },
      language: { type: String, default: () => config.defaults.language },
      // Local hour at which this user's briefing should be generated.
      summaryHour: { type: Number, default: () => config.defaults.summaryHour, min: 0, max: 23 },
      weather: {
        lat: { type: Number, default: null },
        lon: { type: Number, default: null },
        label: { type: String, default: '' },
      },
      places: {
        home: { type: String, default: '' },
        work: { type: String, default: '' },
      },
      weeklyGoalKm: { type: Number, default: () => config.defaults.weeklyGoalKm, min: 0 },
      calorieGoal: { type: Number, default: () => config.defaults.calorieGoal, min: 0 },
      // Saved stocks/funds plus optional price lines. Shape is normalised in lib/watchlist.js.
      watchlist: { type: Schema.Types.Mixed, default: () => ({ items: [] }) },
      fx: { type: Schema.Types.Mixed, default: () => ({ base: 'ILS', quotes: ['USD'] }) },
      // Order and visibility of dashboard tiles. An empty list means "use catalog defaults".
      layout: {
        widgets: [
          {
            id: { type: String, required: true },
            enabled: { type: Boolean, default: true },
          },
        ],
      },
    },

    // Daily food log. `entries` is today; `days` keeps recent dates for the week chart.
    nutritionLog: {
      date: { type: String, default: '' },
      entries: { type: [Schema.Types.Mixed], default: [] },
      days: { type: Schema.Types.Mixed, default: () => ({}) },
    },

    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

userSchema.index({ active: 1, 'google.connectedAt': 1 });

const summarySchema = new Schema(
  {
    // One current briefing per user, replaced in place, as before.
    userId: { type: String, required: true, unique: true },
    date: { type: String, required: true },
    text: { type: String, default: '' },
    dailyTip: { type: String, default: '' },
    // The one language this briefing was written in. Not a bilingual store.
    language: { type: String, default: '' },
    model: { type: String, default: null },
    promptHash: { type: String, default: null },
    generatedAt: { type: Date, default: null },
    checkedAt: { type: Date, default: null },
    reused: { type: Boolean, default: false },
    stats: { type: Schema.Types.Mixed, default: {} },
    sentences: { type: [Schema.Types.Mixed], default: [] },
    tipSources: { type: [String], default: [] },
    // Not named `errors`: that is a reserved Mongoose document path. Write-only
    // diagnostics recording which sources failed when this briefing was built.
    sourceErrors: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Summary = mongoose.models.Summary || mongoose.model('Summary', summarySchema);

const briefingLogSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    language: { type: String, default: '' },
    text: { type: String, default: '' },
    dailyTip: { type: String, default: '' },
  },
  { timestamps: true },
);
briefingLogSchema.index({ userId: 1, date: 1 }, { unique: true });

export const BriefingLog =
  mongoose.models.BriefingLog || mongoose.model('BriefingLog', briefingLogSchema);

let connecting = null;

/** Idempotent: the cron job, the HTTP server and scripts all call this. */
export function connectDb() {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
  if (!connecting) {
    connecting = mongoose
      .connect(config.mongoUri, {
        dbName: config.mongoDbName,
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 10,
        minPoolSize: 1,
      })
      .then((m) => m.connection);
  }
  return connecting;
}

export async function disconnectDb() {
  connecting = null;
  await mongoose.disconnect();
}
