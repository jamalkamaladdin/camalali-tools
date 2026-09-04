/**
 * Measures how often each word, word-pair and word-triple appears in a
 * pasted piece of text, and what share of the running word count that repeat
 * is — the numbers a visitor means by "keyword density". Nothing here
 * claims a percentage is good or bad: see `analyseDensity`'s doc comment and
 * the tool page's own FAQ for why that claim would be dishonest.
 *
 * `acar-soz-qruplasdirma.ts` imports `tokenize` and `azLowerCase` from here
 * rather than re-deriving them — one tokenizer for both keyword tools, so a
 * fix to how apostrophes or capital-I case folding are handled lands in both
 * tools at once instead of drifting apart.
 */

/*
 * `String.prototype.toLowerCase()` does not fold Turkish/Azerbaijani case
 * the way this alphabet needs. The dotted capital I (Unicode U+0130)
 * decomposes to a plain lower-case i plus a combining dot above (U+0069
 * U+0307) instead of the single letter a visitor actually typed, and the
 * plain, dotless capital I (U+0049) folds to that same plain lower-case i
 * instead of the dotless lower-case letter (U+0131) that is its real
 * counterpart in this alphabet. Both are swapped by hand before the generic
 * lower-casing pass runs. Every other letter in this alphabet — schwa,
 * g-breve, s-cedilla, o/u-umlaut, c-cedilla — has an ordinary Unicode case
 * pair and needs no special handling.
 */
export function azLowerCase(text: string): string {
  return text.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
}

/*
 * A word is a run of letters, with an apostrophe allowed inside it so a
 * possessive name survives as one token instead of splitting at the mark. A
 * number is matched as its own alternative rather than folded into the
 * letter class, so a run of letters followed by digits tokenises as two
 * tokens — a digit run never fuses onto a neighbouring word, which is what
 * counting numbers separately means here.
 */
