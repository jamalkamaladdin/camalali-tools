/*
 * Page-level PDF editing — the pure half, and the one with no direct pdf-lib
 * counterpart to lean on: pdf-lib mutates a document in place, but this tool
 * shows the visitor a queue of operations they can undo one at a time before
 * anything is actually written. So the two concerns are split. `applyOps`
 * below is a plain reducer over a "plan" — which source page (or none, for
 * an inserted blank) sits at each position, and what rotation it carries —
 * and never touches pdf-lib. `buildFromPlan` is the one function that does:
 * given the original bytes and a finished plan, it produces the output PDF.
 *
 * That split is what makes undo free: the widget keeps the operation list,
 * not the plan, and undo is dropping the last entry and re-running the
 * reducer from the start — there is no separate "undo a delete" function to
 * get wrong. It is also what the check suite exercises without ever loading
 * pdf-lib: `applyOps` on a plan of five pages is checked by construction, and
 * only `buildFromPlan` needs a real (tiny, hand-built) PDF underneath it.
 */
import { degrees, PDFDocument } from "pdf-lib";

export const MAX_PAGE_FILE_BYTES = 50 * 1024 * 1024;
/** A guard against an unbounded insert/duplicate loop, not a real document size limit. */
export const MAX_PLAN_PAGES = 1000;

export type RotationDelta = 0 | 90 | 180 | 270;

export type PlanPage = {
  id: string;
  /** 0-based index into the source document; `null` marks an inserted blank page. */
  sourceIndex: number | null;
  /** Added to whatever rotation the source page already carried. */
  rotation: RotationDelta;
};

/**
 * `insert-blank` and `duplicate` carry the new page's id rather than having
 * this module invent one — every other tool in this layer generates its ids
 * at the widget where React needs a stable key anyway, and doing it there
 * keeps every function below a pure function of its arguments.
 */
export type PageOp =
  | { type: "delete"; id: string }
  | { type: "move"; id: string; direction: "up" | "down" }
  | { type: "rotate"; id: string; by: 90 | 180 | 270 }
  | { type: "insert-blank"; newId: string; afterId: string | null }
  | { type: "duplicate"; id: string; newId: string }
  | { type: "reverse" };

type PlanResult = { ok: true; plan: PlanPage[] } | { ok: false; error: string };

export function initialPlan(pageCount: number): PlanPage[] {
  return Array.from({ length: pageCount }, (_, index) => ({
    id: `p${index + 1}`,
    sourceIndex: index,
    rotation: 0,
  }));
}

function findIndex(plan: PlanPage[], id: string): number {
  return plan.findIndex((page) => page.id === id);
}

function deletePage(plan: PlanPage[], id: string): PlanResult {
  if (plan.length <= 1) return { ok: false, error: "Ən azı bir səhifə qalmalıdır." };
  const index = findIndex(plan, id);
  if (index === -1) return { ok: false, error: "Səhifə tapılmadı — siyahı artıq dəyişib." };
  return { ok: true, plan: plan.filter((page) => page.id !== id) };
}

function movePage(plan: PlanPage[], id: string, direction: "up" | "down"): PlanResult {
  const index = findIndex(plan, id);
  if (index === -1) return { ok: false, error: "Səhifə tapılmadı — siyahı artıq dəyişib." };
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= plan.length) return { ok: false, error: "Səhifə artıq kənardadır." };
  const next = [...plan];
  [next[index], next[target]] = [next[target] as PlanPage, next[index] as PlanPage];
  return { ok: true, plan: next };
}

function rotatePage(plan: PlanPage[], id: string, by: 90 | 180 | 270): PlanResult {
  const index = findIndex(plan, id);
  if (index === -1) return { ok: false, error: "Səhifə tapılmadı — siyahı artıq dəyişib." };
  const page = plan[index] as PlanPage;
  const rotation = ((page.rotation + by) % 360) as RotationDelta;
  const next = [...plan];
  next[index] = { ...page, rotation };
  return { ok: true, plan: next };
}

function insertBlankPage(plan: PlanPage[], newId: string, afterId: string | null): PlanResult {
  if (plan.length >= MAX_PLAN_PAGES) {
    return { ok: false, error: `Plan ${MAX_PLAN_PAGES} səhifə həddinə çatıb.` };
  }
  const blank: PlanPage = { id: newId, sourceIndex: null, rotation: 0 };
  if (afterId === null) return { ok: true, plan: [blank, ...plan] };
  const index = findIndex(plan, afterId);
  if (index === -1) return { ok: false, error: "Səhifə tapılmadı — siyahı artıq dəyişib." };
  const next = [...plan];
  next.splice(index + 1, 0, blank);
  return { ok: true, plan: next };
}

