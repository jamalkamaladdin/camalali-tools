/*
 * A bulk auditor is only worth as much as its parser: every case below is a
 * real-world paste that a `split(",")` reader gets wrong — a comma inside a
 * description, a quoted phrase inside a title, Windows line endings, a row
 * missing its last column. Getting any of them wrong shifts a column, and a
 * shifted column turns the whole report into confident nonsense.
 *
 * The duplicate cases guard the one thing this tool sees that looking at pages
 * one at a time cannot.
 */
import type { CheckSuite } from "./harness.mts";
import {
  auditRows,
  MAX_ROWS,
  parseDelimited,
  toCsv,
  toMetaRows,
  type MetaRow,
} from "../lib/toplu-meta";

function parseRows(text: string): MetaRow[] {
  return toMetaRows(parseDelimited(text).rows);
}

export const checks: CheckSuite = (check) => {
  const quotedComma = parseDelimited(
    'url,title,description\nhttps://a.az,"Backend, verilənlər bazası","Bir, iki, üç"',
  );
  const quotedRows = toMetaRows(quotedComma.rows);
  check(
    "toplu-meta: a comma inside quotes does not split the field",
    quotedRows.length === 1 &&
      quotedRows[0].title === "Backend, verilənlər bazası" &&
      quotedRows[0].description === "Bir, iki, üç",
    `got: ${JSON.stringify(quotedRows)}`,
  );

  const doubledQuote = parseRows('url,title,description\nhttps://a.az,"O dedi ""salam""",Təsvir');
  check(
    "toplu-meta: a doubled quote becomes one literal quote",
    doubledQuote.length === 1 && doubledQuote[0].title === 'O dedi "salam"',
    `got: ${JSON.stringify(doubledQuote)}`,
  );

  const crlf = parseDelimited(
    "url,title,description\r\nhttps://a.az,Başlıq A,Təsvir A\r\n\r\nhttps://b.az,Başlıq B,Təsvir B\r\n",
  );
  const crlfRows = toMetaRows(crlf.rows);
  check(
    "toplu-meta: CRLF endings and blank lines leave exactly the data rows",
    crlfRows.length === 2 && crlfRows[0].title === "Başlıq A" && crlfRows[1].url === "https://b.az",
    `got: ${JSON.stringify(crlfRows)}`,
  );

  const tabbed = parseDelimited("url\ttitle\tdescription\nhttps://a.az\tBaşlıq, vergüllü\tTəsvir");
  const tabbedRows = toMetaRows(tabbed.rows);
  check(
    "toplu-meta: a tab-separated paste is detected and its commas stay inside the field",
    tabbed.delimiter === "\t" && tabbedRows.length === 1 && tabbedRows[0].title === "Başlıq, vergüllü",
    `delimiter: ${JSON.stringify(tabbed.delimiter)} rows: ${JSON.stringify(tabbedRows)}`,
  );

  const semicolons = parseDelimited("https://a.az;Başlıq;Təsvir");
  check(
    "toplu-meta: a semicolon export with no header keeps its only row",
    semicolons.delimiter === ";" && toMetaRows(semicolons.rows).length === 1,
    `delimiter: ${JSON.stringify(semicolons.delimiter)} rows: ${JSON.stringify(semicolons.rows)}`,
  );

  const headerless = parseRows("https://a.az,Başlıq A,Təsvir A\nhttps://b.az,Başlıq B,Təsvir B");
  check(
    "toplu-meta: a file without a header row loses none of its pages",
    headerless.length === 2 && headerless[0].url === "https://a.az",
    `got: ${JSON.stringify(headerless)}`,
  );
  check(
    "toplu-meta: a header row is recognised in azerbaijani too and dropped",
    parseRows("ünvan,başlıq,təsvir\nhttps://a.az,Başlıq,Təsvir").length === 1,
    `got: ${JSON.stringify(parseRows("ünvan,başlıq,təsvir\nhttps://a.az,Başlıq,Təsvir"))}`,
  );

  const ragged = parseRows("https://a.az,Yalnız başlıq\nhttps://b.az,Başlıq,Təsvir,əlavə sütun");
  check(
    "toplu-meta: a short row keeps its missing column empty and a long row keeps its first three",
    ragged.length === 2 &&
      ragged[0].description === "" &&
      ragged[1].description === "Təsvir",
    `got: ${JSON.stringify(ragged)}`,
  );

  const duplicates = auditRows(
    [
      { url: "https://a.az/1", title: "Ana səhifə", description: "Fərqli təsvir bir" },
      { url: "https://a.az/2", title: "ana səhifə ", description: "Fərqli təsvir iki" },
      { url: "https://a.az/3", title: "Başqa başlıq", description: "Fərqli təsvir üç" },
    ],
    "desktop",
  );
  check(
    "toplu-meta: a repeated title is flagged on both rows and only on them",
    duplicates.audits[0].issues.includes("tekrar-basliq") &&
      duplicates.audits[1].issues.includes("tekrar-basliq") &&
      !duplicates.audits[2].issues.includes("tekrar-basliq") &&
      duplicates.summary["tekrar-basliq"] === 2,
    `issues: ${JSON.stringify(duplicates.audits.map((a) => a.issues))}`,
  );

  const sameUrlTwice = auditRows(
    [
      { url: "https://a.az/1", title: "Ana səhifə", description: "Təsvir" },
      { url: "https://a.az/1", title: "Ana səhifə", description: "Təsvir" },
    ],
    "desktop",
  );
  check(
    "toplu-meta: the same page listed twice is a duplicated line, not a duplicated title",
    sameUrlTwice.summary["tekrar-basliq"] === 0 && sameUrlTwice.summary["tekrar-tesvir"] === 0,
    `summary: ${JSON.stringify(sameUrlTwice.summary)}`,
  );

  const empties = auditRows(
    [{ url: "https://a.az/1", title: "", description: "" }],
    "desktop",
  );
  check(
    "toplu-meta: an empty field reads as empty once, not as empty and short",
    empties.audits[0].issues.includes("bos-basliq") &&
      empties.audits[0].issues.includes("bos-tesvir") &&
      !empties.audits[0].issues.includes("qisa-basliq") &&
      !empties.audits[0].issues.includes("qisa-tesvir"),
    `issues: ${JSON.stringify(empties.audits[0].issues)}`,
  );

  const overLong = auditRows(
    [{ url: "https://a.az/1", title: "Ə".repeat(120), description: "ə".repeat(4000) }],
    "desktop",
  );
  check(
    "toplu-meta: an over-wide title and description are both caught",
    overLong.audits[0].issues.includes("uzun-basliq") &&
      overLong.audits[0].issues.includes("uzun-tesvir") &&
      overLong.audits[0].titlePx > 0,
    `issues: ${JSON.stringify(overLong.audits[0].issues)} px: ${overLong.audits[0].titlePx}`,
  );

  const overCap = parseDelimited(
    Array.from({ length: MAX_ROWS + 5 }, (_, i) => `https://a.az/${i},Başlıq ${i},Təsvir ${i}`).join("\n"),
  );
  check(
    "toplu-meta: past the row cap the extra rows are dropped and the visitor is told",
    overCap.rows.length === MAX_ROWS && overCap.error !== null && overCap.error.includes(String(MAX_ROWS)),
    `rows: ${overCap.rows.length} error: ${overCap.error}`,
  );

  const unterminated = parseDelimited('url,title,description\nhttps://a.az,"Bağlanmayan başlıq,Təsvir');
  check(
    "toplu-meta: an unclosed quote is reported instead of silently eating the rest",
    unterminated.error !== null,
    `error: ${unterminated.error}`,
  );

  /* The round trip: what leaves as CSV has to come back in as the same rows,
     including the fields that needed quoting to survive the journey. */
  const tricky: MetaRow[] = [
    { url: "https://a.az/1", title: 'Backend, "sistem" dizaynı', description: "Bir, iki\nüç" },
    { url: "https://a.az/2", title: "Adi başlıq", description: "Adi təsvir" },
  ];
  const roundTripped = parseRows(toCsv(auditRows(tricky, "desktop").audits));
  check(
    "toplu-meta: toCsv → parseDelimited loses nothing, quotes and commas included",
    JSON.stringify(roundTripped) === JSON.stringify(tricky),
    `got: ${JSON.stringify(roundTripped)}`,
  );

  const csv = toCsv(auditRows(tricky, "desktop").audits);
  check(
    "toplu-meta: the exported CSV carries a verdict column beside the original three",
    csv.split("\r\n")[0].startsWith("url,title,description") && csv.includes("hokm"),
    `header: ${csv.split("\r\n")[0]}`,
  );
};
