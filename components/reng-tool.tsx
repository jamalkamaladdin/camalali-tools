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
  ToolStat,
} from "./ui";
import { ToolTabs, type ToolTabItem } from "./tabs";
import {
  checkContrast,
  formatHex,
  formatHsl,
  formatOklch,
  formatRgb,
  parseColor,
  simulateColorBlindness,
  type ColorBlindnessType,
  type ContrastResult,
  type ParsedColor,
  type Rgba,
} from "../lib/reng";

// #767676 on white is the deliberate default: it is the boundary case cited
// in the task itself (AA-normal at 4.54:1, no headroom), so the contrast tab
// opens already showing the exact thing a visitor came here to learn about.
const DEFAULT_SWATCH = "#2563eb";
const DEFAULT_TEXT = "#767676";
const DEFAULT_BACKGROUND = "#ffffff";
const OPAQUE_WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

const BLINDNESS_OPTIONS: { type: ColorBlindnessType; label: string }[] = [
  { type: "protanopia", label: "Protanopiya" },
  { type: "deuteranopia", label: "Deuteranopiya" },
  { type: "tritanopia", label: "Tritanopiya" },
];

function toCssColor(color: Rgba): string {
  const r = Math.round(color.r);
  const g = Math.round(color.g);
  const b = Math.round(color.b);
  return color.a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${color.a})`;
}

/*
 * A transparent colour has nothing to show against on its own — a plain
 * swatch would just read as the panel behind it. The checkerboard is the one
 * convention every image editor already uses for "this is see-through", so
 * alpha reads as alpha rather than as a rendering bug.
 */
const CHECKERBOARD_STYLE = {
  backgroundImage: "repeating-conic-gradient(#88888833 0% 25%, transparent 0% 50%)",
  backgroundSize: "12px 12px",
};

function ColorSwatch({ color, className }: { color: Rgba; className?: string }) {
  return (
    <div className={`overflow-hidden rounded border border-rule ${className ?? ""}`} style={CHECKERBOARD_STYLE}>
      <div className="h-full w-full" style={{ backgroundColor: toCssColor(color) }} />
    </div>
  );
}

/**
 * A text field that accepts any of the four formats, paired with a native
 * `<input type="color">` for the visitors who would rather drag a picker than
 * type a value. The picker only ever knows opaque 6-digit hex — that is the
 * one shape every browser's colour UI speaks — so it is fed the parsed
 * colour's hex with alpha dropped, never the raw text.
 */
function ColorPickerField({
  id,
  label,
  value,
  onChange,
  parsed,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  parsed: ParsedColor;
}) {
  const pickerValue = parsed.ok ? formatHex({ ...parsed.color, a: 1 }) : "#000000";
  return (
    <ToolField label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} — rəng seçici`}
          value={pickerValue}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded border border-rule bg-surface p-0.5 transition-colors duration-200 ease-out hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <ToolInput
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          placeholder="#rrggbb, rgb(), hsl(), oklch()"
          className="font-mono"
        />
      </div>
    </ToolField>
  );
}

function FormatRow({ label, value }: { label: string; value: string }) {
  return (
    <ToolResultPanel title={label} action={<CopyButton value={value} label={`${label} kopyala`} />}>
      <ToolOutput className="m-3">{value}</ToolOutput>
    </ToolResultPanel>
  );
}

