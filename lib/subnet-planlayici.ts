/**
 * VLSM (Variable Length Subnet Mask) planning: one IPv4 network plus a list of
 * named segments, each with a host count, turned into a contiguous allocation
 * — who gets which block, and what is left over.
 *
 * `subnet.ts` answers one question — "what does this one CIDR mean?" — and
 * this file answers a different one: "how do I cut this network into the
 * pieces these segments need, without wasting more than the arithmetic
 * forces?" The two never call each other on purpose. A VLSM planner that
 * imported the single-network tool's types would break the moment that tool's
 * internal shape changed for a reason that had nothing to do with planning,
 * and the two already duplicate only the unavoidable bottom layer — masking,
 * formatting — which is a handful of lines everywhere IPv4 arithmetic is
 * done, not something worth sharing across a module boundary.
 *
 * The two things worth checking here are the two things a hand-written VLSM
 * plan gets wrong most often: picking the smallest block that still fits
 * network + broadcast + every requested host (fifty hosts needs a /26, not a
 * /27 — thirty usable addresses is one host short), and packing blocks of
 * different sizes back-to-back without leaving an unusable gap between them.
 * Both are just arithmetic, but arithmetic a person re-derives under time
 * pressure is exactly where a mistake survives into production.
 *
 * Same 32-bit-unsigned trap as everywhere else in this codebase: `&`, `|`,
 * `~` and `<<` convert to a SIGNED 32-bit integer, so every result that might
 * carry the top bit is closed with `>>> 0` — including here, even though the
 * planner never touches 255.255.255.255 directly, because a block that ends
 * one address short of it still computes a broadcast that does.
 */

import { parseIpv4 } from "./safe-url";

/** IPv4 is 32 bits, so a prefix names 0 through 32 of them. */
const IPV4_PREFIX_MAX = 32;

/** More than this and the plan is a spreadsheet, not a page. */
export const MAX_SEGMENTS = 64;

/** Past this many equal parts the split table stops being something a visitor reads. */
const MAX_EQUAL_SPLIT_PARTS = 4096;

/* ---------- shared bit arithmetic ---------- */

function maskFromPrefix(prefix: number): number {
  if (prefix <= 0) return 0;
  // `0xffffffff << 32` shifts by 0 (JS takes the count mod 32) and would hand
  // back 0xffffffff for /0 — the mask for "match nothing" computed as the mask
  // for "match everything". Special-cased above instead.
  if (prefix >= IPV4_PREFIX_MAX) return 0xffffffff;
  return (0xffffffff << (IPV4_PREFIX_MAX - prefix)) >>> 0;
}

function formatIpv4(value: number): string {
  const unsigned = value >>> 0;
  return [
    (unsigned >>> 24) & 0xff,
    (unsigned >>> 16) & 0xff,
    (unsigned >>> 8) & 0xff,
    unsigned & 0xff,
  ].join(".");
}

/* ---------- network CIDR parsing ---------- */

export type NetworkParse =
  | { ok: true; address: number; prefix: number }
  | { ok: false; error: string };

/** "10.0.0.0/16" split and validated. Does not require the address to already be the network base — the caller masks it. */
export function parseNetworkCidr(text: string): NetworkParse {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, error: "Boş sahə — şəbəkəni CIDR formatında yaz: 10.0.0.0/16." };
  }

  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    return { ok: false, error: `Prefiks yoxdur — CIDR formatında yaz: «${trimmed}/24».` };
  }

  const addressPart = trimmed.slice(0, slash).trim();
  const prefixPart = trimmed.slice(slash + 1).trim();

  const address = parseIpv4(addressPart);
  if (address === null) {
    return { ok: false, error: `IPv4 ünvanı düzgün deyil: «${addressPart}».` };
  }

  if (!/^\d{1,2}$/.test(prefixPart)) {
    return { ok: false, error: `Prefiks rəqəm deyil: «/${prefixPart}».` };
  }
  const prefix = Number(prefixPart);
  if (prefix > IPV4_PREFIX_MAX) {
    return { ok: false, error: `Prefiks 0 ilə 32 arasında olmalıdır, «/${prefix}» verildi.` };
  }

  return { ok: true, address, prefix };
}

/* ---------- minimal prefix for a host count ---------- */

/**
 * The smallest block whose usable-host count is at least `hosts`.
 *
 * Three regimes, not one: up to /30 a block spends two addresses on the
 * network and the broadcast, so usable hosts are the block size minus two.
 * RFC 3021 spends neither on a /31 — both addresses go to the two ends of a
 * point-to-point link, so a request for exactly 2 hosts gets a /31 (2
 * addresses) rather than a /30 (4 addresses, 2 wasted). A request for 1 host
 * gets a /32 — a single address, nothing to route a broadcast to.
 */
