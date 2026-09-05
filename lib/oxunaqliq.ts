/**
 * A readability score sheet for Azerbaijani prose: not one number claiming
 * to summarise a text (the Flesch family of formulas counts syllables, and
 * syllable counting has never been validated for Azerbaijani — applying it
 * anyway would be exactly the invented-number failure this tool exists to
 * avoid), but the handful of measurements an editor actually checks by eye,
 * each next to a line saying when that particular number is worth acting
 * on.
 *
 * The word count and the reading-time estimate are `metn-statistikasi.ts`'s
 * numbers, imported rather than recomputed, so the two tools never disagree
 * about how many words a pasted text has. Sentence and paragraph splitting
 * are this file's own: this tool needs the actual sentence and paragraph
 * text (to report the longest one and to measure each one), not only a
 * count, so the split has to produce substrings rather than a tally.
 */
import { estimateReadingTime, wordCount, WORDS_PER_MINUTE, type ReadingTime } from "./metn-statistikasi.js";

export { WORDS_PER_MINUTE };
export type { ReadingTime };

/*
 * The same three Azerbaijani abbreviations `metn-statistikasi.ts` guards
 * against, kept as a second, independent copy rather than an import: that
 * file does not export its guard, because a sentence *count* has no use for
 * the guarded string afterwards, while this file needs the guarded text
 * intact so it can cut real sentence boundaries out of it. Keeping the same
 * three entries here is what keeps this tool's sentence count agreeing with
 * that one's on the same pasted text.
 */
const SENTENCE_ABBREVIATIONS = ["və s.", "və b.", "məs."];
/*
 * A private-use code point rather than a plain space: `metn-statistikasi.ts`
 * uses the same trick, for the same reason — the placeholder has to be
 * something no real Azerbaijani sentence would ever contain on its own, or
 * `unguardAbbreviations` below would turn every ordinary space in the text
 * back into a full stop, not just the three it is meant to restore. Written
 * as a `\u` escape rather than typed literally so it cannot be silently
 * dropped or normalised on the way into this file.
 */
const ABBREVIATION_DOT_PLACEHOLDER = "\uE000";

function guardAbbreviations(text: string): string {
  let guarded = text;
  for (const abbreviation of SENTENCE_ABBREVIATIONS) {
    const placeholder = abbreviation.replace(".", ABBREVIATION_DOT_PLACEHOLDER);
    guarded = guarded.split(abbreviation).join(placeholder);
  }
  return guarded;
}

function unguardAbbreviations(text: string): string {
  return text.replaceAll(ABBREVIATION_DOT_PLACEHOLDER, ".");
}

/** Real sentence text, not only a count — trimmed, empty fragments dropped, in reading order. */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];

  const guarded = guardAbbreviations(trimmed);
  return (guarded.match(/[^.!?]+[.!?]*/g) ?? [])
    .map((fragment) => unguardAbbreviations(fragment).trim())
    .filter((fragment) => fragment !== "");
}

/** Blank-line separated, same rule `metn-statistikasi.ts` counts by — several consecutive blank lines are still one gap. */
export function splitParagraphs(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  return trimmed
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
}

/** Unicode-letter tokens, punctuation stripped from both ends — every Azerbaijani letter survives the Unicode letter class, only the surrounding comma or full stop is cut. */
export function tokenizeWords(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  return trimmed
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((token) => token !== "");
}

function wordsOf(text: string): string[] {
  return tokenizeWords(text);
}

function average(total: number, count: number): number {
  if (count === 0) return 0;
  return Math.round((total / count) * 10) / 10;
}

/* ---------- sentence length ---------- */

export type SentenceStats = {
  count: number;
  averageWords: number;
  longest: { text: string; words: number } | null;
};

export function analyseSentences(text: string): SentenceStats {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return { count: 0, averageWords: 0, longest: null };

  let totalWords = 0;
  let longest = { text: sentences[0], words: 0 };
  for (const sentence of sentences) {
    const words = wordsOf(sentence).length;
    totalWords += words;
    if (words > longest.words) longest = { text: sentence, words };
  }

  return { count: sentences.length, averageWords: average(totalWords, sentences.length), longest };
}

/* ---------- word length ---------- */

/** A word this long forces a reader to stop and parse it in pieces rather than recognising it whole — the threshold the brief names. */
export const LONG_WORD_LETTERS = 7;

export type WordLengthStats = {
  wordCount: number;
  averageLetters: number;
  longWordCount: number;
  /** Share of all words that are long, 0-100, one decimal. */
  longWordSharePercent: number;
};

export function analyseWordLength(text: string): WordLengthStats {
  const words = wordsOf(text);
  if (words.length === 0) return { wordCount: 0, averageLetters: 0, longWordCount: 0, longWordSharePercent: 0 };

  let totalLetters = 0;
  let longCount = 0;
  for (const word of words) {
    const letters = [...word].length;
    totalLetters += letters;
    if (letters >= LONG_WORD_LETTERS) longCount += 1;
  }

  return {
    wordCount: words.length,
    averageLetters: average(totalLetters, words.length),
    longWordCount: longCount,
    longWordSharePercent: Math.round((longCount / words.length) * 1000) / 10,
  };
}

/* ---------- paragraph length ---------- */

export type ParagraphStats = {
  count: number;
  averageWords: number;
};

export function analyseParagraphs(text: string): ParagraphStats {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return { count: 0, averageWords: 0 };

  const totalWords = paragraphs.reduce((sum, paragraph) => sum + wordsOf(paragraph).length, 0);
  return { count: paragraphs.length, averageWords: average(totalWords, paragraphs.length) };
}

/* ---------- repetition ---------- */

