/**
 * IPv4 subnet arithmetic, plus the part of IPv6 a browser can answer honestly:
 * normalising an address between its short and its full form, and counting
 * what a prefix covers.
 *
 * The whole file is arithmetic on a 32-bit unsigned integer, and JavaScript
 * has no such type. `&`, `|`, `~` and `<<` all convert their operands to a
 * 32-bit SIGNED integer and hand back a signed result, so 255.255.255.255 —
 * the one address whose top bit is set in every octet — comes back as -1 and
 * prints as "-1.-1.-1.-1" unless every single operation is closed with
 * `>>> 0`. `>>>` is the only bitwise operator in the language that produces an
 * unsigned result, and that is why it appears after every mask below rather
 * than only where it looks necessary.
 */

/** IPv4 is 32 bits, so a prefix can name 0 through 32 of them. */
export const IPV4_PREFIX_MAX = 32;

/** IPv6 is 128 bits. */
export const IPV6_PREFIX_MAX = 128;

/* ---------- IPv4 parsing and printing ---------- */

export type Ipv4Parse = { ok: true; value: number } | { ok: false; error: string };

/**
 * Strict dotted-quad parsing. Strict on purpose in two places:
 *
 * `Number("1e2")` is 100 and `parseInt("12abc")` is 12, so the digits are
 * checked with a regular expression before any conversion — otherwise
 * "1e2.0.0.1" and "12abc.0.0.1" both become valid addresses.
 *
 * A leading zero is refused rather than silently accepted. `inet_aton` and a
 * good deal of C code read "0177.0.0.1" as octal, which is 127.0.0.1, while
 * every JavaScript parser reads it as 177 decimal. An address that means two
 * different hosts depending on who reads it is the classic SSRF filter bypass,
 * so this tool refuses to guess which one the visitor meant.
 */
export function parseIpv4(text: string): Ipv4Parse {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "Boş sahə — IPv4 ünvanı yaz." };

  const parts = trimmed.split(".");
  if (parts.length !== 4) {
    return {
      ok: false,
      error: `IPv4 dörd hissədən ibarətdir (a.b.c.d), ${parts.length} hissə tapıldı.`,
    };
  }

  let value = 0;
  for (let i = 0; i < 4; i++) {
    const part = parts[i];
    if (!/^\d{1,3}$/.test(part)) {
      return {
        ok: false,
        error: `${i + 1}-ci hissə rəqəmlərdən ibarət deyil: «${part}».`,
      };
    }
    if (part.length > 1 && part[0] === "0") {
      return {
        ok: false,
        error: `${i + 1}-ci hissə sıfırla başlayır: «${part}». Bəzi sistemlər belə rəqəmi səkkizlik oxuyur — sıfırsız yaz.`,
      };
    }
    const octet = Number(part);
    if (octet > 255) {
      return {
        ok: false,
        error: `${i + 1}-ci hissə 255-dən böyükdür: ${octet}. Hər hissə 0–255 aralığındadır.`,
      };
    }
    // Multiplication rather than `(value << 8) | octet`: the shift would make
    // this signed exactly once, on the last octet of an address above
    // 127.255.255.255, and that is a bug you only see on half the inputs.
    value = value * 256 + octet;
  }

  return { ok: true, value };
}

export function formatIpv4(value: number): string {
  // `>>> 0` first, so a caller that handed us a signed result from its own
  // arithmetic still gets four octets instead of negative numbers.
  const unsigned = value >>> 0;
  return [
    (unsigned >>> 24) & 0xff,
    (unsigned >>> 16) & 0xff,
    (unsigned >>> 8) & 0xff,
    unsigned & 0xff,
  ].join(".");
}

/**
 * The netmask for a prefix length.
 *
 * `/0` is special-cased and it is not an optimisation. JavaScript takes the
 * shift count modulo 32, so `0xffffffff << 32` shifts by 0 and returns
 * 0xffffffff — the mask for /0 would come out as 255.255.255.255, the exact
 * opposite of what it is.
 */
export function maskFromPrefix(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= IPV4_PREFIX_MAX) return 0xffffffff;
  return (0xffffffff << (IPV4_PREFIX_MAX - prefix)) >>> 0;
}

