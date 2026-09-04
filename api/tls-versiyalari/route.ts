import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { buildRow, buildVersionReport, TLS_VERSIONS, type TlsVersionReport } from "../../lib/tls-versiyalari";
import { inspectTls, resolveHost } from "../../lib/socket-probe";

/*
 * The TLS version-support endpoint.
 *
 * One name is resolved once, then four separate TLS handshakes are attempted
 * against the same resolved address — one per version, `minVersion` and
 * `maxVersion` pinned to it by `inspectTls`. All four run in parallel: they
 * are independent connections, and a server slow to refuse TLS 1.0 should
 * not make the modern versions wait behind it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Which versions a server accepts changes on a deploy, not between clicks. */
const CACHE_TTL_MS = 300_000;

type Outcome = { ok: true; report: TlsVersionReport } | { ok: false; message: string; status: 400 | 502 };

export async function GET(request: Request) {
  const refused = guard(request, "tls-versiyalari");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("domen") ?? "";
  const cacheKey = `tls-versiyalari:${raw.trim().toLowerCase()}`;

  const result = await cached<Outcome>(cacheKey, CACHE_TTL_MS, async () => {
    const resolved = await resolveHost(raw);
    if (!resolved.ok) return resolved;

    const outcomes = await Promise.all(
      TLS_VERSIONS.map(async (version) => ({
        version,
        outcome: await inspectTls({
          address: resolved.primary.address,
          servername: resolved.hostname,
          port: 443,
          version,
        }),
      })),
    );

    const rows = outcomes.map(({ version, outcome }) => buildRow(version, outcome));
    return { ok: true, report: buildVersionReport(resolved.hostname, resolved.primary.address, rows) };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
