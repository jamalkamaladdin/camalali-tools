/**
 * Queueing theory, exact rather than simulated: given an arrival rate, a
 * service time and a server count, what M/M/1 or M/M/c predicts for queue
 * length and wait — and, just as importantly, when it predicts nothing at
 * all, because the queue is unstable.
 *
 * `c === 1` is solved with the closed-form M/M/1 formulas directly.
 * `c > 1` goes through the Erlang C formula (`erlangCWaitProbability`),
 * computed as a running ratio (`term = term * a / k`) rather than as
 * `a**k / factorial(k)`: the two are mathematically the same number, but the
 * factorial form overflows a 64-bit float well before `c` reaches 200, and
 * the ratio form does not. `erlangCWaitProbability` is exported and tested
 * on its own for exactly that reason — it is the one piece of arithmetic
 * here that is not obvious from reading it.
 *
 * Every result satisfies Little's law (`L = λW`) by construction rather than
 * by coincidence: `L` below is always computed as `lambda * W`, never
 * derived independently, so the two can never quietly disagree.
 *
 * `ρ ≥ 1` is refused rather than answered: the queue has no steady state, so
 * "the average wait" is not a number, it is "forever and growing". Returning
 * `Infinity` would print as a value; this returns `stable: false` instead,
 * and the widget is required to say so in words rather than in a stat tile.
 */

export type QueueInput = {
  /** λ — arrivals per second. */
  arrivalRate: number;
  /** Time one server spends on one request, in ms — service time is 1/µ. */
  serviceTimeMs: number;
  servers: number;
};

export type QueueComputation =
  | {
      ok: true;
      stable: true;
      rho: number;
      /** Average number waiting in the queue, not counting those being served. */
      queueLength: number;
      /** Average number in the system, queue plus those being served — always `arrivalRate * waitTimeSec`. */
      systemLength: number;
      /** Average wait in the queue before service starts, in seconds. */
      queueWaitSec: number;
      /** Average total time in the system, queue plus service, in seconds — Little's law applied to the whole system. */
      systemTimeSec: number;
      servers: number;
    }
  | { ok: true; stable: false; rho: number; reason: string }
  | { ok: false; error: string };

/**
 * P(an arriving request must wait), via the running-ratio form of Erlang C.
 * `a` is the offered load in Erlangs (`arrivalRate / serviceRate`); the
 * queue is stable only when `a < servers`, which the caller must already
 * have checked — this function assumes it.
 */
export function erlangCWaitProbability(servers: number, offeredLoad: number): number {
  let term = 1; // a^0 / 0!
  let sum = 1; // Σ term for k = 0..servers-1
  for (let k = 1; k < servers; k++) {
    term = (term * offeredLoad) / k;
    sum += term;
  }
  const termAtC = (term * offeredLoad) / servers; // a^servers / servers!
  const rho = offeredLoad / servers;
  const erlangTerm = termAtC / (1 - rho);
  const p0 = 1 / (sum + erlangTerm);
  return erlangTerm * p0;
}

export function computeQueue(input: QueueInput): QueueComputation {
  if (!Number.isFinite(input.arrivalRate) || input.arrivalRate <= 0) {
    return { ok: false, error: "Gəliş sürəti sıfırdan böyük olmalıdır." };
  }
  if (!Number.isFinite(input.serviceTimeMs) || input.serviceTimeMs <= 0) {
    return { ok: false, error: "Xidmət vaxtı sıfırdan böyük olmalıdır." };
  }
  if (!Number.isInteger(input.servers) || input.servers < 1) {
    return { ok: false, error: "Server sayı 1 və ya daha böyük tam ədəd olmalıdır." };
  }

  const serviceRate = 1000 / input.serviceTimeMs; // µ, requests/sec one server absorbs
  const offeredLoad = input.arrivalRate / serviceRate; // a = λ/µ, in Erlangs
  const rho = offeredLoad / input.servers;

  if (rho >= 1) {
    return {
      ok: true,
      stable: false,
      rho,
      reason:
        rho === 1
          ? "Gəliş sürəti tam tutum qədərdir (ρ = 1) — növbə sabitləşmir, sonsuza doğru böyüyür."
          : "Gəliş sürəti tutumdan yüksəkdir (ρ > 1) — sistem heç vaxt sabitləşmir, növbə sonsuza gedir.",
    };
  }

  let queueLength: number;

  if (input.servers === 1) {
    queueLength = (rho * rho) / (1 - rho);
  } else {
    const pWait = erlangCWaitProbability(input.servers, offeredLoad);
    queueLength = (pWait * rho) / (1 - rho);
  }

  const queueWaitSec = queueLength / input.arrivalRate;
  const systemTimeSec = queueWaitSec + 1 / serviceRate;
  const systemLength = input.arrivalRate * systemTimeSec; // Little's law, L = λW

  return {
    ok: true,
    stable: true,
    rho,
    queueLength,
    systemLength,
    queueWaitSec,
    systemTimeSec,
    servers: input.servers,
  };
}

/**
 * Points for the hand-drawn ρ→queue-length curve: the classic M/M/1
 * `Lq = ρ² / (1 − ρ)` shape, independent of any particular λ/µ, sampled from
 * `0.05` to `cap` and stopped short of `1` on purpose — the curve's whole
 * point is what happens approaching the wall, not a value at it.
 */
export function queueLengthCurve(step = 0.02, cap = 0.98): { rho: number; queueLength: number }[] {
  const points: { rho: number; queueLength: number }[] = [];
  for (let rho = 0.05; rho <= cap + 1e-9; rho += step) {
    const clamped = Math.min(rho, cap);
    points.push({ rho: clamped, queueLength: (clamped * clamped) / (1 - clamped) });
  }
  return points;
}

export const DEFAULT_QUEUE_INPUT: QueueInput = {
  arrivalRate: 8,
  serviceTimeMs: 100,
  servers: 1,
};
