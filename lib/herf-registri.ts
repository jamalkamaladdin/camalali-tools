/**
 * Case conversion that gets the two Azerbaijani-specific letters right.
 *
 * JavaScript's locale-unaware `toUpperCase`/`toLowerCase` run the ASCII case
 * table: capital I lowercases to plain ASCII i, and plain ASCII i uppercases
 * back to capital I. Azerbaijani orthography has a second I/i pair the ASCII
 * table does not know about — a dotless lowercase letter whose capital is the
 * plain, undotted I, and a dotted lowercase letter whose capital carries a
 * dot of its own — so every case conversion built on the default table turns
 * the dotless letter into the wrong one and turns the dotted capital back
 * into plain ASCII i plus a stray combining dot rather than one clean code
 * point.
 *
 * `String.prototype.toLocaleLowerCase("az")` exists to fix exactly this, and
 * on the runtime this file was written against it does. But that is one
 * runtime's ICU data, not a guarantee — a build target without the Azerbaijani
 * locale table would silently fall back to the ASCII rule with no error at
 * all. So this file never relies on it: `AZ_LOWER_OVERRIDE` /
 * `AZ_UPPER_OVERRIDE` below are the small table this tool actually runs on,
 * and `localeAgreement()` separately asks the platform's own locale API for
 * the same four letters and reports whether it agrees — visible proof of
 * which method produced the answer on screen, rather than a silent
 * assumption.
 */
import { splitWords } from "./ad-formati.js";

/* Only the I/i family needs an override: the other five Azerbaijani letter
   pairs each have a single, unambiguous Unicode case mapping with no locale
   dependency, so the platform's own `toUpperCase` / `toLowerCase` already
   gets them right. Overriding only the two letters that are actually wrong,
   rather than replacing the whole case function, is what keeps every other
   alphabet run through this file untouched. */
const AZ_LOWER_OVERRIDE: Record<string, string> = { I: "ı", İ: "i" };
const AZ_UPPER_OVERRIDE: Record<string, string> = { ı: "I", i: "İ" };

export function azLowerChar(char: string): string {
  return AZ_LOWER_OVERRIDE[char] ?? char.toLowerCase();
}

export function azUpperChar(char: string): string {
  return AZ_UPPER_OVERRIDE[char] ?? char.toUpperCase();
}

/** Code-point iteration (spreading the string, not `.split("")`) so a character outside the Basic Multilingual Plane is never split into a broken surrogate half. */
export function azToLowerCase(text: string): string {
  return [...text].map(azLowerChar).join("");
}

export function azToUpperCase(text: string): string {
  return [...text].map(azUpperChar).join("");
}

function azCapitalise(word: string): string {
  const chars = [...word];
  const first = chars[0];
  if (first === undefined) return word;
  return azUpperChar(first) + chars.slice(1).map(azLowerChar).join("");
}

/* ---------- the four letters, both ways round ---------- */

export const AZ_CASE_LETTERS = ["I", "ı", "İ", "i"] as const;

export type LetterComparisonRow = {
  char: string;
  /** What the plain, locale-unaware `toLowerCase`/`toUpperCase` produces — the rule most editors and most other programming languages apply by default. */
  defaultLower: string;
  defaultUpper: string;
  /** What this file's own override table produces. */
  azerbaijaniLower: string;
  azerbaijaniUpper: string;
};

export function letterComparisonTable(): LetterComparisonRow[] {
  return AZ_CASE_LETTERS.map((char) => ({
    char,
    defaultLower: char.toLowerCase(),
    defaultUpper: char.toUpperCase(),
    azerbaijaniLower: azLowerChar(char),
    azerbaijaniUpper: azUpperChar(char),
  }));
}

export type LocaleAgreement = {
  /** True when the platform locale API matched this file's own table on all four letters, on this runtime. */
  agrees: boolean;
  /** The letters (if any) where the locale API and this file's table disagreed. */
  mismatches: string[];
};

/** Checked once per call rather than cached: a build can run this in more than one JS engine, and the answer is meant to describe the one it is running in right now. */
export function localeAgreement(): LocaleAgreement {
  const mismatches: string[] = [];
  for (const char of AZ_CASE_LETTERS) {
    if (char.toLocaleLowerCase("az") !== azLowerChar(char)) mismatches.push(`${char} -> lower`);
    if (char.toLocaleUpperCase("az") !== azUpperChar(char)) mismatches.push(`${char} -> upper`);
  }
  return { agrees: mismatches.length === 0, mismatches };
}

/* ---------- the eleven modes ---------- */

export type CaseMode =
  | "lower"
  | "upper"
  | "titleCase"
  | "sentenceCase"
  | "invertCase"
  | "alternatingCase"
  | "camelCase"
  | "PascalCase"
  | "snake_case"
  | "kebab-case"
  | "CONSTANT_CASE";

