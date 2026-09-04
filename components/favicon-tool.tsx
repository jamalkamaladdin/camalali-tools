"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { CopyButton } from "../shared/copy-button";
import { formatBytes } from "../shared/format";
import {
  ANDROID_ICON_SIZES,
  APPLE_TOUCH_ICON_SIZE,
  ICO_SIZES,
  buildFaviconHeadHtml,
  buildIcoFile,
  buildManifestJson,
  computeIconLayout,
  faviconSlots,
  normalizeBackgroundColor,
} from "../lib/favicon";
import { ToolSegmented } from "./tabs";
import {
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
} from "./ui";

/*
 * A canvas-driven favicon generator with no upload anywhere. `favicon.ts`
 * holds the layout maths, the hand-rolled ICO container and the
 * manifest/HTML text; everything below that touches `Image`,
 * `HTMLCanvasElement` or `canvas.toBlob` has to live here, because none of
 * it exists on the server that renders this page's static parts.
 */

const SOURCE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/svg+xml",
]);

function isSupportedSource(file: File): boolean {
  if (SOURCE_MIME_TYPES.has(file.type)) return true;
  // Some browsers hand an SVG selected from disk no MIME type at all.
  return file.type === "" && file.name.toLowerCase().endsWith(".svg");
}

type BackgroundMode = "transparent" | "color";

type GeneratedFile = {
  fileName: string;
  url: string;
  bytes: number;
};

async function drawIconBlob(
  image: HTMLImageElement,
  size: number,
  paddingPercent: number,
  background: string | null,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D kontekst alınmadı — brauzer canvas-ı dəstəkləmir.");

  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, size, size);
  }

  const layout = computeIconLayout(size, paddingPercent, {
    width: image.naturalWidth,
    height: image.naturalHeight,
  });
  context.drawImage(image, layout.x, layout.y, layout.width, layout.height);

  const blob = await new Promise<Blob | null>((resolve) => context.canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error(
      "PNG hazırlana bilmədi — SVG xarici resurs daşıyırsa canvas «kirlənir» və brauzer piksel oxutmur.",
    );
  }
  return blob;
}

async function generateFaviconSet(
  image: HTMLImageElement,
  paddingPercent: number,
  background: string | null,
): Promise<{ fileName: string; blob: Blob }[]> {
  const icoBlobs = await Promise.all(
    ICO_SIZES.map((size) => drawIconBlob(image, size, paddingPercent, background)),
  );
  const icoImages = await Promise.all(
    icoBlobs.map(async (blob, index) => ({
      size: ICO_SIZES[index],
      pngBytes: new Uint8Array(await blob.arrayBuffer()),
    })),
  );
  const icoFile = new Blob([buildIcoFile(icoImages)], { type: "image/x-icon" });

  const apple = await drawIconBlob(image, APPLE_TOUCH_ICON_SIZE, paddingPercent, background);
  const android192 = await drawIconBlob(image, ANDROID_ICON_SIZES[0], paddingPercent, background);
  const android512 = await drawIconBlob(image, ANDROID_ICON_SIZES[1], paddingPercent, background);

  return [
    { fileName: "favicon.ico", blob: icoFile },
    { fileName: "apple-touch-icon.png", blob: apple },
    { fileName: "android-chrome-192x192.png", blob: android192 },
    { fileName: "android-chrome-512x512.png", blob: android512 },
  ];
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Şəkil açılmadı — fayl zədəli və ya format dəstəklənmir."));
    image.src = src;
  });
}

