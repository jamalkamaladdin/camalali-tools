/*
 * What is worth checking here: the audit is clean, the table is the size it
 * claims to be, a lookup works from the extension towards the type and from
 * the type towards the extension alike, every row's shape holds (a real MIME
 * type, a dot-led label), no type is listed twice, folding tolerates a
 * missing diacritic, and a two-word query is an AND, not an OR.
 */
import type { CheckSuite } from "./harness.mts";
import { auditReference, filterReference } from "../lib/reference";
import { mimeRows, mimeSections } from "../lib/mime";

export const checks: CheckSuite = (check) => {
  const problems = auditReference(mimeRows, mimeSections);
  check(
    "mime: auditReference finds nothing wrong with the rows",
    problems.length === 0,
    `got: ${JSON.stringify(problems)}`,
  );

  check(
    "mime: the table holds at least 80 rows",
    mimeRows.length >= 80,
    `got: ${mimeRows.length}`,
  );

  const byExtension = filterReference(mimeRows, { query: ".webp" });
  check(
    "mime: searching the extension .webp finds the image/webp row",
    byExtension.some((row) => row.term === "image/webp"),
    `got: ${JSON.stringify(byExtension.map((row) => row.term))}`,
  );

  const byType = filterReference(mimeRows, { query: "image/webp" });
  check(
    "mime: searching the type image/webp finds the same row — the lookup works both directions",
    byType.some((row) => row.term === "image/webp"),
    `got: ${JSON.stringify(byType.map((row) => row.term))}`,
  );

  const badTerm = mimeRows.find((row) => !row.term.includes("/"));
  check(
    "mime: every term is a real MIME type with a slash in it",
    badTerm === undefined,
    `offending row: ${JSON.stringify(badTerm)}`,
  );

  const badLabel = mimeRows.find((row) => row.label === undefined || !row.label.startsWith("."));
  check(
    "mime: every label starts with the extension's dot",
    badLabel === undefined,
    `offending row: ${JSON.stringify(badLabel)}`,
  );

  const terms = mimeRows.map((row) => row.term);
  check(
    "mime: no MIME type is listed twice",
    new Set(terms).size === terms.length,
    `${terms.length} rows, ${new Set(terms).size} unique terms`,
  );

  const diacriticFree = filterReference(mimeRows, { query: "seffaf" });
  check(
    "mime: a diacritic-free query (seffaf) still finds a note written with şəffaf",
    diacriticFree.some((row) => row.term === "image/png"),
    `got: ${JSON.stringify(diacriticFree.map((row) => row.term))}`,
  );

  const bothWords = filterReference(mimeRows, { query: "excel word" });
  check(
    "mime: a two-word query requires both words — no row is both an Excel and a Word type",
    bothWords.length === 0,
    `got: ${JSON.stringify(bothWords.map((row) => row.term))}`,
  );

  const oneWord = filterReference(mimeRows, { query: "excel" });
  check(
    "mime: dropping one of those words finds the Excel rows again",
    oneWord.some((row) => row.term === "application/vnd.ms-excel"),
    `got: ${JSON.stringify(oneWord.map((row) => row.term))}`,
  );
};