export const CASE_MODES: CaseMode[] = [
  "lower",
  "upper",
  "titleCase",
  "sentenceCase",
  "invertCase",
  "alternatingCase",
  "camelCase",
  "PascalCase",
  "snake_case",
  "kebab-case",
  "CONSTANT_CASE",
];

export const CASE_MODE_LABELS: Record<CaseMode, string> = {
  lower: "kiçik",
  upper: "BÖYÜK",
  titleCase: "Hər Sözün İlk Hərfi",
  sentenceCase: "Cümlə formatı",
  invertCase: "Tərs registr",
  alternatingCase: "Dəyişkən registr",
  camelCase: "camelCase",
  PascalCase: "PascalCase",
  snake_case: "snake_case",
  "kebab-case": "kebab-case",
  CONSTANT_CASE: "CONSTANT_CASE",
};

/** Splits on whitespace but keeps the separators, so punctuation and line breaks in the visitor's text survive a word-by-word transform untouched. */
function mapWords(text: string, transform: (word: string) => string): string {
  return text.replace(/\S+/g, transform);
}

function toTitleCase(text: string): string {
  return mapWords(text, azCapitalise);
}

function toSentenceCase(text: string): string {
  const lowered = azToLowerCase(text);
  const chars = [...lowered];
  const firstLetterIndex = chars.findIndex((char) => azUpperChar(char) !== char || azLowerChar(char) !== char);
  if (firstLetterIndex === -1) return lowered;
  chars[firstLetterIndex] = azUpperChar(chars[firstLetterIndex]);
  return chars.join("");
}

function toInvertCase(text: string): string {
  return [...text]
    .map((char) => {
      const lower = azLowerChar(char);
      const upper = azUpperChar(char);
      if (char === lower && char !== upper) return upper;
      if (char === upper && char !== lower) return lower;
      return char;
    })
    .join("");
}

/**
 * A deterministic alternating case rather than a random one: the toggle only
 * advances on a character that actually has a case (a letter), so a run of
 * spaces or punctuation never resets or skips the pattern, and running the
 * same input through this twice always produces the same output — which is
 * what makes it possible to write a check for it at all.
 */
function toAlternatingCase(text: string): string {
  let letterIndex = 0;
  return [...text]
    .map((char) => {
      const lower = azLowerChar(char);
      const upper = azUpperChar(char);
      if (lower === upper) return char;
      const result = letterIndex % 2 === 0 ? lower : upper;
      letterIndex += 1;
      return result;
    })
    .join("");
}

/*
 * The identifier-style modes reuse `ad-formati.ts`'s `splitWords` — the
 * acronym-aware boundary detector that turns "XMLHttpRequest" into three
 * words rather than one or four — instead of re-deriving it. What differs
 * from that file's own builders is the casing primitive applied to each
 * word: `ad-formati.ts` says outright that it stays on the ASCII-only
 * `toUpperCase`/`toLowerCase` because taking a position on locale-aware
 * casing was a bigger scope than a delimiter converter's job. Filling that
 * gap for identifiers built out of Azerbaijani words is this file's job.
 */
function identifierWords(text: string): string[] {
  return splitWords(text).map(azToLowerCase);
}

function toCamelCase(text: string): string {
  return identifierWords(text)
    .map((word, index) => (index === 0 ? word : azCapitalise(word)))
    .join("");
}

function toPascalCase(text: string): string {
  return identifierWords(text).map(azCapitalise).join("");
}

function toSnakeCase(text: string): string {
  return identifierWords(text).join("_");
}

function toKebabCase(text: string): string {
  return identifierWords(text).join("-");
}

function toConstantCase(text: string): string {
  return identifierWords(text)
    .map((word) => azToUpperCase(word))
    .join("_");
}

const CASE_BUILDERS: Record<CaseMode, (text: string) => string> = {
  lower: azToLowerCase,
  upper: azToUpperCase,
  titleCase: toTitleCase,
  sentenceCase: toSentenceCase,
  invertCase: toInvertCase,
  alternatingCase: toAlternatingCase,
  camelCase: toCamelCase,
  PascalCase: toPascalCase,
  snake_case: toSnakeCase,
  "kebab-case": toKebabCase,
  CONSTANT_CASE: toConstantCase,
};

export function convertCase(text: string, mode: CaseMode): string {
  return CASE_BUILDERS[mode](text);
}

export function convertAllModes(text: string): Record<CaseMode, string> {
  const result = {} as Record<CaseMode, string>;
  for (const mode of CASE_MODES) result[mode] = CASE_BUILDERS[mode](text);
  return result;
}
