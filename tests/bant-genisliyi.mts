/*
 * What is worth checking here: the exact known-answer pair the spec quotes
 * (1 GB over 100 Mbit/s), the bit/byte factor of 8 in both directions, that
 * `MB` and `MiB` are genuinely different numbers rather than the same one
 * spelled two ways, a round trip through "solve for bandwidth" and back to
 * "solve for time" landing on the input it started from, an overhead
 * percentage reducing the usable figure by exactly the stated fraction, a
 * duration that crosses both the hour and the day boundary, and the three
 * ways a visitor's input can be wrong — zero, negative, absurdly large —
 * each coming back as a named Azerbaijani sentence rather than `Infinity`,
 * `NaN` or a thrown exception.
 */
import type { CheckSuite } from "./harness.mts";
import {
  bandwidthToBitsPerSecond,
  bitsPerSecondToBandwidth,
  calculateTransfer,
  MAX_BANDWIDTH_BPS,
  OVERHEAD_PRESETS,
  parseAmount,
  sizeToBytes,
} from "../lib/bant-genisliyi";
import { formatDuration } from "../shared/az-date";

function near(actual: number, expected: number, tolerance = 1e-9): boolean {
  if (expected === 0) return Math.abs(actual) <= tolerance;
  return Math.abs(actual - expected) / Math.abs(expected) <= tolerance;
}

