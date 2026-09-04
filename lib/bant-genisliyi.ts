/*
 * Bandwidth ↔ size ↔ time: three quantities tied by one identity
 * (`bits = bandwidth × time`), and a visitor only ever knows two of them —
 * "I have this file and this link, how long?" or "I have this much time and
 * this much data, what link do I need?". `calculateTransfer` solves whichever
 * one is missing.
 *
 * Two mistakes make a plain division wrong often enough that this file exists
 * apart from a generic unit converter:
 *
 * 1. Bits vs bytes. A link is sold in bits per second, a file is measured in
 *    bytes; forgetting the factor of 8 is the single most common transfer-time
 *    error, so every bandwidth unit here is bit-based or explicitly named
 *    byte-based, and the two conversion tables are kept apart rather than
 *    merged into one "speed" ladder that would blur which is which.
 * 2. Decimal vs binary. A disk and an ISP sell in powers of ten; the operating
 *    system that reports the result counts in powers of two. `MB` and `MiB`
 *    are both offered so a visitor can match whichever side of that gap they
 *    are reading.
 *
 * On top of the arithmetic sits the one thing that makes this honest rather
 * than a schoolbook division: a `1 Gbit/s` link never carries `1 Gbit/s` of
 * payload, because TCP/IP framing, retransmits and Ethernet's own inter-frame
 * gap all eat into it. Every result is therefore returned as a pair —
 * `theoretical*` (the raw division, 0% overhead) and `realistic*` (the same
 * division after the chosen overhead assumption) — so the widget can never
 * show only the flattering number.
 *
 * React-free on purpose: `components/tools/bant-genisliyi-tool` draws these
 * numbers and `scripts/tools-checks/bant-genisliyi` runs them, and neither
 * should need the other.
 */
import { formatBytes, formatNumber } from "../shared/format";

/* ---------- units ---------- */

export type BandwidthUnit =
  | "bit/s"
  | "kbit/s"
  | "Mbit/s"
  | "Gbit/s"
  | "Tbit/s"
  | "B/s"
  | "KB/s"
  | "MB/s"
  | "GB/s";

export type SizeUnit = "B" | "KB" | "MB" | "GB" | "TB" | "PB" | "KiB" | "MiB" | "GiB" | "TiB";

export type TimeUnit = "s" | "min" | "h" | "d";

export type SolveField = "time" | "bandwidth" | "size";

const BITS_PER_BYTE = 8;

/*
 * Bits per second for one unit of each. The byte-based half of this table is
 * exactly the bit-based half times eight — kept as an explicit multiplication
 * rather than a second hand-typed constant, which is what would let the two
 * halves silently drift apart.
 */
const BANDWIDTH_FACTORS: Record<BandwidthUnit, number> = {
  "bit/s": 1,
  "kbit/s": 1e3,
  "Mbit/s": 1e6,
  "Gbit/s": 1e9,
  "Tbit/s": 1e12,
  "B/s": BITS_PER_BYTE,
  "KB/s": BITS_PER_BYTE * 1e3,
  "MB/s": BITS_PER_BYTE * 1e6,
  "GB/s": BITS_PER_BYTE * 1e9,
};

export const BANDWIDTH_UNITS: BandwidthUnit[] = [
  "bit/s",
  "kbit/s",
  "Mbit/s",
  "Gbit/s",
  "Tbit/s",
  "B/s",
  "KB/s",
  "MB/s",
  "GB/s",
];

export const BANDWIDTH_UNIT_LABELS: Record<BandwidthUnit, string> = {
  "bit/s": "bit / saniyə",
  "kbit/s": "kilobit / saniyə · 1000",
  "Mbit/s": "meqabit / saniyə · 1000²",
  "Gbit/s": "giqabit / saniyə · 1000³",
  "Tbit/s": "terabit / saniyə · 1000⁴",
  "B/s": "bayt / saniyə · bit ×8",
  "KB/s": "kilobayt / saniyə · bit ×8",
  "MB/s": "meqabayt / saniyə · bit ×8",
  "GB/s": "giqabayt / saniyə · bit ×8",
};

