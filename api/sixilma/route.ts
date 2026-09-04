import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import {
  ACCEPT_ENCODING_FOR,
  buildCompressionReport,
  ENCODING_ORDER,
  type CompressionLiveReport,
  type EncodingSample,
} from "../../lib/sixilma";
import { publicAddressesOnly } from "../../lib/safe-fetch";
import { normalizeTargetUrl } from "../../lib/safe-url";

/*
 * The compression endpoint. Same fence as `basliqlar` and `kesh-basliqlari`,
 * and the same reason for not using `fetchPublicText`: this route needs to
 * set its own `Accept-Encoding` per request, which that helper does not
 * expose, and it never reads a body — only `Content-Encoding` and
 * `Content-Length` are wanted, so the byte-budgeted body reader those other
 * tools need has nothing to do here. Four rules, all enforced here:
 *
 *   1. http and https only, on ports 80 and 443 only — `normalizeTargetUrl`.
 *   2. The host is resolved once and every address it answers with must be
 *      public — `publicAddressesOnly`, checked before any of the four
 *      requests goes out.
 *   3. Redirects are never followed; a redirect answer is read for its
 *      headers like any other and reported as itself, not chased.
 *   4. The body is requested with GET (a HEAD response would not reflect
 *      real dynamic-compression behaviour) but is always cancelled unread —
 *      `Content-Length` on the response, not the byte count of the decoded
 *      body Node's own `fetch` would otherwise hand back, is the only number
 *      this tool trusts.
 *
 * The four requests run one after another, not in parallel: a shared origin
 * server treats four simultaneous connections differently from four
 * sequential ones, and sequential is the closer match to how a browser's
 * first request for a resource actually behaves.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Compression configuration changes on a deploy, not between two clicks. */
const CACHE_TTL_MS = 300_000;

const FETCH_TIMEOUT_MS = 8_000;

const USER_AGENT = "camalali.com-alet/1.0 (+https://camalali.com/alet)";

type ProbeResult = { ok: true; sample: EncodingSample } | { ok: false; message: string };

async function probeEncoding(url: string, encoding: EncodingSample["encoding"]): Promise<ProbeResult> {
  const control = new AbortController();
  const deadline = setTimeout(() => control.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: control.signal,
      redirect: "manual",
      cache: "no-store",
      headers: { "user-agent": USER_AGENT, accept: "*/*", "accept-encoding": ACCEPT_ENCODING_FOR[encoding] },
    });

    /* Rule 4: never read. `Content-Length`, when the server sent one, already
       names the byte count that went over the wire. */
    await response.body?.cancel();

    const contentLength = response.headers.get("content-length");
    const byteSize = contentLength !== null && /^\d+$/.test(contentLength) ? Number.parseInt(contentLength, 10) : null;

    return {
      ok: true,
      sample: { encoding, chosen: response.headers.get("content-encoding"), byteSize },
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      message: aborted
        ? "Sayt 8 saniyə ərzində cavab vermədi."
        : "Saytla əlaqə qurulmadı: ünvan işləyirmi, yoxla.",
    };
  } finally {
    clearTimeout(deadline);
  }
}

type Outcome = { ok: true; report: CompressionLiveReport } | { ok: false; message: string; status: 400 | 502 };

export async function GET(request: Request) {
  const refused = guard(request, "sixilma");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("unvan") ?? "";
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return fail(target.error);

  const result = await cached<Outcome>(`sixilma:${target.url}`, CACHE_TTL_MS, async () => {
    const blocked = await publicAddressesOnly(target.hostname);
    if (blocked) return { ok: false, message: blocked, status: 400 };

    const samples: EncodingSample[] = [];
    for (const encoding of ENCODING_ORDER) {
      const probe = await probeEncoding(target.url, encoding);
      if (!probe.ok) return { ok: false, message: probe.message, status: 502 };
      samples.push(probe.sample);
    }

    const compression = buildCompressionReport(samples);
    if (!compression.ok) return { ok: false, message: "Nəticə hesablana bilmədi.", status: 502 };

    return {
      ok: true,
      report: { url: target.url, checkedAt: new Date().toISOString(), result: compression },
    };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
