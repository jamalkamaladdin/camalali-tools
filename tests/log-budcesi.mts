import type { CheckSuite } from "./harness.mts";
import {
  captureProbabilityAtLeastOne,
  computeLogBudget,
  computeSamplingImpact,
  DEFAULT_LOG_BUDGET_INPUT,
  type LogBudgetInput,
} from "../lib/log-budcesi";

const EPS = 1e-6;

function withInput(patch: Partial<LogBudgetInput>): LogBudgetInput {
  return { ...DEFAULT_LOG_BUDGET_INPUT, ...patch };
}

export const checks: CheckSuite = (check) => {
  const known = computeLogBudget(withInput({ requestsPerSecond: 100, linesPerRequest: 3 }));
  check(
    "bilinən cavab: 100 sorğu/san × 3 sətir = 300 sətir/san",
    known.ok && known.linesPerSecond === 300,
    JSON.stringify(known),
  );

  const monthRelation = computeLogBudget(withInput({}));
  check(
    "ay həcmi = gün həcmi × 30 (sərhəd: gün→ay çevrilməsi)",
    monthRelation.ok && Math.abs(monthRelation.rawGbPerMonth - monthRelation.rawGbPerDay * 30) < EPS,
    JSON.stringify(monthRelation),
  );

  const retentionRelation = computeLogBudget(withInput({ retentionDays: 45 }));
  check(
    "saxlama müddətindəki ümumi xam həcm = gün həcmi × saxlama günü",
    retentionRelation.ok && Math.abs(retentionRelation.rawGbOverRetention - retentionRelation.rawGbPerDay * 45) < 1e-4,
    JSON.stringify(retentionRelation),
  );

  const noCompression = computeLogBudget(withInput({ compressionRatio: 1 }));
  check(
    "sıxılma nisbəti 1-dirsə (sıxılmır) sıxılmış həcm xam həcmə bərabərdir",
    noCompression.ok && Math.abs(noCompression.compressedGbOverRetention - noCompression.rawGbOverRetention) < 1e-4,
    JSON.stringify(noCompression),
  );

  const noIndexOverhead = computeLogBudget(withInput({ indexOverheadPercent: 0 }));
  check(
    "indeks əlavə yükü 0-dırsa indeksli həcm sıxılmış həcmə bərabərdir",
    noIndexOverhead.ok && Math.abs(noIndexOverhead.indexedGbOverRetention - noIndexOverhead.compressedGbOverRetention) < 1e-4,
    JSON.stringify(noIndexOverhead),
  );

  const singleReplica = computeLogBudget(withInput({ replicaCount: 1 }));
  check(
    "replika sayı 1-dirsə ümumi disk indeksli həcmə bərabərdir",
    singleReplica.ok && Math.abs(singleReplica.totalWithReplicasGb - singleReplica.indexedGbOverRetention) < 1e-4,
    JSON.stringify(singleReplica),
  );

  const levelSum = computeLogBudget(withInput({}));
  check(
    "səviyyə üzrə gündəlik həcmlərin cəmi ümumi gündəlik xam həcmə bərabərdir",
    levelSum.ok &&
      Math.abs(
        levelSum.levelGbPerDay.DEBUG + levelSum.levelGbPerDay.INFO + levelSum.levelGbPerDay.WARN + levelSum.levelGbPerDay.ERROR - levelSum.rawGbPerDay,
      ) < 1e-4,
    JSON.stringify(levelSum),
  );

  const debugSavings = computeLogBudget(withInput({ levelPercents: { DEBUG: 40, INFO: 40, WARN: 15, ERROR: 5 } }));
  check(
    "DEBUG söndürülməsinin qazancı = ümumi disk × DEBUG payı (eyni boru xəttindən keçdiyi üçün dəqiq bərabərdir)",
    debugSavings.ok && Math.abs(debugSavings.debugSavingsGbOverRetention - debugSavings.totalWithReplicasGb * 0.4) < 1e-3,
    JSON.stringify(debugSavings),
  );

  const badLevels = computeLogBudget(withInput({ levelPercents: { DEBUG: 50, INFO: 50, WARN: 10, ERROR: 10 } }));
  check("səviyyə faizlərinin cəmi 100 deyilsə xəta qaytarır", badLevels.ok === false, JSON.stringify(badLevels));

  const negativeRate = computeLogBudget(withInput({ requestsPerSecond: -5 }));
  check("mənfi sorğu/saniyə xəta qaytarır, throw etmir", negativeRate.ok === false, JSON.stringify(negativeRate));

  const badCompression = computeLogBudget(withInput({ compressionRatio: 0.5 }));
  check("1-dən kiçik sıxılma nisbəti xəta qaytarır", badCompression.ok === false, JSON.stringify(badCompression));

  const rawForSampling = 1000;
  const sampling10 = computeSamplingImpact(rawForSampling, 10);
  check(
    "10% nümunələmə həcmi 10 dəfə azaldır (1000GB → 100GB), azalma 90%",
    sampling10.ok && Math.abs(sampling10.volumeGb - 100) < EPS && Math.abs(sampling10.volumeReductionPercent - 90) < EPS,
    JSON.stringify(sampling10),
  );

  const badSampling = computeSamplingImpact(rawForSampling, 0);
  check("sıfır nümunələmə faizi xəta qaytarır", badSampling.ok === false, JSON.stringify(badSampling));

  const capture = captureProbabilityAtLeastOne(1, 2);
  check(
    "bilinən cavab: 1% nümunələmədə 2 müstəqil hadisədən ən azı birinin tutulma ehtimalı 1-0.99^2≈0.0199",
    Math.abs(capture - (1 - Math.pow(0.99, 2))) < EPS,
    String(capture),
  );

  check(
    "sıfır hadisə baş verməyibsə tutulma ehtimalı sıfırdır",
    captureProbabilityAtLeastOne(50, 0) === 0,
    String(captureProbabilityAtLeastOne(50, 0)),
  );
};
