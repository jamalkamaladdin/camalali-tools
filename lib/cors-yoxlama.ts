/**
 * CORS access arithmetic: given a target's response headers, decide whether a
 * browser sitting at a given origin would actually be allowed to read the
 * response — and if not, name the exact header that is missing or wrong.
 *
 * A CORS failure never shows up as an error a visitor can read: the browser
 * still makes the request, the server still answers, and the only trace is a
 * console line the visitor's own site swallowed. This file re-implements the
 * three checks a browser runs after the fact — origin, method, headers — as
 * pure functions over the raw header pairs a route already fetched, so the
 * judgement can be proven with fixtures instead of a live CORS failure nobody
 * can screenshot. The one rule with no browser equivalent to imitate is the
 * `*` + `credentials: true` combination: the specification forbids it outright,
 * so it is flagged the moment both headers are present, independent of
 * whether this particular visitor asked for credentials at all.
 */

export type CorsHeaderSet = {
  allowOrigin: string | null;
  allowMethods: string | null;
  allowHeaders: string | null;
  allowCredentials: string | null;
  maxAge: string | null;
  exposeHeaders: string | null;
};

/** Case-insensitive lookup over the raw pairs a fetch handed back. */
function findHeader(headers: readonly (readonly [string, string])[], name: string): string | null {
  const lower = name.toLowerCase();
  const found = headers.find(([key]) => key.toLowerCase() === lower);
  return found ? found[1] : null;
}

export function extractCorsHeaders(headers: readonly (readonly [string, string])[]): CorsHeaderSet {
  return {
    allowOrigin: findHeader(headers, "access-control-allow-origin"),
    allowMethods: findHeader(headers, "access-control-allow-methods"),
    allowHeaders: findHeader(headers, "access-control-allow-headers"),
    allowCredentials: findHeader(headers, "access-control-allow-credentials"),
    maxAge: findHeader(headers, "access-control-max-age"),
    exposeHeaders: findHeader(headers, "access-control-expose-headers"),
  };
}

/* ---------- input normalisation ---------- */

export type OriginCheck = { ok: true; origin: string } | { ok: false; error: string };

/**
 * Turns what the visitor typed into a scheme+host+port origin string, or
 * refuses it. A bare paste is read as https, the same convention
 * `normalizeTargetUrl` uses — but this function never fetches anything, it
 * only ever becomes the value of an `Origin` header, so it does not need that
 * function's port allow-list.
 */
export function normalizeOriginInput(raw: string): OriginCheck {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Mənbə (Origin) boşdur: «https://sayt.com» kimi yaz." };

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: "Mənbə ünvanı oxunmadı: «https://sayt.com» formatında yaz." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: `«${parsed.protocol.replace(":", "")}» sxemi Origin üçün keçərli deyil.` };
  }
  return { ok: true, origin: parsed.origin };
}

/** RFC 7230 `token` — the character set a header *name* is allowed to use. */
const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export type RequestHeadersCheck = { ok: true; headers: string[] } | { ok: false; error: string };

/** A comma-separated list of header names the visitor wants the preflight to ask about. Empty is valid — it means "no extra headers". */
export function parseRequestHeadersInput(raw: string): RequestHeadersCheck {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, headers: [] };

  const tokens = trimmed
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token !== "");

  for (const token of tokens) {
    if (!HEADER_TOKEN.test(token)) {
      return { ok: false, error: `«${token}» keçərli başlıq adı deyil: hərf, rəqəm və -  işarəsindən ibarət olmalıdır.` };
    }
  }
  return { ok: true, headers: tokens };
}

/* ---------- verdicts ---------- */

export type OriginVerdict = { allowed: boolean; reason: string };

