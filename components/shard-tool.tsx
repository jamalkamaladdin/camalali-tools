"use client";

import { useId, useMemo, useState } from "react";
import {
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";
import {
  compareRemapStrategies,
  DEFAULT_REMAP_INPUT,
  DEFAULT_SHARD_PLAN_INPUT,
  planShards,
} from "../lib/shard";

function parseNumber(text: string): number {
  return Number(text.replace(",", "."));
}

function formatGb(gb: number): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)} TB`;
  return `${gb.toFixed(1)} GB`;
}

function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/* ---------- the hand-drawn moved-fraction comparison ---------- */

const CHART_WIDTH = 300;
const CHART_HEIGHT = 120;
const CHART_PAD = 28;
const BAR_GAP = 40;

function RemapBars({ modFraction, consistentFraction }: { modFraction: number; consistentFraction: number }) {
  const usableHeight = CHART_HEIGHT - 2 * CHART_PAD;
  const barWidth = 56;
  const modHeight = modFraction * usableHeight;
  const consistentHeight = consistentFraction * usableHeight;
  const modX = CHART_WIDTH / 2 - BAR_GAP / 2 - barWidth;
  const consistentX = CHART_WIDTH / 2 + BAR_GAP / 2;
  const baseY = CHART_HEIGHT - CHART_PAD;

  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full max-w-xs text-accent" aria-hidden>
      <line x1={CHART_PAD - 12} y1={baseY} x2={CHART_WIDTH - (CHART_PAD - 12)} y2={baseY} stroke="currentColor" className="text-muted-2" strokeWidth="1" />

      <rect x={modX} y={baseY - modHeight} width={barWidth} height={modHeight} fill="currentColor" className="text-muted-2" />
      <text x={modX + barWidth / 2} y={baseY - modHeight - 6} fontSize="11" textAnchor="middle" className="fill-ink" fontWeight={600}>
        {formatPercent(modFraction)}
      </text>
      <text x={modX + barWidth / 2} y={baseY + 14} fontSize="9" textAnchor="middle" className="fill-muted">
        hash % N
      </text>

      <rect x={consistentX} y={baseY - consistentHeight} width={barWidth} height={consistentHeight} fill="currentColor" />
      <text x={consistentX + barWidth / 2} y={baseY - consistentHeight - 6} fontSize="11" textAnchor="middle" className="fill-ink" fontWeight={600}>
        {formatPercent(consistentFraction)}
      </text>
      <text x={consistentX + barWidth / 2} y={baseY + 14} fontSize="9" textAnchor="middle" className="fill-muted">
        ardıcıl haşlama
      </text>
    </svg>
  );
}

export function ShardTool() {
  const idPrefix = useId();

  const [totalDataGb, setTotalDataGb] = useState(String(DEFAULT_SHARD_PLAN_INPUT.totalDataGb));
  const [dailyGrowthGb, setDailyGrowthGb] = useState(String(DEFAULT_SHARD_PLAN_INPUT.dailyGrowthGb));
  const [shardCapacityGb, setShardCapacityGb] = useState(String(DEFAULT_SHARD_PLAN_INPUT.shardCapacityGb));
  const [replicaCount, setReplicaCount] = useState(String(DEFAULT_SHARD_PLAN_INPUT.replicaCount));
  const [retentionDays, setRetentionDays] = useState(String(DEFAULT_SHARD_PLAN_INPUT.retentionDays));

  const [oldShardCount, setOldShardCount] = useState(String(DEFAULT_REMAP_INPUT.oldShardCount));
  const [newShardCount, setNewShardCount] = useState(String(DEFAULT_REMAP_INPUT.newShardCount));
  const [sampleKeyCount, setSampleKeyCount] = useState(String(DEFAULT_REMAP_INPUT.sampleKeyCount));

  const plan = useMemo(
    () =>
      planShards({
        totalDataGb: parseNumber(totalDataGb),
        dailyGrowthGb: parseNumber(dailyGrowthGb),
        shardCapacityGb: parseNumber(shardCapacityGb),
        replicaCount: Math.round(parseNumber(replicaCount)),
        retentionDays: parseNumber(retentionDays),
      }),
    [totalDataGb, dailyGrowthGb, shardCapacityGb, replicaCount, retentionDays],
  );

  const remap = useMemo(
    () =>
      compareRemapStrategies({
        oldShardCount: Math.round(parseNumber(oldShardCount)),
        newShardCount: Math.round(parseNumber(newShardCount)),
        sampleKeyCount: Math.round(parseNumber(sampleKeyCount)),
      }),
    [oldShardCount, newShardCount, sampleKeyCount],
  );

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Verilən həcmi və artım" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <ToolField label="Ümumi data həcmi" htmlFor={`${idPrefix}-total`} suffix="GB">
            <ToolInput id={`${idPrefix}-total`} inputMode="decimal" value={totalDataGb} onChange={(e) => setTotalDataGb(e.target.value)} />
          </ToolField>
          <ToolField label="Gündəlik artım" htmlFor={`${idPrefix}-growth`} suffix="GB/gün">
            <ToolInput id={`${idPrefix}-growth`} inputMode="decimal" value={dailyGrowthGb} onChange={(e) => setDailyGrowthGb(e.target.value)} />
          </ToolField>
          <ToolField label="Bir şardın tutumu" htmlFor={`${idPrefix}-capacity`} suffix="GB">
            <ToolInput id={`${idPrefix}-capacity`} inputMode="decimal" value={shardCapacityGb} onChange={(e) => setShardCapacityGb(e.target.value)} />
          </ToolField>
          <ToolField label="Replika sayı" htmlFor={`${idPrefix}-replicas`} suffix="nüsxə">
            <ToolInput id={`${idPrefix}-replicas`} inputMode="numeric" min={1} step={1} value={replicaCount} onChange={(e) => setReplicaCount(e.target.value)} />
          </ToolField>
          <ToolField
            label="Saxlama müddəti"
            htmlFor={`${idPrefix}-retention`}
            suffix="gün"
            note="Bu müddətdən köhnə data silindiyi fərz olunur: data həcmi bu müddət dolana qədər artır, sonra sabitləşir."
          >
            <ToolInput id={`${idPrefix}-retention`} inputMode="decimal" value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} />
          </ToolField>
        </div>
      </ToolPanel>

      {plan.ok ? (
        <ToolResultPanel title="Şard sayı proqnozu" hint={`${plan.projections[0].shardsNeeded} şard indi`}>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            {plan.projections.map((p) => (
              <ToolStat
                key={p.label}
                label={p.label}
                value={`${p.shardsNeeded} şard`}
                note={`${formatGb(p.dataGb)} · disk ${formatGb(p.totalDiskGb)}`}
              />
            ))}
          </div>
          <div className="p-4 pt-0">
            <ToolNote>
              Bir şarda düşən orta yük indi {formatGb(plan.projections[0].avgLoadPerShardGb)}-dir. Şard sayı yalnız
              tutum dolduqda artır: ona görə proqnozlar pilləli, hamar deyil.
            </ToolNote>
          </div>
        </ToolResultPanel>
      ) : (
        <ToolNote tone="accent">{plan.error}</ToolNote>
      )}

      <ToolPanel>
        <ToolPanelHeader title="Şard sayını dəyişəndə açarlar necə köçür" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <ToolField label="Köhnə şard sayı" htmlFor={`${idPrefix}-old`}>
            <ToolInput id={`${idPrefix}-old`} inputMode="numeric" min={1} step={1} value={oldShardCount} onChange={(e) => setOldShardCount(e.target.value)} />
          </ToolField>
          <ToolField label="Yeni şard sayı" htmlFor={`${idPrefix}-new`}>
            <ToolInput id={`${idPrefix}-new`} inputMode="numeric" min={1} step={1} value={newShardCount} onChange={(e) => setNewShardCount(e.target.value)} />
          </ToolField>
          <ToolField label="Nümunə açar sayı" htmlFor={`${idPrefix}-keys`} note="Simulyasiya üçün sintetik açar sayı: real data bazandakı konkret açarlar deyil.">
            <ToolInput id={`${idPrefix}-keys`} inputMode="numeric" min={1} step={100} value={sampleKeyCount} onChange={(e) => setSampleKeyCount(e.target.value)} />
          </ToolField>
        </div>
      </ToolPanel>

      {remap.ok ? (
        <ToolResultPanel title="Köçən açarların faizi" hint={`${remap.sampleKeyCount} açar`}>
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:items-center">
            <div className="grid grid-cols-2 gap-3">
              <ToolStat
                label="hash % N"
                value={formatPercent(remap.modMovedFraction)}
                note={`${remap.modMovedCount} açar köçdü`}
                tone="warning"
              />
              <ToolStat
                label="Ardıcıl haşlama"
                value={formatPercent(remap.consistentMovedFraction)}
                note={`${remap.consistentMovedCount} açar köçdü`}
              />
            </div>
            <RemapBars modFraction={remap.modMovedFraction} consistentFraction={remap.consistentMovedFraction} />
          </div>
        </ToolResultPanel>
      ) : (
        <ToolNote tone="accent">{remap.error}</ToolNote>
      )}
    </div>
  );
}
