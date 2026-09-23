/**
 * In-process TTL cache with request coalescing.
 *
 * Coalescing is the important part: a page load that triggers several requests
 * for the same user should produce one round of Google API calls, not several.
 *
 * Moving this to Redis later means reimplementing `read`/`write` against a
 * client; `wrap` and the call sites stay as they are.
 */
export function createTtlCache({ ttlMs, maxEntries = 200 } = {}) {
  const entries = new Map();
  const inflight = new Map();

  function read(key) {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return undefined;
    }
    // Re-insert so a hit counts as recently used (LRU), not just oldest-first FIFO.
    entries.delete(key);
    entries.set(key, entry);
    return entry.value;
  }

  function write(key, value) {
    // Map iterates in insertion order, so the first key is the oldest one.
    if (!entries.has(key) && entries.size >= maxEntries) {
      entries.delete(entries.keys().next().value);
    }
    entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  function invalidate(key) {
    entries.delete(key);
  }

  /**
   * Returns the cached value for `key`, otherwise runs `factory` and caches it.
   * `force` skips the read but still joins an in-flight fetch, `isFresh` rejects a
   * hit that is still within TTL but no longer valid (for example a language
   * change), and `shouldCache` lets the caller refuse to cache a degraded result.
   */
  async function wrap(key, factory, { force = false, shouldCache = () => true, isFresh } = {}) {
    const usable = (value) => force || !isFresh || isFresh(value);

    for (;;) {
      if (!force) {
        const hit = read(key);
        if (hit !== undefined && usable(hit)) return { value: hit, cached: true };
      }

      const pending = inflight.get(key);
      if (pending) {
        const value = await pending;
        if (usable(value)) return { value, cached: true };
        continue;
      }

      const promise = Promise.resolve().then(factory);
      inflight.set(key, promise);
      try {
        const value = await promise;
        if (shouldCache(value)) write(key, value);
        else invalidate(key);
        return { value, cached: false };
      } finally {
        inflight.delete(key);
      }
    }
  }

  return {
    read,
    write,
    invalidate,
    wrap,
    get size() {
      return entries.size;
    },
  };
}