/** The netmask with every bit flipped — what an ACL or an OSPF config wants. */
export function wildcardFromPrefix(prefix: number): number {
  return ~maskFromPrefix(prefix) >>> 0;
}

/* ---------- classification ---------- */

/**
 * The classful letter. Classful routing was replaced by CIDR in 1993 (RFC
 * 1519) and no router alive makes a decision on it, but exam questions,
 * legacy documentation and a good deal of vendor UI still name it, so the tool
 * reports it and says what it is worth.
 */
export type Ipv4Class = "A" | "B" | "C" | "D" | "E";

export function classOf(value: number): Ipv4Class {
  const first = (value >>> 24) & 0xff;
  if (first < 128) return "A";
  if (first < 192) return "B";
  if (first < 224) return "C";
  if (first < 240) return "D";
  return "E";
}

export const CLASS_LABELS: Record<Ipv4Class, string> = {
  A: "A sinfi (0–127) — köhnə təsnifat, standart maska /8",
  B: "B sinfi (128–191) — köhnə təsnifat, standart maska /16",
  C: "C sinfi (192–223) — köhnə təsnifat, standart maska /24",
  D: "D sinfi (224–239) — multicast, hosta verilmir",
  E: "E sinfi (240–255) — ayrılmış, istifadə olunmur",
};

export type Ipv4Scope = {
  /** True only for the three RFC 1918 ranges — the ones a NAT hides. */
  private: boolean;
  /** What this range is for, in the visitor's language. */
  label: string;
  /** The document that reserves it, so the answer can be checked. */
  reference: string;
};

/*
 * Reserved ranges, most specific first — 100.64.0.0/10 sits inside no other
 * entry here but 192.0.2.0/24 does sit inside a class C, so order decides
 * which label wins. Only the three RFC 1918 blocks carry `private: true`:
 * loopback, link-local and carrier NAT are all non-routable on the public
 * internet, but calling them "private" would tell somebody debugging a
 * 169.254 address that their DHCP worked.
 */
const RESERVED: { prefix: number; network: string; scope: Ipv4Scope }[] = [
  {
    network: "255.255.255.255",
    prefix: 32,
    scope: {
      private: false,
      label: "Məhdud yayım ünvanı: yalnız yerli seqmentə göndərilir",
      reference: "RFC 919",
    },
  },
  {
    network: "0.0.0.0",
    prefix: 8,
    scope: { private: false, label: "«Bu şəbəkə»: mənbə ünvanı kimi", reference: "RFC 1122" },
  },
  {
    network: "10.0.0.0",
    prefix: 8,
    scope: { private: true, label: "Şəxsi şəbəkə", reference: "RFC 1918" },
  },
  {
    network: "100.64.0.0",
    prefix: 10,
    scope: {
      private: false,
      label: "Operator NAT-ı (CGNAT): provayderin daxili aralığı",
      reference: "RFC 6598",
    },
  },
  {
    network: "127.0.0.0",
    prefix: 8,
    scope: { private: false, label: "Loopback: cihazın özü", reference: "RFC 1122" },
  },
  {
    network: "169.254.0.0",
    prefix: 16,
    scope: {
      private: false,
      label: "Link-local (APIPA): DHCP cavab vermədikdə özü təyin olunur",
      reference: "RFC 3927",
    },
  },
  {
    network: "172.16.0.0",
    prefix: 12,
    scope: { private: true, label: "Şəxsi şəbəkə", reference: "RFC 1918" },
  },
  {
    network: "192.0.2.0",
    prefix: 24,
    scope: { private: false, label: "Sənədləşmə üçün (TEST-NET-1)", reference: "RFC 5737" },
  },
  {
    network: "192.168.0.0",
    prefix: 16,
    scope: { private: true, label: "Şəxsi şəbəkə", reference: "RFC 1918" },
  },
  {
    network: "198.18.0.0",
    prefix: 15,
    scope: { private: false, label: "Avadanlıq testi üçün", reference: "RFC 2544" },
  },
  {
    network: "198.51.100.0",
    prefix: 24,
    scope: { private: false, label: "Sənədləşmə üçün (TEST-NET-2)", reference: "RFC 5737" },
  },
  {
    network: "203.0.113.0",
    prefix: 24,
    scope: { private: false, label: "Sənədləşmə üçün (TEST-NET-3)", reference: "RFC 5737" },
  },
  {
    network: "224.0.0.0",
    prefix: 4,
    scope: { private: false, label: "Multicast qrup ünvanı", reference: "RFC 5771" },
  },
  {
    network: "240.0.0.0",
    prefix: 4,
    scope: { private: false, label: "Ayrılmış aralıq", reference: "RFC 1112" },
  },
];

