"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import { formatBytes } from "../shared/format";
import type { FitMode, Orientation, PageSizeId, SekilPdfImage } from "../lib/sekil-pdf";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
} from "./ui";
import { ToolSegmented } from "./tabs";

/*
 * The DOM half of the image-to-PDF tool. `sekil-pdf.ts` holds every pdf-lib
 * concern -- fit arithmetic, page geometry, embedding, the actual build --
 * this file owns what that file cannot know about: reading picked `File`s
 * into bytes, the reorder/remove list, and turning the finished bytes into a
 * download. The module -- and the ~330 KB of pdf-lib it pulls in -- loads on
 * demand, the same way `pdf-birlesdir-tool.tsx` loads its own build, so
 * nothing here enters the page's first script until a PDF is actually
 * requested. Only types cross the static import boundary; every value from
 * `sekil-pdf.ts` is reached through the dynamic `loadModule()` below.
 */

type SekilPdfModule = typeof import("../lib/sekil-pdf");

let modulePromise: Promise<SekilPdfModule> | null = null;
function loadModule(): Promise<SekilPdfModule> {
  if (!modulePromise) {
    modulePromise = import("../lib/sekil-pdf").catch((error: unknown) => {
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
}

function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

type ImageItem = { id: string; file: File };

let idCounter = 0;
function makeId(): string {
  idCounter += 1;
  return `sekil-pdf-${idCounter}`;
}

const PAGE_SIZE_OPTIONS: { value: PageSizeId; label: string }[] = [
  { value: "a4", label: "A4" },
  { value: "letter", label: "Letter" },
  { value: "image", label: "Şəklin öz ölçüsü" },
];

const ORIENTATION_OPTIONS: { value: Orientation; label: string }[] = [
  { value: "auto", label: "Avtomatik" },
  { value: "portrait", label: "Portret" },
  { value: "landscape", label: "Albom" },
];

const FIT_OPTIONS: { value: FitMode; label: string }[] = [
  { value: "contain", label: "Sığdır" },
  { value: "cover", label: "Doldur" },
  { value: "actual", label: "Əsl ölçü" },
];

/** Empty stays "unlimited" the way `sekil-tool.tsx`'s dimension fields do; anything else is clamped to zero or above. */
function parseNonNegative(text: string): number {
  const value = Number(text.trim());
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function parsePositiveInt(text: string, fallback: number): number {
  const value = Math.floor(Number(text.trim()));
  if (!Number.isFinite(value) || value < 1) return fallback;
  return value;
}

export function SekilPdfTool() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [rejectedNote, setRejectedNote] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState<PageSizeId>("a4");
  const [orientation, setOrientation] = useState<Orientation>("auto");
  const [fit, setFit] = useState<FitMode>("contain");
  const [marginMmText, setMarginMmText] = useState("10");
  const [backgroundEnabled, setBackgroundEnabled] = useState(false);
  const [backgroundHex, setBackgroundHex] = useState("#ffffff");
  const [gridRowsText, setGridRowsText] = useState("1");
  const [gridColsText, setGridColsText] = useState("1");
  const [gapMmText, setGapMmText] = useState("5");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ pageCount: number; bytes: number } | null>(null);

  const gridRows = parsePositiveInt(gridRowsText, 1);
  const gridCols = parsePositiveInt(gridColsText, 1);
  const showGrid = gridRows > 1 || gridCols > 1;

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    const supported = incoming.filter((file) => file.type === "image/png" || file.type === "image/jpeg");
    const rejected = incoming.length - supported.length;
    setRejectedNote(
      rejected > 0 ? `${rejected} fayl PNG/JPEG deyil (və ya brauzer onu tanımadı), əlavə olunmadı.` : null,
    );
    if (supported.length === 0) return;

    setItems((prev) => [...prev, ...supported.map<ImageItem>((file) => ({ id: makeId(), file }))]);
    setDone(null);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function moveItem(id: string, direction: "up" | "down") {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index === -1) return prev;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const a = next[index] as ImageItem;
      const b = next[target] as ImageItem;
      next[index] = b;
      next[target] = a;
      return next;
    });
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) addFiles(event.target.files);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  }

  async function handleGenerate() {
    setError(null);
    setDone(null);

    if (items.length === 0) {
      setError("Heç bir şəkil yoxdur: əvvəlcə şəkil əlavə et.");
      return;
    }

    setBusy(true);
    try {
      const images: SekilPdfImage[] = [];
      for (const item of items) {
        images.push({ bytes: new Uint8Array(await item.file.arrayBuffer()), name: item.file.name });
      }

      const mod = await loadModule();
      const result = await mod.buildImagesPdf(images, {
        pageSize,
        orientation,
        fit,
        marginMm: parseNonNegative(marginMmText),
        backgroundHex: backgroundEnabled ? backgroundHex : null,
        grid: { rows: gridRows, cols: gridCols },
        gapMm: parseNonNegative(gapMmText),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      downloadBytes(result.bytes, "sekiller.pdf");
      setDone({ pageCount: result.pageCount, bytes: result.bytes.byteLength });
    } catch (cause) {
      console.error("sekil-pdf: PDF qurulmadı", cause);
      setError("PDF qurula bilmədi. Bir daha yoxla.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Şəkillər" hint={items.length > 0 ? `${items.length} şəkil` : undefined} />
        <div className="space-y-4 p-4">
          <ToolNote>
            Şəkillər heç yerə göndərilmir: PDF-in qurulması tamamilə brauzerdə aparılır.
          </ToolNote>

          <div className="relative">
            <input
              id="sekil-pdf-input"
              type="file"
              accept="image/png,image/jpeg"
              multiple
              className="peer sr-only"
              onChange={onInputChange}
            />
            <label
              htmlFor="sekil-pdf-input"
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded border-2 border-dashed px-4 py-8 text-center transition-colors duration-200 ease-out hover:border-accent hover:bg-hover peer-focus-visible:border-accent peer-focus-visible:bg-hover ${
                isDragging ? "border-accent bg-hover" : "border-rule"
              }`}
            >
              <span className="font-ui text-sm">Şəkil seç və ya bura sürüşdür</span>
              <span className="font-ui text-xs text-muted">PNG · JPEG (bir neçəsi birdən, hər hansı sıra ilə)</span>
            </label>
          </div>

          {rejectedNote && <ToolNote tone="accent">{rejectedNote}</ToolNote>}

          {items.length > 0 && (
            <ul className="space-y-2">
              {items.map((item, index) => (
                <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-rule p-3">
                  <span className="min-w-0 flex-auto truncate font-ui text-sm">
                    {index + 1}. {item.file.name}
                  </span>
                  <span className="shrink-0 font-ui text-xs text-muted tabular-nums">
                    {formatBytes(item.file.size)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <ToolButton size="chip" onClick={() => moveItem(item.id, "up")} disabled={index === 0} aria-label="Yuxarı">
                      ↑
                    </ToolButton>
                    <ToolButton
                      size="chip"
                      onClick={() => moveItem(item.id, "down")}
                      disabled={index === items.length - 1}
                      aria-label="Aşağı"
                    >
                      ↓
                    </ToolButton>
                    <ToolButton size="chip" onClick={() => removeItem(item.id)}>
                      Sil
                    </ToolButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Səhifə" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <ToolField label="Səhifə ölçüsü">
            <ToolSegmented options={PAGE_SIZE_OPTIONS} value={pageSize} onChange={setPageSize} />
          </ToolField>
          <ToolField label="İstiqamət" note={pageSize === "image" ? "«Şəklin öz ölçüsü» seçiləndə tətbiq olunmur." : undefined}>
            <ToolSegmented options={ORIENTATION_OPTIONS} value={orientation} onChange={setOrientation} />
          </ToolField>
          <ToolField label="Yerləşdirmə">
            <ToolSegmented options={FIT_OPTIONS} value={fit} onChange={setFit} />
          </ToolField>
          <ToolField label="Kənar boşluq" hint="mm" htmlFor="sekil-pdf-margin">
            <ToolInput
              id="sekil-pdf-margin"
              type="number"
              min={0}
              inputMode="numeric"
              value={marginMmText}
              onChange={(event) => setMarginMmText(event.target.value)}
            />
          </ToolField>

          <div className="sm:col-span-2 flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
              <input
                type="checkbox"
                checked={backgroundEnabled}
                onChange={(event) => setBackgroundEnabled(event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Fon rəngi
            </label>
            <ToolInput
              type="text"
              value={backgroundHex}
              disabled={!backgroundEnabled}
              onChange={(event) => setBackgroundHex(event.target.value)}
              placeholder="#ffffff"
              className="w-28"
            />
          </div>

          <ToolField label="Sətir" hint="şəbəkə" htmlFor="sekil-pdf-rows">
            <ToolInput
              id="sekil-pdf-rows"
              type="number"
              min={1}
              inputMode="numeric"
              value={gridRowsText}
              onChange={(event) => setGridRowsText(event.target.value)}
            />
          </ToolField>
          <ToolField label="Sütun" hint="şəbəkə" htmlFor="sekil-pdf-cols">
            <ToolInput
              id="sekil-pdf-cols"
              type="number"
              min={1}
              inputMode="numeric"
              value={gridColsText}
              onChange={(event) => setGridColsText(event.target.value)}
            />
          </ToolField>
          {showGrid && (
            <ToolField label="Xanalar arası boşluq" hint="mm" htmlFor="sekil-pdf-gap">
              <ToolInput
                id="sekil-pdf-gap"
                type="number"
                min={0}
                inputMode="numeric"
                value={gapMmText}
                onChange={(event) => setGapMmText(event.target.value)}
              />
            </ToolField>
          )}
        </div>
      </ToolPanel>

      <ToolButton className="font-semibold" onClick={() => void handleGenerate()} disabled={busy}>
        {busy ? "Qurulur…" : "PDF yarat və endir"}
      </ToolButton>

      {error !== null && (
        <ToolNote tone="accent" title="Alınmadı">
          {error}
        </ToolNote>
      )}

      {done !== null && (
        <ToolResultPanel title="Hazırdır" hint={`${done.pageCount} səhifə`}>
          <p className="p-4 font-ui text-sm text-muted">
            <code>sekiller.pdf</code> ({formatBytes(done.bytes)}) endirildi: brauzerin öz endirmə qovluğuna bax.
          </p>
        </ToolResultPanel>
      )}
    </div>
  );
}
