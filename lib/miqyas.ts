/**
 * Back-of-the-envelope capacity planning. Pure arithmetic, no React and no DOM,
 * so every number the page prints is provable by `scripts/miqyas.test.ts`.
 */

export type ScaleInput = {
  /** Daily active users. */
  dau: number;
  /** Actions one user performs per day — requests, not sessions. */
  actionsPerUser: number;
  /** 100 means 100 reads for every write. 0 means the load is writes only. */
  readsPerWrite: number;
  /** Average stored payload of one write, in KB. */
  writeSizeKb: number;
  /** Average response body of one read, in KB — the traffic side of the sum. */
  responseSizeKb: number;
  retentionMonths: number;
  /** Traffic is never flat across the day; the peak hour carries a multiple. */
  peakFactor: number;
  replication: number;
  cacheHitPercent: number;
  /** How many requests per second one node absorbs. */
  nodeCapacityRps: number;
};

export type ScaleResult = {
  totalActionsPerDay: number;
  readsPerDay: number;
  writesPerDay: number;
  avgRps: number;
  readRps: number;
  writeRps: number;
  peakRps: number;
  peakReadRps: number;
  peakWriteRps: number;
  /** Reads left after the cache absorbs its share — the load the database sees. */
  dbReadRps: number;
  dbPeakReadRps: number;
  dailyEgressBytes: number;
  dailyIngressBytes: number;
  dailyTrafficBytes: number;
  monthlyTrafficBytes: number;
  dailyStorageBytes: number;
  retentionDays: number;
  storageBytes: number;
  replicatedStorageBytes: number;
  /** `null` when node capacity is zero — dividing by it would be meaningless. */
  nodes: number | null;
  warnings: string[];
};

const SECONDS_PER_DAY = 86_400;
/** A "month" in capacity work is 30 days; calendar months are noise here. */
const DAYS_PER_MONTH = 30;
const BYTES_PER_KB = 1024;

type Limit = { min: number; max: number };

/**
 * Every field is clamped before use. The ceilings are not a UX preference: they
 * keep the products far below Number.MAX_VALUE, so no result can reach Infinity
 * however large a number is pasted in.
 */
const limits: Record<keyof ScaleInput, Limit> = {
  dau: { min: 0, max: 1e12 },
  actionsPerUser: { min: 0, max: 1e6 },
  readsPerWrite: { min: 0, max: 1e6 },
  writeSizeKb: { min: 0, max: 1e9 },
  responseSizeKb: { min: 0, max: 1e9 },
  retentionMonths: { min: 0, max: 1200 },
  peakFactor: { min: 1, max: 1000 },
  replication: { min: 1, max: 100 },
  cacheHitPercent: { min: 0, max: 100 },
  nodeCapacityRps: { min: 0, max: 1e9 },
};

export const scaleFieldKeys = Object.keys(limits) as (keyof ScaleInput)[];

