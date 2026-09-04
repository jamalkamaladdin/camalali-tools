/**
 * IPv4 range/CIDR conversion: turning a start–end pair into the minimal set
 * of aligned CIDR blocks that covers exactly it, the reverse (a CIDR list
 * into its first and last address), collapsing a messy pasted list into its
 * minimal equivalent, and subtracting sub-blocks out of a network.
 *
 * All four modes reduce to the same two primitives — `rangeToCidr` (numeric
 * interval → minimal aligned blocks) and `cidrRange` (block → numeric
 * interval) — which is worth stating up front because it is the reason
 * aggregation and exclusion are short: both convert their input to plain
 * [start, end] intervals, merge or subtract those with ordinary number
 * comparisons, and hand the resulting intervals back to `rangeToCidr` to be
 * re-split into blocks. A CIDR block, by construction, can only ever overlap
 * another CIDR block by fully containing it or being fully contained by it —
 * two aligned power-of-two ranges cannot partially overlap — so the interval
 * merge alone is enough to also resolve containment; nothing extra is needed
 * to drop a `/28` sitting inside a `/24`.
 *
 * Every block size in this file is written as `2 ** (32 - prefix)`, never as
 * a left shift. `1 << 32` in JavaScript is `1 << 0` — the shift count is
 * taken modulo 32 — so a `/0` block computed with `<<` comes out with a size
 * of 1 instead of the whole address space. `**` has no such wraparound, which
 * is the entire reason it is used here instead of the bitwise operator every
 * other 32-bit helper in this file relies on.
 */
import { parseIpv4 } from "./safe-url";

export const IPV4_PREFIX_MAX = 32;

/** The longest pasted list any mode here will try to parse. */
export const MAX_LIST_ENTRIES = 5000;

export type CidrBlock = { network: number; prefix: number };

/** Prints a 32-bit unsigned value as a dotted quad. `>>> 0` first, so a value carried through signed bitwise arithmetic upstream still prints as four positive octets. */
export function formatIpv4(value: number): string {
  const unsigned = value >>> 0;
  return [
    (unsigned >>> 24) & 0xff,
    (unsigned >>> 16) & 0xff,
    (unsigned >>> 8) & 0xff,
    unsigned & 0xff,
  ].join(".");
}

/** `/0` is special-cased for the same reason as everywhere else in this codebase: `0xffffffff << 32` is `0xffffffff << 0`, which is the exact opposite of the empty mask `/0` needs. */
export function maskFromPrefix(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= IPV4_PREFIX_MAX) return 0xffffffff;
  return (0xffffffff << (IPV4_PREFIX_MAX - prefix)) >>> 0;
}

/** How many addresses a prefix covers. `**`, not `<<` — see the file header. */
export function blockSize(prefix: number): number {
  return 2 ** (IPV4_PREFIX_MAX - prefix);
}

export function formatCidr(block: CidrBlock): string {
  return `${formatIpv4(block.network)}/${block.prefix}`;
}

/** A block's numeric span, network address through the last address it covers. */
export function cidrRange(block: CidrBlock): { start: number; end: number } {
  const size = blockSize(block.prefix);
  return { start: block.network, end: block.network + size - 1 };
}

/**
 * How many low bits of `value` are zero — the number of host bits an address
 * is aligned to. `0` is the special case: every bit is zero, so it is aligned
 * to a full `/0`, and the loop below would otherwise spin forever because it
 * never finds a set bit to stop on.
 */
function trailingZeroBits(value: number): number {
  if (value === 0) return IPV4_PREFIX_MAX;
  let remaining = value >>> 0;
  let count = 0;
  while ((remaining & 1) === 0) {
    remaining >>>= 1;
    count++;
  }
  return count;
}

/**
 * The core algorithm: the minimal list of aligned CIDR blocks that covers
 * `[start, end]` exactly, no more and no less.
 *
 * At each step the block that starts at the current address can only be as
 * large as two independent limits allow: how many low bits of the current
 * address are already zero (its alignment — a block bigger than that would
 * not start on a valid network boundary), and how much of the range is left
 * to cover (a block bigger than that would run past `end`). The block is
 * grown to the largest size both limits agree on, emitted, and the cursor
 * moves past it; repeating until the cursor passes `end`.
 */