export function minimalPrefixForHosts(hosts: number): number {
  if (hosts <= 1) return IPV4_PREFIX_MAX;
  if (hosts <= 2) return IPV4_PREFIX_MAX - 1;

  let prefix = IPV4_PREFIX_MAX - 2; // /30: the largest block still on the standard rule
  while (prefix > 0 && 2 ** (IPV4_PREFIX_MAX - prefix) - 2 < hosts) prefix -= 1;
  return prefix;
}

type BlockInfo = {
  network: number;
  broadcast: number | null;
  firstHost: number | null;
  lastHost: number | null;
  usableHosts: number;
};

function describeBlock(networkAddress: number, prefix: number): BlockInfo {
  if (prefix === IPV4_PREFIX_MAX) {
    return {
      network: networkAddress,
      broadcast: null,
      firstHost: networkAddress,
      lastHost: networkAddress,
      usableHosts: 1,
    };
  }

  const mask = maskFromPrefix(prefix);
  const wildcard = ~mask >>> 0;

  if (prefix === IPV4_PREFIX_MAX - 1) {
    return {
      network: networkAddress,
      broadcast: null,
      firstHost: networkAddress,
      lastHost: (networkAddress | wildcard) >>> 0,
      usableHosts: 2,
    };
  }

  const broadcast = (networkAddress | wildcard) >>> 0;
  const totalAddresses = 2 ** (IPV4_PREFIX_MAX - prefix);
  return {
    network: networkAddress,
    broadcast,
    firstHost: (networkAddress + 1) >>> 0,
    lastHost: (broadcast - 1) >>> 0,
    usableHosts: totalAddresses - 2,
  };
}

/* ---------- requirement text parsing ---------- */

export type ParsedRequirement = { line: number; raw: string; name: string; hosts: number };
export type RequirementIssue = { line: number; raw: string; error: string };
export type RequirementsParse = { requirements: ParsedRequirement[]; issues: RequirementIssue[] };

// A name, then a host count, separated by whitespace and/or one comma or
// colon — "ofis 500", "ofis: 500", "ofis, 500", "ofis   500" all match. The
// name group is non-greedy so a number appearing earlier in the name ("vlan
// 10 ofis 500") still resolves to the LAST run of digits as the count.
const REQUIREMENT_LINE_PATTERN = /^(.+?)[\s,:]+(\d+)$/;

function parseRequirementLine(raw: string): { ok: true; name: string; hosts: number } | { ok: false; error: string } {
  const match = REQUIREMENT_LINE_PATTERN.exec(raw);
  if (!match) {
    return {
      ok: false,
      error: `Format tanınmadı — «ad say» şəklində yaz, məsələn «ofis 500»: «${raw}».`,
    };
  }

  const name = match[1].trim();
  if (!/[\p{L}\p{N}]/u.test(name)) {
    return { ok: false, error: `Seqmentin adı tapılmadı: «${raw}».` };
  }

  const hosts = Number(match[2]);
  if (!Number.isFinite(hosts) || hosts <= 0) {
    return { ok: false, error: `«${raw}» üçün host sayı düzgün deyil — 0-dan böyük tam ədəd yaz.` };
  }

  return { ok: true, name, hosts };
}

/**
 * One segment per line, tolerant of the punctuation a visitor actually types.
 * Every line is reported — a bad line becomes an issue with its own line
 * number rather than being silently dropped, so a typo stays visible before
 * the plan is ever computed.
 */
export function parseRequirements(text: string): RequirementsParse {
  const requirements: ParsedRequirement[] = [];
  const issues: RequirementIssue[] = [];
  const seenNames = new Map<string, number>();

  text.split("\n").forEach((rawLine, index) => {
    const raw = rawLine.trim();
    if (raw === "") return;
    const line = index + 1;

    const parsed = parseRequirementLine(raw);
    if (!parsed.ok) {
      issues.push({ line, raw, error: parsed.error });
      return;
    }

    const key = parsed.name.toLocaleLowerCase("az");
    const firstLine = seenNames.get(key);
    if (firstLine !== undefined) {
      issues.push({
        line,
        raw,
        error: `«${parsed.name}» adı ${firstLine}-ci sətirdə artıq var — hər seqmentin adı unikal olmalıdır.`,
      });
      return;
    }

    seenNames.set(key, line);
    requirements.push({ line, raw, name: parsed.name, hosts: parsed.hosts });
  });

  if (requirements.length > MAX_SEGMENTS) {
    issues.push({
      line: 0,
      raw: "",
      error: `${requirements.length} seqment yazılıb, maksimum ${MAX_SEGMENTS}-dir — siyahını qısalt.`,
    });
  }

  return { requirements, issues };
}

