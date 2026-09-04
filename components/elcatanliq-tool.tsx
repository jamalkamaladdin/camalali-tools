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
  computeAllowedDowntime,
  computeSystemAvailability,
  formatDowntime,
  percentFromDowntime,
  PERIOD_LABELS,
  PERIODS,
  SLA_TIERS,
  type ComponentMode,
  type Period,
  type SystemComponent,
} from "../lib/elcatanliq";

function formatPercent(percent: number, digits = 3): string {
  return `${percent.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

let componentCounter = 0;
function nextComponentId(): string {
  componentCounter += 1;
  return `comp-${componentCounter}`;
}

const DEFAULT_COMPONENTS: SystemComponent[] = [
  { id: "comp-1", name: "Tətbiq serveri", percent: 99.95, mode: "ardicil" },
  { id: "comp-2", name: "Baza", percent: 99.9, mode: "ardicil" },
  { id: "comp-3", name: "Əsas CDN", percent: 99.99, mode: "paralel" },
  { id: "comp-4", name: "Ehtiyat CDN", percent: 99.9, mode: "paralel" },
];
componentCounter = DEFAULT_COMPONENTS.length;

export function ElcatanliqTool() {
  const idPrefix = useId();

  const [forwardPercentText, setForwardPercentText] = useState("99.9");
  const forwardPercent = Number(forwardPercentText.replace(",", "."));

  const [reverseMinutesText, setReverseMinutesText] = useState("43.8");
  const [reversePeriod, setReversePeriod] = useState<Period>("ay");
  const reverseMinutes = Number(reverseMinutesText.replace(",", "."));

  const [components, setComponents] = useState<SystemComponent[]>(DEFAULT_COMPONENTS);
  const nameCounter = useRef(components.length);

  const forwardResults = useMemo(
    () => PERIODS.map((period) => ({ period, result: computeAllowedDowntime(forwardPercent, period) })),
    [forwardPercent],
  );

  const reverseResult = useMemo(
    () => percentFromDowntime(reverseMinutes, reversePeriod),
    [reverseMinutes, reversePeriod],
  );

  const systemResult = useMemo(() => computeSystemAvailability(components), [components]);

  const updateComponent = (id: string, patch: Partial<SystemComponent>) => {
    setComponents((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeComponent = (id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  };
  const addComponent = () => {
    nameCounter.current += 1;
    setComponents((prev) => [
      ...prev,
      { id: nextComponentId(), name: `Komponent ${nameCounter.current}`, percent: 99.9, mode: "ardicil" },
    ]);
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolResultPanel title="SLA pillələri" hint={`${SLA_TIERS.length} səviyyə`}>
        <div className="overflow-x-auto p-4">
          <table className="w-full border-collapse font-ui text-xs">
            <thead>
              <tr className="border-b border-result-rule text-left text-muted">
                <th scope="col" className="p-2 font-normal">
                  Faiz
                </th>
                {PERIODS.map((period) => (
                  <th key={period} scope="col" className="p-2 text-right font-normal">
                    {PERIOD_LABELS[period]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLA_TIERS.map((tier) => (
                <tr key={tier} className="border-b border-result-rule last:border-0">
                  <td className="p-2 tabular-nums">{tier}%</td>
                  {PERIODS.map((period) => {
                    const downtime = computeAllowedDowntime(tier, period);
                    return (
                      <td key={period} className="p-2 text-right tabular-nums">
                        {downtime.ok ? formatDowntime(downtime.seconds) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ToolResultPanel>

      <ToolPanel>
        <ToolPanelHeader title="Faizdən dayanmaya" />
        <div className="p-4">
          <ToolField label="Əlçatanlıq faizi" htmlFor={`${idPrefix}-forward`} suffix="%">
            <ToolInput
              id={`${idPrefix}-forward`}
              inputMode="decimal"
              value={forwardPercentText}
              onChange={(event) => setForwardPercentText(event.target.value)}
            />
          </ToolField>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 pt-0 sm:grid-cols-4">
          {forwardResults.map(({ period, result }) => (
            <ToolStat
              key={period}
              label={PERIOD_LABELS[period]}
              value={result.ok ? formatDowntime(result.seconds) : "—"}
              note={result.ok ? undefined : result.error}
            />
          ))}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Dayanmadan faizə" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <ToolField label="Dayanma müddəti" htmlFor={`${idPrefix}-reverse`} suffix="dəqiqə">
            <ToolInput
              id={`${idPrefix}-reverse`}
              inputMode="decimal"
              value={reverseMinutesText}
              onChange={(event) => setReverseMinutesText(event.target.value)}
            />
          </ToolField>
          <div>
            <ToolLabel>Dövr</ToolLabel>
            <div className="mt-1.5">
              <ToolSegmented
                label="Dövr"
                value={reversePeriod}
                onChange={setReversePeriod}
                options={PERIODS.map((period) => ({ value: period, label: PERIOD_LABELS[period] }))}
              />
            </div>
          </div>
        </div>
        <div className="p-4 pt-0">
          {reverseResult.ok && reverseResult.percent !== undefined ? (
            <ToolStat label="Uyğun əlçatanlıq" value={formatPercent(reverseResult.percent)} />
          ) : (
            <ToolNote tone="accent">{reverseResult.ok ? "—" : reverseResult.error}</ToolNote>
          )}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Sistemin kompozisiyası"
          hint={`${components.length} komponent`}
          action={
            <ToolButton size="chip" onClick={addComponent}>
              + Komponent əlavə et
            </ToolButton>
          }
        />
        <div className="space-y-3 p-4">
          {components.map((component) => (
            <div
              key={component.id}
              className="grid grid-cols-1 items-end gap-2 border-b border-rule pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_120px_auto_auto]"
            >
              <ToolField label="Komponent" htmlFor={`${idPrefix}-${component.id}-name`}>
                <ToolInput
                  id={`${idPrefix}-${component.id}-name`}
                  value={component.name}
                  onChange={(event) => updateComponent(component.id, { name: event.target.value })}
                />
              </ToolField>
              <ToolField label="Faiz" htmlFor={`${idPrefix}-${component.id}-percent`} suffix="%">
                <ToolInput
                  id={`${idPrefix}-${component.id}-percent`}
                  inputMode="decimal"
                  value={component.percent}
                  onChange={(event) =>
                    updateComponent(component.id, { percent: Number(event.target.value.replace(",", ".")) })
                  }
                />
              </ToolField>
              <div>
                <ToolLabel>Rejim</ToolLabel>
                <div className="mt-1.5">
                  <ToolSegmented
                    label={`${component.name} üçün rejim`}
                    value={component.mode}
                    onChange={(mode: ComponentMode) => updateComponent(component.id, { mode })}
                    options={[
                      { value: "ardicil", label: "Ardıcıl" },
                      { value: "paralel", label: "Paralel" },
                    ]}
                  />
                </div>
              </div>
              <ToolButton size="chip" onClick={() => removeComponent(component.id)}>
                Sil
              </ToolButton>
            </div>
          ))}
        </div>
      </ToolPanel>

      {systemResult.ok ? (
        <ToolResultPanel title="Birləşmiş nəticə" hint={formatPercent(systemResult.combinedPercent)}>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            <ToolStat label="Birləşmiş əlçatanlıq" value={formatPercent(systemResult.combinedPercent)} />
            <ToolStat
              label="Zəif halqa"
              value={systemResult.weakestLink.name}
              note={formatPercent(systemResult.weakestLink.percent)}
              tone="warning"
            />
          </div>
          <div className="space-y-1 p-4 pt-0 text-ios-footnote text-muted">
            {systemResult.contributors.map((contributor) => (
              <p key={contributor.name}>
                {contributor.name}: {formatPercent(contributor.percent)}
              </p>
            ))}
          </div>
        </ToolResultPanel>
      ) : (
        <ToolNote tone="accent">{systemResult.error}</ToolNote>
      )}
    </div>
  );
}