const PUBLIC_SCOPE: Ipv4Scope = {
  private: false,
  label: "İctimai ünvan: internetdə marşrutlanır",
  reference: "IANA",
};

export function scopeOf(value: number): Ipv4Scope {
  for (const entry of RESERVED) {
    const parsed = parseIpv4(entry.network);
    if (!parsed.ok) continue; // unreachable: the table above is literal text
    const mask = maskFromPrefix(entry.prefix);
    if (((value & mask) >>> 0) === ((parsed.value & mask) >>> 0)) return entry.scope;
  }
  return PUBLIC_SCOPE;
}

/* ---------- the subnet itself ---------- */

export type SubnetInfo = {
  /** The address exactly as it was given, before masking. */
  address: number;
  prefix: number;
  network: number;
  /**
   * Null at /31 and /32. A /32 is one address with nothing to broadcast to,
   * and RFC 3021 spends the /31 broadcast address on the second host.
   */
  broadcast: number | null;
  mask: number;
  wildcard: number;
  /** Null only when the block holds no address a host could take. */
  firstHost: number | null;
  lastHost: number | null;
  /** Every address in the block, network and broadcast included. */
  totalAddresses: number;
  /** The ones a host can actually be given. */
  usableHosts: number;
  addressClass: Ipv4Class;
  scope: Ipv4Scope;
  /** True when the address given was not the network address itself. */
  insideBlock: boolean;
};

/**
 * Host counting has three cases and only the first is the textbook one.
 *
 * Up to /30 the network address and the broadcast address are both spent, so
 * usable hosts are two fewer than the block. At /31 there is no room for that
 * convention: RFC 3021 defines the two addresses of a /31 as the two ends of a
 * point-to-point link, so both are usable and the count is 2, not 0. A /32 is
 * a single host route — one address, one usable, no broadcast.
 */
export function describeSubnet(address: number, prefix: number): SubnetInfo {
  const mask = maskFromPrefix(prefix);
  const wildcard = wildcardFromPrefix(prefix);
  const network = (address & mask) >>> 0;

  // `2 ** 32` is 4294967296, which is past the 32-bit range but well inside
  // the 2^53 a JavaScript number holds exactly — so /0 counts correctly.
  const totalAddresses = 2 ** (IPV4_PREFIX_MAX - prefix);

  if (prefix === IPV4_PREFIX_MAX) {
    return {
      address,
      prefix,
      network,
      broadcast: null,
      mask,
      wildcard,
      firstHost: network,
      lastHost: network,
      totalAddresses: 1,
      usableHosts: 1,
      addressClass: classOf(address),
      scope: scopeOf(address),
      insideBlock: false,
    };
  }

  const broadcastValue = (network | wildcard) >>> 0;

  if (prefix === 31) {
    return {
      address,
      prefix,
      network,
      broadcast: null,
      mask,
      wildcard,
      firstHost: network,
      lastHost: broadcastValue,
      totalAddresses: 2,
      usableHosts: 2,
      addressClass: classOf(address),
      scope: scopeOf(address),
      insideBlock: address !== network,
    };
  }

  return {
    address,
    prefix,
    network,
    broadcast: broadcastValue,
    mask,
    wildcard,
    firstHost: (network + 1) >>> 0,
    lastHost: (broadcastValue - 1) >>> 0,
    totalAddresses,
    usableHosts: totalAddresses - 2,
    addressClass: classOf(address),
    scope: scopeOf(address),
    insideBlock: address !== network,
  };
}

export type SubnetAnalysis = { ok: true; info: SubnetInfo } | { ok: false; error: string };

