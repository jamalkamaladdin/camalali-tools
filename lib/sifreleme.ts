/**
 * AES-256-GCM, keyed from a visitor's password rather than a raw key.
 *
 * A password is not a key: it is short, human-chosen and guessable, so it
 * goes through PBKDF2 first (SHA-256, 210 000 iterations, a fresh random
 * salt per encryption) to become one — 210 000 is OWASP's 2023 minimum for
 * PBKDF2-HMAC-SHA256, chosen so a stolen package costs an attacker a real
 * amount of compute per guess instead of being hashed directly. The salt is
 * random and travels with the package precisely so the same password never
 * derives the same key twice: two visitors encrypting the same secret with
 * the same password still get unrelated ciphertexts.
 *
 * The package format is three fields joined with `.` — salt, IV, ciphertext,
 * each Base64 — so the parts stay individually inspectable rather than
 * collapsing into one opaque blob.
 *
 * GCM is authenticated: a package edited by even one byte, or opened with
 * the wrong password, fails the tag check inside `crypto.subtle.decrypt`
 * rather than returning corrupted plaintext. That failure is caught and
 * turned into one Azerbaijani sentence — it is the expected outcome of a
 * wrong password, not a bug, and must never surface as a thrown exception.
 *
 * Everything here is `crypto.subtle` plus `crypto.getRandomValues`, so, like
 * `hmac.ts` and `totp.ts` beside it, every exported function is `async` and
 * every one refuses cleanly outside a secure context.
 */

const NO_SUBTLE_ERROR =
  "Bu səhifə kriptoqrafiya funksiyasına icazə verməyən ünvandan açılıb: şifrələmək üçün https və ya localhost lazımdır.";

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function subtleCrypto(): SubtleCrypto | null {
  return typeof globalThis.crypto?.subtle === "object" ? globalThis.crypto.subtle : null;
}

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

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (value === "" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function deriveKey(subtle: SubtleCrypto, password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const baseKey = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export type EncryptResult = { ok: true; package: string } | { ok: false; error: string };

export async function encryptText(plaintext: string, password: string): Promise<EncryptResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };
  if (password === "") return { ok: false, error: "Parol boşdur." };

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(subtle, password, salt);

  try {
    const ciphertext = await subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    );
    const parts = [salt, iv, new Uint8Array(ciphertext)].map(bytesToBase64);
    return { ok: true, package: parts.join(".") };
  } catch {
    return { ok: false, error: "Şifrələmə alınmadı: mətni qısaldıb yenidən sına." };
  }
}

export type DecryptResult = { ok: true; plaintext: string } | { ok: false; error: string };

export async function decryptText(pkg: string, password: string): Promise<DecryptResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };
  if (password === "") return { ok: false, error: "Parol boşdur." };

  const parts = pkg.trim().split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      error: `Paket 3 hissədən ibarət olmalıdır (duz.iv.şifrmətn), tapılan hissə sayı: ${parts.length}.`,
    };
  }
  const [saltPart, ivPart, ciphertextPart] = parts;

  const salt = base64ToBytes(saltPart);
  const iv = base64ToBytes(ivPart);
  const ciphertext = base64ToBytes(ciphertextPart);
  if (salt === null || iv === null || ciphertext === null) {
    return { ok: false, error: "Paket düzgün Base64 deyil." };
  }
  if (iv.length !== IV_BYTES) {
    return { ok: false, error: `IV uzunluğu ${IV_BYTES} bayt olmalıdır, tapılan: ${iv.length} bayt.` };
  }

  const key = await deriveKey(subtle, password, salt);

  try {
    const plaintextBytes = await subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return { ok: true, plaintext: new TextDecoder().decode(plaintextBytes) };
  } catch {
    // Wrong password and a tampered package fail the same GCM tag check, so
    // crypto.subtle gives no way to tell them apart — and telling them apart
    // would only help an attacker guessing the password.
    return { ok: false, error: "Deşifrələmə alınmadı: parol səhvdir və ya paket dəyişdirilib." };
  }
}