/* ---------- VLSM allocation ---------- */

export type Segment = { name: string; hosts: number };

export type AllocationRow = {
  name: string;
  cidr: string;
  prefix: number;
  mask: string;
  network: string;
  firstHost: string | null;
  lastHost: string | null;
  broadcast: string | null;
  usableHosts: number;
  requestedHosts: number;
  wasted: number;
};

export type FreeBlock = { cidr: string; addresses: number };

export type PlanFailure = {
  ok: false;
  error: string;
  failedSegment: string | null;
  shortfallAddresses: number | null;
  suggestedPrefix: number | null;
};

export type PlanSuccess = {
  ok: true;
  network: string;
  networkPrefix: number;
  totalAddresses: number;
  allocatedAddresses: number;
  freeAddresses: number;
  utilisationPercent: number;
  rows: AllocationRow[];
  freeBlocks: FreeBlock[];
};

export type PlanResult = PlanSuccess | PlanFailure;

function ceilToMultiple(value: number, multiple: number): number {
  if (multiple <= 0) return value;
  const remainder = value % multiple;
  return remainder === 0 ? value : value + (multiple - remainder);
}

/** Smallest prefix (largest block) whose size is at least `size` addresses. */
function smallestPrefixForSize(size: number): number {
  let prefix = IPV4_PREFIX_MAX;
  while (prefix > 0 && 2 ** (IPV4_PREFIX_MAX - prefix) < size) prefix -= 1;
  return prefix;
}

function fail(error: string, extra: Partial<Omit<PlanFailure, "ok" | "error">> = {}): PlanFailure {
  return {
    ok: false,
    error,
    failedSegment: extra.failedSegment ?? null,
    shortfallAddresses: extra.shortfallAddresses ?? null,
    suggestedPrefix: extra.suggestedPrefix ?? null,
  };
}

/**
 * The one entry point: a network and a segment list in, a full allocation or
 * an honest explanation of why one is not possible.
 *
 * Segments are sorted largest-first and packed from the start of the network.
 * That order is not just a convention — a descending host count produces a
 * non-increasing sequence of block sizes, and consecutive powers of two in
 * non-increasing order divide one another, so the running cursor is already a
 * multiple of the next block's size at every step. `ceilToMultiple` below is
 * therefore provably a no-op under this sort; it stays because "provably" is
 * a property of this function's sort step, not of its caller, and a plan that
 * silently trusted an unsorted or hand-edited list would misalign the moment
 * that assumption changed.
 */
