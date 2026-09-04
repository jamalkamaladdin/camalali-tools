"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";
import { ToolSegmented } from "./tabs";
import {
  computeLatencyBudget,
  DEFAULT_STAGES,
  DEFAULT_TARGET_BUDGET_MS,
  formatHumanScale,
  LATENCY_REFERENCE,
  LATENCY_REFERENCE_SOURCE,
  LATENCY_REFERENCE_YEAR,
  nsToMs,
  nsToUs,
  type BudgetStage,
  type BudgetStageMode,
} from "../lib/gecikme";

function formatNs(ns: number): string {
  if (ns < 1_000) return `${ns} ns`;
  if (ns < 1_000_000) return `${Number(nsToUs(ns).toFixed(1))} µs`;
  return `${Number(nsToMs(ns).toFixed(2))} ms`;
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (Math.abs(ms) < 10) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}

let stageCounter = 0;
function nextStageId(): string {
  stageCounter += 1;
  return `stage-${stageCounter}`;
}

export function GecikmeTool() {
  const idPrefix = useId();
  const [stages, setStages] = useState<BudgetStage[]>(DEFAULT_STAGES);
  const [targetText, setTargetText] = useState(String(DEFAULT_TARGET_BUDGET_MS));
  const nameFieldCounter = useRef(0);

  const targetBudgetMs = Number(targetText.replace(",", "."));

  const result = useMemo(() => computeLatencyBudget(stages, targetBudgetMs), [stages, targetBudgetMs]);

  const updateStage = (id: string, patch: Partial<BudgetStage>) => {
    setStages((prev) => prev.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)));
  };

  const removeStage = (id: string) => {
    setStages((prev) => prev.filter((stage) => stage.id !== id));
  };

  const addStage = () => {
    nameFieldCounter.current += 1;
    setStages((prev) => [
      ...prev,
      { id: nextStageId(), name: `Mərhələ ${nameFieldCounter.current}`, ms: 10, mode: "ardicil" },
    ]);
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Bilinən gecikmə rəqəmləri" hint={`${LATENCY_REFERENCE_YEAR}-ci il`} />
        <div className="overflow-x-auto p-4">
          <table className="w-full border-collapse font-ui text-xs">
            <thead>
              <tr className="border-b border-rule text-left text-muted">
                <th scope="col" className="p-2 font-normal">
                  Nə
                </th>
                <th scope="col" className="p-2 font-normal text-right">
                  Vaxt
                </th>
                <th scope="col" className="p-2 font-normal text-right">
                  İnsan miqyası
                </th>
              </tr>
            </thead>
            <tbody>
              {LATENCY_REFERENCE.map((row) => (
                <tr key={row.id} className="border-b border-rule last:border-0">
                  <td className="p-2">{row.name}</td>
                  <td className="p-2 text-right tabular-nums">{formatNs(row.ns)}</td>
                  <td className="p-2 text-right tabular-nums text-muted">{formatHumanScale(row.ns)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-rule p-4">
          <ToolNote>{LATENCY_REFERENCE_SOURCE}</ToolNote>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Büdcə qurucusu"
          hint={`${stages.length} mərhələ`}
          action={
            <ToolButton size="chip" onClick={addStage}>
              + Mərhələ əlavə et
            </ToolButton>
          }
        />
        <div className="space-y-3 p-4">
          {stages.map((stage) => (
            <div
              key={stage.id}
              className="grid grid-cols-1 items-end gap-2 border-b border-rule pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_120px_auto_auto]"
            >
              <ToolField label="Mərhələ" htmlFor={`${idPrefix}-${stage.id}-name`}>
                <ToolInput
                  id={`${idPrefix}-${stage.id}-name`}
                  value={stage.name}
                  onChange={(event) => updateStage(stage.id, { name: event.target.value })}
                />
              </ToolField>
              <ToolField label="Millisaniyə" htmlFor={`${idPrefix}-${stage.id}-ms`}>
                <ToolInput
                  id={`${idPrefix}-${stage.id}-ms`}
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={stage.ms}
                  onChange={(event) => updateStage(stage.id, { ms: Number(event.target.value) })}
                />
              </ToolField>
              <div>
                <ToolLabel>Rejim</ToolLabel>
                <div className="mt-1.5">
                  <ToolSegmented
                    label={`${stage.name} üçün rejim`}
                    value={stage.mode}
                    onChange={(mode: BudgetStageMode) => updateStage(stage.id, { mode })}
                    options={[
                      { value: "ardicil", label: "Ardıcıl" },
                      { value: "paralel", label: "Paralel" },
                    ]}
                  />
                </div>
              </div>
              <ToolButton size="chip" onClick={() => removeStage(stage.id)}>
                Sil
              </ToolButton>
            </div>
          ))}
        </div>
        <div className="border-t border-rule p-4">
          <ToolField label="Hədəf büdcə" htmlFor={`${idPrefix}-target`} suffix="ms">
            <ToolInput
              id={`${idPrefix}-target`}
              type="number"
              min={0}
              inputMode="decimal"
              value={targetText}
              onChange={(event) => setTargetText(event.target.value)}
            />
          </ToolField>
        </div>
      </ToolPanel>

      {result.ok ? (
        <ToolResultPanel title="Nəticə" hint={formatMs(result.totalMs)}>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <ToolStat label="Ümumi gecikmə" value={formatMs(result.totalMs)} />
            <ToolStat label="Ardıcıl hissə" value={formatMs(result.sequentialMs)} />
            <ToolStat label="Paralel qrupun payı" value={formatMs(result.parallelMs)} />
            <ToolStat
              label="Ən ağır mərhələ"
              value={result.heaviestStage.name}
              note={`${formatMs(result.heaviestStage.ms)} — cəmin ${result.heaviestSharePercent.toFixed(1)}%-i`}
            />
            <ToolStat
              label="Hədəflə fərq"
              tone={result.isOverBudget ? "warning" : "default"}
              value={
                result.isOverBudget
                  ? `+${formatMs(result.overBudgetMs)}`
                  : `−${formatMs(Math.abs(result.overBudgetMs))}`
              }
              note={
                result.isOverBudget
                  ? `Hədəfi ${result.overBudgetPercent.toFixed(1)}% aşır`
                  : `Hədəfdən ${Math.abs(result.overBudgetPercent).toFixed(1)}% aşağıdır`
              }
            />
          </div>
        </ToolResultPanel>
      ) : (
        <ToolNote tone="accent">{result.error}</ToolNote>
      )}
    </div>
  );
}
