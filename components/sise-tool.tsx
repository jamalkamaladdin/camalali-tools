"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolField, ToolInput, ToolNote, ToolOutput, ToolPanel, ToolPanelHeader, ToolResultPanel } from "./ui";
import { buildGlass, type GlassInput } from "../lib/sise";

const DEFAULT_INPUT: GlassInput = {
  blur: 12,
  saturate: 180,
  backgroundHex: "#ffffff",
  backgroundOpacity: 0.15,
  borderHex: "#ffffff",
  borderOpacity: 0.3,
  borderWidth: 1,
  shadowBlur: 32,
  shadowOpacity: 0.2,
};

/*
 * A busy, colourful backdrop rather than the page's own surface: the whole
 * point of `backdrop-filter` is invisible on a flat single-colour ground —
 * the preview needs something behind the panel worth blurring.
 */
const PREVIEW_BACKDROP =
  "linear-gradient(135deg, #f97316 0%, #db2777 35%, #7c3aed 70%, #06b6d4 100%)";

function RangeField({
  id,
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <ToolField label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-full accent-[var(--color-accent)]"
      />
    </ToolField>
  );
}

export function SiseTool() {
  const [input, setInput] = useState<GlassInput>(DEFAULT_INPUT);

  const result = useMemo(() => buildGlass(input), [input]);

  const patch = (next: Partial<GlassInput>) => setInput((prev) => ({ ...prev, ...next }));

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Bulanıqlıq və doyma" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <RangeField
            id="sise-blur"
            label="Bulanıqlıq"
            hint={`${input.blur}px`}
            min={0}
            max={40}
            step={1}
            value={input.blur}
            onChange={(blur) => patch({ blur })}
          />
          <RangeField
            id="sise-saturate"
            label="Doyma"
            hint={`${input.saturate}%`}
            min={0}
            max={300}
            step={5}
            value={input.saturate}
            onChange={(saturate) => patch({ saturate })}
          />
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Fon" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <ToolField label="Rəng" htmlFor="sise-bg-color">
            <div className="flex items-center gap-2">
              <input
                id="sise-bg-color"
                type="color"
                aria-label="Fonun rəngi"
                value={/^#[0-9a-f]{6}$/i.test(input.backgroundHex) ? input.backgroundHex : "#ffffff"}
                onChange={(e) => patch({ backgroundHex: e.target.value })}
                className="h-9 w-10 shrink-0 cursor-pointer rounded border border-rule bg-surface p-0.5"
              />
              <ToolInput
                value={input.backgroundHex}
                onChange={(e) => patch({ backgroundHex: e.target.value })}
                spellCheck={false}
                className="font-mono"
              />
            </div>
          </ToolField>
          <RangeField
            id="sise-bg-opacity"
            label="Qatılıq"
            hint={`${Math.round(input.backgroundOpacity * 100)}%`}
            min={0}
            max={100}
            step={1}
            value={Math.round(input.backgroundOpacity * 100)}
            onChange={(percent) => patch({ backgroundOpacity: percent / 100 })}
          />
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Kənar və kölgə" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <ToolField label="Kənarın rəngi" htmlFor="sise-border-color">
            <div className="flex items-center gap-2">
              <input
                id="sise-border-color"
                type="color"
                aria-label="Kənarın rəngi"
                value={/^#[0-9a-f]{6}$/i.test(input.borderHex) ? input.borderHex : "#ffffff"}
                onChange={(e) => patch({ borderHex: e.target.value })}
                className="h-9 w-10 shrink-0 cursor-pointer rounded border border-rule bg-surface p-0.5"
              />
              <ToolInput
                value={input.borderHex}
                onChange={(e) => patch({ borderHex: e.target.value })}
                spellCheck={false}
                className="font-mono"
              />
            </div>
          </ToolField>
          <RangeField
            id="sise-border-opacity"
            label="Kənarın qatılığı"
            hint={`${Math.round(input.borderOpacity * 100)}%`}
            min={0}
            max={100}
            step={1}
            value={Math.round(input.borderOpacity * 100)}
            onChange={(percent) => patch({ borderOpacity: percent / 100 })}
          />
          <ToolField label="Kənarın qalınlığı" hint="px" htmlFor="sise-border-width">
            <ToolInput
              id="sise-border-width"
              type="number"
              min={0}
              value={input.borderWidth}
              onChange={(e) => patch({ borderWidth: Number(e.target.value) })}
            />
          </ToolField>
          <RangeField
            id="sise-shadow-blur"
            label="Kölgənin bulanıqlığı"
            hint={`${input.shadowBlur}px`}
            min={0}
            max={80}
            step={1}
            value={input.shadowBlur}
            onChange={(shadowBlur) => patch({ shadowBlur })}
          />
          <RangeField
            id="sise-shadow-opacity"
            label="Kölgənin qatılığı"
            hint={`${Math.round(input.shadowOpacity * 100)}%`}
            min={0}
            max={100}
            step={1}
            value={Math.round(input.shadowOpacity * 100)}
            onChange={(percent) => patch({ shadowOpacity: percent / 100 })}
          />
        </div>
      </ToolPanel>

      {result.ok ? (
        <>
          <ToolPanel>
            <ToolPanelHeader title="Önizləmə" />
            <div
              className="flex items-center justify-center p-12"
              style={{ backgroundImage: PREVIEW_BACKDROP }}
            >
              <div
                className="flex h-32 w-56 items-center justify-center rounded-lg text-ios-subhead font-medium"
                style={{
                  background: result.css.background,
                  backdropFilter: result.css.backdropFilter,
                  WebkitBackdropFilter: result.css.webkitBackdropFilter,
                  border: result.css.border,
                  boxShadow: result.css.boxShadow,
                  // Inline, not a token: the panel sits on an arbitrary gradient
                  // backdrop the visitor did not choose, the same reason
                  // reng-tool's swatches paint their own colour inline.
                  color: "#ffffff",
                }}
              >
                Şüşə panel
              </div>
            </div>
          </ToolPanel>

          <ToolResultPanel title="CSS" action={<CopyButton value={result.css.fullBlock} label="CSS kopyala" />}>
            <ToolOutput className="m-3">{result.css.fullBlock}</ToolOutput>
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
