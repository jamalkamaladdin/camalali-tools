/**
 * Splits an identifier into words regardless of the naming convention it
 * arrived in, then rebuilds it in every convention this tool offers. The
 * split is the hard part: an acronym run like "XMLHttpRequest" has to become
 * three words ("XML", "Http", "Request"), not two or four, and a digit like
 * the "2" in "user2Name" has to become its own word rather than gluing onto
 * a letter on either side.
 */

export type NameCase =
  | "camelCase"
  | "PascalCase"
  | "snake_case"
  | "kebab-case"
  | "CONSTANT_CASE"
  | "Title Case"
  | "sentence case"
  | "dot.case"
  | "path/case";

export const NAME_CASES: NameCase[] = [
  "camelCase",
  "PascalCase",
  "snake_case",
  "kebab-case",
  "CONSTANT_CASE",
  "Title Case",
  "sentence case",
  "dot.case",
  "path/case",
];

/* Anything that is not a letter or a digit — underscore, hyphen, dot,
   slash, plain space, or a visitor pasting in stray punctuation — is folded
   to a space first, so the camelCase-boundary rules below only ever have to
   deal with letters and digits running into each other. The `\p{L}` class
   (rather than `[a-zA-Z]`) is what keeps an Azerbaijani letter such as the
   schwa from being treated as a separator and thrown away. */
const EXPLICIT_SEPARATORS = /[^\p{L}\p{N}]+/gu;

/*
 * Three regexes, applied in order, each inserting a space at one kind of
 * boundary a human reads but a computer does not print with one:
 *
 * 1. An acronym run followed by a new capitalised word — "XMLHttp" is not
 *    one word "Xmlhttp" nor four letters "X, M, L, Http": the run's last
 *    capital starts the next word, so "XML" | "Http". Written as "two or
 *    more capitals, then a capital-lowercase pair" so the boundary lands
 *    before that trailing capital-lowercase pair, not after the first
 *    capital of the run.
 * 2. A lowercase letter or digit immediately followed by a capital —
 *    ordinary camelCase, "fooBar" -> "foo Bar".
 * 3 & 4. A letter next to a digit in either direction — "user2Name" needs
 *    "2" to be its own word, not fused onto "user" or "Name".
 */
const ACRONYM_BOUNDARY = /([A-Z]+)([A-Z][a-z])/g;
const LOWER_TO_UPPER_BOUNDARY = /([a-z0-9])([A-Z])/g;
const LETTER_TO_DIGIT_BOUNDARY = /([A-Za-z])(\d)/g;
const DIGIT_TO_LETTER_BOUNDARY = /(\d)([A-Za-z])/g;

function insertCamelBoundaries(input: string): string {
  return input
    .replace(ACRONYM_BOUNDARY, "$1 $2")
    .replace(LOWER_TO_UPPER_BOUNDARY, "$1 $2")
    .replace(LETTER_TO_DIGIT_BOUNDARY, "$1 $2")
    .replace(DIGIT_TO_LETTER_BOUNDARY, "$1 $2");
}

/** Breaks any supported naming convention into its component words, case and separators discarded. */
export function splitWords(input: string): string[] {
  const normalised = input.replace(EXPLICIT_SEPARATORS, " ");
  const withBoundaries = insertCamelBoundaries(normalised);
  return withBoundaries.trim().split(/\s+/).filter(Boolean);
}

/*
 * `.toUpperCase()` below is JS's locale-unaware casing table, which maps
 * plain ASCII "i" to dotless "I" rather than the dotted capital Azerbaijani
 * orthography would want for that sound — the same letter-family trap
 * `lib/tools/slug.ts` documents from the other direction. Fixing it needs
 * `.toLocaleUpperCase("az")`, which this tool does not reach for: a
 * name-format converter's job is spacing and delimiters, and taking a
 * position on locale-aware casing for every letter is a bigger scope than
 * that. The Azerbaijani-specific letters that have no ASCII lookalike (the
 * schwa among them) round-trip correctly regardless, because their
 * upper/lower pair is one dedicated code point each way.
 */
function capitalise(word: string): string {
  if (word === "") return word;
  return word[0].toUpperCase() + word.slice(1);
}

export function toCamelCase(words: string[]): string {
  return words.map((word, index) => (index === 0 ? word : capitalise(word))).join("");
}

export function toPascalCase(words: string[]): string {
  return words.map(capitalise).join("");
}

export function toSnakeCase(words: string[]): string {
  return words.join("_");
}

export function toKebabCase(words: string[]): string {
  return words.join("-");
}

export function toConstantCase(words: string[]): string {
  return words.map((word) => word.toUpperCase()).join("_");
}

export function toTitleCase(words: string[]): string {
  return words.map(capitalise).join(" ");
}

export function toSentenceCase(words: string[]): string {
  return capitalise(words.join(" "));
}

export function toDotCase(words: string[]): string {
  return words.join(".");
}

export function toPathCase(words: string[]): string {
  return words.join("/");
}

const BUILDERS: Record<NameCase, (words: string[]) => string> = {
  camelCase: toCamelCase,
  PascalCase: toPascalCase,
  snake_case: toSnakeCase,
  "kebab-case": toKebabCase,
  CONSTANT_CASE: toConstantCase,
  "Title Case": toTitleCase,
  "sentence case": toSentenceCase,
  "dot.case": toDotCase,
  "path/case": toPathCase,
};

export type NameConversions = Record<NameCase, string>;

/**
 * The words are lowercased before rebuilding, which is why "XMLHttpRequest"
 * comes back out as "xml", "http", "request" rather than keeping the
 * original run's capitals — a single canonical, case-free word list is what
 * lets every one of the nine builders above stay a one-line join.
 */
export function convertName(rawInput: string): NameConversions | null {
  const words = splitWords(rawInput).map((word) => word.toLowerCase());
  if (words.length === 0) return null;

  const result = {} as NameConversions;
  for (const nameCase of NAME_CASES) {
    result[nameCase] = BUILDERS[nameCase](words);
  }
  return result;
}

export type NameConversionLine = {
  input: string;
  conversions: NameConversions | null;
};

/** One entry per input line, in order, for the batch mode — a blank line keeps its place rather than being dropped, so line N of the input still maps to line N of the output. */
export function convertLines(rawText: string): NameConversionLine[] {
  return rawText.split("\n").map((line) => ({
    input: line,
    conversions: line.trim() === "" ? null : convertName(line),
  }));
}
