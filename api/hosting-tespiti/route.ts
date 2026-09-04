import { Resolver, lookup } from "node:dns/promises";

import { fail, guard, ok, upstream } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { buildHostingReport, type HostingReport } from "../../lib/hosting-tespiti";
import {
  cymruIpv4QueryName,
  cymruIpv6QueryName,
  extractRdapInfo,
  parseCymruAsName,
  parseCymruOrigin,
  type RdapInfo,
} from "../../lib/menim-ip";
import { fetchPublicText } from "../../lib/safe-fetch";
import { normalizeTargetUrl, parseIpv4 } from "../../lib/safe-url";

/*
 * Fetches a page a stranger chose (same fence every routed tool here uses —
 * `robots-canli`'s header comment has the full four rules) and, alongside it,
 * asks three more things about the same hostname: its `CNAME` chain, its
 * resolved IP's announcing ASN, and that IP's RDAP registry record.
 *
 * The ASN and RDAP lookups are not new code: `cymruIpv4QueryName`,
 * `parseCymruOrigin` and `extractRdapInfo` are the exact functions
 * `menim-ip`'s route already uses for the visitor's OWN address — reused here
 * unchanged, against the TARGET's address instead. A fence that is right in
 * one tool and re-typed slightly differently in a second is a fence somebody
 * eventually gets wrong.
 *
 * None of the three DNS/RDAP lookups is itself a fetch of visitor-controlled
 * content: the CNAME chain and the resolved address are read for display, and
 * the address is only ever used to build a query name for Team Cymru or a
 * path segment for rdap.org — both fixed, trusted services reached through
 * `upstream()`, never through a second call to the target itself.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Headers, DNS and RDAP records change on a deploy or a provider switch, not between two clicks. */
const CACHE_TTL_MS = 600_000;

const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8";
const MAX_BYTES = 262_144;

const DNS_TIMEOUT_MS = 4_000;
const DNS_TRIES = 2;
const MAX_CNAME_HOPS = 5;

/** Walks the `CNAME` chain one hop at a time. An apex domain with a plain A record answers with none, which is the common case, not a failure. */
async function resolveCnameChain(hostname: string): Promise<string[]> {
  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: DNS_TRIES });
  const chain: string[] = [];
  let current = hostname;

  for (let hop = 0; hop < MAX_CNAME_HOPS; hop += 1) {
    let answer: string[];
    try {
      answer = await resolver.resolveCname(current);
    } catch {
      break;
    }
    const next = answer[0];
    if (!next || chain.includes(next)) break;
    chain.push(next);
    current = next;
  }

  return chain;
}

async function resolveAddress(hostname: string): Promise<string | null> {
  try {
    const result = await lookup(hostname, { verbatim: true });
    return result.address;
  } catch {
    return null;
  }
}

async function lookupAsnName(address: string): Promise<string | null> {
  const queryName = parseIpv4(address) !== null ? cymruIpv4QueryName(address) : cymruIpv6QueryName(address);
  if (queryName === null) return null;

  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: DNS_TRIES });
  try {
    const answer = await resolver.resolveTxt(queryName);
    const line = answer[0]?.join("") ?? "";
    const parsed = parseCymruOrigin(line);
    if (!parsed.ok) return null;
    const nameAnswer = await resolver.resolveTxt(`AS${parsed.origin.asn}.asn.cymru.com`);
    return parseCymruAsName(nameAnswer[0]?.join("") ?? "");
  } catch {
    /* No route or no answer is the common case for an address behind a CDN's
       anycast edge — silently absent, not an error. */
    return null;
  }
}

async function lookupRdap(address: string): Promise<RdapInfo | null> {
  const result = await upstream(`https://rdap.org/ip/${address}`, {
    headers: { accept: "application/rdap+json, application/json" },
  });
  if (!result.ok) return null;
  try {
    const json: unknown = JSON.parse(result.text);
    return extractRdapInfo(json);
  } catch {
    return null;
  }
}

type Outcome =
  | { ok: true; report: HostingReport & { url: string; status: number; checkedAt: string } }
  | { ok: false; message: string; status: 400 | 502 };

export async function GET(request: Request) {
  const refused = guard(request, "hosting-tespiti");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("unvan") ?? "";
  const target = normalizeTargetUrl(raw);
  if (!target.ok) return fail(target.error);

  const result = await cached<Outcome>(`hosting-tespiti:${target.url}`, CACHE_TTL_MS, async () => {
    const [fetched, cnameChain, address] = await Promise.all([
      fetchPublicText(target.url, { maxBytes: MAX_BYTES, accept: HTML_ACCEPT }),
      resolveCnameChain(target.hostname),
      resolveAddress(target.hostname),
    ]);

    if (!fetched.ok) return { ok: false, message: fetched.message, status: fetched.status };

    const [asnName, rdap] = address ? await Promise.all([lookupAsnName(address), lookupRdap(address)]) : [null, null];

    const report = buildHostingReport({
      headers: fetched.headers,
      html: fetched.text,
      cnameChain,
      address,
      rdap,
      asnName,
    });

    return {
      ok: true,
      report: { ...report, url: fetched.url, status: fetched.status, checkedAt: new Date().toISOString() },
    };
  });

  return result.ok ? ok(result.report) : fail(result.message, result.status);
}
