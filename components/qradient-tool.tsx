"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolButton, ToolField, ToolInput, ToolNote, ToolOutput, ToolPanel, ToolPanelHeader, ToolResultPanel } from "./ui";
import { ToolSegmented } from "./tabs";
import { addStop, buildGradient, removeStop, type GradientStop, type GradientType } from "../lib/qradient";

const TYPE_OPTIONS: { value: GradientType; label: string }[] = [
  { value: "linear", label: "xətti" },
  { value: "radial", label: "radial" },
  { value: "conic", label: "konus" },
];

const DEFAULT_STOPS: GradientStop[] = [
  { color: "#7c3aed", position: 0 },
  { color: "#06b6d4", position: 100 },
];

export function QradientTool() {
  const [type, setType] = useState<GradientType>("linear");
  const [angleDeg, setAngleDeg] = useState(135);
  const [centerX, setCenterX] = useState(50);
  const [centerY, setCenterY] = useState(50);
  const [stops, setStops] = useState<GradientStop[]>(DEFAULT_STOPS);

  const result = useMemo(
    () => buildGradient({ type, angleDeg, centerX, centerY, stops }),
    [type, angleDeg, centerX, centerY, stops],
  );

  const updateStop = (index: number, patch: Partial<GradientStop>) => {
    setStops((prev) => prev.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)));
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Növ" />
        <div className="p-4">
          <ToolSegmented options={TYPE_OPTIONS} value={type} onChange={setType} label="Gradient növü" fill />
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="İstiqamət" />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          {(type === "linear" || type === "conic") && (
            <ToolField label="Açı" hint="°" htmlFor="qradient-angle">
              <ToolInput
                id="qradient-angle"
                type="number"
                value={angleDeg}
                onChange={(e) => setAngleDeg(Number(e.target.value))}
              />
            </ToolField>
          )}
          {(type === "radial" || type === "conic") && (
            <>
              <ToolField label="Mərkəz X" hint="%" htmlFor="qradient-cx">
                <ToolInput
                  id="qradient-cx"
                  type="number"
                  min={0}
                  max={100}
                  value={centerX}
                  onChange={(e) => setCenterX(Number(e.target.value))}
                />
              </ToolField>
              <ToolField label="Mərkəz Y" hint="%" htmlFor="qradient-cy">
                <ToolInput
                  id="qradient-cy"
                  type="number"
                  min={0}
                  max={100}
                  value={centerY}
                  onChange={(e) => setCenterY(Number(e.target.value))}
                />
              </ToolField>
            </>
          )}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Dayanacaqlar"
          hint={`${stops.length}`}
          action={
            <ToolButton size="chip" onClick={() => setStops((prev) => addStop(prev))}>
              Əlavə et
            </ToolButton>
          }
        />
        <div className="space-y-3 p-4">
          {stops.map((stop, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`${index + 1}-ci dayanacağın rəngi`}
                value={/^#[0-9a-f]{6}$/i.test(stop.color) ? stop.color : "#000000"}
                onChange={(e) => updateStop(index, { color: e.target.value })}
                className="h-9 w-10 shrink-0 cursor-pointer rounded border border-rule bg-surface p-0.5"
              />
              <ToolInput
                aria-label={`${index + 1}-ci dayanacağın rəng kodu`}
                value={stop.color}
                onChange={(e) => updateStop(index, { color: e.target.value })}
                spellCheck={false}
                className="font-mono"
              />
              <ToolInput
                aria-label={`${index + 1}-ci dayanacağın faizi`}
                type="number"
                min={0}
                max={100}
                value={stop.position}
                onChange={(e) => updateStop(index, { position: Number(e.target.value) })}
                className="w-24 shrink-0"
              />
              <ToolButton
                size="chip"
                onClick={() => setStops((prev) => removeStop(prev, index))}
                disabled={stops.length <= 2}
              >
                Sil
              </ToolButton>
            </div>
          ))}
        </div>
      </ToolPanel>

      {result.ok ? (
        <>
          <ToolPanel>
            <ToolPanelHeader title="Önizləmə" />
            <div className="h-40 w-full" style={{ backgroundImage: result.css }} />
          </ToolPanel>

          <ToolResultPanel title="CSS" action={<CopyButton value={`background: ${result.css};`} label="background kopyala" />}>
            <ToolOutput className="m-3">{`background: ${result.css};`}</ToolOutput>
          </ToolResultPanel>
        </>
      ) : (
        <ToolNote tone="accent" title="Gradient qurula bilmədi">
          {result.error}
        </ToolNote>
      )}
    </div>
  );
}
