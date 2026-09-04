/**
 * RSA key pairs, PEM/JWK export and import, RSA-OAEP encryption and
 * RSASSA-PKCS1-v1_5/RSA-PSS signatures — all through `crypto.subtle`, the
 * same way `hmac.ts`, `totp.ts`, `jwt-imza.ts` and `sifreleme.ts` beside this
 * file lean on the platform rather than hand-rolling RSA's own arithmetic.
 * Every exported function is `async` for that reason, and every one refuses
 * with `NO_SUBTLE_ERROR` outside a secure context instead of throwing.
 *
 * What is not delegated is the PEM envelope: `crypto.subtle.exportKey`
 * returns raw DER bytes, and turning those into the `-----BEGIN...-----`
 * text a visitor can paste elsewhere — base64, wrapped at 64 columns, with
 * the right header — is ordinary string work with no WebCrypto counterpart.
 * `pemToDer`/`derToPem` do that, and are the pure, synchronous half of this
 * file the round-trip checks exercise directly.
 *
 * Neither PEM (SPKI/PKCS8) nor JWK encodes *why* a key was generated — an
 * RSA public key is the same bytes whether it is meant for `RSA-OAEP` or
 * `RSASSA-PKCS1-v1_5`. So every import function here takes the intended
 * purpose and hash as parameters, the same way generation does; there is no
 * way to recover that intent from the key material alone, and pretending
 * otherwise would be the "invented number" this codebase's rules forbid.
 */

const NO_SUBTLE_ERROR =
  "Bu səhifə kriptoqrafiya funksiyasına icazə verməyən ünvandan açılıb — açar qurmaq üçün https və ya localhost lazımdır.";

function subtleCrypto(): SubtleCrypto | null {
  return typeof globalThis.crypto?.subtle === "object" ? globalThis.crypto.subtle : null;
}

/* ---------- shared types ---------- */

export type RsaKeySize = 2048 | 3072 | 4096;
export const RSA_KEY_SIZES: RsaKeySize[] = [2048, 3072, 4096];

export type RsaPurpose = "sifrele" | "imzala";

export type RsaSignAlgorithm = "RSASSA-PKCS1-v1_5" | "RSA-PSS";
export const RSA_SIGN_ALGORITHMS: RsaSignAlgorithm[] = ["RSASSA-PKCS1-v1_5", "RSA-PSS"];

export type RsaHash = "SHA-256" | "SHA-384" | "SHA-512";
export const RSA_HASHES: RsaHash[] = ["SHA-256", "SHA-384", "SHA-512"];

/** Digest byte length per hash — fixed by the hash function, used for the OAEP byte-budget calculation. */
const HASH_BYTES: Record<RsaHash, number> = { "SHA-256": 32, "SHA-384": 48, "SHA-512": 64 };

/** `65537` (`0x010001`) — the public exponent every modern RSA implementation defaults to; not a visitor-facing choice. */
const PUBLIC_EXPONENT = new Uint8Array([0x01, 0x00, 0x01]);

function algorithmNameFor(purpose: RsaPurpose, signAlgorithm: RsaSignAlgorithm): "RSA-OAEP" | RsaSignAlgorithm {
  return purpose === "sifrele" ? "RSA-OAEP" : signAlgorithm;
}

/* ---------- base64 (local, self-contained — see `jwt-imza.ts` for why the tools in this folder don't share these helpers) ---------- */

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

/* ---------- PEM <-> DER ---------- */

const PEM_LINE_LENGTH = 64;
const PEM_LABELS = { public: "PUBLIC KEY", private: "PRIVATE KEY" } as const;