const TOKEN_PATTERN = /\p{L}+(?:['’]\p{L}+)*|\p{N}+/gu;

export function tokenize(text: string): string[] {
  return azLowerCase(text).match(TOKEN_PATTERN) ?? [];
}

const SCRIPT_OR_STYLE_BODY = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const ANY_TAG = /<[^>]+>/g;
const HTML_ENTITY = /&[a-zA-Z#0-9]+;/g;
const ENTITY_TABLE: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/**
 * Strips markup before the text underneath it is measured. A `<script>` or
 * `<style>` body is dropped along with its own tags — a script tag wrapping
 * a function call must not hand its argument to the word count as if a
 * visitor had typed it. Every other tag loses only its brackets, and the
 * handful of entities a pasted page is actually built from decode back to
 * the character they stand for rather than being left as literal markup.
 */
export function stripHtml(html: string): string {
  return html
    .replace(SCRIPT_OR_STYLE_BODY, " ")
    .replace(ANY_TAG, " ")
    .replace(HTML_ENTITY, (entity) => ENTITY_TABLE[entity] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * terms.ts keeps a stopword set too, but it solves a different problem: it
 * only ever looks at Latin-only tokens — its own regex requires
 * `[A-Za-z][A-Za-z0-9.+_-]{2,}` — because its job is telling an English
 * technical noun apart from an everyday Azerbaijani word that happens to be
 * spelled with no diacritic. A word actually spelled with one cannot appear
 * in that set even in principle, and its own entries are the wrong shape for
 * this job besides: several of them are ordinary content nouns a visitor
 * writing about exactly that subject wants counted, not hidden behind a
 * stopword filter. Importing it here would silently suppress real keywords
 * just to keep one tool's word list in step with a different tool's word
 * list. So this is a second list on purpose, not a duplicate of the first —
 * the two share no members by construction, because one is Latin-only and
 * the other is exactly the diacritic-bearing function words the first
 * structurally cannot hold.
 */
export const DENSITY_STOPWORDS = new Set([
  // conjunctions and particles
  "və", "ki", "amma", "ancaq", "lakin", "əgər", "çünki", "ya", "yaxud",
  "da", "də", "isə",
  // pronouns and determiners
  "bir", "bu", "o", "bunlar", "onlar", "biz", "siz", "mən", "sən", "öz",
  "kim", "nə", "nəyi", "hansı", "harada", "haçan", "niyə", "necə",
  "hər", "heç", "bəzi", "bütün",
  // degree and time adverbs
  "çox", "az", "daha", "ən", "belə", "elə", "indi", "sonra", "əvvəl",
  "artıq", "hələ", "yenə",
  // copula and auxiliary forms of "to be / to become"
  "olan", "olur", "olub", "olacaq", "idi", "imiş",
  // postpositions
  "ilə", "üçün", "üzrə", "qədər", "kimi", "haqqında", "barədə", "görə",
]);

export type Phrase = { phrase: string; count: number; density: number };

function densityOf(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

/**
 * Every `size`-word window over `tokens`, counted and ranked by how often it
 * repeats. `tokens` is expected to already be one sentence's worth — the
 * caller (`analyseDensity`) runs this once per sentence and adds the counts
 * together, which is what keeps a 2- or 3-word phrase from being stitched
 * together out of the last word of one sentence and the first word of the
 * next. `density` here is relative to `tokens.length`, so a standalone call
 * on a token list that is not the whole document reports a locally-true but
 * globally-meaningless percentage — `analyseDensity` throws this field away
 * and recomputes it against the document's real total after merging.
 */
export function ngrams(
  tokens: string[],
  size: 1 | 2 | 3,
  opts: { dropStopwords: boolean },
): Phrase[] {
  const counts = new Map<string, number>();
  const order: string[] = [];

  for (let start = 0; start + size <= tokens.length; start++) {
    const slice = tokens.slice(start, start + size);
    if (opts.dropStopwords && slice.some((token) => DENSITY_STOPWORDS.has(token))) continue;
    const phrase = slice.join(" ");
    if (!counts.has(phrase)) order.push(phrase);
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }

  return order
    .map((phrase) => {
      const count = counts.get(phrase) ?? 0;
      return { phrase, count, density: densityOf(count, tokens.length) };
    })
    .sort((a, b) => b.count - a.count);
}

/** Splits on runs of period/exclamation/question marks — the boundary `analyseDensity` builds n-grams within and never across. */
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  return trimmed
    .split(/[.!?]+/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment !== "");
}

export type DensityReport = {
  totalWords: number;
  uniqueWords: number;
  /** Share of all words that are stopwords, as a percentage — 0 on empty input, never a division by zero. */
  stopwordShare: number;
  phrases: Record<1 | 2 | 3, Phrase[]>;
};

/**
 * The whole pipeline: optionally strip markup, split into sentences so a
 * phrase never crosses a full stop it should not cross, tokenise each
 * sentence and build 1-, 2- and 3-word phrase tables from it, then merge the
 * per-sentence counts into document-wide totals. `dropStopwords` only
 * changes which phrases are counted at all — a phrase with any stopword
 * token in it is skipped outright when the filter is on, which is why
 * turning it off makes the handful of most common function words jump to
 * the top of the 1-word table in ordinary prose: they are usually the most
 * frequent tokens in any sentence, and the filter exists specifically to
 * hide that fact.
 */
export function analyseDensity(
  text: string,
  opts: { html: boolean; dropStopwords: boolean },
): DensityReport {
  const cleanText = opts.html ? stripHtml(text) : text;
  const sentences = splitSentences(cleanText);
  const allTokens = tokenize(cleanText);
  const totalWords = allTokens.length;

  const merged: Record<1 | 2 | 3, Map<string, number>> = { 1: new Map(), 2: new Map(), 3: new Map() };
  const order: Record<1 | 2 | 3, string[]> = { 1: [], 2: [], 3: [] };

  for (const sentence of sentences) {
    const sentenceTokens = tokenize(sentence);
    for (const size of [1, 2, 3] as const) {
      for (const item of ngrams(sentenceTokens, size, { dropStopwords: opts.dropStopwords })) {
        if (!merged[size].has(item.phrase)) order[size].push(item.phrase);
        merged[size].set(item.phrase, (merged[size].get(item.phrase) ?? 0) + item.count);
      }
    }
  }

  const phrases = { 1: [], 2: [], 3: [] } as Record<1 | 2 | 3, Phrase[]>;
  for (const size of [1, 2, 3] as const) {
    phrases[size] = order[size]
      .map((phrase) => {
        const count = merged[size].get(phrase) ?? 0;
        return { phrase, count, density: densityOf(count, totalWords) };
      })
      .sort((a, b) => b.count - a.count);
  }

  const stopwordCount = allTokens.filter((token) => DENSITY_STOPWORDS.has(token)).length;

  return {
    totalWords,
    uniqueWords: new Set(allTokens).size,
    stopwordShare: densityOf(stopwordCount, totalWords),
    phrases,
  };
}
