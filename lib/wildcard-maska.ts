/**
 * Router and ACL mask arithmetic: converting one notation of a network mask —
 * prefix, subnet mask, wildcard mask, hex, binary — into every other
 * notation, and building the four ACL line syntaxes people actually paste
 * into a config.
 *
 * The one thing most converters get wrong is treating a wildcard mask as
 * nothing more than "the subnet mask with its bits flipped" and stopping
 * there. Cisco's ACL and OSPF `network` statements accept ANY 32-bit pattern
 * as a wildcard — `0.0.0.254` is legal and matches only even addresses — and
 * a pattern like that has no subnet-mask equivalent at all. That is why this
 * file treats "subnet mask" and "wildcard mask" as two different fields with
 * two different validity rules — a subnet mask must be contiguous ones then
 * zeros, a wildcard mask can be any pattern — rather than one auto-detected
 * blob of four octets. Auto-detection cannot tell a genuinely invalid subnet
 * mask (`255.0.255.0`, almost certainly a typo) apart from a genuinely legal
 * non-contiguous wildcard (`0.0.0.254`, meant on purpose): as raw octets the
 * two look identical, and only knowing which field the visitor typed into
 * resolves it.
 *
 * Every bitwise operation ends in `>>> 0`, for the same reason `subnet.ts`
 * needs it: `&`, `|`, `~` and `<<` all work in 32-bit SIGNED arithmetic in
 * JavaScript, so `255.255.255.255` comes back as -1 without the conversion.
 * `maskFromPrefix` special-cases `/0` for the same family of reason: `x << 32`
 * is `x << 0` in this language, not "shift everything out", so the mask for
 * `/0` would otherwise come back as 255.255.255.255 — the opposite of an
 * empty mask.
 */
import { parseIpv4 as parseIpv4Strict } from "./safe-url";

const IPV4_BITS = 32;

/* ---------- shared primitives ---------- */

export function formatIpv4(value: number): string {
  const unsigned = value >>> 0;
  return [
    (unsigned >>> 24) & 0xff,
    (unsigned >>> 16) & 0xff,
    (unsigned >>> 8) & 0xff,
    unsigned & 0xff,
  ].join(".");
}

/** The netmask for a prefix length. `/0` and `/32` are special-cased — see file header. */
export function maskFromPrefix(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= IPV4_BITS) return 0xffffffff;
  return (0xffffffff << (IPV4_BITS - prefix)) >>> 0;
}

/** The mask with every bit flipped — what an ACL or an OSPF `network` line wants. */
export function wildcardFromPrefix(prefix: number): number {
  return ~maskFromPrefix(prefix) >>> 0;
}

/** How many consecutive `1` bits sit at the top of the value, before the first `0`. */
export function leadingOnesCount(value: number): number {
  const unsigned = value >>> 0;
  let count = 0;
  for (let bit = IPV4_BITS - 1; bit >= 0; bit--) {
    if (((unsigned >>> bit) & 1) === 1) count++;
    else break;
  }
  return count;
}

/**
 * True only when the value is ones-then-zeros with no gap — the one shape a
 * subnet mask is allowed to take. A prefix built from the leading-ones count
 * has to reproduce the exact value, or there was a `1` after a `0` somewhere.
 */
export function isContiguousMask(value: number): boolean {
  const unsigned = value >>> 0;
  return maskFromPrefix(leadingOnesCount(unsigned)) === unsigned;
}

export type DottedQuadParse = { ok: true; value: number } | { ok: false; error: string };

/** Strict `a.b.c.d` parsing, reusing the SSRF-hardened octet reader every fetch on this site already trusts. */
export function parseDottedQuadText(text: string): DottedQuadParse {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "Boş sahə — dörd hissəli ünvan yaz (a.b.c.d)." };
  const value = parseIpv4Strict(trimmed);
  if (value === null) {
    return {
      ok: false,
      error: `«${trimmed}» düzgün formatda deyil — dörd hissə, hər biri 0–255 arası rəqəm olmalıdır (məsələn 255.255.255.0).`,
    };
  }
  return { ok: true, value };
}

/* ---------- the five input kinds ---------- */

