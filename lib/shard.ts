/**
 * Shard and replica planning: given how much data exists today, how fast it
 * grows, and what one shard can hold, how many shards are needed now and at
 * one/two/three years out — and, the tool's actual point, what changing that
 * shard count costs.
 *
 * Growth is capped by `retentionDays`: the model assumes data older than the
 * retention window is dropped (a rolling TTL store — logs, events, metrics,
 * sessions), so the stored volume grows linearly only until the retention
 * window is full and then plateaus at `dailyGrowthGb * retentionDays` above
 * the starting volume. A store that keeps everything forever does not fit
 * this model — the tool says so in its own copy rather than silently
 * mislabelling an unbounded projection as bounded.
 *
 * The rebalancing half is a deterministic simulation, not a formula copied
 * from a table: `key-0 .. key-(n-1)` are hashed with a hand-rolled FNV-1a and
 * routed two ways — `hash % N` (naive) and a hash ring built from virtual
 * nodes (consistent hashing) — once against the old shard count and once
 * against the new one. The fraction that lands on a different shard is
 * counted directly, not looked up. This is checkable against theory rather
 * than only against itself: when the old and new shard counts are coprime
 * (12 and 13 are), naive `hash % N` has a closed form — exactly
 * `1 − 1/max(N, N′)` of keys move, by the Chinese remainder theorem — which
 * is what the known-answer test in this tool's check file compares the
 * simulation to.
 */

export type ShardPlanInput = {
  totalDataGb: number;
  dailyGrowthGb: number;
  shardCapacityGb: number;
  /** Total copies of every shard, primary included — 1 means no replication. */
  replicaCount: number;
  retentionDays: number;
};

export type ShardProjection = {
  label: string;
  days: number;
  dataGb: number;
  shardsNeeded: number;
  /** `dataGb * replicaCount` — what the fleet actually stores. */
  totalDiskGb: number;
  avgLoadPerShardGb: number;
};

export type ShardPlanResult =
  | { ok: true; projections: ShardProjection[] }
  | { ok: false; error: string };

const PROJECTION_POINTS: { label: string; days: number }[] = [
  { label: "indi", days: 0 },
  { label: "1 ildən sonra", days: 365 },
  { label: "2 ildən sonra", days: 730 },
  { label: "3 ildən sonra", days: 1095 },
];

/** Linear growth up to the retention window, flat after it — the rolling-TTL assumption documented above. */
function dataVolumeAtDay(base: number, dailyGrowth: number, day: number, retentionDays: number): number {
  return base + dailyGrowth * Math.min(day, retentionDays);
}

export function planShards(input: ShardPlanInput): ShardPlanResult {
  if (!Number.isFinite(input.totalDataGb) || input.totalDataGb < 0) {
    return { ok: false, error: "Ümumi verilən həcmi mənfi ola bilməz." };
  }
  if (!Number.isFinite(input.dailyGrowthGb) || input.dailyGrowthGb < 0) {
    return { ok: false, error: "Gündəlik artım mənfi ola bilməz." };
  }
  if (!Number.isFinite(input.shardCapacityGb) || input.shardCapacityGb <= 0) {
    return { ok: false, error: "Bir şardın tutumu sıfırdan böyük olmalıdır." };
  }
  if (!Number.isInteger(input.replicaCount) || input.replicaCount < 1) {
    return { ok: false, error: "Replika sayı 1 və ya daha böyük tam ədəd olmalıdır." };
  }
  if (!Number.isFinite(input.retentionDays) || input.retentionDays <= 0) {
    return { ok: false, error: "Saxlama müddəti sıfırdan böyük olmalıdır." };
  }

  const projections = PROJECTION_POINTS.map(({ label, days }) => {
    const dataGb = dataVolumeAtDay(input.totalDataGb, input.dailyGrowthGb, days, input.retentionDays);
    const shardsNeeded = Math.max(1, Math.ceil(dataGb / input.shardCapacityGb));
    return {
      label,
      days,
      dataGb,
      shardsNeeded,
      totalDiskGb: dataGb * input.replicaCount,
      avgLoadPerShardGb: dataGb / shardsNeeded,
    };
  });

  return { ok: true, projections };
}

export const DEFAULT_SHARD_PLAN_INPUT: ShardPlanInput = {
  totalDataGb: 500,
  dailyGrowthGb: 2,
  shardCapacityGb: 100,
  replicaCount: 3,
  retentionDays: 90,
};