/** Same normalisation `normalizeOriginInput` does, but without the bare-host guess — a header value that is not already an origin is not one. */
function tryNormalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function evaluateOriginAllowed(allowOriginHeader: string | null, requestOrigin: string): OriginVerdict {
  if (allowOriginHeader === null) {
    return { allowed: false, reason: "Access-Control-Allow-Origin başlığı yoxdur." };
  }

  const value = allowOriginHeader.trim();
  if (value === "*") {
    return { allowed: true, reason: "Access-Control-Allow-Origin dəyəri «*»: hər mənbəyə icazə var." };
  }

  const normalized = tryNormalizeOrigin(value);
  if (normalized === requestOrigin || value === requestOrigin) {
    return { allowed: true, reason: `Access-Control-Allow-Origin dəqiq «${requestOrigin}» mənbəyini adlandırır.` };
  }

  return {
    allowed: false,
    reason: `Access-Control-Allow-Origin «${value}» yazır, yazdığın «${requestOrigin}» mənbəyi ilə uyğun gəlmir.`,
  };
}

export type MethodVerdict = { allowed: boolean; reason: string; allowedMethods: string[] };

function splitTokens(value: string): string[] {
  return value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token !== "");
}

export function evaluateMethodAllowed(allowMethodsHeader: string | null, method: string): MethodVerdict {
  if (allowMethodsHeader === null) {
    return { allowed: false, reason: "Access-Control-Allow-Methods başlığı yoxdur.", allowedMethods: [] };
  }

  const methods = splitTokens(allowMethodsHeader);
  const upperMethods = methods.map((token) => token.toUpperCase());

  if (upperMethods.includes("*")) {
    return {
      allowed: true,
      reason: "Access-Control-Allow-Methods dəyəri «*»: hər metoda icazə var.",
      allowedMethods: methods,
    };
  }

  const allowed = upperMethods.includes(method.toUpperCase());
  return {
    allowed,
    reason: allowed
      ? `${method} metodu siyahıdadır.`
      : `${method} metodu Access-Control-Allow-Methods siyahısında yoxdur: ${methods.join(", ") || "(boş)"}.`,
    allowedMethods: methods,
  };
}

export type HeadersVerdict = { allowed: boolean; missing: string[]; reason: string };

/**
 * Whether every header the visitor wants to send is on the preflight's allow
 * list. An empty request-header list is vacuously allowed — there is nothing
 * for the server to have forgotten to list.
 */
export function evaluateHeadersAllowed(allowHeadersHeader: string | null, requestHeaders: string[]): HeadersVerdict {
  if (requestHeaders.length === 0) {
    return { allowed: true, missing: [], reason: "Sınaqda əlavə başlıq göstərilməyib." };
  }
  if (allowHeadersHeader === null) {
    return { allowed: false, missing: [...requestHeaders], reason: "Access-Control-Allow-Headers başlığı yoxdur." };
  }

  const allowedTokens = new Set(splitTokens(allowHeadersHeader).map((token) => token.toLowerCase()));
  const wildcard = allowedTokens.has("*");
  const missing = wildcard ? [] : requestHeaders.filter((header) => !allowedTokens.has(header.toLowerCase()));

  return {
    allowed: missing.length === 0,
    missing,
    reason:
      missing.length === 0
        ? "Bütün istənilən başlıqlara icazə var."
        : `Bu başlıq(lar) icazə siyahısında yoxdur: ${missing.join(", ")}.`,
  };
}

export type CorsFindingSeverity = "xeta" | "xeberdarliq" | "melumat";
export type CorsFinding = { id: string; severity: CorsFindingSeverity; message: string };

/**
 * The one combination the specification forbids outright: a browser refuses
 * to expose a credentialed response when the allow-list is the wildcard,
 * regardless of whether this particular request even carried credentials.
 * Flagged from the headers alone, because the server publishing both at once
 * is the misconfiguration — not something the visitor's request triggered.
 */
