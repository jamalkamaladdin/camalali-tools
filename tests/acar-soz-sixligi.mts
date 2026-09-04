/*
 * The claims worth checking here: capital-I case folding follows the
 * Turkish/Azerbaijani rule rather than the ordinary Unicode one, markup
 * (including a script body) never leaks into the word count, an empty
 * document never divides by zero, a multi-word phrase never straddles a
 * sentence it should not cross, and the stopword filter actually changes
 * what gets counted rather than just being drawn differently.
 */
import type { CheckSuite } from "./harness.mts";
import {
  analyseDensity,
  azLowerCase,
  DENSITY_STOPWORDS,
  ngrams,
  stripHtml,
  tokenize,
} from "../lib/acar-soz-sixligi";

export const checks: CheckSuite = (check) => {
  check(
    "acar-soz-sixligi: dotted capital I folds to plain i, not i + combining dot",
    azLowerCase("İSTİFADƏÇİ") === "istifadəçi",
    `got: ${azLowerCase("İSTİFADƏÇİ")}`,
  );
  check(
    "acar-soz-sixligi: plain dotless capital I folds to dotless lower-case i",
    azLowerCase("IŞIQ") === "ışıq",
    `got: ${azLowerCase("IŞIQ")}`,
  );

  const withScript = analyseDensity("Salam dünya. <script>alert(1)</script> Salam yenə.", {
    html: true,
    dropStopwords: false,
  });
  const scriptTokens = withScript.phrases[1].map((p) => p.phrase);
  check(
    "acar-soz-sixligi: a script tag's body does not reach the word count",
    !scriptTokens.includes("alert") && !scriptTokens.includes("1"),
    `1-word phrases: ${JSON.stringify(scriptTokens)}`,
  );

  const empty = analyseDensity("", { html: false, dropStopwords: true });
  check(
    "acar-soz-sixligi: empty input reports zero totals with no crash",
    empty.totalWords === 0 && empty.uniqueWords === 0 && empty.stopwordShare === 0,
    `got: ${JSON.stringify(empty)}`,
  );
  check(
    "acar-soz-sixligi: empty input never divides by zero into NaN",
    !Number.isNaN(empty.stopwordShare) &&
      empty.phrases[1].length === 0 &&
      empty.phrases[2].length === 0 &&
      empty.phrases[3].length === 0,
    `got: ${JSON.stringify(empty)}`,
  );

  const twoSentences = analyseDensity("Salam dünya. Yaxşı gün başlayır.", {
    html: false,
    dropStopwords: false,
  });
  const twoWordPhrases = twoSentences.phrases[2].map((p) => p.phrase);
  check(
    "acar-soz-sixligi: a 2-word phrase never straddles a sentence boundary",
    !twoWordPhrases.includes("dünya yaxşı"),
    `2-word phrases: ${JSON.stringify(twoWordPhrases)}`,
  );

  const repeated = "və biz və onlar və biz gəldik.";
  const filtered = analyseDensity(repeated, { html: false, dropStopwords: true });
  const unfiltered = analyseDensity(repeated, { html: false, dropStopwords: false });
  check(
    "acar-soz-sixligi: the stopword filter removes a stopword-only phrase when on",
    !filtered.phrases[1].some((p) => p.phrase === "və"),
    `filtered 1-word phrases: ${JSON.stringify(filtered.phrases[1])}`,
  );
  check(
    "acar-soz-sixligi: the same text without the filter surfaces the stopword on top",
    unfiltered.phrases[1][0]?.phrase === "və",
    `unfiltered 1-word phrases: ${JSON.stringify(unfiltered.phrases[1])}`,
  );

  check(
    "acar-soz-sixligi: an apostrophe inside a word is kept, not split into two tokens",
    JSON.stringify(tokenize("Bakı'nın")) === JSON.stringify(["bakı'nın"]),
    `got: ${JSON.stringify(tokenize("Bakı'nın"))}`,
  );

  check(
    "acar-soz-sixligi: a digit run is counted separately from an adjoining letter run",
    JSON.stringify(tokenize("abc123")) === JSON.stringify(["abc", "123"]),
    `got: ${JSON.stringify(tokenize("abc123"))}`,
  );

  check(
    "acar-soz-sixligi: stripHtml drops tags but keeps the text between them",
    stripHtml("<p>Salam <b>dünya</b></p>") === "Salam dünya",
    `got: ${JSON.stringify(stripHtml("<p>Salam <b>dünya</b></p>"))}`,
  );
  check(
    "acar-soz-sixligi: stripHtml drops an entire script body along with its tags",
    stripHtml("<p>Salam</p><script>var x = 1;</script>") === "Salam",
    `got: ${JSON.stringify(stripHtml("<p>Salam</p><script>var x = 1;</script>"))}`,
  );

  const basicNgrams = ngrams(["a", "b", "a"], 1, { dropStopwords: false });
  const aCount = basicNgrams.find((p) => p.phrase === "a")?.count;
  check(
    "acar-soz-sixligi: ngrams counts a repeated 1-word token correctly",
    aCount === 2,
    `got: ${JSON.stringify(basicNgrams)}`,
  );

  check(
    "acar-soz-sixligi: the density stopword set holds the diacritic-bearing function words terms.ts structurally cannot",
    DENSITY_STOPWORDS.has("və") && DENSITY_STOPWORDS.has("üçün") && DENSITY_STOPWORDS.has("bir"),
    `missing one of və/üçün/bir from DENSITY_STOPWORDS`,
  );
};
