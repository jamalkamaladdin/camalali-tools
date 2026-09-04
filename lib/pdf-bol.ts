/*
 * PDF splitting — the pure half. Same split as `pdf-birlesdir.ts` and for the
 * same reason: no `window`, no `File`, just bytes in and bytes out, so the
 * check suite can build a small PDF with pdf-lib, split it three ways and
 * verify each part's page count without a browser.
 *
 * `parsePageSelector` is the one function here worth reading closely — it is
 * the "1-3, 5, 8-10" expression the range mode is built on, and it is kept
 * fully separate from pdf-lib: given only a page count, it either returns the
 * parsed groups or names exactly which comma-separated piece was unreadable.
 */
import { PDFDocument } from "pdf-lib";

/** See `pdf-birlesdir.ts`'s copy of this function: pdf-lib's `EncryptedPDFError` class fails its own `instanceof` check (measured against 1.17.1), so the stable error message is what this matches instead. */
function isEncryptedPdfError(cause: unknown): boolean {
  return cause instanceof Error && /is encrypted/i.test(cause.message);
}

/** Above this a file is refused before it is parsed — splitting reads the whole document into memory once, then again per output part. */
export const MAX_SPLIT_FILE_BYTES = 50 * 1024 * 1024;
/** A guard against "split into 5000 files" freezing the tab, not a real product limit. */
export const MAX_SPLIT_PARTS = 300;

export type PageGroup = { from: number; to: number };

export type SplitOptions =
  | { mode: "each-page" }
  | { mode: "ranges"; expression: string }
  | { mode: "every-n"; everyN: number };

export type SplitPart = {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
  pageCount: number;
};

export type SplitResult =
  | { ok: true; parts: SplitPart[] }
  | { ok: false; error: string };

type LoadResult =
  | { ok: true; doc: PDFDocument }
  | { ok: false; error: string };

/** See `pdf-birlesdir.ts`'s copy of this function for why encryption gets its own message instead of falling into the generic parse failure. */
async function loadPdf(bytes: Uint8Array): Promise<LoadResult> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    return { ok: true, doc };
  } catch (cause) {
    if (isEncryptedPdfError(cause)) {
      return { ok: false, error: "Fayl parolla qorunub, açılmadan üzərində iş görmək olmur." };
    }
    return { ok: false, error: "Fayl PDF kimi oxunmadı — zədəli ola bilər və ya başqa formatdır." };
  }
}

/** What the widget shows once a file is picked, before a split mode is chosen. */
export async function inspectPdf(
  bytes: Uint8Array,
): Promise<{ ok: true; pageCount: number } | { ok: false; error: string }> {
  if (bytes.byteLength > MAX_SPLIT_FILE_BYTES) {
    return { ok: false, error: `Fayl ${Math.round(MAX_SPLIT_FILE_BYTES / (1024 * 1024))} MB həddini aşır.` };
  }
  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return loaded;
  return { ok: true, pageCount: loaded.doc.getPageCount() };
}

/**
 * `"1-3, 5, 8-10"` → three groups. Each comma-separated piece is either a bare
 * page number or a `from-to` pair; anything else, an inverted pair (`5-2`) or
 * a page outside `1..pageCount` (including `0`) is reported by naming the
 * exact piece that failed, not the whole expression.
 */
export function parsePageSelector(
  expression: string,
  pageCount: number,
): { ok: true; groups: PageGroup[] } | { ok: false; error: string } {
  const pieces = expression
    .split(",")
    .map((piece) => piece.trim())
    .filter((piece) => piece !== "");
  if (pieces.length === 0) {
    return { ok: false, error: "Səhifə aralığı boşdur — məsələn 1-3, 5, 8-10 yaz." };
  }

  const groups: PageGroup[] = [];
  for (const piece of pieces) {
    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(piece);
    const singleMatch = /^(\d+)$/.exec(piece);
    let from: number;
    let to: number;
    if (rangeMatch) {
      from = Number(rangeMatch[1]);
      to = Number(rangeMatch[2]);
    } else if (singleMatch) {
      from = Number(singleMatch[1]);
      to = from;
    } else {
      return { ok: false, error: `"${piece}" oxunmadı — "3" və ya "1-3" formatında yaz.` };
    }

    if (from < 1 || to < 1) {
      return { ok: false, error: `"${piece}" — səhifə nömrələri 1-dən başlayır.` };
    }
    if (from > to) {
      return { ok: false, error: `"${piece}" — başlanğıc səhifə son səhifədən böyükdür.` };
    }
    if (to > pageCount) {
      return { ok: false, error: `"${piece}" — sənəddə cəmi ${pageCount} səhifə var.` };
    }
    groups.push({ from, to });
  }
  return { ok: true, groups };
}

