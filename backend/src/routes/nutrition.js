import { localDateKey } from '../lib/time.js';
import {
  addEntryToLog,
  nutritionSummary,
  parseLogEntry,
  removeEntryFromLog,
} from '../lib/nutrition.js';
import { fetchProductByBarcode, searchProducts } from '../integrations/openFoodFacts.js';
import { analyzeMealPhoto, estimateFromText, parseMealImage } from '../ai/nutrition.js';
import { getUser, saveNutritionLog } from '../store/db.js';
import { invalidateDashboardCache } from '../services/dashboard.js';

function sendCoded(reply, error) {
  const status = error.statusCode || 502;
  return reply.code(status).send({ error: error.code || 'unavailable' });
}

async function persistLog(user, nextLog) {
  const updated = await saveNutritionLog(user.id, nextLog);
  invalidateDashboardCache(user.id);
  return nutritionSummary(updated);
}

export async function nutritionRoutes(app) {
  app.get('/api/nutrition/barcode/:code', async (request, reply) => {
    try {
      const product = await fetchProductByBarcode(request.params.code);
      if (!product) return reply.code(404).send({ error: 'product_not_found' });
      return { product };
    } catch (error) {
      if (error.code === 'invalid_barcode') return sendCoded(reply, error);
      request.log.warn({ err: error }, 'barcode lookup failed');
      return reply.code(502).send({ error: 'off_unavailable' });
    }
  });

  app.get('/api/nutrition/search', async (request, reply) => {
    const q = String(request.query.q || '').trim();
    if (q.length < 2) return { products: [] };
    if (q.length > 80) return reply.code(400).send({ error: 'invalid_query' });
    try {
      return { products: await searchProducts(q) };
    } catch (error) {
      request.log.warn({ err: error }, 'food search failed');
      return reply.code(502).send({ error: 'off_unavailable' });
    }
  });

  app.post('/api/nutrition/estimate', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const q = String(request.body?.query || request.body?.q || '').trim();
    if (q.length < 2) return reply.code(400).send({ error: 'invalid_query' });
    try {
      const estimate = await estimateFromText({
        query: q,
        language: request.currentUser.settings?.language,
        logger: request.log,
      });
      return { estimate };
    } catch (error) {
      return sendCoded(reply, error);
    }
  });

  app.post(
    '/api/nutrition/analyze-meal',
    {
      bodyLimit: 5 * 1024 * 1024,
      config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = parseMealImage(request.body || {});
      if (parsed.error) return reply.code(400).send({ error: parsed.error });
      try {
        const estimate = await analyzeMealPhoto({
          image: parsed.value,
          language: request.currentUser.settings?.language,
          logger: request.log,
        });
        return { estimate };
      } catch (error) {
        return sendCoded(reply, error);
      }
    },
  );

  app.get('/api/nutrition/today', async (request) => nutritionSummary(request.currentUser));

  app.post('/api/nutrition/log', async (request, reply) => {
    const parsed = parseLogEntry(request.body || {});
    if (parsed.error) return reply.code(400).send({ error: parsed.error });
    const user = await getUser(request.currentUser.id);
    const date = localDateKey(user.settings?.timeZone);
    const next = addEntryToLog(user.nutritionLog, parsed.value, date);
    return persistLog(user, next);
  });

  app.delete('/api/nutrition/log/:entryId', async (request, reply) => {
    const entryId = String(request.params.entryId || '');
    if (!entryId) return reply.code(400).send({ error: 'invalid_entry' });
    const user = await getUser(request.currentUser.id);
    const date = localDateKey(user.settings?.timeZone);
    const next = removeEntryFromLog(user.nutritionLog, entryId, date);
    return persistLog(user, next);
  });
}
