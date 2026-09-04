/**
 * IPv6 address arithmetic: the questions `subnet.ts` explicitly declines to
 * answer for IPv6 — host range, broadcast, private/public scope — because
 * its own comment says they need IPv6's own vocabulary rather than a
 * translated IPv4 one. This file is that vocabulary: RFC 5952 canonical
 * form, the RFC-defined address classes, prefix containment and the
 * `.ip6.arpa` reverse name.
 *
 * `src/lib/tools/safe-url.ts` also parses IPv6, but only down to 16 raw
 * bytes and a bare `null` on failure — enough to decide "is this address
 * blocked", not enough to tell a visitor which of five different mistakes
 * they made. This file parses to the eight 16-bit groups RFC 5952 itself
 * works in, and every rejection carries the reason.
 *
 * BigInt throughout for anything sized in bits rather than groups: a /0
 * covers 2^128 addresses, `2 ** 128` a JavaScript `number` can only
 * approximate (it prints as `3.402823669209385e+38`), and the 32-bit sign
 * trap that `subnet.ts` fights with `>>> 0` does not exist for BigInt at
 * all — there is no 32-bit truncation to guard against.
 */

/** IPv6 is 128 bits, so a prefix can name 0 through 128 of them. */
export const IPV6_PREFIX_MAX = 128;

const GROUP_COUNT = 8;

/* ---------- parsing ---------- */

export type Ipv6ParseResult = { ok: true; groups: number[] } | { ok: false; error: string };

/**
 * Strict dotted-quad, shared by the trailing-IPv4 case (`::ffff:192.0.2.1`)
 * and the bare-IPv4 case (a visitor pastes `192.0.2.1` with no `:` at all).
 * A leading zero is refused for the same reason `subnet.ts` refuses one: some
 * readers treat `010` as octal and some as decimal, and an address two
 * layers disagree about is not safe to normalise silently.
 */
function parseDottedQuad(text: string): { ok: true; groups: [number, number] } | { ok: false; error: string } {
  const parts = text.split(".");
  if (parts.length !== 4) {
    return { ok: false, error: `IPv4 hissəsi dörd rəqəmdən ibarət olmalıdır (a.b.c.d): «${text}».` };
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) {
      return { ok: false, error: `IPv4 hissəsindəki «${part}» rəqəm deyil və ya sıfırla başlayır.` };
    }
    const octet = Number(part);
    if (octet > 255) {
      return { ok: false, error: `IPv4 hissəsindəki «${part}» 255-dən böyükdür.` };
    }
    octets.push(octet);
  }
  return { ok: true, groups: [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]] };
}

function readGroups(side: string): { ok: true; groups: number[] } | { ok: false; error: string } {
  if (side === "") return { ok: true, groups: [] };
  const pieces = side.split(":");
  const groups: number[] = [];
  for (const piece of pieces) {
    if (piece === "") return { ok: false, error: "Ünvanda tək qalmış «:» var — düzgün yerə «::» yaz." };
    if (piece.length > 4) {
      return { ok: false, error: `«${piece}» qrupu dörd onaltılıq rəqəmdən uzundur.` };
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) {
      return { ok: false, error: `«${piece}» onaltılıq rəqəm deyil — yalnız 0-9 və a-f hərfləri olmalıdır.` };
    }
    groups.push(Number.parseInt(piece, 16));
  }
  return { ok: true, groups };
}

/**
 * Parses a single IPv6 address (no prefix) into its eight 16-bit groups.
 * Rejects rather than repairs: two `::`, a group over four hex digits, too
 * many or too few groups and a malformed trailing IPv4 all come back as a
 * distinct Azerbaijani sentence instead of a thrown exception.
 */
