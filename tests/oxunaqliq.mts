/*
 * What is worth checking here: the abbreviation guard actually keeps "və
 * s." from being read as a sentence end (a known-answer pair against a real
 * count and the longest sentence's own text), the seven-letter long-word
 * boundary lands exactly where it claims to, repeated words and phrases are
 * found with their real counts, the passive-suffix heuristic matches the
 * four endings it claims to and nothing else (a real passive verb spelled
 * with a different ending is a documented miss, not a bug), and empty input
 * never throws across the whole report.
 */
import type { CheckSuite } from "./harness.mts";
import {
  analysePassiveHint,
  analyseReadability,
  analyseSentences,
  analyseWordLength,
  READABILITY_GUIDANCE,
  repeatedPhrases,
  repeatedWords,
  splitParagraphs,
} from "../lib/oxunaqliq";

export const checks: CheckSuite = (check) => {
  const sentences = analyseSentences("Meyvə və s. daxildir. Bu ikinci cümlədir.");
  check(
    "oxunaqliq: an abbreviation's dot does not end a sentence, so two real sentences are found, not three",
    sentences.count === 2 && sentences.longest?.text === "Meyvə və s. daxildir." && sentences.longest?.words === 4,
    `got: ${JSON.stringify(sentences)}`,
  );

  const wordLength = analyseWordLength("yoxlama yoxlan");
  check(
    "oxunaqliq: a seven-letter word counts as long, a six-letter word does not — the boundary is exact",
    wordLength.longWordCount === 1 && wordLength.longWordSharePercent === 50,
    `got: ${JSON.stringify(wordLength)}`,
  );

  const repeated = repeatedWords("server server server bazaya bağlanır. server yenidən işə düşür. server sabit qalır.");
  check(
    "oxunaqliq: a word repeated five times is reported with its real count",
    repeated.length === 1 && repeated[0]?.text === "server" && repeated[0]?.count === 5,
    `got: ${JSON.stringify(repeated)}`,
  );

  const shortWords = repeatedWords("bu bu bu və və və bir bir bir");
  check(
    "oxunaqliq: short function words below the four-letter floor are never reported, however often they repeat",
    shortWords.length === 0,
    `got: ${JSON.stringify(shortWords)}`,
  );

  const phrases = repeatedPhrases(
    "sistemin bütövlüyü qorunur. sistemin bütövlüyü qorunur, çünki vacibdir. sistemin bütövlüyü qorunur.",
  );
  check(
    "oxunaqliq: a three-word phrase repeated three times is the top result, ranked above its own two-word substring",
    phrases[0]?.text === "sistemin bütövlüyü qorunur" && phrases[0]?.count === 3,
    `got: ${JSON.stringify(phrases)}`,
  );

  const passive = analysePassiveHint(
    "Sorğu yoxlanılır və qeyd olunur. Nəticə göndərilir amma kitab sürətlə oxunur, stul isə sadəcə var.",
  );
  check(
    "oxunaqliq: the four passive suffixes are matched, and a real passive verb spelled with a fifth ending is not — the heuristic's documented limit",
    passive.matchCount === 2 && passive.sample.includes("yoxlanılır") && !passive.sample.includes("oxunur"),
    `got: ${JSON.stringify(passive)}`,
  );

  const paragraphs = splitParagraphs("Birinci abzas.\n\n\n\nİkinci abzas.");
  check(
    "oxunaqliq: several consecutive blank lines still separate exactly two paragraphs, not more",
    paragraphs.length === 2 && paragraphs[0] === "Birinci abzas." && paragraphs[1] === "İkinci abzas.",
    `got: ${JSON.stringify(paragraphs)}`,
  );

  const empty = analyseReadability("");
  check(
    "oxunaqliq: an empty input never throws and every count comes back zero",
    empty.wordCount === 0 &&
      empty.sentences.count === 0 &&
      empty.sentences.longest === null &&
      empty.paragraphs.count === 0 &&
      empty.passive.matchCount === 0,
    `got: ${JSON.stringify(empty)}`,
  );

  const twoHundredWords = Array.from({ length: 200 }, () => "söz").join(" ");
  const timed = analyseReadability(twoHundredWords);
  check(
    "oxunaqliq: two hundred words at 200 words per minute takes exactly one minute",
    timed.readingTime.minutes === 1 && timed.readingTime.seconds === 0,
    `got: ${JSON.stringify(timed.readingTime)}`,
  );

  const guidanceKeys = Object.keys(READABILITY_GUIDANCE);
  check(
    "oxunaqliq: every one of the eight guidance lines is a real, non-empty sentence",
    guidanceKeys.length === 8 && guidanceKeys.every((key) => READABILITY_GUIDANCE[key as keyof typeof READABILITY_GUIDANCE].length > 10),
    `got keys: ${guidanceKeys.join(", ")}`,
  );
};
