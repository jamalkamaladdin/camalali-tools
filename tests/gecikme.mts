import type { CheckSuite } from "./harness.mts";
import {
  computeLatencyBudget,
  formatHumanScale,
  LATENCY_REFERENCE,
  nsToMs,
  nsToUs,
  type BudgetStage,
} from "../lib/gecikme";

const EPS = 1e-9;

export const checks: CheckSuite = (check) => {
  const sequentialStages: BudgetStage[] = [
    { id: "a", name: "A", ms: 20, mode: "ardicil" },
    { id: "b", name: "B", ms: 30, mode: "ardicil" },
    { id: "c", name: "C", ms: 50, mode: "ardicil" },
  ];

  const withinBudget = computeLatencyBudget(sequentialStages, 100);
  check(
    "ardıcıl mərhələlər toplanır (20+30+50=100)",
    withinBudget.ok && Math.abs(withinBudget.totalMs - 100) < EPS,
    JSON.stringify(withinBudget),
  );
  check(
    "cəm hədəfə bərabərdirsə hədəf aşılmır (sərhəd)",
    withinBudget.ok && withinBudget.isOverBudget === false,
    JSON.stringify(withinBudget),
  );
  check(
    "ən ağır mərhələ və payı düzgün tapılır (50/100=50%)",
    withinBudget.ok &&
      withinBudget.heaviestStage.id === "c" &&
      Math.abs(withinBudget.heaviestSharePercent - 50) < EPS,
    JSON.stringify(withinBudget),
  );

  const parallelStages: BudgetStage[] = [
    { id: "seq", name: "Ardıcıl", ms: 10, mode: "ardicil" },
    { id: "p1", name: "Paralel 1", ms: 40, mode: "paralel" },
    { id: "p2", name: "Paralel 2", ms: 70, mode: "paralel" },
  ];
  const parallelResult = computeLatencyBudget(parallelStages, 200);
  check(
    "paralel qrup yalnız ən yavaş üzvü qədər hesablanır (10+70=80, 40 yox)",
    parallelResult.ok && Math.abs(parallelResult.totalMs - 80) < EPS,
    JSON.stringify(parallelResult),
  );

  const overBudget = computeLatencyBudget(
    [
      { id: "a", name: "A", ms: 100, mode: "ardicil" },
      { id: "b", name: "B", ms: 50, mode: "ardicil" },
    ],
    100,
  );
  check(
    "hədəf aşılanda overBudgetMs və faiz düzgün hesablanır (150-100=50, 50%)",
    overBudget.ok &&
      overBudget.isOverBudget === true &&
      Math.abs(overBudget.overBudgetMs - 50) < EPS &&
      Math.abs(overBudget.overBudgetPercent - 50) < EPS,
    JSON.stringify(overBudget),
  );

  const negativeStage = computeLatencyBudget(
    [{ id: "a", name: "Mənfi", ms: -5, mode: "ardicil" }],
    100,
  );
  check("mənfi mərhələ xəta qaytarır, throw etmir", negativeStage.ok === false, JSON.stringify(negativeStage));

  const emptyStages = computeLatencyBudget([], 100);
  check("boş mərhələ siyahısı xəta qaytarır", emptyStages.ok === false, JSON.stringify(emptyStages));

  const zeroTarget = computeLatencyBudget(sequentialStages, 0);
  check("sıfır hədəf büdcə xəta qaytarır (sıfıra bölmə qarşısı alınır)", zeroTarget.ok === false, JSON.stringify(zeroTarget));

  check(
    "formatHumanScale(100 ns) 1,7 dəqiqəyə düşür",
    formatHumanScale(100) === "1.7 dəqiqə",
    formatHumanScale(100),
  );
  check(
    "formatHumanScale(0.5 ns) saniyə vahidində qalır",
    formatHumanScale(0.5) === "0.5 saniyə",
    formatHumanScale(0.5),
  );

  check("nsToUs(1000)=1", Math.abs(nsToUs(1_000) - 1) < EPS, String(nsToUs(1_000)));
  check("nsToMs(1000000)=1", Math.abs(nsToMs(1_000_000) - 1) < EPS, String(nsToMs(1_000_000)));

  check(
    "gecikmə cədvəli artan sırada düzülüb (nanosaniyədən qitələrarasına)",
    LATENCY_REFERENCE.every((row, i) => i === 0 || row.ns > LATENCY_REFERENCE[i - 1].ns),
    LATENCY_REFERENCE.map((r) => r.ns).join(","),
  );
};
