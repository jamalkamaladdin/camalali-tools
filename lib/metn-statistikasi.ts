/**
 * Counts characters, words, sentences and paragraphs in a block of text, and
 * estimates how long it takes to read. Every count here is deliberately the
 * honest one rather than the convenient one — see the comments on
 * `characterCount` and `countSentences` for the two places where "honest"
 * and "simple" pull in different directions.
 */

/*
 * `string.length` counts UTF-16 code units, not characters: a character
 * outside the Basic Multilingual Plane — an emoji such as U+1F600, most
 * commonly — is stored as a surrogate pair and counts as 2 there. Spreading
 * a string (`[...text]`, the same iteration `for...of` uses) walks it by
 * code point instead, so that emoji counts as the single character a
 * visitor typed. This tool reports the code-point count as the character
 * count shown to the visitor, and surfaces the raw UTF-16 length alongside
 * it only when the two disagree, rather than quietly presenting the UTF-16
 * number as if it were a character count.
 */
export function characterCount(text: string, includeSpaces = true): number {
  const source = includeSpaces ? text : text.replace(/\s/g, "");
  return [...source].length;
}

/** The raw UTF-16 length, kept only so the UI can show the gap against `characterCount` when there is one. */
export function utf16Length(text: string, includeSpaces = true): number {
  const source = includeSpaces ? text : text.replace(/\s/g, "");
  return source.length;
}

function splitTokens(text: string): string[] {
  const trimmed = text.trim();
  return trimmed === "" ? [] : trimmed.split(/\s+/);
}

export function wordCount(text: string): number {
  return splitTokens(text).length;
}

/*
 * A handful of Azerbaijani abbreviations end in a dot without ending a
 * sentence — "et cetera" being the one this tool was specifically asked to
 * get right. Each one has its dot swapped for a placeholder before
 * sentence-terminator counting runs, so a sentence that contains one of
 * these abbreviations mid-sentence is not miscounted as two. The list is
 * short and closed on purpose: guessing at abbreviations a visitor did not
 * type would be a worse failure than missing one this list does not cover.
 */
const SENTENCE_ABBREVIATIONS = ["və s.", "və b.", "məs."];
/* Written as an escape rather than a literal character, same reasoning as
   the join placeholder in `lib/tools/slug.ts`: a private-use code point
   typed directly risks being normalised away by an editor or a transfer
   step, an escape sequence cannot be. */
const ABBREVIATION_DOT_PLACEHOLDER = "";

function guardAbbreviations(text: string): string {
  let guarded = text;
  for (const abbreviation of SENTENCE_ABBREVIATIONS) {
    const placeholder = abbreviation.replace(".", ABBREVIATION_DOT_PLACEHOLDER);
    guarded = guarded.split(abbreviation).join(placeholder);
  }
  return guarded;
}

/**
 * A sentence is a run of text between `. ! ?` terminators. A trailing
 * fragment with no terminator still counts as one — a visitor who pastes in
 * a sentence they have not finished typing yet should see "1", not "0".
 */
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;

  const guarded = guardAbbreviations(trimmed);
  const fragments = guarded.match(/[^.!?]+/g) ?? [];
  return fragments.filter((fragment) => fragment.trim() !== "").length;
}

/**
 * Paragraphs are separated by one or more blank lines. Allowing whitespace
 * inside the separator (rather than requiring exactly two newline
 * characters back to back) is what makes several consecutive blank lines
 * still count as a single gap between two paragraphs, not as extra empty
 * ones.
 */
export function countParagraphs(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;

  return trimmed
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "").length;
}

/*
 * The Unicode letter and number classes (rather than an ASCII-only class)
 * are what let this strip a trailing comma off a word while leaving an
 * Azerbaijani-specific letter such as the schwa untouched — an ASCII-only
 * class would have thrown that letter away along with the punctuation.
 */
function tokenizeWords(text: string): string[] {
  return splitTokens(text.toLowerCase())
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((token) => token !== "");
}

export function uniqueWordCount(text: string): number {
  return new Set(tokenizeWords(text)).size;
}

export type WordFrequency = { word: string; count: number };

/**
 * The 10 (by default) most frequent words, punctuation stripped and case
 * folded. Ties keep the order the words first appeared in — `Array.sort` is
 * stable, and `order` below is built in first-occurrence order, so a
 * refactor that changes the counting strategy cannot make the tie-break
 * order depend on insertion order into a `Map` instead.
 */
export function topWords(text: string, limit = 10): WordFrequency[] {
  const tokens = tokenizeWords(text);
  const order: string[] = [];
  const counts = new Map<string, number>();

  for (const token of tokens) {
    if (!counts.has(token)) order.push(token);
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return order
    .map((word) => ({ word, count: counts.get(word) ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * 200 words per minute is the conservative end of the range (roughly
 * 200-250 wpm) usually cited for an adult's silent reading speed of general
 * prose in a Latin script — chosen low rather than the middle of the range
 * because a technical page with code and terms reads slower than plain
 * narrative, and an estimate that runs a little long serves a visitor better
 * than one that runs short.
 */
export const WORDS_PER_MINUTE = 200;

export type ReadingTime = { minutes: number; seconds: number };

export function estimateReadingTime(
  words: number,
  wordsPerMinute = WORDS_PER_MINUTE,
): ReadingTime {
  const totalSeconds = Math.ceil((words / wordsPerMinute) * 60);
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
  };
}

export type TextStatistics = {
  characterCountWithSpaces: number;
  characterCountWithoutSpaces: number;
  /** Equal to `characterCountWithSpaces` unless the text has a character outside the Basic Multilingual Plane. */
  utf16LengthWithSpaces: number;
  wordCount: number;
  uniqueWordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  /** Code points per word, not `.length` per word — see `characterCount`. */
  averageWordLength: number;
  averageSentenceLength: number;
  topWords: WordFrequency[];
  readingTime: ReadingTime;
};

function average(total: number, count: number): number {
  if (count === 0) return 0;
  return Math.round((total / count) * 10) / 10;
}

export function analyseText(text: string): TextStatistics {
  const words = wordCount(text);
  const sentences = countSentences(text);
  const tokens = tokenizeWords(text);
  const totalWordChars = tokens.reduce((sum, token) => sum + [...token].length, 0);

  return {
    characterCountWithSpaces: characterCount(text, true),
    characterCountWithoutSpaces: characterCount(text, false),
    utf16LengthWithSpaces: utf16Length(text, true),
    wordCount: words,
    uniqueWordCount: uniqueWordCount(text),
    sentenceCount: sentences,
    paragraphCount: countParagraphs(text),
    averageWordLength: average(totalWordChars, tokens.length),
    averageSentenceLength: average(words, sentences),
    topWords: topWords(text),
    readingTime: estimateReadingTime(words),
  };
}