/**
 * Splits "a.b.c.d/nn" into its two halves without validating either, so the
 * widget can move a pasted prefix onto its own control while the address is
 * still half-typed. A missing prefix comes back as null.
 */
export function splitCidrText(text: string): { address: string; prefix: number | null } {
  const [addressPart, prefixPart, ...rest] = text.trim().split("/");
  if (prefixPart === undefined || rest.length > 0) {
    return { address: text.trim(), prefix: null };
  }
  if (!/^\d{1,3}$/.test(prefixPart.trim())) return { address: addressPart.trim(), prefix: null };
  return { address: addressPart.trim(), prefix: Number(prefixPart.trim()) };
}

/**
 * The one entry point the widget calls. `fallbackPrefix` is used when the text
 * carries no "/nn" of its own — the widget keeps a slider, and a bare address
 * should be read at whatever the slider says rather than silently at /32.
 */
export function analyseIpv4(text: string, fallbackPrefix: number): SubnetAnalysis {
  const { address, prefix } = splitCidrText(text);

  const parsed = parseIpv4(address);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const effective = prefix ?? fallbackPrefix;
  if (!Number.isInteger(effective) || effective < 0 || effective > IPV4_PREFIX_MAX) {
    return {
      ok: false,
      error: `Prefiks 0 ilə 32 arasında olmalıdır, «/${effective}» verildi.`,
    };
  }

  return { ok: true, info: describeSubnet(parsed.value, effective) };
}

/**
 * The whole reading as plain text, for the copy button.
 *
 * It lives here rather than in the widget because it is the one thing a
 * visitor takes away with them — into a ticket, a config comment, a message —
 * and a copied reading that disagrees with the panel it was copied from is the
 * worst possible outcome. One function, one source of both.
 */
export function subnetReport(info: SubnetInfo): string {
  const rows: [string, string][] = [
    ["Şəbəkə", `${formatIpv4(info.network)}/${info.prefix}`],
    ["Maska", formatIpv4(info.mask)],
    ["Wildcard", formatIpv4(info.wildcard)],
    ["Broadcast", info.broadcast === null ? "yoxdur" : formatIpv4(info.broadcast)],
    [
      "Host aralığı",
      info.firstHost === null || info.lastHost === null
        ? "yoxdur"
        : `${formatIpv4(info.firstHost)} – ${formatIpv4(info.lastHost)}`,
    ],
    ["Ünvan sayı", String(info.totalAddresses)],
    ["İstifadə edilə bilən host", String(info.usableHosts)],
    ["Sinif", info.addressClass],
    ["Növ", `${info.scope.label} (${info.scope.reference})`],
  ];
  return rows.map(([name, value]) => `${name}: ${value}`).join("\n");
}

/* ---------- splitting into smaller blocks ---------- */

export type SubnetPart = {
  network: number;
  broadcast: number | null;
  firstHost: number | null;
  lastHost: number | null;
  usableHosts: number;
  cidr: string;
};

export type SubnetSplit = {
  parts: SubnetPart[];
  /** How many blocks the split really produces, before the display limit. */
  total: number;
  /** True when `parts` holds fewer rows than `total`. */
  truncated: boolean;
  newPrefix: number;
};

/**
 * A /8 cut into /24s is 65 536 rows, and a /0 into /32s is four billion — a
 * list nobody reads and a page that never finishes drawing. The split is
 * computed in full (`total` is exact) and only the rendered rows are capped.
 */
export const SPLIT_ROW_LIMIT = 128;

export function splitSubnet(
  info: SubnetInfo,
  newPrefix: number,
  limit: number = SPLIT_ROW_LIMIT,
): SubnetSplit {
  const safePrefix = Math.min(IPV4_PREFIX_MAX, Math.max(info.prefix, Math.round(newPrefix)));
  const total = 2 ** (safePrefix - info.prefix);
  const step = 2 ** (IPV4_PREFIX_MAX - safePrefix);
  const shown = Math.min(total, Math.max(0, limit));

  const parts: SubnetPart[] = [];
  for (let i = 0; i < shown; i++) {
    // Plain addition, not `network + i * step` through a bitwise operator: the
    // sum of a /0 split passes 2^31 and any `|` or `<<` on the way would flip
    // it negative. `>>> 0` puts it back into unsigned range at the end.
    const child = describeSubnet((info.network + i * step) >>> 0, safePrefix);
    parts.push({
      network: child.network,
      broadcast: child.broadcast,
      firstHost: child.firstHost,
      lastHost: child.lastHost,
      usableHosts: child.usableHosts,
      cidr: `${formatIpv4(child.network)}/${safePrefix}`,
    });
  }

  return { parts, total, truncated: shown < total, newPrefix: safePrefix };
}

