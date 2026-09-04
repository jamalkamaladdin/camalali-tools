import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { evaluateHsts, type HstsReport } from "../../lib/hsts";
import { publicAddressesOnly } from "../../lib/safe-fetch";
import { normalizeTargetUrl } from "../../lib/safe-url";

/*
 * The HSTS endpoint, and — like `basliqlar` — a route that fetches an address
 * a stranger chose rather than a route that lets `fetchPublicText` do it,
 * because it needs two things that helper does not give: a request forced
 * onto plain http (to check whether the header leaks there and whether http
 * redirects to https at all) and a request forced onto https, regardless of
 * which scheme the visitor typed. Same fence as every tool that does this by
 * hand, four rules, all enforced here:
 *
 *   1. http and https only, on ports 80 and 443 only — `normalizeTargetUrl`.
 *   2. The host is resolved and every address it answers with must be public
 *      — `publicAddressesOnly`. One private answer refuses both requests.
 *   3. Redirects are never followed. `redirect: "manual"` turns a 3xx into
 *      data this route reads (`Location`, for the http-to-https check)
 *      rather than a second request this server makes on the visitor's
 *      behalf.
 *   4. Only headers are wanted, so HEAD is tried first and a GET fallback has
 *      its body cancelled unread.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* HSTS changes when somebody deploys, not between two clicks. */
const CACHE_TTL_MS = 300_000;

const FETCH_TIMEOUT_MS = 8_000;

/* Named honestly so an operator who sees it in their log knows who called. */
const USER_AGENT = "camalali.com-alet/1.0 (+https://camalali.com/alet)";

type SchemeFetch =
  | { ok: true; headerValue: string | null; redirectsToHttps: boolean | null }
  | { ok: false; message: string };

/**
 * One scheme-forced request, headers only.
 *
 * `redirectsToHttps` is only meaningful for the http call: it is null for the
 * https call, and for the http call it is true exactly when the 3xx the
 * server answered with points at an https URL on the same host.
 */
async function readScheme(url: string, checkRedirect: boolean): Promise<SchemeFetch> {
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

    let redirectsToHttps: boolean | null = null;
    if (checkRedirect) {
      const location = response.headers.get("location");
      redirectsToHttps =
        response.status >= 300 &&
        response.status < 400 &&
        location !== null &&
        new URL(location, url).protocol === "https:";
    }

    return {
      ok: true,
      headerValue: response.headers.get("strict-transport-security"),
      redirectsToHttps,
    };
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

type Outcome =
  | { ok: true; report: HstsReport }
  | { ok: false; message: string; status: 400 | 502 };

export async function GET(request: Request) {
  const refused = guard(request, "hsts");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("unvan") ?? "";
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return fail(target.error);

  const host = new URL(target.url).host;

  const result = await cached<Outcome>(`hsts:${host}`, CACHE_TTL_MS, async () => {
    const blocked = await publicAddressesOnly(target.hostname);
    if (blocked) return { ok: false, message: blocked, status: 400 };

    const httpsFetch = await readScheme(`https://${host}/`, false);
    if (!httpsFetch.ok) return { ok: false, message: httpsFetch.message, status: 502 };

    const httpFetch = await readScheme(`http://${host}/`, true);
    /* The plain-http leg is informative, not load-bearing: a site that
       refuses http outright (a firewall, a host that only ever answers on
       443) has already answered the redirect question the strongest way
       there is, so a failure here is not reported as the tool's failure. */
    const httpValue = httpFetch.ok ? httpFetch.headerValue : null;
    const httpRedirectsToHttps = httpFetch.ok ? httpFetch.redirectsToHttps : null;

    return {
      ok: true,
      report: evaluateHsts({
        httpsValue: httpsFetch.headerValue,
        httpValue,
        httpRedirectsToHttps,
      }),
    };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
