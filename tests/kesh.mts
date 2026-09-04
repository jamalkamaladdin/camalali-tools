import type { CheckSuite } from "./harness.mts";
import { computeCacheBudget, DEFAULT_CACHE_INPUT, harmonicNumber, type CacheInput } from "../lib/kesh";

const EPS = 1e-6;

function withInput(patch: Partial<CacheInput>): CacheInput {
  return { ...DEFAULT_CACHE_INPUT, ...patch };
}

export const checks: CheckSuite = (check) => {
  const knownUniform = computeCacheBudget(
    withInput({
      requestCount: 1_000,
      uniqueKeyCount: 100,
      sizeMode: "items",
      cacheSizeItems: 100,
      model: "uniform",
    }),
  );
  check(
    "sadə model: N=1000, U=100, C=100 → hit nisbəti 0,9 (900 təkrar sorğunun hamısı hit)",
    knownUniform.ok && Math.abs(knownUniform.hitRatio - 0.9) < EPS,
    JSON.stringify(knownUniform),
  );

  const avgLatency = computeCacheBudget(
    withInput({
      requestCount: 1_000,
      uniqueKeyCount: 100,
      sizeMode: "items",
      cacheSizeItems: 100,
      cacheLatencyMs: 2,
      originLatencyMs: 80,
      model: "uniform",
    }),
  );
  check(
    "orta gecikmə hit×keş + miss×mənbə düsturu ilə uyğun gəlir (0,9×2 + 0,1×80 = 9,8ms)",
    avgLatency.ok && Math.abs(avgLatency.avgLatencyMs - 9.8) < 1e-3,
    JSON.stringify(avgLatency),
  );

  const zipfFull = computeCacheBudget(
    withInput({ uniqueKeyCount: 500, sizeMode: "items", cacheSizeItems: 500, model: "zipf" }),
  );
  check(
    "Zipf modeli: keş tutumu unikal açar sayına bərabərdirsə hit nisbəti tam 1-dir (sərhəd)",
    zipfFull.ok && Math.abs(zipfFull.hitRatio - 1) < EPS,
    JSON.stringify(zipfFull),
  );

  const uniformApproachesOne = computeCacheBudget(
    withInput({
      requestCount: 1_000_000,
      uniqueKeyCount: 10,
      sizeMode: "items",
      cacheSizeItems: 1_000,
      model: "uniform",
    }),
  );
  check(
    "sadə model: keş tutumu unikal açar sayından çox böyükdürsə hit nisbəti 1-ə yaxınlaşır",
    uniformApproachesOne.ok && uniformApproachesOne.hitRatio > 0.999,
    JSON.stringify(uniformApproachesOne),
  );

  const zeroUnique = computeCacheBudget(withInput({ uniqueKeyCount: 0 }));
  check("sıfır unikal açar xəta qaytarır (sıfıra bölmə qarşısı alınır)", zeroUnique.ok === false, JSON.stringify(zeroUnique));

  const negativeRequests = computeCacheBudget(withInput({ requestCount: -10 }));
  check("mənfi sorğu sayı xəta qaytarır", negativeRequests.ok === false, JSON.stringify(negativeRequests));

  const zeroItemSize = computeCacheBudget(withInput({ sizeMode: "mb", avgItemSizeKb: 0 }));
  check("sıfır element ölçüsü xəta qaytarır (MB→element çevrilməsində sıfıra bölmə)", zeroItemSize.ok === false, JSON.stringify(zeroItemSize));

  const negativeSizeMb = computeCacheBudget(withInput({ sizeMode: "mb", cacheSizeMb: -1 }));
  check("mənfi keş ölçüsü (MB) xəta qaytarır", negativeSizeMb.ok === false, JSON.stringify(negativeSizeMb));

  const memory = computeCacheBudget(withInput({ uniqueKeyCount: 1_000, avgItemSizeKb: 4 }));
  check(
    "bütün unikal açarlar üçün lazım olan yaddaş = unikal açar × orta ölçü (1000×4KB=4000KB)",
    memory.ok && Math.abs(memory.memoryForAllUniqueKb - 4_000) < EPS,
    JSON.stringify(memory),
  );

  const cappedCapacity = computeCacheBudget(
    withInput({ uniqueKeyCount: 50, sizeMode: "items", cacheSizeItems: 10_000 }),
  );
  check(
    "effektiv tutum unikal açar sayından yuxarı qalxmır",
    cappedCapacity.ok && cappedCapacity.effectiveCapacityItems === 50 && cappedCapacity.capacityItems === 10_000,
    JSON.stringify(cappedCapacity),
  );

  check("harmonicNumber(1)=1", Math.abs(harmonicNumber(1) - 1) < EPS, String(harmonicNumber(1)));
  check(
    "harmonicNumber(4)=1+1/2+1/3+1/4",
    Math.abs(harmonicNumber(4) - 25 / 12) < EPS,
    String(harmonicNumber(4)),
  );

  const partialUniform = computeCacheBudget(
    withInput({ requestCount: 100_000, uniqueKeyCount: 100, sizeMode: "items", cacheSizeItems: 20, model: "uniform" }),
  );
  const partialZipf = computeCacheBudget(
    withInput({ requestCount: 100_000, uniqueKeyCount: 100, sizeMode: "items", cacheSizeItems: 20, model: "zipf" }),
  );
  check(
    "eyni qismi tutumda Zipf modeli sadə modeldən yüksək hit nisbəti verir",
    partialUniform.ok && partialZipf.ok && partialZipf.hitRatio > partialUniform.hitRatio,
    `uniform=${partialUniform.ok ? partialUniform.hitRatio : "err"}, zipf=${partialZipf.ok ? partialZipf.hitRatio : "err"}`,
  );

  const ratioInvariant = computeCacheBudget(withInput({ requestCount: 12_345, uniqueKeyCount: 321, cacheSizeItems: 77 }));
  check(
    "hit nisbəti + miss nisbəti = 1 (hər hesablamada)",
    ratioInvariant.ok && Math.abs(ratioInvariant.hitRatio + ratioInvariant.missRatio - 1) < EPS,
    JSON.stringify(ratioInvariant),
  );
};