/* ---------- rebalancing: hash % N vs consistent hashing ---------- */

const VIRTUAL_NODES_PER_SHARD = 100;
const MAX_SAMPLE_KEYS = 50_000;
const MAX_SHARD_COUNT = 1000;

/** 32-bit FNV-1a. Deterministic and dependency-free — the whole simulation below only needs a stable, well-spread integer per string, not a cryptographic hash. */
function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

type RingEntry = { position: number; shard: number };

/** `shardCount * VIRTUAL_NODES_PER_SHARD` points scattered on a 32-bit ring, sorted once so ownership lookup is a binary search. */
function buildRing(shardCount: number): RingEntry[] {
  const ring: RingEntry[] = [];
  for (let shard = 0; shard < shardCount; shard++) {
    for (let vnode = 0; vnode < VIRTUAL_NODES_PER_SHARD; vnode++) {
      ring.push({ position: fnv1a32(`shard-${shard}-vnode-${vnode}`), shard });
    }
  }
  ring.sort((a, b) => a.position - b.position);
  return ring;
}

/** The shard owning `keyHash`: the first ring entry at or past it, wrapping to the first entry past the top of the ring. */
function ownerOnRing(ring: RingEntry[], keyHash: number): number {
  let low = 0;
  let high = ring.length - 1;
  if (keyHash > ring[high].position) return ring[0].shard;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (ring[mid].position < keyHash) low = mid + 1;
    else high = mid;
  }
  return ring[low].shard;
}

export type RemapInput = {
  oldShardCount: number;
  newShardCount: number;
  sampleKeyCount: number;
};

export type RemapComparison =
  | {
      ok: true;
      sampleKeyCount: number;
      modMovedCount: number;
      modMovedFraction: number;
      consistentMovedCount: number;
      consistentMovedFraction: number;
    }
  | { ok: false; error: string };

/**
 * Routes `sampleKeyCount` synthetic keys against the old and the new shard
 * count, both ways, and counts how many land on a different shard. The
 * sample is a stand-in for the real key space — under either scheme, the
 * moved *fraction* converges to the same number regardless of which keys are
 * hashed, so a few thousand samples already estimate it well; this is why the
 * tool reports a fraction, not "these particular keys move".
 */
export function compareRemapStrategies(input: RemapInput): RemapComparison {
  if (!Number.isInteger(input.oldShardCount) || input.oldShardCount < 1 || input.oldShardCount > MAX_SHARD_COUNT) {
    return { ok: false, error: `Köhnə şard sayı 1–${MAX_SHARD_COUNT} arasında tam ədəd olmalıdır.` };
  }
  if (!Number.isInteger(input.newShardCount) || input.newShardCount < 1 || input.newShardCount > MAX_SHARD_COUNT) {
    return { ok: false, error: `Yeni şard sayı 1–${MAX_SHARD_COUNT} arasında tam ədəd olmalıdır.` };
  }
  if (!Number.isInteger(input.sampleKeyCount) || input.sampleKeyCount < 1 || input.sampleKeyCount > MAX_SAMPLE_KEYS) {
    return { ok: false, error: `Nümunə açar sayı 1–${MAX_SAMPLE_KEYS} arasında tam ədəd olmalıdır (brauzerdə donmasın deyə).` };
  }

  const oldRing = buildRing(input.oldShardCount);
  const newRing = buildRing(input.newShardCount);

  let modMoved = 0;
  let consistentMoved = 0;

  for (let i = 0; i < input.sampleKeyCount; i++) {
    const keyHash = fnv1a32(`key-${i}`);

    if (keyHash % input.oldShardCount !== keyHash % input.newShardCount) modMoved++;
    if (ownerOnRing(oldRing, keyHash) !== ownerOnRing(newRing, keyHash)) consistentMoved++;
  }

  return {
    ok: true,
    sampleKeyCount: input.sampleKeyCount,
    modMovedCount: modMoved,
    modMovedFraction: modMoved / input.sampleKeyCount,
    consistentMovedCount: consistentMoved,
    consistentMovedFraction: consistentMoved / input.sampleKeyCount,
  };
}

export const DEFAULT_REMAP_INPUT: RemapInput = {
  oldShardCount: 12,
  newShardCount: 13,
  sampleKeyCount: 2000,
};
