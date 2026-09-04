/*
 * HOTP is checked against RFC 4226 Appendix D's ten-counter table, TOTP
 * against RFC 6238 Appendix B's time table — published, independently
 * reproducible known-answer sets, not this file's own output. Both use the
 * same repeating ASCII secret the RFCs specify ("12345678901234567890",
 * stretched to 32 and 64 bytes for the SHA-256/SHA-512 rows), 8 digits for
 * TOTP and 6 for HOTP, exactly as the tables define.
 *
 * Top-level await resolves every async fixture before `checks` runs — see
 * `spf-yoxlayici.mts` for why that is safe under a synchronous `CheckSuite`.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildOtpAuthUri,
  computeHotp,
  computeTotp,
  computeTotpWindow,
  decodeBase32Secret,
  encodeBase32Secret,
} from "../lib/totp";

const encoder = new TextEncoder();

const SEED_20 = encoder.encode("12345678901234567890");
const SEED_32 = encoder.encode("12345678901234567890123456789012");
const SEED_64 = encoder.encode("1234567890123456789012345678901234567890123456789012345678901234");

/* RFC 4226 Appendix D, counters 0 and 9 — the first and last rows of the ten-row table. */
const hotp0 = await computeHotp(SEED_20, 0n, 6, "SHA-1");
const hotp9 = await computeHotp(SEED_20, 9n, 6, "SHA-1");

/* RFC 6238 Appendix B, T = 59 seconds — the table's first and most-quoted row, all three algorithms. */
const totp59Sha1 = await computeTotp(SEED_20, 59, 30, 8, "SHA-1");
const totp59Sha256 = await computeTotp(SEED_32, 59, 30, 8, "SHA-256");
const totp59Sha512 = await computeTotp(SEED_64, 59, 30, 8, "SHA-512");

/* RFC 6238 Appendix B, T = 1111111109 seconds — exercises a counter that is
   not the first block, catching an off-by-one in the time/step division. */
const totpMid = await computeTotp(SEED_20, 1_111_111_109, 30, 8, "SHA-1");

/* RFC 6238 Appendix B, T = 20000000000 seconds — a counter past 2^32, which
   only passes if the counter is carried as a 64-bit value end to end. */
const totpLarge = await computeTotp(SEED_20, 20_000_000_000, 30, 8, "SHA-1");

/* The window around T = 59 (counter 1): counter 0's and counter 2's codes,
   independently confirmed against the same reference HMAC computation used
   for the vectors above. */
const window59 = await computeTotpWindow(SEED_20, 59, 30, 8, "SHA-1");

const decodedSeed20 = decodeBase32Secret(encodeBase32Secret(SEED_20));
const badSecret = decodeBase32Secret("this-is-not-base32!!!");
const emptySecret = decodeBase32Secret("   ");
const negativeCounter = await computeHotp(SEED_20, -1n, 6, "SHA-1");

export const checks: CheckSuite = (check) => {
  check(
    "totp: RFC 4226 HOTP counter 0 matches",
    hotp0.ok && hotp0.code === "755224",
    hotp0.ok ? `got ${hotp0.code}` : `refused: ${hotp0.error}`,
  );

  check(
    "totp: RFC 4226 HOTP counter 9 matches",
    hotp9.ok && hotp9.code === "520489",
    hotp9.ok ? `got ${hotp9.code}` : `refused: ${hotp9.error}`,
  );

  check(
    "totp: RFC 6238 T=59 matches for SHA-1, SHA-256 and SHA-512",
    totp59Sha1.ok &&
      totp59Sha1.code === "94287082" &&
      totp59Sha256.ok &&
      totp59Sha256.code === "46119246" &&
      totp59Sha512.ok &&
      totp59Sha512.code === "90693936",
    `sha1 ${totp59Sha1.ok ? totp59Sha1.code : totp59Sha1.error} sha256 ${totp59Sha256.ok ? totp59Sha256.code : totp59Sha256.error} sha512 ${totp59Sha512.ok ? totp59Sha512.code : totp59Sha512.error}`,
  );

  check(
    "totp: RFC 6238 T=1111111109 matches",
    totpMid.ok && totpMid.code === "07081804",
    totpMid.ok ? `got ${totpMid.code}` : `refused: ${totpMid.error}`,
  );

  check(
    "totp: a counter past 2^32 (T=20000000000) still matches — the counter is not truncated to 32 bits",
    totpLarge.ok && totpLarge.code === "65353130",
    totpLarge.ok ? `got ${totpLarge.code}` : `refused: ${totpLarge.error}`,
  );

  check(
    "totp: the window at T=59 carries counter 1 as current, with the right seconds remaining",
    window59.ok && window59.current === "94287082" && window59.secondsRemaining === 1,
    window59.ok
      ? `current ${window59.current} remaining ${window59.secondsRemaining}`
      : `refused: ${window59.error}`,
  );

  check(
    "totp: the window's previous and next codes are the neighbouring counters, not copies of current",
    window59.ok &&
      window59.previous !== window59.current &&
      window59.next !== window59.current &&
      window59.previous === "84755224" &&
      window59.next === "37359152",
    window59.ok ? `previous ${window59.previous} next ${window59.next}` : `refused: ${window59.error}`,
  );

  check(
    "totp: Base32 round-trips through decode and encode",
    decodedSeed20.ok && [...decodedSeed20.bytes].join(",") === [...SEED_20].join(","),
    decodedSeed20.ok ? `got ${[...decodedSeed20.bytes].join(",")}` : `refused: ${decodedSeed20.error}`,
  );

  check(
    "totp: a Base32 secret with letters outside A-Z2-7 is refused, not thrown",
    !badSecret.ok && badSecret.error.length > 0,
    badSecret.ok ? "an invalid Base32 string was accepted" : "no message",
  );

  check(
    "totp: a blank secret is refused with a message, not thrown",
    !emptySecret.ok && emptySecret.error.length > 0,
    emptySecret.ok ? "a blank secret was accepted" : "no message",
  );

  check(
    "totp: a negative HOTP counter is refused, not thrown",
    !negativeCounter.ok && negativeCounter.error.length > 0,
    negativeCounter.ok ? "a negative counter produced a code" : "no message",
  );

  const uri = buildOtpAuthUri({
    label: "hesab",
    issuer: "camalali",
    secretBase32: encodeBase32Secret(SEED_20),
    algorithm: "SHA-1",
    digits: 6,
    step: 30,
  });
  check(
    "totp: the otpauth URI carries the scheme, issuer, digits and period",
    uri.startsWith("otpauth://totp/camalali%3Ahesab?") &&
      uri.includes("issuer=camalali") &&
      uri.includes("digits=6") &&
      uri.includes("period=30"),
    `got ${uri}`,
  );
};
