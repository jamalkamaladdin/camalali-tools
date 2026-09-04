"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { ToolSegmented } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolTextArea,
} from "./ui";
import {
  buildPngFilename,
  computeOutputDimensions,
  detectExternalSvgReferences,
  isSizeSuccess,
  parseSvgDimensions,
} from "../lib/svg-png";

/*
 * A canvas-driven SVG-to-PNG converter with no upload anywhere. `svg-png.ts`
 * holds the dimension parsing, the ratio maths and the external-reference
 * detector; everything below that touches `Image`, `HTMLCanvasElement` or
 * `canvas.toBlob` has to live here, because none of it exists on the server
 * that renders this page's static parts.
 */

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <rect width="200" height="100" rx="12" fill="#2b3a67"/>
  <circle cx="100" cy="50" r="34" fill="#f5c451"/>
</svg>`;

type SizeMode = "width" | "height" | "scale";
type BackgroundMode = "transparent" | "color";

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("SVG açılmadı — mətn etibarlı SVG deyil."));
    image.src = src;
  });
}

export function SvgPngTool() {
  const [source, setSource] = useState(SAMPLE_SVG);
  const [fileName, setFileName] = useState("sekil.svg");
  const [sizeMode, setSizeMode] = useState<SizeMode>("scale");
  const [widthText, setWidthText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [scale, setScale] = useState(2);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("transparent");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const dimensions = useMemo(() => parseSvgDimensions(source), [source]);
  const externalRefs = useMemo(() => detectExternalSvgReferences(source), [source]);

  const request = useMemo(() => {
    if (sizeMode === "width") {
      const value = Number(widthText);
      return Number.isFinite(value) && value > 0 ? { width: value } : {};
    }
    if (sizeMode === "height") {
      const value = Number(heightText);
      return Number.isFinite(value) && value > 0 ? { height: value } : {};
    }
    return { scale };
  }, [sizeMode, widthText, heightText, scale]);

  const sizeResult = useMemo(() => computeOutputDimensions(dimensions, request), [dimensions, request]);

  const previewUrl = useMemo(() => {
    if (source.trim() === "") return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  }, [source]);

  const filename = isSizeSuccess(sizeResult)
    ? buildPngFilename(fileName, sizeResult.width, sizeResult.height)
    : "sekil.png";

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.includes("svg") && !file.name.toLowerCase().endsWith(".svg")) {
      setDownloadError("Bu fayl SVG deyil.");
      return;
    }
    setDownloadError(null);
    setFileName(file.name);
    file.text().then(setSource);
  }

  function downloadPng() {
    if (!isSizeSuccess(sizeResult)) return;
    setDownloadError(null);

    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
    loadImageElement(url)
      .then((image) => {
        const canvas = document.createElement("canvas");
        canvas.width = sizeResult.width;
        canvas.height = sizeResult.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("2D kontekst alınmadı — brauzer canvas-ı dəstəkləmir.");

        if (backgroundMode === "color") {
          context.fillStyle = backgroundColor;
          context.fillRect(0, 0, sizeResult.width, sizeResult.height);
        }
        context.drawImage(image, 0, 0, sizeResult.width, sizeResult.height);

        canvas.toBlob((blob) => {
          if (!blob) {
            setDownloadError("PNG hazırlana bilmədi — brauzer kodlaşdırmadı.");
            return;
          }
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = filename;
          link.click();
          URL.revokeObjectURL(blobUrl);
        }, "image/png");
      })
      .catch(() => {
        setDownloadError(
          externalRefs.length > 0
            ? "PNG hazırlana bilmədi — canvas xarici resurs üzündən kirləndi, aşağıdakı xəbərdarlığa bax."
            : "PNG hazırlana bilmədi — SVG açılmadı.",
        );
      });
  }

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="SVG"
          action={
            <>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Fayl
                <input type="file" accept=".svg,image/svg+xml" onChange={onFileChange} className="text-xs" />
              </label>
              <ToolButton size="chip" onClick={() => setSource(SAMPLE_SVG)}>
                Nümunə
              </ToolButton>
            </>
          }
        />
        <div className="p-4">
          <ToolField label="SVG mətni" htmlFor="svg-png-source">
            <ToolTextArea
              id="svg-png-source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              rows={8}
              spellCheck={false}
              placeholder="<svg ...>...</svg>"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {externalRefs.length > 0 && (
        <ToolNote tone="accent" title="Bu SVG canvas-ı kirlədə bilər">
          Xarici resurs tapıldı: {externalRefs.join(", ")}. Nəticə önizlənə bilər, amma PNG endirmə
          brauzer tərəfindən rədd oluna bilər — bu, təhlükəsizlik qaydasıdır, alətin xətası deyil.
        </ToolNote>
      )}

      <ToolPanel>
        <ToolPanelHeader
          title="Ölçü"
          action={
            <ToolSegmented
              label="Ölçü rejimi"
              options={[
                { value: "scale", label: "Miqyas" },
                { value: "width", label: "En" },
                { value: "height", label: "Hündürlük" },
              ]}
              value={sizeMode}
              onChange={setSizeMode}
            />
          }
        />
        <div className="grid gap-5 p-4 sm:grid-cols-2">
          <div className="space-y-4">
            {sizeMode === "scale" && (
              <ToolField label="Miqyas" htmlFor="svg-png-scale">
                <ToolSegmentedScale value={scale} onChange={setScale} />
              </ToolField>
            )}
            {sizeMode === "width" && (
              <ToolField label="En" hint="piksel" htmlFor="svg-png-width">
                <ToolInput
                  id="svg-png-width"
                  type="number"
                  min={1}
                  value={widthText}
                  onChange={(event) => setWidthText(event.target.value)}
                  placeholder="512"
                />
              </ToolField>
            )}
            {sizeMode === "height" && (
              <ToolField label="Hündürlük" hint="piksel" htmlFor="svg-png-height">
                <ToolInput
                  id="svg-png-height"
                  type="number"
                  min={1}
                  value={heightText}
                  onChange={(event) => setHeightText(event.target.value)}
                  placeholder="256"
                />
              </ToolField>
            )}

            <ToolSegmented
              label="Fon"
              options={[
                { value: "transparent", label: "Şəffaf" },
                { value: "color", label: "Rəng" },
              ]}
              value={backgroundMode}
              onChange={setBackgroundMode}
            />
            {backgroundMode === "color" && (
              <input
                type="color"
                aria-label="Fon rəngi"
                value={backgroundColor}
                onChange={(event) => setBackgroundColor(event.target.value)}
                className="h-8 w-11 cursor-pointer border bg-surface p-0.5"
                style={{
                  borderColor: "var(--field-border, var(--btn-border))",
                  borderRadius: "var(--field-radius, var(--btn-radius))",
                }}
              />
            )}
          </div>

          <div className="space-y-3">
            {!isSizeSuccess(sizeResult) ? (
              <ToolNote tone="accent" title="Ölçü təyin edilə bilmədi">
                {sizeResult.error}
              </ToolNote>
            ) : (
              <p className="font-ui text-sm text-muted tabular-nums">
                Çıxış: {sizeResult.width}×{sizeResult.height} px — {filename}
              </p>
            )}
            {downloadError && <ToolNote tone="accent">{downloadError}</ToolNote>}
          </div>
        </div>
      </ToolPanel>

      <ToolResultPanel
        title="Önizləmə"
        action={<ToolButton onClick={downloadPng} disabled={!isSizeSuccess(sizeResult)}>PNG endir</ToolButton>}
      >
        <div className="flex min-h-32 items-center justify-center p-4">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="SVG önizləməsi"
              className="max-h-64 max-w-full rounded border border-result-rule bg-[repeating-conic-gradient(#8884_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]"
            />
          ) : (
            <p className="font-ui text-sm text-muted">SVG mətni yapışdır.</p>
          )}
        </div>
      </ToolResultPanel>

      <ToolNote>
        SVG heç yerə göndərilmir — çəkilmə və PNG-yə kodlaşdırma brauzerin öz canvas-ında aparılır.
      </ToolNote>
    </div>
  );
}

function ToolSegmentedScale({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const options: { value: string; label: string }[] = [
    { value: "1", label: "1x" },
    { value: "2", label: "2x" },
    { value: "3", label: "3x" },
  ];
  return (
    <ToolSegmented
      label="Miqyas"
      options={options}
      value={String(value)}
      onChange={(next) => onChange(Number(next))}
    />
  );
}
