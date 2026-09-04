import type { CheckSuite } from "./harness.mts";
import { clampCount, generateSampleText } from "../lib/numune-metn";

/**
 * Everything outside a Unicode letter, so the alphabet check below can
 * strip punctuation, whitespace and HTML markup before judging the letters
 * that remain -- the property under test is "every letter is Azerbaijani",
 * not "the string contains nothing else".
 */
const NON_LETTER = /[^\p{L}]+/gu;

/** The 32-letter Azerbaijani alphabet, both cases, as a membership set. */
const AZ_ALPHABET = new Set(
  "abcçdeəfgğhxıijklmnoöpqrsştuüvyzABCÇDEƏFGĞHXIİJKLMNOÖPQRSŞTUÜVYZ".split(""),
);

function onlyAzerbaijaniLetters(text: string): boolean {
  const letters = text.replace(NON_LETTER, "");
  return [...letters].every((letter) => AZ_ALPHABET.has(letter));
}

export const checks: CheckSuite = (check) => {
  {
    const result = generateSampleText({ unit: "word", count: 12, withHeading: false, html: false });
    check(
      "numune-metn: word unit returns exactly the requested word count",
      result.wordCount === 12,
      `expected 12, got ${result.wordCount}`,
    );
  }

  for (const count of [0, -5]) {
    const clamped = clampCount("paragraph", count);
    check(
      `numune-metn: clampCount floors ${count} to the unit minimum`,
      clamped === 1,
      `got ${clamped}`,
    );
  }

  {
    const clamped = clampCount("word", 1_000_000);
    check(
      "numune-metn: clampCount caps an oversized request at the unit maximum",
      clamped === 2000,
      `got ${clamped}`,
    );
  }

  {
    const result = generateSampleText({ unit: "sentence", count: 5, withHeading: false, html: false });
    const sentences = result.text.split(". ").filter((s) => s.trim() !== "");
    const allCapitalised = sentences.every((s) => /^[A-ZÇƏĞİÖŞÜ]/.test(s));
    check(
      "numune-metn: every sentence starts with a capital letter",
      allCapitalised,
      `got ${result.text}`,
    );
  }

  {
    const result = generateSampleText({ unit: "sentence", count: 3, withHeading: false, html: false });
    check(
      "numune-metn: sentence-unit text ends with a period",
      result.text.trim().endsWith("."),
      `got ${result.text}`,
    );
  }

  {
    const result = generateSampleText({ unit: "paragraph", count: 4, withHeading: false, html: false });
    check(
      "numune-metn: paragraph unit produces the requested number of paragraphs",
      result.text.split("\n\n").length === 4,
      `got ${result.text.split("\n\n").length} paragraphs`,
    );
  }

  {
    const result = generateSampleText({ unit: "list", count: 5, withHeading: false, html: true });
    const openTags = (result.text.match(/<li>/g) ?? []).length;
    const closeTags = (result.text.match(/<\/li>/g) ?? []).length;
    check(
      "numune-metn: HTML list mode has balanced <li> tags matching the count",
      openTags === 5 && closeTags === 5 && result.text.includes("<ul>") && result.text.includes("</ul>"),
      `got ${result.text}`,
    );
  }

  {
    const result = generateSampleText({ unit: "paragraph", count: 2, withHeading: false, html: true });
    const openTags = (result.text.match(/<p>/g) ?? []).length;
    const closeTags = (result.text.match(/<\/p>/g) ?? []).length;
    check(
      "numune-metn: HTML paragraph mode has balanced <p> tags",
      openTags === 2 && closeTags === 2,
      `got ${result.text}`,
    );
  }

  {
    const result = generateSampleText({ unit: "paragraph", count: 1, withHeading: true, html: true });
    check(
      "numune-metn: heading option prepends an <h2>",
      result.text.startsWith("<h2>") && result.text.includes("</h2>"),
      `got ${result.text}`,
    );
  }

  {
    const a = generateSampleText({ unit: "word", count: 20, withHeading: false, html: false });
    const b = generateSampleText({ unit: "word", count: 20, withHeading: false, html: false });
    check(
      "numune-metn: two calls with identical options produce different text",
      a.text !== b.text,
      `both calls returned "${a.text}"`,
    );
  }

  {
    const result = generateSampleText({ unit: "paragraph", count: 2, withHeading: true, html: false });
    check(
      "numune-metn: plain-text output contains only Azerbaijani alphabet letters",
      onlyAzerbaijaniLetters(result.text),
      `got ${result.text}`,
    );
  }
};
