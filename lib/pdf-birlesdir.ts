/*
 * PDF merging — the pure half. No `window`, no `document`, no `File`: this
 * file takes the raw bytes of one or more PDFs a visitor picked (already read
 * off disk by the widget) and returns the merged bytes back out, or an
 * `ok: false` result naming exactly what was wrong with which file.
 *
 * pdf-lib runs fine under Node, which is what lets `mergePdfs` itself — not
 * just its supporting arithmetic — live here and be driven by the check
 * suite: build two tiny PDFs with pdf-lib, merge them, and count pages on
 * the result. `resolvePageRange` is kept separate from the async pdf-lib
 * calls on purpose — it is the one part of this file that is plain
 * arithmetic on numbers, so its edge cases (an inverted range, a page past
 * the end) are checked without ever touching a document.
 */
import { PDFDocument } from "pdf-lib";

/**
 * pdf-lib does export an `EncryptedPDFError` class, but `instanceof` against
 * it is unreliable: measured directly against pdf-lib 1.17.1, the class is
 * compiled down in a way that breaks the prototype chain for anything
 * extending the built-in `Error` — `new EncryptedPDFError() instanceof
 * EncryptedPDFError` itself comes back `false`. The message it throws is
 * stable, so that is what this checks instead.
 */
function isEncryptedPdfError(cause: unknown): boolean {
  return cause instanceof Error && /is encrypted/i.test(cause.message);
}

/** Above this a single input is refused before it is even parsed. */
export const MAX_MERGE_FILE_BYTES = 50 * 1024 * 1024;
/** Above this the whole batch is refused — several files under the per-file cap can still add up to more than a browser tab should hold at once. */
export const MAX_MERGE_TOTAL_BYTES = 150 * 1024 * 1024;

export type PageRange = { from: number; to: number };

export type MergeInput = {
  bytes: Uint8Array;
  /** 1-based inclusive; omitted takes every page of this file. */
  range?: PageRange;
};

export type MergeMetadata = {
  title?: string;
  author?: string;
};

export type MergeResult =
  | { ok: true; bytes: Uint8Array<ArrayBuffer>; pageCount: number }
  | { ok: false; error: string };

export type PdfInspection =
  | { ok: true; pageCount: number }
  | { ok: false; encrypted: boolean; error: string };

type LoadResult =
  | { ok: true; doc: PDFDocument }
  | { ok: false; encrypted: boolean; error: string };

/**
 * Every entry point below opens a document through this one function, so a
 * password-protected file is told apart from an actually-corrupt one in
 * exactly one place. pdf-lib refuses to parse an encrypted document unless
 * told to ignore that (`ignoreEncryption: true`), and it does not support
 * writing one back out even then — so this never sets that flag, and an
 * encrypted input surfaces as its own case rather than a generic parse
 * failure.
 */
async function loadPdf(bytes: Uint8Array): Promise<LoadResult> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    return { ok: true, doc };
  } catch (cause) {
    if (isEncryptedPdfError(cause)) {
      return {
        ok: false,
        encrypted: true,
        error: "Fayl parolla qorunub, açılmadan üzərində iş görmək olmur.",
      };
    }
    return {
      ok: false,
      encrypted: false,
      error: "Fayl PDF kimi oxunmadı — zədəli ola bilər və ya başqa formatdır.",
    };
  }
}

/** What the widget shows next to each picked file before the merge runs. */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  if (bytes.byteLength > MAX_MERGE_FILE_BYTES) {
    return {
      ok: false,
      encrypted: false,
      error: `Fayl ${formatMb(MAX_MERGE_FILE_BYTES)} MB həddini aşır.`,
    };
  }
  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return loaded;
  return { ok: true, pageCount: loaded.doc.getPageCount() };
}

/**
 * Turns a 1-based `from`/`to` (or "the whole file") into the 0-based page
 * indices pdf-lib's `copyPages` wants. Kept pure and separate from
 * `mergePdfs` so every malformed range — inverted, out of bounds, zero —
 * is a case the check suite can hit without building a PDFDocument.
 */
