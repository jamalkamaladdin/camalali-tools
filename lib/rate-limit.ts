/**
 * Three rate-limiting algorithms compared against one shared config, not
 * three independent ones — the same "X requests/second, burst Y, window Z"
 * limit implemented three real ways, so the visitor sees what a single
 * config *means* under each. `computeRateLimit` is the one entry point every
 * other export feeds; the smaller functions below it are exported and tested
 * on their own because each carries the one arithmetic fact this tool exists
 * to show:
 *
 * - `tokenBucketAdmit` — a bucket never grants more than its capacity at
 *   once, no matter how large the incoming spike.
 * - The fixed-window boundary burst (`windowLimit * 2`, computed inline) —
 *   a client that saves up requests can get a full window's worth right at
 *   the end of one window and a full window's worth again right at the
 *   start of the next, because the counter resets to zero at the boundary
 *   with no memory of what just happened.
 * - `slidingWindowEstimate` — the weighted-counter approximation (blend the
 *   previous window's count, discounted by how far into the current window
 *   the clock is, with the current window's count) that real gateways use
 *   instead of logging every request timestamp. At the instant the boundary
 *   is crossed it is already at the previous window's full count, so it
 *   grants nothing extra there — unlike the fixed window, which grants a
 *   second full quota.
 *
 * `buildAllowedCurve` turns all three into one time series for the widget's
 * hand-drawn chart, by evaluating closed-form functions at sampled points —
 * there is no discrete-event loop to keep in sync with the algorithms above,
 * because a client assumed to always have a request ready (saturating
 * demand) makes each algorithm's cumulative-admitted-count a closed form of
 * time.
 */

export type AlgorithmInput = {
  /** Steady-state allowed rate, requests per second — shared by all three algorithms and by the token bucket's refill rate. */
  ratePerSecond: number;
  /** Token bucket capacity — the largest instantaneous spike the bucket alone can absorb. */
  burstCapacity: number;
  windowSeconds: number;
  userCount: number;
};

export type RateLimitComputation =
  | {
      ok: true;
      windowLimit: number;
      hourlyLimit: number;
      dailyLimit: number;
      totalLoadPerSecondForUsers: number;
      tokenBucket: {
        capacity: number;
        refillRatePerSecond: number;
        emptyToFullSeconds: number;
      };
      fixedWindow: {
        windowLimit: number;
        boundaryBurstAllowed: number;
      };
      slidingWindow: {
        windowLimit: number;
        boundaryEstimate: number;
      };
      headers: {
        limit: number;
        remaining: number;
        resetSeconds: number;
        retryAfterSeconds: number;
      };
    }
  | { ok: false; error: string };

export function computeRateLimit(input: AlgorithmInput): RateLimitComputation {
  if (!Number.isFinite(input.ratePerSecond) || input.ratePerSecond <= 0) {
    return { ok: false, error: "İcazə verilən sorğu/saniyə sıfırdan böyük olmalıdır." };
  }
  if (!Number.isFinite(input.burstCapacity) || input.burstCapacity <= 0) {
    return { ok: false, error: "Partlayış ölçüsü sıfırdan böyük olmalıdır." };
  }
  if (!Number.isFinite(input.windowSeconds) || input.windowSeconds <= 0) {
    return { ok: false, error: "Pəncərə uzunluğu sıfırdan böyük olmalıdır." };
  }
  if (!Number.isInteger(input.userCount) || input.userCount < 1) {
    return { ok: false, error: "İstifadəçi sayı 1 və ya daha böyük tam ədəd olmalıdır." };
  }

  const windowLimit = Math.round(input.ratePerSecond * input.windowSeconds);
  if (windowLimit < 1) {
    return {
      ok: false,
      error: "Bu sürət və pəncərə uzunluğu ilə pəncərə həddi 0-a yuvarlaqlaşır — pəncərəni uzat və ya sürəti artır.",
    };
  }

  const emptyToFullSeconds = input.burstCapacity / input.ratePerSecond;
  const retryAfterSeconds = Math.ceil(1 / input.ratePerSecond);

  return {
    ok: true,
    windowLimit,
    hourlyLimit: input.ratePerSecond * 3600,
    dailyLimit: input.ratePerSecond * 86400,
    totalLoadPerSecondForUsers: input.ratePerSecond * input.userCount,
    tokenBucket: {
      capacity: input.burstCapacity,
      refillRatePerSecond: input.ratePerSecond,
      emptyToFullSeconds,
    },
    fixedWindow: {
      windowLimit,
      boundaryBurstAllowed: windowLimit * 2,
    },
    slidingWindow: {
      windowLimit,
      // At the instant the boundary is crossed, the previous window's weight is still 1 and the
      // current window has admitted nothing yet — the estimate already equals a full window.
      boundaryEstimate: windowLimit,
    },
    headers: {
      limit: input.burstCapacity,
      remaining: 0,
      resetSeconds: Math.ceil(emptyToFullSeconds),
      retryAfterSeconds,
    },
  };
}

