/*
 * What is worth checking here: the audit is clean, the table holds at least
 * the 50 rows the entry's copy claims, the four content assertions the task
 * brief names (CNAME=5, AAAA=28, MX=15, CAA=257) hold exactly, the deprecated
 * section is non-empty and carries the retired SPF type (99) with a note that
 * says so, searching "spf" reaches the TXT-based row and not just the retired
 * one, folding tolerates a missing diacritic, and a two-word query is an AND,
 * not an OR.
 */
import type { CheckSuite } from "./harness.mts";
import { auditReference, filterReference } from "../lib/reference";
import { dnsQeydTipleriRows, dnsQeydTipleriSections } from "../lib/dns-qeyd-tipleri";

export const checks: CheckSuite = (check) => {
  const problems = auditReference(dnsQeydTipleriRows, dnsQeydTipleriSections);
  check(
    "dns-qeyd-tipleri: auditReference finds nothing wrong with the rows",
    problems.length === 0,
    `got: ${JSON.stringify(problems)}`,
  );

  check(
    "dns-qeyd-tipleri: the table holds at least the 50 rows the entry claims",
    dnsQeydTipleriRows.length >= 50,
    `got: ${dnsQeydTipleriRows.length}`,
  );

  const cname = dnsQeydTipleriRows.find((row) => row.term === "CNAME");
  check(
    "dns-qeyd-tipleri: CNAME's type code is 5",
    cname?.label === "5",
    `got: ${JSON.stringify(cname)}`,
  );

  const aaaa = dnsQeydTipleriRows.find((row) => row.term === "AAAA");
  check(
    "dns-qeyd-tipleri: AAAA's type code is 28",
    aaaa?.label === "28",
    `got: ${JSON.stringify(aaaa)}`,
  );

  const mx = dnsQeydTipleriRows.find((row) => row.term === "MX");
  check(
    "dns-qeyd-tipleri: MX's type code is 15",
    mx?.label === "15",
    `got: ${JSON.stringify(mx)}`,
  );

  const caa = dnsQeydTipleriRows.find((row) => row.term === "CAA");
  check(
    "dns-qeyd-tipleri: CAA's type code is 257",
    caa?.label === "257",
    `got: ${JSON.stringify(caa)}`,
  );

  const spfHits = filterReference(dnsQeydTipleriRows, { query: "spf" });
  check(
    "dns-qeyd-tipleri: searching spf finds the TXT-based row and the note mentions TXT",
    spfHits.some((row) => row.section === "poct" && row.note.includes("TXT")),
    `got: ${JSON.stringify(spfHits.map((row) => `${row.section}/${row.term}`))}`,
  );

  const dmarcHits = filterReference(dnsQeydTipleriRows, { query: "dmarc" });
  check(
    "dns-qeyd-tipleri: searching dmarc finds its row",
    dmarcHits.some((row) => row.term === "DMARC"),
    `got: ${JSON.stringify(dmarcHits.map((row) => row.term))}`,
  );

  const deprecated = dnsQeydTipleriRows.filter((row) => row.section === "kohne");
  check(
    "dns-qeyd-tipleri: the deprecated section is non-empty",
    deprecated.length > 0,
    `got: ${deprecated.length}`,
  );

  const retiredSpf = deprecated.find((row) => row.term === "SPF");
  check(
    "dns-qeyd-tipleri: retired SPF (type 99) is in the deprecated section and its note says it is retired",
    retiredSpf !== undefined &&
      (retiredSpf.label ?? "").includes("99") &&
      retiredSpf.note.includes("ləğv"),
    `got: ${JSON.stringify(retiredSpf)}`,
  );

  const diacriticFree = filterReference(dnsQeydTipleriRows, { query: "merkez" });
  check(
    "dns-qeyd-tipleri: a diacritic-free query (merkez) still finds a note written with mərkəz",
    diacriticFree.some((row) => row.term === "CAA"),
    `got: ${JSON.stringify(diacriticFree.map((row) => row.term))}`,
  );

  const bothWords = filterReference(dnsQeydTipleriRows, { query: "dkim bimi" });
  check(
    "dns-qeyd-tipleri: a two-word query requires both words — no row mentions DKIM and BIMI together",
    bothWords.length === 0,
    `got: ${JSON.stringify(bothWords.map((row) => `${row.section}/${row.term}`))}`,
  );

  const oneWord = filterReference(dnsQeydTipleriRows, { query: "bimi" });
  check(
    "dns-qeyd-tipleri: dropping one of those words finds the BIMI row again",
    oneWord.some((row) => row.term === "BIMI"),
    `got: ${JSON.stringify(oneWord.map((row) => row.term))}`,
  );
};
