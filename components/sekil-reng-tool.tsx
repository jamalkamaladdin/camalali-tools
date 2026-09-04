"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { formatNumber } from "../shared/format";
import { formatHex, formatHsl, formatRgb, type Rgba } from "../lib/reng";
import { computeTargetDimensions, isSupportedImageMime, type Dimensions } from "../lib/sekil";
import {
  averageColor,
  buildCssVariableBlock,
  extractPalette,
  lightestAndDarkest,
  type PaletteColor,
} from "../lib/sekil-reng";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";

/*
 * Palette extraction is entirely offscreen-canvas work — `sekil-reng.ts`
 * holds the median-cut maths and knows nothing of `Image` or
 * `HTMLCanvasElement`, so all of that plumbing lives here instead. The one
 * decision worth stating out loud: the image is sampled from a small
 * downscaled copy (`SAMPLE_MAX_DIMENSION` on the longer side), not the
 * full-resolution original — a photo can be tens of millions of pixels, and
 * a few thousand sampled pixels already describe its colour distribution
 * closely enough for a palette, at a fraction of the cost.
 */

const SAMPLE_MAX_DIMENSION = 150;
const MIN_PALETTE_COUNT = 2;
const MAX_PALETTE_COUNT = 16;
const DEFAULT_PALETTE_COUNT = 6;

type Status = "idle" | "processing" | "done" | "error";

function clampPaletteCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PALETTE_COUNT;
  return Math.min(MAX_PALETTE_COUNT, Math.max(MIN_PALETTE_COUNT, Math.round(value)));
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Şəkil açılmadı — fayl zədəli və ya format dəstəklənmir."));
    image.src = src;
  });
}

