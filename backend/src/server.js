import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import { assertRequiredConfig, config, isOpenAiConfigured } from './config.js';
import { authRoutes } from './routes/auth.js';
import { apiRoutes } from './routes/api.js';
import { startMorningSummaryJob } from './jobs/morningSummary.js';
import { startWatchlistAlertJob } from './jobs/watchlistAlerts.js';
import { connectDb, disconnectDb } from './store/db.js';
import { readSession } from './lib/session.js';

async function publicIp() {
  const response = await fetch('https://api.ipify.org', {
    credentials: 'include',
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error('ip lookup failed');
  return response.text();
}

function loggerOptions() {
  return {
    level: process.env.LOG_LEVEL || 'info',
    // Drop headers and stacks that often carry Google/OpenAI tokens.
    serializers: {
      err(error) {
        return {
          type: error?.name,
          message: error?.message,
          code: error?.code,
          status: error?.status || error?.statusCode,
        };
      },
    },
  };
}

export async function buildServer() {
  const app = Fastify({
    logger: loggerOptions(),
    trustProxy: config.trustProxy,
    // 0 keeps the socket open while a handler waits on Google/OpenAI.
    // requestTimeout only covers receiving the incoming body, not the reply.
    connectionTimeout: 0,
    requestTimeout: 60_000,
    bodyLimit: 1_048_576,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, { origin: config.frontendUrl, credentials: true });
  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(compress, { global: true, encodings: ['br', 'gzip'] });
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    allowList: (request) => request.url === '/health' || request.url?.startsWith('/health?'),
    keyGenerator: (request) => readSession(request) || request.ip,
  });

  app.get('/health', async () => {
    const payload = { ok: true };
    if (/^(1|true|yes)$/i.test(String(process.env.HEALTH_DETAIL || ''))) {
      payload.timeZone = config.timeZone;
      payload.openai = isOpenAiConfigured() ? config.openai.model : 'not configured';
      payload.summaryCron = config.summary.cron;
      payload.watchlistCron = config.watchlist.cron;
      payload.dashboardCacheSeconds = config.cache.dashboardTtlMs / 1000;
      payload.minRefreshSeconds = config.summary.minRefreshMs / 1000;
    }
    return payload;
  });

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

