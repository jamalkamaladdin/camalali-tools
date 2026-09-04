"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { formatBytes, formatNumber } from "../shared/format";
import {
  buildOutputFilename,
  computeSavingsPercent,
  computeTargetDimensions,
  isSupportedImageMime,
  mimeForFormat,
  qualityPercentToFraction,
  IMAGE_FORMAT_LABELS,
  type ImageFormat,
} from "../lib/sekil";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
  ToolStat,
} from "./ui";

/*
 * A resize/compress/convert widget built on the browser's own canvas, with no
 * upload anywhere. `sekil.ts` holds the arithmetic (target size, savings
 * percent, output filename); everything below that touches `Image`,
 * `HTMLCanvasElement` or `canvas.toBlob` has to live here, because none of it
 * exists on the server that renders this page's static parts.
 */

const FORMAT_OPTIONS: ImageFormat[] = ["jpeg", "webp", "png"];

/* A guard against a mistyped nine-digit value, not a real product limit —
   the site the visitor is on has no image this large, but the number field
   has no upper bound of its own. */
const MAX_DIMENSION_INPUT = 20000;

type ImageStatus = "processing" | "done" | "error";

type ImageItem = {
  id: string;
  file: File;
  status: ImageStatus;
  originalWidth: number | null;
  originalHeight: number | null;
  targetWidth: number | null;
  targetHeight: number | null;
  resultBytes: number | null;
  resultUrl: string | null;
  resultFilename: string | null;
  error: string | null;
};

let idCounter = 0;
function makeId(): string {
  idCounter += 1;
  return `sekil-${idCounter}`;
}

function parsePositiveInt(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(MAX_DIMENSION_INPUT, Math.round(value));
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Şəkil açılmadı — fayl zədəli və ya format dəstəklənmir."));
    image.src = src;
  });
}

type EncodedImage = {
  blob: Blob;
  originalWidth: number;
  originalHeight: number;
  targetWidth: number;
  targetHeight: number;
};

/* The one function in this file that is not a React concern: given a file
   and the chosen settings, produce the resized/re-encoded blob. Kept outside
   the component so the effect below reads as "for each file, await this",
   not a page of canvas plumbing. */
async function encodeImage(
  file: File,
  format: ImageFormat,
  qualityFraction: number,
  maxWidth: number | undefined,
  maxHeight: number | undefined,
): Promise<EncodedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(objectUrl);
    const target = computeTargetDimensions(
      { width: image.naturalWidth, height: image.naturalHeight },
      { maxWidth, maxHeight },
    );

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D kontekst alınmadı — brauzer canvas-ı dəstəkləmir.");
    context.drawImage(image, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mimeForFormat(format), qualityFraction);
    });
    if (!blob) throw new Error("Kodlaşdırma alınmadı — seçilmiş format bu brauzerdə dəstəklənmir.");

    return {
      blob,
      originalWidth: image.naturalWidth,
      originalHeight: image.naturalHeight,
      targetWidth: target.width,
      targetHeight: target.height,
    };
  } finally {
    // The source object URL is a browser-memory handle to the raw file; the
    // canvas has already copied its pixels out, so nothing needs it after this.
    URL.revokeObjectURL(objectUrl);
  }
}

