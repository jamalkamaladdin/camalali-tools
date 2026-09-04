/**
 * HOTP (RFC 4226) and TOTP (RFC 6238) — the six-digit code an authenticator
 * app shows, computed the same way the app computes it: an HMAC over a
 * counter, truncated to a fixed number of decimal digits.
 *
 * The HMAC step is `crypto.subtle`, for the same reason `hmac.ts` uses it —
 * this is message authentication, not a checksum that has to survive an
 * insecure origin, so there is no case for hand-rolling it. That makes every
 * exported function here `async`, and it makes the tool unusable outside a
 * secure context (https or `localhost`); `NO_SUBTLE_ERROR` is what the
 * widget shows instead of a blank screen when that happens.
 *
 * The part actually worth writing by hand is RFC 4226's dynamic truncation
 * (§5.3) and the Base32 the secret arrives in — neither has a Web Crypto
 * equivalent to delegate to.
 */

export type TotpAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

/** RFC 6238's own algorithm order, and the widget's segmented control order. */
export const TOTP_ALGORITHMS: TotpAlgorithm[] = ["SHA-1", "SHA-256", "SHA-512"];

export type TotpDigits = 6 | 8;
export type TotpStep = 30 | 60;

const NO_SUBTLE_ERROR =
  "Bu səhifə kriptoqrafiya funksiyasına icazə verməyən ünvandan açılıb — kod hesablamaq üçün https və ya localhost lazımdır.";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function subtleCrypto(): SubtleCrypto | null {
  return typeof globalThis.crypto?.subtle === "object" ? globalThis.crypto.subtle : null;
}

/* ---------- Base32 (RFC 4648 §6), 5 bits per character ---------- */

export type Base32Decode = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; error: string };

/**
 * Whitespace and padding (`=`) are stripped before validation — an
 * authenticator app's "add manually" screen shows the secret grouped in
 * fours, and a visitor copying it usually keeps the spaces.
 */
export function decodeBase32Secret(raw: string): Base32Decode {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "").replace(/=+$/, "");
  if (cleaned === "") return { ok: false, error: "Gizli açar boşdur." };

  for (const char of cleaned) {
    if (!BASE32_ALPHABET.includes(char)) {
      return {
        ok: false,
        error: `Gizli açar Base32 əlifbasına aid olmayan simvol saxlayır: "${char}" (yalnız A-Z və 2-7 keçərlidir).`,
      };
    }
  }

  let bits = "";
  for (const char of cleaned) {
    bits += BASE32_ALPHABET.indexOf(char).toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }

  if (bytes.length === 0) {
    return { ok: false, error: "Gizli açar çox qısadır — heç olmasa 8 bit (bir bayt) tam olmalıdır." };
  }

  return { ok: true, bytes: Uint8Array.from(bytes) };
}

/** The reverse — for a generated secret, and for round-tripping in the checks. */
export function encodeBase32Secret(bytes: Uint8Array<ArrayBuffer>): string {
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");

  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    out += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return out;
}

/** A fresh secret from the browser's cryptographic source — 20 bytes, the length every major authenticator app defaults to. */
export function generateSecretBytes(byteLength = 20): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytes;
}

/* ---------- HOTP (RFC 4226) ---------- */

function counterToBytes(counter: bigint): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(8);
  let value = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return buf;
}

/** RFC 4226 §5.3 — the four bytes at a data-dependent offset, with the top bit masked off. */
function dynamicTruncate(hmac: Uint8Array<ArrayBuffer>, digits: TotpDigits): string {
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const modulus = 10 ** digits;
  return String(code % modulus).padStart(digits, "0");
}

export type HotpResult = { ok: true; code: string } | { ok: false; error: string };

export async function computeHotp(
  secretBytes: Uint8Array<ArrayBuffer>,
  counter: bigint,
  digits: TotpDigits,
  algorithm: TotpAlgorithm,
): Promise<HotpResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };
  if (counter < 0n) return { ok: false, error: "Sayğac mənfi ola bilməz." };
  if (secretBytes.length === 0) return { ok: false, error: "Gizli açar boşdur." };

  const key = await subtle.importKey("raw", secretBytes, { name: "HMAC", hash: algorithm }, false, [
    "sign",
  ]);
  const signature = await subtle.sign("HMAC", key, counterToBytes(counter));

  return { ok: true, code: dynamicTruncate(new Uint8Array(signature), digits) };
}

/* ---------- TOTP (RFC 6238) — HOTP with the counter derived from wall-clock time ---------- */

export function counterForTime(epochSeconds: number, step: TotpStep): bigint {
  return BigInt(Math.floor(epochSeconds / step));
}

export type TotpResult =
  | { ok: true; code: string; counter: bigint; secondsRemaining: number }
  | { ok: false; error: string };

export async function computeTotp(
  secretBytes: Uint8Array<ArrayBuffer>,
  epochSeconds: number,
  step: TotpStep,
  digits: TotpDigits,
  algorithm: TotpAlgorithm,
): Promise<TotpResult> {
  const counter = counterForTime(epochSeconds, step);
  const hotp = await computeHotp(secretBytes, counter, digits, algorithm);
  if (!hotp.ok) return hotp;

  const secondsIntoStep = epochSeconds - Number(counter) * step;
  return { ok: true, code: hotp.code, counter, secondsRemaining: step - secondsIntoStep };
}

export type TotpWindow =
  | { ok: true; previous: string; current: string; next: string; secondsRemaining: number }
  | { ok: false; error: string };

/**
 * The previous, current and next codes at once — what the widget shows so a
 * visitor whose phone clock drifted a little can still recognise a
 * neighbouring code as theirs, the way a verifying server checks a small
 * window rather than one exact counter.
 */
export async function computeTotpWindow(
  secretBytes: Uint8Array<ArrayBuffer>,
  epochSeconds: number,
  step: TotpStep,
  digits: TotpDigits,
  algorithm: TotpAlgorithm,
): Promise<TotpWindow> {
  const counter = counterForTime(epochSeconds, step);
  const [previous, current, next] = await Promise.all([
    computeHotp(secretBytes, counter > 0n ? counter - 1n : 0n, digits, algorithm),
    computeHotp(secretBytes, counter, digits, algorithm),
    computeHotp(secretBytes, counter + 1n, digits, algorithm),
  ]);
  if (!previous.ok) return previous;
  if (!current.ok) return current;
  if (!next.ok) return next;

  const secondsIntoStep = epochSeconds - Number(counter) * step;
  return {
    ok: true,
    previous: previous.code,
    current: current.code,
    next: next.code,
    secondsRemaining: step - secondsIntoStep,
  };
}

/* ---------- otpauth:// URI (the Google Authenticator key URI format) ---------- */

export type OtpAuthParams = {
  label: string;
  issuer: string;
  secretBase32: string;
  algorithm: TotpAlgorithm;
  digits: TotpDigits;
  step: TotpStep;
};

/** What a QR code for this secret would encode — the same string an authenticator app's "scan" and "enter manually" paths both resolve to. */
export function buildOtpAuthUri(params: OtpAuthParams): string {
  const label = params.issuer ? `${params.issuer}:${params.label}` : params.label;
  const query = [
    `secret=${encodeURIComponent(params.secretBase32.replace(/=+$/, ""))}`,
    `algorithm=${params.algorithm.replace("-", "")}`,
    `digits=${params.digits}`,
    `period=${params.step}`,
  ];
  if (params.issuer) query.push(`issuer=${encodeURIComponent(params.issuer)}`);
  return `otpauth://totp/${encodeURIComponent(label)}?${query.join("&")}`;
}
