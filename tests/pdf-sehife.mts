/*
 * `applyOps` is plain arithmetic over a `PlanPage[]` and needs no pdf-lib at
 * all — most of the cases below check it directly. Only `buildFromPlan`
 * touches pdf-lib, and it does so through a `Promise`, which is why this
 * file (like its two siblings) resolves everything with top-level await
 * before `checks` — a plain synchronous function — is even defined; see
 * `pdf-birlesdir.mts` for why the runner requires that shape.
 */
import type { CheckSuite } from "./harness.mts";
import { PDFDocument } from "pdf-lib";
import { applyOps, buildFromPlan, initialPlan, type PlanPage } from "../lib/pdf-sehife";

async function buildPdf(pageCount: number, size: [number, number] = [200, 300]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage(size);
  return doc.save({ useObjectStreams: false });
}

/** See `pdf-birlesdir.mts`'s copy of this function for why an encrypted fixture has to be built this way. */
async function buildEncryptedLikePdf(): Promise<Uint8Array> {
  const bytes = await buildPdf(1);
  let text = Buffer.from(bytes).toString("latin1");
  const encryptObject =
    "6 0 obj\n<< /Filter /Standard /V 1 /R 2 /O (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) /U (bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) /P -44 >>\nendobj\n\n";
  const xrefIndex = text.indexOf("xref");
  text = text.slice(0, xrefIndex) + encryptObject + text.slice(xrefIndex);
  text = text.replace("/Info 3 0 R\n>>", "/Info 3 0 R\n/Encrypt 6 0 R\n>>");
  return new Uint8Array(Buffer.from(text, "latin1"));
}

function ids(plan: PlanPage[]): string {
  return plan.map((page) => page.id).join(",");
}

const doc5 = await buildPdf(5);
const encrypted = await buildEncryptedLikePdf();

const deleteResult = applyOps(initialPlan(5), [{ type: "delete", id: "p3" }]);
const deleteGuard = applyOps(initialPlan(1), [{ type: "delete", id: "p1" }]);

const moveResult = applyOps(initialPlan(3), [{ type: "move", id: "p2", direction: "up" }]);
const moveBoundary = applyOps(initialPlan(3), [{ type: "move", id: "p1", direction: "up" }]);

const rotateWrap = applyOps(initialPlan(1), [
  { type: "rotate", id: "p1", by: 90 },
  { type: "rotate", id: "p1", by: 270 },
]);

const duplicateResult = applyOps(initialPlan(2), [{ type: "duplicate", id: "p1", newId: "dup" }]);

const insertBlankResult = applyOps(initialPlan(2), [
  { type: "insert-blank", newId: "start", afterId: null },
  { type: "insert-blank", newId: "middle", afterId: "p1" },
]);

const reverseResult = applyOps(initialPlan(3), [{ type: "reverse" }]);

const fullOps = [
  { type: "delete" as const, id: "p2" },
  { type: "rotate" as const, id: "p1", by: 90 as const },
];
const withUndo = applyOps(initialPlan(3), fullOps);
const afterUndo = applyOps(initialPlan(3), fullOps.slice(0, -1));

const sizedDoc = await buildPdf(2, [123, 456]);
const sizedPlan = insertAtStart(initialPlan(2));
const built = sizedPlan.ok ? await buildFromPlan(sizedDoc, sizedPlan.plan) : null;
const reloaded = built?.ok ? await PDFDocument.load(built.bytes) : null;

function insertAtStart(plan: PlanPage[]) {
  return applyOps(plan, [
    { type: "insert-blank", newId: "blank", afterId: null },
    { type: "rotate", id: "p1", by: 90 },
  ]);
}

const deletedThenBuilt = await buildFromPlan(doc5, deleteResult.ok ? deleteResult.plan : []);
const encryptedBuild = await buildFromPlan(encrypted, initialPlan(1));

export const checks: CheckSuite = (check) => {
  check(
    "initialPlan: one entry per source page, in order, no rotation",
    JSON.stringify(initialPlan(3)) ===
      JSON.stringify([
        { id: "p1", sourceIndex: 0, rotation: 0 },
        { id: "p2", sourceIndex: 1, rotation: 0 },
        { id: "p3", sourceIndex: 2, rotation: 0 },
      ]),
    `got: ${JSON.stringify(initialPlan(3))}`,
  );

  check(
    "delete: removes exactly the targeted page and keeps the rest in order",
    deleteResult.ok && ids(deleteResult.plan) === "p1,p2,p4,p5",
    `got: ${JSON.stringify(deleteResult)}`,
  );
  check(
    "delete: the last remaining page cannot be deleted",
    !deleteGuard.ok,
    `got: ${JSON.stringify(deleteGuard)}`,
  );

  check(
    "move: swaps with the neighbour in the given direction",
    moveResult.ok && ids(moveResult.plan) === "p2,p1,p3",
    `got: ${JSON.stringify(moveResult)}`,
  );
  check(
    "move: the first page cannot move further up",
    !moveBoundary.ok,
    `got: ${JSON.stringify(moveBoundary)}`,
  );

  check(
    "rotate: 90 then 270 wraps back to 0, not 360",
    rotateWrap.ok && rotateWrap.plan[0]?.rotation === 0,
    `got: ${JSON.stringify(rotateWrap)}`,
  );

  check(
    "duplicate: the clone sits right after the original and shares its source page",
    duplicateResult.ok &&
      ids(duplicateResult.plan) === "p1,dup,p2" &&
      duplicateResult.plan[1]?.sourceIndex === 0,
    `got: ${JSON.stringify(duplicateResult)}`,
  );

  check(
    "insert-blank: null goes to the start, a page id goes right after it",
    insertBlankResult.ok &&
      ids(insertBlankResult.plan) === "start,p1,middle,p2" &&
      insertBlankResult.plan[0]?.sourceIndex === null,
    `got: ${JSON.stringify(insertBlankResult)}`,
  );

  check(
    "reverse: flips the whole order",
    reverseResult.ok && ids(reverseResult.plan) === "p3,p2,p1",
    `got: ${JSON.stringify(reverseResult)}`,
  );

  check(
    "undo (dropping the last op) leaves only the earlier ops applied",
    withUndo.ok &&
      afterUndo.ok &&
      ids(withUndo.plan) === "p1,p3" &&
      ids(afterUndo.plan) === "p1,p3" &&
      withUndo.plan[0]?.rotation === 90 &&
      afterUndo.plan[0]?.rotation === 0,
    `got: ${JSON.stringify(withUndo)} vs ${JSON.stringify(afterUndo)}`,
  );

  check(
    "buildFromPlan: an inserted blank page takes the source's own page size, and rotation survives the save/reload round trip",
    reloaded !== null &&
      reloaded.getPageCount() === 3 &&
      reloaded.getPage(0).getSize().width === 123 &&
      reloaded.getPage(0).getSize().height === 456 &&
      reloaded.getPage(1).getRotation().angle === 90,
    `pageCount: ${reloaded?.getPageCount()}, page0 size: ${JSON.stringify(reloaded?.getPage(0).getSize())}`,
  );

  check(
    "buildFromPlan: a deleted page is actually gone from the output, not just from the plan",
    deletedThenBuilt.ok && deletedThenBuilt.pageCount === 4,
    `got: ${JSON.stringify(deletedThenBuilt)}`,
  );

  check(
    "buildFromPlan: an encrypted source is rejected, not thrown",
    !encryptedBuild.ok && encryptedBuild.error.includes("parolla"),
    `got: ${JSON.stringify(encryptedBuild)}`,
  );
};
