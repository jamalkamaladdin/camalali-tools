/*
 * What is worth checking here: the audit is clean, the table is the size it
 * claims to be, every term is a bare number or a hyphenated range and
 * nothing else, a service name search reaches its port, a section filter
 * returns only that section, 80 and 443 both sit in the web group, folding
 * tolerates a missing diacritic, and a two-word query is an AND.
 */
import type { CheckSuite } from "./harness.mts";
import { auditReference, filterReference } from "../lib/reference";
import { portlarRows, portlarSections } from "../lib/portlar";

const TERM_SHAPE = /^\d+(-\d+)?$/;

export const checks: CheckSuite = (check) => {
  const problems = auditReference(portlarRows, portlarSections);
  check(
    "portlar: auditReference finds nothing wrong with the rows",
    problems.length === 0,
    `got: ${JSON.stringify(problems)}`,
  );

  check(
    "portlar: the table holds at least 80 rows",
    portlarRows.length >= 80,
    `got: ${portlarRows.length}`,
  );

  const badTerm = portlarRows.find((row) => !TERM_SHAPE.test(row.term));
  check(
    "portlar: every term is a bare port number or a hyphenated range, nothing else",
    badTerm === undefined,
    `offending row: ${JSON.stringify(badTerm)}`,
  );

  const postgres = filterReference(portlarRows, { query: "postgres" });
  check(
    "portlar: searching postgres finds port 5432",
    postgres.some((row) => row.term === "5432"),
    `got: ${JSON.stringify(postgres.map((row) => row.term))}`,
  );

  const bazaOnly = filterReference(portlarRows, { section: "baza" });
  check(
    "portlar: filtering by the baza section returns only baza rows",
    bazaOnly.length > 0 && bazaOnly.every((row) => row.section === "baza"),
    `got: ${JSON.stringify(bazaOnly.map((row) => row.section))}`,
  );

  const web = filterReference(portlarRows, { section: "veb" });
  check(
    "portlar: 80 and 443 are both filed under veb",
    web.some((row) => row.term === "80") && web.some((row) => row.term === "443"),
    `got: ${JSON.stringify(web.map((row) => row.term))}`,
  );

  const diacriticFree = filterReference(portlarRows, { query: "sebeke" });
  check(
    "portlar: a diacritic-free query (sebeke) still finds notes written with şəbəkə",
    diacriticFree.some((row) => row.term === "161-162"),
    `got: ${JSON.stringify(diacriticFree.map((row) => row.term))}`,
  );

  const bothWords = filterReference(portlarRows, { query: "redis cache" });
  check(
    "portlar: a two-word query requires both words — Memcached matches 'cache' alone but not 'redis'",
    bothWords.length === 1 && bothWords[0].term === "6379",
    `got: ${JSON.stringify(bothWords.map((row) => row.term))}`,
  );

  const terms = portlarRows.map((row) => `${row.section}:${row.term}`);
  check(
    "portlar: no port term is listed twice within its own section",
    new Set(terms).size === terms.length,
    `${terms.length} rows, ${new Set(terms).size} unique section+term pairs`,
  );
};
