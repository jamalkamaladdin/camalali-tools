import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { buildCacheReport, type CacheHeadersReport } from "../../lib/kesh-basliqlari";
import { publicAddressesOnly } from "../../lib/safe-fetch";
import { normalizeTargetUrl } from "../../lib/safe-url";

/*
 * The cache-headers endpoint. Same shape as `basliqlar`, and for the same
 * reason it does not use `fetchPublicText`: only headers are wanted, so HEAD
 * is tried first and a GET fallback has its body cancelled unread — narrower
 * than the byte-budgeted body read every other tool needs. The fence is the
 * same four rules:
 *
 *   1. http and https only, on ports 80 and 443 only — `normalizeTargetUrl`.
 *   2. The host is resolved and every address it answers with must be public
 *      — `publicAddressesOnly`. One private answer refuses the request.
 *   3. Redirects are never followed; a 3xx is reported, not chased.
 *   4. The body is never read.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Cache headers change on a deploy, not between two clicks. */
const CACHE_TTL_MS = 300_000;

const FETCH_TIMEOUT_MS = 8_000;

const USER_AGENT = "camalali.com-alet/1.0 (+https://camalali.com/alet)";

type FetchResult =
  | { ok: true; status: number; headers: [string, string][] }
  | { ok: false; message: string };

async function readHeaders(url: string): Promise<FetchResult> {
  const control = new AbortController();
  const deadline = setTimeout(() => control.abort(), FETCH_TIMEOUT_MS);

  const call = (method: "HEAD" | "GET") =>
    fetch(url, {
      method,
      signal: control.signal,
      redirect: "manual",
      cache: "no-store",
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
    });

  try {
    let response = await call("HEAD");
    await response.body?.cancel();
    if ([400, 403, 405, 501].includes(response.status)) {
      response = await call("GET");
      await response.body?.cancel();
    }

    return { ok: true, status: response.status, headers: [...response.headers.entries()] };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      message: aborted
        ? "Sayt 8 saniyə ərzində cavab vermədi."
        : "Saytla əlaqə qurulmadı — ünvan işləyirmi, yoxla.",
    };
  } finally {
    clearTimeout(deadline);
  }
}

function headerValue(headers: [string, string][], name: string): string | null {
  const found = headers.find(([key]) => key.toLowerCase() === name);
  return found ? found[1] : null;
}

type Outcome = { ok: true; report: CacheHeadersReport } | { ok: false; message: string; status: 400 | 502 };

export async function GET(request: Request) {
  const refused = guard(request, "kesh-basliqlari");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("unvan") ?? "";
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return fail(target.error);

  const result = await cached<Outcome>(`kesh-basliqlari:${target.url}`, CACHE_TTL_MS, async () => {
    const blocked = await publicAddressesOnly(target.hostname);
    if (blocked) return { ok: false, message: blocked, status: 400 };

    const fetched = await readHeaders(target.url);
    if (!fetched.ok) return { ok: false, message: fetched.message, status: 502 };

    const report = buildCacheReport({
      cacheControl: headerValue(fetched.headers, "cache-control"),
      etag: headerValue(fetched.headers, "etag"),
      lastModified: headerValue(fetched.headers, "last-modified"),
      expires: headerValue(fetched.headers, "expires"),
      vary: headerValue(fetched.headers, "vary"),
      age: headerValue(fetched.headers, "age"),
      pragma: headerValue(fetched.headers, "pragma"),
    });

    return {
      ok: true,
      report: { ...report, url: target.url, status: fetched.status, checkedAt: new Date().toISOString() },
    };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
