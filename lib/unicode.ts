/**
 * Per-character Unicode breakdown for a typed string: the JS escape sequence
 * and the URL-encoded form of every character, next to how many of the
 * sixteen Azerbaijani letters the input actually contains and what each one
 * costs in bytes.
 *
 * The code point, its name, its category, its UTF-8 bytes, its UTF-16 units
 * and its HTML entity are `ascii-unicode.ts`'s job already — `inspectText`
 * and `textSummary` there were built for precisely this table, complete with
 * a four-hundred-entry naming database for control characters, invisible
 * characters and look-alike letters. Rebuilding that here would be
 * duplicated work this codebase's own contract rules out, so this file
 * imports it and only adds what it does not carry: the two encodings a
 * visitor actually has to paste into a JS source file or a URL, and an
 * Azerbaijani-letter usage count scoped to the characters actually typed
 * rather than a static reference row.
 */
import { INSPECT_LIMIT, inspectText, textSummary, type CharInfo } from "./ascii-unicode.js";

export { INSPECT_LIMIT, textSummary };
export type { CharInfo };

const ASTRAL_START = 0x10000;

/**
 * The form a JS string literal accepts either way: four hex digits for a
 * code point inside the Basic Multilingual Plane, `\u{...}` for one past it.
 * `char` is a single grapheme drawn from a `for...of` loop, so it may already
 * be a surrogate pair — `codePointAt(0)` reads the whole pair as one number
 * regardless, which is what keeps this correct for an emoji.
 */
function jsEscapeOf(char: string): string {
  const codePoint = char.codePointAt(0) ?? 0;
  if (codePoint >= ASTRAL_START) return `\\u{${codePoint.toString(16)}}`;
  return `\\u${codePoint.toString(16).padStart(4, "0")}`;
}

/** `encodeURIComponent` of the one character — never throws, because a lone surrogate cannot reach this function from a `for...of` iteration. */
function urlEncodedOf(char: string): string {
  return encodeURIComponent(char);
}

export type UnicodeCharRow = CharInfo & {
  jsEscape: string;
  urlEncoded: string;
};

/** One row per code point, capped the same way the inspector it wraps is capped — see `ascii-unicode.ts`'s cap constant and its own comment on why one exists. */
export function inspectUnicode(input: string, limit: number = INSPECT_LIMIT): UnicodeCharRow[] {
  return inspectText(input, limit).map((row) => ({
    ...row,
    jsEscape: jsEscapeOf(row.char),
    urlEncoded: urlEncodedOf(row.char),
  }));
}

/* ---------- Azerbaijani letter usage ---------- */

/**
 * All sixteen letters that separate Azerbaijani orthography from plain
 * Latin, lower and upper together.
 */
export const AZ_LETTERS = [
  "ə", "Ə", "ğ", "Ğ", "ı", "I", "İ", "i", "ş", "Ş", "ç", "Ç", "ö", "Ö", "ü", "Ü",
] as const;

const encoder = new TextEncoder();

/**
 * The Unicode block a code point falls in, named the way a reader would
 * recognise it. Only the five blocks Azerbaijani's own letters actually land
 * in are named; the fallback exists so a future letter added to the letter
 * list above fails loudly with an obviously-unnamed block rather than
 * silently getting a wrong one.
 */
function unicodeBlockName(codePoint: number): string {
  if (codePoint <= 0x7f) return "Əsas Latın (ASCII)";
  if (codePoint <= 0xff) return "Latın-1 tamamlayıcısı";
  if (codePoint <= 0x17f) return "Latın genişləndirilmiş-A";
  if (codePoint <= 0x24f) return "Latın genişləndirilmiş-B";
  if (codePoint <= 0x2af) return "IPA genişləndirmələri";
  return "digər";
}

export type AzLetterUsage = {
  letter: string;
  hex: string;
  utf8Bytes: number;
  block: string;
  /** How many times this exact letter (this case) appears in the input. */
  count: number;
  /** `count * utf8Bytes` — what this one letter costs the payload, in total. */
  totalBytes: number;
};

/**
 * All sixteen letters, always — including the ones the input does not
 * contain, at zero count — because the point is the byte cost and the block
 * every one of them lives in, not only the ones typed today.
 */
export function azLetterUsage(input: string): AzLetterUsage[] {
  const counts = new Map<string, number>();
  for (const char of input) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }

  return AZ_LETTERS.map((letter) => {
    const codePoint = letter.codePointAt(0) ?? 0;
    const utf8Bytes = encoder.encode(letter).length;
    const count = counts.get(letter) ?? 0;
    return {
      letter,
      hex: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
      utf8Bytes,
      block: unicodeBlockName(codePoint),
      count,
      totalBytes: utf8Bytes * count,
    };
  });
}
