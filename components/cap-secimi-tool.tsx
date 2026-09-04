"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolTabs, type ToolTabItem } from "./tabs";
import {
  ToolButton,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
} from "./ui";
import {
  CONSISTENCY_MODELS,
  DEFAULT_CAP_ANSWERS,
  KNOWN_SYSTEMS,
  decideCapSide,
  formatCapReport,
  pacelcChoice,
  type CapAnswers,
  type CapReason,
  type CapResult,
} from "../lib/cap-secimi";

/*
 * Five answers score two additive functions in `lib/cap-secimi` —
 * this file only decides shape. The one layout choice worth writing down:
 * `irreversibleOps` is the single boolean among five otherwise-select
 * questions, and it is drawn as a two-way select rather than reached for a
 * checkbox primitive the tool layer does not have — a yes/no select keeps one
 * control language for the whole question list instead of two.
 */

const PARTITION_OPTIONS = [
  { value: "staleData", label: "Köhnə (bəlkə uyğunsuz) məlumatı qəbul edirəm" },
  { value: "returnError", label: "Xətanı üstün tuturam" },
] as const;

const WORKLOAD_OPTIONS = [
  { value: "readHeavy", label: "Oxu ağır" },
  { value: "writeHeavy", label: "Yazma ağır" },
  { value: "balanced", label: "Balanslı" },
] as const;

const GEOGRAPHY_OPTIONS = [
  { value: "singleRegion", label: "Tək region" },
  { value: "multiRegion", label: "Bir neçə region" },
] as const;

const IRREVERSIBLE_OPTIONS = [
  { value: "true", label: "Bəli: pul, sifariş, anbar kimi" },
  { value: "false", label: "Xeyr" },
] as const;

const LATENCY_OPTIONS = [
  { value: "tight", label: "Sıx: sorğu millisaniyələrlə ölçülür" },
  { value: "relaxed", label: "Kritik deyil" },
] as const;

const SIDE_LABEL: Record<CapResult["side"], string> = { CP: "CP — Consistency", AP: "AP — Availability" };

function ReasonRow({ reason, winningSide }: { reason: CapReason; winningSide: CapResult["side"] }) {
  const agrees = reason.side === winningSide;
  return (
    <li className={`border-l-2 py-2 pl-3 ${agrees ? "border-l-accent" : "border-l-rule"}`}>
      <span className="font-ui text-[11px] text-muted">
        {reason.side === "notr" ? "neytral" : reason.side}
      </span>
      <p className="mt-0.5 text-sm/6">{reason.text}</p>
    </li>
  );
}