/** Bytes for one unit of each — decimal (powers of ten) and binary (powers of two) interleaved by rung. */
const SIZE_FACTORS: Record<SizeUnit, number> = {
  B: 1,
  KB: 1e3,
  MB: 1e6,
  GB: 1e9,
  TB: 1e12,
  PB: 1e15,
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
  TiB: 1024 ** 4,
};

export const SIZE_UNITS: SizeUnit[] = [
  "B",
  "KB",
  "MB",
  "GB",
  "TB",
  "PB",
  "KiB",
  "MiB",
  "GiB",
  "TiB",
];

export const SIZE_UNIT_LABELS: Record<SizeUnit, string> = {
  B: "bayt",
  KB: "kilobayt · onluq, 1000",
  MB: "meqabayt · onluq, 1000²",
  GB: "giqabayt · onluq, 1000³",
  TB: "terabayt · onluq, 1000⁴",
  PB: "petabayt · onluq, 1000⁵",
  KiB: "kibibayt · ikilik, 1024",
  MiB: "mebibayt · ikilik, 1024²",
  GiB: "gibibayt · ikilik, 1024³",
  TiB: "tebibayt · ikilik, 1024⁴",
};

const TIME_FACTORS: Record<TimeUnit, number> = { s: 1, min: 60, h: 3600, d: 86400 };

export const TIME_UNITS: TimeUnit[] = ["s", "min", "h", "d"];

export const TIME_UNIT_LABELS: Record<TimeUnit, string> = {
  s: "saniyə",
  min: "dəqiqə",
  h: "saat",
  d: "gün",
};

export function bandwidthToBitsPerSecond(value: number, unit: BandwidthUnit): number {
  return value * BANDWIDTH_FACTORS[unit];
}

export function bitsPerSecondToBandwidth(bitsPerSecond: number, unit: BandwidthUnit): number {
  return bitsPerSecond / BANDWIDTH_FACTORS[unit];
}

export function sizeToBytes(value: number, unit: SizeUnit): number {
  return value * SIZE_FACTORS[unit];
}

export function bytesToSize(bytes: number, unit: SizeUnit): number {
  return bytes / SIZE_FACTORS[unit];
}

export function timeToSeconds(value: number, unit: TimeUnit): number {
  return value * TIME_FACTORS[unit];
}

export function secondsToTime(seconds: number, unit: TimeUnit): number {
  return seconds / TIME_FACTORS[unit];
}

/* ---------- protocol overhead ---------- */

export type OverheadAssumption = "raw" | "tcp-ipv4" | "tcp-ipv6" | "custom";

export type OverheadPresetInfo = {
  id: OverheadAssumption;
  label: string;
  /** Percent of nominal bandwidth lost to framing and retransmits. `null` only for "custom" — the widget supplies the number. */
  percent: number | null;
};

/*
 * The two named percentages are the standard TCP/IP-over-Ethernet estimates
 * for a full 1500-byte MTU: 20 bytes of IPv4 (40 for IPv6) plus 20 of TCP plus
 * 14 of Ethernet framing and the 8-byte preamble/start-frame delimiter, taken
 * as a share of the 1538/1542-byte slot the wire actually spends per frame.
 */
export const OVERHEAD_PRESETS: OverheadPresetInfo[] = [
  { id: "raw", label: "Xam sürət", percent: 0 },
  { id: "tcp-ipv4", label: "TCP/IPv4 (Ethernet)", percent: 3.2 },
  { id: "tcp-ipv6", label: "TCP/IPv6 (Ethernet)", percent: 4.2 },
  { id: "custom", label: "Öz faizim", percent: null },
];

export const MAX_OVERHEAD_PERCENT = 90;

/* ---------- limits — the ceiling an absurd input hits instead of Infinity ---------- */

export const MAX_BANDWIDTH_BPS = 100 * BANDWIDTH_FACTORS["Tbit/s"];
export const MAX_SIZE_BYTES = 10 * SIZE_FACTORS.PB;
export const MAX_TIME_YEARS = 50;
export const MAX_TIME_SECONDS = MAX_TIME_YEARS * 365 * TIME_FACTORS.d;

