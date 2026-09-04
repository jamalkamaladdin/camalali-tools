/*
 * What is worth checking here: the audit passes, the table is at least the
 * size it was written at, every row carries a runnable example, searching
 * for "kill" or its everyday phrase "prosesi öldür" finds the process-killing
 * commands, the rm -rf row actually warns, a section filter narrows to one
 * bucket, a diacritic-free search still finds the accented row, a two-word
 * search requires both words, and no command is listed twice.
 */
import type { CheckSuite } from "./harness.mts";
import { auditReference, filterReference } from "../lib/reference";
import { linuxEmrleriRows, linuxEmrleriSections } from "../lib/linux-emrleri";

export const checks: CheckSuite = (check) => {
  const problems = auditReference(linuxEmrleriRows, linuxEmrleriSections);
  check(
    "linux-emrleri: the table has no orphaned section, duplicate command, empty section or too-short note",
    problems.length === 0,
    `got: ${JSON.stringify(problems)}`,
  );

  check(
    "linux-emrleri: the table holds at least 85 commands",
    linuxEmrleriRows.length >= 85,
    `got: ${linuxEmrleriRows.length}`,
  );

  const noExample = linuxEmrleriRows.filter((row) => row.example === undefined || row.example.trim() === "");
  check(
    "linux-emrleri: every row carries a runnable example line",
    noExample.length === 0,
    `rows without example: ${JSON.stringify(noExample.map((r) => r.term))}`,
  );

  const killByTerm = filterReference(linuxEmrleriRows, { query: "kill" });
  const killByPhrase = filterReference(linuxEmrleriRows, { query: "prosesi öldür" });
  check(
    "linux-emrleri: searching 'kill' or the everyday phrase 'prosesi öldür' both find the process-killing commands",
    killByTerm.some((row) => row.term === "kill -9") &&
      killByPhrase.length >= 3 &&
      killByPhrase.every((row) => row.section === "proses"),
    `by term: ${JSON.stringify(killByTerm.map((r) => r.term))}, by phrase: ${JSON.stringify(killByPhrase.map((r) => r.term))}`,
  );

  const rmRf = linuxEmrleriRows.find((row) => row.term === "rm -rf");
  check(
    "linux-emrleri: the rm -rf row explicitly warns before explaining what it does",
    rmRf !== undefined && /TƏHLÜKƏLİ/i.test(rmRf.note),
    `got: ${JSON.stringify(rmRf)}`,
  );

  const fileSection = filterReference(linuxEmrleriRows, { section: "fayl" });
  check(
    "linux-emrleri: filtering by the fayl section returns only fayl-section rows and none of another section",
    fileSection.length > 0 &&
      fileSection.every((row) => row.section === "fayl") &&
      fileSection.length === linuxEmrleriRows.filter((row) => row.section === "fayl").length,
    `got: ${fileSection.length} rows`,
  );

  const yerBitib = filterReference(linuxEmrleriRows, { query: "yer bitib" });
  check(
    "linux-emrleri: searching the everyday phrase 'yer bitib' finds the disk-space rows",
    yerBitib.length >= 2 && yerBitib.every((row) => row.section === "disk"),
    `got: ${JSON.stringify(yerBitib.map((r) => r.term))}`,
  );

  const diacriticFree = filterReference(linuxEmrleriRows, { query: "oldur" });
  check(
    "linux-emrleri: typing 'oldur' without diacritics still finds rows whose match list says 'öldür'",
    diacriticFree.length >= 3 &&
      diacriticFree.every((row) => row.section === "proses") &&
      diacriticFree.some((row) => row.term === "kill -9"),
    `got: ${JSON.stringify(diacriticFree.map((r) => r.term))}`,
  );

  const twoWord = filterReference(linuxEmrleriRows, { query: "qovluğu sil" });
  check(
    "linux-emrleri: a two-word search requires both words and lands on rm -rf",
    twoWord.length === 1 && twoWord[0].term === "rm -rf",
    `got: ${JSON.stringify(twoWord.map((r) => r.term))}`,
  );

  const uniqueTerms = new Set(linuxEmrleriRows.map((row) => row.term));
  check(
    "linux-emrleri: every command appears exactly once across the whole table",
    uniqueTerms.size === linuxEmrleriRows.length,
    `${uniqueTerms.size} unique out of ${linuxEmrleriRows.length} rows`,
  );
};
