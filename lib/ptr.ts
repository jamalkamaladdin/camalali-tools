/**
 * Reverse DNS: turning an IP address into a name (PTR), and then checking
 * whether that name actually resolves back to the same address.
 *
 * The two directions are independent DNS lookups and either can be wrong on
 * its own — a PTR record left over from a previous tenant of an IP, a
 * forward zone nobody updated — so the fact worth showing is not "here is a
 * hostname" but "here is a hostname, and here is whether it points back".
 * Mail servers refuse to accept mail from a sender whose reverse and forward
 * records disagree, which is the practical reason this tool exists.
 *
 * The route does both lookups (`dns.reverse` for PTR, `resolve4`/`resolve6`
 * for the forward check); this file only compares the addresses it is
 * handed, so `scripts/tools-checks/ptr.mts` can prove the comparison without
 * a resolver.
 */
import { parseIpv4, parseIpv6 } from "./safe-url";

export type IpFamily = 4 | 6;

export type IpCheck = { ok: true; ip: string; family: IpFamily } | { ok: false; error: string };

/**
 * Confirms the input is a literal IP address and says which family it is.
 *
 * Deliberately refuses a hostname: reverse DNS answers "who does this
 * address belong to", and a hostname handed to it would first need a forward
 * lookup of its own — a different tool's job, and a silent extra network
 * call this file will not make on the caller's behalf.
 */
export function checkIpAddress(raw: string): IpCheck {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Boş sahə — IP ünvanı yaz." };

  if (parseIpv4(trimmed) !== null) return { ok: true, ip: trimmed, family: 4 };

  const stripped = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  if (parseIpv6(stripped) !== null) return { ok: true, ip: stripped, family: 6 };

  return {
    ok: false,
    error: "Bu IP ünvanına oxşamır — «93.184.216.34» və ya «2606:2800:220:1::248» kimi yaz.",
  };
}

/**
 * True when two written forms of an address name the same bytes.
 *
 * A plain string comparison would call `93.184.216.34` different from itself
 * written with a stray space, and would call `2606:2800:220:1::248` different
 * from `2606:2800:0220:0001:0000:0000:0000:0248` — two forms of the identical
 * IPv6 address, and exactly the kind of pair a resolver and a PTR record
 * disagree on in writing while agreeing in fact. Comparing the parsed bytes
 * is what makes those the same answer.
 */
export function ipsEqual(a: string, b: string): boolean {
  const aFour = parseIpv4(a.trim());
  const bFour = parseIpv4(b.trim());
  if (aFour !== null || bFour !== null) return aFour !== null && bFour !== null && aFour === bFour;

  const aSix = parseIpv6(a.trim());
  const bSix = parseIpv6(b.trim());
  if (aSix === null || bSix === null) return false;
  return aSix.every((byte, index) => byte === bSix[index]);
}

export type ReverseNameCheck = {
  hostname: string;
  /** What resolving `hostname` forward returned — empty when the lookup itself failed. */
  forwardAddresses: string[];
  /** Whether any of those addresses is the same address the visitor started from. */
  matchesOriginal: boolean;
  forwardError: string | null;
};

/** One PTR name checked against the original address, given its already-resolved forward addresses. */
export function buildNameCheck(
  originalIp: string,
  hostname: string,
  forwardAddresses: string[],
  forwardError: string | null,
): ReverseNameCheck {
  return {
    hostname,
    forwardAddresses,
    matchesOriginal: forwardAddresses.some((address) => ipsEqual(address, originalIp)),
    forwardError,
  };
}

export type PtrReport = {
  ip: string;
  family: IpFamily;
  checkedAt: string;
  /** Empty means the address has no PTR record — a fact, not a failure. */
  ptrNames: string[];
  checks: ReverseNameCheck[];
  /** True when at least one PTR name resolves forward back to the original address. */
  consistent: boolean;
};

/**
 * True when the reverse and forward records agree — the one number the whole
 * tool exists to compute. `false` on an empty `checks` list on purpose: no
 * PTR name at all is not consistency, it is the absence of anything to be
 * consistent about.
 */
export function isConsistent(checks: readonly ReverseNameCheck[]): boolean {
  return checks.length > 0 && checks.some((check) => check.matchesOriginal);
}

export function buildPtrReport(ip: string, family: IpFamily, checks: ReverseNameCheck[]): PtrReport {
  return {
    ip,
    family,
    checkedAt: new Date().toISOString(),
    ptrNames: checks.map((check) => check.hostname),
    checks,
    consistent: isConsistent(checks),
  };
}
