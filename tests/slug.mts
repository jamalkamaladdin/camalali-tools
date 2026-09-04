/*
 * The transliteration table is the part most likely to break silently: a
 * refactor that "simplifies" the dotted/dotless-I handling back to a plain
 * `.toLowerCase()` call would pass every test that does not specifically
 * target that letter family, so several cases below exist only for it.
 */
import type { CheckSuite } from "./harness.mts";
import { slugify } from "../lib/slug";

export const checks: CheckSuite = (check) => {
  const allLetters = slugify("Əlaqə ğıış öüç");
  check(
    "slug: full accented-letter line resolves to a known ASCII string",
    allLetters === "elaqe-giis-ouc",
    `got ${JSON.stringify(allLetters)}`,
  );

  const dottedTrap = slugify("İstifadəçi ID");
  check(
    "slug: dotted-I and dotless-I both fold to plain i, not to each other or to a combining mark",
    dottedTrap === "istifadeci-id",
    `got ${JSON.stringify(dottedTrap)}`,
  );

  const punctuationOnly = slugify("!!! ... ???");
  check(
    "slug: punctuation-only input produces an empty slug, not a lone separator",
    punctuationOnly === "",
    `got ${JSON.stringify(punctuationOnly)}`,
  );

  const empty = slugify("");
  check("slug: empty input produces an empty slug", empty === "", `got ${JSON.stringify(empty)}`);

  const leadingDigit = slugify("2026-cı il yekunları");
  check(
    "slug: a leading digit is kept, not stripped as if it were illegal",
    leadingDigit === "2026-ci-il-yekunlari",
    `got ${JSON.stringify(leadingDigit)}`,
  );

  const repeatedSpaces = slugify("Salam    dünya");
  check(
    "slug: a run of several spaces collapses to one separator",
    repeatedSpaces === "salam-dunya",
    `got ${JSON.stringify(repeatedSpaces)}`,
  );

  const edgeHyphens = slugify("-Başlıq-");
  check(
    "slug: a leading and trailing hyphen in the title are both dropped",
    edgeHyphens === "basliq",
    `got ${JSON.stringify(edgeHyphens)}`,
  );

  const underscoreSeparator = slugify("Salam dünya", { separator: "_" });
  check(
    "slug: the underscore separator option is honoured end to end",
    underscoreSeparator === "salam_dunya",
    `got ${JSON.stringify(underscoreSeparator)}`,
  );

  const caseKept = slugify("Salam Dünya", { lowercase: false });
  check(
    "slug: turning the lowercase option off keeps ASCII letter case while accented letters still transliterate",
    caseKept === "Salam-Dunya",
    `got ${JSON.stringify(caseKept)}`,
  );

  const wordBoundaryTruncated = slugify("Bu başlıq həqiqətən uzundur və kəsilməlidir", {
    maxLength: 20,
  });
  check(
    "slug: a length limit cuts at the last full word inside the limit, not mid-word",
    wordBoundaryTruncated.length <= 20 &&
      wordBoundaryTruncated === "bu-basliq-heqiqeten",
    `got ${JSON.stringify(wordBoundaryTruncated)}`,
  );

  const oneWordTooLong = slugify("beynəlxalq", { maxLength: 5 });
  check(
    "slug: when the first word alone exceeds the length limit, the whole word survives rather than being cut mid-word",
    oneWordTooLong === "beynelxalq",
    `got ${JSON.stringify(oneWordTooLong)}`,
  );
};
