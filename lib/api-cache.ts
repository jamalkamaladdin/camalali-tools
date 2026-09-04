/*
 * What the network tools remember, so the site is not a megaphone.
 *
 * Each of these tools turns one visitor's click into a request to somebody
 * else's server — a certificate log, a package registry, a breach index. Those
 * services are free and none of them owes us anything, so asking them the same
 * question twice in a minute is the kind of manners that gets an address
 * blocked. The answer is held here for as long as it stays true, which for a
 * DNS record is short and for a published package version is not.
 *
 * In memory on purpose, like the rate limiter beside it: one Node process
 * serves the site, a restart forgetting a cached answer costs one extra
 * upstream call, and nothing here is worth a database.
 */

type Entry = { value: unknown; until: number };

/* Bounded, because the key includes visitor input: a bot walking a domain list
   would otherwise turn the cache into an unbounded map of its own making. */
const MAX_ENTRIES = 500;

const store = new Map<string, Entry>();

function sweep(now: number) {
  for (const [key, entry] of store) {
    if (entry.until <= now) store.delete(key);
  }
  /* Still full after sweeping means the traffic is wider than the cache, and
     the oldest insertions are the ones least likely to be asked for again —
     Map iterates in insertion order, so the first keys are exactly those. */
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

/**
 * Returns the remembered answer for `key`, or runs `load` and remembers it.
 *
 * A rejection is not cached: an upstream that is briefly down should not make
 * the tool broken for the rest of the window.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.until > now) return hit.value as T;

  const value = await load();
  sweep(now);
  store.set(key, { value, until: now + ttlMs });
  return value;
}

/** Empties the cache. Exists for the checks, which must not see each other. */
export function clearToolCache() {
  store.clear();
}
