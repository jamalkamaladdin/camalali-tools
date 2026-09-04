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
  captureProbabilityAtLeastOne,
  computeLogBudget,
  computeSamplingImpact,
  DEFAULT_LOG_BUDGET_INPUT,
  SAMPLING_PRESETS,
  type LogLevel,
} from "../lib/log-budcesi";

const LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];

function parseNumber(text: string): number {
  return Number(text.replace(",", "."));
}

function formatGb(gb: number): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)} TB`;
  if (gb < 1) return `${(gb * 1024).toFixed(1)} MB`;
  return `${gb.toFixed(2)} GB`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function LogBudcesiTool() {
  const idPrefix = useId();

  const [requestsPerSecond, setRequestsPerSecond] = useState(String(DEFAULT_LOG_BUDGET_INPUT.requestsPerSecond));
  const [linesPerRequest, setLinesPerRequest] = useState(String(DEFAULT_LOG_BUDGET_INPUT.linesPerRequest));
  const [avgLineBytes, setAvgLineBytes] = useState(String(DEFAULT_LOG_BUDGET_INPUT.avgLineBytes));
  const [retentionDays, setRetentionDays] = useState(String(DEFAULT_LOG_BUDGET_INPUT.retentionDays));
  const [compressionRatio, setCompressionRatio] = useState(String(DEFAULT_LOG_BUDGET_INPUT.compressionRatio));
  const [indexOverheadPercent, setIndexOverheadPercent] = useState(String(DEFAULT_LOG_BUDGET_INPUT.indexOverheadPercent));
  const [replicaCount, setReplicaCount] = useState(String(DEFAULT_LOG_BUDGET_INPUT.replicaCount));
  const [levelText, setLevelText] = useState<Record<LogLevel, string>>({
    DEBUG: String(DEFAULT_LOG_BUDGET_INPUT.levelPercents.DEBUG),
    INFO: String(DEFAULT_LOG_BUDGET_INPUT.levelPercents.INFO),
    WARN: String(DEFAULT_LOG_BUDGET_INPUT.levelPercents.WARN),
    ERROR: String(DEFAULT_LOG_BUDGET_INPUT.levelPercents.ERROR),
  });
  const [occurrenceCount, setOccurrenceCount] = useState("5");

  const levelPercents = useMemo(
    () => ({
      DEBUG: parseNumber(levelText.DEBUG),
      INFO: parseNumber(levelText.INFO),
      WARN: parseNumber(levelText.WARN),
      ERROR: parseNumber(levelText.ERROR),
    }),
    [levelText],
  );

  const levelSum = LEVELS.reduce((sum, level) => sum + (Number.isFinite(levelPercents[level]) ? levelPercents[level] : 0), 0);

  const result = useMemo(
    () =>
      computeLogBudget({
        requestsPerSecond: parseNumber(requestsPerSecond),
        linesPerRequest: parseNumber(linesPerRequest),
        avgLineBytes: parseNumber(avgLineBytes),
        retentionDays: parseNumber(retentionDays),
        compressionRatio: parseNumber(compressionRatio),
        indexOverheadPercent: parseNumber(indexOverheadPercent),
        replicaCount: Math.round(parseNumber(replicaCount)),
        levelPercents,
      }),
    [requestsPerSecond, linesPerRequest, avgLineBytes, retentionDays, compressionRatio, indexOverheadPercent, replicaCount, levelPercents],
  );

  const samplingRows = useMemo(() => {
    if (!result.ok) return [];
    return SAMPLING_PRESETS.map((percent) => {
      const impact = computeSamplingImpact(result.rawGbOverRetention, percent);
      const captureAtLeastOne = captureProbabilityAtLeastOne(percent, Math.round(parseNumber(occurrenceCount)));
      return { percent, impact, captureAtLeastOne };
    });
  }, [result, occurrenceCount]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Trafik" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <ToolField label="Sorğu/saniyə" htmlFor={`${idPrefix}-rps`}>
            <ToolInput id={`${idPrefix}-rps`} inputMode="decimal" value={requestsPerSecond} onChange={(e) => setRequestsPerSecond(e.target.value)} />
          </ToolField>
          <ToolField label="Sorğuya düşən sətir" htmlFor={`${idPrefix}-lines`} suffix="sətir">
            <ToolInput id={`${idPrefix}-lines`} inputMode="decimal" value={linesPerRequest} onChange={(e) => setLinesPerRequest(e.target.value)} />
          </ToolField>
          <ToolField label="Orta sətir ölçüsü" htmlFor={`${idPrefix}-bytes`} suffix="bayt">
            <ToolInput id={`${idPrefix}-bytes`} inputMode="decimal" value={avgLineBytes} onChange={(e) => setAvgLineBytes(e.target.value)} />
          </ToolField>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Saxlama, sıxılma, replikasiya" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <ToolField label="Saxlama müddəti" htmlFor={`${idPrefix}-retention`} suffix="gün">
            <ToolInput id={`${idPrefix}-retention`} inputMode="decimal" value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} />
          </ToolField>
          <ToolField label="Sıxılma nisbəti" htmlFor={`${idPrefix}-compression`} suffix=": 1">
            <ToolInput id={`${idPrefix}-compression`} inputMode="decimal" value={compressionRatio} onChange={(e) => setCompressionRatio(e.target.value)} />
          </ToolField>
          <ToolField label="İndeks əlavə yükü" htmlFor={`${idPrefix}-index`} suffix="%">
            <ToolInput id={`${idPrefix}-index`} inputMode="decimal" value={indexOverheadPercent} onChange={(e) => setIndexOverheadPercent(e.target.value)} />
          </ToolField>
          <ToolField label="Replika sayı" htmlFor={`${idPrefix}-replicas`} suffix="nüsxə">
            <ToolInput id={`${idPrefix}-replicas`} inputMode="numeric" min={1} step={1} value={replicaCount} onChange={(e) => setReplicaCount(e.target.value)} />
          </ToolField>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Səviyyə üzrə bölgü" hint={`${levelSum.toFixed(1)}/100`} />
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          {LEVELS.map((level) => (
            <ToolField key={level} label={level} htmlFor={`${idPrefix}-level-${level}`} suffix="%">
              <ToolInput
                id={`${idPrefix}-level-${level}`}
                inputMode="decimal"
                value={levelText[level]}
                onChange={(e) => setLevelText((prev) => ({ ...prev, [level]: e.target.value }))}
              />
            </ToolField>
          ))}
        </div>
        {Math.abs(levelSum - 100) > 0.01 && (
          <div className="p-4 pt-0">
            <ToolNote tone="accent">Faizlərin cəmi 100 olmalıdır: indi {levelSum.toFixed(1)}.</ToolNote>
          </div>
        )}
      </ToolPanel>

      {result.ok ? (
        <>
          <ToolResultPanel title="Həcm" hint={formatGb(result.rawGbPerDay) + "/gün"}>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              <ToolStat label="Xam, GB/gün" value={formatGb(result.rawGbPerDay)} />
              <ToolStat label="Xam, GB/ay" value={formatGb(result.rawGbPerMonth)} note="30 günlük yaxınlaşma" />
              <ToolStat label="Xam, saxlama müddətində" value={formatGb(result.rawGbOverRetention)} />
              <ToolStat label="Sıxılmış, saxlama müddətində" value={formatGb(result.compressedGbOverRetention)} />
              <ToolStat label="İndeksli, saxlama müddətində" value={formatGb(result.indexedGbOverRetention)} />
              <ToolStat
                label="Replikalarla ümumi disk"
                value={formatGb(result.totalWithReplicasGb)}
                tone="accent"
                note={`${replicaCount} nüsxə`}
              />
            </div>
          </ToolResultPanel>

          <ToolResultPanel title="Səviyyə üzrə həcm" hint="GB/gün">
            <div className="space-y-2 p-4">
              {LEVELS.map((level) => (
                <div key={level} className="flex items-center justify-between gap-3 text-ios-subhead">
                  <span className="text-ink">{level}</span>
                  <span className="tabular-nums text-muted">
                    {formatGb(result.levelGbPerDay[level])} · {formatPercent(levelPercents[level])}
                  </span>
                </div>
              ))}
            </div>
            <div className="p-4 pt-0">
              <ToolStat
                label="DEBUG söndürülməsinin qazancı"
                value={formatGb(result.debugSavingsGbOverRetention)}
                note="saxlama müddəti + sıxılma + indeks + replika ilə, saxlama müddəti üzrə"
                tone="accent"
              />
            </div>
          </ToolResultPanel>

          <ToolResultPanel title="Nümunələmə (sampling)" hint="1% / 10% / 50%">
            <div className="p-4">
              <ToolField
                label="Nadir hadisə neçə dəfə baş verib"
                htmlFor={`${idPrefix}-occurrences`}
                suffix="dəfə (saxlama müddətində)"
                note="Aşağıdakı 'ən azı biri tutulur' sütunu bu sayda müstəqil hadisədən heç olmasa birinin nümunəyə düşmə ehtimalını göstərir."
              >
                <ToolInput id={`${idPrefix}-occurrences`} inputMode="numeric" min={0} step={1} value={occurrenceCount} onChange={(e) => setOccurrenceCount(e.target.value)} />
              </ToolField>
            </div>
            <div className="overflow-x-auto px-4 pb-4">
              <table className="w-full border-collapse font-ui text-xs">
                <thead>
                  <tr className="border-b border-result-rule text-left text-muted">
                    <th scope="col" className="p-2 font-normal">Nümunələmə</th>
                    <th scope="col" className="p-2 font-normal">Həcm</th>
                    <th scope="col" className="p-2 font-normal">Azalma</th>
                    <th scope="col" className="p-2 font-normal">Tək hadisə tutulur</th>
                    <th scope="col" className="p-2 font-normal">Ən azı biri tutulur</th>
                  </tr>
                </thead>
                <tbody>
                  {samplingRows.map(({ percent, impact, captureAtLeastOne }) => (
                    <tr key={percent} className="border-b border-result-rule align-top last:border-0">
                      <td className="p-2 tabular-nums">{percent}%</td>
                      <td className="p-2 tabular-nums">{impact.ok ? formatGb(impact.volumeGb) : ""}</td>
                      <td className="p-2 tabular-nums">{impact.ok ? formatPercent(impact.volumeReductionPercent) : ""}</td>
                      <td className="p-2 tabular-nums">{impact.ok ? formatPercent(impact.captureProbabilitySingleEvent * 100) : ""}</td>
                      <td className="p-2 tabular-nums">{formatPercent(captureAtLeastOne * 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-4">
              <ToolNote>
                Nümunələmə hər hadisəni müstəqil ehtimalla saxlayır: az sayda təkrarlanan nadir hadisələr aşağı
                nümunələmə faizində demək olar ki, görünmür, tez-tez təkrarlanan hadisələr isə hələ də tutulur.
              </ToolNote>
            </div>
          </ToolResultPanel>
        </>
      ) : (
        <ToolNote tone="accent">{result.error}</ToolNote>
      )}
    </div>
  );
}
