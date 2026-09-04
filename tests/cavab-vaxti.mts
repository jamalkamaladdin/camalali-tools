/*
 * What is worth checking: the median is taken per phase (not per total), the
 * reported total is exactly the sum of those medians so the bar chart's
 * segments always add up, the heaviest phase is picked deterministically
 * (including the all-zero tie), the diagnosis text matches the phase that is
 * actually dominant, and malformed input comes back as an error rather than
 * throwing or producing NaN.
 */
import type { CheckSuite } from "./harness.mts";
import { buildBreakdown, type PhaseSample } from "../lib/cavab-vaxti";

function sample(dnsMs: number, tcpMs: number, tlsMs: number, ttfbMs: number): PhaseSample {
  return { dnsMs, tcpMs, tlsMs, ttfbMs, totalMs: dnsMs + tcpMs + tlsMs + ttfbMs };
}

export const checks: CheckSuite = (check) => {
  const identical = buildBreakdown([sample(10, 20, 30, 40), sample(10, 20, 30, 40), sample(10, 20, 30, 40)]);
  check(
    "cavab-vaxti: three identical samples median to the same sample",
    identical.ok &&
      identical.breakdown.median.dnsMs === 10 &&
      identical.breakdown.median.ttfbMs === 40 &&
      identical.breakdown.median.totalMs === 100,
    `got: ${JSON.stringify(identical)}`,
  );

  const outlier = buildBreakdown([sample(10, 100, 10, 10), sample(10, 20, 10, 10), sample(10, 30, 10, 10)]);
  check(
    "cavab-vaxti: an out-of-order value is sorted before the median is taken",
    outlier.ok && outlier.breakdown.median.tcpMs === 30,
    `got: ${JSON.stringify(outlier)}`,
  );

  const summed = buildBreakdown([sample(5, 5, 5, 5), sample(9, 9, 9, 9), sample(20, 20, 20, 20)]);
  check(
    "cavab-vaxti: the median total equals the sum of the four medians, not the median of the three totals",
    summed.ok && summed.breakdown.median.totalMs === summed.breakdown.median.dnsMs + summed.breakdown.median.tcpMs + summed.breakdown.median.tlsMs + summed.breakdown.median.ttfbMs,
    `got: ${JSON.stringify(summed)}`,
  );

  const shareSum = buildBreakdown([sample(20, 30, 10, 40), sample(20, 30, 10, 40), sample(20, 30, 10, 40)]);
  const shareTotal = shareSum.ok ? shareSum.breakdown.shares.reduce((total, entry) => total + entry.share, 0) : 0;
  check(
    "cavab-vaxti: the four shares add up to 1",
    shareSum.ok && Math.abs(shareTotal - 1) < 1e-9,
    `got: ${shareTotal}`,
  );

  const tlsHeavy = buildBreakdown([sample(5, 5, 200, 5), sample(5, 5, 200, 5), sample(5, 5, 200, 5)]);
  check(
    "cavab-vaxti: a dominant TLS phase is both named heaviest and named in the diagnosis",
    tlsHeavy.ok && tlsHeavy.breakdown.heaviest === "tls" && tlsHeavy.breakdown.diagnosis.includes("TLS"),
    `got: ${JSON.stringify(tlsHeavy)}`,
  );

  const balanced = buildBreakdown([sample(25, 25, 25, 25), sample(25, 25, 25, 25), sample(25, 25, 25, 25)]);
  check(
    "cavab-vaxti: four equal phases produce the balanced diagnosis, not a phase-specific one",
    balanced.ok && balanced.breakdown.diagnosis.includes("bərabər"),
    `got: ${JSON.stringify(balanced)}`,
  );

  const allZero = buildBreakdown([sample(0, 0, 0, 0), sample(0, 0, 0, 0), sample(0, 0, 0, 0)]);
  check(
    "cavab-vaxti: an all-zero measurement does not throw or produce NaN shares, and ties break to dns",
    allZero.ok && allZero.breakdown.heaviest === "dns" && allZero.breakdown.shares.every((entry) => entry.share === 0),
    `got: ${JSON.stringify(allZero)}`,
  );

  const empty = buildBreakdown([]);
  check(
    "cavab-vaxti: an empty sample list is an error, not a thrown exception",
    empty.ok === false && typeof empty.error === "string" && empty.error.length > 0,
    `got: ${JSON.stringify(empty)}`,
  );

  const negative = buildBreakdown([sample(-5, 5, 5, 5)]);
  check(
    "cavab-vaxti: a negative phase time is refused as malformed input",
    negative.ok === false,
    `got: ${JSON.stringify(negative)}`,
  );

  const single = buildBreakdown([sample(12, 34, 56, 78)]);
  check(
    "cavab-vaxti: a single sample medians to itself",
    single.ok && single.breakdown.median.tcpMs === 34,
    `got: ${JSON.stringify(single)}`,
  );

  const tie = buildBreakdown([sample(50, 50, 10, 10), sample(50, 50, 10, 10), sample(50, 50, 10, 10)]);
  check(
    "cavab-vaxti: a tie between dns and tcp breaks to dns, the earlier phase in the fixed order",
    tie.ok && tie.breakdown.heaviest === "dns",
    `got: ${JSON.stringify(tie)}`,
  );
};
