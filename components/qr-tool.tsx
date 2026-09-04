"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolSegmented } from "./tabs";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
  ToolStat,
  ToolTextArea,
} from "./ui";
import {
  EC_RECOVERY,
  QUIET_ZONE,
  encodeQr,
  qrCapacity,
  qrPathData,
  qrSize,
  qrToSvg,
  readabilityWarning,
  type QrEcLevel,
} from "../lib/qr";

const EC_OPTIONS: { value: QrEcLevel; label: string }[] = [
  { value: "L", label: "L" },
  { value: "M", label: "M" },
  { value: "Q", label: "Q" },
  { value: "H", label: "H" },
];

const MODE_LABELS = {
  numeric: "rəqəm",
  alphanumeric: "alfanumerik",
  byte: "bayt (UTF-8)",
} as const;

/*
 * Three starting points that land in three different encoding modes, which is
 * the one thing about QR that surprises people: the same visible length can
 * produce a very different symbol. The Wi-Fi line is the format Android and
 * iOS both act on, and it is here because it is the request this tool gets
 * most often after a plain link.
 */
const SAMPLES: { label: string; value: string }[] = [
  { label: "Link", value: "https://camalali.com/aletler" },
  { label: "Wi-Fi", value: "WIFI:T:WPA;S:ofis-wifi;P:parol1234;;" },
  { label: "Mətn", value: "Salam! Əşya, çiçək, ödəniş, İsmayıllı — hamısı bir sətirdə." },
];

const DEFAULT_TEXT = SAMPLES[0].value;
const DEFAULT_DARK = "#000000";
const DEFAULT_LIGHT = "#ffffff";

const PNG_WIDTHS = [256, 512, 1024, 2048];

