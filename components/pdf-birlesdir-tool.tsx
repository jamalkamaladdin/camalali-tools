"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import { formatBytes } from "../shared/format";
import type { MergeInput } from "../lib/pdf-birlesdir";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
} from "./ui";

/*
 * The DOM half of the merge tool. `pdf-birlesdir.ts` holds every pdf-lib
 * concern — loading, encryption detection, the actual merge; this file owns
 * exactly what that file cannot know about: reading picked `File`s into
 * bytes, the reorder/remove list, and turning the merged bytes into a
 * download. The module itself (and the ~330 KB of pdf-lib it pulls in) is
 * loaded on demand, the same way `faktura-tool.tsx` loads the invoice
 * builder — nothing here enters the page's first script until a PDF is
 * actually picked.
 */

type PdfBirlesdirModule = typeof import("../lib/pdf-birlesdir");

type FileStatus = "checking" | "ready" | "problem";

type MergeFileItem = {
  id: string;
  file: File;
  bytes: Uint8Array | null;
  status: FileStatus;
  pageCount: number | null;
  problem: string | null;
  fromText: string;
  toText: string;
};

let idCounter = 0;
function makeId(): string {
  idCounter += 1;
  return `pdf-birlesdir-${idCounter}`;
}

let modulePromise: Promise<PdfBirlesdirModule> | null = null;
function loadModule(): Promise<PdfBirlesdirModule> {
  if (!modulePromise) {
    modulePromise = import("../lib/pdf-birlesdir").catch((error: unknown) => {
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

/** Both fields empty takes the whole file; exactly one filled is treated as a mistake rather than guessed at, since either end could reasonably mean "start" or "finish" and guessing wrong would silently drop pages. */
function parseOptionalRange(
  fromText: string,
  toText: string,
): { ok: true; range: { from: number; to: number } | undefined } | { ok: false } {
  const from = fromText.trim();
  const to = toText.trim();
  if (from === "" && to === "") return { ok: true, range: undefined };
  if (from === "" || to === "") return { ok: false };
  const fromValue = Number(from);
  const toValue = Number(to);
  if (!Number.isFinite(fromValue) || !Number.isFinite(toValue)) return { ok: false };
  return { ok: true, range: { from: fromValue, to: toValue } };
}

export function PdfBirlesdirTool() {
  const [items, setItems] = useState<MergeFileItem[]>([]);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ pageCount: number } | null>(null);

  async function inspectItem(id: string, file: File) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mod = await loadModule();
      const result = await mod.inspectPdf(bytes);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                bytes,
                status: result.ok ? "ready" : "problem",
                pageCount: result.ok ? result.pageCount : null,
                problem: result.ok ? null : result.error,
              }
            : item,
        ),
      );
    } catch (cause) {
      console.error("pdf-birlesdir: fayl oxunmadı", cause);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: "problem", problem: "Fayl oxunmadı: zədəli ola bilər." }
            : item,
        ),
      );
    }
  }

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList).filter(
      (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
    );
    if (incoming.length === 0) return;

    const newItems: MergeFileItem[] = incoming.map((file) => ({
      id: makeId(),
      file,
      bytes: null,
      status: "checking",
      pageCount: null,
      problem: null,
      fromText: "",
      toText: "",
    }));
    setItems((prev) => [...prev, ...newItems]);
    setDone(null);
    for (const item of newItems) void inspectItem(item.id, item.file);
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
      const a = next[index] as MergeFileItem;
      const b = next[target] as MergeFileItem;
      next[index] = b;
      next[target] = a;
      return next;
    });
  }

  function updateRange(id: string, field: "fromText" | "toText", value: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
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

  async function handleMerge() {
    setError(null);
    setDone(null);

    if (items.length < 2) {
      setError("Birləşdirmək üçün ən azı iki PDF seç.");
      return;
    }
    const notReady = items.find((item) => item.status !== "ready" || item.bytes === null);
    if (notReady) {
      setError(`"${notReady.file.name}" hazır deyil: problemli faylı siyahıdan çıxar.`);
      return;
    }

    const inputs: MergeInput[] = [];
    for (const item of items) {
      const parsed = parseOptionalRange(item.fromText, item.toText);
      if (!parsed.ok) {
        setError(`"${item.file.name}": səhifə nömrələri tam ədəd olmalıdır.`);
        return;
      }
      inputs.push({ bytes: item.bytes as Uint8Array, range: parsed.range });
    }

    setBusy(true);
    try {
      const mod = await loadModule();
      const result = await mod.mergePdfs(inputs, {
        title: title.trim() || undefined,
        author: author.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      downloadBytes(result.bytes, "birlesdirilmis.pdf");
      setDone({ pageCount: result.pageCount });
    } catch (cause) {
      console.error("pdf-birlesdir: birləşdirmə alınmadı", cause);
      setError("Birləşdirmə alınmadı: bir daha yoxla.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Fayllar" hint={items.length > 0 ? `${items.length} PDF` : undefined} />
        <div className="space-y-4 p-4">
          <div className="relative">
            <input
              id="pdf-birlesdir-input"
              type="file"
              accept="application/pdf"
              multiple
              className="peer sr-only"
              onChange={onInputChange}
            />
            <label
              htmlFor="pdf-birlesdir-input"
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
              <span className="font-ui text-xs text-muted">bir neçəsi birdən, hər hansı sıra ilə</span>
            </label>
          </div>

          {items.length > 0 && (
            <ul className="space-y-2">
              {items.map((item, index) => (
                <li key={item.id} className="rounded border border-rule p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-auto truncate font-ui text-sm">
                      {index + 1}. {item.file.name}
                    </span>
                    <span className="shrink-0 font-ui text-xs text-muted tabular-nums">
                      {formatBytes(item.file.size)}
                      {item.status === "ready" && item.pageCount !== null
                        ? ` · ${item.pageCount} səhifə`
                        : ""}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <ToolButton
                        size="chip"
                        onClick={() => moveItem(item.id, "up")}
                        disabled={index === 0}
                        aria-label="Yuxarı"
                      >
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
                  </div>

                  {item.status === "checking" && (
                    <p className="mt-2 font-ui text-xs text-muted">Yoxlanılır…</p>
                  )}
                  {item.status === "problem" && (
                    <p className="mt-2 font-ui text-xs text-accent-text">{item.problem}</p>
                  )}
                  {item.status === "ready" && (
                    <div className="mt-2 grid max-w-64 grid-cols-2 gap-2">
                      <ToolField label="Başlanğıc səhifə" htmlFor={`${item.id}-from`}>
                        <ToolInput
                          id={`${item.id}-from`}
                          inputMode="numeric"
                          placeholder="1"
                          value={item.fromText}
                          onChange={(event) => updateRange(item.id, "fromText", event.target.value)}
                        />
                      </ToolField>
                      <ToolField label="Son səhifə" htmlFor={`${item.id}-to`}>
                        <ToolInput
                          id={`${item.id}-to`}
                          inputMode="numeric"
                          placeholder={String(item.pageCount ?? "")}
                          value={item.toText}
                          onChange={(event) => updateRange(item.id, "toText", event.target.value)}
                        />
                      </ToolField>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Nəticənin adı" hint="istəyə bağlı" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 p-4">
          <ToolField label="Başlıq" htmlFor="pdf-birlesdir-title">
            <ToolInput
              id="pdf-birlesdir-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="məsələn Müqavilə paketi"
            />
          </ToolField>
          <ToolField label="Müəllif" htmlFor="pdf-birlesdir-author">
            <ToolInput
              id="pdf-birlesdir-author"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
            />
          </ToolField>
        </div>
      </ToolPanel>

      <ToolButton className="font-semibold" onClick={() => void handleMerge()} disabled={busy}>
        {busy ? "Birləşdirilir…" : "Birləşdir və endir"}
      </ToolButton>

      {error !== null && (
        <ToolNote tone="accent" title="Alınmadı">
          {error}
        </ToolNote>
      )}

      {done !== null && (
        <ToolResultPanel title="Hazırdır" hint={`${done.pageCount} səhifə`}>
          <p className="p-4 font-ui text-sm text-muted">
            <code>birlesdirilmis.pdf</code> endirildi: brauzerin öz endirmə qovluğuna baxa bilərsən.
          </p>
        </ToolResultPanel>
      )}
    </div>
  );
}
