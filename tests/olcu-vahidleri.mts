/*
 * What is worth checking here is the arithmetic nobody can eyeball: that a
 * gibibyte is exactly 1 073 741 824 bytes rather than nearly that, that a
 * terabyte disk really does read as 931 GiB, that every unit survives a round
 * trip through the base unit, and that the four inputs a visitor can type
 * wrong — nothing, a word, a negative number, infinity — produce a sentence
 * instead of a crash or a NaN on the screen.
 *
 * The uptime cases pin the year at 365 days. Calculators that use 365,25 print
 * 8 saat 45 dəq 58 san for 99,9% where this prints 8 saat 45 dəq 36 san; the
 * difference is the leap-year quarter and the tool states its own convention
 * on the page, so the number checked here is the one the copy promises.
 */
import type { CheckSuite } from "./harness.mts";
import { auditReference, filterReference } from "../lib/reference";
import {
  binaryGapPercent,
  BYTE_UNITS,
  convertBytes,
  convertSpeed,
  convertTime,
  formatAmount,
  fromBytes,
  humanDuration,
  olcuRows,
  olcuSections,
  parseAmount,
  SPEED_UNITS,
  TIME_UNITS,
  toBytes,
  transferSeconds,
  uptimeBudget,
} from "../lib/olcu-vahidleri";

/** Relative closeness, so a check on 1e12 is not stricter than one on 12,5. */
function near(actual: number, expected: number, tolerance = 1e-9): boolean {
  if (expected === 0) return Math.abs(actual) <= tolerance;
  return Math.abs(actual - expected) / Math.abs(expected) <= tolerance;
}

const MINIMUM_ROWS = 35;