export function FaviconTool() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rejectedNote, setRejectedNote] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [paddingPercent, setPaddingPercent] = useState(12);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("transparent");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [siteName, setSiteName] = useState("");

  const [outputs, setOutputs] = useState<GeneratedFile[]>([]);
  const [genStatus, setGenStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [genError, setGenError] = useState<string | null>(null);

  const outputsRef = useRef<GeneratedFile[]>([]);
  useEffect(() => {
    outputsRef.current = outputs;
  }, [outputs]);

  // Revoke every object URL this widget has ever handed out — the source
  // preview and the four generated files — once on unmount.
  useEffect(
    () => () => {
      for (const output of outputsRef.current) URL.revokeObjectURL(output.url);
    },
    [],
  );

  const background = backgroundMode === "color" ? normalizeBackgroundColor(backgroundColor) : null;

  // A settings change has to invalidate any generation already in flight for
  // the old settings — otherwise a slow first run can finish after a second,
  // faster one and overwrite it with a result nobody asked for anymore.
  // Called straight from the handlers below (file picked, padding typed,
  // background changed) rather than from a `useEffect` that both reads state
  // and calls `setState` in its own body — the double-render pattern the
  // hooks lint flags, and there is nothing here "syncing with an external
  // system" on its own schedule: a value changed because the visitor changed
  // it, so the handler that already knows the new value is where this belongs.
  const generationRef = useRef(0);

  function regenerate(nextImage: HTMLImageElement | null, nextPadding: number, nextBackground: string | null) {
    generationRef.current += 1;
    const myGeneration = generationRef.current;

    if (!nextImage) {
      setOutputs([]);
      setGenStatus("idle");
      return;
    }

    setGenStatus("processing");
    generateFaviconSet(nextImage, nextPadding, nextBackground)
      .then((results) => {
        if (generationRef.current !== myGeneration) return;
        for (const output of outputsRef.current) URL.revokeObjectURL(output.url);
        setOutputs(
          results.map((result) => ({
            fileName: result.fileName,
            url: URL.createObjectURL(result.blob),
            bytes: result.blob.size,
          })),
        );
        setGenStatus("done");
        setGenError(null);
      })
      .catch((error: unknown) => {
        if (generationRef.current !== myGeneration) return;
        setGenStatus("error");
        setGenError(error instanceof Error ? error.message : "Naməlum xəta baş verdi.");
      });
  }

  function onFiles(fileList: FileList | File[]) {
    const file = Array.from(fileList)[0];
    if (!file) return;
    if (!isSupportedSource(file)) {
      setRejectedNote("Bu fayl şəkil formatında deyil — PNG, JPG, WebP, GIF, BMP və ya SVG lazımdır.");
      return;
    }
    setRejectedNote(null);
    setLoadError(null);

    const url = URL.createObjectURL(file);
    loadImageElement(url)
      .then((loaded) => {
        setImage(loaded);
        setSourceName(file.name);
        regenerate(loaded, paddingPercent, background);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Şəkil açılmadı.");
      })
      .finally(() => {
        URL.revokeObjectURL(url);
      });
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) onFiles(event.target.files);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files);
  }

  const manifestJson = buildManifestJson({
    siteName,
    themeColor: background ?? "#ffffff",
    backgroundColor: background ?? "#ffffff",
  });
  const headHtml = buildFaviconHeadHtml();
  const slots = faviconSlots();

  const previewOutput = outputs.find((o) => o.fileName === "android-chrome-192x192.png");

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Mənbə şəkil"
          action={
            <>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Kənar boşluq
                <ToolInput
                  id="favicon-padding"
                  type="number"
                  min={0}
                  max={45}
                  value={paddingPercent}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isNaN(next)) return;
                    const clamped = Math.min(45, Math.max(0, Math.round(next)));
                    setPaddingPercent(clamped);
                    regenerate(image, clamped, background);
                  }}
                  className="h-8 w-16 px-2 text-xs"
                />
                %
              </label>
              <ToolSegmented
                label="Fon"
                options={[
                  { value: "transparent", label: "Şəffaf" },
                  { value: "color", label: "Rəng" },
                ]}
                value={backgroundMode}
                onChange={(next) => {
                  setBackgroundMode(next);
                  regenerate(image, paddingPercent, next === "color" ? normalizeBackgroundColor(backgroundColor) : null);
                }}
              />
              {backgroundMode === "color" && (
                <input
                  type="color"
                  aria-label="Fon rəngi"
                  value={normalizeBackgroundColor(backgroundColor) ?? "#ffffff"}
                  onChange={(event) => {
                    setBackgroundColor(event.target.value);
                    regenerate(image, paddingPercent, normalizeBackgroundColor(event.target.value));
                  }}
                  className="h-8 w-11 cursor-pointer border bg-surface p-0.5"
                  style={{
                    borderColor: "var(--field-border, var(--btn-border))",
                    borderRadius: "var(--field-radius, var(--btn-radius))",
                  }}
                />
              )}
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-4">
            <ToolNote>
              Şəkil heç yerə göndərilmir — ölçü dəyişmə, ICO yığılması və PNG kodlaşdırma tamamilə
              brauzerdə, canvas ilə aparılır.
            </ToolNote>

            <div className="relative">
              <input
                id="favicon-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,.svg"
                className="peer sr-only"
                onChange={onInputChange}
              />
              <label
                htmlFor="favicon-file-input"
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
                <span className="font-ui text-sm">
                  {sourceName ? sourceName : "Şəkil seç və ya bura sürüşdür"}
                </span>
                <span className="font-ui text-xs text-muted">
                  PNG · JPG · WebP · GIF · BMP · SVG — kvadrat şəkil ən yaxşı nəticəni verir
                </span>
              </label>
            </div>

            {rejectedNote && <ToolNote tone="accent">{rejectedNote}</ToolNote>}
            {loadError && <ToolNote tone="accent">{loadError}</ToolNote>}
            {genStatus === "error" && genError && (
              <ToolNote tone="accent" title="Favicon hazırlanmadı">
                {genError}
              </ToolNote>
            )}

            <ToolField label="Sayt adı" hint="manifest.json üçün" htmlFor="favicon-site-name">
              <ToolInput
                id="favicon-site-name"
                type="text"
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                placeholder="Sayt"
              />
            </ToolField>
          </div>

          <div className="min-w-0">
            <ToolResultPanel title="Önizləmə" hint="192×192">
              <div className="p-4">
                {previewOutput ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewOutput.url}
                    alt="Favicon önizləməsi"
                    width={192}
                    height={192}
                    className="mx-auto block h-32 w-32 rounded border border-rule bg-[repeating-conic-gradient(#8884_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]"
                  />
                ) : (
                  <p className="py-8 text-center font-ui text-sm text-muted">
                    {genStatus === "processing" ? "hazırlanır…" : "Şəkil seçəndən sonra burada görünəcək."}
                  </p>
                )}
              </div>
            </ToolResultPanel>
          </div>
        </div>
      </ToolPanel>

      {outputs.length > 0 && (
        <ToolResultPanel title="Fayllar" hint={`${outputs.length} fayl`}>
          <div className="divide-y divide-rule">
            {outputs.map((output) => {
              const slot = slots.find((s) => s.fileName === output.fileName);
              return (
                <div
                  key={output.fileName}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm">{output.fileName}</p>
                    <p className="font-ui text-[11px] text-muted">
                      {slot?.purpose} · {formatBytes(output.bytes)}
                      {slot && !slot.googleFriendly && " · Google-un 48-qatı qaydasına tabe deyil"}
                    </p>
                  </div>
                  <a
                    href={output.url}
                    download={output.fileName}
                    className="border border-rule px-2.5 py-1 font-ui text-xs transition-colors duration-200 ease-out hover:bg-hover focus-visible:bg-hover"
                  >
                    Endir
                  </a>
                </div>
              );
            })}
          </div>
        </ToolResultPanel>
      )}

      <ToolPanel>
        <ToolPanelHeader title="manifest.json" action={<CopyButton value={manifestJson} label="Kopyala" />} />
        <div className="p-4">
          <ToolOutput>{manifestJson}</ToolOutput>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="<head> kodu"
          hint="beş sətir"
          action={<CopyButton value={headHtml} label="Kopyala" />}
        />
        <div className="p-4">
          <ToolOutput>{headHtml}</ToolOutput>
        </div>
      </ToolPanel>
    </div>
  );
}