export type MaskKind = "prefix" | "subnet-mask" | "wildcard-mask" | "hex-mask" | "binary-mask";

/** Declaration order — also the order the widget's segmented control draws them in. */
export const MASK_KIND_ORDER: MaskKind[] = [
  "prefix",
  "subnet-mask",
  "wildcard-mask",
  "hex-mask",
  "binary-mask",
];

export const MASK_KIND_LABELS: Record<MaskKind, string> = {
  prefix: "Prefiks",
  "subnet-mask": "Subnet maska",
  "wildcard-mask": "Wildcard maska",
  "hex-mask": "Hex maska",
  "binary-mask": "Binary",
};

export const DEFAULT_TEXT_FOR_KIND: Record<MaskKind, string> = {
  prefix: "/24",
  "subnet-mask": "255.255.255.0",
  "wildcard-mask": "0.0.0.255",
  "hex-mask": "0xffffff00",
  "binary-mask": "11111111.11111111.11111111.00000000",
};

export type PrefixParse = { ok: true; prefix: number } | { ok: false; error: string };

export function parsePrefixText(text: string): PrefixParse {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "Boş sahə — prefiks yaz, məsələn «/24»." };
  const stripped = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  if (!/^\d{1,3}$/.test(stripped)) {
    return { ok: false, error: `«${trimmed}» prefiks kimi oxunmadı — rəqəm yaz, məsələn «/24».` };
  }
  const prefix = Number.parseInt(stripped, 10);
  if (prefix < 0 || prefix > IPV4_BITS) {
    return { ok: false, error: `Prefiks 0 ilə 32 arasında olmalıdır, «/${prefix}» verildi.` };
  }
  return { ok: true, prefix };
}

export type SubnetMaskParse = { ok: true; prefix: number } | { ok: false; error: string };

/** Strict — a subnet mask must be contiguous ones then zeros, no exceptions. */
export function parseSubnetMaskText(text: string): SubnetMaskParse {
  const dotted = parseDottedQuadText(text);
  if (!dotted.ok) return { ok: false, error: dotted.error };
  if (!isContiguousMask(dotted.value)) {
    return {
      ok: false,
      error: `«${formatIpv4(dotted.value)}» etibarlı subnet maska deyil — 1-lərin arasında 0 var. Subnet maska soldan sağa ardıcıl 1, ardınca ardıcıl 0 olmalıdır (məsələn 255.255.255.0), araya sıfır girə bilməz.`,
    };
  }
  return { ok: true, prefix: leadingOnesCount(dotted.value) };
}

export type WildcardMaskParse =
  | { ok: true; contiguous: true; prefix: number; wildcard: number }
  | { ok: true; contiguous: false; wildcard: number }
  | { ok: false; error: string };

/** Permissive — Cisco allows any 32-bit pattern as a wildcard, contiguous or not. */
export function parseWildcardMaskText(text: string): WildcardMaskParse {
  const dotted = parseDottedQuadText(text);
  if (!dotted.ok) return { ok: false, error: dotted.error };
  const wildcard = dotted.value;
  const mask = ~wildcard >>> 0;
  if (isContiguousMask(mask)) {
    return { ok: true, contiguous: true, prefix: leadingOnesCount(mask), wildcard };
  }
  return { ok: true, contiguous: false, wildcard };
}

export type HexMaskParse = { ok: true; value: number } | { ok: false; error: string };

export function parseHexMaskText(text: string): HexMaskParse {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "Boş sahə — hex maska yaz, məsələn «0xffffff00»." };
  if (!/^0[xX][0-9a-fA-F]{1,8}$/.test(trimmed)) {
    return {
      ok: false,
      error: `«${trimmed}» hex maska formatına uyğun deyil — «0x» ilə başlamalı, ardınca 8-ə qədər onaltılıq rəqəm gəlməlidir (məsələn 0xffffff00).`,
    };
  }
  return { ok: true, value: Number.parseInt(trimmed.slice(2), 16) >>> 0 };
}

export type BinaryMaskParse = { ok: true; value: number } | { ok: false; error: string };

