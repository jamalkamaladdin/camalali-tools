import { Resolver } from "node:dns/promises";

import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { dnsErrorMessage, normalizeDomain } from "../../lib/dns";
import { buildDnssecReport, compareDelegation, parentZoneOf, type DelegationResult, type DnssecReport } from "../../lib/dnssec";
import { isBlockedAddress } from "../../lib/safe-url";

/*
 * The DNSSEC endpoint.
 *
 * Reads `src/lib/tools/dnssec.ts`'s file header before touching this file:
 * Node's `dns` module cannot query DS, DNSKEY or RRSIG at all, so this route
 * does not try to. What it does instead is a real second lookup — asking the
 * parent zone's own nameserver, directly, which NS records it delegates for
 * this domain, and comparing that against what the domain's own zone
 * answers with. That second query is the one place this route reaches
 * outside the domain the visitor typed, to a nameserver address it resolved
 * itself, so it is checked against `isBlockedAddress` exactly like every
 * other server-chosen address on this site before anything is sent to it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60_000;
const QUERY_TIMEOUT_MS = 4_000;
const QUERY_TRIES = 2;

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
}

/** The first resolved address for a nameserver hostname, IPv4 tried before IPv6. */
async function resolveNsAddress(resolver: Resolver, hostname: string): Promise<string | null> {
  try {
    const v4 = await resolver.resolve4(hostname);
    if (v4.length > 0) return v4[0];
  } catch {
    /* fall through to AAAA */
  }
  try {
    const v6 = await resolver.resolve6(hostname);
    if (v6.length > 0) return v6[0];
  } catch {
    /* neither family resolved */
  }
  return null;
}

async function computeDelegation(domain: string): Promise<DelegationResult> {
  const parentZone = parentZoneOf(domain);
  if (parentZone === null) {
    return { ok: false, parentZone: null, message: "Bu domenin valideyn zonası yoxdur: tək hissəlidir." };
  }

  const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: QUERY_TRIES });

  let childNs: string[];
  try {
    childNs = await resolver.resolveNs(domain);
  } catch (error) {
    return {
      ok: false,
      parentZone,
      message: `Domenin öz ad serverləri oxunmadı: ${dnsErrorMessage(errorCode(error))}`,
    };
  }

  let parentNsHosts: string[];
  try {
    parentNsHosts = await resolver.resolveNs(parentZone);
  } catch (error) {
    return {
      ok: false,
      parentZone,
      message: `Valideyn zonanın (${parentZone}) ad serverləri oxunmadı: ${dnsErrorMessage(errorCode(error))}`,
    };
  }
  const parentNsHost = parentNsHosts[0];
  if (parentNsHost === undefined) {
    return { ok: false, parentZone, message: `Valideyn zonanın (${parentZone}) heç bir ad serveri tapılmadı.` };
  }

  const parentNsIp = await resolveNsAddress(resolver, parentNsHost);
  if (parentNsIp === null) {
    return { ok: false, parentZone, message: `Valideyn ad serveri (${parentNsHost}) IP ünvanına həll olunmadı.` };
  }
  if (isBlockedAddress(parentNsIp)) {
    return { ok: false, parentZone, message: "Valideyn ad serverinin ünvanı daxili şəbəkəyə işarə edir: sorğu göndərilmədi." };
  }

  const directResolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: QUERY_TRIES });
  directResolver.setServers([parentNsIp]);

  let parentNs: string[];
  try {
    parentNs = await directResolver.resolveNs(domain);
  } catch (error) {
    return {
      ok: false,
      parentZone,
      message: `Valideyn ad serveri (${parentNsHost}) bu domen üçün NS qeydi qaytarmadı: ${dnsErrorMessage(errorCode(error))}`,
    };
  }

  return { ok: true, parentZone, parentNsHost, childNs, parentNs, ...compareDelegation(childNs, parentNs) };
}

export async function GET(request: Request) {
  const refused = guard(request, "dnssec");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("domen") ?? "";
  const checked = normalizeDomain(raw);
  if (!checked.ok) return fail(checked.error);

  try {
    const report = await cached<DnssecReport>(`dnssec:${checked.domain}`, CACHE_TTL_MS, async () =>
      buildDnssecReport(checked.domain, await computeDelegation(checked.domain)),
    );
    return ok(report);
  } catch {
    return fail("Ad serveri ilə əlaqə qurulmadı. Bir azdan yenidən yoxla.", 502);
  }
}
