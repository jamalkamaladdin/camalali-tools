"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { formatBytes } from "../shared/format";
import {
  ORIENTATION_LABELS,
  parseExif,
  parsePngTextChunks,
  stripExif,
  type ExifData,
  type ExifParseResult,
} from "../lib/exif";
import {
  ToolButton,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";
import { CopyButton } from "../shared/copy-button";

/*
 * The DOM half of the EXIF tool. `exif.ts` holds every byte concern — marker
 * walking, TIFF offsets, the strip transform; this file owns exactly two DOM
 * facts that `exif.ts` cannot know about: reading a picked `File` into an
 * `ArrayBuffer`, and turning the bytes `stripExif` hands back into a
 * downloadable `Blob`. Nothing here parses a byte.
 */

type StripState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "done"; url: string; filename: string; removedBytes: number };

/** EXIF dates read `2024:06:15 14:32:10` — colons in the date part only, per the spec. Cosmetic only; the value itself is untouched. */
function formatExifDate(raw: string): string {
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (.+)$/);
  if (!match) return raw;
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}`;
}

function trimNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatAperture(fNumber: number): string {
  return `f/${fNumber.toFixed(1)}`;
}

function formatShutterSpeed(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds >= 1) return `${trimNumber(seconds)} san.`;
  return `1/${Math.round(1 / seconds)} san.`;
}

function formatFocalLength(mm: number): string {
  return `${trimNumber(mm)} mm`;
}

function buildCleanFilename(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  if (dot <= 0) return `${originalName}-temiz`;
  return `${originalName.slice(0, dot)}-temiz${originalName.slice(dot)}`;
}

/** The rows worth showing, in reading order — only the fields the file actually had. */
function buildFieldRows(data: ExifData): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];

  const camera = [data.make, data.model].filter(Boolean).join(" ").trim();
  if (camera) rows.push({ label: "Kamera", value: camera });

  const date = data.dateTimeOriginal ?? data.dateTime;
  if (date) rows.push({ label: "Çəkilmə tarixi", value: formatExifDate(date) });

  if (data.iso !== undefined) rows.push({ label: "ISO", value: `ISO ${data.iso}` });
  if (data.fNumber !== undefined) rows.push({ label: "Diafraqma", value: formatAperture(data.fNumber) });
  if (data.exposureTime !== undefined) {
    rows.push({ label: "Örtücü sürəti", value: formatShutterSpeed(data.exposureTime) });
  }
  if (data.focalLength !== undefined) {
    rows.push({ label: "Fokus məsafəsi", value: formatFocalLength(data.focalLength) });
  }
  if (data.orientation !== undefined) {
    rows.push({
      label: "İstiqamət",
      value: ORIENTATION_LABELS[data.orientation] ?? `naməlum (${data.orientation})`,
    });
  }
  if (data.software) rows.push({ label: "Proqram", value: data.software });

  return rows;
}

export function ExifTool() {
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [parseResult, setParseResult] = useState<ExifParseResult | null>(null);
  const [textChunks, setTextChunks] = useState<{ keyword: string; text: string }[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [stripState, setStripState] = useState<StripState>({ status: "idle" });

  // The one object URL this widget ever holds at a time, tracked outside
  // state so the unmount cleanup below can revoke it without depending on
  // (and re-running for) every stripState change.
  const downloadUrlRef = useRef<string | null>(null);
  function revokeDownloadUrl() {
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
  }
  useEffect(() => revokeDownloadUrl, []);

  async function handleFile(selected: File) {
    revokeDownloadUrl();
    setStripState({ status: "idle" });
    setFile(selected);
    setReadError(null);

    try {
      const buffer = await selected.arrayBuffer();
      const nextBytes = new Uint8Array(buffer);
      setBytes(nextBytes);
      setParseResult(parseExif(nextBytes));
      setTextChunks(parsePngTextChunks(nextBytes));
    } catch {
      setReadError("Fayl oxunmadı — başqa fayl sınaq et.");
      setBytes(null);
      setParseResult(null);
      setTextChunks([]);
    }
  }

  function handleStrip() {
    if (!bytes || !file) return;
    const result = stripExif(bytes);
    if (!result.ok) {
      setStripState({ status: "error", error: result.error });
      return;
    }
    revokeDownloadUrl();
    const blob = new Blob([result.bytes as BlobPart], { type: file.type || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    downloadUrlRef.current = url;
    setStripState({
      status: "done",
      url,
      filename: buildCleanFilename(file.name),
      removedBytes: result.removedBytes,
    });
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) handleFile(selected);
    // Lets the same file be re-selected later — without this, picking the
    // identical file twice in a row fires no change event.
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0];
    if (selected) handleFile(selected);
  }

  const rows = parseResult?.ok ? buildFieldRows(parseResult.data) : [];
  const hasGps = parseResult?.ok === true && parseResult.hasGps;
  const nothingFound =
    parseResult?.ok === true && rows.length === 0 && !hasGps && textChunks.length === 0;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="EXIF" hint={file ? file.name : undefined} />

        <div className="grid gap-5 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-4">
            <ToolNote>
              Şəkil heç yerə göndərilmir — oxuma da, metadata silmə də tamamilə brauzerdə aparılır.
            </ToolNote>

            {file && (
              <div className="space-y-1 text-ios-footnote text-muted">
                <p className="truncate font-mono text-ink">{file.name}</p>
                <p className="tabular-nums">{formatBytes(file.size)}</p>
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <div className="relative">
              <input
                id="exif-file-input"
                type="file"
                accept="image/jpeg,image/png"
                className="peer sr-only"
                onChange={onInputChange}
              />
              <label
                htmlFor="exif-file-input"
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
                <span className="font-ui text-xs text-muted">JPEG · PNG</span>
              </label>
            </div>

            {readError && <ToolNote tone="accent">{readError}</ToolNote>}

            {parseResult && !parseResult.ok && <ToolNote tone="accent">{parseResult.error}</ToolNote>}

            {parseResult?.ok && (
              <ToolResultPanel title="Metadata" hint={`${rows.length + textChunks.length} sahə`}>
                {nothingFound && (
                  <div className="p-3">
                    <ToolNote>Bu fayldan heç bir EXIF və ya mətn metadatası tapılmadı.</ToolNote>
                  </div>
                )}

                {rows.length > 0 && (
                  <div className="divide-y divide-rule">
                    {rows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-ios-footnote text-muted">{row.label}</span>
                        <span className="text-ios-body tabular-nums">{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {hasGps && parseResult.data.gpsLatitude !== undefined && parseResult.data.gpsLongitude !== undefined && (
                  <div className="border-t border-result-rule p-3">
                    <ToolNote tone="accent" title="GPS koordinatı tapıldı">
                      <p className="tabular-nums">
                        {parseResult.data.gpsLatitude.toFixed(6)}, {parseResult.data.gpsLongitude.toFixed(6)}
                      </p>
                      <p className="mt-1">
                        Bu şəkil harada çəkildiyini dəqiq göstərir. Şəkli olduğu kimi paylaşsan, bu
                        koordinat da onunla gedir — evin, iş yerinin dəqiq ünvanı ola bilər.
                      </p>
                      <div className="mt-2">
                        <CopyButton
                          value={`${parseResult.data.gpsLatitude}, ${parseResult.data.gpsLongitude}`}
                          label="Koordinatı kopyala"
                        />
                      </div>
                    </ToolNote>
                  </div>
                )}

                {textChunks.length > 0 && (
                  <div className="space-y-3 border-t border-result-rule p-3">
                    {textChunks.map((chunk, index) => (
                      <div key={`${chunk.keyword}-${index}`} className="space-y-1">
                        <p className="text-ios-footnote text-muted">{chunk.keyword}</p>
                        <ToolOutput className="text-xs">{chunk.text}</ToolOutput>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 border-t border-result-rule p-3">
                  <ToolButton size="chip" onClick={handleStrip} disabled={!bytes}>
                    Metadatanı sil və təmiz versiyanı endir
                  </ToolButton>

                  {stripState.status === "done" && (
                    <>
                      <ToolStat
                        label="Silinən metadata"
                        value={formatBytes(stripState.removedBytes)}
                        tone={stripState.removedBytes > 0 ? "accent" : "default"}
                      />
                      <a
                        href={stripState.url}
                        download={stripState.filename}
                        className="border border-rule px-2.5 py-1 font-ui text-xs transition-colors duration-200 ease-out hover:bg-hover focus-visible:bg-hover"
                      >
                        Endir
                      </a>
                    </>
                  )}
                </div>

                {stripState.status === "error" && (
                  <div className="border-t border-result-rule p-3">
                    <ToolNote tone="accent">{stripState.error}</ToolNote>
                  </div>
                )}
              </ToolResultPanel>
            )}
          </div>
        </div>
      </ToolPanel>
    </div>
  );
}
