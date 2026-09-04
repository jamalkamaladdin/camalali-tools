"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
} from "./ui";
import { ToolTabs, type ToolTabItem } from "./tabs";
import {
  buildTypeScale,
  formatCssVariables,
  formatTailwindFontSize,
  NAMED_RATIOS,
  type ScaleStep,
} from "../lib/tipoqrafiya";

const DEFAULT_BASE_PX = 16;
const DEFAULT_RATIO = 1.25;
const CUSTOM_RATIO_VALUE = "custom";

const SAMPLE_TEXT = "Sürətli qonur tülkü tənbəl iti tullanır";

function FormatOutput({ value, copyLabel }: { value: string; copyLabel: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <CopyButton value={value} label={copyLabel} />
      </div>
      <ToolOutput>{value}</ToolOutput>
    </div>
  );
}

function StepRow({ step }: { step: ScaleStep }) {
  return (
    <div className="grid grid-cols-[5rem_5rem_1fr] items-baseline gap-3 border-b border-rule py-3 last:border-0">
      <div>
        <p className="text-ios-footnote font-semibold text-muted">{step.name}</p>
        <p className="font-mono text-ios-caption text-muted tabular-nums">
          {step.px}px / {step.rem}rem
        </p>
      </div>
      <p className="text-ios-footnote text-muted tabular-nums">lh {step.lineHeight}</p>
      <p
        className="truncate text-ink"
        style={{ fontSize: `${step.px}px`, lineHeight: step.lineHeight }}
      >
        {SAMPLE_TEXT}
      </p>
    </div>
  );
}

export function TipoqrafiyaTool() {
  const [baseText, setBaseText] = useState(String(DEFAULT_BASE_PX));
  const [ratioChoice, setRatioChoice] = useState<string>(String(DEFAULT_RATIO));
  const [customRatioText, setCustomRatioText] = useState(String(DEFAULT_RATIO));

  const basePx = Number(baseText);
  const ratio =
    ratioChoice === CUSTOM_RATIO_VALUE ? Number(customRatioText) : Number(ratioChoice);

  const result = useMemo(() => buildTypeScale(basePx, ratio), [basePx, ratio]);

  const formatTabs: ToolTabItem[] = result.ok
    ? [
        {
          id: "css",
          label: "CSS dəyişəni",
          content: (
            <FormatOutput
              value={formatCssVariables(result.steps)}
              copyLabel="CSS dəyişənlərini kopyala"
            />
          ),
        },
        {
          id: "tailwind",
          label: "Tailwind fontSize",
          content: (
            <FormatOutput
              value={formatTailwindFontSize(result.steps)}
              copyLabel="fontSize blokunu kopyala"
            />
          ),
        },
      ]
    : [];

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Baza və nisbət" />
        <div className="grid grid-cols-1 gap-4 p-4 min-[36rem]:grid-cols-2">
          <ToolField label="Baza ölçü" htmlFor="tipo-base" suffix="px">
            <ToolInput
              id="tipo-base"
              type="number"
              inputMode="decimal"
              value={baseText}
              onChange={(event) => setBaseText(event.target.value)}
              className="tabular-nums"
            />
          </ToolField>
          <ToolField label="Nisbət" htmlFor="tipo-ratio">
            <ToolSelect
              id="tipo-ratio"
              value={ratioChoice}
              onChange={(event) => setRatioChoice(event.target.value)}
            >
              {NAMED_RATIOS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
              <option value={CUSTOM_RATIO_VALUE}>Öz ədədim</option>
            </ToolSelect>
          </ToolField>
          {ratioChoice === CUSTOM_RATIO_VALUE && (
            <ToolField label="Öz nisbətim" htmlFor="tipo-ratio-custom" className="min-[36rem]:col-span-2">
              <ToolInput
                id="tipo-ratio-custom"
                type="number"
                step="0.001"
                inputMode="decimal"
                value={customRatioText}
                onChange={(event) => setCustomRatioText(event.target.value)}
                className="tabular-nums"
              />
            </ToolField>
          )}
        </div>
      </ToolPanel>

      {!result.ok && <ToolNote tone="accent">{result.error}</ToolNote>}

      {result.ok && (
        <>
          <ToolResultPanel title="Şkala" hint="canlı nümunə ilə">
            <div className="px-4">
              {result.steps.map((step) => (
                <StepRow key={step.name} step={step} />
              ))}
            </div>
          </ToolResultPanel>

          <ToolPanel>
            <ToolPanelHeader title="Çıxış" hint="iki format" />
            <div className="p-3">
              <ToolTabs items={formatTabs} idPrefix="tipo-format" />
            </div>
          </ToolPanel>
        </>
      )}
    </div>
  );
}