export function parseBinaryMaskText(text: string): BinaryMaskParse {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, error: "Boş sahə — binary maska yaz, məsələn «11111111.11111111.11111111.00000000»." };
  }
  const groups = trimmed.split(".");
  if (groups.length !== 4 || groups.some((group) => !/^[01]{8}$/.test(group))) {
    return {
      ok: false,
      error: `«${trimmed}» binary maska formatına uyğun deyil — dörd qrup, hər biri düz 8 rəqəmdən (0 və ya 1) ibarət olmalıdır, nöqtə ilə ayrılmış (məsələn 11111111.11111111.11111111.00000000).`,
    };
  }
  // Multiplication rather than a shift, same reasoning as subnet.ts: a shift
  // would make this signed exactly once, on the last group of a value above
  // 127.255.255.255.
  const value = groups.reduce((acc, group) => acc * 256 + Number.parseInt(group, 2), 0);
  return { ok: true, value };
}

/* ---------- host counting ---------- */

/**
 * "Minus two" for the network and broadcast address, except the two prefixes
 * that do not spend them: RFC 3021 defines `/31` as a point-to-point link
 * whose two addresses are both usable, and `/32` is a single host route.
 */
export function usableHostsFor(prefix: number, totalHosts: number): number {
  if (prefix === IPV4_BITS) return 1;
  if (prefix === IPV4_BITS - 1) return 2;
  return Math.max(totalHosts - 2, 0);
}

/* ---------- the six equivalent forms ---------- */

export type MaskForms = {
  prefix: number;
  subnetMask: string;
  wildcardMask: string;
  hexMask: string;
  binaryMask: string;
  totalHosts: number;
  usableHosts: number;
};

function binaryOctets(value: number): string {
  const unsigned = value >>> 0;
  return [24, 16, 8, 0]
    .map((shift) => ((unsigned >>> shift) & 0xff).toString(2).padStart(8, "0"))
    .join(".");
}

export function maskFormsFromPrefix(prefix: number): MaskForms {
  const mask = maskFromPrefix(prefix);
  const wildcard = wildcardFromPrefix(prefix);
  // `2 ** 32` is past the 32-bit range but well inside the 2^53 a JavaScript
  // number holds exactly, so /0 counts correctly.
  const totalHosts = 2 ** (IPV4_BITS - prefix);
  return {
    prefix,
    subnetMask: formatIpv4(mask),
    wildcardMask: formatIpv4(wildcard),
    hexMask: `0x${mask.toString(16).padStart(8, "0")}`,
    binaryMask: binaryOctets(mask),
    totalHosts,
    usableHosts: usableHostsFor(prefix, totalHosts),
  };
}

/* ---------- non-contiguous wildcard matching ---------- */

/** Bit positions (LSB first) where the wildcard is `1` — the bits an address is free to vary. */
function freeBitPositions(wildcard: number): number[] {
  const unsigned = wildcard >>> 0;
  const positions: number[] = [];
  for (let bit = 0; bit < IPV4_BITS; bit++) {
    if (((unsigned >>> bit) & 1) === 1) positions.push(bit);
  }
  return positions;
}

/**
 * Every address a wildcard mask matches, relative to a base network address —
 * well-defined whether or not the wildcard is contiguous, because ACL
 * matching never required contiguity in the first place: a bit is fixed
 * where the wildcard is `0` and free where it is `1`.
 *
 * Counting an incrementing binary counter into the free bit positions (lowest
 * counter bit into the lowest free position, and so on) produces addresses in
 * ascending numeric order, so `limit` can stop early without sorting.
 */
export function enumerateWildcardMatches(
  network: number,
  wildcard: number,
  limit: number,
): { addresses: number[]; total: number } {
  const base = (network & ~wildcard) >>> 0;
  const positions = freeBitPositions(wildcard);
  const total = 2 ** positions.length;
  const shown = Math.min(total, Math.max(0, limit));

  const addresses: number[] = [];
  for (let i = 0; i < shown; i++) {
    let address = base;
    for (let p = 0; p < positions.length; p++) {
      if (((i >>> p) & 1) === 1) address = (address | (1 << positions[p])) >>> 0;
    }
    addresses.push(address);
  }
  return { addresses, total };
}

/* ---------- the one entry point the widget calls ---------- */

