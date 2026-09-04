/*
 * What is worth checking here: the audit passes, the table is at least the
 * size it was written at, \d and \w are both represented as rows, the \w row
 * explains the Azerbaijani-letter trap by pointing at \p{L}, every flag row
 * is a single character, searching "lookahead" finds (?=...) through its
 * `match` synonym, a section filter narrows to exactly the lookaround
 * constructs, a diacritic-free search still finds an accented row, a
 * two-word search requires both words, and no syntax fragment is listed
 * twice.
 */
import type { CheckSuite } from "./harness.mts";
import { auditReference, filterReference } from "../lib/reference";
import { regexSparRows, regexSparSections } from "../lib/regex-spar";

export const checks: CheckSuite = (check) => {
  const problems = auditReference(regexSparRows, regexSparSections);
  check(
    "regex-spar: the table has no orphaned section, duplicate fragment, empty section or too-short note",
    problems.length === 0,
    `got: ${JSON.stringify(problems)}`,
  );

  check(
    "regex-spar: the table holds at least 70 syntax fragments",
    regexSparRows.length >= 70,
    `got: ${regexSparRows.length}`,
  );

  const hasD = regexSparRows.some((row) => row.section === "sinif" && row.term.includes("\\d"));
  const hasW = regexSparRows.some((row) => row.section === "sinif" && row.term.includes("\\w"));
  check(
    "regex-spar: \\d and \\w are both represented as sinif rows",
    hasD && hasW,
    `d: ${hasD}, w: ${hasW}`,
  );

  const wRow = regexSparRows.find((row) => row.term.includes("\\w"));
  check(
    "regex-spar: the \\w row explains that it misses Azerbaijani letters and points at \\p{L}",
    wRow !== undefined && /azərbaycan/i.test(wRow.note) && wRow.note.includes("\\p{L}"),
    `got: ${JSON.stringify(wRow)}`,
  );

  const bayraqRows = regexSparRows.filter((row) => row.section === "bayraq");
  const notSingleChar = bayraqRows.filter((row) => row.term.length !== 1);
  check(
    "regex-spar: every bayraq row's term is a single character",
    bayraqRows.length === 7 && notSingleChar.length === 0,
    `bad rows: ${JSON.stringify(notSingleChar.map((r) => r.term))}`,
  );

  const lookahead = filterReference(regexSparRows, { query: "lookahead" });
  check(
    "regex-spar: searching 'lookahead' finds (?=...) through its match synonym",
    lookahead.some((row) => row.term === "(?=...)"),
    `got: ${JSON.stringify(lookahead.map((r) => r.term))}`,
  );

  const baxisSection = filterReference(regexSparRows, { section: "baxis" });
  check(
    "regex-spar: filtering by the baxis section returns exactly the four lookaround constructs",
    baxisSection.length === 4 &&
      baxisSection.every((row) => row.term.startsWith("(?")),
    `got: ${JSON.stringify(baxisSection.map((r) => r.term))}`,
  );

  const diacriticFree = filterReference(regexSparRows, { query: "bosluq" });
  check(
    "regex-spar: typing 'bosluq' without diacritics still finds the \\s / \\S row (whose label says 'boşluq')",
    diacriticFree.some((row) => row.term === "\\s / \\S"),
    `got: ${JSON.stringify(diacriticFree.map((r) => r.term))}`,
  );

  const twoWord = filterReference(regexSparRows, { query: "tutmayan qrup" });
  check(
    "regex-spar: a two-word search requires both words and lands on the non-capturing-group row",
    twoWord.length === 1 && twoWord[0].term === "(?:...)",
    `got: ${JSON.stringify(twoWord.map((r) => r.term))}`,
  );

  const uniqueTerms = new Set(regexSparRows.map((row) => row.term));
  check(
    "regex-spar: every syntax fragment appears exactly once across the whole table",
    uniqueTerms.size === regexSparRows.length,
    `${uniqueTerms.size} unique out of ${regexSparRows.length} rows`,
  );
};