/* ---------- input parsing ---------- */

export type ParsedAmount = { value: number | null; error: string | null };

function cleanNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** A quantity that must be strictly positive: a size, a bandwidth, a target time. */
export function parseAmount(raw: string): ParsedAmount {
  if (raw.trim() === "") return { value: null, error: "Rəqəm yaz." };

  const value = cleanNumber(raw);
  if (value === null || Number.isNaN(value)) {
    return { value: null, error: "Bu rəqəm deyil — vahidi yanındakı siyahıdan seç." };
  }
  if (value <= 0) {
    return { value: null, error: "Sıfırdan böyük rəqəm yaz — sıfır və mənfi ötürmə mənasızdır." };
  }
  return { value, error: null };
}

/** A percentage that may be zero (raw, 0% overhead is a legitimate choice). */
export function parsePercent(raw: string): ParsedAmount {
  if (raw.trim() === "") return { value: null, error: "Rəqəm yaz." };

  const value = cleanNumber(raw);
  if (value === null || Number.isNaN(value)) {
    return { value: null, error: "Bu rəqəm deyil." };
  }
  const error = validateOverheadPercent(value);
  return error ? { value: null, error } : { value, error: null };
}

/* ---------- validation ---------- */

function validateSizeBytes(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "Ölçü sıfırdan böyük olmalıdır.";
  }
  if (bytes > MAX_SIZE_BYTES) {
    return `Ölçü çox böyükdür — bu alət ən çox ${formatDecimalSize(MAX_SIZE_BYTES)} qəbul edir.`;
  }
  return null;
}

function validateBandwidthBps(bitsPerSecond: number): string | null {
  if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) {
    return "Bant genişliyi sıfırdan böyük olmalıdır.";
  }
  if (bitsPerSecond > MAX_BANDWIDTH_BPS) {
    return `Bant genişliyi çox böyükdür — bu alət ən çox ${formatBandwidthAuto(MAX_BANDWIDTH_BPS)} qəbul edir.`;
  }
  return null;
}

function validateTimeSeconds(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "Vaxt sıfırdan böyük olmalıdır.";
  }
  if (seconds > MAX_TIME_SECONDS) {
    return `Vaxt çox uzundur — bu alət ən çox ${MAX_TIME_YEARS} il qəbul edir.`;
  }
  return null;
}

function validateOverheadPercent(percent: number): string | null {
  if (!Number.isFinite(percent)) return "Protokol xərci rəqəm deyil.";
  if (percent < 0) return "Protokol xərci mənfi ola bilməz.";
  if (percent >= MAX_OVERHEAD_PERCENT) {
    return `Protokol xərci ${MAX_OVERHEAD_PERCENT}%-dən aşağı olmalıdır — bundan yuxarısı faktiki sıfır ötürmə deməkdir.`;
  }
  return null;
}

/* ---------- the solve ---------- */

export type TransferInput = {
  solveFor: SolveField;
  sizeValue: number;
  sizeUnit: SizeUnit;
  bandwidthValue: number;
  bandwidthUnit: BandwidthUnit;
  timeValue: number;
  timeUnit: TimeUnit;
  /** 0–100, already resolved from a preset or a free-entry field. */
  overheadPercent: number;
};

export type TransferResult =
  | { ok: true; solveFor: "time"; theoreticalSeconds: number; realisticSeconds: number; overheadPercent: number }
  | { ok: true; solveFor: "bandwidth"; theoreticalBps: number; realisticBps: number; overheadPercent: number }
  | { ok: true; solveFor: "size"; theoreticalBytes: number; realisticBytes: number; overheadPercent: number }
  | { ok: false; error: string };

/**
 * Solves whichever of size, bandwidth or time `input.solveFor` names, from the
 * other two. Every branch returns both the raw (`theoretical*`) and the
 * overhead-adjusted (`realistic*`) figure — never one without the other,
 * because a bandwidth tool that only prints the flattering number is worse
 * than no tool.
 */