export function parseIpv6Address(raw: string): Ipv6ParseResult {
  let text = raw.trim();
  if (text === "") return { ok: false, error: "Boş sahə — IPv6 ünvanı yaz." };

  if (text.startsWith("[")) {
    const close = text.indexOf("]");
    if (close === -1) return { ok: false, error: "Açılan «[» var, bağlanan «]» yoxdur." };
    text = text.slice(1, close);
  }

  /* A zone id (`fe80::1%eth0`) names an interface on the visitor's own
     machine, not part of the address, so it is dropped rather than rejected. */
  const zoneIndex = text.indexOf("%");
  if (zoneIndex !== -1) text = text.slice(0, zoneIndex);

  if (!text.includes(":")) {
    return { ok: false, error: "İki nöqtə (:) yoxdur — bu IPv6 ünvanına oxşamır." };
  }

  let scan = 0;
  let doubleColonCount = 0;
  while (true) {
    const at = text.indexOf("::", scan);
    if (at === -1) break;
    doubleColonCount++;
    scan = at + 2;
  }
  if (doubleColonCount > 1) {
    return { ok: false, error: "«::» ünvanda yalnız bir dəfə ola bilər — burada bir neçə dəfə görünür." };
  }

  // A trailing IPv4 tail ("::ffff:192.0.2.1") is two groups written in
  // decimal — parsed on its own and then folded back in as two hex groups,
  // so the rest of this function never has to think about dots.
  let ipv4Tail: [number, number] | null = null;
  if (text.includes(".")) {
    const lastColon = text.lastIndexOf(":");
    if (lastColon === -1) {
      return { ok: false, error: "IPv4 hissəsindən əvvəl «:» yoxdur." };
    }
    const tail = parseDottedQuad(text.slice(lastColon + 1));
    if (!tail.ok) return tail;
    ipv4Tail = tail.groups;
    text = `${text.slice(0, lastColon + 1)}0:0`;
  }

  const hasDoubleColon = text.includes("::");
  const splitAt = hasDoubleColon ? text.indexOf("::") : -1;
  const leftText = hasDoubleColon ? text.slice(0, splitAt) : text;
  const rightText = hasDoubleColon ? text.slice(splitAt + 2) : null;

  const left = readGroups(leftText);
  if (!left.ok) return left;
  const right = rightText === null ? { ok: true as const, groups: [] as number[] } : readGroups(rightText);
  if (!right.ok) return right;

  let groups: number[];
  if (!hasDoubleColon) {
    if (left.groups.length !== GROUP_COUNT) {
      return {
        ok: false,
        error: `«::» olmadan səkkiz qrup lazımdır, ${left.groups.length} qrup tapıldı.`,
      };
    }
    groups = left.groups;
  } else {
    const filled = GROUP_COUNT - left.groups.length - right.groups.length;
    if (filled < 1) {
      return { ok: false, error: "Səkkiz qrupdan çox yazılıb — «::» ən azı bir qrupu əvəz etməlidir." };
    }
    groups = [...left.groups, ...Array<number>(filled).fill(0), ...right.groups];
  }

  if (ipv4Tail) {
    groups = [...groups.slice(0, GROUP_COUNT - 2), ...ipv4Tail];
  }

  return { ok: true, groups };
}

/** Splits `"address/prefix"` into its two raw halves; a missing `/` leaves `prefixPart` null. */
function splitAddressAndPrefix(text: string): { addressPart: string; prefixPart: string | null } {
  const trimmed = text.trim();
  const slash = trimmed.lastIndexOf("/");
  if (slash === -1) return { addressPart: trimmed, prefixPart: null };
  return { addressPart: trimmed.slice(0, slash), prefixPart: trimmed.slice(slash + 1) };
}

function validatePrefix(prefixPart: string): { ok: true; prefix: number } | { ok: false; error: string } {
  if (!/^\d{1,3}$/.test(prefixPart)) {
    return { ok: false, error: `Prefiks rəqəm deyil: «/${prefixPart}».` };
  }
  const prefix = Number(prefixPart);
  if (prefix > IPV6_PREFIX_MAX) {
    return { ok: false, error: `IPv6 prefiksi 0 ilə 128 arasında olmalıdır, «/${prefix}» verildi.` };
  }
  return { ok: true, prefix };
}

/* ---------- RFC 5952 canonical text form ---------- */

/** The full 8x4 form: every group padded to four digits, nothing collapsed. */
export function expandGroups(groups: number[]): string {
  return groups.map((group) => group.toString(16).padStart(4, "0")).join(":");
}

/**
 * The canonical short form of RFC 5952: lowercase, leading zeros dropped, and
 * the LONGEST run of zero groups replaced by `::` — leftmost when two runs
 * tie (the comparison below is strict `>`, so the first run recorded is never
 * displaced by an equal one found later). A single zero group is left alone:
 * `::` would save nothing there and RFC 5952 section 4.2.2 forbids collapsing
 * it.
 */
export function compressGroups(groups: number[]): string {
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
      if (length > bestLength) {
        bestLength = length;
        bestStart = runStart;
      }
      runStart = -1;
    }
  }

  const pieces = groups.map((group) => group.toString(16));
  if (bestLength < 2) return pieces.join(":");

  const head = pieces.slice(0, bestStart).join(":");
  const tail = pieces.slice(bestStart + bestLength).join(":");
  return `${head}::${tail}`;
}

/* ---------- classification (RFC 4291 section 2.4, RFC 4193) ---------- */

