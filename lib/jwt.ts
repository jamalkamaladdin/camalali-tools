/**
 * JWT decoding only — no signature verification. Verifying a signature needs
 * the issuer's secret or public key, and a client-side tool must never ask a
 * visitor to paste that in; this module reads header and payload and reports
 * timing, nothing more.
 */

const decoder = new TextDecoder("utf-8", { fatal: true });

export type JwtHeader = Record<string, unknown>;
export type JwtPayload = Record<string, unknown>;

export type JwtResult =
  | {
      ok: true;
      header: JwtHeader;
      payload: JwtPayload;
      signature: string;
      warnings: string[];
      /** `null` when `exp`/`nbf` is absent or not a finite number — see `warnings` for the latter. */
      expired: boolean | null;
      notYetValid: boolean | null;
    }
  | { ok: false; error: string };

type PartResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * Base64url decode, written independently of src/lib/tools/base64.ts — the
 * two tools must not depend on each other's internals.
 */
function decodeBase64UrlPart(part: string): PartResult {
  if (part === "") {
    return { ok: false, error: "hissə boşdur." };
  }

  let normalised = part.replaceAll("-", "+").replaceAll("_", "/");
  const remainder = normalised.length % 4;
  if (remainder === 1) {
    return { ok: false, error: "uzunluq Base64url ilə uyğun gəlmir." };
  }
  if (remainder !== 0) normalised += "=".repeat(4 - remainder);

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalised)) {
    return { ok: false, error: "Base64url əlifbasına aid olmayan simvol var." };
  }

  try {
    const binary = atob(normalised);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return { ok: true, text: decoder.decode(bytes) };
  } catch {
    return { ok: false, error: "dekod alındı, amma UTF-8 mətn deyil." };
  }
}

function parseJsonObject(
  text: string,
  label: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
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

/**
 * `iat`/`exp`/`nbf` are NumericDate — seconds since epoch. `null` when the
 * claim is missing or is not a finite number (a malformed token, not a bug).
 */
export function claimToDate(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;
}

export function decodeJwt(token: string, now: Date = new Date()): JwtResult {
  const trimmed = token.trim();
  if (trimmed === "") {
    return { ok: false, error: "Boş sahə: JWT token yapışdır." };
  }

  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      error: `Token 3 hissədən ibarət olmalıdır (header.payload.imza), tapılan hissə sayı: ${parts.length}.`,
    };
  }

  const [headerPart, payloadPart, signaturePart] = parts;

  const headerText = decodeBase64UrlPart(headerPart);
  if (!headerText.ok) return { ok: false, error: `Header ${headerText.error}` };

  const payloadText = decodeBase64UrlPart(payloadPart);
  if (!payloadText.ok) return { ok: false, error: `Payload ${payloadText.error}` };

  const header = parseJsonObject(headerText.text, "Header");
  if (!header.ok) return { ok: false, error: header.error };

  const payload = parseJsonObject(payloadText.text, "Payload");
  if (!payload.ok) return { ok: false, error: payload.error };

  const warnings: string[] = [];

  if (header.value.alg === "none") {
    warnings.push(
      'Header-də alg dəyəri "none": bu token imzasızdır, məzmununu heç bir açar olmadan dəyişmək mümkündür.',
    );
  }

  const checkNumericClaim = (claim: "iat" | "exp" | "nbf") => {
    const raw = payload.value[claim];
    if (raw !== undefined && claimToDate(raw) === null) {
      warnings.push(`${claim} claim-i rəqəm deyil: vaxt hesablana bilmədi.`);
    }
  };
  checkNumericClaim("iat");
  checkNumericClaim("exp");
  checkNumericClaim("nbf");

  const expDate = claimToDate(payload.value.exp);
  const nbfDate = claimToDate(payload.value.nbf);

  return {
    ok: true,
    header: header.value,
    payload: payload.value,
    signature: signaturePart,
    warnings,
    expired: expDate ? expDate.getTime() < now.getTime() : null,
    notYetValid: nbfDate ? nbfDate.getTime() > now.getTime() : null,
  };
}

/** Short Azerbaijani gloss for the handful of registered claims worth calling out. */
export const STANDARD_CLAIM_NOTES: Record<string, string> = {
  iss: "İssuer: token-i buraxan xidmət.",
  sub: "Subject: token-in aid olduğu istifadəçi və ya varlıq.",
  aud: "Audience: token-i qəbul etməli olan xidmət.",
  jti: "JWT ID: bu konkret token-in unikal identifikatoru.",
  scope: "Scope: token-in icazə verdiyi əməliyyatların siyahısı.",
  azp: "Authorized party: token-i tələb edən client tətbiq.",
};
