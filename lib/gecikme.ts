/**
 * Latency budget: two independent things worth checking.
 *
 * (1) `LATENCY_REFERENCE` is a fixed lookup table, not a computation — the
 * only thing to verify about it is that the ns/µs/ms columns of one row
 * agree with each other and that the "human scale" column is derived from
 * the same ns value, not typed in separately (`humanScaleSeconds` is a pure
 * function of `ns` for exactly that reason: two numbers typed by hand can
 * drift apart, one computed from the other cannot).
 *
 * (2) `computeLatencyBudget` is the part a visitor actually drives: a list of
 * named stages, each sequential or parallel, folded into one total against a
 * target. Sequential stages add; a group of parallel stages contributes only
 * its slowest member, because that member is what the other stages are
 * waiting behind, not their sum. That rule is the one thing here a wrong
 * edit would silently get backwards, which is what the check file spends
 * most of its cases on.
 */

export type LatencyReferenceRow = {
  id: string;
  name: string;
  ns: number;
};

/**
 * Jeff Dean's "numbers every programmer should know", in the form Peter
 * Norvig collected them and Colin Scott's 2012 interactive update
 * (colin-scott.github.io/personal_website/research/interactive_latency.html)
 * kept in circulation — still the standard reference cited for relative
 * order-of-magnitude, not a fresh 2026 benchmark of any particular machine.
 */
export const LATENCY_REFERENCE_YEAR = 2012;
export const LATENCY_REFERENCE_SOURCE =
  "Jeff Dean (Google): Peter Norvig-in tərtib etdiyi və Colin Scott-un 2012-ci ildə yenilədiyi siyahı. Konkret bir maşının bugünkü ölçüsü deyil, nisbi miqyası göstərən istinad nöqtəsidir.";

export const LATENCY_REFERENCE: LatencyReferenceRow[] = [
  { id: "l1", name: "L1 keşdən oxuma", ns: 0.5 },
  { id: "branch", name: "Budaq proqnozunun səhvi (branch mispredict)", ns: 5 },
  { id: "l2", name: "L2 keşdən oxuma", ns: 7 },
  { id: "mutex", name: "Mutex kilidləmə/açma", ns: 25 },
  { id: "ram", name: "RAM-dan təsadüfi oxuma", ns: 100 },
  { id: "compress", name: "1 KB-ı yaddaşda sıxma (Zippy)", ns: 3_000 },
  { id: "lan-1kb", name: "1 KB-ı 1 Gbps şəbəkə ilə göndərmə", ns: 10_000 },
  { id: "ssd-random", name: "SSD-dən 4 KB təsadüfi oxuma", ns: 150_000 },
  { id: "ram-1mb", name: "1 MB-ı RAM-dan ardıcıl oxuma", ns: 250_000 },
  { id: "same-dc", name: "Eyni datamərkəzdə gediş-gəliş", ns: 500_000 },
  { id: "ssd-1mb", name: "1 MB-ı SSD-dən ardıcıl oxuma", ns: 1_000_000 },
  { id: "disk-seek", name: "Disk axtarışı (seek)", ns: 10_000_000 },
  { id: "disk-1mb", name: "1 MB-ı diskdən ardıcıl oxuma", ns: 20_000_000 },
  { id: "intercontinental", name: "Qitələrarası gediş-gəliş (CA↔Niderland)", ns: 150_000_000 },
];

export function nsToUs(ns: number): number {
  return ns / 1_000;
}

export function nsToMs(ns: number): number {
  return ns / 1_000_000;
}

/** The "1 ns = 1 second" scale: at that ratio, `ns` nanoseconds becomes exactly `ns` seconds. */
export function humanScaleSeconds(ns: number): number {
  return ns;
}

function roundHuman(value: number): number {
  if (value >= 100) return Math.round(value);
  return Math.round(value * 10) / 10;
}

/** `humanScaleSeconds` turned into a sentence a visitor reads without doing the arithmetic. */
export function formatHumanScale(ns: number): string {
  const seconds = humanScaleSeconds(ns);
  if (seconds < 60) return `${roundHuman(seconds)} saniyə`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${roundHuman(minutes)} dəqiqə`;
  const hours = minutes / 60;
  if (hours < 24) return `${roundHuman(hours)} saat`;
  const days = hours / 24;
  if (days < 365) return `${roundHuman(days)} gün`;
  const years = days / 365;
  return `${roundHuman(years)} il`;
}

/* ---------- budget builder ---------- */

export type BudgetStageMode = "ardicil" | "paralel";

export type BudgetStage = {
  id: string;
  name: string;
  ms: number;
  mode: BudgetStageMode;
};

export type BudgetComputation =
  | {
      ok: true;
      /** Sum of every `ardicil` stage's `ms`. */
      sequentialMs: number;
      /** The slowest `paralel` stage's `ms` — the group waits for it, not their sum. */
      parallelMs: number;
      totalMs: number;
      targetBudgetMs: number;
      heaviestStage: BudgetStage;
      /** `heaviestStage.ms` as a share of `totalMs`, 0–100. */
      heaviestSharePercent: number;
      overBudgetMs: number;
      overBudgetPercent: number;
      isOverBudget: boolean;
    }
  | { ok: false; error: string };

export function computeLatencyBudget(
  stages: BudgetStage[],
  targetBudgetMs: number,
): BudgetComputation {
  if (stages.length === 0) {
    return { ok: false, error: "Ən azı bir mərhələ əlavə et." };
  }
  for (const stage of stages) {
    if (!Number.isFinite(stage.ms) || stage.ms < 0) {
      return {
        ok: false,
        error: `"${stage.name || stage.id}" mərhələsi üçün mənfi olmayan rəqəm yaz.`,
      };
    }
  }
  if (!Number.isFinite(targetBudgetMs) || targetBudgetMs <= 0) {
    return { ok: false, error: "Hədəf büdcə sıfırdan böyük olmalıdır." };
  }

  const sequentialMs = stages
    .filter((stage) => stage.mode === "ardicil")
    .reduce((sum, stage) => sum + stage.ms, 0);

  const parallelStages = stages.filter((stage) => stage.mode === "paralel");
  const parallelMs = parallelStages.length > 0 ? Math.max(...parallelStages.map((s) => s.ms)) : 0;

  const totalMs = sequentialMs + parallelMs;

  const heaviestStage = stages.reduce((heaviest, stage) => (stage.ms > heaviest.ms ? stage : heaviest));
  const heaviestSharePercent = totalMs > 0 ? (heaviestStage.ms / totalMs) * 100 : 0;

  const overBudgetMs = totalMs - targetBudgetMs;
  const overBudgetPercent = (overBudgetMs / targetBudgetMs) * 100;

  return {
    ok: true,
    sequentialMs,
    parallelMs,
    totalMs,
    targetBudgetMs,
    heaviestStage,
    heaviestSharePercent,
    overBudgetMs,
    overBudgetPercent,
    isOverBudget: totalMs > targetBudgetMs,
  };
}

export const DEFAULT_STAGES: BudgetStage[] = [
  { id: "dns", name: "DNS axtarışı", ms: 20, mode: "ardicil" },
  { id: "tls", name: "TLS əl sıxma", ms: 60, mode: "ardicil" },
  { id: "sorgu", name: "Şəbəkə sorğusu", ms: 40, mode: "ardicil" },
  { id: "baza", name: "Baza sorğusu", ms: 25, mode: "ardicil" },
  { id: "render", name: "Render", ms: 30, mode: "ardicil" },
];

export const DEFAULT_TARGET_BUDGET_MS = 200;
