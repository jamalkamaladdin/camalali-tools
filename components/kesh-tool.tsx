"use client";

import { useId, useMemo, useState } from "react";
import {
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
  computeCacheBudget,
  DEFAULT_CACHE_INPUT,
  type CacheAccessModel,
  type CacheInput,
  type CacheSizeMode,
} from "../lib/kesh";

const MODEL_OPTIONS: { value: CacheAccessModel; label: string }[] = [
  { value: "uniform", label: "Sadə (LRU, bərabər paylanma)" },
  { value: "zipf", label: "Zipf (populyar məzmun)" },
];

const SIZE_MODE_OPTIONS: { value: CacheSizeMode; label: string }[] = [
  { value: "items", label: "Element sayı" },
  { value: "mb", label: "MB" },
];

function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("az-AZ");
}

function formatKb(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
}

function formatLatency(ms: number): string {
  return `${ms.toFixed(2)} ms`;
}

function parseNumber(text: string): number {
  return Number(text.replace(",", "."));
}

export function KeshTool() {
  const idPrefix = useId();
  const [form, setForm] = useState({
    requestCount: String(DEFAULT_CACHE_INPUT.requestCount),
    uniqueKeyCount: String(DEFAULT_CACHE_INPUT.uniqueKeyCount),
    sizeMode: DEFAULT_CACHE_INPUT.sizeMode,
    cacheSizeItems: String(DEFAULT_CACHE_INPUT.cacheSizeItems),
    cacheSizeMb: String(DEFAULT_CACHE_INPUT.cacheSizeMb),
    avgItemSizeKb: String(DEFAULT_CACHE_INPUT.avgItemSizeKb),
    originLatencyMs: String(DEFAULT_CACHE_INPUT.originLatencyMs),
    cacheLatencyMs: String(DEFAULT_CACHE_INPUT.cacheLatencyMs),
    ttlSeconds: String(DEFAULT_CACHE_INPUT.ttlSeconds),
    model: DEFAULT_CACHE_INPUT.model,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const input: CacheInput = useMemo(
    () => ({
      requestCount: parseNumber(form.requestCount),
      uniqueKeyCount: parseNumber(form.uniqueKeyCount),
      sizeMode: form.sizeMode,
      cacheSizeItems: parseNumber(form.cacheSizeItems),
      cacheSizeMb: parseNumber(form.cacheSizeMb),
      avgItemSizeKb: parseNumber(form.avgItemSizeKb),
      originLatencyMs: parseNumber(form.originLatencyMs),
      cacheLatencyMs: parseNumber(form.cacheLatencyMs),
      ttlSeconds: parseNumber(form.ttlSeconds),
      model: form.model,
    }),
    [form],
  );

  const result = useMemo(() => computeCacheBudget(input), [input]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Trafik və keş ölçüsü" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <ToolField label="Sorğu sayı" htmlFor={`${idPrefix}-requests`}>
            <ToolInput
              id={`${idPrefix}-requests`}
              inputMode="decimal"
              value={form.requestCount}
              onChange={(event) => set("requestCount", event.target.value)}
            />
          </ToolField>
          <ToolField label="Unikal açar sayı" htmlFor={`${idPrefix}-unique`}>
            <ToolInput
              id={`${idPrefix}-unique`}
              inputMode="decimal"
              value={form.uniqueKeyCount}
              onChange={(event) => set("uniqueKeyCount", event.target.value)}
            />
          </ToolField>
          <div>
            <ToolLabel>Keş ölçüsü necə verilir</ToolLabel>
            <div className="mt-1.5">
              <ToolSegmented
                label="Keş ölçüsü rejimi"
                value={form.sizeMode}
                onChange={(value) => set("sizeMode", value)}
                options={SIZE_MODE_OPTIONS}
              />
            </div>
          </div>
          {form.sizeMode === "items" ? (
            <ToolField label="Keş ölçüsü" htmlFor={`${idPrefix}-size-items`} suffix="element">
              <ToolInput
                id={`${idPrefix}-size-items`}
                inputMode="decimal"
                value={form.cacheSizeItems}
                onChange={(event) => set("cacheSizeItems", event.target.value)}
              />
            </ToolField>
          ) : (
            <ToolField label="Keş ölçüsü" htmlFor={`${idPrefix}-size-mb`} suffix="MB">
              <ToolInput
                id={`${idPrefix}-size-mb`}
                inputMode="decimal"
                value={form.cacheSizeMb}
                onChange={(event) => set("cacheSizeMb", event.target.value)}
              />
            </ToolField>
          )}
          <ToolField label="Orta element ölçüsü" htmlFor={`${idPrefix}-item-size`} suffix="KB">
            <ToolInput
              id={`${idPrefix}-item-size`}
              inputMode="decimal"
              value={form.avgItemSizeKb}
              onChange={(event) => set("avgItemSizeKb", event.target.value)}
            />
          </ToolField>
          <div>
            <ToolLabel>Hit nisbəti modeli</ToolLabel>
            <div className="mt-1.5">
              <ToolSegmented
                label="Hit nisbəti modeli"
                value={form.model}
                onChange={(value) => set("model", value)}
                options={MODEL_OPTIONS}
              />
            </div>
          </div>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Gecikmə və TTL" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <ToolField label="Mənbədən oxuma" htmlFor={`${idPrefix}-origin-latency`} suffix="ms">
            <ToolInput
              id={`${idPrefix}-origin-latency`}
              inputMode="decimal"
              value={form.originLatencyMs}
              onChange={(event) => set("originLatencyMs", event.target.value)}
            />
          </ToolField>
          <ToolField label="Keşdən oxuma" htmlFor={`${idPrefix}-cache-latency`} suffix="ms">
            <ToolInput
              id={`${idPrefix}-cache-latency`}
              inputMode="decimal"
              value={form.cacheLatencyMs}
              onChange={(event) => set("cacheLatencyMs", event.target.value)}
            />
          </ToolField>
          <ToolField label="TTL" htmlFor={`${idPrefix}-ttl`} suffix="saniyə">
            <ToolInput
              id={`${idPrefix}-ttl`}
              inputMode="decimal"
              value={form.ttlSeconds}
              onChange={(event) => set("ttlSeconds", event.target.value)}
            />
          </ToolField>
        </div>
        <div className="p-4 pt-0">
          <ToolNote>
            TTL yalnız bir şeyi idarə edir: mənbədəki dəyər dəyişəndən sonra keşin nə qədər müddət köhnə cavabı verə
            biləcəyini. Qısa TTL bu riski azaldır və mənbəyə düşən yükü artırır; uzun TTL əksinədir.
          </ToolNote>
        </div>
      </ToolPanel>

      {result.ok ? (
        <ToolResultPanel title="Nəticə" hint={formatPercent(result.hitRatio)}>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <ToolStat
              label="Hit nisbəti"
              value={formatPercent(result.hitRatio)}
              note={result.model === "uniform" ? "sadə model" : "Zipf modeli"}
            />
            <ToolStat label="Miss nisbəti" value={formatPercent(result.missRatio)} />
            <ToolStat label="Orta gecikmə" value={formatLatency(result.avgLatencyMs)} />
            <ToolStat
              label="Mənbəyə düşən yük"
              value={`−${result.originLoadReductionPercent.toFixed(1)}%`}
              note={`${formatCount(result.originRequestsBefore)} → ${formatCount(result.originRequestsAfter)} sorğu`}
            />
            <ToolStat
              label="İstifadə olunan tutum"
              value={`${formatCount(result.effectiveCapacityItems)} / ${formatCount(result.capacityItems)}`}
              note="unikal açar / keş tutumu"
            />
            <ToolStat
              label="Bütün açarlar üçün lazım olan yaddaş"
              value={formatKb(result.memoryForAllUniqueKb)}
              note="100%-ə yaxın hit nisbəti üçün"
            />
          </div>
        </ToolResultPanel>
      ) : (
        <ToolNote tone="accent">{result.error}</ToolNote>
      )}
    </div>
  );
}
