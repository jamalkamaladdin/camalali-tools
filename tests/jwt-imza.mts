/*
 * The one literal known-answer vector here is the illustrative HS256 example
 * from jwt.io / RFC 7519 — header `{"alg":"HS256","typ":"JWT"}`, payload
 * `{"sub":"1234567890","name":"John Doe","iat":1516239022}`, secret
 * "your-256-bit-secret" — reproduced independently against Node's own
 * `crypto.createHmac` before being pasted in here, so it is not this file
 * trusting its own arithmetic. HS384/HS512 have no equally famous fixture,
 * so those two are proven by round-trip (sign, then verify the result)
 * instead, same as the parts of this tool with no published spec vector.
 *
 * Top-level await resolves every async fixture before `checks` runs — see
 * `spf-yoxlayici.mts` for why that is safe under a synchronous `CheckSuite`.
 */
import type { CheckSuite } from "./harness.mts";
import { signJwt, verifyJwt } from "../lib/jwt-imza";

const JWT_IO_HEADER = `{"alg":"HS256","typ":"JWT"}`;
const JWT_IO_PAYLOAD = `{"sub":"1234567890","name":"John Doe","iat":1516239022}`;
const JWT_IO_SECRET = "your-256-bit-secret";
const JWT_IO_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const signed = await signJwt(JWT_IO_HEADER, JWT_IO_PAYLOAD, JWT_IO_SECRET, "HS256");
const verifiedCorrect = await verifyJwt(JWT_IO_TOKEN, JWT_IO_SECRET, "HS256");
const verifiedWrongSecret = await verifyJwt(JWT_IO_TOKEN, "wrong-secret", "HS256");
const verifiedMalformed = await verifyJwt("not.a.token.at.all", JWT_IO_SECRET, "HS256");
const signedBadJson = await signJwt("{not json", JWT_IO_PAYLOAD, JWT_IO_SECRET, "HS256");
const signedNoSecret = await signJwt(JWT_IO_HEADER, JWT_IO_PAYLOAD, "", "HS256");

const round384 = await signJwt(JWT_IO_HEADER, JWT_IO_PAYLOAD, "another-secret", "HS384");
const verified384 =
  round384.ok && (await verifyJwt(round384.token, "another-secret", "HS384"));

const round512 = await signJwt(JWT_IO_HEADER, JWT_IO_PAYLOAD, "yet-another-secret", "HS512");
const verified512 =
  round512.ok && (await verifyJwt(round512.token, "yet-another-secret", "HS512"));

/* The token was signed HS256; verifying it while asking for HS384 must
   disagree on `alg` and, since the two hash functions produce unrelated
   output, fail the signature too. */
const wrongAlgorithm = await verifyJwt(JWT_IO_TOKEN, JWT_IO_SECRET, "HS384");

/* `alg` in the typed header is "HS512", but the algorithm parameter is
   "HS256" — the parameter has to win, or a visitor editing the header text
   could make the tool sign with one algorithm while claiming another. */
const overriddenAlg = await signJwt(`{"alg":"HS512"}`, JWT_IO_PAYLOAD, "secret", "HS256");

const past = Math.floor(Date.now() / 1000) - 3600;
const future = Math.floor(Date.now() / 1000) + 3600;
const expiredSigned = await signJwt(JWT_IO_HEADER, JSON.stringify({ exp: past }), "secret", "HS256");
const expiredVerified = expiredSigned.ok && (await verifyJwt(expiredSigned.token, "secret", "HS256"));

const notYetSigned = await signJwt(JWT_IO_HEADER, JSON.stringify({ nbf: future }), "secret", "HS256");
const notYetVerified = notYetSigned.ok && (await verifyJwt(notYetSigned.token, "secret", "HS256"));

/* Flip the token's very last character — inside the signature segment, so
   header and payload stay byte-identical and still parse as JSON, and only
   the signature bytes change. Tampering the payload instead would usually
   break its JSON syntax and be refused before signature checking ever runs,
   which would test the JSON parser, not the signature check this case is for. */
const tampered = signed.ok
  ? signed.token.slice(0, -1) + (signed.token.slice(-1) === "A" ? "B" : "A")
  : "";
