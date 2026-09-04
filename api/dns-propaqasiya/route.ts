import { Resolver } from "node:dns/promises";

import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { dnsErrorMessage } from "../../lib/dns";
import { checkHostname, resolveHost } from "../../lib/socket-probe";
import {
  formatMxAnswer,
  isRecordType,
  normalizeHostAnswer,
  summarizeStatuses,
  buildVerdict,
  type PropagationReport,
  type RecordType,
  type ResolverResult,
} from "../../lib/dns-propaqasiya";

/*
 * The DNS propagation endpoint.
 *
 * Every other network tool on this site asks one address one question. This
 * one asks the same question of seven — six fixed public resolvers plus
 * whichever servers the zone's own NS records name as authoritative — and
 * lays the answers side by side. That is also why it is the most expensive
 * route in the tool layer: seven outbound DNS round trips per click, run
 * concurrently rather than the eight-second-serial alternative nobody would
 * wait for.
 *
 * The comparison and the verdict are deliberately NOT here — they live in
 * `dns-propaqasiya.ts` as pure functions over the plain result list this file
 * builds, which is the only way that logic gets to be checked offline.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Long enough to stop a visitor hammering reload from turning one click into
   seven repeated round trips; short enough that nothing meaningful about a
   propagating record changes inside it. */
const CACHE_TTL_MS = 30_000;

/* One attempt each, bounded — a resolver that has not answered in three
   seconds is reported as a timeout row, which is itself a finding, rather
   than holding the whole page open. */
const QUERY_TIMEOUT_MS = 3_000;

const PUBLIC_RESOLVERS: { id: string; label: string; address: string }[] = [
  { id: "google", label: "Google", address: "8.8.8.8" },
  { id: "cloudflare", label: "Cloudflare", address: "1.1.1.1" },
  { id: "quad9", label: "Quad9", address: "9.9.9.9" },
  { id: "opendns", label: "OpenDNS", address: "208.67.222.222" },
  { id: "adguard", label: "AdGuard", address: "94.140.14.14" },
  { id: "dnswatch", label: "dns.watch", address: "84.200.69.80" },
];

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
}

type QueryOutcome = {
  status: "ok" | "timeout" | "error";
  answers: string[];
  ttlSeconds: number | null;
  message?: string;
};

/** The actual lookup, one record type at a time, against whichever resolver was already pointed at `address`. */
async function runQuery(resolver: Resolver, domain: string, type: RecordType): Promise<QueryOutcome> {
  switch (type) {
    case "A": {
      const records = await resolver.resolve4(domain, { ttl: true });
      return {
        status: "ok",
        answers: records.map((record) => record.address),
        ttlSeconds: records.length > 0 ? Math.min(...records.map((record) => record.ttl)) : null,
      };
    }
    case "AAAA": {
      const records = await resolver.resolve6(domain, { ttl: true });
      return {
        status: "ok",
        answers: records.map((record) => record.address),
        ttlSeconds: records.length > 0 ? Math.min(...records.map((record) => record.ttl)) : null,
      };
    }
    case "CNAME": {
      const records = await resolver.resolveCname(domain);
      /* No TTL: Node's resolver only surfaces it for A and AAAA (see `dns.ts`,
         which gave up the same six types for the same reason). */
      return { status: "ok", answers: records.map(normalizeHostAnswer), ttlSeconds: null };
    }
    case "MX": {
      const records = await resolver.resolveMx(domain);
      return {
        status: "ok",
        answers: records.map((record) => formatMxAnswer(record.priority, record.exchange)),
        ttlSeconds: null,
      };
    }
    case "TXT": {
      /* A value over 255 bytes arrives split into chunks and only means
         anything joined back together — the same rule `dns.ts` applies. */
      const records = await resolver.resolveTxt(domain);
      return { status: "ok", answers: records.map((chunks) => chunks.join("")), ttlSeconds: null };
    }
    case "NS": {
      const records = await resolver.resolveNs(domain);
      return { status: "ok", answers: records.map(normalizeHostAnswer), ttlSeconds: null };
    }
    case "SOA": {
      const record = await resolver.resolveSoa(domain);
      /* The serial number is the field that actually moves on an edit, so it
         travels inside the one comparable answer string rather than being
         dropped — a serial bump with everything else unchanged has to read
         as a disagreement, not as silence. */
      return {
        status: "ok",
        answers: [
          `${normalizeHostAnswer(record.nsname)} ${record.hostmaster} ${record.serial} ${record.refresh} ${record.retry} ${record.expire} ${record.minttl}`,
        ],
        ttlSeconds: null,
      };
    }
  }
}