function ConverterPanel() {
  const [input, setInput] = useState(DEFAULT_SWATCH);
  const parsed = useMemo(() => parseColor(input), [input]);

  return (
    <div className="space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Rəng" />
        <div className="p-4">
          <ColorPickerField id="reng-input" label="Rəng" value={input} onChange={setInput} parsed={parsed} />
          <p className="mt-1.5 font-ui text-[11px] text-muted">
            HEX (#rgb, #rrggbb, alfa ilə #rrggbbaa), rgb(), hsl() və ya oklch() yapışdırın.
          </p>
        </div>
      </ToolPanel>

      {!parsed.ok && (
        <ToolNote tone="accent" title="Rəng oxunmadı">
          {parsed.error}
        </ToolNote>
      )}

      {parsed.ok && (
        <div className="grid gap-5 lg:grid-cols-[160px_minmax(0,1fr)]">
          <ColorSwatch color={parsed.color} className="h-40 w-full lg:h-auto" />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormatRow label="HEX" value={formatHex(parsed.color)} />
            <FormatRow label="RGB" value={formatRgb(parsed.color)} />
            <FormatRow label="HSL" value={formatHsl(parsed.color)} />
            <FormatRow label="OKLCH" value={formatOklch(parsed.color)} />
          </div>
        </div>
      )}
    </div>
  );
}

function BlindnessPreview({
  type,
  label,
  text,
  background,
}: {
  type: ColorBlindnessType;
  label: string;
  text: Rgba;
  background: Rgba;
}) {
  const simulatedText = simulateColorBlindness(text, type);
  const simulatedBackground = simulateColorBlindness(background, type);
  return (
    <div className="space-y-1.5">
      <p className="font-ui text-[11px] text-muted">{label}</p>
      <div
        className="flex h-16 items-center justify-center rounded border border-rule font-ui text-sm font-semibold"
        style={{ backgroundColor: toCssColor(simulatedBackground), color: toCssColor(simulatedText) }}
      >
        Aa Ə
      </div>
    </div>
  );
}

const CONTRAST_STATS = [
  { key: "aaNormal", label: "AA · normal mətn" },
  { key: "aaLarge", label: "AA · böyük mətn" },
  { key: "aaaNormal", label: "AAA · normal mətn" },
  { key: "aaaLarge", label: "AAA · böyük mətn" },
] as const;

function ContrastPanel() {
  const [textInput, setTextInput] = useState(DEFAULT_TEXT);
  const [backgroundInput, setBackgroundInput] = useState(DEFAULT_BACKGROUND);

  const textParsed = useMemo(() => parseColor(textInput), [textInput]);
  const backgroundParsed = useMemo(() => parseColor(backgroundInput), [backgroundInput]);

  const result: ContrastResult | null = useMemo(() => {
    if (!textParsed.ok || !backgroundParsed.ok) return null;
    return checkContrast(textParsed.color, backgroundParsed.color);
  }, [textParsed, backgroundParsed]);

  const previewBackground = backgroundParsed.ok ? backgroundParsed.color : OPAQUE_WHITE;

  return (
    <div className="space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Mətn və fon" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <ColorPickerField
            id="reng-text"
            label="Mətn rəngi"
            value={textInput}
            onChange={setTextInput}
            parsed={textParsed}
          />
          <ColorPickerField
            id="reng-bg"
            label="Fon rəngi"
            value={backgroundInput}
            onChange={setBackgroundInput}
            parsed={backgroundParsed}
          />
        </div>
      </ToolPanel>

      {!textParsed.ok && (
        <ToolNote tone="accent" title="Mətn rəngi oxunmadı">
          {textParsed.error}
        </ToolNote>
      )}
      {!backgroundParsed.ok && (
        <ToolNote tone="accent" title="Fon rəngi oxunmadı">
          {backgroundParsed.error}
        </ToolNote>
      )}
      {result && !result.ok && (
        <ToolNote tone="accent" title="Kontrast hesablana bilmədi">
          {result.error}
        </ToolNote>
      )}

      {result && result.ok && (
        <>
          <div
            className="flex items-center justify-center rounded border border-rule p-8 font-ui text-lg font-semibold"
            style={{ backgroundColor: toCssColor(previewBackground), color: toCssColor(result.foreground) }}
          >
            Nümunə mətn — Aa Bb Əə
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <ToolStat
              label="Nisbət"
              value={`${result.verdict.ratio}:1`}
              tone={result.verdict.aaNormal ? "default" : "warning"}
            />
            {CONTRAST_STATS.map(({ key, label }) => {
              const passes = result.verdict[key];
              return (
                <ToolStat
                  key={key}
                  label={label}
                  value={passes ? "Keçir" : "Keçmir"}
                  tone={passes ? "default" : "warning"}
                />
              );
            })}
          </div>

          {result.suggestion && (
            <ToolNote tone="accent" title="AA normal mətn üçün nə qədər dəyişməli">
              Mətni {result.suggestion.deltaL} faiz xal{" "}
              {result.suggestion.direction === "tundlesdir" ? "tündləşdirin" : "açıqlaşdırın"} —
              məsələn <span className="font-mono">{formatHex(result.suggestion.color)}</span>.
            </ToolNote>
          )}
        </>
      )}

      {textParsed.ok && backgroundParsed.ok && (
        <ToolPanel>
          <ToolPanelHeader title="Rəng korluğu simulyasiyası" hint="seçilən cüt necə görünür" />
          <div className="grid gap-4 p-4 sm:grid-cols-3">
            {BLINDNESS_OPTIONS.map(({ type, label }) => (
              <BlindnessPreview
                key={type}
                type={type}
                label={label}
                text={textParsed.color}
                background={backgroundParsed.color}
              />
            ))}
          </div>
        </ToolPanel>
      )}
    </div>
  );
}

export function RengTool() {
  const tabs: ToolTabItem[] = [
    { id: "cevirici", label: "Çevirici", content: <ConverterPanel /> },
    { id: "kontrast", label: "Kontrast", content: <ContrastPanel /> },
  ];

  return (
    <div className="mt-8">
      <ToolTabs items={tabs} idPrefix="reng" />
    </div>
  );
}