export type Ipv6Kind =
  | "unspecified"
  | "loopback"
  | "ipv4-mapped"
  | "ipv4-compatible"
  | "multicast"
  | "link-local"
  | "unique-local"
  | "global-unicast"
  | "other";

export type Ipv6KindInfo = { label: string; meaning: string; reference: string };

export const IPV6_KIND_INFO: Record<Ipv6Kind, Ipv6KindInfo> = {
  unspecified: {
    label: "Naməlum ünvan (::)",
    meaning:
      "Ünvan hələ təyin olunmayıb — məsələn, ünvanını gözləyən bir interfeys bunu göstərir. Yalnız mənbə kimi işlədilir, heç vaxt hədəf olmur.",
    reference: "RFC 4291",
  },
  loopback: {
    label: "Loopback (::1)",
    meaning: "Cihazın özünə işarə edir — IPv4-dəki 127.0.0.1-in qarşılığı. Şəbəkə kartından heç vaxt xaricə çıxmır.",
    reference: "RFC 4291",
  },
  "ipv4-mapped": {
    label: "IPv4-mapped (::ffff:0:0/96)",
    meaning:
      "Bir IPv4 ünvanını IPv6 sintaksisi ilə daşıyır — hər iki dəsti dəstəkləyən (dual-stack) server gələn IPv4 bağlantısını çox vaxt bu formada görür.",
    reference: "RFC 4291",
  },
  "ipv4-compatible": {
    label: "IPv4-compatible (köhnəlmiş)",
    meaning:
      "İlk illərdə IPv4 üzərindən avtomatik IPv6 tunelləmə üçün nəzərdə tutulmuşdu. RFC 4291 onu köhnəlmiş elan edib, canlı şəbəkədə görünməməlidir.",
    reference: "RFC 4291 (köhnəlmiş)",
  },
  multicast: {
    label: "Multicast (ff00::/8)",
    meaning:
      "Tək ünvan bir qrup cihaza eyni anda çatdırılır. IPv6-da broadcast anlayışı yoxdur — onun yerini bütünlüklə multicast tutur.",
    reference: "RFC 4291",
  },
  "link-local": {
    label: "Link-local (fe80::/10)",
    meaning:
      "Yalnız eyni fiziki seqmentdə keçərlidir, heç bir marşrutlayıcıdan keçmir. Hər IPv6 interfeysi işə düşən kimi özünə avtomatik belə bir ünvan təyin edir.",
    reference: "RFC 4291",
  },
  "unique-local": {
    label: "Unique local (fc00::/7)",
    meaning:
      "İctimai internetdə marşrutlanmır — IPv4-dəki 10.0.0.0/8 kimi şəxsi ünvanların IPv6 qarşılığı, yalnız daxili şəbəkə üçün.",
    reference: "RFC 4193",
  },
  "global-unicast": {
    label: "Qlobal unicast (2000::/3)",
    meaning: "İnternetdə marşrutlanan, IANA tərəfindən provayderlərə və təşkilatlara bölüşdürülən ictimai ünvan sahəsi.",
    reference: "RFC 4291 / IANA",
  },
  other: {
    label: "Ayrılmış / hələ bölüşdürülməmiş",
    meaning: "Yuxarıdakı tanınan sahələrin heç birinə düşmür — IANA-nın hələ bölüşdürmədiyi ehtiyat aralığıdır.",
    reference: "IANA IPv6 Address Space",
  },
};

export function classifyIpv6(groups: number[]): Ipv6Kind {
  const allZero = groups.every((group) => group === 0);
  if (allZero) return "unspecified";

  const isLoopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  if (isLoopback) return "loopback";

  const isMapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (isMapped) return "ipv4-mapped";

  // Reached only once unspecified, loopback and mapped are ruled out, so this
  // is exactly "top 96 bits zero and nothing else matched" — the deprecated
  // ::a.b.c.d form.
  const isCompatible = groups.slice(0, 6).every((group) => group === 0);
  if (isCompatible) return "ipv4-compatible";

  const firstByte = groups[0] >>> 8;
  const secondByte = groups[0] & 0xff;

  if (firstByte === 0xff) return "multicast";
  if (firstByte === 0xfe && (secondByte & 0xc0) === 0x80) return "link-local";
  if ((firstByte & 0xfe) === 0xfc) return "unique-local";
  if ((firstByte & 0xe0) === 0x20) return "global-unicast";

  return "other";
}

/* ---------- IPv4 embedding ---------- */