export function SekilRengTool() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [originalDimensions, setOriginalDimensions] = useState<Dimensions | null>(null);
  const [sampleDimensions, setSampleDimensions] = useState<Dimensions | null>(null);
  const [paletteCount, setPaletteCount] = useState(DEFAULT_PALETTE_COUNT);
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  const [average, setAverage] = useState<Rgba | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // The downscaled pixel data lives in a ref, not state: changing how many
  // swatches to extract should re-run `extractPalette` on the same sample
  // rather than re-decoding and redrawing the source image.
  const pixelDataRef = useRef<Uint8ClampedArray | null>(null);

  // A load in flight must not let an older file's result land after a newer
  // one — the same guard `sekil-tool.tsx` uses for its per-item encodes.
  const generationRef = useRef(0);

  const previewUrlRef = useRef(previewUrl);
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  function applyResults(pixels: Uint8ClampedArray, count: number) {
    setPalette(extractPalette(pixels, count));
    setAverage(averageColor(pixels));
  }

  async function loadFile(selected: File) {
    if (!isSupportedImageMime(selected.type)) {
      setError("Fayl şəkil formatında deyil (və ya brauzer onu tanımadı) — başqa fayl seç.");
      return;
    }

    generationRef.current += 1;
    const myGeneration = generationRef.current;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(selected);

    setFile(selected);
    setPreviewUrl(url);
    setStatus("processing");
    setError(null);
    setPalette([]);
    setAverage(null);
    setOriginalDimensions(null);
    setSampleDimensions(null);
    pixelDataRef.current = null;

    try {
      const image = await loadImageElement(url);
      if (generationRef.current !== myGeneration) return;

      const original: Dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      const sample = computeTargetDimensions(original, {
        maxWidth: SAMPLE_MAX_DIMENSION,
        maxHeight: SAMPLE_MAX_DIMENSION,
      });

      const canvas = document.createElement("canvas");
      canvas.width = sample.width;
      canvas.height = sample.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D kontekst alınmadı — brauzer canvas-ı dəstəkləmir.");
      context.drawImage(image, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;

      pixelDataRef.current = pixels;
      setOriginalDimensions(original);
      setSampleDimensions(sample);
      setStatus("done");
      applyResults(pixels, paletteCount);
    } catch (err) {
      if (generationRef.current !== myGeneration) return;
      setStatus("error");
      setError(err instanceof Error ? err.message : "Naməlum xəta baş verdi.");
    }
  }

  function onPaletteCountChange(event: ChangeEvent<HTMLInputElement>) {
    const next = clampPaletteCount(Number(event.target.value));
    setPaletteCount(next);
    if (pixelDataRef.current) setPalette(extractPalette(pixelDataRef.current, next));
  }

  function clearAll() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setStatus("idle");
    setError(null);
    setPalette([]);
    setAverage(null);
    setOriginalDimensions(null);
    setSampleDimensions(null);
    pixelDataRef.current = null;
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) loadFile(selected);
    // Clearing the value lets the same file be re-selected later — without
    // this, choosing the identical file twice in a row fires no change event.
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0];
    if (selected) loadFile(selected);
  }

  const ranked = palette.length > 0 ? lightestAndDarkest(palette) : null;
  const cssBlock = palette.length > 0 ? buildCssVariableBlock(palette) : "";
  const averageHex = average ? formatHex(average) : null;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Şəkil rəngi"
          hint={palette.length > 0 ? `${palette.length} rəng` : undefined}
          action={
            <>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Rəng sayı
                <ToolInput
                  type="number"
                  min={MIN_PALETTE_COUNT}
                  max={MAX_PALETTE_COUNT}
                  value={paletteCount}
                  onChange={onPaletteCountChange}
                  className="h-8 w-16 px-2 text-xs"
                />
              </label>
              <ToolButton size="chip" onClick={clearAll} disabled={!file}>
                Sil
              </ToolButton>
            </>
          }
        />

        <div className="space-y-4 p-4">
          <ToolNote>
            Şəkil serverə göndərilmir — açma, kiçildilmiş nüsxənin çəkilməsi və rəng hesablaması
            tamamilə brauzerdə, canvas ilə aparılır.
          </ToolNote>

          <div className="relative">
            <input
              id="sekil-reng-file-input"
              type="file"
              accept="image/*"
              className="peer sr-only"
              onChange={onInputChange}
            />
            <label
              htmlFor="sekil-reng-file-input"
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded border-2 border-dashed px-4 py-8 text-center transition-colors duration-200 ease-out hover:border-accent hover:bg-hover peer-focus-visible:border-accent peer-focus-visible:bg-hover ${
                isDragging ? "border-accent bg-hover" : "border-rule"
              }`}
            >
              <span className="font-ui text-sm">Şəkil seç və ya bura sürüşdür</span>
              <span className="font-ui text-xs text-muted">JPEG · PNG · WebP · GIF · BMP — bir şəkil</span>
            </label>
          </div>

          {error && <ToolNote tone="accent">{error}</ToolNote>}
          {status === "processing" && <p className="font-ui text-xs text-muted">emal olunur…</p>}

          {file && previewUrl && originalDimensions && (
            <div className="flex flex-wrap items-center gap-4">
              {/* Data-driven image content, not site chrome — a plain <img> is correct here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt=""
                className="h-20 w-20 rounded border border-rule object-cover"
              />
              <div className="space-y-1">
                <p className="max-w-xs truncate font-mono text-sm">{file.name}</p>
                <p className="font-ui text-[11px] text-muted tabular-nums">
                  {originalDimensions.width}×{originalDimensions.height}
                </p>
                {sampleDimensions && (
                  <p className="font-ui text-[11px] text-muted">
                    Rənglər {sampleDimensions.width}×{sampleDimensions.height} piksellik kiçildilmiş
                    nüsxədən hesablanıb.
                  </p>
                )}
              </div>
            </div>
          )}

          {palette.length > 0 && (
            <ToolResultPanel title="Palitra" hint={`${palette.length} rəng`}>
              <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4">
                {palette.map((color, index) => (
                  <SwatchCard key={`${color.hex}-${index}`} color={color} />
                ))}
              </div>
            </ToolResultPanel>
          )}

          {average && averageHex && ranked && (
            <div className="grid gap-3 sm:grid-cols-3">
              <ToolStat label="Orta rəng" value={<SwatchValue hex={averageHex} />} note={formatRgb(average)} />
              <ToolStat
                label="Ən açıq"
                value={<SwatchValue hex={ranked.lightest.hex} />}
                note={`L ${formatNumber(ranked.lightest.hsl.l, 1)}%`}
              />
              <ToolStat
                label="Ən tünd"
                value={<SwatchValue hex={ranked.darkest.hex} />}
                note={`L ${formatNumber(ranked.darkest.hsl.l, 1)}%`}
              />
            </div>
          )}

          {cssBlock && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <ToolLabel>CSS dəyişən bloku</ToolLabel>
                <CopyButton value={cssBlock} label="Bloku kopyala" />
              </div>
              <ToolOutput>{cssBlock}</ToolOutput>
            </div>
          )}
        </div>
      </ToolPanel>
    </div>
  );
}

function SwatchValue({ hex }: { hex: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        style={{ backgroundColor: hex }}
        className="inline-block size-4 shrink-0 rounded-sm border border-rule"
      />
      <span className="font-mono text-sm">{hex}</span>
    </span>
  );
}

function SwatchCard({ color }: { color: PaletteColor }) {
  return (
    <div data-surface="result" className="overflow-hidden rounded border border-result-rule">
      <div
        aria-hidden
        style={{ backgroundColor: color.hex }}
        className="h-16 w-full border-b border-result-rule"
      />
      <div className="space-y-1 p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs">{color.hex}</span>
          <CopyButton value={color.hex} label="Kopyala" />
        </div>
        <p className="font-ui text-[11px] text-muted tabular-nums">{formatRgb(color.rgb)}</p>
        <p className="font-ui text-[11px] text-muted tabular-nums">{formatHsl(color.rgb)}</p>
        <p className="font-ui text-[11px] text-muted tabular-nums">
          {formatNumber(color.sharePercent, 1)}%
        </p>
      </div>
    </div>
  );
}