export const checks: CheckSuite = (check) => {
  /* ---------- volume ---------- */

  check(
    "olcu-vahidleri: a decimal gigabyte is exactly 1e9 bytes",
    toBytes(1, "GB") === 1e9,
    `got: ${toBytes(1, "GB")}`,
  );

  check(
    "olcu-vahidleri: a binary gibibyte is exactly 1 073 741 824 bytes",
    toBytes(1, "GiB") === 1073741824,
    `got: ${toBytes(1, "GiB")}`,
  );

  check(
    "olcu-vahidleri: one bit is exactly an eighth of a byte and eight bits are exactly one",
    toBytes(1, "bit") === 0.125 && toBytes(8, "bit") === 1,
    `got: ${toBytes(1, "bit")} and ${toBytes(8, "bit")}`,
  );

  const terabyte = convertBytes(1, "TB");
  check(
    "olcu-vahidleri: a 1 TB disk reads as 931,32 GiB — the number the operating system shows",
    Math.abs(terabyte.GiB - 931.32) < 0.01,
    `got: ${terabyte.GiB}`,
  );

  const roundTripValue = 3.7;
  const brokenRoundTrips = BYTE_UNITS.filter(
    (unit) => !near(fromBytes(toBytes(roundTripValue, unit), unit), roundTripValue),
  );
  check(
    "olcu-vahidleri: every byte unit survives a round trip through bytes",
    brokenRoundTrips.length === 0,
    `broken: ${brokenRoundTrips.join(", ")}`,
  );

  check(
    "olcu-vahidleri: the GB/GiB gap is the 7,4% the copy claims, computed and not typed",
    Math.abs(binaryGapPercent("GB", "GiB") - 7.374) < 0.001,
    `got: ${binaryGapPercent("GB", "GiB")}`,
  );

  check(
    "olcu-vahidleri: a bit expressed in every unit stays a finite number",
    BYTE_UNITS.every((unit) => Number.isFinite(convertBytes(1, "bit")[unit])),
    `got: ${JSON.stringify(convertBytes(1, "bit"))}`,
  );

  /* ---------- speed ---------- */

  check(
    "olcu-vahidleri: 100 Mbit/s is 12,5 MB/s — the eight-bit question the tool exists for",
    convertSpeed(100, "Mbit/s")["MB/s"] === 12.5,
    `got: ${convertSpeed(100, "Mbit/s")["MB/s"]}`,
  );

  check(
    "olcu-vahidleri: a gigabit per second is a thousand megabits and 125 megabytes",
    convertSpeed(1, "Gbit/s")["Mbit/s"] === 1000 && convertSpeed(1, "Gbit/s")["MB/s"] === 125,
    `got: ${JSON.stringify(convertSpeed(1, "Gbit/s"))}`,
  );

  const brokenSpeedTrips = SPEED_UNITS.filter(
    (unit) => !near(convertSpeed(roundTripValue, unit)[unit], roundTripValue),
  );
  check(
    "olcu-vahidleri: every speed unit converts to itself unchanged",
    brokenSpeedTrips.length === 0,
    `broken: ${brokenSpeedTrips.join(", ")}`,
  );

  check(
    "olcu-vahidleri: a 10 GB file over a 100 Mbit/s link takes exactly 800 seconds",
    transferSeconds(10e9, 100e6) === 800,
    `got: ${transferSeconds(10e9, 100e6)}`,
  );

  check(
    "olcu-vahidleri: a link of zero speed gives an infinite wait rather than a division result",
    transferSeconds(1e9, 0) === Number.POSITIVE_INFINITY &&
      humanDuration(transferSeconds(1e9, 0)) === "—",
    `got: ${transferSeconds(1e9, 0)}`,
  );

  /* ---------- duration ---------- */

  const eightHundred = humanDuration(800);
  check(
    "olcu-vahidleri: 800 seconds reads as 13 dəq 20 san",
    eightHundred.includes("13 dəq") && eightHundred.includes("20 san"),
    `got: ${eightHundred}`,
  );

  check(
    "olcu-vahidleri: zero and a half second have readable forms of their own",
    humanDuration(0) === "0 san" && humanDuration(0.5) === "500 ms",
    `got: ${humanDuration(0)} / ${humanDuration(0.5)}`,
  );

  check(
    "olcu-vahidleri: 90 061 seconds keeps all four parts — 1 gün 1 saat 1 dəq 1 san",
    humanDuration(90061) === "1 gün 1 saat 1 dəq 1 san",
    `got: ${humanDuration(90061)}`,
  );

  check(
    "olcu-vahidleri: rounding happens before the split, so 59,96 seconds is a minute and not 60 san",
    humanDuration(59.96) === "1 dəq",
    `got: ${humanDuration(59.96)}`,
  );

  check(
    "olcu-vahidleri: NaN and infinity come back as a dash instead of a crash",
    humanDuration(Number.NaN) === "—" && humanDuration(Number.POSITIVE_INFINITY) === "—",
    `got: ${humanDuration(Number.NaN)} / ${humanDuration(Number.POSITIVE_INFINITY)}`,
  );

  check(
    "olcu-vahidleri: 1 500 000 ms is exactly 25 minutes, with no floating-point tail",
    convertTime(1500000, "ms").min === 25,
    `got: ${convertTime(1500000, "ms").min}`,
  );

  const brokenTimeTrips = TIME_UNITS.filter(
    (unit) => !near(convertTime(roundTripValue, unit)[unit], roundTripValue),
  );
  check(
    "olcu-vahidleri: every time unit converts to itself unchanged",
    brokenTimeTrips.length === 0,
    `broken: ${brokenTimeTrips.join(", ")}`,
  );

  check(
    "olcu-vahidleri: a week is seven days and a year is 365 of them",
    convertTime(1, "wk").d === 7 && convertTime(1, "yr").d === 365,
    `got: ${convertTime(1, "wk").d} / ${convertTime(1, "yr").d}`,
  );

  /* ---------- availability ---------- */

  const threeNines = uptimeBudget(99.9);
  check(
    "olcu-vahidleri: 99,9% leaves 31 536 seconds a year — 8 saat 45 dəq 36 san",
    near(threeNines.year, 31536, 1e-6) && humanDuration(threeNines.year) === "8 saat 45 dəq 36 san",
    `got: ${threeNines.year} (${humanDuration(threeNines.year)})`,
  );

  const fiveNines = uptimeBudget(99.999);
  check(
    "olcu-vahidleri: 99,999% leaves the famous five minutes a year",
    Math.abs(fiveNines.year - 315.36) < 0.01,
    `got: ${fiveNines.year}`,
  );

  const perfect = uptimeBudget(100);
  check(
    "olcu-vahidleri: a claim of 100% leaves no downtime budget at all",
    perfect.day === 0 && perfect.week === 0 && perfect.month === 0 && perfect.year === 0,
    `got: ${JSON.stringify(perfect)}`,
  );

  const none = uptimeBudget(0);
  check(
    "olcu-vahidleri: 0% leaves the whole period — a day, a week, a month and a year of it",
    none.day === 86400 && none.week === 604800 && none.month === 2592000 && none.year === 31536000,
    `got: ${JSON.stringify(none)}`,
  );

  const tooHigh = uptimeBudget(140);
  const tooLow = uptimeBudget(-5);
  check(
    "olcu-vahidleri: percentages outside 0–100 are clamped rather than turned into negative time",
    tooHigh.year === 0 && tooLow.year === 31536000,
    `too high: ${JSON.stringify(tooHigh)}, too low: ${JSON.stringify(tooLow)}`,
  );

  const unreadable = uptimeBudget(Number.NaN);
  check(
    "olcu-vahidleri: an unreadable percentage returns finite numbers instead of NaN",
    Object.values(unreadable).every((value) => Number.isFinite(value)),
    `got: ${JSON.stringify(unreadable)}`,
  );

  /* ---------- input and output ---------- */

  check(
    "olcu-vahidleri: a negative size is refused with a reason rather than converted",
    parseAmount("-4").value === null && (parseAmount("-4").error ?? "").length > 0,
    `got: ${JSON.stringify(parseAmount("-4"))}`,
  );

  check(
    "olcu-vahidleri: an empty field and a word both come back as a sentence, not as zero",
    parseAmount("").value === null && parseAmount("on qb").value === null,
    `got: ${JSON.stringify(parseAmount(""))} / ${JSON.stringify(parseAmount("on qb"))}`,
  );

  check(
    "olcu-vahidleri: a decimal comma and grouped digits are read the way they are typed here",
    parseAmount("12,5").value === 12.5 && parseAmount("1 000").value === 1000,
    `got: ${JSON.stringify(parseAmount("12,5"))} / ${JSON.stringify(parseAmount("1 000"))}`,
  );

  const extremes = [
    formatAmount(convertBytes(1, "bit").PiB),
    formatAmount(1e30),
    formatAmount(0.125),
    formatAmount(convertBytes(1, "PiB").bit),
  ];
  check(
    "olcu-vahidleri: no reading is ever printed in scientific notation, however small or large",
    extremes.every((text) => !/e[+-]/i.test(text)),
    `got: ${extremes.join(" | ")}`,
  );

  check(
    "olcu-vahidleri: an infinite or NaN reading prints as a dash",
    formatAmount(Number.POSITIVE_INFINITY) === "—" && formatAmount(Number.NaN) === "—",
    `got: ${formatAmount(Number.POSITIVE_INFINITY)} / ${formatAmount(Number.NaN)}`,
  );

  /* ---------- reference ---------- */

  const problems = auditReference(olcuRows, olcuSections);
  check(
    "olcu-vahidleri: the reference table passes the shared audit",
    problems.length === 0,
    `problems: ${problems.join("; ")}`,
  );

  check(
    `olcu-vahidleri: the reference table carries at least ${MINIMUM_ROWS} rows`,
    olcuRows.length >= MINIMUM_ROWS,
    `got: ${olcuRows.length}`,
  );

  const latency = filterReference(olcuRows, { query: "gecikme" });
  check(
    "olcu-vahidleri: searching for «gecikmə» without the schwa finds the latency rows",
    latency.length >= 5 && latency.every((row) => row.section === "vaxt"),
    `got: ${latency.length} rows`,
  );

  const ram = filterReference(olcuRows, { query: "RAM" });
  check(
    "olcu-vahidleri: searching for RAM in capitals finds the memory rows",
    ram.length > 0 && ram.some((row) => row.term.includes("RAM")),
    `got: ${ram.map((row) => row.term).join(", ")}`,
  );

  const sections = new Set(olcuRows.map((row) => row.section));
  check(
    "olcu-vahidleri: all five sections carry rows — prefixes, sizes, speeds, latency, uptime",
    ["prefiks", "hecm", "suret", "vaxt", "uptime"].every((id) => sections.has(id)),
    `got: ${[...sections].join(", ")}`,
  );
};