export function rangeToCidr(start: number, end: number): CidrBlock[] {
  const blocks: CidrBlock[] = [];
  let cursor = start;
  while (cursor <= end) {
    const alignmentBits = trailingZeroBits(cursor);
    const remaining = end - cursor + 1;

    // Largest `sizeBits` with `2 ** sizeBits <= remaining`.
    let sizeBits = 0;
    while (sizeBits < IPV4_PREFIX_MAX && 2 ** (sizeBits + 1) <= remaining) sizeBits++;

    const hostBits = Math.min(alignmentBits, sizeBits);
    const prefix = IPV4_PREFIX_MAX - hostBits;
    blocks.push({ network: cursor, prefix });
    cursor += blockSize(prefix);
  }
  return blocks;
}

/* ---------- parsing ---------- */

export type Ipv4Result = { ok: true; value: number } | { ok: false; error: string };

/** Wraps `safe-url`'s strict dotted-quad parser with the visitor-facing error this file needs. */
export function readIpv4(text: string): Ipv4Result {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "Boş sahə: IPv4 ünvanı yaz." };
  const value = parseIpv4(trimmed);
  if (value === null) {
    return {
      ok: false,
      error: `IPv4 ünvanı düzgün deyil: «${trimmed}»: a.b.c.d formatında, hər hissə 0–255 arasında və sıfırla başlamır.`,
    };
  }
  return { ok: true, value };
}

export type CidrResult = { ok: true; block: CidrBlock } | { ok: false; error: string };

/**
 * Reads "a.b.c.d/nn" or a bare "a.b.c.d" (read as `/32`). The address is
 * masked down to its network address rather than rejected when it is not
 * one already — a visitor pasting `10.0.0.5/24` almost always means the
 * network its address belongs to, not a syntax error.
 */
export function readCidr(text: string): CidrResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "Boş sətir." };
  if (trimmed.includes(":")) {
    return {
      ok: false,
      error: `«${trimmed}» IPv6 ünvanına oxşayır: bu alət yalnız IPv4 üçündür.`,
    };
  }

  const [addressPart, prefixPart, ...rest] = trimmed.split("/");
  if (rest.length > 0) {
    return { ok: false, error: `«${trimmed}» sətrində birdən çox "/" var.` };
  }

  const address = readIpv4(addressPart);
  if (!address.ok) return address;

  let prefix = IPV4_PREFIX_MAX;
  if (prefixPart !== undefined) {
    if (!/^\d{1,2}$/.test(prefixPart.trim())) {
      return { ok: false, error: `Prefiks rəqəm deyil: «/${prefixPart}».` };
    }
    prefix = Number(prefixPart.trim());
    if (prefix < 0 || prefix > IPV4_PREFIX_MAX) {
      return { ok: false, error: `Prefiks 0 ilə 32 arasında olmalıdır, «/${prefix}» verildi.` };
    }
  }

  const network = (address.value & maskFromPrefix(prefix)) >>> 0;
  return { ok: true, block: { network, prefix } };
}

/** Splits pasted text into trimmed, non-empty lines. */
function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function readCidrList(text: string): { ok: true; blocks: CidrBlock[] } | { ok: false; error: string } {
  const lines = splitLines(text);
  if (lines.length === 0) return { ok: false, error: "Ən azı bir sətir yaz." };
  if (lines.length > MAX_LIST_ENTRIES) {
    return {
      ok: false,
      error: `${lines.length} sətir verilib, limit ${MAX_LIST_ENTRIES}-dir: siyahını qısalt.`,
    };
  }
  const blocks: CidrBlock[] = [];
  for (const line of lines) {
    const parsed = readCidr(line);
    if (!parsed.ok) return { ok: false, error: `«${line}»: ${parsed.error}` };
    blocks.push(parsed.block);
  }
  return { ok: true, blocks };
}

/* ---------- range ↔ CIDR ---------- */

export type RangeToCidrResult =
  | { ok: true; blocks: CidrBlock[]; totalAddresses: number }
  | { ok: false; error: string };

export function convertRangeToCidr(startText: string, endText: string): RangeToCidrResult {
  const start = readIpv4(startText);
  if (!start.ok) return start;
  const end = readIpv4(endText);
  if (!end.ok) return end;

  if (start.value > end.value) {
    return {
      ok: false,
      error: `Son ünvan (${formatIpv4(end.value)}) başlanğıcdan (${formatIpv4(start.value)}) əvvəldir: sıra tərsinədir.`,
    };
  }

  const blocks = rangeToCidr(start.value, end.value);
  return { ok: true, blocks, totalAddresses: end.value - start.value + 1 };
}

export type CidrToRangeResult =
  | { ok: true; first: number; last: number; totalAddresses: number; blockCount: number }
  | { ok: false; error: string };