function clamp(value: number, limit: Limit): number {
  if (!Number.isFinite(value)) return limit.min;
  return Math.min(Math.max(value, limit.min), limit.max);
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function normaliseScaleInput(input: ScaleInput): ScaleInput {
  const out = {} as ScaleInput;
  for (const key of scaleFieldKeys) out[key] = clamp(input[key], limits[key]);
  return out;
}

export const defaultScaleInput: ScaleInput = {
  dau: 100_000,
  actionsPerUser: 30,
  readsPerWrite: 100,
  writeSizeKb: 2,
  responseSizeKb: 10,
  retentionMonths: 24,
  peakFactor: 3,
  replication: 3,
  cacheHitPercent: 80,
  nodeCapacityRps: 1000,
};

export type ScalePreset = {
  id: string;
  name: string;
  note: string;
  input: ScaleInput;
};

export const scalePresets: ScalePreset[] = [
  {
    id: "startup",
    name: "Kiçik startap",
    note: "5 min istifadəçi, bir server bəs edir",
    input: {
      dau: 5_000,
      actionsPerUser: 20,
      readsPerWrite: 20,
      writeSizeKb: 2,
      responseSizeKb: 8,
      retentionMonths: 12,
      peakFactor: 3,
      replication: 3,
      cacheHitPercent: 70,
      nodeCapacityRps: 1000,
    },
  },
  {
    id: "saas",
    name: "Orta SaaS",
    note: "250 min istifadəçi, oxu ağırlıqlı iş yükü",
    input: {
      dau: 250_000,
      actionsPerUser: 40,
      readsPerWrite: 50,
      writeSizeKb: 4,
      responseSizeKb: 20,
      retentionMonths: 36,
      peakFactor: 3,
      replication: 3,
      cacheHitPercent: 85,
      nodeCapacityRps: 1000,
    },
  },
  {
    id: "social",
    name: "Sosial şəbəkə miqyası",
    note: "100 mln istifadəçi, lentin oxu axını",
    input: {
      dau: 100_000_000,
      actionsPerUser: 50,
      readsPerWrite: 100,
      writeSizeKb: 1,
      responseSizeKb: 15,
      retentionMonths: 60,
      peakFactor: 4,
      replication: 3,
      cacheHitPercent: 95,
      nodeCapacityRps: 2000,
    },
  },
];

export function calculateScale(raw: ScaleInput): ScaleResult {
  const input = normaliseScaleInput(raw);
  const warnings: string[] = [];

  const tooSmall = scaleFieldKeys.some(
    (key) => !Number.isFinite(raw[key]) || raw[key] < limits[key].min,
  );
  const tooLarge = scaleFieldKeys.some((key) => raw[key] > limits[key].max);

  if (tooSmall) {
    warnings.push(
      "Mənfi və ya rəqəm olmayan dəyər icazə verilən ən aşağı həddə gətirildi.",
    );
  }
  if (tooLarge) {
    warnings.push(
      "Çox böyük dəyər həddə salındı — nəticəni real plan kimi yox, yuxarı sərhəd kimi oxu.",
    );
  }

  const totalActionsPerDay = input.dau * input.actionsPerUser;
  if (totalActionsPerDay === 0) {
    warnings.push(
      "Gündəlik əməliyyat sayı sıfırdır: istifadəçi sayını və əməliyyat sayını doldur.",
    );
  }

  // readsPerWrite is clamped to >= 0, so the denominator is never below 1.
  const writesPerDay = totalActionsPerDay / (input.readsPerWrite + 1);
  const readsPerDay = totalActionsPerDay - writesPerDay;

  const avgRps = totalActionsPerDay / SECONDS_PER_DAY;
  const readRps = readsPerDay / SECONDS_PER_DAY;
  const writeRps = writesPerDay / SECONDS_PER_DAY;

  const peakRps = avgRps * input.peakFactor;
  const peakReadRps = readRps * input.peakFactor;
  const peakWriteRps = writeRps * input.peakFactor;

  const cacheMiss = 1 - input.cacheHitPercent / 100;
  const dbReadRps = readRps * cacheMiss;
  const dbPeakReadRps = peakReadRps * cacheMiss;

  const dailyEgressBytes = readsPerDay * input.responseSizeKb * BYTES_PER_KB;
  const dailyIngressBytes = writesPerDay * input.writeSizeKb * BYTES_PER_KB;
  const dailyTrafficBytes = dailyEgressBytes + dailyIngressBytes;

  // Only writes stay on disk; a read produces traffic, not storage.
  const dailyStorageBytes = dailyIngressBytes;
  const retentionDays = input.retentionMonths * DAYS_PER_MONTH;
  const storageBytes = dailyStorageBytes * retentionDays;

  let nodes: number | null = null;
  if (input.nodeCapacityRps > 0) {
    const needed = Math.ceil(peakRps / input.nodeCapacityRps);
    nodes = Number.isFinite(needed) ? needed : null;
  } else {
    warnings.push("Node tutumu sıfırdır — node sayı hesablana bilmir.");
  }

  return {
    totalActionsPerDay: finite(totalActionsPerDay),
    readsPerDay: finite(readsPerDay),
    writesPerDay: finite(writesPerDay),
    avgRps: finite(avgRps),
    readRps: finite(readRps),
    writeRps: finite(writeRps),
    peakRps: finite(peakRps),
    peakReadRps: finite(peakReadRps),
    peakWriteRps: finite(peakWriteRps),
    dbReadRps: finite(dbReadRps),
    dbPeakReadRps: finite(dbPeakReadRps),
    dailyEgressBytes: finite(dailyEgressBytes),
    dailyIngressBytes: finite(dailyIngressBytes),
    dailyTrafficBytes: finite(dailyTrafficBytes),
    monthlyTrafficBytes: finite(dailyTrafficBytes * DAYS_PER_MONTH),
    dailyStorageBytes: finite(dailyStorageBytes),
    retentionDays: finite(retentionDays),
    storageBytes: finite(storageBytes),
    replicatedStorageBytes: finite(storageBytes * input.replication),
    nodes,
    warnings,
  };
}

/**
 * The form holds text, not numbers. Empty is a legal "zero"; anything that is
 * not a number at all returns null so the page can name the broken field.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return 0;

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
