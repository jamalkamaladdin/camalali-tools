/**
 * What kind of address a string is — public, one of the private ranges, or
 * one of the special-purpose blocks — plus the two small pieces of pure
 * arithmetic the route needs around a lookup: telling an IP address apart
 * from a domain name before deciding whether to resolve it, and checking
 * whether a PTR name's own forward record actually points back at the
 * address that named it.
 *
 * The RDAP and Team Cymru wire-format parsing this tool's route needs
 * already lives in `lib/menim-ip` — that file's `extractRdapInfo`,
 * `parseCymruOrigin` and the two `cymru*QueryName` builders are reused
 * as-is here, not reimplemented, because a second parser for the same wire
 * format is a second place for it to be subtly wrong. What is new in this
 * file is specific to looking up an ARBITRARY address rather than the
 * caller's own: classifying an address the visitor typed, and telling a
 * domain apart from an address before the route decides whether it needs a
 * DNS resolution step at all.
 */
import type { CymruOrigin, RdapInfo } from "./menim-ip.js";
import { parseIpv4, parseIpv6 } from "./safe-url.js";

/* ---------- address classification ---------- */

export type AddressKind =
  | "public"
  | "private"
  | "loopback"
  | "link-local"
  | "cgnat"
  | "multicast"
  | "reserved"
  | "documentation"
  | "unique-local";

export type IpVersion = "v4" | "v6";

export type IpClassification = { version: IpVersion; kind: AddressKind; label: string };

export const ADDRESS_KIND_LABELS: Record<AddressKind, string> = {
  public: "İctimai (public): internetdə marşrutlana bilir",
  private: "Xüsusi şəbəkə (RFC 1918): yalnız yerli şəbəkədə",
  loopback: "Loopback: maşının öz-özünə ünvanı",
  "link-local": "Link-local: yalnız birbaşa qoşulu seqmentdə",
  cgnat: "Operator NAT-ı (CGNAT, RFC 6598): bir çox müştəri arasında paylaşılır",
  multicast: "Multicast: bir yox, bir qrup alıcı üçün",
  reserved: "Ayrılmış (reserved): IANA tərəfindən xüsusi məqsədə saxlanılıb",
  documentation: "Sənədləşmə bloku (RFC 5737 / RFC 3849): nümunələrdə işlədilir, real şəbəkədə olmamalıdır",
  "unique-local": "Unikal lokal (IPv6 ULA, fc00::/7): IPv4-ün xüsusi şəbəkəsinin IPv6 qarşılığı",
};

type Ipv4Range = { base: string; bits: number; kind: AddressKind };

/*
 * IANA's special-purpose IPv4 registry, the ranges that actually come up in
 * practice. Order does not matter — the ranges do not overlap — but they are
 * listed smallest-prefix-number (broadest) to largest so a reader can see the
 * shape of the address space at a glance.
 */
const IPV4_RANGES: Ipv4Range[] = [
  { base: "0.0.0.0", bits: 8, kind: "reserved" },
  { base: "10.0.0.0", bits: 8, kind: "private" },
  { base: "100.64.0.0", bits: 10, kind: "cgnat" },
  { base: "127.0.0.0", bits: 8, kind: "loopback" },
  { base: "169.254.0.0", bits: 16, kind: "link-local" },
  { base: "172.16.0.0", bits: 12, kind: "private" },
  { base: "192.0.0.0", bits: 24, kind: "reserved" },
  { base: "192.0.2.0", bits: 24, kind: "documentation" },
  { base: "192.168.0.0", bits: 16, kind: "private" },
  { base: "198.18.0.0", bits: 15, kind: "reserved" },
  { base: "198.51.100.0", bits: 24, kind: "documentation" },
  { base: "203.0.113.0", bits: 24, kind: "documentation" },
  { base: "224.0.0.0", bits: 4, kind: "multicast" },
  { base: "240.0.0.0", bits: 4, kind: "reserved" },
];

function inIpv4Range(value: number, base: string, bits: number): boolean {
  const network = parseIpv4(base);
  if (network === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) >>> 0 === (network & mask) >>> 0;
}