const tamperedVerified = tampered !== "" && (await verifyJwt(tampered, JWT_IO_SECRET, "HS256"));

export const checks: CheckSuite = (check) => {
  check(
    "jwt-imza: signing the jwt.io HS256 example reproduces its published token byte for byte",
    signed.ok && signed.token === JWT_IO_TOKEN,
    signed.ok ? `got ${signed.token}` : `refused: ${signed.error}`,
  );

  check(
    "jwt-imza: verifying the same token with the right secret validates",
    verifiedCorrect.ok && verifiedCorrect.signatureValid && verifiedCorrect.algorithmMatches,
    verifiedCorrect.ok
      ? `valid=${verifiedCorrect.signatureValid} algMatches=${verifiedCorrect.algorithmMatches}`
      : `refused: ${verifiedCorrect.error}`,
  );

  check(
    "jwt-imza: verifying with the wrong secret reports an invalid signature, not an error",
    verifiedWrongSecret.ok && !verifiedWrongSecret.signatureValid,
    verifiedWrongSecret.ok ? `valid=${verifiedWrongSecret.signatureValid}` : `refused: ${verifiedWrongSecret.error}`,
  );

  check(
    "jwt-imza: a token without three dot-separated parts is refused with a message",
    !verifiedMalformed.ok && verifiedMalformed.error.length > 0,
    verifiedMalformed.ok ? "a malformed token was accepted" : "no message",
  );

  check(
    "jwt-imza: invalid header JSON is refused with a message, not thrown",
    !signedBadJson.ok && signedBadJson.error.length > 0,
    signedBadJson.ok ? "invalid header JSON was accepted" : "no message",
  );

  check(
    "jwt-imza: an empty secret is refused with a message, not thrown",
    !signedNoSecret.ok && signedNoSecret.error.length > 0,
    signedNoSecret.ok ? "an empty secret was accepted" : "no message",
  );

  check(
    "jwt-imza: HS384 round-trips — signed then verified with the same secret validates",
    round384.ok && verified384 !== false && verified384.ok && verified384.signatureValid,
    round384.ok ? `verified=${verified384 !== false && verified384.ok && verified384.signatureValid}` : `refused: ${round384.error}`,
  );

  check(
    "jwt-imza: HS512 round-trips — signed then verified with the same secret validates",
    round512.ok && verified512 !== false && verified512.ok && verified512.signatureValid,
    round512.ok ? `verified=${verified512 !== false && verified512.ok && verified512.signatureValid}` : `refused: ${round512.error}`,
  );

  check(
    "jwt-imza: verifying an HS256 token while asking for HS384 disagrees on alg and fails the signature",
    wrongAlgorithm.ok && !wrongAlgorithm.algorithmMatches && !wrongAlgorithm.signatureValid,
    wrongAlgorithm.ok
      ? `algMatches=${wrongAlgorithm.algorithmMatches} valid=${wrongAlgorithm.signatureValid}`
      : `refused: ${wrongAlgorithm.error}`,
  );

  check(
    "jwt-imza: the algorithm parameter overrides whatever alg the typed header claimed",
    overriddenAlg.ok && overriddenAlg.header.alg === "HS256",
    overriddenAlg.ok ? `header.alg=${String(overriddenAlg.header.alg)}` : `refused: ${overriddenAlg.error}`,
  );

  check(
    "jwt-imza: a token whose exp claim is in the past is reported expired",
    expiredVerified !== false && expiredVerified.ok && expiredVerified.expired === true,
    expiredSigned.ok ? "signed but expired flag was not true" : `refused: ${expiredSigned.ok ? "" : expiredSigned.error}`,
  );

  check(
    "jwt-imza: a token whose nbf claim is in the future is reported not yet valid",
    notYetVerified !== false && notYetVerified.ok && notYetVerified.notYetValid === true,
    notYetSigned.ok ? "signed but notYetValid flag was not true" : `refused: ${notYetSigned.ok ? "" : notYetSigned.error}`,
  );

  check(
    "jwt-imza: a one-character change in the payload segment invalidates the signature",
    tamperedVerified !== false && tamperedVerified.ok && !tamperedVerified.signatureValid,
    tampered === "" ? "no tampered token to test" : `result: ${JSON.stringify(tamperedVerified)}`,
  );
};
