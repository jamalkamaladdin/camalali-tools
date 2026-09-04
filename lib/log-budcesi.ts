/**
 * Log volume budgeting: turning "N requests/second, M log lines per request,
 * K bytes per line" into GB/day, GB/month, and what a retention window,
 * compression and index overhead actually cost in disk — plus the two levers
 * an operator reaches for first when a log bill is too high: sampling and
 * dropping DEBUG.
 *
 * `computeLogBudget` runs every raw figure through the same pipeline —
 * retention window, then compression, then index overhead, then replicas —
 * and `debugSavingsGbOverRetention` is built by running the DEBUG-only slice
 * through that identical pipeline rather than by a separate estimate. That
 * is why `debugSavingsGbOverRetention` always equals
 * `totalWithReplicasGb * (levelPercents.DEBUG / 100)` exactly: both numbers
 * are linear in the DEBUG share of the raw stream, so scaling one by that
 * share can never disagree with computing the other from scratch. The check
 * file tests that identity directly, which is a stronger proof than
 * re-deriving the formula in the test.
 *
 * `captureProbabilityAtLeastOne` answers the sampling question in exact
 * terms rather than a rule of thumb: if a rare event happens `k` times in
 * the retention window and each occurrence is sampled independently with
 * probability `p`, the chance at least one of the `k` occurrences survives
 * sampling is `1 − (1 − p)^k` — not `p`. At 1% sampling a single occurrence
 * has a 1% chance of survival, but ten independent occurrences of the same
 * rare event already reach ~9.6%, which is the number worth putting in front
 * of someone about to turn sampling down to save disk.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type LogBudgetInput = {
  requestsPerSecond: number;
  linesPerRequest: number;
  avgLineBytes: number;
  retentionDays: number;
  /** Raw-to-stored ratio: 6 means the compressed stream is 1/6 of the raw stream. */
  compressionRatio: number;
  /** Percent added on top of the compressed size by the index (typical of a search-oriented store). */
  indexOverheadPercent: number;
  replicaCount: number;
  levelPercents: Record<LogLevel, number>;
};

export type LogBudgetComputation =
  | {
      ok: true;
      linesPerSecond: number;
      rawGbPerDay: number;
      rawGbPerMonth: number;
      rawGbOverRetention: number;
      compressedGbOverRetention: number;
      indexedGbOverRetention: number;
      totalWithReplicasGb: number;
      levelGbPerDay: Record<LogLevel, number>;
      /** What turning DEBUG off entirely would save, after the same retention → compression → index → replica pipeline. */
      debugSavingsGbOverRetention: number;
    }
  | { ok: false; error: string };

const BYTES_PER_GB = 1024 ** 3;
const SECONDS_PER_DAY = 86400;
/** A calendar-month approximation, stated here rather than left implicit — the tool's own copy repeats this. */
const DAYS_PER_MONTH = 30;
const LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];

function levelPercentSum(levels: Record<LogLevel, number>): number {
  return LEVELS.reduce((sum, level) => sum + levels[level], 0);
}

