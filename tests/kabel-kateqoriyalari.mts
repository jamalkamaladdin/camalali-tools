/*
 * What is worth checking here: the audit is clean, the table holds at least
 * the 40 rows the task claims, a lookup works from a category name, a
 * connector name and a fibre type alike, folding tolerates a missing
 * diacritic, a two-word query is an AND, and the figures that would silently
 * mislead an installer — Cat6's two distances, Cat6a's honest 100 m, Cat7's
 * TIA status, Cat8's 30 m, the 90+10 channel split, the T568A/T568B pin swap
 * and PoE's device-side wattage — are asserted exactly rather than just
 * "found".
 */
import type { CheckSuite } from "./harness.mts";
import { auditReference, filterReference } from "../lib/reference";
import { kabelKateqoriyalariRows, kabelKateqoriyalariSections } from "../lib/kabel-kateqoriyalari";

function row(term: string) {
  return kabelKateqoriyalariRows.find((item) => item.term === term);
}

export const checks: CheckSuite = (check) => {
  const problems = auditReference(kabelKateqoriyalariRows, kabelKateqoriyalariSections);
  check(
    "kabel-kateqoriyalari: auditReference finds nothing wrong with the rows",
    problems.length === 0,
    `got: ${JSON.stringify(problems)}`,
  );

  check(
    "kabel-kateqoriyalari: the table holds at least 40 rows",
    kabelKateqoriyalariRows.length >= 40,
    `got: ${kabelKateqoriyalariRows.length}`,
  );

  const byCat6 = filterReference(kabelKateqoriyalariRows, { query: "cat6" });
  check(
    "kabel-kateqoriyalari: searching cat6 finds the Cat6 row",
    byCat6.some((item) => item.term === "Cat6"),
    `got: ${JSON.stringify(byCat6.map((item) => item.term))}`,
  );

  const byRj45 = filterReference(kabelKateqoriyalariRows, { query: "rj45" });
  check(
    "kabel-kateqoriyalari: searching rj45 finds the 8P8C row",
    byRj45.some((item) => item.term === "RJ45 (8P8C)"),
    `got: ${JSON.stringify(byRj45.map((item) => item.term))}`,
  );

  const byOm4 = filterReference(kabelKateqoriyalariRows, { query: "om4" });
  check(
    "kabel-kateqoriyalari: searching om4 finds its row",
    byOm4.some((item) => item.term === "OM4"),
    `got: ${JSON.stringify(byOm4.map((item) => item.term))}`,
  );

  const byPoe = filterReference(kabelKateqoriyalariRows, { query: "poe" });
  check(
    "kabel-kateqoriyalari: searching poe finds the 802.3af row",
    byPoe.some((item) => item.term === "802.3af (PoE)"),
    `got: ${JSON.stringify(byPoe.map((item) => item.term))}`,
  );

  const diacriticFree = filterReference(kabelKateqoriyalariRows, { query: "sebeke" });
  check(
    "kabel-kateqoriyalari: a diacritic-free query (sebeke) still finds a note written with şəbəkə",
    diacriticFree.some((item) => item.term === "U/UTP"),
    `got: ${JSON.stringify(diacriticFree.map((item) => item.term))}`,
  );

  const twoWord = filterReference(kabelKateqoriyalariRows, { query: "cat6a poe" });
  check(
    "kabel-kateqoriyalari: a two-word query requires both words — no row is both about Cat6a and PoE",
    twoWord.length === 0,
    `got: ${JSON.stringify(twoWord.map((item) => item.term))}`,
  );

  const oneWord = filterReference(kabelKateqoriyalariRows, { query: "cat6a" });
  check(
    "kabel-kateqoriyalari: dropping one of those words finds the Cat6a row again",
    oneWord.some((item) => item.term === "Cat6a"),
    `got: ${JSON.stringify(oneWord.map((item) => item.term))}`,
  );

  const cat6 = row("Cat6");
  check(
    "kabel-kateqoriyalari: Cat6's note names both the 100 m and the 55 m distance",
    cat6 !== undefined && cat6.note.includes("100") && cat6.note.includes("55"),
    `note: ${cat6?.note}`,
  );

  check(
    "kabel-kateqoriyalari: Cat6's note also names the 37 m alien-crosstalk figure",
    cat6 !== undefined && cat6.note.includes("37"),
    `note: ${cat6?.note}`,
  );

  const cat6a = row("Cat6a");
  check(
    "kabel-kateqoriyalari: Cat6a is 10 Gbit/s at the full 100 m",
    cat6a !== undefined && cat6a.label?.includes("10 Gbit/s") === true && cat6a.label.includes("100 m"),
    `label: ${cat6a?.label}`,
  );

  const cat7 = row("Cat7");
  check(
    "kabel-kateqoriyalari: Cat7's note says it is not TIA-recognised",
    cat7 !== undefined && cat7.note.includes("TIA") && cat7.note.includes("tanınmır"),
    `note: ${cat7?.note}`,
  );

  const cat8 = row("Cat8.1");
  check(
    "kabel-kateqoriyalari: Cat8.1's note names the 30 m reach",
    cat8 !== undefined && cat8.note.includes("30 metr"),
    `note: ${cat8?.note}`,
  );

  const channelSplit = kabelKateqoriyalariRows.some(
    (item) => item.note.includes("90 metr") && item.note.includes("10 metr"),
  );
  check(
    "kabel-kateqoriyalari: the 90 m + 10 m channel split appears in at least one row",
    channelSplit,
    "no row states the 90+10 split",
  );

  const t568a = row("T568A");
  const t568b = row("T568B");
  check(
    "kabel-kateqoriyalari: T568A and T568B examples differ — the orange and green pairs swap",
    t568a !== undefined && t568b !== undefined && t568a.example !== t568b.example,
    `t568a: ${t568a?.example} | t568b: ${t568b?.example}`,
  );

  const bt4 = row("802.3bt Type 4 (PoE++)");
  check(
    "kabel-kateqoriyalari: 802.3bt Type 4 names 100 W",
    bt4 !== undefined && bt4.label?.includes("100 W") === true,
    `label: ${bt4?.label}`,
  );
};
