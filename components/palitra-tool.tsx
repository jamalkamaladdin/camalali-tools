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
} from "./ui";
import { ToolTabs, type ToolTabItem } from "./tabs";
import {
  buildPaletteScale,
  formatCssVariables,
  formatHexList,
  formatTailwindTheme,
  type PaletteScale,
  type PaletteStep,
} from "../lib/palitra";
import { parseColor } from "../lib/reng";

const DEFAULT_COLOR = "#2563eb";
const DEFAULT_TOKEN = "brand";

/*
 * A checkerboard behind every swatch so a near-white step still reads as a
 * filled square rather than as a gap in the row — the same convention
 * `reng-tool.tsx` uses for its own swatch, kept here so the two colour tools
 * agree on what "this is a solid colour" looks like.
 */
const SWATCH_STYLE = {
  backgroundImage: "repeating-conic-gradient(#88888833 0% 25%, transparent 0% 50%)",
  backgroundSize: "10px 10px",
};

function Swatch({ step }: { step: PaletteStep }) {
  return (
    <div className="min-w-0 flex-1">
      <div
        className="aspect-square w-full overflow-hidden rounded border border-rule"
        style={SWATCH_STYLE}
      >
        <div className="h-full w-full" style={{ backgroundColor: step.hex }} />
      </div>
      <p className="mt-1 text-center text-ios-caption text-muted tabular-nums">{step.step}</p>
      <p className="text-center font-mono text-ios-caption2 text-muted">{step.hex}</p>
    </div>
  );
}

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

export function PalitraTool() {
  const [colorText, setColorText] = useState(DEFAULT_COLOR);
  const [tokenName, setTokenName] = useState(DEFAULT_TOKEN);
  const [hueShift, setHueShift] = useState(false);

  const parsed = useMemo(() => parseColor(colorText), [colorText]);

  const scaleResult = useMemo(() => {
    if (!parsed.ok) return null;
    return buildPaletteScale(parsed.color, { hueShift });
  }, [parsed, hueShift]);

  const safeToken = tokenName.trim() === "" ? DEFAULT_TOKEN : tokenName.trim();

  const scale: PaletteScale | null = scaleResult?.ok ? scaleResult.scale : null;

  const formatTabs: ToolTabItem[] = scale
    ? [
        {
          id: "tailwind",
          label: "Tailwind @theme",
          content: (
            <FormatOutput
              value={formatTailwindTheme(scale, safeToken)}
              copyLabel="@theme bloku kopyala"
            />
          ),
        },
        {
          id: "css",
          label: "CSS dəyişəni",
          content: (
            <FormatOutput
              value={formatCssVariables(scale, safeToken)}
              copyLabel="CSS dəyişənlərini kopyala"
            />
          ),
        },
        {
          id: "hex",
          label: "Düz HEX",
          content: <FormatOutput value={formatHexList(scale)} copyLabel="HEX siyahısını kopyala" />,
        },
      ]
    : [];

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Baza rəng" />
        <div className="grid grid-cols-1 gap-4 p-4 min-[36rem]:grid-cols-2">
          <ToolField label="Rəng" htmlFor="palitra-color" note="HEX, rgb(), hsl() və ya oklch()">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Rəng seçici"
                value={scale ? scale.baseHex : "#000000"}
                onChange={(event) => setColorText(event.target.value)}
                className="h-9 w-10 shrink-0 cursor-pointer rounded border border-rule bg-surface p-0.5 transition-colors duration-200 ease-out hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
              <ToolInput
                id="palitra-color"
                value={colorText}
                onChange={(event) => setColorText(event.target.value)}
                spellCheck={false}
                className="font-mono"
              />
            </div>
          </ToolField>
          <ToolField
            label="Token adı"
            htmlFor="palitra-token"
            note="Çıxışdakı dəyişən adının prefiksi, məsələn brand-500."
          >
            <ToolInput
              id="palitra-token"
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              spellCheck={false}
              placeholder={DEFAULT_TOKEN}
            />
          </ToolField>
        </div>
        <div className="flex items-center gap-2 border-t border-rule px-4 py-3">
          <button
            type="button"
            role="switch"
            aria-checked={hueShift}
            onClick={() => setHueShift((prev) => !prev)}
            className="ios-switch"
          />
          <label className="text-ios-subhead text-ink">
            Çalar sürüşməsi{" "}
            <span className="text-ios-footnote text-muted">
              (açıq uc bir az isti, tünd uc bir az soyuq olsun)
            </span>
          </label>
        </div>
      </ToolPanel>

      {!parsed.ok && <ToolNote tone="accent">{parsed.error}</ToolNote>}
      {scaleResult && !scaleResult.ok && <ToolNote tone="accent">{scaleResult.error}</ToolNote>}

      {scale && (
        <>
          <ToolResultPanel title="Şkala" hint="50 → 950">
            <div className="grid grid-cols-4 gap-2 p-4 min-[30rem]:grid-cols-6 min-[48rem]:grid-cols-11">
              {scale.steps.map((step) => (
                <Swatch key={step.step} step={step} />
              ))}
            </div>
          </ToolResultPanel>

          <ToolPanel>
            <ToolPanelHeader title="Kontrast" hint="ağ / qara fon üzərində WCAG nisbəti" />
            <div className="overflow-x-auto p-4">
              <table className="w-full border-collapse font-ui text-xs">
                <thead>
                  <tr className="border-b border-rule text-left text-muted">
                    <th scope="col" className="p-2 font-normal">
                      Pillə
                    </th>
                    <th scope="col" className="p-2 font-normal">
                      Ağ fonda
                    </th>
                    <th scope="col" className="p-2 font-normal">
                      Qara fonda
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scale.steps.map((step) => (
                    <tr key={step.step} className="border-b border-rule last:border-0">
                      <td className="p-2 tabular-nums">{step.step}</td>
                      <td className="p-2 tabular-nums">{step.contrastOnWhite.toFixed(2)}:1</td>
                      <td className="p-2 tabular-nums">{step.contrastOnBlack.toFixed(2)}:1</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ToolPanel>

          <ToolPanel>
            <ToolPanelHeader title="Çıxış" hint="üç format" />
            <div className="p-3">
              <ToolTabs items={formatTabs} idPrefix="palitra-format" />
            </div>
          </ToolPanel>
        </>
      )}
    </div>
  );
}