/** Points a fresh resolver at exactly one address and runs one query, never throwing. */
async function queryOne(
  address: string,
  domain: string,
  type: RecordType,
): Promise<{ outcome: QueryOutcome; ms: number }> {
  const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: 1 });
  resolver.setServers([address]);
  const started = performance.now();

  try {
    const outcome = await runQuery(resolver, domain, type);
    return { outcome, ms: Math.round(performance.now() - started) };
  } catch (error) {
    const ms = Math.round(performance.now() - started);
    const code = errorCode(error);
    /* NODATA is the zone answering "nothing of this type here" — a real,
       comparable answer, not a failure. */
    if (code === "ENODATA") return { outcome: { status: "ok", answers: [], ttlSeconds: null }, ms };
    if (code === "ETIMEOUT" || code === "ETIMEDOUT") {
      return { outcome: { status: "timeout", answers: [], ttlSeconds: null }, ms };
    }
    return { outcome: { status: "error", answers: [], ttlSeconds: null, message: dnsErrorMessage(code) }, ms };
  }
}

async function queryCachingResolvers(domain: string, type: RecordType): Promise<ResolverResult[]> {
  const settled = await Promise.allSettled(
    PUBLIC_RESOLVERS.map((entry) => queryOne(entry.address, domain, type)),
  );

  return PUBLIC_RESOLVERS.map((entry, index) => {
    const settledEntry = settled[index];
    if (settledEntry.status === "rejected") {
      return {
        id: entry.id,
        label: entry.label,
        address: entry.address,
        kind: "caching",
        status: "error",
        answers: [],
        ttlSeconds: null,
        ms: null,
        message: "Gözlənilməz xəta baş verdi.",
      };
    }
    const { outcome, ms } = settledEntry.value;
    return { id: entry.id, label: entry.label, address: entry.address, kind: "caching", ms, ...outcome };
  });
}

/**
 * The row that matters most: the zone's own nameservers, found from its NS
 * records and queried directly rather than through anybody's cache.
 *
 * Each NS hostname goes through `resolveHost` rather than `checkHostname`, and
 * the difference is the point: this is the one place in the file that will be
 * connected to. The visitor's own domain is only asked about, so its name is
 * checked for shape alone — the guard every
 * other network tool on this site uses before opening a socket to an address
 * a stranger's DNS pointed at, so an NS record aimed at an internal address
 * is refused here exactly as it would be anywhere else.
 */
async function queryAuthoritativeResolvers(domain: string, type: RecordType): Promise<ResolverResult[]> {
  const bootstrap = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: 1 });
  let nsHosts: string[];
  try {
    nsHosts = await bootstrap.resolveNs(domain);
  } catch {
    /* No authoritative servers could be found at all — the caching rows
       below still carry the whole answer, they simply have nothing to be
       checked against. */
    return [];
  }

  const settled = await Promise.allSettled(
    nsHosts.map(async (nsHost): Promise<ResolverResult> => {
      const resolved = await resolveHost(nsHost);
      if (!resolved.ok) {
        return {
          id: `ns:${nsHost}`,
          label: nsHost,
          address: "",
          kind: "authoritative",
          status: "error",
          answers: [],
          ttlSeconds: null,
          ms: null,
          message: resolved.message,
        };
      }
      const address = resolved.primary.address;
      const { outcome, ms } = await queryOne(address, domain, type);
      return { id: `ns:${nsHost}`, label: nsHost, address, kind: "authoritative", ms, ...outcome };
    }),
  );

  return settled.map((entry, index) => {
    if (entry.status === "fulfilled") return entry.value;
    const nsHost = nsHosts[index];
    return {
      id: `ns:${nsHost}`,
      label: nsHost,
      address: "",
      kind: "authoritative",
      status: "error",
      answers: [],
      ttlSeconds: null,
      ms: null,
      message: "Gözlənilməz xəta baş verdi.",
    };
  });
}

async function buildReport(domain: string, type: RecordType): Promise<PropagationReport> {
  const [authoritative, caching] = await Promise.all([
    queryAuthoritativeResolvers(domain, type),
    queryCachingResolvers(domain, type),
  ]);

  const resolvers = [...authoritative, ...caching];

  return {
    domain,
    recordType: type,
    checkedAt: new Date().toISOString(),
    resolvers,
    summary: summarizeStatuses(resolvers),
    verdict: buildVerdict(resolvers),
  };
}

export async function GET(request: Request) {
  const refused = guard(request, "dns-propaqasiya");
  if (refused) return refused;

  const params = new URL(request.url).searchParams;
  const rawType = (params.get("tip") ?? "A").toUpperCase();
  if (!isRecordType(rawType)) {
    return fail(`«${rawType}» tanınan qeyd tipi deyil: A, AAAA, CNAME, MX, TXT, NS və ya SOA yaz.`);
  }

  const probe = checkHostname(params.get("domen") ?? "");
  if (!probe.ok) return fail(probe.message, probe.status);

  try {
    const report = await cached(`dns-propaqasiya:${probe.hostname}:${rawType}`, CACHE_TTL_MS, () =>
      buildReport(probe.hostname, rawType),
    );
    return ok(report);
  } catch {
    /* Per-resolver failures are already folded into the report, so reaching
       here means something broke before a single query could even be sent. */
    return fail("Ad serverləri ilə əlaqə qurulmadı. Bir azdan yenidən yoxla.", 502);
  }
}
