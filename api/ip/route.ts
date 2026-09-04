import { Resolver } from "node:dns/promises";

import { fail, guard, ok, upstream, upstreamMessage } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import {
  classifyAddress,
  detectInputKind,
  isForwardConfirmed,
  type IpAddressResult,
  type IpLookupReport,
} from "../../lib/ip";
import {
  cymruIpv4QueryName,
  cymruIpv6QueryName,
  extractRdapInfo,
  parseCymruAsName,
  parseCymruOrigin,
  type CymruOrigin,
  type RdapInfo,
} from "../../lib/menim-ip";
import { parseIpv4 } from "../../lib/safe-url";

/*
 * "What is this IP address (or domain), and what does it belong to" — for
 * ANY address the visitor names, unlike `menim-ip`, which only ever reports
 * on the caller's own connection.
 *
 * The RDAP and Team Cymru wire parsing is the same code `menim-ip`'s route
 * uses, imported from `lib/menim-ip` rather than rewritten here —
 * only the orchestration around it is new: a visitor's input can be a bare
 * address or a domain name that first needs resolving, and can name several
 * addresses at once (a domain with both an A and an AAAA record, or several
 * of either), where `menim-ip` only ever had the one address the request
 * arrived from.
 *
 * A private, loopback or otherwise non-public address is classified but
 * never looked up externally: RDAP and Team Cymru have nothing to say about
 * 10.0.0.1, and a PTR query against it would only wait out its own timeout
 * for nothing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RDAP_ASN_CACHE_TTL_MS = 600_000;
const DOMAIN_CACHE_TTL_MS = 300_000;
const QUERY_TIMEOUT_MS = 4_000;
const QUERY_TRIES = 2;

/* A domain can carry many A/AAAA records; only this many are actually looked
   up, so one wildcard-heavy domain cannot turn one click into fifty queries. */
const MAX_ADDRESSES = 8;

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
}

async function resolveDomain(hostname: string): Promise<{ addresses: string[]; error: string | null }> {
  const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: QUERY_TRIES });

  const resolveFamily = async (kind: "resolve4" | "resolve6"): Promise<string[]> => {
    try {
      return await resolver[kind](hostname);
    } catch (error) {
      const code = errorCode(error);
      if (code === "ENODATA" || code === "ENOTFOUND") return [];
      throw error;
    }
  };

  try {
    const [v4, v6] = await Promise.all([resolveFamily("resolve4"), resolveFamily("resolve6")]);
    const addresses = [...v4, ...v6];
    if (addresses.length === 0) {
      return { addresses: [], error: "Bu domen adı heç bir IP ünvanına həll olunmadı." };
    }
    return { addresses, error: null };
  } catch {
    return { addresses: [], error: "Domen adı ad serverindən cavab almadı." };
  }
}

type AsnLookup = { origin: CymruOrigin | null; name: string | null; error: string | null };

async function lookupAsn(address: string): Promise<AsnLookup> {
  const queryName = parseIpv4(address) !== null ? cymruIpv4QueryName(address) : cymruIpv6QueryName(address);
  if (queryName === null) return { origin: null, name: null, error: "Ünvan formatı ASN sorğusu üçün oxunmadı." };

  const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: QUERY_TRIES });

  let origin: CymruOrigin;
  try {
    const answer = await resolver.resolveTxt(queryName);
    const line = answer[0]?.join("") ?? "";
    const parsed = parseCymruOrigin(line);
    if (!parsed.ok) return { origin: null, name: null, error: parsed.error };
    origin = parsed.origin;
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENODATA" || code === "ENOTFOUND") return { origin: null, name: null, error: null };
    return { origin: null, name: null, error: "ASN sorğusu Team Cymru-dan cavab almadı." };
  }

  try {
    const nameAnswer = await resolver.resolveTxt(`AS${origin.asn}.asn.cymru.com`);
    const nameLine = nameAnswer[0]?.join("") ?? "";
    return { origin, name: parseCymruAsName(nameLine), error: null };
  } catch {
    return { origin, name: null, error: null };
  }
}

type RdapLookup = { info: RdapInfo | null; error: string | null };

