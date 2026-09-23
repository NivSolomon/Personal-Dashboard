/**
 * Run `iteratee` over `items` with at most `limit` tasks in flight.
 * Used by cron jobs so one slow tenant does not stall the rest of the queue.
 */
export async function mapLimit(items, limit, iteratee) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, list.length));
  const results = new Array(list.length);
  let next = 0;

  async function worker() {
    while (next < list.length) {
      const index = next;
      next += 1;
      results[index] = await iteratee(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
