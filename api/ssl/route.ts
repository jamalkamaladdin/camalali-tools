import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { buildSslReport, type SslReport } from "../../lib/ssl";
import { inspectTls, probeAcrossFamilies, resolveHost } from "../../lib/socket-probe";

/*
 * The SSL certificate endpoint.
 *
 * Same fence as every route built on `socket-probe.ts`: the visitor's name is
 * resolved and judged by `isBlockedAddress` before anything connects, and the
 * connection itself goes to the resolved address with the name carried
 * separately as SNI. `inspectTls` does the handshake; this file only decides
 * what to cache and how to shape the failure.
 *
 * Which resolved address is dialled is not this file's decision either.
 * `probeAcrossFamilies` makes it, for the reason written above it: the first
 * address is IPv6 on every dual-stack site, and a dead IPv6 route turned a
 * valid certificate into a six-second timeout and a red page.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* A certificate does not change between two clicks a minute apart. */
const CACHE_TTL_MS = 300_000;

type Outcome = { ok: true; report: SslReport } | { ok: false; message: string; status: 400 | 502 };

export async function GET(request: Request) {
  const refused = guard(request, "ssl");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("domen") ?? "";
  const cacheKey = `ssl:${raw.trim().toLowerCase()}`;

  const result = await cached<Outcome>(cacheKey, CACHE_TTL_MS, async () => {
    const resolved = await resolveHost(raw);
    if (!resolved.ok) return resolved;

    const reached = await probeAcrossFamilies(resolved.addresses, ({ address }) =>
      inspectTls({ address, servername: resolved.hostname, port: 443 }),
    );
    if (!reached.ok) return reached;

    return { ok: true, report: buildSslReport(resolved.hostname, reached.result) };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