/** Wraps `der` as base64 in a `-----BEGIN <label>-----` envelope, 64 columns per line — the format every PEM tool expects. */
export function derToPem(der: Uint8Array<ArrayBuffer>, label: "PUBLIC KEY" | "PRIVATE KEY"): string {
  const encoded = bytesToBase64(der);
  const lines: string[] = [];
  for (let i = 0; i < encoded.length; i += PEM_LINE_LENGTH) {
    lines.push(encoded.slice(i, i + PEM_LINE_LENGTH));
  }
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

export type PemDecode = { ok: true; der: Uint8Array<ArrayBuffer>; label: string } | { ok: false; error: string };

/** The reverse of `derToPem` — tolerant of the whitespace a visitor's copy-paste tends to add or lose. */
export function pemToDer(pem: string): PemDecode {
  const match = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]+?)-----END \1-----/.exec(pem.trim());
  if (!match) {
    return { ok: false, error: "PEM formatı tanınmadı — `-----BEGIN ...-----` başlığı və uyğun sonluq axtarılır." };
  }
  const [, label, body] = match;
  const der = base64ToBytes(body.replace(/\s+/g, ""));
  if (der === null) {
    return { ok: false, error: "PEM daxilindəki Base64 düzgün deyil." };
  }
  return { ok: true, der, label };
}

/* ---------- key generation ---------- */

export type RsaGenerateResult =
  | { ok: true; publicKey: CryptoKey; privateKey: CryptoKey }
  | { ok: false; error: string };

/**
 * Builds a fresh key pair through `crypto.subtle.generateKey` — the modulus
 * size and hash the visitor picked, and the algorithm name resolved from
 * `purpose` (`RSA-OAEP` for encryption, `signAlgorithm` for signing), never
 * hand-rolled.
 */
export async function generateRsaKeyPair(
  modulusBits: RsaKeySize,
  purpose: RsaPurpose,
  hash: RsaHash,
  signAlgorithm: RsaSignAlgorithm = "RSASSA-PKCS1-v1_5",
): Promise<RsaGenerateResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };

  const name = algorithmNameFor(purpose, signAlgorithm);
  const usages: KeyUsage[] = purpose === "sifrele" ? ["encrypt", "decrypt"] : ["sign", "verify"];

  try {
    const keyPair = await subtle.generateKey(
      { name, modulusLength: modulusBits, publicExponent: PUBLIC_EXPONENT, hash },
      true,
      usages,
    );
    return { ok: true, publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
  } catch {
    return { ok: false, error: "Açar cütü qurula bilmədi — seçilmiş ölçü və ya parametrlər dəstəklənmir." };
  }
}

/* ---------- export ---------- */

export type PemExportResult = { ok: true; pem: string } | { ok: false; error: string };

export async function exportPublicKeyPem(publicKey: CryptoKey): Promise<PemExportResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };
  const der = await subtle.exportKey("spki", publicKey);
  return { ok: true, pem: derToPem(new Uint8Array(der), PEM_LABELS.public) };
}

export async function exportPrivateKeyPem(privateKey: CryptoKey): Promise<PemExportResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };
  const der = await subtle.exportKey("pkcs8", privateKey);
  return { ok: true, pem: derToPem(new Uint8Array(der), PEM_LABELS.private) };
}

export type JwkExportResult = { ok: true; jwk: JsonWebKey } | { ok: false; error: string };

export async function exportPublicKeyJwk(publicKey: CryptoKey): Promise<JwkExportResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };
  const jwk = await subtle.exportKey("jwk", publicKey);
  return { ok: true, jwk };
}

export async function exportPrivateKeyJwk(privateKey: CryptoKey): Promise<JwkExportResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };
  const jwk = await subtle.exportKey("jwk", privateKey);
  return { ok: true, jwk };
}

/* ---------- import ---------- */

export type KeyImportResult = { ok: true; key: CryptoKey } | { ok: false; error: string };

export async function importPublicKeyPem(
  pem: string,
  purpose: RsaPurpose,
  hash: RsaHash,
  signAlgorithm: RsaSignAlgorithm = "RSASSA-PKCS1-v1_5",
): Promise<KeyImportResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };
  const decoded = pemToDer(pem);
  if (!decoded.ok) return decoded;
  if (decoded.label !== PEM_LABELS.public) {
    return { ok: false, error: `PEM "${PEM_LABELS.public}" başlıqlı olmalıdır — tapılan: "${decoded.label}".` };
  }
  try {
    const key = await subtle.importKey(
      "spki",
      decoded.der,
      { name: algorithmNameFor(purpose, signAlgorithm), hash },
      true,
      purpose === "sifrele" ? ["encrypt"] : ["verify"],
    );
    return { ok: true, key };
  } catch {
    return { ok: false, error: "Açıq açar oxunmadı — PEM bu məqsəd və hash ilə RSA açarına uyğun deyil." };
  }
}