export function computeLogBudget(input: LogBudgetInput): LogBudgetComputation {
  if (!Number.isFinite(input.requestsPerSecond) || input.requestsPerSecond <= 0) {
    return { ok: false, error: "Sorğu/saniyə sıfırdan böyük olmalıdır." };
  }
  if (!Number.isFinite(input.linesPerRequest) || input.linesPerRequest <= 0) {
    return { ok: false, error: "Bir sorğuya düşən jurnal sətri sıfırdan böyük olmalıdır." };
  }
  if (!Number.isFinite(input.avgLineBytes) || input.avgLineBytes <= 0) {
    return { ok: false, error: "Orta sətir ölçüsü sıfırdan böyük olmalıdır." };
  }
  if (!Number.isFinite(input.retentionDays) || input.retentionDays <= 0) {
    return { ok: false, error: "Saxlama müddəti sıfırdan böyük olmalıdır." };
  }
  if (!Number.isFinite(input.compressionRatio) || input.compressionRatio < 1) {
    return { ok: false, error: "Sıxılma nisbəti 1 və ya daha böyük olmalıdır (1 = sıxılmır)." };
  }
  if (!Number.isFinite(input.indexOverheadPercent) || input.indexOverheadPercent < 0) {
    return { ok: false, error: "İndeks əlavə yükü mənfi ola bilməz." };
  }
  if (!Number.isInteger(input.replicaCount) || input.replicaCount < 1) {
    return { ok: false, error: "Replika sayı 1 və ya daha böyük tam ədəd olmalıdır." };
  }
  for (const level of LEVELS) {
    const value = input.levelPercents[level];
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, error: `${level} səviyyəsinin faizi mənfi ola bilməz.` };
    }
  }
  const sum = levelPercentSum(input.levelPercents);
  if (Math.abs(sum - 100) > 0.01) {
    return { ok: false, error: `Səviyyə faizlərinin cəmi 100 olmalıdır (indi ${sum.toFixed(1)}).` };
  }

  const linesPerSecond = input.requestsPerSecond * input.linesPerRequest;
  const rawBytesPerSecond = linesPerSecond * input.avgLineBytes;
  const rawGbPerDay = (rawBytesPerSecond * SECONDS_PER_DAY) / BYTES_PER_GB;
  const rawGbPerMonth = rawGbPerDay * DAYS_PER_MONTH;
  const rawGbOverRetention = rawGbPerDay * input.retentionDays;
  const compressedGbOverRetention = rawGbOverRetention / input.compressionRatio;
  const indexedGbOverRetention = compressedGbOverRetention * (1 + input.indexOverheadPercent / 100);
  const totalWithReplicasGb = indexedGbOverRetention * input.replicaCount;

  const levelGbPerDay = Object.fromEntries(
    LEVELS.map((level) => [level, rawGbPerDay * (input.levelPercents[level] / 100)]),
  ) as Record<LogLevel, number>;

  const debugRawOverRetention = levelGbPerDay.DEBUG * input.retentionDays;
  const debugCompressed = debugRawOverRetention / input.compressionRatio;
  const debugIndexed = debugCompressed * (1 + input.indexOverheadPercent / 100);
  const debugSavingsGbOverRetention = debugIndexed * input.replicaCount;

  return {
    ok: true,
    linesPerSecond,
    rawGbPerDay,
    rawGbPerMonth,
    rawGbOverRetention,
    compressedGbOverRetention,
    indexedGbOverRetention,
    totalWithReplicasGb,
    levelGbPerDay,
    debugSavingsGbOverRetention,
  };
}

export const DEFAULT_LOG_BUDGET_INPUT: LogBudgetInput = {
  requestsPerSecond: 500,
  linesPerRequest: 3,
  avgLineBytes: 220,
  retentionDays: 30,
  compressionRatio: 6,
  indexOverheadPercent: 25,
  replicaCount: 2,
  levelPercents: { DEBUG: 55, INFO: 35, WARN: 8, ERROR: 2 },
};

/* ---------- sampling ---------- */

export type SamplingComputation =
  | { ok: true; samplingPercent: number; volumeGb: number; volumeReductionPercent: number; captureProbabilitySingleEvent: number }
  | { ok: false; error: string };

/** The raw (pre-compression) retention-window volume at a given sampling percent — sampling is applied to the incoming stream, before compression and indexing ever see it. */
export function computeSamplingImpact(rawGbOverRetention: number, samplingPercent: number): SamplingComputation {
  if (!Number.isFinite(rawGbOverRetention) || rawGbOverRetention < 0) {
    return { ok: false, error: "Xam həcm mənfi ola bilməz." };
  }
  if (!Number.isFinite(samplingPercent) || samplingPercent <= 0 || samplingPercent > 100) {
    return { ok: false, error: "Nümunələmə faizi 0-dan böyük və 100-dən kiçik və ya bərabər olmalıdır." };
  }
  const fraction = samplingPercent / 100;
  return {
    ok: true,
    samplingPercent,
    volumeGb: rawGbOverRetention * fraction,
    volumeReductionPercent: (1 - fraction) * 100,
    captureProbabilitySingleEvent: fraction,
  };
}

/**
 * `1 − (1 − p)^k`: the probability at least one of `k` independent
 * occurrences of a rare event survives sampling at rate `p`. Clamped rather
 * than validated with an error, because it is a display-only helper fed by
 * values the caller already validated elsewhere (a sampling percent from
 * `computeSamplingImpact`, an occurrence count from a bounded selector) —
 * it never receives raw, unchecked visitor text directly.
 */
export function captureProbabilityAtLeastOne(samplingPercent: number, occurrenceCount: number): number {
  if (!Number.isFinite(samplingPercent) || !Number.isFinite(occurrenceCount)) return 0;
  const fraction = Math.min(1, Math.max(0, samplingPercent / 100));
  const count = Math.max(0, Math.floor(occurrenceCount));
  return 1 - Math.pow(1 - fraction, count);
}

export const SAMPLING_PRESETS = [1, 10, 50] as const;