export function planVlsm(networkText: string, segments: Segment[]): PlanResult {
  const parsedNetwork = parseNetworkCidr(networkText);
  if (!parsedNetwork.ok) return fail(parsedNetwork.error);

  if (segments.length === 0) {
    return fail("Ən azı bir seqment yaz — ad və host sayı, məsələn «ofis 500».");
  }
  if (segments.length > MAX_SEGMENTS) {
    return fail(`${segments.length} seqment verilib, maksimum ${MAX_SEGMENTS}-dir.`);
  }

  const seen = new Set<string>();
  for (const segment of segments) {
    const key = segment.name.trim().toLocaleLowerCase("az");
    if (seen.has(key)) {
      return fail(`«${segment.name}» adı təkrarlanır — hər seqmentin adı unikal olmalıdır.`, {
        failedSegment: segment.name,
      });
    }
    seen.add(key);
    if (!Number.isInteger(segment.hosts) || segment.hosts <= 0) {
      return fail(`«${segment.name}» üçün host sayı 0-dan böyük tam ədəd olmalıdır.`, {
        failedSegment: segment.name,
      });
    }
  }

  const networkBase = (parsedNetwork.address & maskFromPrefix(parsedNetwork.prefix)) >>> 0;
  const totalAddresses = 2 ** (IPV4_PREFIX_MAX - parsedNetwork.prefix);

  const sorted = [...segments].sort((a, b) => b.hosts - a.hosts);

  let cursor = 0;
  const placements: { segment: Segment; prefix: number; offset: number; size: number; info: BlockInfo }[] = [];
  for (const segment of sorted) {
    const prefix = minimalPrefixForHosts(segment.hosts);
    const size = 2 ** (IPV4_PREFIX_MAX - prefix);
    const offset = ceilToMultiple(cursor, size);
    const info = describeBlock((networkBase + offset) >>> 0, prefix);
    placements.push({ segment, prefix, offset, size, info });
    cursor = offset + size;
  }

  const overflowing = placements.find((p) => p.offset + p.size > totalAddresses);
  if (overflowing) {
    const totalNeeded = cursor;
    const shortfall = totalNeeded - totalAddresses;
    const suggestedPrefix = totalNeeded > 2 ** IPV4_PREFIX_MAX ? null : smallestPrefixForSize(totalNeeded);
    const sizeNote =
      suggestedPrefix === null
        ? " Bütün IPv4 ünvan fəzası (/0) belə bu siyahını tutmur."
        : ` Ən azı /${suggestedPrefix} ölçüsündə şəbəkə lazımdır.`;
    return fail(
      `«${overflowing.segment.name}» seqmenti sığmadı — bura qədər ${totalNeeded} ünvan lazımdır, ` +
        `«${formatIpv4(networkBase)}/${parsedNetwork.prefix}» isə cəmi ${totalAddresses} ünvan tutur ` +
        `(${shortfall} ünvan çatışmır).${sizeNote}`,
      { failedSegment: overflowing.segment.name, shortfallAddresses: shortfall, suggestedPrefix },
    );
  }

  const rows: AllocationRow[] = placements.map((p) => ({
    name: p.segment.name,
    cidr: `${formatIpv4(p.info.network)}/${p.prefix}`,
    prefix: p.prefix,
    mask: formatIpv4(maskFromPrefix(p.prefix)),
    network: formatIpv4(p.info.network),
    firstHost: p.info.firstHost === null ? null : formatIpv4(p.info.firstHost),
    lastHost: p.info.lastHost === null ? null : formatIpv4(p.info.lastHost),
    broadcast: p.info.broadcast === null ? null : formatIpv4(p.info.broadcast),
    usableHosts: p.info.usableHosts,
    requestedHosts: p.segment.hosts,
    wasted: p.info.usableHosts - p.segment.hosts,
  }));

  const allocatedAddresses = cursor;
  const freeAddresses = totalAddresses - allocatedAddresses;
  const freeBlocks = rangeToCidrBlocks(cursor, totalAddresses).map((block) => ({
    cidr: `${formatIpv4((networkBase + block.offset) >>> 0)}/${prefixForSize(block.size)}`,
    addresses: block.size,
  }));

  return {
    ok: true,
    network: `${formatIpv4(networkBase)}/${parsedNetwork.prefix}`,
    networkPrefix: parsedNetwork.prefix,
    totalAddresses,
    allocatedAddresses,
    freeAddresses,
    utilisationPercent: Math.round((allocatedAddresses / totalAddresses) * 1000) / 10,
    rows,
    freeBlocks,
  };
}

/* ---------- free-space decomposition ---------- */

/** The largest block size a boundary at `offset` can start — the size whose alignment `offset` already satisfies. */
function alignmentSize(offset: number): number {
  if (offset === 0) return 2 ** IPV4_PREFIX_MAX;
  let size = 1;
  while (offset % (size * 2) === 0) size *= 2;
  return size;
}

/**
 * `[start, end)` as the fewest possible CIDR-aligned blocks — the same
 * "largest block the current boundary allows, then repeat" method a router
 * uses to summarise a route. Bounded at roughly 32 blocks regardless of the
 * range's size, since each step's size is a power of two and there are only
 * 32 of those to work down through — it never explodes into one row per
 * address the way listing a raw range would.
 */
function rangeToCidrBlocks(start: number, end: number): { offset: number; size: number }[] {
  const blocks: { offset: number; size: number }[] = [];
  let cursor = start;
  while (cursor < end) {
    const remaining = end - cursor;
    let size = alignmentSize(cursor);
    while (size > remaining) size /= 2;
    blocks.push({ offset: cursor, size });
    cursor += size;
  }
  return blocks;
}

function prefixForSize(size: number): number {
  let bits = 0;
  let remaining = size;
  while (remaining > 1) {
    remaining /= 2;
    bits += 1;
  }
  return IPV4_PREFIX_MAX - bits;
}

