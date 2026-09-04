/*
 * The heading outline auditor, checked against the shapes that make a
 * structure checker either useless or wrong: a page with no H1 at all, one
 * with too many, a skipped level that must not crash the tree builder, and
 * the text extraction quirks (case, nested tags, entities, image-only
 * headings) that `html.ts` is supposed to absorb before any of this logic
 * ever runs.
 */
import type { CheckSuite } from "./harness.mts";
import {
  auditOutline,
  buildOutlineTree,
  extractHeadings,
  type Heading,
} from "../lib/basliq-strukturu";

function kinds(headings: Heading[]): string[] {
  return auditOutline(headings).map((issue) => issue.kind);
}

export const checks: CheckSuite = (check) => {
  {
    const headings = extractHeadings("<h2>Bir</h2><h3>Başqa</h3>");
    check(
      "basliq-strukturu: h1 yoxdursa xeta bildirilir",
      kinds(headings).includes("h1-yoxdur"),
      `alindi: ${JSON.stringify(kinds(headings))}`,
    );
  }

  {
    const headings = extractHeadings("<h1>Bir</h1><h1>Başqa</h1>");
    const issues = auditOutline(headings);
    check(
      "basliq-strukturu: birdən çox H1 xəbərdarlıq kimi bildirilir, xəta kimi yox",
      issues.some((issue) => issue.kind === "coxlu-h1" && issue.severity === "xeberdarliq"),
      `alindi: ${JSON.stringify(issues)}`,
    );
  }

  {
    const headings = extractHeadings("<h1>Baş</h1><h2>Orta</h2><h4>Dərin</h4>");
    const issues = auditOutline(headings);
    const tree = buildOutlineTree(headings);
    check(
      "basliq-strukturu: H2-dən sonra H4 atlama xətası verir",
      issues.some((issue) => issue.kind === "seviyye-atlanib" && issue.severity === "xeta"),
      `alindi: ${JSON.stringify(issues)}`,
    );
    check(
      "basliq-strukturu: atlanmış səviyyədə ağac çökmür, H4 H2-nin altına düşür",
      tree.length === 1 &&
        tree[0].children.length === 1 &&
        tree[0].children[0].heading.level === 2 &&
        tree[0].children[0].children.length === 1 &&
        tree[0].children[0].children[0].heading.level === 4,
      `alindi: ${JSON.stringify(tree)}`,
    );
  }

  {
    const headings = extractHeadings("<h1>Baş</h1><h2></h2>");
    const empty = headings.find((heading) => heading.level === 2);
    check(
      "basliq-strukturu: bos <h2></h2> bos kimi isarelenir",
      empty !== undefined && empty.empty === true && empty.text === "",
      `alindi: ${JSON.stringify(empty)}`,
    );
    check(
      "basliq-strukturu: bos basliq xeta kimi bildirilir",
      kinds(headings).includes("bos-basliq"),
      `alindi: ${JSON.stringify(kinds(headings))}`,
    );
  }

  {
    const headings = extractHeadings("<H1>Böyük hərflə</H1>");
    check(
      "basliq-strukturu: <H1> boyuk herfle yazilib tapilir",
      headings.length === 1 && headings[0].level === 1 && headings[0].text === "Böyük hərflə",
      `alindi: ${JSON.stringify(headings)}`,
    );
  }

  {
    const headings = extractHeadings("<h1>Salam <span>dünya</span></h1>");
    check(
      "basliq-strukturu: basliq icindeki span atilir, metn qalir",
      headings.length === 1 && headings[0].text === "Salam dünya",
      `alindi: ${JSON.stringify(headings)}`,
    );
  }

  {
    const headings = extractHeadings("<h1>Sürət &amp; performans</h1>");
    check(
      "basliq-strukturu: &amp; dekod olunur",
      headings.length === 1 && headings[0].text === "Sürət & performans",
      `alindi: ${JSON.stringify(headings)}`,
    );
  }

  {
    const headings = extractHeadings("<h1>Baş</h1><h2>Backend</h2><h2>Backend</h2>");
    const issues = auditOutline(headings).filter((issue) => issue.kind === "tekrar-metn");
    check(
      "basliq-strukturu: eyni metnli iki basliq her ikisi ucun de xeberdarliq verir",
      issues.length === 2,
      `alindi: ${JSON.stringify(issues)}`,
    );
  }

  {
    const headings = extractHeadings("<h1>Baş</h1><h2>Alət</h2>");
    check(
      "basliq-strukturu: tek sozden ibaret basliq xeberdarliq verir",
      kinds(headings).includes("tek-soz"),
      `alindi: ${JSON.stringify(kinds(headings))}`,
    );
  }

  {
    const longText = "Bu başlıq qəsdən çox uzun yazılıb ki, yetmiş simvol həddini keçsin və xəbərdarlıq versin";
    const headings = extractHeadings(`<h1>Baş</h1><h2>${longText}</h2>`);
    check(
      "basliq-strukturu: 70 simvoldan uzun basliq xeberdarliq verir",
      longText.length > 70 && kinds(headings).includes("uzun-basliq"),
      `uzunluq: ${longText.length}, alinan: ${JSON.stringify(kinds(headings))}`,
    );
  }

  {
    const headings = extractHeadings('<h1>Baş</h1><h2><img src="/a.png"></h2>');
    const image = headings.find((heading) => heading.level === 2);
    const issues = auditOutline(headings);
    check(
      "basliq-strukturu: alt-siz sekilden ibaret basliq hasImageOnly=true olur",
      image !== undefined && image.hasImageOnly === true && image.empty === true,
      `alindi: ${JSON.stringify(image)}`,
    );
    check(
      "basliq-strukturu: alt-siz sekil basligi sekil-alt-siz xeberdarligi verir, bos-basliq ile ikiqat sayilmir",
      issues.some((issue) => issue.kind === "sekil-alt-siz") &&
        !issues.some((issue) => issue.kind === "bos-basliq"),
      `alindi: ${JSON.stringify(issues)}`,
    );
  }

  {
    const headings = extractHeadings('<h1>Baş</h1><h2><img src="/a.png" alt="Şəbəkə diaqramı"></h2>');
    const image = headings.find((heading) => heading.level === 2);
    check(
      "basliq-strukturu: alt metni olan sekil basligi altdan metn goturur, bos sayilmir",
      image !== undefined &&
        image.text === "Şəbəkə diaqramı" &&
        image.empty === false &&
        image.hasImageOnly === false,
      `alindi: ${JSON.stringify(image)}`,
    );
  }

  {
    const headings = extractHeadings("<h1>Baş</h1><h2>A</h2><h3>B</h3><h2>C</h2>");
    const tree = buildOutlineTree(headings);
    check(
      "basliq-strukturu: eyni seviyyeye qayidis ferqli budaq yaradir, evvelki alt agaci qarisdirmir",
      tree.length === 1 &&
        tree[0].children.length === 2 &&
        tree[0].children[0].children.length === 1 &&
        tree[0].children[1].children.length === 0,
      `alindi: ${JSON.stringify(tree)}`,
    );
  }

  {
    check(
      "basliq-strukturu: basliqsiz HTML de yene h1-yoxdur bildirir, cokmur",
      kinds(extractHeadings("<p>heç bir başlıq yoxdur</p>")).includes("h1-yoxdur"),
      "bos basliq siyahisinda h1-yoxdur gozlenilirdi",
    );
  }
};
