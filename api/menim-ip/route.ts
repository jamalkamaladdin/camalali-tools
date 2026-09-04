import { Resolver } from "node:dns/promises";

import { fail, guard, ok, upstream, upstreamMessage } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { callerAddress } from "../../shared/rate-limit";
import { parseIpv4, parseIpv6 } from "../../lib/safe-url";
import {
  cymruIpv4QueryName,
  cymruIpv6QueryName,
  extractRdapInfo,
  parseCymruAsName,
  parseCymruOrigin,
  type AddressSource,
  type CymruOrigin,
  type MenimIpReport,
  type RdapInfo,
} from "../../lib/menim-ip";

/*
 * "What is my IP, and what does this connection reveal about me."
 *
 * Three lookups happen here, against three different services, and none of
 * them takes anything the visitor typed: the only input is the address the
 * request itself arrived from, already read by `callerAddress` in
 * `shared/rate-limit` — this route does not parse a header a second time, it
 * only asks which of the two headers `callerAddress` would have preferred
 * was actually present, so the answer can tell the visitor which one it was.
 *
 * The ASN lookup and the RDAP lookup are independent of each other and of
 * the PTR lookup, so all three run in parallel rather than one after another
 * — a slow registry does not have to hold up an already-fast DNS answer.
 * Each of the three fails on its own: a visitor behind a network with no
 * PTR record, or a registry whose RDAP is briefly down, still gets the two
 * lookups that did work rather than one failure taking the whole report
 * down. That is also why no source's error text is ever forwarded to the
 * visitor — `upstreamMessage` and the sentences below are written from the
 * visitor's side, not copied from whatever the resolver or the registry said.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The ASN a prefix is announced from and the RDAP record behind it do not
   change between two clicks a minute apart. */
const CACHE_TTL_MS = 600_000;

const QUERY_TIMEOUT_MS = 4_000;
const QUERY_TRIES = 2;

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
}

/**
 * Reports which of the two headers `callerAddress` would have read actually
 * carried a value — a presence check on the same headers the project already
 * trusts, not a second reading of the address itself.
 */
function addressSourceOf(request: Request): AddressSource {
  if (request.headers.get("cf-connecting-ip")) return "cf-connecting-ip";
  if (request.headers.get("x-forwarded-for")) return "x-forwarded-for";
  return "bilinmir";
}

type AsnLookup = { origin: CymruOrigin | null; name: string | null; error: string | null };

async function lookupAsn(address: string): Promise<AsnLookup> {
  const queryName =
    parseIpv4(address) !== null ? cymruIpv4QueryName(address) : cymruIpv6QueryName(address);
  if (queryName === null) {
    return { origin: null, name: null, error: "Ünvan formatı ASN sorğusu üçün oxunmadı." };
  }

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
    /* No route for this address is a real, sayable result — it means the
       address is not currently announced anywhere on the public internet —
       so it is reported as an absent ASN rather than as a failure. */
    if (code === "ENODATA" || code === "ENOTFOUND") return { origin: null, name: null, error: null };
    return { origin: null, name: null, error: "ASN sorğusu Team Cymru-dan cavab almadı." };
  }

  try {
    const nameAnswer = await resolver.resolveTxt(`AS${origin.asn}.asn.cymru.com`);
    const nameLine = nameAnswer[0]?.join("") ?? "";
    return { origin, name: parseCymruAsName(nameLine), error: null };
  } catch {
    /* The AS number and its prefix already stand on their own; a name that
       did not resolve is a smaller, partial gap, not a reason to drop them. */
    return { origin, name: null, error: null };
  }
}

type RdapLookup = { info: RdapInfo | null; error: string | null };

async function lookupRdap(address: string): Promise<RdapLookup> {
  /* Not `encodeURIComponent`: a colon is a legal, unreserved-enough path
     character (RFC 3986 `pchar` includes it) and escaping it to `%3A` risks
     a redirector that matches the path before decoding it. `address` is
     already validated by `parseIpv4`/`parseIpv6` upstream in this file, so
     it can only ever be digits, dots, hex letters and colons. */
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
    /* No PTR record is the common case, not a fault: most addresses answer
       this way, and reporting it as an error would make the ordinary result
       look broken. */
    if (code === "ENODATA" || code === "ENOTFOUND") return { names: null, error: null };
    return { names: null, error: "Tərs DNS sorğusu ad serverindən cavab almadı." };
  }
}

export async function GET(request: Request) {
  const refused = guard(request, "menim-ip");
  if (refused) return refused;

  const address = callerAddress(request);
  const addressSource = addressSourceOf(request);

  if (parseIpv4(address) === null && parseIpv6(address) === null) {
    return fail(
      "IP ünvanın tanınmadı: server heç bir etibarlı ünvan başlığı görmədi.",
      502,
    );
  }

  const [asnResult, rdapResult, ptrResult] = await Promise.all([
    cached(`menim-ip:asn:${address}`, CACHE_TTL_MS, () => lookupAsn(address)),
    cached(`menim-ip:rdap:${address}`, CACHE_TTL_MS, () => lookupRdap(address)),
    lookupPtr(address),
  ]);

  const report: MenimIpReport = {
    address,
    addressSource,
    asn: asnResult.origin,
    asnName: asnResult.name,
    asnError: asnResult.error,
    rdap: rdapResult.info,
    rdapError: rdapResult.error,
    ptr: ptrResult.names,
    ptrError: ptrResult.error,
    checkedAt: new Date().toISOString(),
  };

  return ok(report);
}