export const DEFAULT_RATE_LIMIT_INPUT: AlgorithmInput = {
  ratePerSecond: 10,
  burstCapacity: 30,
  windowSeconds: 60,
  userCount: 1000,
};

/* ---------- token bucket admission for an arbitrary incoming spike ---------- */

export function tokenBucketAdmit(capacity: number, incomingBurst: number): { granted: number; rejected: number } {
  if (!Number.isFinite(capacity) || !Number.isFinite(incomingBurst)) return { granted: 0, rejected: 0 };
  const safeCapacity = Math.max(0, capacity);
  const safeIncoming = Math.max(0, incomingBurst);
  const granted = Math.min(safeCapacity, safeIncoming);
  return { granted, rejected: safeIncoming - granted };
}

/* ---------- sliding-window boundary estimate, generalised over time ---------- */

/**
 * The weighted-counter estimate at `elapsedInWindowSec` into the current
 * window: the previous window's count, discounted linearly as the clock
 * moves through the current window, plus what the current window has
 * admitted so far. `elapsedInWindowSec = 0` is the instant the boundary is
 * crossed — the previous window still counts in full.
 */
export function slidingWindowEstimate(
  previousWindowCount: number,
  currentWindowCount: number,
  elapsedInWindowSec: number,
  windowSeconds: number,
): number {
  const previousWeight = Math.max(0, 1 - elapsedInWindowSec / windowSeconds);
  return previousWindowCount * previousWeight + currentWindowCount;
}

/* ---------- the "allowed over time" curve, one closed form per algorithm ---------- */

export type AllowedCurvePoint = { t: number; fixed: number; sliding: number; tokenBucket: number };

function fixedWindowCumulativeAt(t: number, windowSeconds: number, windowLimit: number): number {
  const windowIndex = Math.floor(t / windowSeconds);
  return (windowIndex + 1) * windowLimit;
}

/** Saturates to a full window immediately when there is no previous window (first window); ramps linearly across the second window, from `windowLimit` up to `2 * windowLimit`, once there is one. */
function slidingWindowCumulativeAt(t: number, windowSeconds: number, windowLimit: number): number {
  if (t < windowSeconds) return windowLimit;
  const elapsed = Math.min(windowSeconds, t - windowSeconds);
  return windowLimit * (1 + elapsed / windowSeconds);
}

function tokenBucketCumulativeAt(t: number, capacity: number, refillRatePerSecond: number): number {
  return capacity + refillRatePerSecond * t;
}

/**
 * Samples cumulative requests admitted under a saturating client (always has
 * a request ready) across two window lengths, so the chart shows one full
 * boundary crossing. Every algorithm is evaluated with the closed forms
 * above, not simulated tick by tick.
 */
export function buildAllowedCurve(
  input: { windowSeconds: number; windowLimit: number; tokenBucketCapacity: number; refillRatePerSecond: number },
  steps = 40,
): AllowedCurvePoint[] {
  const totalSpan = input.windowSeconds * 2;
  const points: AllowedCurvePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (totalSpan * i) / steps;
    points.push({
      t,
      fixed: fixedWindowCumulativeAt(t, input.windowSeconds, input.windowLimit),
      sliding: slidingWindowCumulativeAt(t, input.windowSeconds, input.windowLimit),
      tokenBucket: tokenBucketCumulativeAt(t, input.tokenBucketCapacity, input.refillRatePerSecond),
    });
  }
  return points;
}