export type RepeatedEntry = { text: string; count: number };

/** Case-folded so two differently-cased spellings of the same word count as one — this tool groups by content, unlike `herf-registri.ts` and `unicode.ts`, whose whole point is telling two differently-cased forms apart. */
function fold(word: string): string {
  return word.toLowerCase();
}

/**
 * Words repeated often enough to be worth a look. Short function words (the
 * two- and three-letter conjunctions and pronouns that carry no content of
 * their own) are excluded by the length floor rather than a stop-list — a
 * stop-list would need maintaining against a genre this tool has no
 * visibility into, while a floor of four letters already keeps grammar out
 * and content words in for the vast majority of Azerbaijani text.
 */
export function repeatedWords(text: string, minLetters = 4, minCount = 3, limit = 8): RepeatedEntry[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const word of wordsOf(text)) {
    if ([...word].length < minLetters) continue;
    const key = fold(word);
    if (!counts.has(key)) order.push(key);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return order
    .map((text) => ({ text, count: counts.get(text) ?? 0 }))
    .filter((entry) => entry.count >= minCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Runs of two or three consecutive words seen more than once — the phrase a
 * writer reaches for without noticing they already used it two paragraphs
 * earlier. Longer runs are not searched: past three words almost every
 * repeat is a fixed name or a set expression a writer chose on purpose, not
 * a habit worth flagging.
 */
export function repeatedPhrases(text: string, minCount = 2, limit = 8): RepeatedEntry[] {
  const words = wordsOf(text).map(fold);
  const counts = new Map<string, number>();
  const order: string[] = [];

  for (const size of [2, 3]) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const phrase = words.slice(start, start + size).join(" ");
      if (!counts.has(phrase)) order.push(phrase);
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }

  return order
    .map((text) => ({ text, count: counts.get(text) ?? 0 }))
    .filter((entry) => entry.count >= minCount)
    .sort((a, b) => b.count - a.count || b.text.length - a.text.length)
    .slice(0, limit);
}

/* ---------- passive-voice hint ---------- */

/** The four Azerbaijani passive-voice endings the brief names, as literal suffix data rather than prose. */
const PASSIVE_SUFFIXES = ["ılır", "ilir", "ulur", "ülür"];

export type PassiveHint = {
  matchCount: number;
  sharePercent: number;
  /** Up to five matched words, in reading order, so the visitor can judge the false-positive rate themselves. */
  sample: string[];
};

/**
 * A heuristic, not a parser: any word ending in one of the four suffixes
 * counts, including the handful of ordinary nouns and adjectives that
 * happen to end the same way. Flagging a few words that are not really
 * passive constructions is the cheaper mistake — the alternative is a real
 * morphological analyser, which is a different, much larger tool.
 */
export function analysePassiveHint(text: string): PassiveHint {
  const words = wordsOf(text);
  const matches: string[] = [];
  for (const word of words) {
    const folded = fold(word);
    const hasSuffix = PASSIVE_SUFFIXES.some(
      (suffix) => folded.endsWith(suffix) && [...folded].length > suffix.length + 1,
    );
    if (hasSuffix) matches.push(word);
  }

  return {
    matchCount: matches.length,
    sharePercent: words.length === 0 ? 0 : Math.round((matches.length / words.length) * 1000) / 10,
    sample: matches.slice(0, 5),
  };
}

/* ---------- the whole report ---------- */

export type ReadabilityReport = {
  wordCount: number;
  sentences: SentenceStats;
  wordLength: WordLengthStats;
  paragraphs: ParagraphStats;
  repeatedWords: RepeatedEntry[];
  repeatedPhrases: RepeatedEntry[];
  passive: PassiveHint;
  readingTime: ReadingTime;
};

export function analyseReadability(text: string): ReadabilityReport {
  return {
    wordCount: wordCount(text),
    sentences: analyseSentences(text),
    wordLength: analyseWordLength(text),
    paragraphs: analyseParagraphs(text),
    repeatedWords: repeatedWords(text),
    repeatedPhrases: repeatedPhrases(text),
    passive: analysePassiveHint(text),
    readingTime: estimateReadingTime(wordCount(text)),
  };
}

/**
 * The line shown next to each measurement — a fixed threshold, not a verdict
 * this file computes from the actual number, because judging what counts as
 * a problem depends on the kind of text a visitor is writing and only they
 * can make that call.
 */
export const READABILITY_GUIDANCE: Record<
  | "averageSentenceLength"
  | "longestSentence"
  | "averageWordLength"
  | "longWordShare"
  | "averageParagraphLength"
  | "repeatedWords"
  | "repeatedPhrases"
  | "passiveVoice",
  string
> = {
  averageSentenceLength: "20 sözdən uzun orta cümlə oxucunu yorur: cümləni ikiyə böl.",
  longestSentence: "35 sözdən uzun tək cümlə çətin izlənir, hətta orta uzunluq normal olsa belə.",
  averageWordLength: "Orta söz uzunluğu 7 hərfi keçirsə, mətn termin sıxlığından ağırlaşır.",
  longWordShare: "Uzun sözlərin payı 25%-i keçirsə, sadə sinonimlə əvəzləməyi düşün.",
  averageParagraphLength: "120 sözdən uzun abzas ekranda divar kimi görünür, böl.",
  repeatedWords: "Eyni söz 3-dən çox təkrarlanırsa, sinonim və ya əvəzlik işlət.",
  repeatedPhrases: "Eyni ifadə iki dəfədən çox keçirsə, çox güman ki fərqinə varmadan təkrarlanıb.",
  passiveVoice: "Passiv fellərin payı yüksəkdirsə, fail bəlli olan cümlələri fəal formaya çevir.",
};
