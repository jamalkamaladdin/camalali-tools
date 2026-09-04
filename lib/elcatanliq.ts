/**
 * Availability arithmetic: a percentage turned into the downtime it allows,
 * and a system's components folded into the percentage the whole thing
 * actually delivers.
 *
 * The period lengths are the one thing worth stating up front, because the
 * commonly quoted "99.9% = 8.76 hours/year" figure only comes out right with
 * a specific convention: a 365-day year, and a month defined as a twelfth of
 * it rather than a calendar month. That convention is what every function
 * below uses, and it is why `computeAllowedDowntime(99.9, "il")` has to land
 * on exactly 525.6 minutes — the check file pins that number down because a
 * different (perfectly reasonable) convention, like a 365.25-day year, would
 * silently move it.
 *
 * The two composition rules are the other thing worth checking on their own:
 * a chain (`combineSequential`) can only be as available as its weakest
 * link, and multiplies fractions down; a redundant group
 * (`combineParallel`) does the opposite and multiplies unavailability down.
 * Mixing the two up is the single most likely wrong edit here.
 */

export type Period = "gun" | "hefte" | "ay" | "il";

/** Days per period, under the 365-day-year convention this file is built on. */
const PERIOD_DAYS: Record<Period, number> = {
  gun: 1,
  hefte: 7,
  ay: 365 / 12,
  il: 365,
};

export const PERIOD_LABELS: Record<Period, string> = {
  gun: "gün",
  hefte: "həftə",
  ay: "ay",
  il: "il",
};

export const PERIODS: Period[] = ["gun", "hefte", "ay", "il"];

function periodSeconds(period: Period): number {
  return PERIOD_DAYS[period] * 86_400;
}

export type DowntimeResult =
  | { ok: true; seconds: number; minutes: number }
  | { ok: false; error: string };

/** The downtime a given availability percentage allows over one period. */
export function computeAllowedDowntime(percent: number, period: Period): DowntimeResult {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { ok: false, error: "Faiz 0 ilə 100 arasında olmalıdır." };
  }
  const seconds = (1 - percent / 100) * periodSeconds(period);
  return { ok: true, seconds, minutes: seconds / 60 };
}

/** The inverse: how much availability a given downtime, over one period, corresponds to. */
export function percentFromDowntime(minutes: number, period: Period): DowntimeResult & { percent?: number } {
  if (!Number.isFinite(minutes) || minutes < 0) {
    return { ok: false, error: "Dayanma müddəti mənfi ola bilməz." };
  }
  const total = periodSeconds(period);
  const seconds = minutes * 60;
  if (seconds > total) {
    return { ok: false, error: "Bu dayanma müddəti seçilmiş dövrdən uzundur." };
  }
  const percent = (1 - seconds / total) * 100;
  return { ok: true, seconds, minutes, percent };
}

/** `mm:ss`-style breakdown for display, computed from the same `seconds` a caller already has. */
export function formatDowntime(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  const totalSeconds = Math.round(seconds);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const secs = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} gün`);
  if (hours > 0) parts.push(`${hours} saat`);
  if (minutes > 0) parts.push(`${minutes} dəq`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs} san`);
  return parts.slice(0, 2).join(" ");
}

/** SLA tiers a visitor recognises by name. */
export const SLA_TIERS: number[] = [99, 99.9, 99.95, 99.99, 99.999];

/* ---------- composition ---------- */

export type ComponentMode = "ardicil" | "paralel";

export type SystemComponent = {
  id: string;
  name: string;
  percent: number;
  mode: ComponentMode;
};

/** All must work: fractions multiply, so the chain is never more available than its weakest link. */
export function combineSequential(percents: number[]): number | null {
  if (percents.length === 0) return null;
  return percents.reduce((product, p) => product * (p / 100), 1) * 100;
}

/** One is enough: unavailability multiplies down instead — `1 - Π(1 - pᵢ)`. */
export function combineParallel(percents: number[]): number | null {
  if (percents.length === 0) return null;
  const unavailability = percents.reduce((product, p) => product * (1 - p / 100), 1);
  return (1 - unavailability) * 100;
}

export type SystemComputation =
  | {
      ok: true;
      combinedPercent: number;
      /** The single component (or the parallel group, folded into one) with the lowest availability. */
      weakestLink: { name: string; percent: number };
      contributors: { name: string; percent: number }[];
    }
  | { ok: false; error: string };

export function computeSystemAvailability(components: SystemComponent[]): SystemComputation {
  if (components.length === 0) {
    return { ok: false, error: "Ən azı bir komponent əlavə et." };
  }
  for (const component of components) {
    if (!Number.isFinite(component.percent) || component.percent < 0 || component.percent > 100) {
      return {
        ok: false,
        error: `"${component.name || component.id}" üçün 0–100 arasında faiz yaz.`,
      };
    }
  }

  const sequential = components.filter((c) => c.mode === "ardicil");
  const parallel = components.filter((c) => c.mode === "paralel");

  const contributors: { name: string; percent: number }[] = sequential.map((c) => ({
    name: c.name,
    percent: c.percent,
  }));

  if (parallel.length > 0) {
    const parallelPercent = combineParallel(parallel.map((c) => c.percent))!;
    contributors.push({ name: "Paralel ehtiyat qrupu", percent: parallelPercent });
  }

  if (contributors.length === 0) {
    return { ok: false, error: "Ən azı bir komponent əlavə et." };
  }

  const combinedPercent = combineSequential(contributors.map((c) => c.percent))!;
  const weakestLink = contributors.reduce((weakest, c) => (c.percent < weakest.percent ? c : weakest));

  return { ok: true, combinedPercent, weakestLink, contributors };
}
