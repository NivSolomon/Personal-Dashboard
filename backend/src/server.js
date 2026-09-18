import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { assertRequiredConfig, config, isOpenAiConfigured } from './config.js';
import { authRoutes } from './routes/auth.js';
import { apiRoutes } from './routes/api.js';
import { startMorningSummaryJob } from './jobs/morningSummary.js';
import { startWatchlistAlertJob } from './jobs/watchlistAlerts.js';
import { connectDb, disconnectDb } from './store/db.js';

async function publicIp() {
  const response = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error('ip lookup failed');
  return response.text();
}

export async function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });

  await app.register(cors, { origin: config.frontendUrl, credentials: true });
  await app.register(cookie, { secret: config.sessionSecret });

  app.get('/health', async () => ({
    ok: true,
    timeZone: config.timeZone,
    openai: isOpenAiConfigured() ? config.openai.model : 'not configured',
    summaryCron: config.summary.cron,
    watchlistCron: config.watchlist.cron,
    dashboardCacheSeconds: config.cache.dashboardTtlMs / 1000,
    minRefreshSeconds: config.summary.minRefreshMs / 1000,
  }));

  await app.register(authRoutes);
  // Scoped so the api-only auth hook and error handler do not affect /auth or /health.
  await app.register(apiRoutes);

  return app;
}

async function main() {
  assertRequiredConfig();

  const app = await buildServer();
  // Fail fast on a bad connection string rather than on the first request.
  try {
    await connectDb();
  } catch (error) {
    const ip = await publicIp().catch(() => null);
    const hint = ip
      ? ` This machine's public IP is ${ip}. Add it in Atlas → Network Access, or add 0.0.0.0/0 for local development.`
      : ' Add this machine in Atlas → Network Access (or 0.0.0.0/0 for local development).';
    throw new Error(`${error.message}${hint}`);
  }
  app.log.info({ db: config.mongoDbName }, 'connected to MongoDB');

  const summaryJob = startMorningSummaryJob(app.log);
  const watchlistJob = startWatchlistAlertJob(app.log);

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      app.log.info({ signal }, 'shutting down');
      summaryJob?.stop();
      watchlistJob?.stop();
      await app.close();
      await disconnectDb();
      process.exit(0);
    });
  }

  await app.listen({ port: config.port, host: config.host });
}

// Only boot when run directly, so tests and scripts can import buildServer().
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
