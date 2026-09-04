/*
 * The password tool's cases, and every one of them runs without a network.
 *
 * That is not a convenience. The two things this tool can get wrong are the
 * digest it computes and the way it reads the answer back, and both are pure
 * text work — the request in between is the one part that cannot be proved by
 * a test anyway. The range fixture below is a real excerpt, taken from
 * api.pwnedpasswords.com/range/5BAA6 on 2026-09-03, CRLF endings and all.
 */
import type { CheckSuite } from "./harness.mts";
import {
  countInRange,
  describeExposure,
  isValidPrefix,
  normalisePrefix,
  parseRangeBody,
  PREFIX_LENGTH,
  splitPasswordHash,
  SUFFIX_LENGTH,
} from "../lib/parol-sizmasi";

/* Reference digests produced by python's hashlib, not by the code under test. */
const SHA1_PASSWORD = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";
const SHA1_EMPTY = "DA39A3EE5E6B4B0D3255BFEF95601890AFD80709";
const SHA1_AZ = "B67DCD28426D68B76088BFD58BF94ED3F2991B9B";

/* The suffix of "password" inside range 5BAA6, with its measured count. */
const PASSWORD_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";
const PASSWORD_COUNT = 52372427;

/* Line endings are CRLF on the wire; the trailing \r is exactly what turned a
   naive split into a lookup that never matched anything. */
const RANGE = [
  "003CD215739D7C1B2218670D26F81408237:2",
  `${PASSWORD_SUFFIX}:${PASSWORD_COUNT}`,
  "00658BFD1E05761042698D19D32CD9F1A8F:15",
].join("\r\n");

/* What a padded response looks like: real rows plus decoys carrying a zero. */
const PADDED = ["1111111111111111111111111111111111A:0", "003CD215739D7C1B2218670D26F81408237:2"].join(
  "\r\n",
);

export const checks: CheckSuite = (check) => {
  const password = splitPasswordHash("password");

  check(
    "parol-sizmasi: sha1(password) hashlib etalonu ile uygundur",
    password.hash === SHA1_PASSWORD,
    `alindi ${password.hash}`,
  );

  check(
    "parol-sizmasi: bos parolun sha1-i etalonla uygundur",
    splitPasswordHash("").hash === SHA1_EMPTY,
    `alindi ${splitPasswordHash("").hash}`,
  );

  check(
    "parol-sizmasi: azerbaycan herfli parol utf-8 kimi hashlanir",
    splitPasswordHash("şəkərbura").hash === SHA1_AZ,
    `alindi ${splitPasswordHash("şəkərbura").hash}`,
  );

  check(
    "parol-sizmasi: hash 5 + 35 kimi bolunur ve butov qalir",
    password.prefix.length === PREFIX_LENGTH &&
      password.suffix.length === SUFFIX_LENGTH &&
      password.prefix + password.suffix === password.hash,
    `prefiks ${password.prefix.length}, suffiks ${password.suffix.length}`,
  );

  check(
    "parol-sizmasi: prefiks yalniz 5 onaltiliq simvolu qebul edir",
    isValidPrefix("5BAA6") &&
      isValidPrefix("5baa6") &&
      !isValidPrefix("5BAA") &&
      !isValidPrefix("5BAA6Z") &&
      !isValidPrefix("5BAA61") &&
      !isValidPrefix("") &&
      !isValidPrefix(" 5BAA"),
    "validasiya kenar hallardan birini kecirdi",
  );

  check(
    "parol-sizmasi: prefiks boyuk herfe cevrilir",
    normalisePrefix("5baa6") === "5BAA6",
    `alindi ${normalisePrefix("5baa6")}`,
  );

  check(
    "parol-sizmasi: crlf cavabi 3 setir kimi oxunur",
    parseRangeBody(RANGE).length === 3,
    `alindi ${parseRangeBody(RANGE).length}`,
  );

  const noisy = ["salam", ":", "ZZZZ:1", `${PASSWORD_SUFFIX}:${PASSWORD_COUNT}`, ""].join("\n");
  check(
    "parol-sizmasi: format pozulmus setirler atilir",
    parseRangeBody(noisy).length === 1,
    `alindi ${parseRangeBody(noisy).length}`,
  );

  check(
    "parol-sizmasi: menfi say olan setir qebul edilmir",
    parseRangeBody(`${PASSWORD_SUFFIX}:-5`).length === 0,
    `alindi ${parseRangeBody(`${PASSWORD_SUFFIX}:-5`).length}`,
  );

  check(
    "parol-sizmasi: password olculmus 52372427 sayini qaytarir",
    countInRange(RANGE, password.suffix) === PASSWORD_COUNT,
    `alindi ${countInRange(RANGE, password.suffix)}`,
  );

  check(
    "parol-sizmasi: kicik herfli suffiks de uygunlasir",
    countInRange(RANGE, password.suffix.toLowerCase()) === PASSWORD_COUNT,
    `alindi ${countInRange(RANGE, password.suffix.toLowerCase())}`,
  );

  check(
    "parol-sizmasi: siyahida olmayan suffiks sifir verir",
    countInRange(RANGE, "F".repeat(SUFFIX_LENGTH)) === 0,
    `alindi ${countInRange(RANGE, "F".repeat(SUFFIX_LENGTH))}`,
  );

  check(
    "parol-sizmasi: doldurucu sifir setri tapilmadi kimi sayilir",
    countInRange(PADDED, "1111111111111111111111111111111111A") === 0,
    `alindi ${countInRange(PADDED, "1111111111111111111111111111111111A")}`,
  );

  check(
    "parol-sizmasi: sifir hal 'guclu deyil' xeberdarligi ile gelir",
    describeExposure(0).level === "clean" &&
      describeExposure(0).advice.includes("güclü olduğunu göstərmir"),
    `alindi ${describeExposure(0).level}`,
  );

  check(
    "parol-sizmasi: say artdiqca seviyye qalxir",
    describeExposure(1).level === "seen" &&
      describeExposure(9).level === "seen" &&
      describeExposure(10).level === "common" &&
      describeExposure(999).level === "common" &&
      describeExposure(1000).level === "notorious",
    `1:${describeExposure(1).level} 10:${describeExposure(10).level} 1000:${describeExposure(1000).level}`,
  );

  check(
    "parol-sizmasi: menfi say sifir kimi oxunur",
    describeExposure(-3).level === "clean" && describeExposure(-3).count === 0,
    `alindi ${describeExposure(-3).level}/${describeExposure(-3).count}`,
  );
};