export function calculateTransfer(input: TransferInput): TransferResult {
  const overheadError = validateOverheadPercent(input.overheadPercent);
  if (overheadError) return { ok: false, error: overheadError };
  const usableFraction = 1 - input.overheadPercent / 100;

  if (input.solveFor === "time") {
    const bytes = sizeToBytes(input.sizeValue, input.sizeUnit);
    const bitsPerSecond = bandwidthToBitsPerSecond(input.bandwidthValue, input.bandwidthUnit);

    const sizeError = validateSizeBytes(bytes);
    if (sizeError) return { ok: false, error: sizeError };
    const bandwidthError = validateBandwidthBps(bitsPerSecond);
    if (bandwidthError) return { ok: false, error: bandwidthError };

    const theoreticalSeconds = (bytes * BITS_PER_BYTE) / bitsPerSecond;
    const realisticSeconds = (bytes * BITS_PER_BYTE) / (bitsPerSecond * usableFraction);
    return {
      ok: true,
      solveFor: "time",
      theoreticalSeconds,
      realisticSeconds,
      overheadPercent: input.overheadPercent,
    };
  }

  if (input.solveFor === "bandwidth") {
    const bytes = sizeToBytes(input.sizeValue, input.sizeUnit);
    const seconds = timeToSeconds(input.timeValue, input.timeUnit);

    const sizeError = validateSizeBytes(bytes);
    if (sizeError) return { ok: false, error: sizeError };
    const timeError = validateTimeSeconds(seconds);
    if (timeError) return { ok: false, error: timeError };

    const theoreticalBps = (bytes * BITS_PER_BYTE) / seconds;
    // The nominal link has to be faster than the payload rate by the overhead
    // share, so "realistic" here means "what to actually buy", not a smaller number.
    const realisticBps = theoreticalBps / usableFraction;

    const magnitudeError = validateBandwidthBps(realisticBps);
    if (magnitudeError) return { ok: false, error: magnitudeError };

    return {
      ok: true,
      solveFor: "bandwidth",
      theoreticalBps,
      realisticBps,
      overheadPercent: input.overheadPercent,
    };
  }

  // solveFor === "size"
  const bitsPerSecond = bandwidthToBitsPerSecond(input.bandwidthValue, input.bandwidthUnit);
  const seconds = timeToSeconds(input.timeValue, input.timeUnit);

  const bandwidthError = validateBandwidthBps(bitsPerSecond);
  if (bandwidthError) return { ok: false, error: bandwidthError };
  const timeError = validateTimeSeconds(seconds);
  if (timeError) return { ok: false, error: timeError };

  const theoreticalBytes = (bitsPerSecond * seconds) / BITS_PER_BYTE;
  const realisticBytes = (bitsPerSecond * usableFraction * seconds) / BITS_PER_BYTE;

  const magnitudeError = validateSizeBytes(theoreticalBytes);
  if (magnitudeError) return { ok: false, error: magnitudeError };

  return {
    ok: true,
    solveFor: "size",
    theoreticalBytes,
    realisticBytes,
    overheadPercent: input.overheadPercent,
  };
}

/* ---------- formatting ---------- */

/** `formatNumber`'s own grouped-thousand output, one decimal under 100 and none above — the same rule `format.ts` uses for a byte count. */
function trimmedAmount(value: number): string {
  const digits = Math.abs(value) < 100 ? 1 : 0;
  return formatNumber(value, digits).replace(/,0$/, "");
}

function autoScale(value: number, ladder: readonly [string, number][]): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) {
    const smallest = ladder[ladder.length - 1];
    return `0 ${smallest[0]}`;
  }
  const abs = Math.abs(value);
  const rung = ladder.find(([, factor]) => abs >= factor) ?? ladder[ladder.length - 1];
  return `${trimmedAmount(value / rung[1])} ${rung[0]}`;
}

