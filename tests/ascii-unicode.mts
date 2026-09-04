/*
 * What is worth checking here: the four columns of a row are all derived from
 * the same character and cannot drift apart, the counts that disagree with
 * each other disagree for the right reason (a family emoji is one grapheme and
 * five code points), every character the tool exists to catch is actually
 * flagged, an ordinary word flags nothing, the lookup accepts the five forms
 * the same character is written in, the cap holds, and the reference table
 * passes the same audit every other lookup table in the site runs.
 *
 * The UTF-8 column is checked against `TextEncoder` rather than against a
 * hand-typed byte string, because a hand-typed byte string is the thing most
 * likely to be wrong in a table of two hundred rows.
 */
import type { CheckSuite } from "./harness.mts";
import {
  asciiUnicodeRows,
  asciiUnicodeSections,
  INSPECT_LIMIT,
  inspectText,
  lookupCodePoint,
  textSummary,
} from "../lib/ascii-unicode";
import { auditReference, filterReference } from "../lib/reference";

const encoder = new TextEncoder();

const FAMILY_EMOJI = "\u{1F468}\u200D\u{1F469}\u200D\u{1F466}";
const CONTROL_ROWS = 33;
const PRINTABLE_ASCII_ROWS = 95;
const SCHWA = 601;

export const checks: CheckSuite = (check) => {
  const schwa = inspectText("ə")[0];
  check(
    "ascii-unicode: the schwa is described as U+0259, decimal 601, two UTF-8 bytes and a numeric entity",
    schwa !== undefined &&
      schwa.hex === "U+0259" &&
      schwa.decimal === SCHWA &&
      schwa.utf8 === "C9 99" &&
      schwa.utf16 === "0259" &&
      schwa.entity === "&#601;",
    `got: ${JSON.stringify(schwa)}`,
  );

  const capitalA = inspectText("A")[0];
  check(
    "ascii-unicode: a plain ASCII letter is one byte and stays inside the ASCII range",
    capitalA !== undefined &&
      capitalA.hex === "U+0041" &&
      capitalA.utf8 === "41" &&
      capitalA.decimal === 65 &&
      !capitalA.invisible,
    `got: ${JSON.stringify(capitalA)}`,
  );

  const thumb = inspectText("👍");
  check(
    "ascii-unicode: an emoji outside the basic plane is one row, two UTF-16 units and four UTF-8 bytes",
    thumb.length === 1 &&
      thumb[0] !== undefined &&
      thumb[0].codePoint === 0x1f44d &&
      thumb[0].utf16.split(" ").length === 2 &&
      thumb[0].utf8.split(" ").length === 4,
    `got: ${JSON.stringify(thumb)}`,
  );

  const family = textSummary(FAMILY_EMOJI);
  check(
    "ascii-unicode: a ZWJ family emoji is one grapheme built from five code points",
    family.graphemes === 1 && family.codePoints === 5,
    `got: ${JSON.stringify(family)}`,
  );

  const dottedCapital = inspectText("İ")[0];
  const dotlessSmall = inspectText("ı")[0];
  check(
    "ascii-unicode: the dotted capital is U+0130 and the dotless small letter is U+0131",
    dottedCapital?.hex === "U+0130" && dotlessSmall?.hex === "U+0131",
    `got: ${dottedCapital?.hex} and ${dotlessSmall?.hex}`,
  );

  /* The defect the reference row warns about, stated as a measurement: the
     locale-free lower-casing of İ is two code points, not one, which is why
     an equality comparison against "i" fails. */
  const naiveLower = inspectText("İ".toLowerCase());
  check(
    "ascii-unicode: locale-free toLowerCase turns İ into i plus a combining dot, so the inspector shows two rows",
    naiveLower.length === 2 &&
      naiveLower[0]?.codePoint === 0x69 &&
      naiveLower[1]?.codePoint === 0x0307,
    `got: ${JSON.stringify(naiveLower.map((row) => row.hex))}`,
  );

  /* Written as escapes on purpose: a literal invisible character in a source
     file is the very defect this tool exists to find. */
  const hidden = ["\u200B", "\u00A0", "\uFEFF", "\u00AD"];
  const missed = hidden.filter((char) => {
    const info = inspectText(char)[0];
    return info === undefined || !info.invisible || info.warning === undefined;
  });
  check(
    "ascii-unicode: zero-width space, non-breaking space, BOM and soft hyphen are all invisible and all carry a warning",
    missed.length === 0,
    `not flagged: ${JSON.stringify(missed.map((char) => char.codePointAt(0)))}`,
  );

  const bidi = inspectText("\u202E")[0];
  check(
    "ascii-unicode: the right-to-left override is flagged, since it is the character source-code attacks use",
    bidi !== undefined && bidi.invisible && bidi.warning !== undefined,
    `got: ${JSON.stringify(bidi)}`,
  );

  check(
    "ascii-unicode: an ordinary word flags nothing at all",
    inspectText("abc").every((row) => !row.invisible && row.warning === undefined),
    `got: ${JSON.stringify(inspectText("abc"))}`,
  );

  check(
    "ascii-unicode: a character with no ink still gets a placeholder rather than an empty cell",
    inspectText("\u200B")[0]?.display === "·" && inspectText(" ")[0]?.display === "·",
    `got: ${JSON.stringify([inspectText("\u200B")[0]?.display, inspectText(" ")[0]?.display])}`,
  );

  const texts = ["abc", "salam ə👍", FAMILY_EMOJI, "Şəhər adı — «Bakı»"];
  const byteMismatch = texts.filter(
    (text) => textSummary(text).utf8Bytes !== encoder.encode(text).length,
  );
  check(
    "ascii-unicode: the reported UTF-8 byte count matches TextEncoder for plain, accented, emoji and mixed text",
    byteMismatch.length === 0,
    `disagreed on: ${JSON.stringify(byteMismatch)}`,
  );

  const mixed = textSummary("aə👍");
  check(
    "ascii-unicode: the summary counts UTF-16 units and non-ASCII code points separately from code points",
    mixed.codePoints === 3 && mixed.utf16Units === 4 && mixed.nonAscii === 2,
    `got: ${JSON.stringify(mixed)}`,
  );

  const forms = ["U+0259", "0259", "601", "&#601;", "ə"];
  const results = forms.map((form) => lookupCodePoint(form));
  check(
    "ascii-unicode: all five ways of writing the schwa reach the same character",
    results.every((info) => info !== null && info.codePoint === SCHWA),
    `got: ${JSON.stringify(results.map((info) => info?.codePoint ?? null))}`,
  );

  check(
    "ascii-unicode: a leading zero means hex and no leading zero means decimal, so 0041 and 65 are both the letter A",
    lookupCodePoint("0041")?.codePoint === 65 && lookupCodePoint("65")?.codePoint === 65,
    `got: ${lookupCodePoint("0041")?.codePoint} and ${lookupCodePoint("65")?.codePoint}`,
  );

  check(
    "ascii-unicode: input that names no character comes back as null instead of a wrong answer",
    lookupCodePoint("salam") === null &&
      lookupCodePoint("") === null &&
      lookupCodePoint("U+110000") === null &&
      lookupCodePoint("D83D") === null,
    `got: ${JSON.stringify([
      lookupCodePoint("salam"),
      lookupCodePoint("U+110000"),
      lookupCodePoint("D83D"),
    ])}`,
  );

  const long = inspectText("ə".repeat(INSPECT_LIMIT + 500));
  check(
    "ascii-unicode: the inspector stops at its cap while the summary still counts the whole string",
    long.length === INSPECT_LIMIT &&
      textSummary("ə".repeat(INSPECT_LIMIT + 500)).codePoints === INSPECT_LIMIT + 500,
    `rows: ${long.length}`,
  );

  check(
    "ascii-unicode: the reference table passes the shared audit — no orphan sections, duplicates or thin notes",
    auditReference(asciiUnicodeRows, asciiUnicodeSections).length === 0,
    `problems: ${JSON.stringify(auditReference(asciiUnicodeRows, asciiUnicodeSections))}`,
  );

  const controls = asciiUnicodeRows.filter((row) => row.section === "nezaret");
  const printable = asciiUnicodeRows.filter((row) => row.section === "ascii");
  check(
    "ascii-unicode: the control section holds all 33 control codes and the printable section all 95 printable ones",
    controls.length === CONTROL_ROWS && printable.length === PRINTABLE_ASCII_ROWS,
    `control: ${controls.length}, printable: ${printable.length}`,
  );

  const tabHit = filterReference(asciiUnicodeRows, { query: "tab", section: "nezaret" });
  check(
    "ascii-unicode: searching the reference for «tab» finds the U+0009 row",
    tabHit.some((row) => row.term.includes("U+0009")),
    `got: ${JSON.stringify(tabHit.map((row) => row.term))}`,
  );

  const schwaHit = filterReference(asciiUnicodeRows, { query: "schwa" });
  check(
    "ascii-unicode: searching the reference for «schwa» finds the U+0259 row, which never prints that word",
    schwaHit.some((row) => row.term.includes("U+0259")),
    `got: ${JSON.stringify(schwaHit.map((row) => row.term))}`,
  );

  /* Two hundred rows of hand-written notes are exactly where a wrong byte
     string hides, so no row is trusted: each is recomputed from the character
     printed in its own term. */
  const wrongLabel = asciiUnicodeRows.filter((row) => {
    const match = /\(U\+([0-9A-F]{4,6})\)$/.exec(row.term);
    if (match === null || match[1] === undefined) return true;
    const char = String.fromCodePoint(Number.parseInt(match[1], 16));
    const utf8 = Array.from(encoder.encode(char), (byte) =>
      byte.toString(16).toUpperCase().padStart(2, "0"),
    ).join(" ");
    return row.label !== `${char.codePointAt(0)} · UTF-8 ${utf8}`;
  });
  check(
    "ascii-unicode: every reference row's decimal value and UTF-8 bytes agree with the code point in its own term",
    wrongLabel.length === 0,
    `wrong: ${JSON.stringify(wrongLabel.slice(0, 5).map((row) => row.term))}`,
  );

  const azSection = asciiUnicodeRows.filter((row) => row.section === "az");
  const azLetters = "əƏğĞıIİişŞçÇöÖüÜ";
  const missingLetter = Array.from(azLetters).filter(
    (letter) => !azSection.some((row) => row.term.startsWith(`${letter} (`)),
  );
  check(
    "ascii-unicode: all sixteen Azerbaijani letters have a row of their own, including the dotted and dotless i pair",
    azSection.length === 16 && missingLetter.length === 0,
    `count: ${azSection.length}, missing: ${JSON.stringify(missingLetter)}`,
  );

  const signRows = asciiUnicodeRows.filter((row) => row.section === "isare");
  check(
    "ascii-unicode: every sign row carries the HTML entity a visitor came looking for",
    signRows.length > 0 &&
      signRows.every((row) => row.example !== undefined && row.example.startsWith("&")),
    `without entity: ${JSON.stringify(
      signRows.filter((row) => row.example === undefined).map((row) => row.term),
    )}`,
  );
};
