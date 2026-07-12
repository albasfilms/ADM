const cache = new Map();
const inflight = new Map();

const DEFAULT_TTL_MS = 60_000;

export function getCached(key, fetcher, ttlMs = DEFAULT_TTL_MS) {
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && now - cached.time < ttlMs) {
    return Promise.resolve(cached.data);
  }

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      cache.set(key, { data, time: Date.now() });
      inflight.delete(key);
      return data;
    })
    .catch((error) => {
      inflight.delete(key);
      throw error;
    });

  inflight.set(key, promise);
  return promise;
}

export function invalidateCache(key) {
  cache.delete(key);
  inflight.delete(key);
}

export function invalidateCacheByPrefix(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      inflight.delete(key);
    }
  }
}

export function clearDataCache() {
  cache.clear();
  inflight.clear();
}