export function SekilTool() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [format, setFormat] = useState<ImageFormat>("jpeg");
  const [qualityPercent, setQualityPercent] = useState(80);
  const [maxWidthText, setMaxWidthText] = useState("1920");
  const [maxHeightText, setMaxHeightText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [rejectedNote, setRejectedNote] = useState<string | null>(null);

  const maxWidth = parsePositiveInt(maxWidthText);
  const maxHeight = parsePositiveInt(maxHeightText);

  // Latest items, readable from the unmount cleanup below without making
  // that effect depend on `items` and re-run on every processed image. Kept
  // in sync by its own effect rather than written during render, which React
  // now forbids for a ref precisely because a render can be thrown away.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      }
    },
    [],
  );

  // A settings change has to invalidate any encode already in flight for the
  // old settings — otherwise a slow first encode can finish after a second,
  // faster one and overwrite it with a result nobody asked for anymore.
  const generationRef = useRef(0);

  /*
   * Encodes `targets` under `settings` and writes each result back by id —
   * by id, not by array position, because a removal that lands while an
   * older encode is still in flight would otherwise let that encode's
   * `.then` write its result into whatever item now sits at its old index.
   *
   * Called straight from the event handlers below rather than from a
   * `useEffect` watching every setting: an effect that both reacts to state
   * and calls `setState` synchronously in its body is the double-render
   * pattern React's own hooks lint flags, and there is nothing here that
   * needs to "sync with an external system" on a timer — a value changed
   * because the visitor changed it, so the handler that already knows the
   * new value is the natural place to act on it.
   */
  function reprocess(
    targets: { id: string; file: File }[],
    settings: {
      format: ImageFormat;
      qualityPercent: number;
      maxWidth: number | undefined;
      maxHeight: number | undefined;
    },
  ) {
    if (targets.length === 0) return;

    generationRef.current += 1;
    const myGeneration = generationRef.current;
    const qualityFraction = qualityPercentToFraction(settings.qualityPercent);
    const targetIds = new Set(targets.map((target) => target.id));

    setItems((prev) =>
      prev.map((item) =>
        targetIds.has(item.id) ? { ...item, status: "processing", error: null } : item,
      ),
    );

    for (const target of targets) {
      encodeImage(target.file, settings.format, qualityFraction, settings.maxWidth, settings.maxHeight)
        .then((result) => {
          if (generationRef.current !== myGeneration) return;
          setItems((prev) =>
            prev.map((item) => {
              if (item.id !== target.id) return item;
              if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
              return {
                ...item,
                status: "done",
                originalWidth: result.originalWidth,
                originalHeight: result.originalHeight,
                targetWidth: result.targetWidth,
                targetHeight: result.targetHeight,
                resultBytes: result.blob.size,
                resultUrl: URL.createObjectURL(result.blob),
                resultFilename: buildOutputFilename(target.file.name, settings.format),
                error: null,
              };
            }),
          );
        })
        .catch((error: unknown) => {
          if (generationRef.current !== myGeneration) return;
          setItems((prev) =>
            prev.map((item) =>
              item.id === target.id
                ? {
                    ...item,
                    status: "error",
                    error: error instanceof Error ? error.message : "Naməlum xəta baş verdi.",
                  }
                : item,
            ),
          );
        });
    }
  }

  function currentSettings(overrides: Partial<{
    format: ImageFormat;
    qualityPercent: number;
    maxWidth: number | undefined;
    maxHeight: number | undefined;
  }> = {}) {
    return { format, qualityPercent, maxWidth, maxHeight, ...overrides };
  }

  /** Every current item, as the id/file pairs `reprocess` wants — used whenever a setting (not the file list) changes. */
  function allTargets() {
    return items.map((item) => ({ id: item.id, file: item.file }));
  }

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    const supported = incoming.filter((file) => isSupportedImageMime(file.type));
    const rejected = incoming.length - supported.length;
    setRejectedNote(
      rejected > 0
        ? `${rejected} fayl şəkil formatında deyil (və ya brauzer onu tanımadı) — əlavə olunmadı.`
        : null,
    );
    if (supported.length === 0) return;

    const newItems = supported.map<ImageItem>((file) => ({
      id: makeId(),
      file,
      status: "processing",
      originalWidth: null,
      originalHeight: null,
      targetWidth: null,
      targetHeight: null,
      resultBytes: null,
      resultUrl: null,
      resultFilename: null,
      error: null,
    }));

    setItems((prev) => [...prev, ...newItems]);
    // Existing items already carry a result for the current settings — only
    // the ones that just arrived need a first encode.
    reprocess(newItems, currentSettings());
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.resultUrl) URL.revokeObjectURL(target.resultUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  function clearAll() {
    for (const item of items) {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    }
    setItems([]);
    setRejectedNote(null);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) addFiles(event.target.files);
    // Clearing the value lets the same file be re-selected later — without
    // this, choosing the identical file twice in a row fires no change event.
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  }

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Şəkil"
          action={
            <>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Format
                <ToolSelect
                  value={format}
                  onChange={(event) => {
                    const next = event.target.value as ImageFormat;
                    setFormat(next);
                    reprocess(allTargets(), currentSettings({ format: next }));
                  }}
                  className="h-8 w-24 px-2 text-xs"
                >
                  {FORMAT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {IMAGE_FORMAT_LABELS[option]}
                    </option>
                  ))}
                </ToolSelect>
              </label>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Keyfiyyət
                <ToolInput
                  type="number"
                  min={1}
                  max={100}
                  value={qualityPercent}
                  disabled={format === "png"}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isNaN(next)) return;
                    const clamped = Math.min(100, Math.max(1, Math.round(next)));
                    setQualityPercent(clamped);
                    reprocess(allTargets(), currentSettings({ qualityPercent: clamped }));
                  }}
                  className="h-8 w-16 px-2 text-xs"
                />
                %
              </label>
              <ToolButton size="chip" onClick={clearAll} disabled={items.length === 0}>
                Hamısını təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-4">
            <ToolNote>
              Şəkil heç yerə göndərilmir — sıxma, ölçü dəyişmə və format çevirmə tamamilə
              brauzerdə, canvas ilə aparılır.
            </ToolNote>

            <ToolField label="Maksimum en" hint="piksel" htmlFor="sekil-max-width">
              <ToolInput
                id="sekil-max-width"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="məhdudiyyətsiz"
                value={maxWidthText}
                onChange={(event) => {
                  const text = event.target.value;
                  setMaxWidthText(text);
                  reprocess(allTargets(), currentSettings({ maxWidth: parsePositiveInt(text) }));
                }}
              />
            </ToolField>

            <ToolField label="Maksimum hündürlük" hint="piksel" htmlFor="sekil-max-height">
              <ToolInput
                id="sekil-max-height"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="məhdudiyyətsiz"
                value={maxHeightText}
                onChange={(event) => {
                  const text = event.target.value;
                  setMaxHeightText(text);
                  reprocess(allTargets(), currentSettings({ maxHeight: parsePositiveInt(text) }));
                }}
              />
            </ToolField>

            {format === "png" && (
              <ToolNote tone="info">
                PNG itkisiz formatdır — keyfiyyət faizi ona təsir etmir. Faylı kiçiltmək üçün
                maksimum en/hündürlüyü azalt və ya JPEG/WebP-ə keç.
              </ToolNote>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <div className="relative">
              <input
                id="sekil-file-input"
                type="file"
                accept="image/*"
                multiple
                className="peer sr-only"
                onChange={onInputChange}
              />
              <label
                htmlFor="sekil-file-input"
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
                <span className="font-ui text-xs text-muted">
                  JPEG · PNG · WebP · GIF · BMP — bir neçəsi birdən
                </span>
              </label>
            </div>

            {rejectedNote && (
              <ToolNote tone="accent">{rejectedNote}</ToolNote>
            )}

            {items.length > 0 && (
              <ToolResultPanel title="Nəticələr" hint={`${items.length} şəkil`}>
                <div className="divide-y divide-rule">
                  {items.map((item) => (
                    <ImageRow key={item.id} item={item} onRemove={() => removeItem(item.id)} />
                  ))}
                </div>
              </ToolResultPanel>
            )}
          </div>
        </div>
      </ToolPanel>
    </div>
  );
}