export type ConvertResult =
  | { ok: true; contiguous: true; forms: MaskForms }
  | {
      ok: true;
      contiguous: false;
      wildcardMask: string;
      matchedCount: number;
      sampleAddresses: string[];
    }
  | { ok: false; error: string };

/**
 * `network` grounds the "which addresses does this match" preview for a
 * non-contiguous wildcard. It is not needed for any other branch, so a caller
 * that has no address yet (or an invalid one) can pass 0 — the preview then
 * reads relative to `0.0.0.0`, still a correct answer to "which bits vary".
 */
export function convertMaskInput(kind: MaskKind, text: string, network = 0): ConvertResult {
  switch (kind) {
    case "prefix": {
      const parsed = parsePrefixText(text);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, contiguous: true, forms: maskFormsFromPrefix(parsed.prefix) };
    }
    case "subnet-mask": {
      const parsed = parseSubnetMaskText(text);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, contiguous: true, forms: maskFormsFromPrefix(parsed.prefix) };
    }
    case "hex-mask": {
      const parsed = parseHexMaskText(text);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      if (!isContiguousMask(parsed.value)) {
        return {
          ok: false,
          error: `«${text.trim()}» ardıcıl subnet maskaya uyğun gəlmir — hex forması yalnız 1-lərin ardıcıl olduğu maskaları ifadə edir. Qeyri-ardıcıl naxış lazımdırsa «Wildcard maska» sahəsini işlət.`,
        };
      }
      return { ok: true, contiguous: true, forms: maskFormsFromPrefix(leadingOnesCount(parsed.value)) };
    }
    case "binary-mask": {
      const parsed = parseBinaryMaskText(text);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      if (!isContiguousMask(parsed.value)) {
        return {
          ok: false,
          error: `«${text.trim()}» ardıcıl subnet maskaya uyğun gəlmir — binary forması yalnız 1-lərin ardıcıl olduğu maskaları ifadə edir. Qeyri-ardıcıl naxış lazımdırsa «Wildcard maska» sahəsini işlət.`,
        };
      }
      return { ok: true, contiguous: true, forms: maskFormsFromPrefix(leadingOnesCount(parsed.value)) };
    }
    case "wildcard-mask": {
      const parsed = parseWildcardMaskText(text);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      if (parsed.contiguous) {
        return { ok: true, contiguous: true, forms: maskFormsFromPrefix(parsed.prefix) };
      }
      const { addresses, total } = enumerateWildcardMatches(network, parsed.wildcard, 10);
      return {
        ok: true,
        contiguous: false,
        wildcardMask: formatIpv4(parsed.wildcard),
        matchedCount: total,
        sampleAddresses: addresses.map(formatIpv4),
      };
    }
  }
}

/* ---------- router / ACL syntax ---------- */

export type AclLines = {
  ciscoAcl: string;
  ciscoOspf: string;
  /** `null` when the wildcard has no prefix equivalent — CIDR cannot express it. */
  cidr: string | null;
  /** `null` for the same reason as `cidr`. */
  iptables: string | null;
};

export type AclLinesResult = { ok: true; lines: AclLines } | { ok: false; error: string };

export function buildAclLines(
  networkText: string,
  wildcardText: string,
  prefix: number | null,
  aclNumber: number,
  area: number,
): AclLinesResult {
  const network = parseDottedQuadText(networkText);
  if (!network.ok) return { ok: false, error: network.error };
  const wildcard = parseDottedQuadText(wildcardText);
  if (!wildcard.ok) return { ok: false, error: wildcard.error };

  const networkStr = formatIpv4(network.value);
  const wildcardStr = formatIpv4(wildcard.value);

  return {
    ok: true,
    lines: {
      ciscoAcl: `access-list ${aclNumber} permit ${networkStr} ${wildcardStr}`,
      ciscoOspf: `network ${networkStr} ${wildcardStr} area ${area}`,
      cidr: prefix === null ? null : `${networkStr}/${prefix}`,
      iptables: prefix === null ? null : `-s ${networkStr}/${prefix}`,
    },
  };
}

/** Falls back rather than erroring — the ACL number and OSPF area are cosmetic, not arithmetic. */
export function parseNonNegativeIntText(text: string, fallback: number): number {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  return Number.parseInt(trimmed, 10);
}
