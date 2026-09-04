import { Resolver } from "node:dns/promises";

import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import {
  buildFindings,
  classifyTxt,
  describeCaa,
  dmarcName,
  dnsErrorMessage,
  DNS_TYPES,
  normalizeDomain,
  sortMxRecords,
  type DnsRecord,
  type DnsReport,
  type DnsSection,
  type DnsType,
  type TxtInsight,
} from "../../lib/dns";

/*
 * The DNS lookup endpoint.
 *
 * It asks Node's own resolver rather than a DNS-over-HTTPS service, and that
 * is a measurement rather than a preference: both cloudflare-dns.com and
 * dns.google were unreachable from the machine this was written on (curl gave
 * up with no response at all), while `node:dns` answered every query. A tool
 * that leans on an outside HTTP service breaks whenever that service is
 * filtered; the resolver is already present and is what the server uses to
 * reach anything at all.
 *
 * The one thing given up is the TTL of the six types other than A and AAAA,
 * which Node does not expose. The report carries `null` there rather than
 * inventing a number.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A DNS answer stays true for its TTL; a minute is short enough to be honest. */
const CACHE_TTL_MS = 60_000;

/* Bounded so one unresponsive zone cannot hold the request open: nine queries
   run in parallel, each with two tries of four seconds. */
const QUERY_TIMEOUT_MS = 4_000;
const QUERY_TRIES = 2;

type Resolved =
  | { records: DnsRecord[]; missing: boolean }
  | { error: string };

type LookupResult = { ok: true; report: DnsReport } | { ok: false; message: string };

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
}

async function collect(label: string, load: () => Promise<DnsRecord[]>): Promise<Resolved> {
  try {
    return { records: await load(), missing: false };
  } catch (error) {
    const code = errorCode(error);
    /* NODATA is not a failure: it is the zone answering "this type is not set
       here", which for CNAME on an apex domain is the only correct answer.
       NOTFOUND is different - it means the name itself is unknown - so it is
       recorded, and a name unknown to every query is reported as such. */
    if (code === "ENODATA") return { records: [], missing: false };
    if (code === "ENOTFOUND") return { records: [], missing: true };
    return { error: `${label}: ${dnsErrorMessage(code)}` };
  }
}

