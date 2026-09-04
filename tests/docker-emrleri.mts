/*
 * What is worth checking here: the audit passes on the shipped rows, the row
 * count clears the 55-row floor, every term is a real `docker ...` command
 * whose example line actually starts with that command, a lookup by a bare
 * keyword ("compose") returns exactly the compose family, a lookup by
 * "prune" reaches every prune-shaped command, the section filter narrows
 * correctly, the destructive prune command carries an explicit warning word,
 * a diacritic-free query still finds diacritic-bearing notes, and no command
 * is listed twice.
 */
import type { CheckSuite } from "./harness.mts";
import { auditReference, filterReference } from "../lib/reference";
import { dockerEmrleriRows, dockerEmrleriSections } from "../lib/docker-emrleri";

export const checks: CheckSuite = (check) => {
  const problems = auditReference(dockerEmrleriRows, dockerEmrleriSections);
  check(
    "docker-emrleri: auditReference finds no orphaned section, duplicate row or repeated-label note",
    problems.length === 0,
    `problems: ${JSON.stringify(problems)}`,
  );

  check(
    "docker-emrleri: at least 55 rows are shipped",
    dockerEmrleriRows.length >= 55,
    `got: ${dockerEmrleriRows.length}`,
  );

  check(
    "docker-emrleri: every term is a docker command",
    dockerEmrleriRows.every((row) => row.term.startsWith("docker ")),
    `offenders: ${JSON.stringify(dockerEmrleriRows.filter((row) => !row.term.startsWith("docker ")).map((row) => row.term))}`,
  );

  check(
    "docker-emrleri: every row has an example, and the example starts with the row's own term",
    dockerEmrleriRows.every((row) => row.example !== undefined && row.example.startsWith(row.term)),
    `offenders: ${JSON.stringify(dockerEmrleriRows.filter((row) => row.example === undefined || !row.example.startsWith(row.term)).map((row) => row.term))}`,
  );

  const composeHits = filterReference(dockerEmrleriRows, { query: "compose" });
  check(
    "docker-emrleri: searching \"compose\" returns exactly the 9 compose rows, nothing else",
    composeHits.length === 9 && composeHits.every((row) => row.term.startsWith("docker compose")),
    `got: ${JSON.stringify(composeHits.map((row) => row.term))}`,
  );

  const pruneHits = filterReference(dockerEmrleriRows, { query: "prune" }).map((row) => row.term);
  const expectedPrune = [
    "docker system prune",
    "docker system prune -a --volumes",
    "docker image prune",
    "docker container prune",
    "docker builder prune",
  ];
  check(
    "docker-emrleri: searching \"prune\" reaches every prune-shaped command",
    expectedPrune.every((term) => pruneHits.includes(term)),
    `got: ${JSON.stringify(pruneHits)}`,
  );

  const sebekeRows = filterReference(dockerEmrleriRows, { section: "sebeke" });
  check(
    "docker-emrleri: the section filter returns only sebeke rows, and all 8 of them",
    sebekeRows.length === 8 && sebekeRows.every((row) => row.section === "sebeke"),
    `got: ${sebekeRows.length}`,
  );

  const pruneAll = dockerEmrleriRows.find((row) => row.term === "docker system prune -a --volumes");
  check(
    "docker-emrleri: system prune -a --volumes names the danger explicitly in its note",
    pruneAll !== undefined && pruneAll.note.toLocaleLowerCase("az").includes("təhlükəli"),
    `note: ${pruneAll?.note}`,
  );

  const diacriticFree = filterReference(dockerEmrleriRows, { query: "sebeke" }).map((row) => row.term);
  const expectedNetwork = [
    "docker network ls",
    "docker network create",
    "docker network connect",
    "docker network inspect",
  ];
  check(
    "docker-emrleri: a diacritic-free query (\"sebeke\") reaches every row whose note says \"şəbəkə\", including all four network rows",
    expectedNetwork.every((term) => diacriticFree.includes(term)),
    `got: ${JSON.stringify(diacriticFree)}`,
  );

  const terms = new Set(dockerEmrleriRows.map((row) => row.term));
  check(
    "docker-emrleri: no command is listed twice",
    terms.size === dockerEmrleriRows.length,
    `rows: ${dockerEmrleriRows.length}, unique terms: ${terms.size}`,
  );
};
