/*
 * What is worth checking here: the audit passes, the table is still the size
 * it was written at, every row's example is a concrete line that starts with
 * its own header name, a header name search narrows correctly, a diacritic-
 * free search still finds the accented Azerbaijani rows, a two-word search
 * requires both words, a section filter keeps only the CORS headers, and
 * every header name appears exactly once across the whole table.
 */
import type { CheckSuite } from "./harness.mts";
import { auditReference, filterReference } from "../lib/reference";
import { httpBasliqlariRows, httpBasliqlariSections } from "../lib/http-basliqlari";

export const checks: CheckSuite = (check) => {
  const problems = auditReference(httpBasliqlariRows, httpBasliqlariSections);
  check(
    "http-basliqlari: the table has no orphaned section, duplicate header, empty section or too-short note",
    problems.length === 0,
    `got: ${JSON.stringify(problems)}`,
  );

  check(
    "http-basliqlari: the table holds at least 60 headers",
    httpBasliqlariRows.length >= 60,
    `got: ${httpBasliqlariRows.length}`,
  );

  check(
    "http-basliqlari: the table declares exactly the six documented sections",
    httpBasliqlariSections.map((s) => s.id).join(",") ===
      "sorgu,cavab,kes,tehlukesizlik,mezmun,cors",
    `got: ${JSON.stringify(httpBasliqlariSections.map((s) => s.id))}`,
  );

  const badExamples = httpBasliqlariRows.filter(
    (row) => row.example !== undefined && !row.example.startsWith(`${row.term}:`),
  );
  check(
    "http-basliqlari: every row's example starts with its own header name",
    badExamples.length === 0,
    `bad rows: ${JSON.stringify(badExamples.map((r) => r.term))}`,
  );

  const cacheControl = filterReference(httpBasliqlariRows, { query: "Cache-Control" });
  check(
    "http-basliqlari: searching the exact header name finds exactly one row",
    cacheControl.length === 1 && cacheControl[0].term === "Cache-Control",
    `got: ${JSON.stringify(cacheControl.map((r) => r.term))}`,
  );

  const security = filterReference(httpBasliqlariRows, { query: "tehlukesizlik" });
  check(
    "http-basliqlari: an accent-free search for 'təhlükəsizlik' finds more than one row, all in the security section",
    security.length > 1 && security.every((row) => row.section === "tehlukesizlik"),
    `got: ${JSON.stringify(security.map((r) => r.term))}`,
  );

  const twoWord = filterReference(httpBasliqlariRows, { query: "cache public" });
  check(
    "http-basliqlari: a two-word search requires both words and finds exactly Cache-Control",
    twoWord.length === 1 && twoWord[0].term === "Cache-Control",
    `got: ${JSON.stringify(twoWord.map((r) => r.term))}`,
  );

  const bySynonym = filterReference(httpBasliqlariRows, { query: "gzip" });
  check(
    "http-basliqlari: searching a synonym in `match` finds the header it belongs to",
    bySynonym.length > 0 && bySynonym.some((row) => row.term === "Accept-Encoding"),
    `got: ${JSON.stringify(bySynonym.map((r) => r.term))}`,
  );

  const cors = filterReference(httpBasliqlariRows, { section: "cors" });
  check(
    "http-basliqlari: filtering by the CORS section returns only Origin and Access-Control-* headers",
    cors.length === 6 &&
      cors.every((row) => row.term === "Origin" || row.term.startsWith("Access-Control-")),
    `got: ${JSON.stringify(cors.map((r) => r.term))}`,
  );

  const uniqueTerms = new Set(httpBasliqlariRows.map((row) => row.term));
  check(
    "http-basliqlari: every header name appears exactly once across the whole table",
    uniqueTerms.size === httpBasliqlariRows.length,
    `${uniqueTerms.size} unique out of ${httpBasliqlariRows.length} rows`,
  );
};