async function lookupRdap(address: string): Promise<RdapLookup> {
  const result = await upstream(`https://rdap.org/ip/${address}`, {
    headers: { accept: "application/rdap+json, application/json" },
  });
  if (!result.ok) return { info: null, error: upstreamMessage("RDAP.org", result) };

  try {
    const json: unknown = JSON.parse(result.text);
    return { info: extractRdapInfo(json), error: null };
  } catch {
    return { info: null, error: "RDAP.org gözlənilməz formatda cavab verdi." };
  }
}

type PtrLookup = { names: string[] | null; error: string | null };

async function lookupPtr(address: string): Promise<PtrLookup> {
  const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: QUERY_TRIES });
  try {
    const names = await resolver.reverse(address);
    return { names, error: null };
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENODATA" || code === "ENOTFOUND") return { names: null, error: null };
    return { names: null, error: "Tərs DNS sorğusu ad serverindən cavab almadı." };
  }
}

/**
 * Resolves at most the first three PTR names forward and checks whether any
 * of them lands back on the address that named them. One failed name does
 * not sink the check — the others still count — and no PTR record at all is
 * reported as `null`, not as a failed confirmation.
 */
async function checkForwardConfirmation(address: string, names: string[] | null): Promise<boolean | null> {
  if (!names || names.length === 0) return null;

  const isV4 = parseIpv4(address) !== null;
  const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: QUERY_TRIES });
  const forward: string[] = [];

  for (const name of names.slice(0, 3)) {
    try {
      const found = isV4 ? await resolver.resolve4(name) : await resolver.resolve6(name);
      forward.push(...found);
    } catch {
      // One name failing its own forward lookup is not fatal — the others
      // still get a chance to confirm the address.
    }
  }

  if (forward.length === 0) return null;
  return isForwardConfirmed(address, forward);
}

async function buildAddressResult(address: string): Promise<IpAddressResult> {
  const classification = classifyAddress(address);

  if (!classification || classification.kind !== "public") {
    return {
      address,
      classification: classification ?? { version: "v4", kind: "reserved", label: "naməlum" },
      asn: null,
      asnName: null,
      asnError: null,
      rdap: null,
      rdapError: null,
      ptr: null,
      ptrError: null,
      forwardConfirmed: null,
    };
  }

  const [asnResult, rdapResult, ptrResult] = await Promise.all([
    cached(`ip:asn:${address}`, RDAP_ASN_CACHE_TTL_MS, () => lookupAsn(address)),
    cached(`ip:rdap:${address}`, RDAP_ASN_CACHE_TTL_MS, () => lookupRdap(address)),
    lookupPtr(address),
  ]);

  const forwardConfirmed = await checkForwardConfirmation(address, ptrResult.names);

  return {
    address,
    classification,
    asn: asnResult.origin,
    asnName: asnResult.name,
    asnError: asnResult.error,
    rdap: rdapResult.info,
    rdapError: rdapResult.error,
    ptr: ptrResult.names,
    ptrError: ptrResult.error,
    forwardConfirmed,
  };
}

export async function GET(request: Request) {
  const refused = guard(request, "ip");
  if (refused) return refused;

  const raw = new URL(request.url).searchParams.get("hedef") ?? "";
  const kind = detectInputKind(raw);

  if (kind === "invalid") {
    return fail("Bu nə IP ünvanına, nə də domen adına oxşayır.");
  }

  let addresses: string[];
  let domain: string | null = null;

  if (kind === "domain") {
    domain = raw.trim();
    const resolved = await cached(`ip:domain:${domain}`, DOMAIN_CACHE_TTL_MS, () => resolveDomain(domain as string));
    if (resolved.error) return fail(resolved.error, 502);
    addresses = resolved.addresses.slice(0, MAX_ADDRESSES);
  } else {
    addresses = [raw.trim()];
  }

  const results = await Promise.all(addresses.map((address) => buildAddressResult(address)));

  const report: IpLookupReport = {
    input: raw.trim(),
    resolvedFrom: kind === "domain" ? "domain" : "direct",
    domain,
    addresses: results,
    checkedAt: new Date().toISOString(),
  };

  return ok(report);
}
