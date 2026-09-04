import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { buildHeaderReport, type HeaderReport } from "../../lib/basliqlar";
import { publicAddressesOnly } from "../../lib/safe-fetch";
import { normalizeTargetUrl } from "../../lib/safe-url";

/*
 * The response-header endpoint, and the one route on this site that fetches an
 * address a stranger chose.
 *
 * That is the classic server-side request forgery shape. Unguarded, this hands
 * anybody a client that lives inside the server's own network: it can reach
 * 127.0.0.1, the container next door, and 169.254.169.254 - the cloud metadata
 * service, which answers without any authentication at all. Four rules keep it
 * shut, and all four are here rather than spread around:
 *
 *   1. http and https only, on ports 80 and 443 only. Enforced in
 *      `normalizeTargetUrl` (`safe-url.ts`), so `file:`, `gopher:` and a port
 *      sweep are gone before anything is resolved.
 *   2. The host name is resolved first and EVERY address it answers with must
 *      be public. One private answer refuses the whole request, because a name
 *      with two A records only needs one of them to point inward. That is
 *      `publicAddressesOnly` in `safe-fetch.ts`.
 *   3. Redirects are not followed. `redirect: "manual"` means a 302 to
 *      http://127.0.0.1/ comes back as a 302 the visitor is shown, not as a
 *      request this server makes - following it would walk around rule 2 in a
 *      single hop.
 *   4. The body is never read. Only headers are wanted, so HEAD is tried
 *      first and a GET fallback has its body cancelled unread; nothing a
 *      stranger's server writes ends up in this process's memory.
 *
 * What is left is the DNS rebinding window: the name could resolve to a public
 * address for the check and to a private one for the connection microseconds
 * later. Closing that needs a connection pinned to the checked IP, which means
 * driving TLS by hand and losing SNI and certificate validation with it. The
 * tool takes the narrower risk instead, and this comment is the record of that
 * choice rather than an oversight.
 *
 * `upstream()` from `api-route.ts` is deliberately not used here: it hardcodes
 * `redirect: "follow"` and reads the body, which are exactly rules 3 and 4.
 *
 * Rules 1 and 2 are shared with the other tools that fetch a typed address and
 * live in `safe-url.ts` and `safe-fetch.ts`. Rules 3 and 4 stay here, because
 * this is the one tool that wants no body at all: it tries HEAD first and only
 * falls back to GET for servers that refuse it, which is narrower than the
 * byte-budgeted read `fetchPublicText` does for everybody else.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Response headers change when somebody deploys, not between two clicks. */
const CACHE_TTL_MS = 300_000;

const FETCH_TIMEOUT_MS = 8_000;

/* Named honestly so an operator who sees it in their log knows who called. */
const USER_AGENT = "camalali.com-alet/1.0 (+https://camalali.com/alet)";

type FetchResult =
  | { ok: true; status: number; redirectedTo: string | null; headers: [string, string][] }
  | { ok: false; message: string };

async function readHeaders(url: string): Promise<FetchResult> {
  const control = new AbortController();
  const deadline = setTimeout(() => control.abort(), FETCH_TIMEOUT_MS);

  const call = (method: "HEAD" | "GET") =>
    fetch(url, {
      method,
      signal: control.signal,
      /* Rule 3. Also the reason a 3xx below is reported rather than chased. */
      redirect: "manual",
      cache: "no-store",
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
    });

  try {
    let response = await call("HEAD");

    /* Rule 4: the body is dropped without being read. A server that refuses
       HEAD (405/501, and in practice some WAFs answer 403 or 400) still
       answers GET, and the headers are the same either way. */
    await response.body?.cancel();
    if ([400, 403, 405, 501].includes(response.status)) {
      response = await call("GET");
      await response.body?.cancel();
    }

    const location = response.headers.get("location");
    const redirectedTo =
      response.status >= 300 && response.status < 400 && location
        ? new URL(location, url).toString()
        : null;

    return {
      ok: true,
      status: response.status,
      redirectedTo,
      headers: [...response.headers.entries()],
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
  | { ok: true; report: HeaderReport }
  /* A refused address is the visitor's input being wrong (400); an unreachable
     site is the far end failing (502). The two read very differently to
     anybody watching the network tab, so they are not merged. */
  | { ok: false; message: string; status: 400 | 502 };

export async function GET(request: Request) {
  const refused = guard(request, "basliqlar");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("unvan") ?? "";
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return fail(target.error);

  const result = await cached<Outcome>(`basliqlar:${target.url}`, CACHE_TTL_MS, async () => {
    const blocked = await publicAddressesOnly(target.hostname);
    if (blocked) return { ok: false, message: blocked, status: 400 };

    const fetched = await readHeaders(target.url);
    if (!fetched.ok) return { ok: false, message: fetched.message, status: 502 };

    return {
      ok: true,
      report: buildHeaderReport({
        url: target.url,
        status: fetched.status,
        redirectedTo: fetched.redirectedTo,
        headers: fetched.headers,
        checkedAt: new Date().toISOString(),
      }),
    };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