export function evaluateCredentialsRisk(
  allowOriginHeader: string | null,
  allowCredentialsHeader: string | null,
): CorsFinding | null {
  if (allowOriginHeader === null || allowCredentialsHeader === null) return null;
  const credentialsTrue = allowCredentialsHeader.trim().toLowerCase() === "true";
  if (credentialsTrue && allowOriginHeader.trim() === "*") {
    return {
      id: "wildcard-with-credentials",
      severity: "xeta",
      message:
        "Access-Control-Allow-Origin «*» və Access-Control-Allow-Credentials «true» birlikdə göndərilib: bu kombinasiya spesifikasiyaya ziddir və brauzer cavabı özü rədd edir. Konkret mənbə adı yazılmalıdır.",
    };
  }
  return null;
}

/* ---------- the combined report ---------- */

export type CorsRequestInput = { origin: string; method: string; requestHeaders: string[] };

export type CorsPhaseReport = {
  headers: CorsHeaderSet;
  status: number;
  originVerdict: OriginVerdict;
};

export type CorsPreflightReport = CorsPhaseReport & {
  methodVerdict: MethodVerdict;
  headersVerdict: HeadersVerdict;
};

export type CorsReport = {
  requestOrigin: string;
  method: string;
  requestHeaders: string[];
  /** The plain `GET` request a browser always sends, `Origin` header and all — CORS only ever hides the response, never stops the request. */
  simple: CorsPhaseReport;
  /** The `OPTIONS` preflight, sent ahead of any request the browser judges "not simple". */
  preflight: CorsPreflightReport;
  overallAllowed: boolean;
  findings: CorsFinding[];
};

/**
 * Combines both fetched responses into one verdict. Pure: the route does the
 * two network calls and hands the raw status/headers here, so every
 * judgement can be proven with fixtures instead of a live server.
 */
export function buildCorsReport(
  input: CorsRequestInput,
  simple: { status: number; headers: readonly (readonly [string, string])[] },
  preflight: { status: number; headers: readonly (readonly [string, string])[] },
): CorsReport {
  const simpleHeaders = extractCorsHeaders(simple.headers);
  const preflightHeaders = extractCorsHeaders(preflight.headers);

  const simpleOriginVerdict = evaluateOriginAllowed(simpleHeaders.allowOrigin, input.origin);
  const preflightOriginVerdict = evaluateOriginAllowed(preflightHeaders.allowOrigin, input.origin);
  const methodVerdict = evaluateMethodAllowed(preflightHeaders.allowMethods, input.method);
  const headersVerdict = evaluateHeadersAllowed(preflightHeaders.allowHeaders, input.requestHeaders);

  const findings: CorsFinding[] = [];
  const simpleCredRisk = evaluateCredentialsRisk(simpleHeaders.allowOrigin, simpleHeaders.allowCredentials);
  if (simpleCredRisk) findings.push(simpleCredRisk);
  const preflightCredRisk = evaluateCredentialsRisk(preflightHeaders.allowOrigin, preflightHeaders.allowCredentials);
  if (preflightCredRisk && preflightCredRisk.message !== simpleCredRisk?.message) findings.push(preflightCredRisk);

  if (preflight.status >= 400) {
    findings.push({
      id: "preflight-http-error",
      severity: "xeta",
      message: `Preflight sorğusu HTTP ${preflight.status} qaytardı: brauzer bunu rədd sayır, əsl sorğu heç göndərilmir.`,
    });
  }

  const overallAllowed =
    preflightOriginVerdict.allowed && methodVerdict.allowed && headersVerdict.allowed && preflight.status < 400;

  return {
    requestOrigin: input.origin,
    method: input.method,
    requestHeaders: input.requestHeaders,
    simple: { headers: simpleHeaders, status: simple.status, originVerdict: simpleOriginVerdict },
    preflight: {
      headers: preflightHeaders,
      status: preflight.status,
      originVerdict: preflightOriginVerdict,
      methodVerdict,
      headersVerdict,
    },
    overallAllowed,
    findings,
  };
}