/** The plan as plain text, for a copy button — one function so the copied text can never disagree with the table it was copied from. */
export function planToText(result: PlanSuccess): string {
  const lines = [
    `Şəbəkə: ${result.network}`,
    `Tutum: ${result.totalAddresses} ünvan, ayrılmış: ${result.allocatedAddresses}, boş: ${result.freeAddresses}, istifadə: ${result.utilisationPercent}%`,
    "",
  ];
  for (const row of result.rows) {
    const end = row.broadcast ?? row.lastHost ?? row.network;
    lines.push(
      `${row.name}: ${row.cidr} (${row.network} – ${end}), host: ${row.firstHost ?? "yoxdur"} – ${row.lastHost ?? "yoxdur"}, ` +
        `istifadə oluna bilən: ${row.usableHosts}, istənilən: ${row.requestedHosts}, itki: ${row.wasted}`,
    );
  }
  lines.push("");
  lines.push(
    `Boş bloklar: ${result.freeBlocks.length === 0 ? "yoxdur" : result.freeBlocks.map((b) => b.cidr).join(", ")}`,
  );
  return lines.join("\n");
}

/* ---------- equal split ---------- */

export type EqualSplitPart = {
  cidr: string;
  network: string;
  broadcast: string | null;
  firstHost: string | null;
  lastHost: string | null;
  usableHosts: number;
};

export type EqualSplitResult =
  | {
      ok: true;
      basePrefix: number;
      newPrefix: number;
      requestedCount: number;
      actualCount: number;
      parts: EqualSplitPart[];
    }
  | { ok: false; error: string };

function buildEqualParts(networkBase: number, basePrefix: number, newPrefix: number): EqualSplitPart[] {
  const count = 2 ** (newPrefix - basePrefix);
  const size = 2 ** (IPV4_PREFIX_MAX - newPrefix);
  const parts: EqualSplitPart[] = [];
  for (let i = 0; i < count; i++) {
    const info = describeBlock((networkBase + i * size) >>> 0, newPrefix);
    parts.push({
      cidr: `${formatIpv4(info.network)}/${newPrefix}`,
      network: formatIpv4(info.network),
      broadcast: info.broadcast === null ? null : formatIpv4(info.broadcast),
      firstHost: info.firstHost === null ? null : formatIpv4(info.firstHost),
      lastHost: info.lastHost === null ? null : formatIpv4(info.lastHost),
      usableHosts: info.usableHosts,
    });
  }
  return parts;
}

/** "Divide into subnets of /n" — the direct form, everything else calls this. */
export function splitByPrefix(networkText: string, newPrefix: number): EqualSplitResult {
  const parsed = parseNetworkCidr(networkText);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  if (!Number.isInteger(newPrefix) || newPrefix < 0 || newPrefix > IPV4_PREFIX_MAX) {
    return { ok: false, error: `Prefiks 0 ilə 32 arasında olmalıdır, «/${newPrefix}» verildi.` };
  }
  if (newPrefix < parsed.prefix) {
    return {
      ok: false,
      error: `Yeni prefiks «/${newPrefix}» əsas şəbəkədən («/${parsed.prefix}») böyük ola bilməz — bölmək daha dar prefiks tələb edir.`,
    };
  }

  const count = 2 ** (newPrefix - parsed.prefix);
  if (count > MAX_EQUAL_SPLIT_PARTS) {
    return {
      ok: false,
      error: `«/${parsed.prefix}» şəbəkəsini «/${newPrefix}»-ə bölmək ${count} alt şəbəkə verir — bu, ${MAX_EQUAL_SPLIT_PARTS} həddini keçir.`,
    };
  }

  const networkBase = (parsed.address & maskFromPrefix(parsed.prefix)) >>> 0;
  return {
    ok: true,
    basePrefix: parsed.prefix,
    newPrefix,
    requestedCount: count,
    actualCount: count,
    parts: buildEqualParts(networkBase, parsed.prefix, newPrefix),
  };
}

/**
 * "Divide into N equal subnets" — CIDR only cuts a block into powers of two,
 * so a count that is not one is rounded up to the next power of two and the
 * result says so honestly through `actualCount` rather than pretending N was
 * met exactly.
 */
export function splitByCount(networkText: string, desiredCount: number): EqualSplitResult {
  if (!Number.isInteger(desiredCount) || desiredCount < 1) {
    return { ok: false, error: `Alt şəbəkə sayı 1 və ya daha böyük tam ədəd olmalıdır: «${desiredCount}».` };
  }

  const parsed = parseNetworkCidr(networkText);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  let extraBits = 0;
  while (2 ** extraBits < desiredCount) extraBits += 1;
  const newPrefix = parsed.prefix + extraBits;

  if (newPrefix > IPV4_PREFIX_MAX) {
    return {
      ok: false,
      error: `«/${parsed.prefix}» şəbəkəsi ${desiredCount} bərabər hissəyə bölünə bilmir — ünvan fəzası kifayət etmir.`,
    };
  }

  const result = splitByPrefix(networkText, newPrefix);
  if (!result.ok) return result;
  return { ...result, requestedCount: desiredCount };
}
