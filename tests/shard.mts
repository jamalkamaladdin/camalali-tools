import type { CheckSuite } from "./harness.mts";
import {
  compareRemapStrategies,
  DEFAULT_REMAP_INPUT,
  DEFAULT_SHARD_PLAN_INPUT,
  planShards,
  type RemapInput,
  type ShardPlanInput,
} from "../lib/shard";

const EPS = 1e-6;

function withPlan(patch: Partial<ShardPlanInput>): ShardPlanInput {
  return { ...DEFAULT_SHARD_PLAN_INPUT, ...patch };
}

function withRemap(patch: Partial<RemapInput>): RemapInput {
  return { ...DEFAULT_REMAP_INPUT, ...patch };
}

export const checks: CheckSuite = (check) => {
  const flat = planShards(
    withPlan({ totalDataGb: 100, dailyGrowthGb: 0, shardCapacityGb: 50, replicaCount: 1, retentionDays: 30 }),
  );
  check(
    "sıfır artımla data həcmi bütün proqnozlarda 100GB qalır, 2 şard lazımdır (100/50)",
    flat.ok && flat.projections.every((p) => Math.abs(p.dataGb - 100) < EPS && p.shardsNeeded === 2),
    JSON.stringify(flat),
  );

  const plateau = planShards(
    withPlan({ totalDataGb: 0, dailyGrowthGb: 10, retentionDays: 10, shardCapacityGb: 100, replicaCount: 1 }),
  );
  check(
    "saxlama müddəti aşılandan sonra data həcmi platoya çatır: 1, 2 və 3 il eyni qiymətdir (0+10×10=100GB)",
    plateau.ok &&
      Math.abs(plateau.projections[1].dataGb - 100) < EPS &&
      Math.abs(plateau.projections[2].dataGb - 100) < EPS &&
      Math.abs(plateau.projections[3].dataGb - 100) < EPS,
    JSON.stringify(plateau),
  );

  const stillGrowing = planShards(
    withPlan({ totalDataGb: 0, dailyGrowthGb: 1, retentionDays: 10_000, shardCapacityGb: 100_000, replicaCount: 1 }),
  );
  check(
    "saxlama müddəti çox uzundursa (aşılmır) data həcmi hər proqnozda artmağa davam edir",
    stillGrowing.ok &&
      Math.abs(stillGrowing.projections[1].dataGb - 365) < EPS &&
      Math.abs(stillGrowing.projections[2].dataGb - 730) < EPS &&
      Math.abs(stillGrowing.projections[3].dataGb - 1095) < EPS,
    JSON.stringify(stillGrowing),
  );

  const withReplicas = planShards(withPlan({ totalDataGb: 200, dailyGrowthGb: 0, replicaCount: 3, shardCapacityGb: 50 }));
  check(
    "ümumi disk = data həcmi × replika sayı (200×3=600GB indi)",
    withReplicas.ok && Math.abs(withReplicas.projections[0].totalDiskGb - 600) < EPS,
    JSON.stringify(withReplicas),
  );

  const uneven = planShards(withPlan({ totalDataGb: 130, dailyGrowthGb: 0, shardCapacityGb: 50, replicaCount: 1 }));
  check(
    "bir şarda düşən orta yük şardın tutumunu keçmir (130GB/50GB → 3 şard, orta yük ≤ 50GB)",
    uneven.ok && uneven.projections[0].avgLoadPerShardGb <= 50 + EPS && uneven.projections[0].shardsNeeded === 3,
    JSON.stringify(uneven),
  );

  const negativeData = planShards(withPlan({ totalDataGb: -1 }));
  check("mənfi data həcmi xəta qaytarır, throw etmir", negativeData.ok === false, JSON.stringify(negativeData));

  const zeroRetention = planShards(withPlan({ retentionDays: 0 }));
  check("sıfır saxlama müddəti xəta qaytarır", zeroRetention.ok === false, JSON.stringify(zeroRetention));

  const zeroCapacity = planShards(withPlan({ shardCapacityGb: 0 }));
  check("sıfır şard tutumu xəta qaytarır (sıfıra bölmə qarşısı alınır)", zeroCapacity.ok === false, JSON.stringify(zeroCapacity));

  const fractionalReplicas = planShards(withPlan({ replicaCount: 2.5 }));
  check("tam ədəd olmayan replika sayı xəta qaytarır", fractionalReplicas.ok === false, JSON.stringify(fractionalReplicas));

  const known = compareRemapStrategies(withRemap({ oldShardCount: 12, newShardCount: 13, sampleKeyCount: 100 }));
  check(
    "bilinən cavab: 12→13 şard (aralarında ortaq bölən yoxdur), 100 açar — hash % N açarların böyük hissəsini köçürür (nəzəri dəyər 12/13≈92,3%)",
    known.ok && known.modMovedFraction > 0.7,
    JSON.stringify(known),
  );

  check(
    "eyni 12→13 keçiddə ardıcıl haşlama təxminən 1/13 (≈7,7%) açarı köçürür — hash % N-dən qat-qat az",
    known.ok && known.consistentMovedFraction < 0.25 && known.consistentMovedFraction < known.modMovedFraction,
    JSON.stringify(known),
  );

  const identity = compareRemapStrategies(withRemap({ oldShardCount: 8, newShardCount: 8, sampleKeyCount: 500 }));
  check(
    "şard sayı dəyişmirsə heç bir açar köçmür (hər iki üsulda 0)",
    identity.ok && identity.modMovedCount === 0 && identity.consistentMovedCount === 0,
    JSON.stringify(identity),
  );

  const zeroKeys = compareRemapStrategies(withRemap({ sampleKeyCount: 0 }));
  check("sıfır nümunə açar sayı xəta qaytarır", zeroKeys.ok === false, JSON.stringify(zeroKeys));

  const zeroShards = compareRemapStrategies(withRemap({ oldShardCount: 0 }));
  check("sıfır köhnə şard sayı xəta qaytarır", zeroShards.ok === false, JSON.stringify(zeroShards));
};