export function resolvePageRange(
  pageCount: number,
  range?: PageRange,
): { ok: true; indices: number[] } | { ok: false; error: string } {
  if (!range) {
    return { ok: true, indices: Array.from({ length: pageCount }, (_, index) => index) };
  }
  const { from, to } = range;
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    return { ok: false, error: "Səhifə nömrələri tam ədəd olmalıdır." };
  }
  if (from < 1 || to < 1) {
    return { ok: false, error: "Səhifə nömrələri 1-dən başlayır." };
  }
  if (from > to) {
    return {
      ok: false,
      error: `Başlanğıc səhifə (${from}) son səhifədən (${to}) böyük ola bilməz.`,
    };
  }
  if (to > pageCount) {
    return {
      ok: false,
      error: `Bu faylda cəmi ${pageCount} səhifə var, ${to}-ci səhifə yoxdur.`,
    };
  }
  const indices: number[] = [];
  for (let page = from; page <= to; page += 1) indices.push(page - 1);
  return { ok: true, indices };
}

function formatMb(bytes: number): string {
  return String(Math.round(bytes / (1024 * 1024)));
}

/**
 * Merges `inputs` in the order given, each optionally cut down to its own
 * page range, into one document. A problem with the Nth file — encrypted,
 * not a PDF, a range past its last page — is reported with that file's
 * position (`"2-ci fayl: ..."`) rather than a position-less error, because
 * with several files loaded at once "something is wrong" is not actionable.
 */
export async function mergePdfs(
  inputs: MergeInput[],
  metadata: MergeMetadata = {},
): Promise<MergeResult> {
  if (inputs.length < 2) {
    return { ok: false, error: "Birləşdirmək üçün ən azı iki PDF seç." };
  }

  const totalBytes = inputs.reduce((sum, input) => sum + input.bytes.byteLength, 0);
  if (totalBytes > MAX_MERGE_TOTAL_BYTES) {
    return {
      ok: false,
      error: `Faylların cəmi ${formatMb(MAX_MERGE_TOTAL_BYTES)} MB həddini aşır — brauzerdə bu qədərini eyni anda emal etmək olmur.`,
    };
  }
  for (const [index, input] of inputs.entries()) {
    if (input.bytes.byteLength > MAX_MERGE_FILE_BYTES) {
      return {
        ok: false,
        error: `${index + 1}-ci fayl ${formatMb(MAX_MERGE_FILE_BYTES)} MB həddini aşır.`,
      };
    }
  }

  const output = await PDFDocument.create();
  let totalPages = 0;

  for (const [index, input] of inputs.entries()) {
    const loaded = await loadPdf(input.bytes);
    if (!loaded.ok) return { ok: false, error: `${index + 1}-ci fayl: ${loaded.error}` };

    const resolved = resolvePageRange(loaded.doc.getPageCount(), input.range);
    if (!resolved.ok) return { ok: false, error: `${index + 1}-ci fayl: ${resolved.error}` };
    if (resolved.indices.length === 0) continue;

    const copiedPages = await output.copyPages(loaded.doc, resolved.indices);
    for (const page of copiedPages) output.addPage(page);
    totalPages += copiedPages.length;
  }

  if (totalPages === 0) {
    return { ok: false, error: "Seçilmiş aralıqlarda heç bir səhifə qalmadı." };
  }

  if (metadata.title !== undefined) output.setTitle(metadata.title);
  if (metadata.author !== undefined) output.setAuthor(metadata.author);

  const saved = await output.save({ useObjectStreams: false });
  // A copy constructed from the ArrayLike overload rather than the raw save
  // result: pdf-lib's own .d.ts predates TypeScript's generic `Uint8Array<T>`,
  // so the bare type it declares widens to `Uint8Array<ArrayBufferLike>` here
  // — a type `Blob`'s constructor refuses. Copying through `new Uint8Array(x)`
  // allocates a fresh, concrete `ArrayBuffer` and narrows the type with it.
  return { ok: true, bytes: new Uint8Array(saved), pageCount: totalPages };
}