export function classifyIpv4(address: string): IpClassification | null {
  const value = parseIpv4(address);
  if (value === null) return null;

  for (const range of IPV4_RANGES) {
    if (inIpv4Range(value, range.base, range.bits)) {
      return { version: "v4", kind: range.kind, label: ADDRESS_KIND_LABELS[range.kind] };
    }
  }
  return { version: "v4", kind: "public", label: ADDRESS_KIND_LABELS.public };
}

export function classifyIpv6(address: string): IpClassification | null {
  const bytes = parseIpv6(address);
  if (bytes === null) return null;

  // An IPv4-mapped address (::ffff:a.b.c.d) is an IPv4 destination wearing
  // IPv6 syntax, so it is classified by the IPv4 rules — otherwise every one
  // of them would read as "public" regardless of the address it carries.
  const mappedPrefix = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (mappedPrefix) {
    const mapped = classifyIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
    return mapped ? { ...mapped, version: "v6" } : null;
  }

  const allZero = bytes.every((byte) => byte === 0);
  if (allZero) return { version: "v6", kind: "reserved", label: ADDRESS_KIND_LABELS.reserved };
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) {
    return { version: "v6", kind: "loopback", label: ADDRESS_KIND_LABELS.loopback };
  }
  if ((bytes[0] & 0xfe) === 0xfc) {
    return { version: "v6", kind: "unique-local", label: ADDRESS_KIND_LABELS["unique-local"] };
  }
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) {
    return { version: "v6", kind: "link-local", label: ADDRESS_KIND_LABELS["link-local"] };
  }
  if (bytes[0] === 0xff) {
    return { version: "v6", kind: "multicast", label: ADDRESS_KIND_LABELS.multicast };
  }
  // 2001:db8::/32 — the IPv6 documentation block (RFC 3849), the same role
  // TEST-NET-1/2/3 play for IPv4.
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
    return { version: "v6", kind: "documentation", label: ADDRESS_KIND_LABELS.documentation };
  }

  return { version: "v6", kind: "public", label: ADDRESS_KIND_LABELS.public };
}

export function classifyAddress(address: string): IpClassification | null {
  return classifyIpv4(address) ?? classifyIpv6(address);
}

/* ---------- telling an address apart from a domain name ---------- */

export type InputKind = "ipv4" | "ipv6" | "domain" | "invalid";

/* A conservative label check: 1-63 characters, letters/digits/hyphen, never
   starting or ending on a hyphen — enough to say "this looks like a domain",
   not a full validation of what a registry would actually accept. */
const DOMAIN_PATTERN =
  /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))+$/;

export function detectInputKind(raw: string): InputKind {
  const trimmed = raw.trim();
  if (trimmed === "") return "invalid";
  if (parseIpv4(trimmed) !== null) return "ipv4";
  if (parseIpv6(trimmed) !== null) return "ipv6";
  if (DOMAIN_PATTERN.test(trimmed)) return "domain";
  return "invalid";
}

/* ---------- forward-confirmed reverse DNS ---------- */

/** IPv6 literals differ only in case; IPv4 literals never do, so a plain lowercase compare is exact for both. */
function normalizeAddressForCompare(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * True when the address a PTR record named forward-resolves back to that
 * same address — the check that tells "this PTR record is trustworthy" apart
 * from "this PTR record is just a name somebody set, pointing nowhere in
 * particular back at this address."
 */
export function isForwardConfirmed(address: string, forwardAddresses: string[]): boolean {
  const target = normalizeAddressForCompare(address);
  return forwardAddresses.some((candidate) => normalizeAddressForCompare(candidate) === target);
}

/* ---------- the report the route assembles ---------- */

export type IpAddressResult = {
  address: string;
  classification: IpClassification;
  asn: CymruOrigin | null;
  asnName: string | null;
  asnError: string | null;
  rdap: RdapInfo | null;
  rdapError: string | null;
  ptr: string[] | null;
  ptrError: string | null;
  /** `null` when there was no PTR record to confirm, or the forward lookup itself failed. */
  forwardConfirmed: boolean | null;
};

export type IpLookupReport = {
  input: string;
  resolvedFrom: "direct" | "domain";
  domain: string | null;
  addresses: IpAddressResult[];
  checkedAt: string;
};