export const checks: CheckSuite = (check) => {
  const oneGigOverHundredMbit = calculateTransfer({
    solveFor: "time",
    sizeValue: 1,
    sizeUnit: "GB",
    bandwidthValue: 100,
    bandwidthUnit: "Mbit/s",
    timeValue: 1,
    timeUnit: "s",
    overheadPercent: 0,
  });
  check(
    "bant-genisliyi: 1 GB over 100 Mbit/s at 0% overhead is exactly 80 seconds",
    oneGigOverHundredMbit.ok === true &&
      oneGigOverHundredMbit.solveFor === "time" &&
      oneGigOverHundredMbit.theoreticalSeconds === 80,
    `got: ${JSON.stringify(oneGigOverHundredMbit)}`,
  );

  check(
    "bant-genisliyi: the bit/byte factor of 8 holds in both directions",
    bandwidthToBitsPerSecond(1, "B/s") === 8 && bitsPerSecondToBandwidth(8, "B/s") === 1,
    `B/s -> bit/s: ${bandwidthToBitsPerSecond(1, "B/s")}, 8 bit/s -> B/s: ${bitsPerSecondToBandwidth(8, "B/s")}`,
  );

  const decimalMb = sizeToBytes(1, "MB");
  const binaryMib = sizeToBytes(1, "MiB");
  check(
    "bant-genisliyi: 1 MB and 1 MiB are different, correct byte counts",
    decimalMb !== binaryMib && decimalMb === 1e6 && binaryMib === 1048576,
    `MB: ${decimalMb}, MiB: ${binaryMib}`,
  );

  const bandwidthNeeded = calculateTransfer({
    solveFor: "bandwidth",
    sizeValue: 10,
    sizeUnit: "GB",
    bandwidthValue: 1,
    bandwidthUnit: "Mbit/s",
    timeValue: 100,
    timeUnit: "s",
    overheadPercent: 0,
  });
  const roundTrippedTime =
    bandwidthNeeded.ok === true && bandwidthNeeded.solveFor === "bandwidth"
      ? calculateTransfer({
          solveFor: "time",
          sizeValue: 10,
          sizeUnit: "GB",
          bandwidthValue: bitsPerSecondToBandwidth(bandwidthNeeded.theoreticalBps, "bit/s"),
          bandwidthUnit: "bit/s",
          timeValue: 1,
          timeUnit: "s",
          overheadPercent: 0,
        })
      : null;
  check(
    "bant-genisliyi: bandwidth solved from size+time solves back to the same time",
    roundTrippedTime !== null &&
      roundTrippedTime.ok === true &&
      roundTrippedTime.solveFor === "time" &&
      near(roundTrippedTime.theoreticalSeconds, 100),
    `bandwidth: ${JSON.stringify(bandwidthNeeded)}, round trip: ${JSON.stringify(roundTrippedTime)}`,
  );

  const overheadCase = calculateTransfer({
    solveFor: "size",
    bandwidthValue: 100,
    bandwidthUnit: "Mbit/s",
    timeValue: 10,
    timeUnit: "s",
    sizeValue: 1,
    sizeUnit: "GB",
    overheadPercent: 25,
  });
  check(
    "bant-genisliyi: a 25% overhead reduces the transferable size to exactly 75% of the theoretical figure",
    overheadCase.ok === true &&
      overheadCase.solveFor === "size" &&
      near(overheadCase.realisticBytes, overheadCase.theoreticalBytes * 0.75),
    `got: ${JSON.stringify(overheadCase)}`,
  );

  const dayHourBoundary = calculateTransfer({
    solveFor: "time",
    sizeValue: 11.25,
    sizeUnit: "GB",
    bandwidthValue: 1,
    bandwidthUnit: "Mbit/s",
    timeValue: 1,
    timeUnit: "s",
    overheadPercent: 0,
  });
  const dayHourFormatted =
    dayHourBoundary.ok === true && dayHourBoundary.solveFor === "time"
      ? formatDuration(dayHourBoundary.theoreticalSeconds)
      : null;
  check(
    "bant-genisliyi: a duration crossing the day and hour boundary (90 000 s) formats as '1 gün 1 saat'",
    dayHourBoundary.ok === true &&
      dayHourBoundary.solveFor === "time" &&
      dayHourBoundary.theoreticalSeconds === 90000 &&
      dayHourFormatted === "1 gün 1 saat",
    `got: ${JSON.stringify(dayHourBoundary)}, formatted: ${dayHourFormatted}`,
  );

  const zeroBandwidth = calculateTransfer({
    solveFor: "time",
    sizeValue: 1,
    sizeUnit: "GB",
    bandwidthValue: 0,
    bandwidthUnit: "Mbit/s",
    timeValue: 1,
    timeUnit: "s",
    overheadPercent: 0,
  });
  check(
    "bant-genisliyi: zero bandwidth is a named error, not Infinity",
    zeroBandwidth.ok === false && zeroBandwidth.error.length > 0,
    `got: ${JSON.stringify(zeroBandwidth)}`,
  );

  const negativeSize = calculateTransfer({
    solveFor: "time",
    sizeValue: -5,
    sizeUnit: "GB",
    bandwidthValue: 100,
    bandwidthUnit: "Mbit/s",
    timeValue: 1,
    timeUnit: "s",
    overheadPercent: 0,
  });
  check(
    "bant-genisliyi: a negative size is a named error",
    negativeSize.ok === false && negativeSize.error.length > 0,
    `got: ${JSON.stringify(negativeSize)}`,
  );

  const absurdBandwidth = calculateTransfer({
    solveFor: "time",
    sizeValue: 1,
    sizeUnit: "GB",
    bandwidthValue: 1e30,
    bandwidthUnit: "Gbit/s",
    timeValue: 1,
    timeUnit: "s",
    overheadPercent: 0,
  });
  check(
    "bant-genisliyi: an absurdly large bandwidth states the ceiling instead of computing a garbage figure",
    absurdBandwidth.ok === false &&
      !absurdBandwidth.error.includes("Infinity") &&
      !absurdBandwidth.error.includes("NaN") &&
      absurdBandwidth.error.includes("Tbit/s") &&
      MAX_BANDWIDTH_BPS === 1e14,
    `got: ${JSON.stringify(absurdBandwidth)}, ceiling: ${MAX_BANDWIDTH_BPS}`,
  );

  check(
    "bant-genisliyi: an empty field and a non-numeric field are both rejected, a valid one is not",
    parseAmount("").error !== null &&
      parseAmount("abc").error !== null &&
      parseAmount("12,5").value === 12.5 &&
      parseAmount("12,5").error === null,
    `empty: ${JSON.stringify(parseAmount(""))}, word: ${JSON.stringify(parseAmount("abc"))}, valid: ${JSON.stringify(parseAmount("12,5"))}`,
  );

  check(
    "bant-genisliyi: the named overhead presets carry the spec's own percentages",
    OVERHEAD_PRESETS.find((p) => p.id === "raw")?.percent === 0 &&
      OVERHEAD_PRESETS.find((p) => p.id === "tcp-ipv4")?.percent === 3.2 &&
      OVERHEAD_PRESETS.find((p) => p.id === "tcp-ipv6")?.percent === 4.2,
    `got: ${JSON.stringify(OVERHEAD_PRESETS)}`,
  );
};
