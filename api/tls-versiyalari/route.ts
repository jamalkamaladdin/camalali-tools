import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { buildRow, buildVersionReport, TLS_VERSIONS, type TlsVersionReport } from "../../lib/tls-versiyalari";
import { inspectTls, probeAcrossFamilies, probePort, resolveHost, type ProbeFail, type PortResult } from "../../lib/socket-probe";

/*
 * The TLS version-support endpoint.
 *
 * One name is resolved once, then four separate TLS handshakes are attempted
 * against the same resolved address — one per version, `minVersion` and
 * `maxVersion` pinned to it by `inspectTls`. All four run in parallel: they
 * are independent connections, and a server slow to refuse TLS 1.0 should
 * not make the modern versions wait behind it.
 *
 * Which address the four go to is settled first, by one TCP connect raced
 * across the families (`probeAcrossFamilies`). That connect is the fifth
 * connection this route makes and it is worth the cost twice over. A
 * dual-stack host resolves to its IPv6 address first, and where that route is
 * advertised but dead all four handshakes used to time out and the page said
 * the server supports no TLS at all — the worst answer available, because it
 * is confidently wrong. It also separates the two questions that were being
 * conflated: a port nothing answers on is now named as such instead of being
 * reported as four unsupported versions.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Which versions a server accepts changes on a deploy, not between clicks. */
const CACHE_TTL_MS = 300_000;

type Outcome = { ok: true; report: TlsVersionReport } | { ok: false; message: string; status: 400 | 502 };

/**
 * Turns a closed or silent port into a sentence about the connection.
 *
 * The three verdicts lead to three different next steps for whoever is
 * debugging, so they are not folded together: a refusal is a machine that
 * answered, a timeout is a packet dropped in silence, and neither of them is
 * a statement about which TLS versions the server would support if it were
 * reachable.
 */
function portFailure(hostname: string, port: PortResult): ProbeFail {
  if (port.verdict === "refused") {
    return {
      ok: false,
      message: `«${hostname}» 443 portunda əlaqəni rədd etdi: bu ünvanda TLS xidməti dinləmir.`,
      status: 502,
    };
  }
  if (port.verdict === "timeout") {
    return {
      ok: false,
      message: `«${hostname}» 443 portunda ${port.ms} ms ərzində cavab vermədi: versiyalar yoxlana bilmədi.`,
      status: 502,
    };
  }
  return {
    ok: false,
    message: `«${hostname}» ünvanına şəbəkə yolu yoxdur: versiyalar yoxlana bilmədi.`,
    status: 502,
  };
}

export async function GET(request: Request) {
  const refused = guard(request, "tls-versiyalari");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("domen") ?? "";
  const cacheKey = `tls-versiyalari:${raw.trim().toLowerCase()}`;

  const result = await cached<Outcome>(cacheKey, CACHE_TTL_MS, async () => {
    const resolved = await resolveHost(raw);
    if (!resolved.ok) return resolved;

    const reached = await probeAcrossFamilies(resolved.addresses, async ({ address }) => {
      const port = await probePort(address, 443);
      return port.verdict === "open"
        ? ({ ok: true, ms: port.ms } as const)
        : portFailure(resolved.hostname, port);
    });
    if (!reached.ok) return reached;

    const outcomes = await Promise.all(
      TLS_VERSIONS.map(async (version) => ({
        version,
        outcome: await inspectTls({
          address: reached.address,
          servername: resolved.hostname,
          port: 443,
          version,
        }),
      })),
    );

    const rows = outcomes.map(({ version, outcome }) => buildRow(version, outcome));
    return { ok: true, report: buildVersionReport(resolved.hostname, reached.address, rows) };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
