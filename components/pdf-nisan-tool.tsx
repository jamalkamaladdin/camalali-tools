"use client";

import { useState, type ChangeEvent } from "react";
import { formatBytes } from "../shared/format";
import type { NinePosition, PageNumberFormat } from "../lib/pdf-nisan";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
} from "./ui";
import { ToolSegmented } from "./tabs";

/*
 * The DOM half of the watermark / page-number tool. `pdf-nisan.ts` holds
 * every pdf-lib concern -- anchor and rotation arithmetic, font embedding,
 * the actual edit; this file owns what that file cannot know about: reading
 * the picked `File` into bytes, an early page-count check so a problem
 * (encrypted, not a PDF) surfaces before any setting is touched, and turning
 * the finished bytes into a download. The module -- and the ~330 KB of
 * pdf-lib it pulls in -- loads on demand, the same way `pdf-birlesdir-tool.tsx`
 * loads its own build. Only types cross the static import boundary; every
 * value from `pdf-nisan.ts` is reached through the dynamic `loadModule()`
 * below.
 */

type PdfNisanModule = typeof import("../lib/pdf-nisan");

let modulePromise: Promise<PdfNisanModule> | null = null;
function loadModule(): Promise<PdfNisanModule> {
  if (!modulePromise) {
    modulePromise = import("../lib/pdf-nisan").catch((error: unknown) => {
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

const POSITION_OPTIONS: { value: NinePosition; label: string }[] = [
  { value: "top-left", label: "Yuxarı sol" },
  { value: "top-center", label: "Yuxarı orta" },
  { value: "top-right", label: "Yuxarı sağ" },
  { value: "middle-left", label: "Orta sol" },
  { value: "center", label: "Mərkəz" },
  { value: "middle-right", label: "Orta sağ" },
  { value: "bottom-left", label: "Aşağı sol" },
  { value: "bottom-center", label: "Aşağı orta" },
  { value: "bottom-right", label: "Aşağı sağ" },
];

const FORMAT_OPTIONS: { value: PageNumberFormat; label: string }[] = [
  { value: "n", label: "1" },
  { value: "n-of-total", label: "1/12" },
  { value: "sehife-n", label: "Səhifə 1" },
];

type PagesMode = "all" | "custom";
const PAGES_MODE_OPTIONS: { value: PagesMode; label: string }[] = [
  { value: "all", label: "Bütün səhifələr" },
  { value: "custom", label: "Seçilmiş səhifələr" },
];

type FileStatus = "idle" | "checking" | "ready" | "problem";

function toNumber(text: string, fallback: number): number {
  const value = Number(text.trim().replace(",", "."));
  return Number.isFinite(value) ? value : fallback;
}

export function PdfNisanTool() {
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState<FileStatus>("idle");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [watermarkText, setWatermarkText] = useState("NÜMUNƏ");
  const [watermarkSizeText, setWatermarkSizeText] = useState("48");
  const [watermarkColor, setWatermarkColor] = useState("#888888");
  const [watermarkOpacityText, setWatermarkOpacityText] = useState("30");
  const [watermarkAngleText, setWatermarkAngleText] = useState("45");
  const [watermarkPosition, setWatermarkPosition] = useState<NinePosition>("center");
  const [watermarkMarginText, setWatermarkMarginText] = useState("24");
  const [pagesMode, setPagesMode] = useState<PagesMode>("all");
  const [pagesText, setPagesText] = useState("");

  const [pageNumberEnabled, setPageNumberEnabled] = useState(false);
  const [pageNumberFormat, setPageNumberFormat] = useState<PageNumberFormat>("n-of-total");
  const [pageNumberPosition, setPageNumberPosition] = useState<NinePosition>("bottom-center");
  const [pageNumberStartText, setPageNumberStartText] = useState("1");
  const [pageNumberMarginText, setPageNumberMarginText] = useState("24");
  const [pageNumberSkipFirst, setPageNumberSkipFirst] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ pageCount: number; bytes: number } | null>(null);

  async function pickFile(nextFile: File) {
    setFile(nextFile);
    setBytes(null);
    setStatus("checking");
    setProblem(null);
    setPageCount(null);
    setDone(null);
    setError(null);

    try {
      const nextBytes = new Uint8Array(await nextFile.arrayBuffer());
      const mod = await loadModule();
      const result = await mod.inspectPdf(nextBytes);
      setBytes(nextBytes);
      if (!result.ok) {
        setStatus("problem");
        setProblem(result.error);
        return;
      }
      setStatus("ready");
      setPageCount(result.pageCount);
    } catch (cause) {
      console.error("pdf-nisan: fayl oxunmadı", cause);
      setStatus("problem");
      setProblem("Fayl oxunmadı. Zədəli ola bilər.");
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (picked) void pickFile(picked);
  }

  async function handleApply() {
    setError(null);
    setDone(null);

    if (!bytes || status !== "ready" || pageCount === null) {
      setError("Əvvəlcə düzgün açılan bir PDF seç.");
      return;
    }
    if (!watermarkEnabled && !pageNumberEnabled) {
      setError("Nə su nişanı, nə də səhifə nömrəsi aktivdir: heç nə tətbiq olunmaz.");
      return;
    }

    setBusy(true);
    try {
      const mod = await loadModule();

      const pages = pagesMode === "all" ? ("all" as const) : mod.parsePageSelection(pagesText, pageCount);

      const result = await mod.applyWatermarkAndPageNumbers(bytes, {
        watermark: watermarkEnabled
          ? {
              text: watermarkText,
              sizePt: Math.max(1, toNumber(watermarkSizeText, 48)),
              colorHex: watermarkColor,
              opacityPercent: toNumber(watermarkOpacityText, 30),
              angleDegrees: toNumber(watermarkAngleText, 0),
              position: watermarkPosition,
              marginPt: Math.max(0, toNumber(watermarkMarginText, 24)),
              pages,
            }
          : null,
        pageNumber: pageNumberEnabled
          ? {
              format: pageNumberFormat,
              position: pageNumberPosition,
              startNumber: Math.max(1, Math.floor(toNumber(pageNumberStartText, 1))),
              marginPt: Math.max(0, toNumber(pageNumberMarginText, 24)),
              skipFirst: pageNumberSkipFirst,
            }
          : null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      const outName = (file?.name.replace(/\.pdf$/i, "") || "sened") + "-nisanli.pdf";
      downloadBytes(result.bytes, outName);
      setDone({ pageCount: result.pageCount, bytes: result.bytes.byteLength });
    } catch (cause) {
      console.error("pdf-nisan: tətbiq alınmadı", cause);
      setError("Tətbiq alınmadı. Bir daha yoxla.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Fayl" />
        <div className="space-y-3 p-4">
          <ToolNote>
            Fayl heç yerə göndərilmir: açılması, su nişanı çəkilməsi və endirmə linki tamamilə brauzerdə aparılır.
          </ToolNote>

          <div className="relative">
            <input
              id="pdf-nisan-input"
              type="file"
              accept="application/pdf"
              className="peer sr-only"
              onChange={onInputChange}
            />
            <label
              htmlFor="pdf-nisan-input"
              className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-rule px-4 py-6 text-center transition-colors duration-200 ease-out hover:border-accent hover:bg-hover peer-focus-visible:border-accent peer-focus-visible:bg-hover"
            >
              <span className="font-ui text-sm">PDF seç</span>
              <span className="font-ui text-xs text-muted">
                {file ? `${file.name} · ${formatBytes(file.size)}` : "hər hansı PDF sənədi"}
              </span>
            </label>
          </div>

          {status === "checking" && <p className="font-ui text-xs text-muted">Yoxlanılır…</p>}
          {status === "problem" && problem && <ToolNote tone="accent">{problem}</ToolNote>}
          {status === "ready" && pageCount !== null && (
            <p className="font-ui text-xs text-muted tabular-nums">{pageCount} səhifə</p>
          )}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Su nişanı"
          action={
            <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
              <input
                type="checkbox"
                checked={watermarkEnabled}
                onChange={(event) => setWatermarkEnabled(event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Aktiv
            </label>
          }
        />
        {watermarkEnabled && (
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <ToolField label="Mətn" htmlFor="pdf-nisan-wm-text" className="sm:col-span-2">
              <ToolInput
                id="pdf-nisan-wm-text"
                value={watermarkText}
                onChange={(event) => setWatermarkText(event.target.value)}
                placeholder="NÜMUNƏ"
              />
            </ToolField>
            <ToolField label="Ölçü" hint="pt" htmlFor="pdf-nisan-wm-size">
              <ToolInput
                id="pdf-nisan-wm-size"
                type="number"
                min={1}
                inputMode="numeric"
                value={watermarkSizeText}
                onChange={(event) => setWatermarkSizeText(event.target.value)}
              />
            </ToolField>
            <ToolField label="Rəng" htmlFor="pdf-nisan-wm-color">
              <ToolInput
                id="pdf-nisan-wm-color"
                value={watermarkColor}
                onChange={(event) => setWatermarkColor(event.target.value)}
                placeholder="#888888"
              />
            </ToolField>
            <ToolField label="Şəffaflıq" hint="%" htmlFor="pdf-nisan-wm-opacity">
              <ToolInput
                id="pdf-nisan-wm-opacity"
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={watermarkOpacityText}
                onChange={(event) => setWatermarkOpacityText(event.target.value)}
              />
            </ToolField>
            <ToolField label="Dönmə bucağı" hint="dərəcə" htmlFor="pdf-nisan-wm-angle">
              <ToolInput
                id="pdf-nisan-wm-angle"
                type="number"
                inputMode="numeric"
                value={watermarkAngleText}
                onChange={(event) => setWatermarkAngleText(event.target.value)}
              />
            </ToolField>
            <ToolField label="Mövqe" htmlFor="pdf-nisan-wm-position">
              <ToolSelect
                id="pdf-nisan-wm-position"
                value={watermarkPosition}
                onChange={(event) => setWatermarkPosition(event.target.value as NinePosition)}
              >
                {POSITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </ToolSelect>
            </ToolField>
            <ToolField label="Kənar boşluq" hint="pt" htmlFor="pdf-nisan-wm-margin">
              <ToolInput
                id="pdf-nisan-wm-margin"
                type="number"
                min={0}
                inputMode="numeric"
                value={watermarkMarginText}
                onChange={(event) => setWatermarkMarginText(event.target.value)}
              />
            </ToolField>

            <ToolField label="Səhifələr" className="sm:col-span-2">
              <ToolSegmented options={PAGES_MODE_OPTIONS} value={pagesMode} onChange={setPagesMode} />
            </ToolField>
            {pagesMode === "custom" && (
              <ToolField
                label="Səhifə siyahısı"
                hint="məsələn 1,3,5-9"
                htmlFor="pdf-nisan-wm-pages"
                className="sm:col-span-2"
              >
                <ToolInput
                  id="pdf-nisan-wm-pages"
                  value={pagesText}
                  onChange={(event) => setPagesText(event.target.value)}
                  placeholder="1,3,5-9"
                />
              </ToolField>
            )}
          </div>
        )}
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Səhifə nömrəsi"
          action={
            <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
              <input
                type="checkbox"
                checked={pageNumberEnabled}
                onChange={(event) => setPageNumberEnabled(event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Aktiv
            </label>
          }
        />
        {pageNumberEnabled && (
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <ToolField label="Format">
              <ToolSegmented options={FORMAT_OPTIONS} value={pageNumberFormat} onChange={setPageNumberFormat} />
            </ToolField>
            <ToolField label="Mövqe" htmlFor="pdf-nisan-pn-position">
              <ToolSelect
                id="pdf-nisan-pn-position"
                value={pageNumberPosition}
                onChange={(event) => setPageNumberPosition(event.target.value as NinePosition)}
              >
                {POSITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </ToolSelect>
            </ToolField>
            <ToolField label="Başlanğıc rəqəm" htmlFor="pdf-nisan-pn-start">
              <ToolInput
                id="pdf-nisan-pn-start"
                type="number"
                min={1}
                inputMode="numeric"
                value={pageNumberStartText}
                onChange={(event) => setPageNumberStartText(event.target.value)}
              />
            </ToolField>
            <ToolField label="Kənar boşluq" hint="pt" htmlFor="pdf-nisan-pn-margin">
              <ToolInput
                id="pdf-nisan-pn-margin"
                type="number"
                min={0}
                inputMode="numeric"
                value={pageNumberMarginText}
                onChange={(event) => setPageNumberMarginText(event.target.value)}
              />
            </ToolField>
            <label className="flex items-center gap-1.5 font-ui text-xs text-muted sm:col-span-2">
              <input
                type="checkbox"
                checked={pageNumberSkipFirst}
                onChange={(event) => setPageNumberSkipFirst(event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              İlk səhifəni atla
            </label>
          </div>
        )}
      </ToolPanel>

      <ToolButton className="font-semibold" onClick={() => void handleApply()} disabled={busy}>
        {busy ? "Tətbiq olunur…" : "Tətbiq et və endir"}
      </ToolButton>

      {error !== null && (
        <ToolNote tone="accent" title="Alınmadı">
          {error}
        </ToolNote>
      )}

      {done !== null && (
        <ToolResultPanel title="Hazırdır" hint={`${done.pageCount} səhifə`}>
          <p className="p-4 font-ui text-sm text-muted">
            Fayl endirildi ({formatBytes(done.bytes)}): brauzerin öz endirmə qovluğuna bax.
          </p>
        </ToolResultPanel>
      )}
    </div>
  );
}
