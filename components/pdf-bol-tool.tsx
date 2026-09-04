"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { formatBytes } from "../shared/format";
import type { SplitOptions } from "../lib/pdf-bol";
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
 * The DOM half of the split tool. `pdf-bol.ts` holds every pdf-lib and
 * range-parsing concern; this file owns reading the picked `File` into
 * bytes and turning each resulting part into its own download link. The
 * module (and pdf-lib with it) loads on demand — see `pdf-birlesdir-tool.tsx`
 * for why that matters and the pattern it follows.
 *
 * There is no zip step: bundling several files into one archive client-side
 * needs a compression library, and this tool adds none. Each part gets its
 * own link, and the download-all button just clicks through them in order.
 */

type PdfBolModule = typeof import("../lib/pdf-bol");

type SourceStatus = "idle" | "checking" | "ready" | "problem";

type SplitMode = "each-page" | "ranges" | "every-n";

type PartDownload = { name: string; url: string; pageCount: number };

let modulePromise: Promise<PdfBolModule> | null = null;
function loadModule(): Promise<PdfBolModule> {
  if (!modulePromise) {
    modulePromise = import("../lib/pdf-bol").catch((error: unknown) => {
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
}

const MODE_OPTIONS: { value: SplitMode; label: string }[] = [
  { value: "each-page", label: "hər səhifə" },
  { value: "ranges", label: "aralıqlarla" },
  { value: "every-n", label: "hər N səhifədən bir" },
];

export function PdfBolTool() {
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState<SourceStatus>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);

  const [mode, setMode] = useState<SplitMode>("ranges");
  const [rangesText, setRangesText] = useState("");
  const [everyNText, setEveryNText] = useState("1");
  const [isDragging, setIsDragging] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parts, setParts] = useState<PartDownload[]>([]);

  const partsRef = useRef(parts);
  useEffect(() => {
    partsRef.current = parts;
  }, [parts]);
  useEffect(
    () => () => {
      for (const part of partsRef.current) URL.revokeObjectURL(part.url);
    },
    [],
  );

  async function pickFile(picked: File) {
    for (const part of parts) URL.revokeObjectURL(part.url);
    setParts([]);
    setError(null);
    setFile(picked);
    setBytes(null);
    setPageCount(null);
    setProblem(null);
    setStatus("checking");

    try {
      const raw = new Uint8Array(await picked.arrayBuffer());
      const mod = await loadModule();
      const result = await mod.inspectPdf(raw);
      setBytes(raw);
      if (result.ok) {
        setStatus("ready");
        setPageCount(result.pageCount);
      } else {
        setStatus("problem");
        setProblem(result.error);
      }
    } catch (cause) {
      console.error("pdf-bol: file read failed", cause);
      setStatus("problem");
      setProblem("Fayl oxunmadı — zədəli ola bilər.");
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    if (picked) void pickFile(picked);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const picked = event.dataTransfer.files[0];
    if (picked) void pickFile(picked);
  }

  function optionsFromForm(): SplitOptions | null {
    if (mode === "each-page") return { mode: "each-page" };
    if (mode === "every-n") {
      const everyN = Number(everyNText.trim());
      if (!Number.isInteger(everyN) || everyN < 1) return null;
      return { mode: "every-n", everyN };
    }
    if (rangesText.trim() === "") return null;
    return { mode: "ranges", expression: rangesText };
  }

  async function handleSplit() {
    setError(null);
    if (status !== "ready" || bytes === null || file === null) {
      setError("Əvvəlcə düzgün açılan bir PDF seç.");
      return;
    }
    const options = optionsFromForm();
    if (options === null) {
      setError(
        mode === "ranges"
          ? "Səhifə aralığını yaz — məsələn 1-3, 5, 8-10."
          : "Neçə səhifədən bir bölünəcəyini müsbət tam ədədlə yaz.",
      );
      return;
    }

    setBusy(true);
    try {
      const mod = await loadModule();
      const result = await mod.splitPdf(bytes, file.name, options);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      for (const part of parts) URL.revokeObjectURL(part.url);
      setParts(
        result.parts.map((part) => ({
          name: part.name,
          pageCount: part.pageCount,
          url: URL.createObjectURL(new Blob([part.bytes as BlobPart], { type: "application/pdf" })),
        })),
      );
    } catch (cause) {
      console.error("pdf-bol: split failed", cause);
      setError("Bölmə alınmadı — bir daha yoxla.");
    } finally {
      setBusy(false);
    }
  }

  function downloadAll() {
    parts.forEach((part, index) => {
      // Spread across ticks: several `a.click()` calls in the same task can
      // have every one but the first silently blocked as a pop-up by some
      // browsers' "multiple automatic downloads" guard.
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = part.url;
        link.download = part.name;
        link.click();
      }, index * 300);
    });
  }

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Fayl" />
        <div className="space-y-3 p-4">
          <div className="relative">
            <input
              id="pdf-bol-input"
              type="file"
              accept="application/pdf"
              className="peer sr-only"
              onChange={onInputChange}
            />
            <label
              htmlFor="pdf-bol-input"
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
              <span className="font-ui text-sm">PDF seç və ya bura sürüşdür</span>
              <span className="font-ui text-xs text-muted">tək fayl</span>
            </label>
          </div>

          {file !== null && (
            <p className="font-ui text-sm">
              {file.name} <span className="text-muted tabular-nums">({formatBytes(file.size)})</span>
              {status === "checking" && <span className="text-muted"> — yoxlanılır…</span>}
              {status === "ready" && pageCount !== null && (
                <span className="text-muted tabular-nums"> — {pageCount} səhifə</span>
              )}
            </p>
          )}
          {status === "problem" && problem !== null && (
            <ToolNote tone="accent">{problem}</ToolNote>
          )}
        </div>
      </ToolPanel>

      {status === "ready" && (
        <ToolPanel>
          <ToolPanelHeader title="Bölmə üsulu" />
          <div className="space-y-4 p-4">
            <ToolSegmented options={MODE_OPTIONS} value={mode} onChange={setMode} label="Bölmə üsulu" />

            {mode === "ranges" && (
              <ToolField
                label="Səhifə aralığı"
                htmlFor="pdf-bol-ranges"
                note="vergüllə ayır — hər hissə ya tək səhifə, ya da başlanğıc-son"
              >
                <ToolInput
                  id="pdf-bol-ranges"
                  value={rangesText}
                  onChange={(event) => setRangesText(event.target.value)}
                  placeholder="1-3, 5, 8-10"
                />
              </ToolField>
            )}

            {mode === "every-n" && (
              <ToolField label="Neçə səhifədən bir" htmlFor="pdf-bol-every-n" suffix="səhifə">
                <ToolInput
                  id="pdf-bol-every-n"
                  inputMode="numeric"
                  value={everyNText}
                  onChange={(event) => setEveryNText(event.target.value)}
                />
              </ToolField>
            )}

            <ToolButton className="font-semibold" onClick={() => void handleSplit()} disabled={busy}>
              {busy ? "Bölünür…" : "Böl"}
            </ToolButton>
          </div>
        </ToolPanel>
      )}

      {error !== null && (
        <ToolNote tone="accent" title="Alınmadı">
          {error}
        </ToolNote>
      )}

      {parts.length > 0 && (
        <ToolResultPanel
          title="Nəticə"
          hint={`${parts.length} fayl`}
          action={
            parts.length > 1 ? (
              <ToolButton size="chip" onClick={downloadAll}>
                Hamısını endir
              </ToolButton>
            ) : undefined
          }
        >
          <ul className="divide-y divide-rule">
            {parts.map((part) => (
              <li key={part.name} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-auto truncate font-ui text-sm">{part.name}</span>
                <span className="shrink-0 font-ui text-xs text-muted tabular-nums">
                  {part.pageCount} səhifə
                </span>
                <a
                  href={part.url}
                  download={part.name}
                  className="shrink-0 font-ui text-xs font-medium text-accent-text underline-offset-2 hover:underline"
                >
                  Endir
                </a>
              </li>
            ))}
          </ul>
        </ToolResultPanel>
      )}
    </div>
  );
}