/* ---------- IPv6 ---------- */

/*
 * What this tool does with IPv6 and what it does not, stated once here and
 * repeated to the visitor on the page.
 *
 * Does: normalise between the shortened and the full 8-group form, mask an
 * address to its prefix, and count the addresses a prefix covers.
 *
 * Does not: first/last host, broadcast, private-or-public. Those questions
 * either have no IPv6 answer at all (there is no broadcast in IPv6 — its job
 * went to multicast) or they need a different vocabulary than IPv4's, and a
 * half-translated answer is worse than an absent one.
 */

export type Ipv6Groups = { ok: true; groups: number[] } | { ok: false; error: string };

/** Parses any legal textual form into the eight 16-bit groups behind it. */
export function parseIpv6(text: string): Ipv6Groups {
  let value = text.trim();
  if (value === "") return { ok: false, error: "Boş sahə — IPv6 ünvanı yaz." };

  // "[2001:db8::1]:443" is how a URL carries one; the brackets and the port
  // are not part of the address.
  if (value.startsWith("[")) {
    const close = value.indexOf("]");
    if (close === -1) return { ok: false, error: "Açılan «[» var, bağlanan «]» yoxdur." };
    value = value.slice(1, close);
  }

  // A zone id ("fe80::1%eth0") names an interface on the local machine, not a
  // part of the address, so it is dropped rather than rejected.
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);

  if (value.split("::").length > 2) {
    return { ok: false, error: "«::» ünvanda yalnız bir dəfə ola bilər." };
  }

  // Caught here rather than left to the group counter below, which would have
  // told somebody who pasted an IPv4 address that eight groups are needed —
  // true, and no help at all in finding the wrong field.
  if (!value.includes(":")) {
    return {
      ok: false,
      error: "Bu IPv4 ünvanına oxşayır. IPv6 qrupları iki nöqtə ilə ayrılır: 2001:db8::1.",
    };
  }

  // A trailing IPv4 ("::ffff:192.168.0.1") is two groups written in decimal.
  let tail: number[] = [];
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const embedded = value.slice(lastColon + 1);
    const parsed = parseIpv4(embedded);
    if (!parsed.ok) {
      return { ok: false, error: `Sondakı IPv4 hissəsi düzgün deyil: ${parsed.error}` };
    }
    tail = [(parsed.value >>> 16) & 0xffff, parsed.value & 0xffff];
    value = value.slice(0, lastColon + 1) + "0:0";
  }

  const [leftText, rightText] = value.includes("::") ? value.split("::") : [value, null];

  const readSide = (side: string): number[] | null => {
    if (side === "") return [];
    const out: number[] = [];
    for (const piece of side.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
      out.push(parseInt(piece, 16));
    }
    return out;
  };

  const left = readSide(leftText);
  if (left === null) {
    return { ok: false, error: "Qruplar 1–4 onaltılıq rəqəmdən ibarət olmalıdır." };
  }

  if (rightText === null) {
    if (left.length !== 8) {
      return {
        ok: false,
        error: `«::» olmadan səkkiz qrup lazımdır, ${left.length} qrup tapıldı.`,
      };
    }
    const groups = tail.length > 0 ? [...left.slice(0, 6), ...tail] : left;
    return { ok: true, groups };
  }

  const right = readSide(rightText);
  if (right === null) {
    return { ok: false, error: "Qruplar 1–4 onaltılıq rəqəmdən ibarət olmalıdır." };
  }

  const filled = 8 - left.length - right.length;
  if (filled < 0) {
    return { ok: false, error: "Səkkiz qrupdan çox yazılıb — «::» sıfırları əvəz edir." };
  }

  const groups = [...left, ...Array<number>(filled).fill(0), ...right];
  return { ok: true, groups: tail.length > 0 ? [...groups.slice(0, 6), ...tail] : groups };
}

