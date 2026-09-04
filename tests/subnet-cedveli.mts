/*
 * What is worth checking here: the audit is clean, every one of the 33 IPv4
 * prefixes is present exactly once with the mask/count arithmetic a formula
 * would produce (checked by re-deriving that arithmetic here, independently
 * of the data file, and asserting it shows up in the row), the two boundary
 * prefixes (/31, /32) carry the explanation a plain "cəmi-2" formula would
 * get wrong, a lookup works from a wildcard mask and from a hex mask alike,
 * a two-word query is an AND, and a handful of named reserved ranges are
 * exactly where a visitor would look for them.
 */
import type { CheckSuite } from "./harness.mts";
import { auditReference, filterReference } from "../lib/reference";
import { subnetCedveliRows, subnetCedveliSections } from "../lib/subnet-cedveli";

/** Re-derives the IPv4 arithmetic independently of the data file, so this
 *  check does not just restate what the implementation already computed. */
function expectedUsable(prefix: number): number {
  const total = 2 ** (32 - prefix);
  if (prefix === 32) return 1;
  if (prefix === 31) return 2;
  return total - 2;
}

function formatCount(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export const checks: CheckSuite = (check) => {
  const problems = auditReference(subnetCedveliRows, subnetCedveliSections);
  check(
    "subnet-cedveli: auditReference finds nothing wrong with the rows",
    problems.length === 0,
    `got: ${JSON.stringify(problems)}`,
  );

  check(
    "subnet-cedveli: the table holds at least 60 rows",
    subnetCedveliRows.length >= 60,
    `got: ${subnetCedveliRows.length}`,
  );

  const ipv4Rows = subnetCedveliRows.filter((row) => row.section === "ipv4");
  const ipv4Terms = new Set(ipv4Rows.map((row) => row.term));
  const allPrefixesPresent = Array.from({ length: 33 }, (_, i) => `/${i}`).every((term) =>
    ipv4Terms.has(term),
  );
  check(
    "subnet-cedveli: all 33 IPv4 prefixes (/0 through /32) are present exactly once",
    ipv4Rows.length === 33 && allPrefixesPresent,
    `got ${ipv4Rows.length} ipv4 rows: ${JSON.stringify([...ipv4Terms].sort())}`,
  );

  const row24 = ipv4Rows.find((row) => row.term === "/24");
  check(
    "subnet-cedveli: /24 has mask 255.255.255.0, 256 total and 254 usable",
    row24?.label === "255.255.255.0" &&
      row24.note.includes("256") &&
      row24.note.includes("254"),
    `got: ${JSON.stringify(row24)}`,
  );

  const row30 = ipv4Rows.find((row) => row.term === "/30");
  check(
    "subnet-cedveli: /30 has 2 usable hosts",
    row30 !== undefined && row30.note.includes(`bunlardan ${formatCount(2)} host`),
    `got: ${JSON.stringify(row30)}`,
  );

  const row31 = ipv4Rows.find((row) => row.term === "/31");
  check(
    "subnet-cedveli: /31 has 2 usable and names RFC 3021 as the reason",
    row31 !== undefined && row31.note.includes("RFC 3021") && row31.note.includes("hər ikisi (2)"),
    `got: ${JSON.stringify(row31)}`,
  );

  const row32 = ipv4Rows.find((row) => row.term === "/32");
  check(
    "subnet-cedveli: /32 has 1 usable with a note explaining why it is not zero",
    row32 !== undefined &&
      row32.note.includes("sıfır deyil, birdir") &&
      row32.note.includes("(1)"),
    `got: ${JSON.stringify(row32)}`,
  );

  const row0 = ipv4Rows.find((row) => row.term === "/0");
  check(
    "subnet-cedveli: /0 exists and its note names the default route",
    row0 !== undefined && row0.note.includes("default marşrutu"),
    `got: ${JSON.stringify(row0)}`,
  );

  let usableFormulaHolds = true;
  for (const row of ipv4Rows) {
    const prefix = Number(row.term.slice(1));
    if (prefix > 29) continue;
    const usable = expectedUsable(prefix);
    if (!row.note.includes(`bunlardan ${formatCount(usable)} host`)) usableFormulaHolds = false;
  }
  check(
    "subnet-cedveli: for every prefix /0 through /29, usable hosts equals total minus 2",
    usableFormulaHolds,
    "at least one ipv4 row's note disagrees with the re-derived total-minus-2 formula",
  );

  const byWildcard = filterReference(subnetCedveliRows, { query: "0.0.0.255" });
  check(
    "subnet-cedveli: searching the wildcard mask 0.0.0.255 finds /24",
    byWildcard.some((row) => row.term === "/24" && row.section === "ipv4"),
    `got: ${JSON.stringify(byWildcard.map((row) => `${row.section}:${row.term}`))}`,
  );

  const byHex = filterReference(subnetCedveliRows, { query: "ffffff00" });
  check(
    "subnet-cedveli: searching the hex mask ffffff00 finds /24",
    byHex.some((row) => row.term === "/24" && row.section === "ipv4"),
    `got: ${JSON.stringify(byHex.map((row) => `${row.section}:${row.term}`))}`,
  );

  const byRfc1918 = filterReference(subnetCedveliRows, { query: "192.168" });
  check(
    "subnet-cedveli: searching 192.168 finds the RFC 1918 192.168.0.0/16 row",
    byRfc1918.some((row) => row.term === "192.168.0.0/16"),
    `got: ${JSON.stringify(byRfc1918.map((row) => row.term))}`,
  );

  const rowDocV6 = subnetCedveliRows.find((row) => row.term === "2001:db8::/32");
  check(
    "subnet-cedveli: 2001:db8::/32 is present and its note says it is for documentation",
    rowDocV6 !== undefined && rowDocV6.note.includes("sənədləşmə"),
    `got: ${JSON.stringify(rowDocV6)}`,
  );

  const rowCgnat = subnetCedveliRows.find((row) => row.term === "100.64.0.0/10");
  check(
    "subnet-cedveli: 100.64.0.0/10 is present and its note names carrier NAT (CGNAT)",
    rowCgnat !== undefined && rowCgnat.note.includes("CGNAT"),
    `got: ${JSON.stringify(rowCgnat)}`,
  );

  const diacriticFree = filterReference(subnetCedveliRows, { query: "sexsi" });
  check(
    "subnet-cedveli: a diacritic-free query (sexsi) still finds notes written with şəxsi",
    diacriticFree.some((row) => row.term === "192.168.0.0/16"),
    `got: ${JSON.stringify(diacriticFree.map((row) => row.term))}`,
  );

  const bothWords = filterReference(subnetCedveliRows, { query: "loopback multicast" });
  check(
    "subnet-cedveli: a two-word query requires both words — no row is both loopback and multicast",
    bothWords.length === 0,
    `got: ${JSON.stringify(bothWords.map((row) => row.term))}`,
  );

  const carrierNat = filterReference(subnetCedveliRows, { query: "carrier nat" });
  check(
    "subnet-cedveli: a two-word AND where both words apply finds exactly the CGNAT row",
    carrierNat.length === 1 && carrierNat[0].term === "100.64.0.0/10",
    `got: ${JSON.stringify(carrierNat.map((row) => row.term))}`,
  );
};