function groupsToIpv4(hi: number, lo: number): string {
  return [hi >>> 8, hi & 0xff, lo >>> 8, lo & 0xff].join(".");
}

/* ---------- bit-level arithmetic (BigInt, no group-size assumptions) ---------- */

function groupsToBigInt(groups: number[]): bigint {
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
}

function bigIntToGroups(value: bigint): number[] {
  const groups: number[] = [];
  for (let index = 0; index < GROUP_COUNT; index++) {
    // group[0] is the most significant 16 bits, group[7] the least — the
    // mirror image of `groupsToBigInt` above, so the shift runs the opposite
    // direction from the group index.
    const shift = (GROUP_COUNT - 1 - index) * 16;
    groups[index] = Number((value >> BigInt(shift)) & 0xffffn);
  }
  return groups;
}

function maskToPrefix(value: bigint, prefix: number): bigint {
  if (prefix <= 0) return 0n;
  if (prefix >= IPV6_PREFIX_MAX) return value;
  const hostBits = BigInt(IPV6_PREFIX_MAX - prefix);
  const fullMask = (1n << 128n) - 1n;
  const mask = (fullMask << hostBits) & fullMask;
  return value & mask;
}

/**
 * How many leading bits two 128-bit values share — 128 when they are
 * identical, 0 when the very first bit differs. This is both the
 * containment test (one prefix contains the other exactly when this is at
 * least as long as the shorter prefix) and the "at which bit do they
 * diverge" answer, since the two questions are the same number.
 */
function commonPrefixLength(a: bigint, b: bigint): number {
  const xor = a ^ b;
  if (xor === 0n) return IPV6_PREFIX_MAX;
  let bitLength = 0;
  let remaining = xor;
  while (remaining > 0n) {
    remaining >>= 1n;
    bitLength++;
  }
  return IPV6_PREFIX_MAX - bitLength;
}

/**
 * Digit grouping for a count that does not fit in a `number`. Above /64 the
 * exact decimal is dozens of digits and stops being a readable answer, so
 * only the `2^n` form is returned there — `2^64` itself (18 446 744 073 709
 * 551 616) is the boundary case named in the tool's own spec, and it still
 * gets its exact digits.
 */
export function formatAddressCount(hostBits: number): { power: string; exact: string | null } {
  const power = `2^${hostBits}`;
  if (hostBits > 64) return { power, exact: null };
  const count = 1n << BigInt(hostBits);
  return { power, exact: count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") };
}

/* ---------- reverse DNS ---------- */

/** The `.ip6.arpa` nibble form (RFC 3596 section 2.5): every hex digit of the full address, one nibble per label, most-significant last. */
export function reverseDnsName(groups: number[]): string {
  const hex = expandGroups(groups).replace(/:/g, "");
  const nibbles = hex.split("").reverse();
  return `${nibbles.join(".")}.ip6.arpa.`;
}

/* ---------- the widget's one entry point ---------- */

export type Ipv6PrefixInfo = {
  prefix: number;
  networkExpanded: string;
  networkCompressed: string;
  firstExpanded: string;
  firstCompressed: string;
  lastExpanded: string;
  lastCompressed: string;
  hostBits: number;
};

export type Ipv6Info = {
  /** Exactly what was typed, prefix included — echoed back for the copy-out. */
  input: string;
  expanded: string;
  compressed: string;
  kind: Ipv6Kind;
  /** Null exactly when no `/n` was given — no prefix, no arithmetic to invent. */
  prefixInfo: Ipv6PrefixInfo | null;
  /** The dotted IPv4 for an ipv4-mapped or ipv4-compatible address, else null. */
  ipv4Embedded: string | null;
  /** True when the visitor pasted a bare IPv4 address and it was auto-mapped. */
  mappedFromIpv4: boolean;
  reverseDns: string;
};

export type Ipv6Analysis = { ok: true; info: Ipv6Info } | { ok: false; error: string };

/**
 * Parses one line of input — an IPv6 address, an IPv6 prefix, or a bare IPv4
 * address (mapped automatically to `::ffff:a.b.c.d`) — into every reading
 * the tool shows. Prefix arithmetic is only present when the visitor typed a
 * `/n`; a bare address is not silently treated as `/128`.
 */
export function analyseIpv6(text: string): Ipv6Analysis {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "Boş sahə — IPv6 ünvanı və ya IPv4 ünvanı yaz." };

  const { addressPart, prefixPart } = splitAddressAndPrefix(trimmed);

  let prefix: number | null = null;
  if (prefixPart !== null) {
    const validated = validatePrefix(prefixPart);
    if (!validated.ok) return validated;
    prefix = validated.prefix;
  }

  let effectiveAddressText = addressPart;
  let mappedFromIpv4 = false;
  if (!addressPart.includes(":")) {
    if (!addressPart.includes(".")) {
      return { ok: false, error: "Bu ünvana oxşamır — IPv6 üçün «:» , IPv4 üçün «.» olmalıdır." };
    }
    const ipv4 = parseDottedQuad(addressPart);
    if (!ipv4.ok) return ipv4;
    effectiveAddressText = `::ffff:${addressPart}`;
    mappedFromIpv4 = true;
  }

  const parsed = parseIpv6Address(effectiveAddressText);
  if (!parsed.ok) return parsed;

  const groups = parsed.groups;
  const kind = classifyIpv6(groups);
  const expanded = expandGroups(groups);
  const compressed = compressGroups(groups);

  let prefixInfo: Ipv6PrefixInfo | null = null;
  if (prefix !== null) {
    const addressValue = groupsToBigInt(groups);
    const networkValue = maskToPrefix(addressValue, prefix);
    const hostBits = IPV6_PREFIX_MAX - prefix;
    const lastValue = hostBits === 0 ? networkValue : networkValue | ((1n << BigInt(hostBits)) - 1n);
    const networkGroups = bigIntToGroups(networkValue);
    const lastGroups = bigIntToGroups(lastValue);
    prefixInfo = {
      prefix,
      networkExpanded: expandGroups(networkGroups),
      networkCompressed: compressGroups(networkGroups),
      firstExpanded: expandGroups(networkGroups),
      firstCompressed: compressGroups(networkGroups),
      lastExpanded: expandGroups(lastGroups),
      lastCompressed: compressGroups(lastGroups),
      hostBits,
    };
  }

  const ipv4Embedded =
    kind === "ipv4-mapped" || kind === "ipv4-compatible" ? groupsToIpv4(groups[6], groups[7]) : null;

  return {
    ok: true,
    info: {
      input: trimmed,
      expanded,
      compressed,
      kind,
      prefixInfo,
      ipv4Embedded,
      mappedFromIpv4,
      reverseDns: reverseDnsName(groups),
    },
  };
}