async function lookupDomain(domain: string): Promise<LookupResult> {
  const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: QUERY_TRIES });

  const [a, aaaa, cname, mx, txt, ns, soa, caa, dmarcTxt] = await Promise.all([
    collect("A", async () =>
      (await resolver.resolve4(domain, { ttl: true })).map((entry) => ({
        type: "A" as const,
        value: entry.address,
        ttl: entry.ttl,
      })),
    ),
    collect("AAAA", async () =>
      (await resolver.resolve6(domain, { ttl: true })).map((entry) => ({
        type: "AAAA" as const,
        value: entry.address,
        ttl: entry.ttl,
      })),
    ),
    collect("CNAME", async () =>
      (await resolver.resolveCname(domain)).map((value) => ({
        type: "CNAME" as const,
        value,
        ttl: null,
      })),
    ),
    collect("MX", async () =>
      sortMxRecords(
        (await resolver.resolveMx(domain)).map((entry) => ({
          type: "MX" as const,
          value: entry.exchange,
          priority: entry.priority,
          ttl: null,
        })),
      ),
    ),
    collect("TXT", async () =>
      /* A TXT value longer than 255 bytes arrives as several chunks and only
         means anything joined back together - a DKIM key is always split. */
      (await resolver.resolveTxt(domain)).map((chunks) => ({
        type: "TXT" as const,
        value: chunks.join(""),
        ttl: null,
      })),
    ),
    collect("NS", async () =>
      (await resolver.resolveNs(domain)).map((value) => ({
        type: "NS" as const,
        value,
        ttl: null,
      })),
    ),
    collect("SOA", async () => {
      const record = await resolver.resolveSoa(domain);
      return [
        {
          type: "SOA" as const,
          value: `${record.nsname} ${record.hostmaster} ${record.serial}`,
          ttl: null,
          note: `Yeniləmə ${record.refresh} san · təkrar cəhd ${record.retry} san · etibarlılıq ${record.expire} san · mənfi cavabın keşi ${record.minttl} san`,
        },
      ];
    }),
    collect("CAA", async () =>
      (await resolver.resolveCaa(domain)).map((entry) => {
        /* Node hands back one object per record carrying `critical`, a `type`
           discriminator of its own making, and exactly one of
           issue/issuewild/iodef/contact*. The CAA tag is the remaining key -
           and `type` has to be excluded by name, because it is first in the
           object and every record was otherwise read as a tag called "type". */
        const fields = entry as unknown as Record<string, string | number>;
        const [tag, value] = Object.entries(fields).find(
          ([key]) => key !== "critical" && key !== "type",
        ) ?? ["issue", ""];
        return {
          type: "CAA" as const,
          value: `${fields.critical} ${tag} "${String(value)}"`,
          ttl: null,
          note: describeCaa(tag, String(value)),
        };
      }),
    ),
    collect("_dmarc TXT", async () =>
      (await resolver.resolveTxt(dmarcName(domain))).map((chunks) => ({
        type: "TXT" as const,
        value: chunks.join(""),
        ttl: null,
      })),
    ),
  ]);

  const byType: Record<DnsType, Resolved> = {
    A: a,
    AAAA: aaaa,
    CNAME: cname,
    MX: mx,
    TXT: txt,
    NS: ns,
    SOA: soa,
    CAA: caa,
  };

  /* Every query answering "no such name" is the resolver's way of saying the
     domain is not registered - reporting eight empty tables instead would let
     a typo look like a badly configured zone. */
  const everyLookupMissing = DNS_TYPES.every((type) => {
    const result = byType[type];
    return !("error" in result) && result.missing;
  });
  if (everyLookupMissing) {
    return { ok: false, message: `«${domain}» adı qeydiyyatda yoxdur və ya zonası silinib.` };
  }

  const sections: DnsSection[] = DNS_TYPES.map((type) => {
    const result = byType[type];
    if ("error" in result) {
      return { type, status: "error" as const, records: [], message: result.error };
    }
    return {
      type,
      status: result.records.length > 0 ? ("ok" as const) : ("empty" as const),
      records: result.records,
      message: result.records.length > 0 ? null : "Bu tipdə qeyd yoxdur.",
    };
  });

  const txtInsights: TxtInsight[] =
    "error" in txt ? [] : txt.records.map((record) => classifyTxt(record.value));

  /* DMARC lives at `_dmarc.<domain>` and never on the domain itself, so a tool
     that reads only the apex TXT set reports "no DMARC" for every correctly
     configured domain there is. */
  const dmarcRecord =
    "error" in dmarcTxt
      ? null
      : (dmarcTxt.records.find((record) => /^v=dmarc1/i.test(record.value.trim())) ?? null);

  const dmarc = dmarcRecord
    ? { name: dmarcName(domain), value: dmarcRecord.value, insight: classifyTxt(dmarcRecord.value) }
    : null;

  return {
    ok: true,
    report: {
      domain,
      checkedAt: new Date().toISOString(),
      sections,
      txt: txtInsights,
      dmarc,
      findings: buildFindings(sections, txtInsights, dmarc?.insight ?? null),
    },
  };
}

export async function GET(request: Request) {
  const refused = guard(request, "dns");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("domen") ?? "";
  const checked = normalizeDomain(raw);
  if (!checked.ok) return fail(checked.error);

  try {
    const result = await cached(`dns:${checked.domain}`, CACHE_TTL_MS, () =>
      lookupDomain(checked.domain),
    );
    return result.ok ? ok(result.report) : fail(result.message, 404);
  } catch {
    /* Per-type failures are already folded into the report, so reaching here
       means the resolver itself is unusable rather than the domain being bad. */
    return fail("Ad serveri ilə əlaqə qurulmadı. Bir azdan yenidən yoxla.", 502);
  }
}
