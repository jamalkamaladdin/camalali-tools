"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  decodeQrImage,
  type QrDecodeResult,
  type QrDecodeSegment,
} from "../lib/qr-oxuyucu";
import {
  ToolButton,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";

/*
 * The QR reader's browser half, and nothing more than that.
 *
 * Everything with an opinion in it — grey levels, the threshold, the three
 * finder patterns, the module grid, Reed-Solomon, the bit stream — is in
 * `qr-oxuyucu.ts`, which runs in Node under the check suite. What is left here
 * is the part that cannot: turning a picked `File` into an `ImageData`, which
 * needs an `Image`, a canvas and a `getImageData` call, none of which exist on
 * the server that renders this page's static parts.
 */

/*
 * The long edge the picture is scaled down to before the scan.
 *
 * A phone photograph is twelve megapixels and the scan walks every pixel of
 * every row; at full size that is a visible pause for no gain, because a QR
 * that fills even a third of the frame still leaves ten pixels per module at
 * this width. It is a stated limit rather than a silent one: a QR that occupies
 * a very small corner of a very large photograph can lose enough detail here to
 * stop being readable, and the answer to that is to crop the photo, not to
 * scan twelve megapixels for every visitor who does not need it.
 */
const MAX_SCAN_EDGE = 1200;

const MODE_LABELS: Record<QrDecodeSegment["mode"], string> = {
  numeric: "rəqəm",
  alphanumeric: "alfanumerik",
  byte: "bayt",
};

const EC_RECOVERY: Record<string, number> = { L: 7, M: 15, Q: 25, H: 30 };

type Status =
  | { kind: "idle" }
  | { kind: "reading"; name: string }
  | { kind: "done"; name: string; result: QrDecodeResult };

function loadImageElement(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Şəkil açılmadı — fayl zədəlidir və ya brauzer bu formatı tanımır."));
    image.src = source;
  });
}

/**
 * Draws the file at up to `MAX_SCAN_EDGE` on its long edge and hands the raw
 * RGBA bytes to the decoder. Smoothing is left on: it is a downscale, and a
 * nearest-neighbour downscale of a photograph drops whole rows of modules,
 * while an averaged one keeps their edges where the threshold can still find
 * them.
 */
