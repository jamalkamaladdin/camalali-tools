/*
 * See `pdf-birlesdir.mts` for why this file is structured around top-level
 * await: the runner calls `suite.checks(check)` without awaiting it, so
 * every pdf-lib call below has to be resolved before `checks` is even
 * defined. The fixtures are built with pdf-lib itself for the same reason
 * given there — this tool's arithmetic (`parsePageSelector`, `chunkEveryN`)
 * is checked directly with no PDF involved, and `splitPdf` is checked
 * against documents pdf-lib actually produced.
 */
import type { CheckSuite } from "./harness.mts";
import { PDFDocument } from "pdf-lib";
import {
  buildPartFilename,
  chunkEveryN,
  inspectPdf,
  parsePageSelector,
  splitPdf,
} from "../lib/pdf-bol";

async function buildPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([200, 300]);
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

const doc10 = await buildPdf(10);
const encrypted = await buildEncryptedLikePdf();

const eachPage = await splitPdf(doc10, "sened.pdf", { mode: "each-page" });
const ranges = await splitPdf(doc10, "sened.pdf", { mode: "ranges", expression: "1-3, 5, 8-10" });
const rangesReloadedCount =
  ranges.ok && ranges.parts[0] ? (await PDFDocument.load(ranges.parts[0].bytes)).getPageCount() : -1;
const badOrder = await splitPdf(doc10, "sened.pdf", { mode: "ranges", expression: "5-2" });
const zeroPage = await splitPdf(doc10, "sened.pdf", { mode: "ranges", expression: "0" });
const notANumber = await splitPdf(doc10, "sened.pdf", { mode: "ranges", expression: "abc" });
const everyThree = await splitPdf(doc10, "sened.pdf", { mode: "every-n", everyN: 3 });
const encryptedSplit = await splitPdf(encrypted, "x.pdf", { mode: "each-page" });
const inspected = await inspectPdf(doc10);

export const checks: CheckSuite = (check) => {
  check(
    "each-page mode: one part per page, each one page long",
    eachPage.ok && eachPage.parts.length === 10 && eachPage.parts.every((part) => part.pageCount === 1),
    `got: ${eachPage.ok ? eachPage.parts.length : eachPage.error}`,
  );

  check(
    "ranges mode: \"1-3, 5, 8-10\" becomes three parts with the right page counts",
    ranges.ok &&
      ranges.parts.map((part) => part.pageCount).join(",") === "3,1,3" &&
      ranges.parts.map((part) => part.name).join(",") ===
        "sened-1-3.pdf,sened-5.pdf,sened-8-10.pdf",
    `got: ${ranges.ok ? JSON.stringify(ranges.parts.map((p) => p.name)) : ranges.error}`,
  );
  check(
    "ranges mode: the requested pages actually add up, none dropped or doubled",
    ranges.ok && ranges.parts.reduce((sum, part) => sum + part.pageCount, 0) === 7,
    `got: ${ranges.ok ? JSON.stringify(ranges.parts) : ranges.error}`,
  );
  check(
    "ranges mode: the first part's bytes reopen with the same page count (round trip)",
    rangesReloadedCount === 3,
    `reloaded pageCount: ${rangesReloadedCount}`,
  );

  check(
    "an inverted piece (\"5-2\") is rejected, not thrown",
    !badOrder.ok && badOrder.error.includes("5-2"),
    `got: ${JSON.stringify(badOrder)}`,
  );
  check(
    "page \"0\" is rejected — pages are 1-based",
    !zeroPage.ok,
    `got: ${JSON.stringify(zeroPage)}`,
  );
  check(
    "a non-numeric piece (\"abc\") is rejected rather than silently skipped",
    !notANumber.ok && notANumber.error.includes("abc"),
    `got: ${JSON.stringify(notANumber)}`,
  );

  check(
    "every-n mode: a 10-page document split by 3 gives 3+3+3+1",
    everyThree.ok && everyThree.parts.map((part) => part.pageCount).join(",") === "3,3,3,1",
    `got: ${everyThree.ok ? JSON.stringify(everyThree.parts.map((p) => p.pageCount)) : everyThree.error}`,
  );

  check(
    "an encrypted source file is rejected with the password message",
    !encryptedSplit.ok && encryptedSplit.error.includes("parolla"),
    `got: ${JSON.stringify(encryptedSplit)}`,
  );

  const directParse = parsePageSelector("1-3, 5, 8-10", 10);
  check(
    "parsePageSelector: parses without needing a document",
    directParse.ok &&
      JSON.stringify(directParse.groups) ===
        JSON.stringify([{ from: 1, to: 3 }, { from: 5, to: 5 }, { from: 8, to: 10 }]),
    `got: ${JSON.stringify(directParse)}`,
  );

  check(
    "chunkEveryN: the last chunk takes whatever is left over",
    JSON.stringify(chunkEveryN(10, 3)) ===
      JSON.stringify([{ from: 1, to: 3 }, { from: 4, to: 6 }, { from: 7, to: 9 }, { from: 10, to: 10 }]),
    `got: ${JSON.stringify(chunkEveryN(10, 3))}`,
  );

  check(
    "buildPartFilename: a single-page group drops the second number",
    buildPartFilename("sened.pdf", { from: 1, to: 3 }) === "sened-1-3.pdf" &&
      buildPartFilename("sened.pdf", { from: 5, to: 5 }) === "sened-5.pdf",
    `got: ${buildPartFilename("sened.pdf", { from: 1, to: 3 })}, ${buildPartFilename("sened.pdf", { from: 5, to: 5 })}`,
  );

  check(
    "inspectPdf: reports the source page count before any split runs",
    inspected.ok && inspected.pageCount === 10,
    `got: ${JSON.stringify(inspected)}`,
  );
};