export function CapSecimiTool() {
  const [answers, setAnswers] = useState<CapAnswers>(DEFAULT_CAP_ANSWERS);

  const result = useMemo(() => decideCapSide(answers), [answers]);
  const report = useMemo(() => formatCapReport(answers, result), [answers, result]);
  const pacelc = pacelcChoice(answers);

  const referenceTabs: ToolTabItem[] = [
    {
      id: "modeller",
      label: "Konsistentlik modelləri",
      content: (
        <ul className="divide-y divide-rule">
          {CONSISTENCY_MODELS.map((model) => (
            <li key={model.id} className="py-3 first:pt-0 last:pb-0">
              <p className="font-ui text-sm font-semibold">{model.label}</p>
              <p className="mt-1 text-sm/6 text-muted">{model.promise}</p>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "sistemler",
      label: "Tanınmış sistemlər",
      content: (
        <ul className="divide-y divide-rule">
          {KNOWN_SYSTEMS.map((system) => (
            <li key={system.name} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="font-ui text-sm font-semibold">{system.name}</p>
                <p className="mt-1 text-sm/6 text-muted">{system.note}</p>
              </div>
              <span
                className={`shrink-0 rounded-sm border px-2 py-0.5 font-ui text-[11px] ${
                  system.stance === result.side ? "border-accent" : "border-rule text-muted"
                }`}
              >
                {system.stance}
              </span>
            </li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <div className="@container">
      <div className="grid gap-4 @min-[52rem]:grid-cols-2 @min-[52rem]:items-start">
        <ToolPanel>
          <ToolPanelHeader
            title="Beş sual"
            action={
              <ToolButton size="chip" onClick={() => setAnswers(DEFAULT_CAP_ANSWERS)} disabled={answers === DEFAULT_CAP_ANSWERS}>
                Sıfırla
              </ToolButton>
            }
          />

          <div className="divide-y divide-rule px-3">
            <QuestionRow
              id="cap-partition"
              label="Şəbəkə bölünəndə"
              hint="CAP-ın özü budur"
              value={answers.partitionPreference}
              options={PARTITION_OPTIONS}
              onChange={(value) => setAnswers((prev) => ({ ...prev, partitionPreference: value as CapAnswers["partitionPreference"] }))}
            />
            <QuestionRow
              id="cap-irreversible"
              label="Dönməz əməliyyat varmı?"
              hint="pul, sifariş, anbar"
              value={String(answers.irreversibleOps)}
              options={IRREVERSIBLE_OPTIONS}
              onChange={(value) => setAnswers((prev) => ({ ...prev, irreversibleOps: value === "true" }))}
            />
            <QuestionRow
              id="cap-geography"
              label="Coğrafi paylanma"
              value={answers.geography}
              options={GEOGRAPHY_OPTIONS}
              onChange={(value) => setAnswers((prev) => ({ ...prev, geography: value as CapAnswers["geography"] }))}
            />
            <QuestionRow
              id="cap-latency"
              label="Gecikmə büdcəsi"
              value={answers.latencyBudget}
              options={LATENCY_OPTIONS}
              onChange={(value) => setAnswers((prev) => ({ ...prev, latencyBudget: value as CapAnswers["latencyBudget"] }))}
            />
            <QuestionRow
              id="cap-workload"
              label="Oxu-yazma nisbəti"
              value={answers.workload}
              options={WORKLOAD_OPTIONS}
              onChange={(value) => setAnswers((prev) => ({ ...prev, workload: value as CapAnswers["workload"] }))}
            />
          </div>
        </ToolPanel>

        <ToolPanel>
          <ToolPanelHeader
            title="Nəticə"
            hint={result.confidence}
            action={<CopyButton value={report} label="nəticəni kopyala" />}
          />

          <div className="space-y-4 p-3">
            <div className="flex items-baseline gap-3">
              <p className="font-ui text-2xl font-semibold">{SIDE_LABEL[result.side]}</p>
              <span className="text-ios-footnote text-muted tabular-nums">xal: {result.score}</span>
            </div>

            {result.tieBreak && (
              <ToolNote tone="accent" title="Bərabərlik">
                Beş cavab tam bərabərləşdi — nəticə dönməz əməliyyat cavabı ilə həll olundu:
                dönməz əməliyyat varsa CP, yoxdursa AP.
              </ToolNote>
            )}

            <ul className="divide-y divide-rule">
              {result.reasons.map((reason, index) => (
                <ReasonRow key={index} reason={reason} winningSide={result.side} />
              ))}
            </ul>

            <ToolNote title="Bölünmə yoxdursa (PACELC)">
              {pacelc === "EL"
                ? "Gecikmə büdcəsi sıx olduğu üçün adi gündə də gecikmə seçilir (EL) — konsensus gözləməkdən qaçınılır."
                : "Gecikmə kritik olmadığı üçün adi gündə konsistentlik seçilir (EC) — konsensus gözləməyə dəyər."}
            </ToolNote>
          </div>
        </ToolPanel>
      </div>

      <ToolResultPanel title="İstinad" className="mt-4" hint="statik cədvəllər">
        <div className="p-3">
          <ToolTabs idPrefix="cap-secimi-istinad" items={referenceTabs} />
        </div>
      </ToolResultPanel>
    </div>
  );
}

function QuestionRow<T extends string>({
  id,
  label,
  hint,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="font-ui text-xs font-semibold">
          {label}
        </label>
        {hint !== undefined && <p className="font-ui text-[11px]/5 text-muted">{hint}</p>}
      </div>
      <ToolSelect id={id} className="mt-2" value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </ToolSelect>
    </div>
  );
}
