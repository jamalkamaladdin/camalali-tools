/*
 * The diff tool claims two things a reader cannot verify by eye on a long
 * text: that the lines it calls unchanged really are the longest common
 * subsequence, and that the ones it calls changed are the smallest set that
 * explains the difference. Both are checked here against textbook LCS
 * examples, together with the edge cases that silently produce a wrong answer
 * — a trailing newline, a Windows line ending, and the Azerbaijani dotted and
 * dotless i, which the built-in lowercasing gets wrong.
 */
import type { CheckSuite } from "./harness.mts";
import {
  diffLines,
  DEFAULT_OPTIONS,
  detectLineEnding,
  foldCase,
  MAX_LINES,
  splitLines,
  summaryText,
  toSideBySide,
  toUnifiedText,
} from "../lib/ferq";

const lines = (...values: string[]) => values.join("\n");

function counts(left: string, right: string, options = DEFAULT_OPTIONS) {
  const result = diffLines(left, right, options);
  if (!result.ok) return null;
  return {
    added: result.summary.added,
    removed: result.summary.removed,
    unchanged: result.summary.unchanged,
    result,
  };
}

export const checks: CheckSuite = (check) => {
  /* ---------- the four trivial shapes ---------- */

  const same = counts(lines("bir", "iki", "uc"), lines("bir", "iki", "uc"));
  check(
    "ferq: eyni metnler sifir ferq verir",
    same !== null && same.added === 0 && same.removed === 0 && same.unchanged === 3,
    same === null ? "hedd asildi" : `alindi +${same.added} -${same.removed}`,
  );

  const fromEmpty = counts("", lines("bir", "iki"));
  check(
    "ferq: bos metnden dolu metne hamisi elavedir",
    fromEmpty !== null &&
      fromEmpty.added === 2 &&
      fromEmpty.removed === 0 &&
      fromEmpty.unchanged === 0,
    fromEmpty === null ? "hedd asildi" : `alindi +${fromEmpty.added} -${fromEmpty.removed}`,
  );

  const toEmpty = counts(lines("bir", "iki"), "");
  check(
    "ferq: dolu metnden bos metne hamisi silinmedir",
    toEmpty !== null && toEmpty.added === 0 && toEmpty.removed === 2,
    toEmpty === null ? "hedd asildi" : `alindi +${toEmpty.added} -${toEmpty.removed}`,
  );

  check(
    "ferq: iki bos metn bir bos setir kimi sayilmir",
    splitLines("").length === 0 && counts("", "")?.unchanged === 0,
    `bos metn ${splitLines("").length} setir verdi`,
  );

  /* ---------- insertion and deletion only ---------- */

  const inserted = counts(lines("a", "b", "c"), lines("a", "yeni", "b", "c"));
  check(
    "ferq: ortaya elave olunan setir tek elave sayilir",
    inserted !== null &&
      inserted.added === 1 &&
      inserted.removed === 0 &&
      inserted.unchanged === 3,
    inserted === null ? "hedd asildi" : `alindi +${inserted.added} -${inserted.removed}`,
  );

  const deleted = counts(lines("a", "b", "c", "d"), lines("a", "c", "d"));
  check(
    "ferq: ortadan silinen setir tek silinme sayilir",
    deleted !== null && deleted.added === 0 && deleted.removed === 1 && deleted.unchanged === 3,
    deleted === null ? "hedd asildi" : `alindi +${deleted.added} -${deleted.removed}`,
  );

  /* ---------- a moved line ---------- */

  const moved = counts(lines("a", "b", "c"), lines("b", "a", "c"));
  check(
    "ferq: bir setir yuxari kocende 1 elave 1 silinme cixir",
    moved !== null && moved.added === 1 && moved.removed === 1 && moved.unchanged === 2,
    moved === null ? "hedd asildi" : `alindi +${moved.added} -${moved.removed}`,
  );

  /* ---------- textbook LCS values ---------- */

  // CLRS "Introduction to Algorithms", LCS chapter: the sequences ABCBDAB and
  // BDCABA have a longest common subsequence of length 4.
  const clrs = counts(lines(..."ABCBDAB".split("")), lines(..."BDCABA".split("")));
  check(
    "ferq: CLRS numunesi ABCBDAB/BDCABA 4 ortaq setir verir",
    clrs !== null && clrs.unchanged === 4 && clrs.removed === 3 && clrs.added === 2,
    clrs === null ? "hedd asildi" : `alindi ${clrs.unchanged} ortaq setir`,
  );

  // The other standard worked example: XMJYAUZ and MZJAWXU share MJAU.
  const wiki = counts(lines(..."XMJYAUZ".split("")), lines(..."MZJAWXU".split("")));
  check(
    "ferq: XMJYAUZ/MZJAWXU numunesi 4 ortaq setir verir",
    wiki !== null && wiki.unchanged === 4 && wiki.removed === 3 && wiki.added === 3,
    wiki === null ? "hedd asildi" : `alindi ${wiki.unchanged} ortaq setir`,
  );

  /* ---------- newline at the end of the text ---------- */

  const trailing = counts(lines("bir", "iki"), `${lines("bir", "iki")}\n`);
  check(
    "ferq: sonda yeni setir simvolu ferq kimi gorunur",
    trailing !== null && trailing.added === 1 && trailing.removed === 0,
    trailing === null ? "hedd asildi" : `alindi +${trailing.added} -${trailing.removed}`,
  );

  /* ---------- CRLF against LF ---------- */

  const crlf = diffLines("bir\r\niki\r\n", "bir\niki\n");
  check(
    "ferq: CRLF ve LF setir-setir ferq vermir, ayrica bildirilir",
    crlf.ok &&
      crlf.summary.identical &&
      crlf.summary.endingDiffers &&
      crlf.summary.leftEnding === "crlf" &&
      crlf.summary.rightEnding === "lf",
    crlf.ok
      ? `alindi +${crlf.summary.added} -${crlf.summary.removed}, ferq bayragi ${crlf.summary.endingDiffers}`
      : crlf.error,
  );

  check(
    "ferq: tek setirlik metne setir sonu ferqi yazilmir",
    diffLines("bir", "bir").ok &&
      detectLineEnding("bir") === "none" &&
      detectLineEnding("bir\r\niki") === "crlf" &&
      detectLineEnding("bir\r\niki\nuc") === "mixed",
    "setir sonu tesnifati yanlisdir",
  );

  /* ---------- Azerbaijani letters ---------- */

  // The built-in lowercasing turns U+0130 into two code points, so a naive
  // implementation never matches these two lines.
  check(
    "ferq: standart toLowerCase U+0130-ni bir simvola cevirmir",
    "İ".toLowerCase().length === 2 && foldCase("İ") === "i",
    `toLowerCase ${"İ".toLowerCase().length} simvol verdi`,
  );

  const dotted = counts("İSTİFADƏÇİ", "istifadəçi", {
    ignoreWhitespace: false,
    ignoreCase: true,
  });
  check(
    "ferq: nogteli I herf boyukluyune mehel qoymayanda uygunlasir",
    dotted !== null && dotted.added === 0 && dotted.removed === 0,
    dotted === null ? "hedd asildi" : `alindi +${dotted.added} -${dotted.removed}`,
  );

  const dotless = counts("IŞIQ", "ışıq", { ignoreWhitespace: false, ignoreCase: true });
  check(
    "ferq: nogtesiz i herf boyukluyune mehel qoymayanda uygunlasir",
    dotless !== null && dotless.added === 0 && dotless.removed === 0,
    dotless === null ? "hedd asildi" : `alindi +${dotless.added} -${dotless.removed}`,
  );

  const caseSensitive = counts("Əlaqə", "əlaqə");
  check(
    "ferq: secim sonmus olanda herf boyukluyu ferq sayilir",
    caseSensitive !== null && caseSensitive.added === 1 && caseSensitive.removed === 1,
    caseSensitive === null ? "hedd asildi" : `alindi +${caseSensitive.added}`,
  );

  /* ---------- whitespace ---------- */

  const spaced = counts("  bir   iki  ", "bir iki", {
    ignoreWhitespace: true,
    ignoreCase: false,
  });
  const spacedStrict = counts("  bir   iki  ", "bir iki");
  check(
    "ferq: bosluga mehel qoymayanda daxili bosluq da normallasir",
    spaced !== null &&
      spaced.added === 0 &&
      spacedStrict !== null &&
      spacedStrict.added === 1 &&
      spacedStrict.removed === 1,
    spaced === null ? "hedd asildi" : `alindi +${spaced.added}`,
  );

  /* ---------- line numbers and the two views ---------- */

  const numbered = diffLines(lines("a", "b", "c"), lines("a", "x", "b", "c"));
  check(
    "ferq: setir nomreleri iki terefde ayri sayilir",
    numbered.ok &&
      numbered.lines.length === 4 &&
      numbered.lines[1].kind === "add" &&
      numbered.lines[1].left === null &&
      numbered.lines[1].right === 2 &&
      numbered.lines[2].left === 2 &&
      numbered.lines[2].right === 3,
    numbered.ok ? `alindi ${numbered.lines.length} setir` : numbered.error,
  );

  const replaced = diffLines(lines("a", "b"), lines("a", "c"));
  check(
    "ferq: vahid gorunus diff -u prefikslerini isledir ve silinme evvel gelir",
    replaced.ok && toUnifiedText(replaced.lines) === "  a\n- b\n+ c",
    replaced.ok ? `alindi ${JSON.stringify(toUnifiedText(replaced.lines))}` : replaced.error,
  );

  const rows = replaced.ok ? toSideBySide(replaced.lines) : [];
  check(
    "ferq: yan-yana gorunusde evez edilen setir eyni setirde qarsilasir",
    rows.length === 2 &&
      rows[1].left?.text === "b" &&
      rows[1].right?.text === "c" &&
      rows[1].left?.changed === true,
    `alindi ${rows.length} setir`,
  );

  const uneven = diffLines(lines("a", "b", "c"), lines("a", "x"));
  const unevenRows = uneven.ok ? toSideBySide(uneven.lines) : [];
  check(
    "ferq: silinme sayi elave sayindan cox olanda sag hucre bos qalir",
    unevenRows.length === 3 &&
      unevenRows[2].left?.text === "c" &&
      unevenRows[2].right === null,
    `alindi ${unevenRows.length} setir`,
  );

  check(
    "ferq: xulase setri eyni metnleri ayrica bildirir",
    summaryText({
      added: 0,
      removed: 0,
      unchanged: 3,
      leftLines: 3,
      rightLines: 3,
      leftEnding: "lf",
      rightEnding: "lf",
      endingDiffers: false,
      identical: true,
    }).includes("eyni"),
    "eyni metnler ucun xulase setri yanlisdir",
  );

  /* ---------- the limit ---------- */

  const atLimit = Array.from({ length: MAX_LINES }, (_, i) => `setir ${i}`).join("\n");
  const overLimit = `${atLimit}\nbir setir artiq`;
  const refused = diffLines(overLimit, atLimit);
  check(
    "ferq: hedd asilanda aydin mesajla imtina edilir",
    !refused.ok && refused.error.includes(String(MAX_LINES)),
    refused.ok ? "hedd asilmis metn qebul edildi" : refused.error,
  );

  check(
    "ferq: tam hedd qeder metn hele de hesablanir",
    diffLines(atLimit, atLimit).ok,
    "hedde beraber metn redd edildi",
  );

  // The worst case the limit exists for: nothing in common, so the prefix and
  // suffix trim saves nothing and the full table is built.
  const leftWorst = Array.from({ length: MAX_LINES }, (_, i) => `sol ${i}`).join("\n");
  const rightWorst = Array.from({ length: MAX_LINES }, (_, i) => `sag ${i}`).join("\n");
  const started = Date.now();
  const worst = diffLines(leftWorst, rightWorst);
  const elapsed = Date.now() - started;
  check(
    "ferq: en agir hal hedd daxilinde saniyeden az cekir",
    worst.ok &&
      worst.summary.added === MAX_LINES &&
      worst.summary.removed === MAX_LINES &&
      elapsed < 1000,
    `${elapsed} ms cekdi`,
  );
};
