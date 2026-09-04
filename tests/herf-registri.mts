/*
 * What is worth checking here: the four-letter override table in both
 * directions, that it genuinely disagrees with the platform's default
 * casing (the whole reason this tool exists), a round trip through
 * lower-then-upper, the deterministic alternating and inverted modes, the
 * identifier modes carrying the Azerbaijani rule through word-splitting
 * (including into a mixed Azerbaijani/English word like an "ID" suffix),
 * idempotence of an already-converted identifier, and that the locale
 * cross-check never throws.
 */
import type { CheckSuite } from "./harness.mts";
import {
  azLowerChar,
  azUpperChar,
  convertCase,
  letterComparisonTable,
  localeAgreement,
} from "../lib/herf-registri";

export const checks: CheckSuite = (check) => {
  check(
    "herf-registri: capital I lowercases to dotless ı, dotted capital İ lowercases to plain i",
    azLowerChar("I") === "ı" && azLowerChar("İ") === "i",
    `got: ${azLowerChar("I")} / ${azLowerChar("İ")}`,
  );
  check(
    "herf-registri: dotless ı uppercases to plain I, plain i uppercases to dotted İ",
    azUpperChar("ı") === "I" && azUpperChar("i") === "İ",
    `got: ${azUpperChar("ı")} / ${azUpperChar("i")}`,
  );

  const iRow = letterComparisonTable().find((row) => row.char === "I");
  check(
    "herf-registri: the default JS rule and this file's own table disagree on capital I, which is the bug this tool exists to fix",
    iRow?.defaultLower === "i" && iRow?.azerbaijaniLower === "ı",
    `got: ${JSON.stringify(iRow)}`,
  );

  check(
    "herf-registri: lowering then uppering an I returns the original letter, both members of the family",
    azUpperChar(azLowerChar("I")) === "I" && azUpperChar(azLowerChar("İ")) === "İ",
    `got: ${azUpperChar(azLowerChar("I"))} / ${azUpperChar(azLowerChar("İ"))}`,
  );

  check(
    "herf-registri: alternating case toggles only on letters, starting lower",
    convertCase("salam", "alternatingCase") === "sAlAm",
    `got: ${convertCase("salam", "alternatingCase")}`,
  );

  check(
    "herf-registri: invert case swaps every letter's case using the Azerbaijani table",
    convertCase("Salam", "invertCase") === "sALAM",
    `got: ${convertCase("Salam", "invertCase")}`,
  );

  check(
    "herf-registri: title case capitalises each word with the Azerbaijani rule",
    convertCase("salam dünya", "titleCase") === "Salam Dünya",
    `got: ${convertCase("salam dünya", "titleCase")}`,
  );

  check(
    "herf-registri: sentence case only capitalises the first letter of the whole text",
    convertCase("SALAM dünya", "sentenceCase") === "Salam dünya",
    `got: ${convertCase("SALAM dünya", "sentenceCase")}`,
  );

  check(
    "herf-registri: snake_case lowers a dotted İ and a bare I through the Azerbaijani table, not the ASCII one",
    convertCase("İstifadəçi ID", "snake_case") === "istifadəçi_ıd",
    `got: ${convertCase("İstifadəçi ID", "snake_case")}`,
  );

  check(
    "herf-registri: CONSTANT_CASE is the exact reverse of that snake_case result",
    convertCase("istifadəçi ıd", "CONSTANT_CASE") === "İSTİFADƏÇİ_ID",
    `got: ${convertCase("istifadəçi ıd", "CONSTANT_CASE")}`,
  );

  const onceConverted = convertCase("İstifadəçi ID", "snake_case");
  check(
    "herf-registri: running snake_case again on an already-snake_case identifier changes nothing",
    convertCase(onceConverted, "snake_case") === onceConverted,
    `got: ${convertCase(onceConverted, "snake_case")}`,
  );

  check(
    "herf-registri: PascalCase capitalises each word of a two-word Azerbaijani phrase",
    convertCase("ağ ev", "PascalCase") === "AğEv",
    `got: ${convertCase("ağ ev", "PascalCase")}`,
  );

  check(
    "herf-registri: empty input never throws for any mode",
    convertCase("", "upper") === "" && convertCase("", "snake_case") === "",
    "empty input crashed",
  );

  const agreement = localeAgreement();
  check(
    "herf-registri: the locale cross-check returns a well-shaped result without throwing",
    typeof agreement.agrees === "boolean" && Array.isArray(agreement.mismatches),
    `got: ${JSON.stringify(agreement)}`,
  );
};
