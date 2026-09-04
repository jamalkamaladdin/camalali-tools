import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { publicAddressesOnly } from "../../lib/safe-fetch";
import { normalizeTargetUrl } from "../../lib/safe-url";
import {
  buildCorsReport,
  normalizeOriginInput,
  parseRequestHeadersInput,
  type CorsReport,
} from "../../lib/cors-yoxlama";

/*
 * Sends the two requests a browser sends when it decides whether JavaScript
 * gets to read a cross-origin response — a plain GET with an `Origin` header,
 * and an `OPTIONS` preflight naming the method and headers the real request
 * would use — and reports what the target answered with.
 *
 * Same fence as every other tool that fetches a visitor-typed address:
 * `normalizeTargetUrl` restricts the scheme and port, `publicAddressesOnly`
 * refuses anything that resolves inside this network, and neither call ever
 * follows a redirect — a 3xx is reported as a status, not chased, which
 * matches what a real preflight does (browsers never follow a preflight
 * redirect either). Only headers matter here, so both bodies are read and
 * discarded unread rather than budgeted like `og-onizleme`'s does.
 *
 * The one input this route sends verbatim into a request header — the
 * visitor's `Origin` — is never taken as raw text: `normalizeOriginInput`
 * reduces it to a `URL.origin` string first, which cannot contain a newline
 * or anything else `fetch`'s header validation would need to catch.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* A visitor iterating on their own CORS config wants the next click to see
   the next deploy, not a five-minute-old answer. */
const CACHE_TTL_MS = 120_000;

const FETCH_TIMEOUT_MS = 8_000;

const USER_AGENT = "camalali.com-alet/1.0 (+https://camalali.com/alet)";

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

type CallResult =
  | { ok: true; status: number; headers: [string, string][] }
  | { ok: false; message: string };

/** One request, headers-only: the body is never wanted, so it is cancelled the moment the status line is in. */
async function callOnce(url: string, method: string, extraHeaders: Record<string, string>): Promise<CallResult> {
  const control = new AbortController();
  const deadline = setTimeout(() => control.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      signal: control.signal,
      /* Neither a real preflight nor this diagnostic follows a redirect —
         chasing one here would silently test a different address than the
         one the visitor typed. */
      redirect: "manual",
      cache: "no-store",
      headers: { "user-agent": USER_AGENT, accept: "*/*", ...extraHeaders },
    });
    await response.body?.cancel().catch(() => undefined);
    return { ok: true, status: response.status, headers: [...response.headers.entries()] };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      message: aborted ? "Sayt 8 saniyə ərzində cavab vermədi." : "Saytla əlaqə qurulmadı: ünvan işləyirmi, yoxla.",
    };
  } finally {
    clearTimeout(deadline);
  }
}

type Outcome =
  | { ok: true; report: CorsReport & { url: string; checkedAt: string } }
  | { ok: false; message: string; status: 400 | 502 };

export async function GET(request: Request) {
  const refused = guard(request, "cors-yoxlama");
  if (refused) return refused;

  const params = new URL(request.url).searchParams;

  const target = normalizeTargetUrl(params.get("unvan") ?? "");
  if (!target.ok) return fail(target.error);

  const originCheck = normalizeOriginInput(params.get("menbe") ?? "");
  if (!originCheck.ok) return fail(originCheck.error);

  const rawMethod = (params.get("metod") ?? "").toUpperCase();
  if (!ALLOWED_METHODS.has(rawMethod)) {
    return fail(`«${rawMethod}» metodu dəstəklənmir: GET, POST, PUT, PATCH və ya DELETE seç.`);
  }

  const headersCheck = parseRequestHeadersInput(params.get("basliqlar") ?? "");
  if (!headersCheck.ok) return fail(headersCheck.error);

  const cacheKey = `cors-yoxlama:${target.url}:${originCheck.origin}:${rawMethod}:${headersCheck.headers.join(",")}`;

  const result = await cached<Outcome>(cacheKey, CACHE_TTL_MS, async () => {
    const blocked = await publicAddressesOnly(target.hostname);
    if (blocked) return { ok: false, message: blocked, status: 400 };

    const [simple, preflight] = await Promise.all([
      callOnce(target.url, "GET", { origin: originCheck.origin }),
      callOnce(target.url, "OPTIONS", {
        origin: originCheck.origin,
        "access-control-request-method": rawMethod,
        ...(headersCheck.headers.length > 0
          ? { "access-control-request-headers": headersCheck.headers.join(", ") }
          : {}),
      }),
    ]);

    if (!simple.ok) return { ok: false, message: simple.message, status: 502 };
    if (!preflight.ok) return { ok: false, message: preflight.message, status: 502 };

    const report = buildCorsReport(
      { origin: originCheck.origin, method: rawMethod, requestHeaders: headersCheck.headers },
      simple,
      preflight,
    );

    return { ok: true, report: { ...report, url: target.url, checkedAt: new Date().toISOString() } };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
