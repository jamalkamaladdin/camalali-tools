import { Resolver } from "node:dns/promises";

import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { dnsErrorMessage } from "../../lib/dns";
import { buildNameCheck, buildPtrReport, checkIpAddress, type PtrReport, type ReverseNameCheck } from "../../lib/ptr";
import { isBlockedAddress } from "../../lib/safe-url";

/*
 * The reverse-DNS endpoint.
 *
 * Two lookups: `reverse()` for the PTR name(s), then a forward lookup of the
 * same family (A for an IPv4 question, AAAA for an IPv6 one) on each name
 * found, so the comparison is the same kind of address on both sides. The
 * address itself is checked against `isBlockedAddress` before anything is
 * queried — a reverse lookup of a private address answers nothing useful and
 * this route is not the place to find that out by trying.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60_000;
const QUERY_TIMEOUT_MS = 4_000;
const QUERY_TRIES = 2;

/* A handful of PTR names is normal; more than this is not a real answer worth
   chasing forward one by one. */
const MAX_NAMES = 5;

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
}

type Outcome = { ok: true; report: PtrReport } | { ok: false; message: string; status: 400 | 502 };

export async function GET(request: Request) {
  const refused = guard(request, "ptr");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("ip") ?? "";
  const checked = checkIpAddress(raw);
  if (!checked.ok) return fail(checked.error);

  if (isBlockedAddress(checked.ip)) {
    return fail("Bu ünvan daxili və ya ayrılmış şəbəkəyə işarə edir. Alət yalnız internetdə açıq olan ünvanları yoxlayır.");
  }

  const result = await cached<Outcome>(`ptr:${checked.ip}`, CACHE_TTL_MS, async () => {
    const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: QUERY_TRIES });

    let hostnames: string[];
    try {
      hostnames = await resolver.reverse(checked.ip);
    } catch (error) {
      const code = errorCode(error);
      if (code === "ENOTFOUND" || code === "ENODATA") {
        return { ok: true, report: buildPtrReport(checked.ip, checked.family, []) };
      }
      return { ok: false, message: `Tərs DNS sorğusu alınmadı: ${dnsErrorMessage(code)}`, status: 502 };
    }

    const checks: ReverseNameCheck[] = await Promise.all(
      hostnames.slice(0, MAX_NAMES).map(async (hostname) => {
        try {
          const forward = checked.family === 4 ? await resolver.resolve4(hostname) : await resolver.resolve6(hostname);
          return buildNameCheck(checked.ip, hostname, forward, null);
        } catch (error) {
          return buildNameCheck(checked.ip, hostname, [], dnsErrorMessage(errorCode(error)));
        }
      }),
    );

    return { ok: true, report: buildPtrReport(checked.ip, checked.family, checks) };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