/** `pageCount` pages, `everyN` at a time — the last group takes whatever is left over. */
export function chunkEveryN(pageCount: number, everyN: number): PageGroup[] {
  if (!Number.isInteger(everyN) || everyN < 1) return [];
  const groups: PageGroup[] = [];
  for (let start = 1; start <= pageCount; start += everyN) {
    groups.push({ from: start, to: Math.min(start + everyN - 1, pageCount) });
  }
  return groups;
}

/** `("sened.pdf", 1, 3)` → `"sened-1-3.pdf"`; a single-page group drops the second number. */
export function buildPartFilename(baseName: string, group: PageGroup): string {
  const stem = baseName.replace(/\.pdf$/i, "").trim() || "sened";
  return group.from === group.to
    ? `${stem}-${group.from}.pdf`
    : `${stem}-${group.from}-${group.to}.pdf`;
}

function groupsFor(
  options: SplitOptions,
  pageCount: number,
): { ok: true; groups: PageGroup[] } | { ok: false; error: string } {
  if (options.mode === "each-page") {
    return {
      ok: true,
      groups: Array.from({ length: pageCount }, (_, index) => ({ from: index + 1, to: index + 1 })),
    };
  }
  if (options.mode === "every-n") {
    if (!Number.isInteger(options.everyN) || options.everyN < 1) {
      return { ok: false, error: "Neçə səhifədən bir bölünəcəyi müsbət tam ədəd olmalıdır." };
    }
    return { ok: true, groups: chunkEveryN(pageCount, options.everyN) };
  }
  return parsePageSelector(options.expression, pageCount);
}

/** One output document per group, built from independent copies of the source pages so the parts share nothing and can be downloaded and reopened on their own. */
async function buildPart(source: PDFDocument, baseName: string, group: PageGroup): Promise<SplitPart> {
  const output = await PDFDocument.create();
  const indices: number[] = [];
  for (let page = group.from; page <= group.to; page += 1) indices.push(page - 1);

  const copiedPages = await output.copyPages(source, indices);
  for (const page of copiedPages) output.addPage(page);

  const saved = await output.save({ useObjectStreams: false });
  // See `pdf-birlesdir.ts` for why this copy is needed rather than handing
  // `saved` straight back: pdf-lib's declared return type widens to
  // `Uint8Array<ArrayBufferLike>` under this project's TypeScript, which
  // `Blob` refuses.
  return { name: buildPartFilename(baseName, group), bytes: new Uint8Array(saved), pageCount: copiedPages.length };
}

export async function splitPdf(
  bytes: Uint8Array,
  baseName: string,
  options: SplitOptions,
): Promise<SplitResult> {
  if (bytes.byteLength > MAX_SPLIT_FILE_BYTES) {
    return { ok: false, error: `Fayl ${Math.round(MAX_SPLIT_FILE_BYTES / (1024 * 1024))} MB həddini aşır.` };
  }

  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const pageCount = loaded.doc.getPageCount();
  if (pageCount === 0) return { ok: false, error: "Bu PDF-də heç bir səhifə yoxdur." };

  const resolved = groupsFor(options, pageCount);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  if (resolved.groups.length === 0) {
    return { ok: false, error: "Bölmək üçün heç bir hissə hesablanmadı." };
  }
  if (resolved.groups.length > MAX_SPLIT_PARTS) {
    return {
      ok: false,
      error: `Nəticə ${resolved.groups.length} fayl olardı — ${MAX_SPLIT_PARTS}-dən çox faylı brauzerdə eyni anda yaratmaq olmur.`,
    };
  }

  const parts: SplitPart[] = [];
  for (const group of resolved.groups) {
    parts.push(await buildPart(loaded.doc, baseName, group));
  }
  return { ok: true, parts };
}
