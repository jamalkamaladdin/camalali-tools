/*
 * What is worth checking here: the audit passes (no orphaned section, no
 * duplicate code, no section left empty, no note too short), the table is
 * still the size it was written at, a numeric search narrows to exactly the
 * one code it names, an English name finds its code, a two-word search
 * requires both words, a section filter keeps only codes from that family,
 * and every code appears exactly once across the whole table.
 */
import type { CheckSuite } from "./harness.mts";
import { auditReference, filterReference } from "../lib/reference";
import { statusKodlariRows, statusKodlariSections } from "../lib/status-kodlari";

export const checks: CheckSuite = (check) => {
  const problems = auditReference(statusKodlariRows, statusKodlariSections);
  check(
    "status-kodlari: the table has no orphaned section, duplicate code, empty section or too-short note",
    problems.length === 0,
    `got: ${JSON.stringify(problems)}`,
  );

  check(
    "status-kodlari: the table holds at least 60 codes",
    statusKodlariRows.length >= 60,
    `got: ${statusKodlariRows.length}`,
  );

  check(
    "status-kodlari: the table declares exactly the five RFC 9110 families",
    statusKodlariSections.length === 5 &&
      statusKodlariSections.every((s) => /^[1-5]xx$/.test(s.id)),
    `got: ${JSON.stringify(statusKodlariSections.map((s) => s.id))}`,
  );

  const notFound = filterReference(statusKodlariRows, { query: "404" });
  check(
    "status-kodlari: searching the number 404 finds exactly one row, and it is Not Found",
    notFound.length === 1 && notFound[0].term === "404" && notFound[0].label === "Not Found",
    `got: ${JSON.stringify(notFound)}`,
  );

  const redirects = filterReference(statusKodlariRows, { query: "yönləndirmə" });
  check(
    "status-kodlari: searching the Azerbaijani word for redirect finds more than one row, all of them 3xx",
    redirects.length > 1 && redirects.every((row) => row.section === "3xx"),
    `got: ${JSON.stringify(redirects.map((r) => r.term))}`,
  );

  const redirectsFolded = filterReference(statusKodlariRows, { query: "yonlendirme" });
  check(
    "status-kodlari: the same search without diacritics finds the same set of rows",
    redirectsFolded.length === redirects.length,
    `folded: ${redirectsFolded.length}, accented: ${redirects.length}`,
  );

  const byEnglishName = filterReference(statusKodlariRows, { query: "not found" });
  check(
    "status-kodlari: searching the English name 'not found' finds exactly 404, not 302 or 304",
    byEnglishName.length === 1 && byEnglishName[0].term === "404",
    `got: ${JSON.stringify(byEnglishName.map((r) => r.term))}`,
  );

  const twoWord = filterReference(statusKodlariRows, { query: "service unavailable" });
  check(
    "status-kodlari: a two-word search requires both words and finds exactly 503",
    twoWord.length === 1 && twoWord[0].term === "503",
    `got: ${JSON.stringify(twoWord.map((r) => r.term))}`,
  );

  const clientErrors = filterReference(statusKodlariRows, { section: "4xx" });
  check(
    "status-kodlari: filtering by section 4xx returns only codes starting with 4",
    clientErrors.length > 0 && clientErrors.every((row) => row.term.startsWith("4")),
    `got: ${JSON.stringify(clientErrors.map((r) => r.term))}`,
  );

  const uniqueTerms = new Set(statusKodlariRows.map((row) => row.term));
  check(
    "status-kodlari: every code appears exactly once across the whole table",
    uniqueTerms.size === statusKodlariRows.length,
    `${uniqueTerms.size} unique out of ${statusKodlariRows.length} rows`,
  );
};