export function convertCidrListToRange(text: string): CidrToRangeResult {
  const parsed = readCidrList(text);
  if (!parsed.ok) return parsed;

  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  let totalAddresses = 0;
  for (const block of parsed.blocks) {
    const { start, end } = cidrRange(block);
    if (start < first) first = start;
    if (end > last) last = end;
    totalAddresses += blockSize(block.prefix);
  }

  return { ok: true, first, last, totalAddresses, blockCount: parsed.blocks.length };
}

/* ---------- aggregation ---------- */

type NumericRange = { start: number; end: number };

/**
 * Merges numeric intervals that touch or overlap into the fewest disjoint
 * intervals covering the same addresses — plain interval merging, nothing
 * CIDR-specific. Re-splitting each merged interval with `rangeToCidr` is what
 * turns that back into aligned blocks, and it is also what keeps a merge from
 * happening between blocks that are adjacent but not siblings: two `/25`s
 * that are numerically back-to-back but do not share a `/24` parent produce a
 * combined interval that is not itself a valid `/24`, so `rangeToCidr` simply
 * hands the same two `/25`s back.
 */
function mergeRanges(ranges: NumericRange[]): NumericRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: NumericRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + 1) {
      if (range.end > last.end) last.end = range.end;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export type AggregationResult =
  | { ok: true; before: number; after: CidrBlock[] }
  | { ok: false; error: string };

/** Collapses a pasted list of CIDRs and single IPs into its minimal equivalent form. */
export function aggregate(text: string): AggregationResult {
  const parsed = readCidrList(text);
  if (!parsed.ok) return parsed;

  const merged = mergeRanges(parsed.blocks.map(cidrRange));
  const after = merged.flatMap((range) => rangeToCidr(range.start, range.end));
  return { ok: true, before: parsed.blocks.length, after };
}

/* ---------- exclusion ---------- */

export type ExclusionResult =
  | { ok: true; result: CidrBlock[]; totalAddresses: number }
  | { ok: false; error: string };

/** `baseText` minus every block in `subsText` — the aligned CIDRs that remain. */
export function exclude(baseText: string, subsText: string): ExclusionResult {
  const base = readCidr(baseText);
  if (!base.ok) return base;
  const baseRange = cidrRange(base.block);

  const subLines = splitLines(subsText);
  if (subLines.length > MAX_LIST_ENTRIES) {
    return {
      ok: false,
      error: `${subLines.length} sətir verilib, limit ${MAX_LIST_ENTRIES}-dir: siyahını qısalt.`,
    };
  }

  const subRanges: NumericRange[] = [];
  for (const line of subLines) {
    const parsed = readCidr(line);
    if (!parsed.ok) return { ok: false, error: `«${line}»: ${parsed.error}` };
    const range = cidrRange(parsed.block);
    if (range.start < baseRange.start || range.end > baseRange.end) {
      return {
        ok: false,
        error: `«${line}» ${formatCidr(base.block)} şəbəkəsinin xaricindədir: çıxarıla bilmir.`,
      };
    }
    subRanges.push(range);
  }

  if (subRanges.length === 0) {
    return { ok: true, result: [base.block], totalAddresses: blockSize(base.block.prefix) };
  }

  const mergedSubs = mergeRanges(subRanges);

  const remaining: CidrBlock[] = [];
  let cursor = baseRange.start;
  for (const sub of mergedSubs) {
    if (sub.start > cursor) remaining.push(...rangeToCidr(cursor, sub.start - 1));
    cursor = sub.end + 1;
  }
  if (cursor <= baseRange.end) remaining.push(...rangeToCidr(cursor, baseRange.end));

  const totalAddresses = remaining.reduce((sum, block) => sum + blockSize(block.prefix), 0);
  return { ok: true, result: remaining, totalAddresses };
}

/* ---------- output formatting ---------- */

export type CidrListFormat = "sade" | "setir" | "vergul";

export const CIDR_LIST_FORMATS: { value: CidrListFormat; label: string }[] = [
  { value: "sade", label: "Sadə" },
  { value: "setir", label: "Sətir-sətir" },
  { value: "vergul", label: "Vergüllə" },
];

/**
 * The one text export every mode's result is turned into: space-separated
 * for a quick paste, one CIDR per line for a config file, or a single
 * comma-joined line for a CLI flag or a JSON-style array. One function so a
 * copied block list never disagrees with the panel it was copied from.
 */
export function formatBlockList(blocks: CidrBlock[], format: CidrListFormat): string {
  const items = blocks.map(formatCidr);
  switch (format) {
    case "sade":
      return items.join(" ");
    case "setir":
      return items.join("\n");
    case "vergul":
      return items.join(", ");
  }
}