async function readFromFile(file: File): Promise<QrDecodeResult> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(objectUrl);
    const natural = Math.max(image.naturalWidth, image.naturalHeight);
    if (natural === 0) {
      return {
        ok: false,
        stage: "image",
        error: "Şəklin ölçüsü sıfır çıxdı — fayl boşdur və ya zədəlidir.",
      };
    }

    const ratio = natural > MAX_SCAN_EDGE ? MAX_SCAN_EDGE / natural : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return {
        ok: false,
        stage: "image",
        error: "2D kontekst alınmadı — brauzer canvas-ı dəstəkləmir, ona görə piksellər oxunmadı.",
      };
    }
    // A transparent PNG would otherwise read as black over black; the paper is
    // painted first so a logo with a see-through background still has a ground.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height);
    return decodeQrImage(pixels.data, pixels.width, pixels.height);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function QrOxuyucuTool() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const previewRef = useRef(previewUrl);
  useEffect(() => {
    previewRef.current = previewUrl;
  }, [previewUrl]);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  // A second file picked while the first is still being read must not have its
  // result overwritten by the slower, older scan finishing afterwards.
  const generationRef = useRef(0);

  function handleFile(file: File | undefined) {
    if (!file) return;

    generationRef.current += 1;
    const generation = generationRef.current;

    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
    setStatus({ kind: "reading", name: file.name });

    readFromFile(file)
      .then((result) => {
        if (generationRef.current !== generation) return;
        setStatus({ kind: "done", name: file.name, result });
      })
      .catch((error: unknown) => {
        if (generationRef.current !== generation) return;
        setStatus({
          kind: "done",
          name: file.name,
          result: {
            ok: false,
            stage: "image",
            error:
              error instanceof Error
                ? error.message
                : "Şəkil oxunmadı və brauzer səbəbini bildirmədi.",
          },
        });
      });
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0]);
    // Clearing the value lets the same file be picked again — without it, a
    // second choice of the identical file fires no change event at all.
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files[0]);
  }

  function clear() {
    generationRef.current += 1;
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setStatus({ kind: "idle" });
  }

  const result = status.kind === "done" ? status.result : null;
  const decoded = result?.ok ? result : null;
  const looksLikeAddress = decoded !== null && /^https?:\/\//i.test(decoded.text.trim());

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="QR şəkli"
          hint={status.kind === "done" ? status.name : undefined}
          action={
            <ToolButton size="chip" onClick={clear} disabled={status.kind === "idle"}>
              Təmizlə
            </ToolButton>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="relative">
              <input
                id="qr-oxuyucu-file"
                type="file"
                accept="image/*"
                className="peer sr-only"
                onChange={onInputChange}
              />
              <label
                htmlFor="qr-oxuyucu-file"
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
                <span className="font-ui text-sm">QR şəklini seç və ya bura sürüşdür</span>
                <span className="font-ui text-xs text-muted">
                  PNG · JPEG · WebP — ekran görüntüsü də olar
                </span>
              </label>
            </div>

            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Seçilmiş şəkil"
                className="mx-auto block max-h-48 rounded border border-rule object-contain"
              />
            )}

            <ToolNote>
              Şəkil heç yerə göndərilmir — brauzerin öz canvas-ında oxunur, QR-in modul şəbəkəsi və
              mətni elə burada qurulur.
            </ToolNote>

            <ToolNote title="Nə oxunur">
              Versiya 1–10 (21×21 … 57×57 modul), rəqəm, alfanumerik və bayt rejimləri. Şəkil
              QR-in müstəvisinə paralel olmalıdır: 90 dərəcəlik dönmə problem deyil, bucaq altından
              çəkilmiş foto isə oxunmur — alət perspektivi düzəltmir və səhv mətn qaytarmaqdansa
              səbəbi deyir.
            </ToolNote>
          </div>

          <div className="min-w-0 space-y-4">
            {status.kind === "idle" && (
              <p className="py-10 text-center font-ui text-sm text-muted">
                Şəkil seçəndən sonra nəticə burada görünəcək.
              </p>
            )}

            {status.kind === "reading" && (
              <p className="py-10 text-center font-ui text-sm text-muted">oxunur…</p>
            )}

            {result && !result.ok && <ToolNote tone="accent">{result.error}</ToolNote>}

            {decoded && (
              <>
                <ToolResultPanel
                  title="Mətn"
                  hint={`${[...decoded.text].length} simvol`}
                  action={<CopyButton value={decoded.text} />}
                >
                  <div className="p-3">
                    <ToolOutput>{decoded.text}</ToolOutput>
                  </div>
                </ToolResultPanel>

                {looksLikeAddress && (
                  <ToolNote tone="accent">
                    Bu QR ünvan daşıyır. Açmazdan əvvəl ünvanı oxu — QR-in özündən domenin kimə aid
                    olduğu görünmür, ona görə alət onu link kimi vermir.
                  </ToolNote>
                )}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <ToolStat
                    label="Versiya"
                    value={decoded.version}
                    note={`${decoded.size}×${decoded.size} modul`}
                  />
                  <ToolStat
                    label="Xəta düzəltmə"
                    value={decoded.ecLevel}
                    note={`təxminən ${EC_RECOVERY[decoded.ecLevel]}% zədəni bağışlayır`}
                  />
                  <ToolStat
                    label="Maska"
                    value={decoded.mask}
                    note="format sahəsindən oxundu"
                  />
                  <ToolStat
                    label="Düzəldilən kodsöz"
                    value={decoded.correctedCodewords}
                    tone={decoded.correctedCodewords > 0 ? "accent" : "default"}
                    note={
                      decoded.correctedCodewords > 0
                        ? "Rid-Solomon bu qədərini bərpa etdi"
                        : "simvol təmiz oxundu"
                    }
                  />
                </div>

                <ToolResultPanel
                  title="Seqmentlər"
                  hint={`${decoded.segments.length} ədəd`}
                >
                  <div className="divide-y divide-result-rule">
                    {decoded.segments.map((segment, index) => (
                      <div
                        key={`${segment.mode}-${index}`}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3"
                      >
                        <span className="font-ui text-sm">{MODE_LABELS[segment.mode]}</span>
                        <span className="font-ui text-xs text-muted tabular-nums">
                          {segment.count} {segment.mode === "byte" ? "bayt" : "simvol"}
                        </span>
                        <span className="min-w-0 flex-auto truncate font-mono text-xs text-muted">
                          {segment.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </ToolResultPanel>

                {decoded.moduleSize !== null && (
                  <ToolNote>
                    Şəbəkə {decoded.moduleSize.toFixed(1)} piksel/modul ölçüsü ilə oxundu. Bu rəqəm
                    2-dən aşağı düşəndə oxunuş kövrəkləşir — belə halda QR-i daha yaxından çək.
                  </ToolNote>
                )}
              </>
            )}
          </div>
        </div>
      </ToolPanel>
    </div>
  );
}
