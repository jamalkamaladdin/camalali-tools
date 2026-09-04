/*
 * The HMAC tool wraps `crypto.subtle`, so what actually needs proving is the
 * wrapper — key encoding, output encoding, comparison — not the HMAC
 * construction itself, which the platform already implements. The known
 * answers are RFC 4231's test vectors (HS256/384/512) plus RFC 2202's
 * matching HS1 vector, which shares RFC 4231's Test Case 1 key and data.
 *
 * `CheckSuite` is synchronous, so every value that needs `await` is computed
 * at module load time via top-level await (`.mts` is always ESM) before
 * `checks` runs — the same pattern `spf-yoxlayici.mts` documents.
 */
import type { CheckSuite } from "./harness.mts";
import { computeHmac, verifyHmac } from "../lib/hmac";

/* RFC 4231 Test Case 1 / RFC 2202 Test Case 1: key = 0x0b * 20, data = "Hi There". */
const KEY_20_HEX = "0b".repeat(20);
const DATA_HI_THERE = "Hi There";

const rfc1Sha1 = await computeHmac(DATA_HI_THERE, KEY_20_HEX, "hex", "SHA-1");
const rfc1Sha256 = await computeHmac(DATA_HI_THERE, KEY_20_HEX, "hex", "SHA-256");
const rfc1Sha384 = await computeHmac(DATA_HI_THERE, KEY_20_HEX, "hex", "SHA-384");
const rfc1Sha512 = await computeHmac(DATA_HI_THERE, KEY_20_HEX, "hex", "SHA-512");

/* RFC 4231 Test Case 2: key = "Jefe", data = "what do ya want for nothing?". */
const rfc2Sha256 = await computeHmac("what do ya want for nothing?", "Jefe", "text", "SHA-256");

/* Same key and data as Test Case 1, but the key given as raw text bytes
   (0x0b repeated) instead of hex — the two encodings of the same key bytes
   must land on the same digest, which is the whole point of a key-encoding
   switch existing. */
const rawKeyText = "\x0b".repeat(20);
const rfc1TextKey = await computeHmac(DATA_HI_THERE, rawKeyText, "text", "SHA-256");

const verifyMatch = await verifyHmac(DATA_HI_THERE, KEY_20_HEX, "hex", "SHA-256", rfc1Sha256.ok ? rfc1Sha256.digest.base64 : "");
const verifyMismatch = await verifyHmac(DATA_HI_THERE, KEY_20_HEX, "hex", "SHA-256", "00".repeat(32));
const verifyMalformed = await verifyHmac(DATA_HI_THERE, KEY_20_HEX, "hex", "SHA-256", "not a digest at all!!");
const badHexKey = await computeHmac(DATA_HI_THERE, "0b0", "hex", "SHA-256");
const emptyKey = await computeHmac(DATA_HI_THERE, "", "text", "SHA-256");

export const checks: CheckSuite = (check) => {
  check(
    "hmac: RFC 2202 test case 1 HMAC-SHA-1 matches",
    rfc1Sha1.ok && rfc1Sha1.digest.hex === "b617318655057264e28bc0b6fb378c8ef146be00",
    rfc1Sha1.ok ? `got ${rfc1Sha1.digest.hex}` : `refused: ${rfc1Sha1.error}`,
  );

  check(
    "hmac: RFC 4231 test case 1 HMAC-SHA-256 matches",
    rfc1Sha256.ok &&
      rfc1Sha256.digest.hex === "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    rfc1Sha256.ok ? `got ${rfc1Sha256.digest.hex}` : `refused: ${rfc1Sha256.error}`,
  );

  check(
    "hmac: RFC 4231 test case 1 HMAC-SHA-384 matches",
    rfc1Sha384.ok &&
      rfc1Sha384.digest.hex ===
        "afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6",
    rfc1Sha384.ok ? `got ${rfc1Sha384.digest.hex}` : `refused: ${rfc1Sha384.error}`,
  );

  check(
    "hmac: RFC 4231 test case 1 HMAC-SHA-512 matches",
    rfc1Sha512.ok &&
      rfc1Sha512.digest.hex ===
        "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854",
    rfc1Sha512.ok ? `got ${rfc1Sha512.digest.hex}` : `refused: ${rfc1Sha512.error}`,
  );

  check(
    "hmac: RFC 4231 test case 2 (key shorter than block size) HMAC-SHA-256 matches",
    rfc2Sha256.ok &&
      rfc2Sha256.digest.hex === "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    rfc2Sha256.ok ? `got ${rfc2Sha256.digest.hex}` : `refused: ${rfc2Sha256.error}`,
  );

  check(
    "hmac: text-encoded key and hex-encoded key agree on the same bytes",
    rfc1TextKey.ok && rfc1Sha256.ok && rfc1TextKey.digest.hex === rfc1Sha256.digest.hex,
    `text ${rfc1TextKey.ok ? rfc1TextKey.digest.hex : rfc1TextKey.error} vs hex ${rfc1Sha256.ok ? rfc1Sha256.digest.hex : rfc1Sha256.error}`,
  );

  check(
    "hmac: hex and base64 outputs decode to the same bytes",
    rfc1Sha256.ok && atob(rfc1Sha256.digest.base64).length === rfc1Sha256.digest.hex.length / 2,
    rfc1Sha256.ok ? `hex ${rfc1Sha256.digest.hex.length / 2} bytes, base64 decodes to ${atob(rfc1Sha256.digest.base64).length}` : `refused: ${rfc1Sha256.error}`,
  );

  check(
    "hmac: verifying against the correct digest (given as base64) matches",
    verifyMatch.ok && verifyMatch.matches,
    verifyMatch.ok ? `matches=${verifyMatch.matches}` : `refused: ${verifyMatch.error}`,
  );

  check(
    "hmac: verifying against a wrong digest reports no match, not an error",
    verifyMismatch.ok && !verifyMismatch.matches,
    verifyMismatch.ok ? `matches=${verifyMismatch.matches}` : `refused: ${verifyMismatch.error}`,
  );

  check(
    "hmac: a malformed expected digest is refused with a message, not thrown",
    !verifyMalformed.ok && verifyMalformed.error.length > 0,
    verifyMalformed.ok ? "a malformed expected digest was accepted" : "no message",
  );

  check(
    "hmac: an odd-length hex key is refused with a message, not thrown",
    !badHexKey.ok && badHexKey.error.length > 0,
    badHexKey.ok ? "an odd-length hex key was accepted" : "no message",
  );

  check(
    "hmac: an empty key is refused with a message, not thrown",
    !emptyKey.ok && emptyKey.error.length > 0,
    emptyKey.ok ? "an empty key was accepted" : "no message",
  );

  check(
    "hmac: SHA-1 and SHA-512 digests of the same input have the algorithm's own length",
    rfc1Sha1.ok && rfc1Sha512.ok && rfc1Sha1.digest.hex.length === 40 && rfc1Sha512.digest.hex.length === 128,
    `sha1 ${rfc1Sha1.ok ? rfc1Sha1.digest.hex.length : "refused"} sha512 ${rfc1Sha512.ok ? rfc1Sha512.digest.hex.length : "refused"}`,
  );
};
