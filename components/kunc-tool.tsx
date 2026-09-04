"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolButton, ToolField, ToolInput, ToolNote, ToolOutput, ToolPanel, ToolPanelHeader, ToolResultPanel } from "./ui";
import { ToolSegmented } from "./tabs";
import { buildBorderRadius, type CornerRadius, type RadiusUnit } from "../lib/kunc";

const CORNER_LABELS = [
  { key: "topLeft" as const, label: "Yuxarı-sol" },
  { key: "topRight" as const, label: "Yuxarı-sağ" },
  { key: "bottomRight" as const, label: "Aşağı-sağ" },
  { key: "bottomLeft" as const, label: "Aşağı-sol" },
];

const UNIT_OPTIONS: { value: RadiusUnit; label: string }[] = [
  { value: "px", label: "px" },
  { value: "%", label: "%" },
];

const DEFAULT_CORNER: CornerRadius = { horizontal: 16, vertical: 16 };

type Corners = Record<(typeof CORNER_LABELS)[number]["key"], CornerRadius>;

const DEFAULT_CORNERS: Corners = {
  topLeft: { ...DEFAULT_CORNER },
  topRight: { ...DEFAULT_CORNER },
  bottomRight: { ...DEFAULT_CORNER },
  bottomLeft: { ...DEFAULT_CORNER },
};

export function KuncTool() {
  const [unit, setUnit] = useState<RadiusUnit>("px");
  const [corners, setCorners] = useState<Corners>(DEFAULT_CORNERS);

  const result = useMemo(() => buildBorderRadius({ ...corners, unit }), [corners, unit]);

  const updateCorner = (key: keyof Corners, axis: keyof CornerRadius, value: number) => {
    setCorners((prev) => ({ ...prev, [key]: { ...prev[key], [axis]: value } }));
  };

  const applyToAll = (key: keyof Corners) => {
    const source = corners[key];
    setCorners({
      topLeft: { ...source },
      topRight: { ...source },
      bottomRight: { ...source },
      bottomLeft: { ...source },
    });
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Vahid" />
        <div className="p-4">
          <ToolSegmented options={UNIT_OPTIONS} value={unit} onChange={setUnit} label="Radius vahidi" />
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Künclər" hint="üfüqi / şaquli" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          {CORNER_LABELS.map(({ key, label }) => (
            <div key={key} className="space-y-2 rounded border border-rule p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-ios-footnote text-muted">{label}</p>
                <ToolButton size="chip" onClick={() => applyToAll(key)}>
                  hamısına tətbiq et
                </ToolButton>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ToolField label="Üfüqi" htmlFor={`${key}-h`}>
                  <ToolInput
                    id={`${key}-h`}
                    type="number"
                    min={0}
                    value={corners[key].horizontal}
                    onChange={(e) => updateCorner(key, "horizontal", Number(e.target.value))}
                  />
                </ToolField>
                <ToolField label="Şaquli" htmlFor={`${key}-v`}>
                  <ToolInput
                    id={`${key}-v`}
                    type="number"
                    min={0}
                    value={corners[key].vertical}
                    onChange={(e) => updateCorner(key, "vertical", Number(e.target.value))}
                  />
                </ToolField>
              </div>
            </div>
          ))}
        </div>
      </ToolPanel>

      {result.ok ? (
        <>
          <ToolPanel>
            <ToolPanelHeader title="Önizləmə" />
            <div className="flex items-center justify-center bg-[color-mix(in_srgb,var(--color-surface)_88%,var(--color-ink))] p-12">
              <div className="h-28 w-40 bg-accent" style={{ borderRadius: result.css }} />
            </div>
          </ToolPanel>

          <ToolResultPanel
            title="CSS"
            hint={result.collapsed ? "yığılmış" : "tam forma"}
            action={<CopyButton value={`border-radius: ${result.css};`} label="border-radius kopyala" />}
          >
            <ToolOutput className="m-3">{`border-radius: ${result.css};`}</ToolOutput>
          </ToolResultPanel>
        </>
      ) : (
        <ToolNote tone="accent" title="Hesablana bilmədi">
          {result.error}
        </ToolNote>
      )}
    </div>
  );
}