/** The full 8x4 form: every group padded to four digits, nothing collapsed. */
export function expandIpv6(groups: number[]): string {
  return groups.map((g) => g.toString(16).padStart(4, "0")).join(":");
}

/**
 * The canonical short form of RFC 5952: lowercase, leading zeros dropped, and
 * the LONGEST run of zero groups replaced by "::" — leftmost when two runs tie.
 * A single zero group is left alone, because "::" saves nothing there and the
 * RFC forbids it.
 */
export function compressIpv6(groups: number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;

  for (let i = 0; i <= groups.length; i++) {
    if (i < groups.length && groups[i] === 0) {
      if (runStart === -1) runStart = i;
      continue;
    }
    if (runStart !== -1) {
      const length = i - runStart;
      // Strictly greater, so the first of two equal runs wins.
      if (length > bestLength) {
        bestLength = length;
        bestStart = runStart;
      }
      runStart = -1;
    }
  }

  const pieces = groups.map((g) => g.toString(16));
  if (bestLength < 2) return pieces.join(":");

  const head = pieces.slice(0, bestStart).join(":");
  const tail = pieces.slice(bestStart + bestLength).join(":");
  return `${head}::${tail}`;
}

export type Ipv6Info = {
  expanded: string;
  compressed: string;
  prefix: number;
  networkExpanded: string;
  networkCompressed: string;
  /** How many addresses the prefix covers, exactly. */
  addressCount: bigint;
  /** The same number as a power of two — the only readable form past /64. */
  addressExponent: number;
};

export type Ipv6Analysis = { ok: true; info: Ipv6Info } | { ok: false; error: string };

/**
 * Digit grouping for a count that does not fit in a number. `formatNumber` in
 * `lib/format` takes a `number`, and an IPv6 /64 is 18 446 744 073 709 551 616
 * — passing that through a double loses the last four digits, so the grouping
 * is applied to the exact decimal string instead. The separator is the same
 * thin space the rest of the site uses.
 */
export function formatAddressCount(count: bigint): string {
  return count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function analyseIpv6(text: string, fallbackPrefix: number): Ipv6Analysis {
  const [addressPart, prefixPart, ...rest] = text.trim().split("/");
  if (rest.length > 0) return { ok: false, error: "Ünvanda birdən çox «/» var." };

  let prefix = fallbackPrefix;
  if (prefixPart !== undefined) {
    if (!/^\d{1,3}$/.test(prefixPart.trim())) {
      return { ok: false, error: `Prefiks rəqəm deyil: «/${prefixPart}».` };
    }
    prefix = Number(prefixPart.trim());
  }
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > IPV6_PREFIX_MAX) {
    return { ok: false, error: `IPv6 prefiksi 0 ilə 128 arasındadır, «/${prefix}» verildi.` };
  }

  const parsed = parseIpv6(addressPart);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  // Masking group by group rather than as one 128-bit BigInt: each group is
  // 16 bits, so the per-group mask never leaves the safe integer range and the
  // sign trap at the top of this file cannot reappear here.
  const network = parsed.groups.map((group, index) => {
    const bitsBefore = index * 16;
    const bitsHere = Math.min(16, Math.max(0, prefix - bitsBefore));
    if (bitsHere === 0) return 0;
    if (bitsHere === 16) return group;
    return (group >> (16 - bitsHere)) << (16 - bitsHere);
  });

  return {
    ok: true,
    info: {
      expanded: expandIpv6(parsed.groups),
      compressed: compressIpv6(parsed.groups),
      prefix,
      networkExpanded: expandIpv6(network),
      networkCompressed: compressIpv6(network),
      // BigInt, not `2 ** n`: a /0 is 2^128, which a JavaScript number can only
      // approximate — it would print as 3.402823669209385e+38.
      addressCount: BigInt(2) ** BigInt(IPV6_PREFIX_MAX - prefix),
      addressExponent: IPV6_PREFIX_MAX - prefix,
    },
  };
}
