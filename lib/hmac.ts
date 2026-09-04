/**
 * HMAC (RFC 2104) over SHA-1 / SHA-256 / SHA-384 / SHA-512, computed with the
 * browser's own `crypto.subtle` rather than hand-written arithmetic like the
 * digests next to this file in `hash.ts`. That is a deliberate split, not an
 * inconsistency: `hash.ts` avoids `crypto.subtle` because MD5/SHA-1/SHA-256
 * there have to keep working on an insecure origin (an `http://<ip>` address
 * during development), and rolling four keyed-hash constructions plus a
 * timing-safe comparator by hand buys nothing when the platform already
 * ships an audited one for a use case (message authentication, not display
 * of an already-public checksum) that has no such legacy pull.
 *
 * The cost is stated rather than hidden: outside a secure context (https or
 * `localhost`) `crypto.subtle` is `undefined`, and every function below
 * reports that as an ordinary `{ ok: false }` result instead of throwing —
 * the one thing a visitor must never see is an unhandled exception where a
 * sentence belonged.
 */

export type HmacAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

/** Declaration order — weakest to strongest, also the widget's segmented control order. */
export const HMAC_ALGORITHMS: HmacAlgorithm[] = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];

export type KeyEncoding = "text" | "hex";

export type HmacDigest = { hex: string; base64: string };

export type HmacComputation = { ok: true; digest: HmacDigest } | { ok: false; error: string };

export type HmacVerification =
  | { ok: true; matches: boolean; digest: HmacDigest }
  | { ok: false; error: string };

const NO_SUBTLE_ERROR =
  "Bu səhifə kriptoqrafiya funksiyasına icazə verməyən ünvandan açılıb: HMAC hesablamaq üçün https və ya localhost lazımdır.";

const HEX_PATTERN = /^[0-9a-fA-F]*$/;

/** The byte length of each algorithm's digest — fixed by the hash function, not a guess. */
const DIGEST_BYTES: Record<HmacAlgorithm, number> = {
  "SHA-1": 20,
  "SHA-256": 32,
  "SHA-384": 48,
  "SHA-512": 64,
};

function subtleCrypto(): SubtleCrypto | null {
  return typeof globalThis.crypto?.subtle === "object" ? globalThis.crypto.subtle : null;
}

function bytesToHex(bytes: Uint8Array<ArrayBuffer>): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0 || !HEX_PATTERN.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Chunked so a large input does not blow the argument limit of `fromCharCode`. */
function bytesToBinary(bytes: Uint8Array<ArrayBuffer>): string {
  const chunk = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  return btoa(bytesToBinary(bytes));
}

function decodeKey(
  key: string,
  encoding: KeyEncoding,
): { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; error: string } {
  if (encoding === "text") {
    if (key === "") return { ok: false, error: "Açar boşdur." };
    return { ok: true, bytes: new TextEncoder().encode(key) };
  }

  const cleaned = key.trim().replace(/\s+/g, "");
  if (cleaned === "") return { ok: false, error: "Açar boşdur." };
  const bytes = hexToBytes(cleaned);
  if (bytes === null) {
    return {
      ok: false,
      error: "Açar düzgün hex deyil: yalnız 0-9, a-f simvolları və cüt sayda simvol qəbul edilir.",
    };
  }
  return { ok: true, bytes };
}

/**
 * The expected HMAC, typed in either hex or Base64. Format is decided by
 * length rather than alphabet, because a lowercase-hex-looking string is
 * also valid Base64 — hex is `2 * digestBytes` characters exactly, Base64 of
 * the same bytes never is, so the two never collide for a real digest.
 */
function decodeExpectedDigest(value: string, expectedBytes: number): Uint8Array<ArrayBuffer> | null {
  const cleaned = value.trim().replace(/\s+/g, "");
  if (cleaned === "") return null;

  if (cleaned.length === expectedBytes * 2 && HEX_PATTERN.test(cleaned)) {
    return hexToBytes(cleaned);
  }

  const normalised = cleaned.replaceAll("-", "+").replaceAll("_", "/");
  const remainder = normalised.length % 4;
  if (remainder === 1) return null;
  const padded = remainder === 0 ? normalised : normalised + "=".repeat(4 - remainder);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) return null;

  try {
    const binary = atob(padded);
    if (binary.length !== expectedBytes) return null;
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Constant-time over equal-length input. The digest length is public — it is
 * a function of the algorithm the visitor picked, not a secret — so only the
 * byte-by-byte comparison of two same-length buffers needs to resist timing;
 * a length mismatch is an immediate, honest "no".
 */
function timingSafeEqual(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** All three at once — computed once, since the widget needs both encodings on screen together. */
export async function computeHmac(
  message: string,
  key: string,
  keyEncoding: KeyEncoding,
  algorithm: HmacAlgorithm,
): Promise<HmacComputation> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };

  const decodedKey = decodeKey(key, keyEncoding);
  if (!decodedKey.ok) return decodedKey;

  const cryptoKey = await subtle.importKey(
    "raw",
    decodedKey.bytes,
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  const signature = await subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  const bytes = new Uint8Array(signature);

  return { ok: true, digest: { hex: bytesToHex(bytes), base64: bytesToBase64(bytes) } };
}

/**
 * Computes the HMAC and compares it against a visitor-supplied expected
 * value in one call — the comparison itself is `timingSafeEqual`, so typing
 * the right answer one character faster never leaks through response time.
 */
export async function verifyHmac(
  message: string,
  key: string,
  keyEncoding: KeyEncoding,
  algorithm: HmacAlgorithm,
  expected: string,
): Promise<HmacVerification> {
  const computed = await computeHmac(message, key, keyEncoding, algorithm);
  if (!computed.ok) return computed;

  const expectedBytes = decodeExpectedDigest(expected, DIGEST_BYTES[algorithm]);
  if (expectedBytes === null) {
    return {
      ok: false,
      error: `Gözlənilən HMAC hex (${DIGEST_BYTES[algorithm] * 2} simvol) və ya Base64 formatına uyğun gəlmir.`,
    };
  }

  const actualBytes = hexToBytes(computed.digest.hex) ?? new Uint8Array(0);
  return { ok: true, matches: timingSafeEqual(actualBytes, expectedBytes), digest: computed.digest };
}