export async function importPrivateKeyPem(
  pem: string,
  purpose: RsaPurpose,
  hash: RsaHash,
  signAlgorithm: RsaSignAlgorithm = "RSASSA-PKCS1-v1_5",
): Promise<KeyImportResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };
  const decoded = pemToDer(pem);
  if (!decoded.ok) return decoded;
  if (decoded.label !== PEM_LABELS.private) {
    return { ok: false, error: `PEM "${PEM_LABELS.private}" başlıqlı olmalıdır — tapılan: "${decoded.label}".` };
  }
  try {
    const key = await subtle.importKey(
      "pkcs8",
      decoded.der,
      { name: algorithmNameFor(purpose, signAlgorithm), hash },
      true,
      purpose === "sifrele" ? ["decrypt"] : ["sign"],
    );
    return { ok: true, key };
  } catch {
    return { ok: false, error: "Gizli açar oxunmadı — PEM bu məqsəd və hash ilə RSA açarına uyğun deyil." };
  }
}

function parseJwk(text: string): { ok: true; value: JsonWebKey } | { ok: false; error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "JWK düzgün JSON deyil." };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "JWK JSON obyekt deyil." };
  }
  const kty = (value as Record<string, unknown>).kty;
  if (kty !== "RSA") {
    return { ok: false, error: `JWK "kty" sahəsi "RSA" olmalıdır — tapılan: ${JSON.stringify(kty)}.` };
  }
  return { ok: true, value: value as JsonWebKey };
}

export async function importPublicKeyJwk(
  jwkText: string,
  purpose: RsaPurpose,
  hash: RsaHash,
  signAlgorithm: RsaSignAlgorithm = "RSASSA-PKCS1-v1_5",
): Promise<KeyImportResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };
  const parsed = parseJwk(jwkText);
  if (!parsed.ok) return parsed;
  try {
    const key = await subtle.importKey(
      "jwk",
      parsed.value,
      { name: algorithmNameFor(purpose, signAlgorithm), hash },
      true,
      purpose === "sifrele" ? ["encrypt"] : ["verify"],
    );
    return { ok: true, key };
  } catch {
    return { ok: false, error: "Açıq açar oxunmadı — JWK bu məqsəd və hash ilə RSA açarına uyğun deyil." };
  }
}

export async function importPrivateKeyJwk(
  jwkText: string,
  purpose: RsaPurpose,
  hash: RsaHash,
  signAlgorithm: RsaSignAlgorithm = "RSASSA-PKCS1-v1_5",
): Promise<KeyImportResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };
  const parsed = parseJwk(jwkText);
  if (!parsed.ok) return parsed;
  try {
    const key = await subtle.importKey(
      "jwk",
      parsed.value,
      { name: algorithmNameFor(purpose, signAlgorithm), hash },
      true,
      purpose === "sifrele" ? ["decrypt"] : ["sign"],
    );
    return { ok: true, key };
  } catch {
    return { ok: false, error: "Gizli açar oxunmadı — JWK bu məqsəd və hash ilə RSA açarına uyğun deyil." };
  }
}

/* ---------- key parameters, read back from an imported or generated key ---------- */

export type RsaKeyDescription = {
  type: "public" | "private";
  modulusBits: number;
  publicExponentDecimal: string;
  hash: string;
  algorithmName: string;
};

function publicExponentToDecimal(bytes: Uint8Array<ArrayBuffer>): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value.toString();
}

/** Reads a key's own recorded parameters — nothing here is recomputed or guessed, it is what `crypto.subtle` already knows about the key. */
export function describeKey(key: CryptoKey): RsaKeyDescription {
  const algorithm = key.algorithm as RsaHashedKeyAlgorithm;
  return {
    type: key.type === "public" ? "public" : "private",
    modulusBits: algorithm.modulusLength,
    publicExponentDecimal: publicExponentToDecimal(new Uint8Array(algorithm.publicExponent)),
    hash: algorithm.hash.name,
    algorithmName: algorithm.name,
  };
}

/* ---------- RSA-OAEP encrypt / decrypt ---------- */