const DECIMAL_SIZE_LADDER: [string, number][] = [
  ["PB", SIZE_FACTORS.PB],
  ["TB", SIZE_FACTORS.TB],
  ["GB", SIZE_FACTORS.GB],
  ["MB", SIZE_FACTORS.MB],
  ["KB", SIZE_FACTORS.KB],
  ["B", SIZE_FACTORS.B],
];

/** A byte count as the decimal ladder ISPs and disk boxes advertise it — `formatBytes` in `shared/format` is the binary counterpart. */
export function formatDecimalSize(bytes: number): string {
  return autoScale(bytes, DECIMAL_SIZE_LADDER);
}

const BIT_LADDER: [string, number][] = [
  ["Tbit/s", BANDWIDTH_FACTORS["Tbit/s"]],
  ["Gbit/s", BANDWIDTH_FACTORS["Gbit/s"]],
  ["Mbit/s", BANDWIDTH_FACTORS["Mbit/s"]],
  ["kbit/s", BANDWIDTH_FACTORS["kbit/s"]],
  ["bit/s", BANDWIDTH_FACTORS["bit/s"]],
];

/** A bits-per-second figure on the ladder a link is actually sold on. */
export function formatBandwidthAuto(bitsPerSecond: number): string {
  return autoScale(bitsPerSecond, BIT_LADDER);
}

const BYTE_SPEED_LADDER: [string, number][] = [
  ["GB/s", BANDWIDTH_FACTORS["GB/s"]],
  ["MB/s", BANDWIDTH_FACTORS["MB/s"]],
  ["KB/s", BANDWIDTH_FACTORS["KB/s"]],
  ["B/s", BANDWIDTH_FACTORS["B/s"]],
];

/** The same bits-per-second figure read as a download manager reads it — the conversion line beside the bit-based one. */
export function formatByteSpeedAuto(bitsPerSecond: number): string {
  return autoScale(bitsPerSecond, BYTE_SPEED_LADDER);
}

/** Re-exported so a caller only needs this module to reach the binary reading — `formatBytes` itself lives in `shared/format`. */
export function formatBinarySize(bytes: number): string {
  return formatBytes(bytes);
}

/* ---------- reference rows ---------- */

export type BandwidthPresetRow = {
  id: string;
  label: string;
  value: number;
  unit: BandwidthUnit;
  /** Set only when the figure is a realistic measured throughput rather than the number printed on the box. */
  note?: string;
};

const REALISTIC_NOTE = "faktiki ötürmə — elan olunan sürət deyil";

export const BANDWIDTH_PRESETS: BandwidthPresetRow[] = [
  { id: "eth-10m", label: "10 Mbit Ethernet", value: 10, unit: "Mbit/s" },
  { id: "eth-100m", label: "100 Mbit Ethernet", value: 100, unit: "Mbit/s" },
  { id: "eth-1g", label: "1 Gbit Ethernet", value: 1, unit: "Gbit/s" },
  { id: "eth-2_5g", label: "2,5 Gbit Ethernet", value: 2.5, unit: "Gbit/s" },
  { id: "eth-10g", label: "10 Gbit Ethernet", value: 10, unit: "Gbit/s" },
  { id: "adsl", label: "ADSL", value: 8, unit: "Mbit/s" },
  { id: "az-home-fibre", label: "Azərbaycanda tipik ev fiberi", value: 100, unit: "Mbit/s" },
  { id: "lte", label: "LTE", value: 50, unit: "Mbit/s", note: REALISTIC_NOTE },
  { id: "wifi5", label: "Wi-Fi 5", value: 300, unit: "Mbit/s", note: REALISTIC_NOTE },
  { id: "wifi6", label: "Wi-Fi 6", value: 600, unit: "Mbit/s", note: REALISTIC_NOTE },
];

export type SizePresetRow = { id: string; label: string; value: number; unit: SizeUnit };

export const SIZE_PRESETS: SizePresetRow[] = [
  { id: "film-4gb", label: "4 GB film", value: 4, unit: "GB" },
  { id: "bluray-25gb", label: "25 GB Blu-ray", value: 25, unit: "GB" },
  { id: "backup-1tb", label: "1 TB backup", value: 1, unit: "TB" },
];
