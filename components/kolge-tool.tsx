"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
} from "./ui";
import { buildBoxShadow, parseBoxShadow, type ShadowInput } from "../lib/kolge";

const DEFAULT_SHADOW: ShadowInput = {
  offsetX: 0,
  offsetY: 4,
  blur: 12,
  spread: 0,
  colorHex: "#000000",
  opacity: 0.25,
  inset: false,
};

/*
 * Every numeric field is kept as a string while the visitor is typing — a
 * bare `Number()` state would force "-" and an empty field back to `0` on
 * every keystroke, which makes typing a negative offset impossible. The
 * conversion to a real number, and the check for whether that conversion
 * even worked, happens once at the point `buildBoxShadow` is called.
 */
function toNumber(raw: string): number {
  return raw.trim() === "" ? Number.NaN : Number(raw);
}

export function KolgeTool() {
  const [offsetX, setOffsetX] = useState(String(DEFAULT_SHADOW.offsetX));
  const [offsetY, setOffsetY] = useState(String(DEFAULT_SHADOW.offsetY));
  const [blur, setBlur] = useState(String(DEFAULT_SHADOW.blur));
  const [spread, setSpread] = useState(String(DEFAULT_SHADOW.spread));
  const [colorHex, setColorHex] = useState(DEFAULT_SHADOW.colorHex);
  const [opacityPercent, setOpacityPercent] = useState(String(Math.round(DEFAULT_SHADOW.opacity * 100)));
  const [inset, setInset] = useState(DEFAULT_SHADOW.inset);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const input: ShadowInput = useMemo(
    () => ({
      offsetX: toNumber(offsetX),
      offsetY: toNumber(offsetY),
      blur: toNumber(blur),
      spread: toNumber(spread),
      colorHex,
      opacity: toNumber(opacityPercent) / 100,
      inset,
    }),
    [offsetX, offsetY, blur, spread, colorHex, opacityPercent, inset],
  );

  const result = useMemo(() => buildBoxShadow(input), [input]);

  const applyPaste = () => {
    const parsed = parseBoxShadow(pasteText);
    if (!parsed.ok) {
      setPasteError(parsed.error);
      return;
    }
    setPasteError(null);
    setOffsetX(String(parsed.value.offsetX));
    setOffsetY(String(parsed.value.offsetY));
    setBlur(String(parsed.value.blur));
    setSpread(String(parsed.value.spread));
    setColorHex(parsed.value.colorHex);
    setOpacityPercent(String(Math.round(parsed.value.opacity * 100)));
    setInset(parsed.value.inset);
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Kölgə" hint={inset ? "daxili" : "xarici"} />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <ToolField label="Üfüqi ofset" hint="px" htmlFor="kolge-x">
            <ToolInput id="kolge-x" type="number" value={offsetX} onChange={(e) => setOffsetX(e.target.value)} />
          </ToolField>
          <ToolField label="Şaquli ofset" hint="px" htmlFor="kolge-y">
            <ToolInput id="kolge-y" type="number" value={offsetY} onChange={(e) => setOffsetY(e.target.value)} />
          </ToolField>
          <ToolField label="Bulanıqlıq" hint="px, ≥0" htmlFor="kolge-blur">
            <ToolInput id="kolge-blur" type="number" min={0} value={blur} onChange={(e) => setBlur(e.target.value)} />
          </ToolField>
          <ToolField label="Yayılma" hint="px" htmlFor="kolge-spread">
            <ToolInput id="kolge-spread" type="number" value={spread} onChange={(e) => setSpread(e.target.value)} />
          </ToolField>
          <ToolField label="Rəng" htmlFor="kolge-color">
            <div className="flex items-center gap-2">
              <input
                id="kolge-color"
                type="color"
                aria-label="Kölgənin rəngi"
                value={/^#[0-9a-f]{6}$/i.test(colorHex) ? colorHex : "#000000"}
                onChange={(e) => setColorHex(e.target.value)}
                className="h-9 w-10 shrink-0 cursor-pointer rounded border border-rule bg-surface p-0.5"
              />
              <ToolInput
                value={colorHex}
                onChange={(e) => setColorHex(e.target.value)}
                spellCheck={false}
                className="font-mono"
                placeholder="#rrggbb"
              />
            </div>
          </ToolField>
          <ToolField label="Qatılıq" hint={`${opacityPercent || 0}%`} htmlFor="kolge-opacity">
            {/* Native range: `.ios-segmented` draws switches, not sliders — `accent-color`
                is what ties this to the site's accent the way the subnet tool's prefix
                slider does. */}
            <input
              id="kolge-opacity"
              type="range"
              min={0}
              max={100}
              step={1}
              value={opacityPercent}
              onChange={(e) => setOpacityPercent(e.target.value)}
              className="h-9 w-full accent-[var(--color-accent)]"
            />
          </ToolField>
        </div>
        <div className="flex items-center gap-2 border-t border-rule px-4 py-3">
          <ToolButton size="chip" selected={inset} onClick={() => setInset((prev) => !prev)}>
            inset
          </ToolButton>
          <p className="text-ios-footnote text-muted">Kölgəni elementin içinə çəkir.</p>
        </div>
      </ToolPanel>

      {result.ok ? (
        <>
          <ToolPanel>
            <ToolPanelHeader title="Önizləmə" />
            <div className="flex items-center justify-center bg-[color-mix(in_srgb,var(--color-surface)_88%,var(--color-ink))] p-12">
              <div
                className="size-28 rounded-lg bg-surface"
                style={{ boxShadow: result.css }}
              />
            </div>
          </ToolPanel>

          <ToolResultPanel
            title="CSS"
            action={<CopyButton value={`box-shadow: ${result.css};`} label="box-shadow kopyala" />}
          >
            <ToolOutput className="m-3">{`box-shadow: ${result.css};`}</ToolOutput>
          </ToolResultPanel>
        </>
      ) : (
        <ToolNote tone="accent" title="Kölgə hesablana bilmədi">
          {result.error}
        </ToolNote>
      )}

      <ToolPanel>
        <ToolPanelHeader title="Mövcud sətri yapışdır" hint="qiymətləri doldurur" />
        <div className="space-y-3 p-4">
          <ToolField label="box-shadow sətri" htmlFor="kolge-paste">
            <ToolInput
              id="kolge-paste"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              spellCheck={false}
              className="font-mono"
              placeholder="0px 4px 12px 0px rgba(0, 0, 0, 0.25)"
            />
          </ToolField>
          <ToolButton onClick={applyPaste}>Tətbiq et</ToolButton>
          {pasteError && (
            <ToolNote tone="accent" title="Oxunmadı">
              {pasteError}
            </ToolNote>
          )}
        </div>
      </ToolPanel>
    </div>
  );
}
