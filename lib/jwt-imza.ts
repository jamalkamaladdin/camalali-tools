/**
 * JWT signing and signature verification, HS256/HS384/HS512 — the half the
 * site's other JWT tool (`jwt.ts`) refuses to do. That refusal was correct
 * for a *decoder*: it never asks a visitor for a secret. This is a different
 * tool with a different promise — the visitor is here specifically to sign
 * or check a signature, so it asks for the secret on purpose, uses it only
 * in `crypto.subtle` in the browser, and the widget must say so.
 *
 * `jwt.ts`'s Base64url helpers and JSON parsing are deliberately not
 * imported here — the two files decode the same wire format for different
 * reasons and must not depend on each other's internals, same rule `jwt.ts`
 * states for `base64.ts`.
 */

export type JwtAlgorithm = "HS256" | "HS384" | "HS512";

export const JWT_ALGORITHMS: JwtAlgorithm[] = ["HS256", "HS384", "HS512"];

const ALGORITHM_HASH: Record<JwtAlgorithm, "SHA-256" | "SHA-384" | "SHA-512"> = {
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
};

const NO_SUBTLE_ERROR =
  "Bu səhifə kriptoqrafiya funksiyasına icazə verməyən ünvandan açılıb: imzalamaq üçün https və ya localhost lazımdır.";

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

function base64UrlEncode(bytes: Uint8Array<ArrayBuffer>): string {
  return btoa(bytesToBinary(bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(part: string): Uint8Array<ArrayBuffer> | null {
  if (part === "") return null;
  let normalised = part.replaceAll("-", "+").replaceAll("_", "/");
  const remainder = normalised.length % 4;
  if (remainder === 1) return null;
  if (remainder !== 0) normalised += "=".repeat(4 - remainder);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalised)) return null;

  try {
    const binary = atob(normalised);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

type JsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

function parseJsonObject(text: string, label: string): JsonObjectResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: `${label} düzgün JSON deyil.` };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${label} JSON obyekt deyil.` };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

/** `iat`/`exp`/`nbf` are NumericDate — seconds since epoch. `null` when the claim is missing or not a finite number. */
export function claimToDate(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : null;
}

export type JwtSignResult =
  | { ok: true; token: string; header: Record<string, unknown>; payload: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Signs `payloadJson` under `headerJson`, using `algorithm` for the actual
 * HMAC regardless of whatever `alg` the visitor typed into the header text —
 * the dropdown is the single source of truth for which hash runs, so the
 * token this returns is never signed with one algorithm while its header
 * claims another. `header.alg` and `header.typ` in the returned header are
 * therefore always the resolved values, not necessarily what was typed.
 */
export async function signJwt(
  headerJson: string,
  payloadJson: string,
  secret: string,
  algorithm: JwtAlgorithm,
): Promise<JwtSignResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };

  const header = parseJsonObject(headerJson, "Header");
  if (!header.ok) return header;
  const payload = parseJsonObject(payloadJson, "Payload");
  if (!payload.ok) return payload;
  if (secret === "") return { ok: false, error: "Gizli açar boşdur." };

  const resolvedHeader = { ...header.value, alg: algorithm, typ: header.value.typ ?? "JWT" };

  const headerPart = base64UrlEncode(new TextEncoder().encode(JSON.stringify(resolvedHeader)));
  const payloadPart = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload.value)));
  const signingInput = `${headerPart}.${payloadPart}`;

  const key = await subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: ALGORITHM_HASH[algorithm] },
    false,
    ["sign"],
  );
  const signature = await subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  const signaturePart = base64UrlEncode(new Uint8Array(signature));

  return {
    ok: true,
    token: `${signingInput}.${signaturePart}`,
    header: resolvedHeader,
    payload: payload.value,
  };
}

export type JwtVerifyResult =
  | {
      ok: true;
      signatureValid: boolean;
      /** Whether the token's own `alg` header matches the algorithm chosen to verify it — a mismatch here explains a failed signature that a wrong secret did not cause. */
      algorithmMatches: boolean;
      header: Record<string, unknown>;
      payload: Record<string, unknown>;
      /** `null` exactly when the claim is absent or not a finite number. */
      expired: boolean | null;
      notYetValid: boolean | null;
    }
  | { ok: false; error: string };

export async function verifyJwt(
  token: string,
  secret: string,
  algorithm: JwtAlgorithm,
  now: Date = new Date(),
): Promise<JwtVerifyResult> {
  const subtle = subtleCrypto();
  if (!subtle) return { ok: false, error: NO_SUBTLE_ERROR };

  const trimmed = token.trim();
  if (trimmed === "") return { ok: false, error: "Boş sahə: JWT token yapışdır." };

  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      error: `Token 3 hissədən ibarət olmalıdır (header.payload.imza), tapılan hissə sayı: ${parts.length}.`,
    };
  }
  const [headerPart, payloadPart, signaturePart] = parts;

  const headerBytes = base64UrlDecode(headerPart);
  if (headerBytes === null) return { ok: false, error: "Header Base64url dekod edilmədi." };
  const payloadBytes = base64UrlDecode(payloadPart);
  if (payloadBytes === null) return { ok: false, error: "Payload Base64url dekod edilmədi." };
  const signatureBytes = base64UrlDecode(signaturePart);
  if (signatureBytes === null) return { ok: false, error: "İmza Base64url dekod edilmədi." };

  const header = parseJsonObject(new TextDecoder().decode(headerBytes), "Header");
  if (!header.ok) return header;
  const payload = parseJsonObject(new TextDecoder().decode(payloadBytes), "Payload");
  if (!payload.ok) return payload;
  if (secret === "") return { ok: false, error: "Gizli açar boşdur." };

  const key = await subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: ALGORITHM_HASH[algorithm] },
    false,
    ["verify"],
  );
  const signatureValid = await subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );

  const expDate = claimToDate(payload.value.exp);
  const nbfDate = claimToDate(payload.value.nbf);

  return {
    ok: true,
    signatureValid,
    algorithmMatches: header.value.alg === algorithm,
    header: header.value,
    payload: payload.value,
    expired: expDate ? expDate.getTime() < now.getTime() : null,
    notYetValid: nbfDate ? nbfDate.getTime() > now.getTime() : null,
  };
}
