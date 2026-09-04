/**
 * Cache sizing: given how many requests hit how many unique keys against a
 * cache of a given size, what fraction is a hit, what that does to average
 * latency, and how much memory it would take to stop missing altogether.
 *
 * Two hit-ratio models, on purpose, and the split is the thing worth
 * checking rather than an implementation detail:
 *
 * - `uniform` treats every unique key as equally likely to be requested next.
 *   Every key is a miss the first time it is ever seen (`compulsoryMisses`),
 *   and after that a key only hits if the cache is big enough to still be
 *   holding it — which, under a uniform access pattern, happens for a
 *   `min(1, capacity / uniqueKeys)` share of the repeat requests. This is the
 *   pessimistic model: real traffic is rarely uniform, so it is a floor, not
 *   a forecast.
 * - `zipf` assumes the classic Zipf's-law shape real traffic actually tends
 *   toward — a request for the Nth-most-popular key is roughly 1/N as likely
 *   as a request for the most popular one. Under that shape, an LRU cache
 *   holding the `capacity` most popular keys catches a share of traffic equal
 *   to `H(capacity) / H(uniqueKeys)`, the ratio of harmonic numbers — an exact
 *   formula, not a fitted curve, which is why `harmonicNumber` is exported
 *   and tested on its own.
 *
 * Neither model is "the" hit ratio a real deployment will see; the widget
 * says so, and shows both rather than picking one for the visitor.
 */

export type CacheAccessModel = "uniform" | "zipf";

export type CacheSizeMode = "items" | "mb";

export type CacheInput = {
  requestCount: number;
  uniqueKeyCount: number;
  sizeMode: CacheSizeMode;
  cacheSizeItems: number;
  cacheSizeMb: number;
  avgItemSizeKb: number;
  originLatencyMs: number;
  cacheLatencyMs: number;
  ttlSeconds: number;
  model: CacheAccessModel;
};

export type CacheComputation =
  | {
      ok: true;
      /** How many distinct items the cache can hold, given its size and the average item size. */
      capacityItems: number;
      /** `capacityItems`, never above `uniqueKeyCount` — holding more slots than there are keys buys nothing. */
      effectiveCapacityItems: number;
      hitRatio: number;
      missRatio: number;
      avgLatencyMs: number;
      /** Requests per second-equivalent unit that would have reached the origin with no cache at all. */
      originRequestsBefore: number;
      originRequestsAfter: number;
      originLoadReductionPercent: number;
      /** What it would take to cache every unique key at least once — the ceiling on hit ratio via size alone. */
      memoryForAllUniqueKb: number;
      model: CacheAccessModel;
    }
  | { ok: false; error: string };

/** `H(n) = Σ 1/k` for `k = 1..n`. Exact, not approximated — `n` is always an integer item count here. */
export function harmonicNumber(n: number): number {
  let sum = 0;
  for (let k = 1; k <= n; k++) sum += 1 / k;
  return sum;
}

function uniformHitRatio(requestCount: number, uniqueKeyCount: number, capacityItems: number): number {
  if (requestCount <= 0) return 0;
  const compulsoryMisses = Math.min(uniqueKeyCount, requestCount);
  const repeatRequests = requestCount - compulsoryMisses;
  const capacityFraction = uniqueKeyCount > 0 ? Math.min(1, capacityItems / uniqueKeyCount) : 0;
  const hits = repeatRequests * capacityFraction;
  return hits / requestCount;
}

function zipfHitRatio(uniqueKeyCount: number, capacityItems: number): number {
  if (uniqueKeyCount <= 0) return 0;
  const capped = Math.min(capacityItems, uniqueKeyCount);
  if (capped <= 0) return 0;
  return harmonicNumber(capped) / harmonicNumber(uniqueKeyCount);
}

export function computeCacheBudget(input: CacheInput): CacheComputation {
  if (!Number.isFinite(input.requestCount) || input.requestCount < 0) {
    return { ok: false, error: "Sorğu sayı mənfi ola bilməz." };
  }
  if (!Number.isFinite(input.uniqueKeyCount) || input.uniqueKeyCount <= 0) {
    return { ok: false, error: "Unikal açar sayı sıfırdan böyük olmalıdır." };
  }
  if (!Number.isFinite(input.avgItemSizeKb) || input.avgItemSizeKb <= 0) {
    return { ok: false, error: "Orta element ölçüsü sıfırdan böyük olmalıdır." };
  }
  if (!Number.isFinite(input.originLatencyMs) || input.originLatencyMs < 0) {
    return { ok: false, error: "Mənbədən oxuma gecikməsi mənfi ola bilməz." };
  }
  if (!Number.isFinite(input.cacheLatencyMs) || input.cacheLatencyMs < 0) {
    return { ok: false, error: "Keşdən oxuma gecikməsi mənfi ola bilməz." };
  }

  let capacityItems: number;
  if (input.sizeMode === "items") {
    if (!Number.isFinite(input.cacheSizeItems) || input.cacheSizeItems < 0) {
      return { ok: false, error: "Keş ölçüsü (element) mənfi ola bilməz." };
    }
    capacityItems = Math.floor(input.cacheSizeItems);
  } else {
    if (!Number.isFinite(input.cacheSizeMb) || input.cacheSizeMb < 0) {
      return { ok: false, error: "Keş ölçüsü (MB) mənfi ola bilməz." };
    }
    capacityItems = Math.floor((input.cacheSizeMb * 1024) / input.avgItemSizeKb);
  }

  const effectiveCapacityItems = Math.max(0, Math.min(capacityItems, input.uniqueKeyCount));

  const hitRatio =
    input.model === "uniform"
      ? uniformHitRatio(input.requestCount, input.uniqueKeyCount, effectiveCapacityItems)
      : zipfHitRatio(input.uniqueKeyCount, effectiveCapacityItems);

  const missRatio = 1 - hitRatio;
  const avgLatencyMs = hitRatio * input.cacheLatencyMs + missRatio * input.originLatencyMs;

  const originRequestsBefore = input.requestCount;
  const originRequestsAfter = input.requestCount * missRatio;
  const originLoadReductionPercent = hitRatio * 100;

  const memoryForAllUniqueKb = input.uniqueKeyCount * input.avgItemSizeKb;

  return {
    ok: true,
    capacityItems,
    effectiveCapacityItems,
    hitRatio,
    missRatio,
    avgLatencyMs,
    originRequestsBefore,
    originRequestsAfter,
    originLoadReductionPercent,
    memoryForAllUniqueKb,
    model: input.model,
  };
}

export const DEFAULT_CACHE_INPUT: CacheInput = {
  requestCount: 1_000_000,
  uniqueKeyCount: 50_000,
  sizeMode: "items",
  cacheSizeItems: 20_000,
  cacheSizeMb: 512,
  avgItemSizeKb: 10,
  originLatencyMs: 80,
  cacheLatencyMs: 2,
  ttlSeconds: 300,
  model: "uniform",
};
