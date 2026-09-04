/**
 * UUID v4 (fully random) and v7 (time-sortable) generation, plus inspection of
 * a pasted UUID. Randomness comes from crypto.getRandomValues — Math.random is
 * not cryptographically strong and its sequence is predictable.
 */

const HEX = "0123456789abcdef";

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += HEX[byte >> 4] + HEX[byte & 0x0f];
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 16 random bytes with the version nibble and the RFC-4122 variant "10xx" set. */
function randomUuidBytes(version: number): Uint8Array {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (version << 4) | (bytes[6] & 0x0f);
  bytes[8] = 0x80 | (bytes[8] & 0x3f);
  return bytes;
}

export function generateUuidV4(): string {
  return bytesToUuid(randomUuidBytes(4));
}

/**
 * v7 packs a 48-bit Unix millisecond timestamp into the first 6 bytes, so two
 * UUIDs minted a millisecond apart sort the same way as strings and as raw
 * bytes — the ordering property random v4 cannot offer a database index.
 */
export function generateUuidV7(now: number | Date = Date.now()): string {
  const ms = Math.max(0, Math.floor(typeof now === "number" ? now : now.getTime()));
  const bytes = randomUuidBytes(7);

  let rest = BigInt(ms);
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(rest & BigInt(0xff));
    rest >>= BigInt(8);
  }

  return bytesToUuid(bytes);
}

export type UuidFormatOptions = {
  uppercase: boolean;
  noDashes: boolean;
  quoted: boolean;
};

/** Display-only transform. Never used to build the value inspectUuid reads. */
export function formatUuid(value: string, options: UuidFormatOptions): string {
  let out = options.noDashes ? value.replaceAll("-", "") : value;
  if (options.uppercase) out = out.toUpperCase();
  if (options.quoted) out = `"${out}"`;
  return out;
}

const VARIANT_LABELS = {
  ncs: "NCS (köhnə, nadir)",
  rfc4122: "RFC 4122 (standart)",
  microsoft: "Microsoft (köhnə GUID)",
  future: "Ayrılmış (gələcək üçün)",
} as const;

type Variant = keyof typeof VARIANT_LABELS;

/** Variant lives in the top bits of hex digit 17 (the first char of the 4th group). */
function classifyVariant(nibble: number): Variant {
  if (nibble < 0x8) return "ncs"; // 0xx
  if (nibble < 0xc) return "rfc4122"; // 10x
  if (nibble < 0xe) return "microsoft"; // 110
  return "future"; // 111
}

// 100ns ticks between the Gregorian epoch (1582-10-15) and the Unix epoch —
// every v1 timestamp is measured from this offset, not from 1970.
const V1_EPOCH_OFFSET_100NS = BigInt("122192928000000000");

/** v1 timestamp is the 60-bit tick count spread across time_low/mid/hi, 100ns since 1582. */
function v1Timestamp(bytes: Uint8Array): Date {
  const timeLow = BigInt(
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0,
  );
  const timeMid = BigInt((bytes[4] << 8) | bytes[5]);
  const timeHi = BigInt(((bytes[6] & 0x0f) << 8) | bytes[7]);
  const ticks100ns = (timeHi << BigInt(48)) | (timeMid << BigInt(32)) | timeLow;
  const unixMs = (ticks100ns - V1_EPOCH_OFFSET_100NS) / BigInt(10000);
  return new Date(Number(unixMs));
}

/** v7 timestamp is a plain 48-bit big-endian Unix millisecond count. */
function v7Timestamp(bytes: Uint8Array): Date {
  let ms = BigInt(0);
  for (let i = 0; i < 6; i++) ms = (ms << BigInt(8)) | BigInt(bytes[i]);
  return new Date(Number(ms));
}

/*
 * Versions an RFC actually assigns: 1-5 come from RFC 4122 and 6-8 from RFC
 * 9562. The tool used to answer this question with the record of hints it
 * shows beside the generator, which only knew the two versions it can mint —
 * so a valid v3 or v5 UUID was reported to the visitor as "qeyri-standart".
 */
const HIGHEST_DEFINED_VERSION = 8;

export function isStandardUuidVersion(version: number | null): boolean {
  return version !== null && version >= 1 && version <= HIGHEST_DEFINED_VERSION;
}

export type UuidInspection =
  | {
      ok: true;
      /** Lowercase, dashed 8-4-4-4-12 form. */
      normalized: string;
      /** Lowercase, no dashes. */
      compact: string;
      special: "nil" | "max" | null;
      /** Hex nibble 0-15 as declared, or null when the value is nil/max. */
      version: number | null;
      variant: Variant | null;
      variantLabel: string | null;
      timestamp: Date | null;
      timestampSource: "v1" | "v7" | null;
    }
  | { ok: false; error: string };

const DASHED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPACT = /^[0-9a-f]{32}$/i;
const GROUP_LENGTHS = [8, 4, 4, 4, 12];

export function inspectUuid(rawValue: string): UuidInspection {
  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return { ok: false, error: "Boş sahə — UUID yapışdır." };
  }

  // Strip the two paste artefacts a UUID commonly arrives wrapped in.
  let value = trimmed;
  if (/^urn:uuid:/i.test(value)) value = value.slice("urn:uuid:".length);
  if (value.startsWith("{") && value.endsWith("}")) value = value.slice(1, -1);

  let compact: string;
  if (value.includes("-")) {
    if (!DASHED.test(value)) {
      const groups = value.split("-");
      if (groups.length !== 5) {
        return {
          ok: false,
          error: `Qrup sayı yanlışdır: 5 hissə gözlənilir (8-4-4-4-12), ${groups.length} tapıldı.`,
        };
      }
      const badGroup = groups.findIndex((g, i) => g.length !== GROUP_LENGTHS[i]);
      if (badGroup !== -1) {
        return {
          ok: false,
          error: `${badGroup + 1}-ci hissənin uzunluğu yanlışdır: ${GROUP_LENGTHS[badGroup]} simvol gözlənilir, ${groups[badGroup].length} tapıldı.`,
        };
      }
      return {
        ok: false,
        error: "Onaltılıq əlifbaya aid olmayan simvol var (rəqəm və ya a–f).",
      };
    }
    compact = value.replaceAll("-", "").toLowerCase();
  } else {
    if (!COMPACT.test(value)) {
      if (value.length !== 32) {
        return {
          ok: false,
          error: `Uzunluq yanlışdır: defissiz UUID 32 simvol olmalıdır, ${value.length} tapıldı.`,
        };
      }
      return {
        ok: false,
        error: "Onaltılıq əlifbaya aid olmayan simvol var (rəqəm və ya a–f).",
      };
    }
    compact = value.toLowerCase();
  }

  const bytes = hexToBytes(compact);
  const normalized = bytesToUuid(bytes);

  const isNil = compact === "0".repeat(32);
  const isMax = compact === "f".repeat(32);
  const special = isNil ? "nil" : isMax ? "max" : null;

  const version = special ? null : parseInt(compact[12], 16);
  const variant = special ? null : classifyVariant(parseInt(compact[16], 16));

  let timestamp: Date | null = null;
  let timestampSource: "v1" | "v7" | null = null;
  if (version === 7) {
    timestamp = v7Timestamp(bytes);
    timestampSource = "v7";
  } else if (version === 1) {
    timestamp = v1Timestamp(bytes);
    timestampSource = "v1";
  }

  return {
    ok: true,
    normalized,
    compact,
    special,
    version,
    variant,
    variantLabel: variant ? VARIANT_LABELS[variant] : null,
    timestamp,
    timestampSource,
  };
}
