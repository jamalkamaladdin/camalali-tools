/*
 * What is worth checking about a tool whose whole claim is a width.
 *
 * The first case is the reason this tool exists next to `meta`: an Azerbaijani
 * title and a Latin title of the same character count are not the same width,
 * so a character counter cannot answer the question. If the width table ever
 * loses its `ə`, `ı` or `ş`, every one of those letters silently falls back on
 * an average and the tool starts lying in the only language it is written for
 * — the second case is there so that failure is loud.
 */
import type { CheckSuite } from "./harness.mts";
import {
  DESCRIPTION_FONT_PX,
  descriptionBudgetPx,
  displayUrl,
  estimateWidth,
  judgeDescription,
  judgeTitle,
  SERP_LIMITS,
  TITLE_FONT_PX,
  truncateToWidth,
} from "../lib/serp-onizleme";

/** At 1000px the advance table is read out in its own design units, so an expected value is the table entry itself. */
const EM = 1000;

export const checks: CheckSuite = (check) => {
  const azTitle = "Şəbəkə üzərində məlumat ötürülməsi";
  const latinTitle = "W".repeat(Array.from(azTitle).length);
  check(
    "serp-onizleme: an azerbaijani title and a same-length latin title differ in pixels",
    estimateWidth(azTitle, TITLE_FONT_PX) !== estimateWidth(latinTitle, TITLE_FONT_PX),
    `az: ${estimateWidth(azTitle, TITLE_FONT_PX)} latin: ${estimateWidth(latinTitle, TITLE_FONT_PX)}`,
  );

  /* Every one of these differs from the fallback advance, so a missing table
     entry cannot pass by accident. */
  const azAdvances: [string, number][] = [
    ["ı", 222],
    ["ş", 500],
    ["ç", 500],
    ["İ", 278],
    ["Ə", 667],
    ["Ş", 667],
    ["Ü", 722],
    ["Ç", 722],
    ["Ğ", 778],
    ["Ö", 778],
  ];
  const wrongAdvances = azAdvances.filter(([letter, expected]) => estimateWidth(letter, EM) !== expected);
  check(
    "serp-onizleme: azerbaijani letters are in the width table, not on the fallback",
    wrongAdvances.length === 0,
    `wrong: ${JSON.stringify(wrongAdvances.map(([letter]) => [letter, estimateWidth(letter, EM)]))}`,
  );

  check(
    "serp-onizleme: a narrow letter measures narrower than a wide one",
    estimateWidth("ı", EM) < estimateWidth("W", EM) && estimateWidth("W", EM) === 944,
    `ı: ${estimateWidth("ı", EM)} W: ${estimateWidth("W", EM)}`,
  );

  /* Doubling the size doubles the width, up to the single pixel the rounding
     to whole pixels is allowed to keep. */
  check(
    "serp-onizleme: width scales with font size",
    Math.abs(estimateWidth("camalali", 40) - 2 * estimateWidth("camalali", 20)) <= 1,
    `40px: ${estimateWidth("camalali", 40)} 20px: ${estimateWidth("camalali", 20)}`,
  );

  const sentence =
    "Azərbaycan dilində sistem dizaynı haqqında praktik yazılar və real layihə qərarları";
  const cut = truncateToWidth(sentence, SERP_LIMITS.mobile.titlePx, TITLE_FONT_PX);
  const kept = cut.text.slice(0, -1); // without the ellipsis
  const nextChar = sentence.charAt(kept.length);
  check(
    "serp-onizleme: truncateToWidth stops on a whole word, never mid-word",
    cut.truncated && sentence.startsWith(kept) && (nextChar === "" || nextChar === " "),
    `cut: ${JSON.stringify(cut)} next char: ${JSON.stringify(nextChar)}`,
  );
  check(
    "serp-onizleme: the truncated string, ellipsis included, fits the box it was cut for",
    estimateWidth(cut.text, TITLE_FONT_PX) <= SERP_LIMITS.mobile.titlePx,
    `px: ${estimateWidth(cut.text, TITLE_FONT_PX)} limit: ${SERP_LIMITS.mobile.titlePx}`,
  );

  const short = truncateToWidth("Qısa başlıq", SERP_LIMITS.desktop.titlePx, TITLE_FONT_PX);
  check(
    "serp-onizleme: a title that fits comes back untouched and unflagged",
    short.text === "Qısa başlıq" && short.truncated === false,
    `got: ${JSON.stringify(short)}`,
  );

  /* One word wider than the whole box is the case the word rule cannot serve;
     an empty string would tell the visitor nothing, so characters are cut. */
  const oneWord = truncateToWidth("ə".repeat(200), SERP_LIMITS.mobile.titlePx, TITLE_FONT_PX);
  check(
    "serp-onizleme: a single over-wide word is cut by character rather than lost",
    oneWord.truncated &&
      oneWord.text.length > 1 &&
      estimateWidth(oneWord.text, TITLE_FONT_PX) <= SERP_LIMITS.mobile.titlePx,
    `got: ${oneWord.text.length} chars, ${estimateWidth(oneWord.text, TITLE_FONT_PX)}px`,
  );

  const emptyTitle = judgeTitle("", "desktop");
  const emptyDescription = judgeDescription("   ", "mobile");
  check(
    "serp-onizleme: empty input reads as 'qisa' with zero width instead of crashing",
    emptyTitle.verdict === "qisa" &&
      emptyTitle.px === 0 &&
      emptyTitle.chars === 0 &&
      emptyDescription.verdict === "qisa" &&
      emptyDescription.chars === 0,
    `title: ${JSON.stringify(emptyTitle)} description: ${JSON.stringify(emptyDescription)}`,
  );

  /* The device switch has to change an answer, or it is decoration: mobile is
     narrower, so a title that fits a desktop line can overflow a phone. */
  const borderline = "Sistem dizaynı üzrə praktik məsləhətlər və real nümunələr";
  check(
    "serp-onizleme: the same title is judged more harshly on mobile than on desktop",
    judgeTitle(borderline, "desktop").verdict === "uygun" &&
      judgeTitle(borderline, "mobile").verdict === "uzun",
    `desktop: ${JSON.stringify(judgeTitle(borderline, "desktop"))} mobile: ${JSON.stringify(
      judgeTitle(borderline, "mobile"),
    )}`,
  );

  check(
    "serp-onizleme: a description is judged against every line of its box, not one",
    descriptionBudgetPx("desktop") ===
      SERP_LIMITS.desktop.descriptionPx * SERP_LIMITS.desktop.descriptionLines &&
      SERP_LIMITS.desktop.descriptionLines > 1,
    `budget: ${descriptionBudgetPx("desktop")}`,
  );

  const overLong = "ə".repeat(4000);
  check(
    "serp-onizleme: a description past the whole box budget reads 'uzun'",
    judgeDescription(overLong, "desktop").verdict === "uzun" &&
      judgeDescription(overLong, "desktop").px > descriptionBudgetPx("desktop") &&
      estimateWidth(overLong, DESCRIPTION_FONT_PX) > 0,
    `got: ${JSON.stringify(judgeDescription(overLong, "desktop"))}`,
  );

  check(
    "serp-onizleme: displayUrl draws Google's breadcrumb, without scheme, www or query",
    displayUrl("https://www.camalali.com/alet/serp-onizleme?utm_source=x") ===
      "camalali.com › alet › serp-onizleme",
    `got: ${displayUrl("https://www.camalali.com/alet/serp-onizleme?utm_source=x")}`,
  );
  check(
    "serp-onizleme: a percent-escaped path segment is shown as the letters it stands for",
    displayUrl("camalali.com/bloq/%C9%99n-yax%C5%9F%C4%B1") === "camalali.com › bloq › ən-yaxşı",
    `got: ${displayUrl("camalali.com/bloq/%C9%99n-yax%C5%9F%C4%B1")}`,
  );
  check(
    "serp-onizleme: an unparseable address is handed back as typed, and a blank one gets a placeholder",
    displayUrl("bu ünvan deyil") === "bu ünvan deyil" && displayUrl("  ") === "nümunə.com",
    `got: ${displayUrl("bu ünvan deyil")} / ${displayUrl("  ")}`,
  );
};