/* ---------- two-prefix containment ---------- */

export type ContainmentRelation = "equal" | "a-contains-b" | "b-contains-a" | "disjoint";

export type ContainmentResult =
  | {
      ok: true;
      relation: ContainmentRelation;
      /** How many leading bits the two networks share, 0-128. */
      commonPrefixLength: number;
      /** The 0-indexed bit at which they first differ; null when one contains the other. */
      divergeBit: number | null;
    }
  | { ok: false; error: string };

/**
 * Compares two `address/prefix` inputs. Both sides need an explicit `/n` —
 * containment is a question about two *networks*, and a bare address has no
 * network to compare, so it is refused rather than quietly read as `/128`.
 */
export function compareContainment(aText: string, bText: string): ContainmentResult {
  const a = parsePrefixedForContainment(aText, "birinci");
  if (!a.ok) return a;
  const b = parsePrefixedForContainment(bText, "ikinci");
  if (!b.ok) return b;

  const aNetwork = maskToPrefix(groupsToBigInt(a.groups), a.prefix);
  const bNetwork = maskToPrefix(groupsToBigInt(b.groups), b.prefix);
  const minPrefix = Math.min(a.prefix, b.prefix);
  const shared = commonPrefixLength(aNetwork, bNetwork);

  if (shared >= minPrefix) {
    const relation: ContainmentRelation =
      a.prefix === b.prefix ? "equal" : a.prefix < b.prefix ? "a-contains-b" : "b-contains-a";
    return { ok: true, relation, commonPrefixLength: shared, divergeBit: null };
  }

  return { ok: true, relation: "disjoint", commonPrefixLength: shared, divergeBit: shared };
}

function parsePrefixedForContainment(
  text: string,
  which: string,
): { ok: true; groups: number[]; prefix: number } | { ok: false; error: string } {
  const { addressPart, prefixPart } = splitAddressAndPrefix(text);
  if (prefixPart === null) {
    return {
      ok: false,
      error: `${which} prefiksdə «/n» yoxdur — əhatə yoxlaması üçün hər iki tərəf prefiksli olmalıdır, məsələn 2001:db8::/32.`,
    };
  }
  const validated = validatePrefix(prefixPart);
  if (!validated.ok) return validated;
  const parsed = parseIpv6Address(addressPart);
  if (!parsed.ok) return parsed;
  return { ok: true, groups: parsed.groups, prefix: validated.prefix };
}