function ImageRow({ item, onRemove }: { item: ImageItem; onRemove: () => void }) {
  const savingsPercent =
    item.resultBytes !== null ? computeSavingsPercent(item.file.size, item.resultBytes) : null;
  const grew = savingsPercent !== null && savingsPercent < 0;

  return (
    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-mono text-sm">{item.file.name}</p>
        <p className="font-ui text-[11px] text-muted tabular-nums">
          {item.originalWidth && item.originalHeight
            ? `${item.originalWidth}×${item.originalHeight} → ${item.targetWidth}×${item.targetHeight}`
            : "ölçü hesablanır…"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {item.status === "processing" && (
          <span className="font-ui text-xs text-muted">emal olunur…</span>
        )}

        {item.status === "error" && item.error && (
          <ToolNote tone="accent" className="max-w-xs">
            {item.error}
          </ToolNote>
        )}

        {item.status === "done" && item.resultBytes !== null && item.resultUrl && (
          <>
            <ToolStat
              label={grew ? "Artım" : "Qənaət"}
              value={`${formatBytes(item.file.size)} → ${formatBytes(item.resultBytes)}`}
              note={savingsPercent !== null ? `${formatNumber(Math.abs(savingsPercent), 1)}%` : undefined}
              tone={grew ? "default" : "accent"}
            />
            <a
              href={item.resultUrl}
              download={item.resultFilename ?? "sekil"}
              className="border border-rule px-2.5 py-1 font-ui text-xs transition-colors duration-200 ease-out hover:bg-hover focus-visible:bg-hover"
            >
              Endir
            </a>
          </>
        )}

        <ToolButton size="chip" onClick={onRemove}>
          Sil
        </ToolButton>
      </div>
    </div>
  );
}
