"use client";

import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { formatBytes } from "../shared/format";
import type { PageOp, PlanPage } from "../lib/pdf-sehife";
import {
  ToolButton,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
} from "./ui";

/*
 * The DOM half of the page-editing tool. `pdf-sehife.ts` holds the plan
 * reducer (`applyOps`) and the pdf-lib build step; this file owns reading
 * the picked `File`, turning button clicks into `PageOp`s, and — because
 * there is no PDF renderer here to draw an actual page thumbnail — drawing
 * each plan entry as a numbered card instead. The module (and pdf-lib with
 * it) loads on demand, the same way the other two PDF tools do.
 *
 * The plan itself is never held in state directly: only the operation list
 * is. What is shown on screen is `applyOps(initial, ops)`, recomputed every
 * render, which is what makes "undo" a one-line `ops.slice(0, -1)` instead
 * of a second, hand-written inverse for every kind of edit.
 */

type PdfSehifeModule = typeof import("../lib/pdf-sehife");

type SourceStatus = "idle" | "checking" | "ready" | "problem";

let modulePromise: Promise<PdfSehifeModule> | null = null;
function loadModule(): Promise<PdfSehifeModule> {
  if (!modulePromise) {
    modulePromise = import("../lib/pdf-sehife").catch((error: unknown) => {
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
}

let idCounter = 0;
function makeId(): string {
  idCounter += 1;
  return `pdf-sehife-new-${idCounter}`;
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

function outputFilename(sourceName: string): string {
  const stem = sourceName.replace(/\.pdf$/i, "").trim() || "sened";
  return `${stem}-redakte.pdf`;
}

function pageLabel(page: PlanPage): string {
  return page.sourceIndex === null ? "boş səhifə" : `mənbə səhifə ${page.sourceIndex + 1}`;
}

export function PdfSehifeTool() {
  const [mod, setMod] = useState<PdfSehifeModule | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState<SourceStatus>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [ops, setOps] = useState<PageOp[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [done, setDone] = useState<{ pageCount: number } | null>(null);

  const initialPlan = useMemo<PlanPage[]>(
    () => (mod && pageCount !== null ? mod.initialPlan(pageCount) : []),
    [mod, pageCount],
  );

  const planResult = useMemo(
    () => (mod ? mod.applyOps(initialPlan, ops) : { ok: true as const, plan: initialPlan }),
    [mod, initialPlan, ops],
  );
  const plan = planResult.ok ? planResult.plan : [];
  const planError = planResult.ok ? null : planResult.error;

  async function pickFile(picked: File) {
    setDone(null);
    setBuildError(null);
    setFile(picked);
    setBytes(null);
    setPageCount(null);
    setOps([]);
    setProblem(null);
    setStatus("checking");

    try {
      const raw = new Uint8Array(await picked.arrayBuffer());
      const loadedModule = await loadModule();
      setMod(loadedModule);
      const result = await loadedModule.inspectPdf(raw);
      setBytes(raw);
      if (result.ok) {
        setStatus("ready");
        setPageCount(result.pageCount);
      } else {
        setStatus("problem");
        setProblem(result.error);
      }
    } catch (cause) {
      console.error("pdf-sehife: file read failed", cause);
      setStatus("problem");
      setProblem("Fayl oxunmadı: zədəli ola bilər.");
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

  function pushOp(op: PageOp) {
    setDone(null);
    setOps((prev) => [...prev, op]);
  }

  function undo() {
    setOps((prev) => prev.slice(0, -1));
  }

  async function handleBuild() {
    setBuildError(null);
    if (bytes === null || file === null || plan.length === 0) {
      setBuildError("Əvvəlcə düzgün açılan bir PDF seç.");
      return;
    }
    setBusy(true);
    try {
      const loadedModule = mod ?? (await loadModule());
      const result = await loadedModule.buildFromPlan(bytes, plan);
      if (!result.ok) {
        setBuildError(result.error);
        return;
      }
      downloadBytes(result.bytes, outputFilename(file.name));
      setDone({ pageCount: result.pageCount });
    } catch (cause) {
      console.error("pdf-sehife: build failed", cause);
      setBuildError("Sənəd hazırlanmadı, bir daha yoxla.");
    } finally {
      setBusy(false);
    }
  }

  const atPlanLimit = mod !== null && plan.length >= mod.MAX_PLAN_PAGES;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Fayl" />
        <div className="space-y-3 p-4">
          <div className="relative">
            <input
              id="pdf-sehife-input"
              type="file"
              accept="application/pdf"
              className="peer sr-only"
              onChange={onInputChange}
            />
            <label
              htmlFor="pdf-sehife-input"
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
              {status === "checking" && <span className="text-muted">: yoxlanılır…</span>}
            </p>
          )}
          {status === "problem" && problem !== null && <ToolNote tone="accent">{problem}</ToolNote>}
        </div>
      </ToolPanel>

      {status === "ready" && (
        <ToolPanel>
          <ToolPanelHeader
            title="Səhifələr"
            hint={`${plan.length} səhifə`}
            action={
              <>
                <ToolButton
                  size="chip"
                  onClick={() => pushOp({ type: "insert-blank", newId: makeId(), afterId: null })}
                  disabled={atPlanLimit}
                >
                  Əvvələ boş səhifə
                </ToolButton>
                <ToolButton size="chip" onClick={() => pushOp({ type: "reverse" })}>
                  Sıranı tərs çevir
                </ToolButton>
                <ToolButton size="chip" onClick={undo} disabled={ops.length === 0}>
                  Geri al
                </ToolButton>
              </>
            }
          />

          {planError !== null && (
            <div className="p-4">
              <ToolNote tone="accent">{planError}</ToolNote>
            </div>
          )}

          <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 p-4">
            {plan.map((page, index) => (
              <li key={page.id} className="rounded border border-rule p-3">
                <p className="font-ui text-sm font-medium">{index + 1}.</p>
                <p className="mt-0.5 font-ui text-xs text-muted">{pageLabel(page)}</p>
                {page.rotation !== 0 && (
                  <p className="font-ui text-xs text-muted tabular-nums">{page.rotation}° fırlanıb</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  <ToolButton
                    size="chip"
                    onClick={() => pushOp({ type: "move", id: page.id, direction: "up" })}
                    disabled={index === 0}
                    aria-label="Yuxarı"
                  >
                    ↑
                  </ToolButton>
                  <ToolButton
                    size="chip"
                    onClick={() => pushOp({ type: "move", id: page.id, direction: "down" })}
                    disabled={index === plan.length - 1}
                    aria-label="Aşağı"
                  >
                    ↓
                  </ToolButton>
                  <ToolButton
                    size="chip"
                    onClick={() => pushOp({ type: "rotate", id: page.id, by: 90 })}
                  >
                    Fırlat
                  </ToolButton>
                  <ToolButton
                    size="chip"
                    onClick={() => pushOp({ type: "duplicate", id: page.id, newId: makeId() })}
                    disabled={atPlanLimit}
                  >
                    Təkrarla
                  </ToolButton>
                  <ToolButton
                    size="chip"
                    onClick={() =>
                      pushOp({ type: "insert-blank", newId: makeId(), afterId: page.id })
                    }
                    disabled={atPlanLimit}
                  >
                    Sonrasına boş
                  </ToolButton>
                  <ToolButton
                    size="chip"
                    onClick={() => pushOp({ type: "delete", id: page.id })}
                    disabled={plan.length <= 1}
                  >
                    Sil
                  </ToolButton>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t border-rule p-4">
            <ToolButton className="font-semibold" onClick={() => void handleBuild()} disabled={busy}>
              {busy ? "Hazırlanır…" : "Tətbiq et və endir"}
            </ToolButton>
          </div>
        </ToolPanel>
      )}

      {buildError !== null && (
        <ToolNote tone="accent" title="Alınmadı">
          {buildError}
        </ToolNote>
      )}

      {done !== null && (
        <ToolResultPanel title="Hazırdır" hint={`${done.pageCount} səhifə`}>
          <p className="p-4 font-ui text-sm text-muted">
            Redaktə edilmiş fayl endirildi: brauzerin öz endirmə qovluğuna baxa bilərsən.
          </p>
        </ToolResultPanel>
      )}
    </div>
  );
}
