/*
 * What is worth checking here: the schwa's UTF-8 byte count (the fact this
 * whole batch is built around), the two JS-escape forms (four-digit versus
 * braced), URL-encoding of a multi-byte character, a grapheme cluster
 * disagreeing with its code-point count, the inspector's row cap holding on
 * a large input, and the Azerbaijani-letter usage table classifying two
 * different Unicode blocks correctly rather than lumping every accented
 * letter into one bucket.
 */
import type { CheckSuite } from "./harness.mts";
import { azLetterUsage, inspectUnicode, textSummary, INSPECT_LIMIT } from "../lib/unicode";

export const checks: CheckSuite = (check) => {
  const schwaRow = inspectUnicode("ə")[0];
  check(
    "unicode: the schwa is two UTF-8 bytes, hex C9 99",
    schwaRow?.utf8 === "C9 99",
    `got: ${JSON.stringify(schwaRow)}`,
  );

  const schwaUsage = azLetterUsage("ə").find((entry) => entry.letter === "ə");
  check(
    "unicode: azLetterUsage agrees with the inspector on the schwa's byte count and counts one occurrence",
    schwaUsage?.utf8Bytes === 2 && schwaUsage?.count === 1 && schwaUsage?.totalBytes === 2,
    `got: ${JSON.stringify(schwaUsage)}`,
  );

  check(
    "unicode: a Basic-Multilingual-Plane character escapes as four hex digits",
    inspectUnicode("ə")[0]?.jsEscape === "\\u0259",
    `got: ${inspectUnicode("ə")[0]?.jsEscape}`,
  );

  const astral = "\u{1F600}";
  check(
    "unicode: a character past the Basic Multilingual Plane escapes with the braced \\u{...} form",
    inspectUnicode(astral)[0]?.jsEscape === "\\u{1f600}",
    `got: ${inspectUnicode(astral)[0]?.jsEscape}`,
  );

  check(
    "unicode: the astral character's URL encoding is its four raw UTF-8 bytes, percent-escaped",
    inspectUnicode(astral)[0]?.urlEncoded === "%F0%9F%98%80",
    `got: ${inspectUnicode(astral)[0]?.urlEncoded}`,
  );

  const combining = textSummary("é");
  check(
    "unicode: an 'e' plus a combining accent is one grapheme but two code points",
    combining.graphemes === 1 && combining.codePoints === 2,
    `got: ${JSON.stringify(combining)}`,
  );

  check(
    "unicode: empty input never throws and reports zero everywhere",
    inspectUnicode("").length === 0 && textSummary("").codePoints === 0,
    "empty input crashed or reported non-zero",
  );

  const long = "a".repeat(INSPECT_LIMIT + 500);
  check(
    "unicode: the inspector caps its rows at INSPECT_LIMIT on a long input",
    inspectUnicode(long).length === INSPECT_LIMIT,
    `got length: ${inspectUnicode(long).length}`,
  );

  check(
    "unicode: dotted capital I (U+0130) and plain lowercase i (U+0069) are distinct code points",
    inspectUnicode("İ")[0]?.hex === "U+0130" && inspectUnicode("i")[0]?.hex === "U+0069",
    `got: ${inspectUnicode("İ")[0]?.hex} / ${inspectUnicode("i")[0]?.hex}`,
  );

  const usage = azLetterUsage("");
  check(
    "unicode: azLetterUsage always reports all sixteen Azerbaijani letters, even in empty input",
    usage.length === 16 && usage.every((entry) => entry.count === 0),
    `got length: ${usage.length}`,
  );

  const cLower = usage.find((entry) => entry.letter === "ç");
  const schwaBlock = usage.find((entry) => entry.letter === "ə");
  const capitalSchwaBlock = usage.find((entry) => entry.letter === "Ə");
  check(
    "unicode: three Azerbaijani letters land in three different Unicode blocks, correctly named",
    cLower?.block === "Latın-1 tamamlayıcısı" &&
      schwaBlock?.block === "IPA genişləndirmələri" &&
      capitalSchwaBlock?.block === "Latın genişləndirilmiş-B",
    `got: ${cLower?.block} / ${schwaBlock?.block} / ${capitalSchwaBlock?.block}`,
  );

  const doubled = azLetterUsage("ıı").find((entry) => entry.letter === "ı");
  check(
    "unicode: totalBytes is count times utf8Bytes, not a flat per-letter constant",
    doubled?.count === 2 && doubled?.totalBytes === 4,
    `got: ${JSON.stringify(doubled)}`,
  );
};
