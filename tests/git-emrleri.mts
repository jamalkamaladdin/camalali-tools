/*
 * What is worth checking here: the audit passes on the shipped rows, the row
 * count clears the 70-row floor, every term is a real `git ...` command whose
 * example line actually starts with that command, a lookup by a bare keyword
 * ("stash") finds only that family, a lookup by a synonym ("geri", "undo")
 * reaches the reset/revert/reflog rows through `match` rather than the term
 * itself, the section filter narrows correctly, the two flagged-as-dangerous
 * commands carry an explicit warning word, a diacritic-free query still finds
 * a diacritic-bearing note, and no command is listed twice.
 */
import type { CheckSuite } from "./harness.mts";
import { auditReference, filterReference } from "../lib/reference";
import { gitEmrleriRows, gitEmrleriSections } from "../lib/git-emrleri";

export const checks: CheckSuite = (check) => {
  const problems = auditReference(gitEmrleriRows, gitEmrleriSections);
  check(
    "git-emrleri: auditReference finds no orphaned section, duplicate row or repeated-label note",
    problems.length === 0,
    `problems: ${JSON.stringify(problems)}`,
  );

  check(
    "git-emrleri: at least 70 rows are shipped",
    gitEmrleriRows.length >= 70,
    `got: ${gitEmrleriRows.length}`,
  );

  check(
    "git-emrleri: every term is a git command",
    gitEmrleriRows.every((row) => row.term.startsWith("git ")),
    `offenders: ${JSON.stringify(gitEmrleriRows.filter((row) => !row.term.startsWith("git ")).map((row) => row.term))}`,
  );

  check(
    "git-emrleri: every row has an example, and the example starts with the row's own term",
    gitEmrleriRows.every((row) => row.example !== undefined && row.example.startsWith(row.term)),
    `offenders: ${JSON.stringify(gitEmrleriRows.filter((row) => row.example === undefined || !row.example.startsWith(row.term)).map((row) => row.term))}`,
  );

  const stashHits = filterReference(gitEmrleriRows, { query: "stash" });
  check(
    "git-emrleri: searching \"stash\" returns only the stash family, nothing else",
    stashHits.length === 4 && stashHits.every((row) => row.term.includes("stash")),
    `got: ${JSON.stringify(stashHits.map((row) => row.term))}`,
  );

  const geriHits = filterReference(gitEmrleriRows, { query: "geri" }).map((row) => row.term);
  const undoHits = filterReference(gitEmrleriRows, { query: "undo" }).map((row) => row.term);
  const expectedGeri = ["git reset --soft", "git reset --mixed", "git reset --hard", "git revert", "git reflog"];
  check(
    "git-emrleri: \"geri\" and \"undo\" both reach the reset/revert/reflog rows through match, not the term",
    expectedGeri.every((term) => geriHits.includes(term)) &&
      expectedGeri.every((term) => undoHits.includes(term)),
    `geri: ${JSON.stringify(geriHits)}, undo: ${JSON.stringify(undoHits)}`,
  );

  const budaqRows = filterReference(gitEmrleriRows, { section: "budaq" });
  check(
    "git-emrleri: the section filter returns only budaq rows, and all 13 of them",
    budaqRows.length === 13 && budaqRows.every((row) => row.section === "budaq"),
    `got: ${budaqRows.length}`,
  );

  const resetHard = gitEmrleriRows.find((row) => row.term === "git reset --hard");
  const forceWithLease = gitEmrleriRows.find((row) => row.term === "git push --force-with-lease");
  check(
    "git-emrleri: reset --hard and the force-push row both name the danger explicitly and the latter names the bare --force it replaces",
    resetHard !== undefined &&
      resetHard.note.toLocaleLowerCase("az").includes("təhlükəli") &&
      forceWithLease !== undefined &&
      forceWithLease.note.includes("push --force") &&
      forceWithLease.note.toLocaleLowerCase("az").includes("təhlükəli"),
    `reset --hard: ${resetHard?.note}, force-with-lease: ${forceWithLease?.note}`,
  );

  const diacriticFree = filterReference(gitEmrleriRows, { query: "sixisdir" });
  check(
    "git-emrleri: a diacritic-free query (\"sixisdir\") finds the row whose note says \"sıxışdırır\"",
    diacriticFree.length === 1 && diacriticFree[0].term === "git gc",
    `got: ${JSON.stringify(diacriticFree.map((row) => row.term))}`,
  );

  const terms = new Set(gitEmrleriRows.map((row) => row.term));
  check(
    "git-emrleri: no command is listed twice",
    terms.size === gitEmrleriRows.length,
    `rows: ${gitEmrleriRows.length}, unique terms: ${terms.size}`,
  );
};
