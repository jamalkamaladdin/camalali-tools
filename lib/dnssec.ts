/**
 * DNSSEC, read as far as Node's own resolver actually lets a program read it.
 *
 * The honest starting point, checked against a running Node 24 rather than
 * assumed: `dns.promises.Resolver#resolve()` accepts a fixed list of record
 * types — A, AAAA, ANY, CAA, CNAME, MX, NAPTR, NS, PTR, SOA, SRV, TXT, TLSA —
 * and throws `ERR_INVALID_ARG_VALUE` for anything outside it, DS, DNSKEY and
 * RRSIG included. `ANY` itself is refused by every resolver this was tried
 * against (`ENOTIMP`, per RFC 8482's advice to stop answering it), and
 * `resolveCaa`, `resolveTxt` and the rest never expose the resolver's own
 * `AD` (authenticated-data) bit — Node's c-ares binding does not surface DNS
 * header flags at all. So a program built on this API cannot read a
 * signature, cannot read a key, and cannot ask "did you validate this" — not
 * as a missing feature to work around, but as the actual shape of the tool
 * this file is allowed to build.
 *
 * What is left, and what this tool does instead: the parent-to-child
 * delegation is ordinary NS data, fully inside the supported list, and
 * checking it against what the domain claims about itself is a real,
 * independently useful signal — a lame delegation breaks a resolver's path
 * to a zone whether or not that zone is signed. `UNMEASURABLE_TYPES` below is
 * shown on the page next to that result, not instead of it, so the gap is
 * named rather than papered over with a delegation check wearing a DNSSEC
 * label.
 */

/** The record types a visitor asking about DNSSEC would expect, that this API cannot query at all. */
export const UNMEASURABLE_TYPES = ["DS", "DNSKEY", "RRSIG"] as const;

/** Confirmed against a running resolver — see the file header. Exported so the check file can pin it down. */
export const SUPPORTED_RRTYPES = [
  "A",
  "AAAA",
  "ANY",
  "CAA",
  "CNAME",
  "MX",
  "NAPTR",
  "NS",
  "PTR",
  "SOA",
  "SRV",
  "TXT",
  "TLSA",
] as const;

/**
 * The one paragraph shown on every report, success or failure: what this tool
 * can and cannot see. Kept as one function rather than scattered strings so
 * the same sentence appears in the note, the FAQ and the check file.
 */
export function unmeasurableExplanation(): string {
  return (
    `Node-un DNS modulu ${UNMEASURABLE_TYPES.join(", ")} tiplərini birbaşa sorğulaya bilmir — bu ` +
    "modulun dəstəklədiyi siyahıda yoxdur, resolver.resolve() bu tiplərdən biri ilə çağırılanda özü xəta " +
    "verir, şəbəkəyə heç çıxmır. Ona görə bu alət imza və açar qeydlərinin məzmununu göstərə bilmir; " +
    "əvəzinə valideyn zonanın domenə hansı ad serverlərini göstərdiyini yoxlayır — imzalanmadan asılı " +
    "olmayan, amma DNSSEC-in üzərində qurulduğu eyni zəncirin bir hissəsidir."
  );
}

/**
 * The zone directly above this one: strip the leftmost label.
 *
 * A single hop, not a walk to the root — "com" is itself a valid, queryable
 * zone, and asking who runs it is exactly the "trace to the parent zone" this
 * tool can actually do. `null` for a name that has no label left to strip.
 */
export function parentZoneOf(domain: string): string | null {
  const dot = domain.indexOf(".");
  if (dot === -1) return null;
  const parent = domain.slice(dot + 1);
  return parent === "" ? null : parent;
}

/** Lowercase, trailing dot dropped — the form every NS answer is compared in. */
export function normalizeNsName(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

export type DelegationComparison = {
  matches: string[];
  onlyChild: string[];
  onlyParent: string[];
  consistent: boolean;
};

/**
 * Compares what the domain's own zone claims as its nameservers against what
 * the parent zone actually delegates to.
 *
 * The two lists come from two different queries in the route — one asking
 * the domain's own authoritative answer, one asking the parent zone's
 * nameserver directly — and disagreeing is a real, nameable fault: a
 * "lame delegation", where a resolver following the parent's referral lands
 * on a server that does not consider itself authoritative for the name.
 */
export function compareDelegation(childNs: readonly string[], parentNs: readonly string[]): DelegationComparison {
  const child = new Set(childNs.map(normalizeNsName));
  const parent = new Set(parentNs.map(normalizeNsName));

  const matches = [...child].filter((name) => parent.has(name)).sort((a, b) => a.localeCompare(b, "en"));
  const onlyChild = [...child].filter((name) => !parent.has(name)).sort((a, b) => a.localeCompare(b, "en"));
  const onlyParent = [...parent].filter((name) => !child.has(name)).sort((a, b) => a.localeCompare(b, "en"));

  return {
    matches,
    onlyChild,
    onlyParent,
    consistent: child.size > 0 && parent.size > 0 && onlyChild.length === 0 && onlyParent.length === 0,
  };
}

export type DelegationResult =
  | ({ ok: true; parentZone: string; parentNsHost: string; childNs: string[]; parentNs: string[] } & DelegationComparison)
  | { ok: false; parentZone: string | null; message: string };

export type DnssecReport = {
  domain: string;
  checkedAt: string;
  delegation: DelegationResult;
  unmeasurable: readonly string[];
  explanation: string;
};

export function buildDnssecReport(domain: string, delegation: DelegationResult): DnssecReport {
  return {
    domain,
    checkedAt: new Date().toISOString(),
    delegation,
    unmeasurable: UNMEASURABLE_TYPES,
    explanation: unmeasurableExplanation(),
  };
}
