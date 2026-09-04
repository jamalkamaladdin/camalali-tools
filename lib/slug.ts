/**
 * Turns an Azerbaijani title into a URL-safe slug: transliterates the seven
 * letters that are not ASCII, folds runs of whitespace and punctuation into
 * one join point, and (optionally) truncates without splitting a word.
 */

export type SlugSeparator = "-" | "_";

export type SlugOptions = {
  /** "-" is the URL convention on this site; "_" exists for callers matching an import file's own scheme. */
  separator: SlugSeparator;
  /** 0 or undefined means no limit. */
  maxLength?: number;
  /**
   * Folds the ASCII passthrough (already-Latin words, digits) to lowercase.
   * The dotless/dotted-I family below always resolves to lowercase
   * regardless of this flag — that part of the transliteration is not a
   * style choice, it is the fix for the bug described on it.
   */
  lowercase: boolean;
};

export const DEFAULT_SLUG_OPTIONS: SlugOptions = {
  separator: "-",
  lowercase: true,
};

/*
 * Six of the seven Azerbaijani-specific letters share a Latin base that also
 * serves as their transliteration, and the pair below is case-matched so
 * turning off the lowercase flag does not leave an accented capital sitting
 * next to an otherwise-untouched ASCII word.
 */
const CASE_MATCHED_TRANSLITERATION: Record<string, string> = {
  ə: "e",
  Ə: "E",
  ğ: "g",
  Ğ: "G",
  ö: "o",
  Ö: "O",
  ş: "s",
  Ş: "S",
  ü: "u",
  Ü: "U",
  ç: "c",
  Ç: "C",
};

/*
 * This is the family a transliterator most often gets wrong: two lowercase
 * letters (a dotless one and a dotted one) each with their own uppercase
 * partner, and a naive `.toLowerCase()` round-trip mixes the pairs up — the
 * dotted uppercase member, when lowercased by a JS engine that follows the
 * Unicode default casing table, produces a two-character result (a plain
 * lowercase letter followed by a combining dot above), not the one-character
 * form a slug needs. A slug does not need to preserve the dotless/dotted
 * distinction the way running Azerbaijani text does, so every non-ASCII
 * member of the family collapses onto plain ASCII "i" here, before any
 * casing step runs. Lowercase ASCII "i" needs no entry: it already is the
 * target.
 */
const DOTTED_I_FAMILY: Record<string, string> = {
  ı: "i",
  I: "i",
  İ: "i",
};

function transliterate(input: string): string {
  let out = "";
  for (const char of input) {
    out += DOTTED_I_FAMILY[char] ?? CASE_MATCHED_TRANSLITERATION[char] ?? char;
  }
  return out;
}

/*
 * A private-use code point (written as an escape, never typed literally, so
 * no editor or transfer step along the way can normalise it into something
 * else) stands in for "join point" while the string is being shaped. Plain
 * string methods handle it from here rather than a regex holding the escape
 * inside a character class, which keeps every step easy to see is doing
 * exactly one thing to exactly one placeholder.
 */
const JOIN = "";

/**
 * Cuts at the join point nearest to `maxLength`, never inside a word. When
 * even the first word alone is longer than the limit, the whole word is kept
 * anyway — a length limit meant to keep a slug readable should not produce a
 * fragment (five letters out of a ten-letter word) that reads worse than the
 * oversized but whole word it was trying to shorten.
 */
function truncateAtWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;

  const window = value.slice(0, maxLength);
  const cut = window.lastIndexOf(JOIN);

  if (cut <= 0) {
    const nextJoin = value.indexOf(JOIN);
    return nextJoin === -1 ? value : value.slice(0, nextJoin);
  }

  return window.slice(0, cut);
}

export function slugify(rawTitle: string, options: Partial<SlugOptions> = {}): string {
  const { separator, maxLength, lowercase } = { ...DEFAULT_SLUG_OPTIONS, ...options };

  let value = transliterate(rawTitle);
  if (lowercase) value = value.toLowerCase();

  // Anything outside [a-zA-Z0-9] — space, punctuation, a hyphen the visitor
  // already typed — becomes one join point, collapsing runs of it in the
  // same step.
  value = value.replace(/[^a-zA-Z0-9]+/g, JOIN);

  while (value.startsWith(JOIN)) value = value.slice(JOIN.length);
  while (value.endsWith(JOIN)) value = value.slice(0, -JOIN.length);

  if (value === "") return "";

  if (maxLength && maxLength > 0) {
    value = truncateAtWordBoundary(value, maxLength);
  }

  return value.split(JOIN).join(separator);
}