function duplicatePage(plan: PlanPage[], id: string, newId: string): PlanResult {
  if (plan.length >= MAX_PLAN_PAGES) {
    return { ok: false, error: `Plan ${MAX_PLAN_PAGES} səhifə həddinə çatıb.` };
  }
  const index = findIndex(plan, id);
  if (index === -1) return { ok: false, error: "Səhifə tapılmadı — siyahı artıq dəyişib." };
  const clone: PlanPage = { ...(plan[index] as PlanPage), id: newId };
  const next = [...plan];
  next.splice(index + 1, 0, clone);
  return { ok: true, plan: next };
}

function applyOp(plan: PlanPage[], op: PageOp): PlanResult {
  switch (op.type) {
    case "delete":
      return deletePage(plan, op.id);
    case "move":
      return movePage(plan, op.id, op.direction);
    case "rotate":
      return rotatePage(plan, op.id, op.by);
    case "insert-blank":
      return insertBlankPage(plan, op.newId, op.afterId);
    case "duplicate":
      return duplicatePage(plan, op.id, op.newId);
    case "reverse":
      return { ok: true, plan: [...plan].reverse() };
  }
}

/**
 * Replays every operation from `initial` in order. The widget's "undo" is
 * calling this again with the same `initial` and the ops array minus its
 * last entry — there is no mutable plan sitting anywhere that undo would
 * have to unwind by hand.
 */
export function applyOps(initial: PlanPage[], ops: PageOp[]): PlanResult {
  let plan = initial;
  for (const op of ops) {
    const result = applyOp(plan, op);
    if (!result.ok) return result;
    plan = result.plan;
  }
  return { ok: true, plan };
}

export type BuildResult =
  | { ok: true; bytes: Uint8Array<ArrayBuffer>; pageCount: number }
  | { ok: false; error: string };

type LoadResult =
  | { ok: true; doc: PDFDocument }
  | { ok: false; error: string };

/** See `pdf-birlesdir.ts`'s copy of this function: pdf-lib's `EncryptedPDFError` class fails its own `instanceof` check (measured against 1.17.1), so the stable error message is what this matches instead. */
function isEncryptedPdfError(cause: unknown): boolean {
  return cause instanceof Error && /is encrypted/i.test(cause.message);
}

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

/** What the widget shows once a file is picked, before any operation is queued. */
export async function inspectPdf(
  bytes: Uint8Array,
): Promise<{ ok: true; pageCount: number } | { ok: false; error: string }> {
  if (bytes.byteLength > MAX_PAGE_FILE_BYTES) {
    return { ok: false, error: `Fayl ${Math.round(MAX_PAGE_FILE_BYTES / (1024 * 1024))} MB həddini aşır.` };
  }
  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return loaded;
  const pageCount = loaded.doc.getPageCount();
  if (pageCount === 0) return { ok: false, error: "Bu PDF-də heç bir səhifə yoxdur." };
  return { ok: true, pageCount };
}

/**
 * Builds the output document from a finished plan. A blank page takes the
 * page size of the source's first page rather than a fixed A4/Letter guess,
 * so it matches whatever the visitor was actually editing. Every non-blank
 * page is copied independently — including a page duplicated twice, which
 * copies its source twice — so the parts share no pdf-lib object a later
 * edit to one could reach into.
 */
export async function buildFromPlan(sourceBytes: Uint8Array, plan: PlanPage[]): Promise<BuildResult> {
  if (sourceBytes.byteLength > MAX_PAGE_FILE_BYTES) {
    return { ok: false, error: `Fayl ${Math.round(MAX_PAGE_FILE_BYTES / (1024 * 1024))} MB həddini aşır.` };
  }
  if (plan.length === 0) return { ok: false, error: "Ən azı bir səhifə qalmalıdır." };

  const loaded = await loadPdf(sourceBytes);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const sourcePageCount = loaded.doc.getPageCount();
  if (sourcePageCount === 0) return { ok: false, error: "Mənbə PDF-də heç bir səhifə yoxdur." };
  if (plan.some((page) => page.sourceIndex !== null && page.sourceIndex >= sourcePageCount)) {
    return { ok: false, error: "Plan mənbə sənəddə olmayan səhifəyə istinad edir." };
  }

  const blankSize = loaded.doc.getPage(0).getSize();
  const output = await PDFDocument.create();

  for (const page of plan) {
    if (page.sourceIndex === null) {
      const blank = output.addPage([blankSize.width, blankSize.height]);
      if (page.rotation !== 0) blank.setRotation(degrees(page.rotation));
      continue;
    }
    const [copied] = await output.copyPages(loaded.doc, [page.sourceIndex]);
    const added = output.addPage(copied);
    if (page.rotation !== 0) {
      const combined = ((added.getRotation().angle + page.rotation) % 360) as RotationDelta;
      added.setRotation(degrees(combined));
    }
  }

  const saved = await output.save({ useObjectStreams: false });
  // See `pdf-birlesdir.ts` for why the raw save result is copied rather than
  // returned directly — pdf-lib's declared type widens to
  // `Uint8Array<ArrayBufferLike>` here, which `Blob` refuses.
  return { ok: true, bytes: new Uint8Array(saved), pageCount: plan.length };
}