/** The largest plaintext (in bytes) RSA-OAEP can encrypt under a key of this size and hash — `modulusBytes - 2*hashBytes - 2`, RFC 8017 §7.1.1's own bound. */
export function maxOaepPlaintextBytes(modulusBits: number, hash: RsaHash): number {
  return Math.floor(modulusBits / 8) - 2 * HASH_BYTES[hash] - 2;
}

export type RsaEncryptResult = { ok: true; ciphertextBase64: string } | { ok: false; error: string };

export async function encryptWithPublicKey(publicKey: CryptoKey, plaintext: string): Promise<RsaEncryptResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };

  const algorithm = publicKey.algorithm as RsaHashedKeyAlgorithm;
  const hash = algorithm.hash.name as RsaHash;
  const bytes = new TextEncoder().encode(plaintext);
  const limit = maxOaepPlaintextBytes(algorithm.modulusLength, hash);

  if (bytes.length > limit) {
    return {
      ok: false,
      error: `Mətn ${bytes.length} bayt — bu açarla (${algorithm.modulusLength} bit, ${hash}) RSA-OAEP həddi ${limit} baytdır. Uzun mətn üçün hibrid üsul lazımdır: AES açarını RSA ilə şifrələ, mətnin özünü AES ilə.`,
    };
  }

  try {
    const ciphertext = await subtle.encrypt({ name: "RSA-OAEP" }, publicKey, bytes);
    return { ok: true, ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)) };
  } catch {
    return { ok: false, error: "Şifrələmə alınmadı — açar bu əməliyyat üçün qurulmayıb." };
  }
}

export type RsaDecryptResult = { ok: true; plaintext: string } | { ok: false; error: string };

export async function decryptWithPrivateKey(
  privateKey: CryptoKey,
  ciphertextBase64: string,
): Promise<RsaDecryptResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };

  const bytes = base64ToBytes(ciphertextBase64.trim());
  if (bytes === null) return { ok: false, error: "Şifrmətn düzgün Base64 deyil." };

  try {
    const plaintextBytes = await subtle.decrypt({ name: "RSA-OAEP" }, privateKey, bytes);
    return { ok: true, plaintext: new TextDecoder().decode(plaintextBytes) };
  } catch {
    return { ok: false, error: "Deşifrələmə alınmadı — gizli açar səhvdir və ya şifrmətn bu açarla şifrələnməyib." };
  }
}

/* ---------- sign / verify ---------- */

function signParamsFor(algorithm: RsaHashedKeyAlgorithm): AlgorithmIdentifier | RsaPssParams {
  if (algorithm.name === "RSA-PSS") {
    return { name: "RSA-PSS", saltLength: HASH_BYTES[algorithm.hash.name as RsaHash] };
  }
  return { name: "RSASSA-PKCS1-v1_5" };
}

export type RsaSignResult = { ok: true; signatureBase64: string } | { ok: false; error: string };

export async function signWithPrivateKey(privateKey: CryptoKey, message: string): Promise<RsaSignResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };

  const algorithm = privateKey.algorithm as RsaHashedKeyAlgorithm;
  try {
    const signature = await subtle.sign(signParamsFor(algorithm), privateKey, new TextEncoder().encode(message));
    return { ok: true, signatureBase64: bytesToBase64(new Uint8Array(signature)) };
  } catch {
    return { ok: false, error: "İmzalama alınmadı — açar bu əməliyyat üçün qurulmayıb." };
  }
}

export type RsaVerifyResult = { ok: true; valid: boolean } | { ok: false; error: string };

export async function verifyWithPublicKey(
  publicKey: CryptoKey,
  message: string,
  signatureBase64: string,
): Promise<RsaVerifyResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };

  const signatureBytes = base64ToBytes(signatureBase64.trim());
  if (signatureBytes === null) return { ok: false, error: "İmza düzgün Base64 deyil." };

  const algorithm = publicKey.algorithm as RsaHashedKeyAlgorithm;
  try {
    const valid = await subtle.verify(
      signParamsFor(algorithm),
      publicKey,
      signatureBytes,
      new TextEncoder().encode(message),
    );
    return { ok: true, valid };
  } catch {
    return { ok: false, error: "Yoxlama alınmadı — açar bu imza növü üçün qurulmayıb." };
  }
}
