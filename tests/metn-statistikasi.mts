/*
 * The surrogate-pair case is the closest this file gets to an external
 * reference value: it is not this tool's opinion that "😀" (U+1F600) is one
 * character and two UTF-16 code units, it is a fact of the UTF-16 encoding
 * itself, checked directly against both counting methods. The empty-input
 * case is the other reference point — every count of nothing is zero, by
 * definition rather than by this file's design.
 */
import type { CheckSuite } from "./harness.mts";
import {
  analyseText,
  characterCount,
  countParagraphs,
  countSentences,
  utf16Length,
  wordCount,
} from "../lib/metn-statistikasi";

export const checks: CheckSuite = (check) => {
  const emoji = "😀";
  check(
    "metn-statistikasi: a surrogate-pair emoji counts as 1 code point but 2 UTF-16 units, matching the UTF-16 spec",
    characterCount(emoji) === 1 && utf16Length(emoji) === 2,
    `code point count ${characterCount(emoji)}, utf16 length ${utf16Length(emoji)}`,
  );

  const emptyStats = analyseText("");
  check(
    "metn-statistikasi: empty input reports zero for every count, not one",
    emptyStats.wordCount === 0 &&
      emptyStats.sentenceCount === 0 &&
      emptyStats.paragraphCount === 0 &&
      emptyStats.characterCountWithSpaces === 0,
    `got ${JSON.stringify(emptyStats)}`,
  );

  const whitespaceOnlyStats = analyseText("   \n\t  ");
  check(
    "metn-statistikasi: whitespace-only input is treated the same as empty input",
    whitespaceOnlyStats.wordCount === 0 && whitespaceOnlyStats.sentenceCount === 0,
    `got ${JSON.stringify(whitespaceOnlyStats)}`,
  );

  const oneWord = wordCount("salam");
  check(
    "metn-statistikasi: a single word with no terminator counts as one word",
    oneWord === 1,
    `got ${oneWord}`,
  );

  const azerbaijaniLetters = wordCount("Əlaqə üçün ştatın şəhərinə çatdıq");
  check(
    "metn-statistikasi: Azerbaijani letters do not break whitespace-based word splitting",
    azerbaijaniLetters === 5,
    `got ${azerbaijaniLetters}`,
  );

  const noTrailingPunctuation = countSentences("Bu mətn nöqtə ilə bitmir");
  check(
    "metn-statistikasi: a sentence with no trailing punctuation still counts as one sentence",
    noTrailingPunctuation === 1,
    `got ${noTrailingPunctuation}`,
  );

  const abbreviationGuarded = countSentences(
    "Market meyvə, tərəvəz və s. satır. Bağlıdır.",
  );
  check(
    'metn-statistikasi: "və s." does not itself end a sentence, only the real terminators do',
    abbreviationGuarded === 2,
    `got ${abbreviationGuarded}`,
  );

  const manyBlankLines = countParagraphs("Birinci abzas.\n\n\n\n\nİkinci abzas.");
  check(
    "metn-statistikasi: several consecutive blank lines still count as one paragraph gap, not extra empty paragraphs",
    manyBlankLines === 2,
    `got ${manyBlankLines}`,
  );

  const topWordsResult = analyseText("alma alma armud alma armud kivi").topWords;
  check(
    "metn-statistikasi: the most frequent word is ranked first",
    topWordsResult[0]?.word === "alma" && topWordsResult[0]?.count === 3,
    `got ${JSON.stringify(topWordsResult)}`,
  );
};
