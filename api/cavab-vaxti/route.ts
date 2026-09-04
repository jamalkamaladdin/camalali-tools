import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { normalizeTargetUrl } from "../../lib/safe-url";
import { measurePhases, resolveHost } from "../../lib/socket-probe";
import { buildBreakdown, type CavabVaxtiReport, type PhaseSample } from "../../lib/cavab-vaxti";

/*
 * The response-time endpoint, built on `socket-probe.ts` rather than
 * `safe-fetch.ts` — the one tool on this site that has to be, because the
 * whole point is the phase-by-phase timing `fetch` collapses away. Every
 * other rule here is the same fence every other network tool has:
 *
 *   1. http and https only, on ports 80 and 443 only, via `normalizeTargetUrl`.
 *   2. The host is resolved once, up front, and every address it answers with
 *      is judged by `isBlockedAddress` inside `resolveHost` — a name with a
 *      public and a private A record refuses the whole request. The socket
 *      then connects to that resolved address, never to the name again, which
 *      closes the DNS-rebind window between the check and the connection.
 *   3. Each of the three measured connections carries its own deadline
 *      (`PROBE_TIMEOUT_MS` inside `socket-probe.ts`) and is destroyed on it.
 *   4. Only the status line and headers are ever read off the socket; the
 *      body is never requested past that point (`measurePhases` stops at the
 *      blank line and destroys the connection).
 *
 * DNS is resolved once and its cost reused across all three connections
 * rather than looked up three times: a resolver answer does not meaningfully
 * change between two clicks, and re-querying it three times would measure the
 * resolver's caching, not the site.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Short on purpose: the whole point of this tool is what the network is doing
   right now, and a five-minute-old answer would misreport that. It exists
   only to blunt an impatient double-click on the same address. */
const CACHE_TTL_MS = 20_000;

const SAMPLE_COUNT = 3;

type Outcome = { ok: true; report: CavabVaxtiReport } | { ok: false; message: string; status: 400 | 502 };

export async function GET(request: Request) {
  const refused = guard(request, "cavab-vaxti");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("unvan") ?? "";
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return fail(target.error);

  const parsed = new URL(target.url);
  const secure = target.protocol === "https:";
  const path = `${parsed.pathname}${parsed.search}` || "/";

  const result = await cached<Outcome>(`cavab-vaxti:${target.url}`, CACHE_TTL_MS, async () => {
    const resolved = await resolveHost(target.hostname);
    if (!resolved.ok) return { ok: false, message: resolved.message, status: resolved.status };

    const samples: PhaseSample[] = [];
    for (let attempt = 0; attempt < SAMPLE_COUNT; attempt += 1) {
      const timing = await measurePhases({
        address: resolved.primary.address,
        hostname: target.hostname,
        path,
        secure,
        dnsMs: resolved.ms,
      });
      if (!timing.ok) return { ok: false, message: timing.message, status: timing.status };

      samples.push({
        dnsMs: timing.dnsMs,
        tcpMs: timing.tcpMs,
        tlsMs: timing.tlsMs,
        ttfbMs: timing.ttfbMs,
        totalMs: timing.totalMs,
      });
    }

    const breakdown = buildBreakdown(samples);
    if (!breakdown.ok) {
      return { ok: false, message: "Ölçmə nəticəsi hesablana bilmədi.", status: 502 };
    }

    return {
      ok: true,
      report: {
        hostname: target.hostname,
        url: target.url,
        address: resolved.primary.address,
        addressFamily: resolved.primary.family,
        secure,
        breakdown: breakdown.breakdown,
        checkedAt: new Date().toISOString(),
      },
    };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
