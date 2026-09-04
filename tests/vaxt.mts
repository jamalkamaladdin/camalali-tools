/*
 * The two reference points every case is checked against are facts nobody
 * can dispute independently of this tool: epoch zero and the 2038 rollover of
 * a 32-bit signed second count. Both ISO strings below were produced once by
 * plain `new Date(ms).toISOString()` outside this codebase, not by the
 * function under test, so a case failing here means the digit-count heuristic
 * or the date arithmetic drifted — not that the fixture was copied from the
 * implementation.
 */
import type { CheckSuite } from "./harness.mts";
import {
  describeTimestamp,
  parseTimestamp,
  timestampFromLocalInput,
} from "../lib/vaxt";

export const checks: CheckSuite = (check) => {
  check(
    "vaxt: bos giris xeta verir",
    parseTimestamp("").ok === false,
    "bos setr eded kimi qebul edildi",
  );

  check(
    "vaxt: herfli giris xeta verir",
    parseTimestamp("12ab34").ok === false,
    "eded olmayan metn qebul edildi",
  );

  check(
    "vaxt: onluq kesr xeta verir",
    parseTimestamp("1735732800.5").ok === false,
    "kesrli eded tam eded kimi qebul edildi",
  );

  const zero = parseTimestamp("0");
  check(
    "vaxt: sifir saniye kimi oxunur ve epoch-a duz gelir (KNOWN: 1970-01-01T00:00:00.000Z)",
    zero.ok === true &&
      zero.unit === "seconds" &&
      describeTimestamp(zero.ms).iso === "1970-01-01T00:00:00.000Z",
    `alinan: ${JSON.stringify(zero)}`,
  );

  const negative = parseTimestamp("-86400");
  check(
    "vaxt: menfi timestamp epoch-dan evvelki gunu verir",
    negative.ok === true &&
      negative.unit === "seconds" &&
      describeTimestamp(negative.ms).iso === "1969-12-31T00:00:00.000Z",
    `alinan: ${JSON.stringify(negative)}`,
  );

  const y2038 = parseTimestamp("2147483647");
  check(
    "vaxt: 2038 problemi serhedi duz tarixe gelir (KNOWN: 32-bit signed int max)",
    y2038.ok === true &&
      y2038.unit === "seconds" &&
      describeTimestamp(y2038.ms).iso === "2038-01-19T03:14:07.000Z",
    `alinan: ${JSON.stringify(y2038)}`,
  );

  const tenNines = parseTimestamp("9999999999"); // 10 digits — last second-scale value before the switch
  const elevenDigits = parseTimestamp("10000000000"); // 11 digits — the heuristic's own boundary
  check(
    "vaxt: reqem sayi serhedinde saniye/millisaniye duz seçilir",
    tenNines.ok === true &&
      tenNines.unit === "seconds" &&
      elevenDigits.ok === true &&
      elevenDigits.unit === "milliseconds",
    `10 reqem: ${JSON.stringify(tenNines)}, 11 reqem: ${JSON.stringify(elevenDigits)}`,
  );

  const asSeconds = parseTimestamp("1700000000");
  const asMillis = parseTimestamp("1700000000000");
  check(
    "vaxt: 13 reqemli millisaniye eyni ani 10 reqemli saniye ile eyni verir",
    asSeconds.ok === true &&
      asMillis.ok === true &&
      asMillis.unit === "milliseconds" &&
      asSeconds.ms === asMillis.ms,
    `saniye: ${JSON.stringify(asSeconds)}, millisaniye: ${JSON.stringify(asMillis)}`,
  );

  const leapDay = describeTimestamp(Date.UTC(2024, 1, 29));
  check(
    "vaxt: sicrayis ilinde 29 fevral 60-ci gundur ve il 366 gundur",
    leapDay.dayOfYear === 60 && leapDay.daysInYear === 366,
    `alinan: gun ${leapDay.dayOfYear}, il uzunlugu ${leapDay.daysInYear}`,
  );

  const nonLeapYearEnd = describeTimestamp(Date.UTC(2023, 11, 31));
  check(
    "vaxt: adi ilin sonu 365-ci gundur",
    nonLeapYearEnd.dayOfYear === 365 && nonLeapYearEnd.daysInYear === 365,
    `alinan: gun ${nonLeapYearEnd.dayOfYear}, il uzunlugu ${nonLeapYearEnd.daysInYear}`,
  );

  const epoch = describeTimestamp(0);
  check(
    "vaxt: epoch UTC-de 00:00, Baki-de 04:00 gosterir",
    epoch.utc === "1 yanvar 1970, 00:00" && epoch.baku === "1 yanvar 1970, 04:00",
    `alinan: utc=${epoch.utc}, baku=${epoch.baku}`,
  );

  check(
    "vaxt: movcud olmayan 29 fevral (sicrayis ili deyil) redd edilir",
    timestampFromLocalInput("2023-02-29T00:00", "utc").ok === false,
    "qeyri-movcud tarix qebul edildi",
  );

  const leapAccepted = timestampFromLocalInput("2024-02-29T00:00", "utc");
  check(
    "vaxt: sicrayis ilinde 29 fevral qebul edilir",
    leapAccepted.ok === true && leapAccepted.ms === Date.UTC(2024, 1, 29),
    `alinan: ${JSON.stringify(leapAccepted)}`,
  );

  const bakuMidnight = timestampFromLocalInput("2026-09-03T04:00:00", "baku");
  check(
    "vaxt: Baki saati ile 04:00 UTC gece yarisina beraberdir",
    bakuMidnight.ok === true && bakuMidnight.ms === Date.UTC(2026, 8, 3, 0, 0, 0),
    `alinan: ${JSON.stringify(bakuMidnight)}`,
  );

  const y2k = timestampFromLocalInput("2000-01-01T00:00", "utc");
  check(
    "vaxt: Y2K aninin ms deyeri melumdur (KNOWN: 946684800000)",
    y2k.ok === true && y2k.ms === 946_684_800_000,
    `alinan: ${JSON.stringify(y2k)}`,
  );

  check(
    "vaxt: yanlis format redd edilir",
    timestampFromLocalInput("2026/09/03 12:00", "utc").ok === false,
    "yanlis formatli tarix qebul edildi",
  );
};