/** Versions worth showing in the capacity table: the jumps people care about. */
const CAPACITY_VERSIONS = [1, 5, 10, 20, 40];

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function QrTool() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [ecLevel, setEcLevel] = useState<QrEcLevel>("M");
  const [dark, setDark] = useState(DEFAULT_DARK);
  const [light, setLight] = useState(DEFAULT_LIGHT);
  const [pngWidth, setPngWidth] = useState(1024);

  /* The whole algorithm sits behind this one call; the component never touches
     a codeword or a mask itself. */
  const result = useMemo(() => encodeQr(text, { ecLevel }), [text, ecLevel]);
  const symbol = result.ok ? result : null;

  const warning = useMemo(() => readabilityWarning(dark, light), [dark, light]);

  const svg = useMemo(
    () => (symbol ? qrToSvg(symbol, { dark, light }) : ""),
    [symbol, dark, light],
  );

  const path = useMemo(() => (symbol ? qrPathData(symbol.modules) : ""), [symbol]);

  const side = symbol ? symbol.size + QUIET_ZONE * 2 : 0;
  // The PNG is a whole number of pixels per module or the edges alias: 1024 on
  // a 33-module symbol is 24.9 pixels each, and a rounded-down 24 leaves a
  // seam every fourth module. The real width is shown rather than the asked-for
  // one for the same reason.
  const pngScale = symbol ? Math.max(1, Math.round(pngWidth / side)) : 1;
  const pngActual = side * pngScale;

  const fileName = symbol ? `qr-v${symbol.version}-${symbol.ecLevel}` : "qr";

  const downloadSvg = () => {
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${fileName}.svg`);
  };

  const downloadPng = () => {
    if (!symbol) return;
    const canvas = document.createElement("canvas");
    canvas.width = pngActual;
    canvas.height = pngActual;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.fillStyle = light;
    context.fillRect(0, 0, pngActual, pngActual);
    context.fillStyle = dark;
    for (let row = 0; row < symbol.size; row++) {
      for (let col = 0; col < symbol.size; col++) {
        if (symbol.modules[row][col]) {
          context.fillRect(
            (col + QUIET_ZONE) * pngScale,
            (row + QUIET_ZONE) * pngScale,
            pngScale,
            pngScale,
          );
        }
      }
    }

    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${fileName}.png`);
    }, "image/png");
  };

  const resetColors = () => {
    setDark(DEFAULT_DARK);
    setLight(DEFAULT_LIGHT);
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="QR kod"
          action={
            <>
              <ToolSegmented
                label="Xəta düzəltmə səviyyəsi"
                options={EC_OPTIONS}
                value={ecLevel}
                onChange={setEcLevel}
              />
              <span className="font-ui text-[11px] tabular-nums text-muted">
                {EC_RECOVERY[ecLevel]}% bərpa
              </span>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Modul
                <span className="block w-11">
                  <ToolInputColor
                    value={dark}
                    onChange={setDark}
                    label="Modul rəngi"
                  />
                </span>
              </label>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Fon
                <span className="block w-11">
                  <ToolInputColor value={light} onChange={setLight} label="Fon rəngi" />
                </span>
              </label>
              <ToolButton size="chip" onClick={resetColors}>
                Rəngləri sıfırla
              </ToolButton>
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            <ToolField
              label="Mətn və ya link"
              htmlFor="qr-text"
              hint={
                symbol ? (
                  <span className="tabular-nums">
                    {symbol.usedBytes}/{symbol.capacityBytes} bayt
                  </span>
                ) : undefined
              }
              note="Boş sahə də etibarlı QR verir — sadəcə içində məlumat olmur."
              suffix={
                <span className="flex flex-wrap gap-1.5">
                  {SAMPLES.map((sample) => (
                    <ToolButton
                      key={sample.label}
                      size="chip"
                      onClick={() => setText(sample.value)}
                    >
                      {sample.label}
                    </ToolButton>
                  ))}
                </span>
              }
            >
              <ToolTextArea
                id="qr-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={4}
                spellCheck={false}
                placeholder="https://…"
              />
            </ToolField>

            {!result.ok && (
              <ToolNote tone="accent" title="QR qurulmadı">
                {result.error}
              </ToolNote>
            )}

            {warning && (
              <ToolNote
                tone={warning.severity === "bad" ? "accent" : "info"}
                title={warning.severity === "bad" ? "Bu rənglərlə oxunmur" : "Rənglərə diqqət"}
              >
                {warning.message}
              </ToolNote>
            )}

            {symbol && (
              <div className="grid grid-cols-2 gap-3">
                <ToolStat
                  label="Versiya"
                  value={`${symbol.version}`}
                  note={`${symbol.size}×${symbol.size} modul`}
                />
                <ToolStat label="Rejim" value={MODE_LABELS[symbol.mode]} />
                <ToolStat
                  label="Maska"
                  value={`${symbol.mask}`}
                  note={`8 variantın ən aşağı cəriməsi: ${symbol.penalties[symbol.mask]}`}
                />
                <ToolStat
                  label="Tünd modul"
                  value={`${Math.round((symbol.darkModules / (symbol.size * symbol.size)) * 100)}%`}
                  note="50%-ə yaxın olması yaxşıdır"
                />
              </div>
            )}
          </div>

          <ToolResultPanel
            title="QR"
            hint={symbol ? <span className="tabular-nums">{side}×{side}</span> : undefined}
            action={<CopyButton value={svg} label="SVG-ni kopyala" disabled={!symbol} />}
            className="min-w-0"
          >
            <div className="space-y-3 p-3">
              {symbol ? (
                <svg
                  viewBox={`0 0 ${side} ${side}`}
                  role="img"
                  aria-label={`QR kod, versiya ${symbol.version}, ${symbol.size} modul`}
                  shapeRendering="crispEdges"
                  className="mx-auto block h-auto w-full max-w-[260px]"
                >
                  <rect width={side} height={side} fill={light} />
                  <path fill={dark} d={path} />
                </svg>
              ) : (
                <p className="py-8 text-center font-ui text-sm text-muted">
                  QR burada görünəcək.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <ToolButton onClick={downloadSvg} disabled={!symbol}>
                  SVG endir
                </ToolButton>
                <ToolButton onClick={downloadPng} disabled={!symbol}>
                  PNG endir
                </ToolButton>
                <label className="flex items-center gap-1.5 font-ui text-[11px] text-muted">
                  Ölçü
                  <ToolSelect
                    aria-label="PNG eni"
                    value={pngWidth}
                    onChange={(event) => setPngWidth(Number(event.target.value))}
                    className="h-8 w-24 text-xs"
                  >
                    {PNG_WIDTHS.map((width) => (
                      <option key={width} value={width}>
                        {width} px
                      </option>
                    ))}
                  </ToolSelect>
                </label>
              </div>

              {symbol && (
                <p className="font-ui text-[11px] tabular-nums text-muted">
                  PNG: {pngActual}×{pngActual} px ({pngScale} px/modul). SVG ölçüsüzdür —
                  istənilən böyüklüyə itkisiz çıxır.
                </p>
              )}
            </div>
          </ToolResultPanel>
        </div>
      </ToolPanel>

      <ToolAccordion>
        <ToolAccordionItem
          summary="Versiyaya görə tutum"
          hint={`${ecLevel} səviyyəsi · rəqəm / alfanumerik / bayt`}
        >
          <div className="max-w-xl overflow-x-auto">
            <table className="w-full font-ui text-xs tabular-nums">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1.5 pr-4 font-normal">Versiya</th>
                  <th className="py-1.5 pr-4 font-normal">Modul</th>
                  <th className="py-1.5 pr-4 font-normal">Rəqəm</th>
                  <th className="py-1.5 pr-4 font-normal">Alfanumerik</th>
                  <th className="py-1.5 font-normal">Bayt</th>
                </tr>
              </thead>
              <tbody>
                {CAPACITY_VERSIONS.map((version) => (
                  <tr key={version} className="border-t border-rule">
                    <td className="py-1.5 pr-4">{version}</td>
                    <td className="py-1.5 pr-4 text-muted">
                      {qrSize(version)}×{qrSize(version)}
                    </td>
                    <td className="py-1.5 pr-4">{qrCapacity(version, ecLevel, "numeric")}</td>
                    <td className="py-1.5 pr-4">
                      {qrCapacity(version, ecLevel, "alphanumeric")}
                    </td>
                    <td className="py-1.5">{qrCapacity(version, ecLevel, "byte")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px]/5">
              Bayt sütunu simvol sayı deyil: azərbaycan hərfləri UTF-8-də 2 bayt tutur,
              ona görə «ə» ilə dolu mətn latın hərfli mətnin yarısı qədər sığır.
            </p>
          </div>
        </ToolAccordionItem>
      </ToolAccordion>
    </div>
  );
}

/**
 * A native colour swatch. `<input type="color">` is used rather than a hex
 * field on purpose — it always hands back a valid `#rrggbb`, so the readability
 * check downstream never has to deal with half-typed input like "#f".
 */
function ToolInputColor({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <input
      type="color"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full cursor-pointer border bg-surface p-0.5"
      style={{
        borderColor: "var(--field-border, var(--btn-border))",
        borderRadius: "var(--field-radius, var(--btn-radius))",
      }}
    />
  );
}
