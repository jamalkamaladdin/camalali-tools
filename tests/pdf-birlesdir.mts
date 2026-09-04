/*
 * `pdf-birlesdir.ts` is pdf-lib underneath, and pdf-lib's own API is entirely
 * `Promise`-based — but this folder's runner calls `suite.checks(check)`
 * without awaiting it, so every case has to already be a resolved value by
 * the time `checks` runs. The fix is top-level await: everything async below
 * happens once, while this module is still being imported, and `checks`
 * itself is a plain synchronous function closing over the results.
 *
 * The fixtures are built with pdf-lib directly rather than by hand, the same
 * way the tool itself works — a hand-typed PDF byte sequence would prove
 * nothing about whether `mergePdfs` actually walks pdf-lib's API correctly.
 * The one exception is the "encrypted" fixture: pdf-lib can read an
 * encrypted PDF but has no API to write one, so that fixture is a normal
 * pdf-lib document with an `/Encrypt` reference spliced into its trailer by
 * hand — enough for pdf-lib's parser to refuse it, which is all this needs.
 */
import type { CheckSuite } from "./harness.mts";
import { PDFDocument } from "pdf-lib";
import { inspectPdf, mergePdfs, resolvePageRange } from "../lib/pdf-birlesdir";

async function buildPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([200, 300]);
  return doc.save({ useObjectStreams: false });
}

/** See this file's top comment: a normal pdf-lib document with a hand-spliced `/Encrypt` trailer entry, enough to make pdf-lib's own parser refuse it. */
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

const pdfA = await buildPdf(3);
const pdfB = await buildPdf(2);
const encrypted = await buildEncryptedLikePdf();
const garbage = new Uint8Array([1, 2, 3, 4, 5]);

const basicMerge = await mergePdfs([{ bytes: pdfA }, { bytes: pdfB }]);
const basicReloadedCount = basicMerge.ok
  ? (await PDFDocument.load(basicMerge.bytes)).getPageCount()
  : -1;
const rangedMerge = await mergePdfs([{ bytes: pdfA, range: { from: 1, to: 2 } }, { bytes: pdfB }]);
const encryptedMerge = await mergePdfs([{ bytes: pdfA }, { bytes: encrypted }]);
const garbageMerge = await mergePdfs([{ bytes: pdfA }, { bytes: garbage }]);
const singleFileMerge = await mergePdfs([{ bytes: pdfA }]);

const oversizedMerge = await mergePdfs([
  { bytes: pdfA },
  { bytes: new Uint8Array(50 * 1024 * 1024 + 1) },
]);

const inspectedValid = await inspectPdf(pdfA);
const inspectedEncrypted = await inspectPdf(encrypted);

export const checks: CheckSuite = (check) => {
  check(
    "basic merge: ok, and the page count is the sum of both inputs",
    basicMerge.ok && basicMerge.pageCount === 5,
    `got: ${JSON.stringify(basicMerge)}`,
  );
  check(
    "basic merge: the saved bytes reopen with the same page count (round trip)",
    basicReloadedCount === 5,
    `reloaded pageCount: ${basicReloadedCount}`,
  );

  check(
    "ranged merge: only the requested pages are taken from the first file",
    rangedMerge.ok && rangedMerge.pageCount === 4,
    `got: ${JSON.stringify(rangedMerge)}`,
  );

  check(
    "encrypted input: rejected, not thrown",
    encryptedMerge.ok === false,
    `got: ${JSON.stringify(encryptedMerge)}`,
  );
  check(
    "encrypted input: the error names which file and says it is password-protected",
    !encryptedMerge.ok && encryptedMerge.error.startsWith("2-ci fayl") && encryptedMerge.error.includes("parolla"),
    `error: ${!encryptedMerge.ok ? encryptedMerge.error : "n/a"}`,
  );

  check(
    "non-PDF input: rejected with a different message than the encrypted case",
    !garbageMerge.ok && !garbageMerge.error.includes("parolla"),
    `error: ${!garbageMerge.ok ? garbageMerge.error : "n/a"}`,
  );

  check(
    "a single file cannot be \"merged\"",
    singleFileMerge.ok === false,
    `got: ${JSON.stringify(singleFileMerge)}`,
  );

  check(
    "a file over the per-file byte cap is refused before it is parsed",
    !oversizedMerge.ok && oversizedMerge.error.startsWith("2-ci fayl"),
    `error: ${!oversizedMerge.ok ? oversizedMerge.error : "n/a"}`,
  );

  check(
    "resolvePageRange: an inverted range is an error",
    !resolvePageRange(5, { from: 3, to: 1 }).ok,
    `got: ${JSON.stringify(resolvePageRange(5, { from: 3, to: 1 }))}`,
  );
  check(
    "resolvePageRange: a page past the end is an error",
    !resolvePageRange(5, { from: 1, to: 9 }).ok,
    `got: ${JSON.stringify(resolvePageRange(5, { from: 1, to: 9 }))}`,
  );
  const resolved = resolvePageRange(5, { from: 2, to: 4 });
  check(
    "resolvePageRange: a valid range becomes 0-based indices",
    resolved.ok && JSON.stringify(resolved.indices) === JSON.stringify([1, 2, 3]),
    `got: ${JSON.stringify(resolved)}`,
  );
  const wholeFile = resolvePageRange(5);
  check(
    "resolvePageRange: no range at all takes every page",
    wholeFile.ok && wholeFile.indices.length === 5,
    `got: ${JSON.stringify(wholeFile)}`,
  );

  check(
    "inspectPdf: a valid file reports its page count",
    inspectedValid.ok && inspectedValid.pageCount === 3,
    `got: ${JSON.stringify(inspectedValid)}`,
  );
  check(
    "inspectPdf: an encrypted file is flagged as such, not just \"invalid\"",
    !inspectedEncrypted.ok && inspectedEncrypted.encrypted,
    `got: ${JSON.stringify(inspectedEncrypted)}`,
  );
};
