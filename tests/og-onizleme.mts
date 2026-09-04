/*
 * The sharing-metadata reader, proved against fixed markup.
 *
 * Nothing here touches the network: the route does the fetching and hands the
 * markup to these three pure functions, so every judgement the tool makes can
 * be checked against a string that will still say the same thing next year.
 *
 * The cases are chosen from what actually breaks in the wild rather than from
 * the specification's happy path - a relative `og:image`, a page that spells
 * `property` as `name`, attributes in the reverse order, an entity in a
 * title - because those are the four that make a card come out wrong while
 * the markup still looks correct to the person who wrote it.
 */
import type { CheckSuite } from "./harness.mts";
import {
  auditOpenGraph,
  buildCards,
  extractOpenGraph,
  type OgIssue,
} from "../lib/og-onizleme";

const PAGE = "https://numune.az/bloq/yazi";

/** The card a platform would draw, by name. */
function cardFor(html: string, platform: string, pageUrl = PAGE) {
  const cards = buildCards(extractOpenGraph(html, pageUrl), pageUrl);
  return cards.find((card) => card.platform === platform);
}

function messages(issues: OgIssue[]): string {
  return issues.map((issue) => `${issue.severity}:${issue.message.slice(0, 40)}`).join(" | ");
}

function audit(html: string, pageUrl = PAGE): OgIssue[] {
  return auditOpenGraph(extractOpenGraph(html, pageUrl), pageUrl);
}

/* A page with nothing wrong with it, used as the baseline the defects are
   introduced into one at a time. */
const CLEAN = `<html><head>
  <title>Sayt adı — yazı</title>
  <meta property="og:title" content="Qısa başlıq">
  <meta property="og:description" content="Bir cümlədən ibarət təsvir.">
  <meta property="og:image" content="https://numune.az/og/yazi.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Diaqram">
  <meta property="og:url" content="https://numune.az/bloq/yazi">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="/bloq/yazi">
  <link rel="icon" href="/favicon.ico">
</head><body></body></html>`;

export const checks: CheckSuite = (check) => {
  /* 1. The defect the tool exists for: a path where a URL was required. The
     card has to carry the resolved address, not the path. */
  const relative = CLEAN.replace(
    'content="https://numune.az/og/yazi.png"',
    'content="/og/yazi.png"',
  );
  const relativeCard = cardFor(relative, "facebook");
  check(
    "og-onizleme: nisbi og:image baza ünvanına görə mütləqləşir",
    relativeCard?.image === "https://numune.az/og/yazi.png",
    `image: ${relativeCard?.image}`,
  );

  // 2. ...and it is named as an error rather than silently repaired.
  const relativeIssues = audit(relative);
  check(
    "og-onizleme: nisbi og:image xəta kimi bildirilir",
    relativeIssues.some((issue) => issue.severity === "xeta" && issue.message.includes("nisbi")),
    messages(relativeIssues),
  );

  /* 3. Open Graph specifies `property`, Twitter specifies `name`, and half the
     web writes the other one. Both have to be read. */
  const swapped = `<html><head>
    <meta name="og:title" content="name ile yazilib">
    <meta property="twitter:card" content="summary_large_image">
    <meta property="og:image" content="https://numune.az/a.png">
  </head></html>`;
  const swappedData = extractOpenGraph(swapped, PAGE);
  check(
    "og-onizleme: property= və name= hər ikisi oxunur",
    swappedData.tags["og:title"] === "name ile yazilib" &&
      swappedData.tags["twitter:card"] === "summary_large_image",
    `tags: ${JSON.stringify(swappedData.tags)}`,
  );

  // 4. Attribute order is not something markup guarantees.
  const reversed = `<html><head><meta content="ters sirada" property="og:title"></head></html>`;
  check(
    "og-onizleme: atribut sırası tərs olanda da tapılır",
    extractOpenGraph(reversed, PAGE).tags["og:title"] === "ters sirada",
    `tags: ${JSON.stringify(extractOpenGraph(reversed, PAGE).tags)}`,
  );

  // 5. An entity in a content attribute is text, not markup.
  const entities = `<html><head>
    <meta property="og:title" content="Alma &amp; armud">
    <title>Sual &#38; cavab</title>
  </head></html>`;
  const entityData = extractOpenGraph(entities, PAGE);
  check(
    "og-onizleme: &amp; həm content-də, həm başlıqda dekod olunur",
    entityData.tags["og:title"] === "Alma & armud" && entityData.title === "Sual & cavab",
    `title: ${entityData.tags["og:title"]} / ${entityData.title}`,
  );

  /* 6. The documented fallback chain: no og:title means the platforms read
     the `<title>` element instead, so the card must show that. */
  const noOgTitle = `<html><head>
    <title>Yalniz title var</title>
    <meta property="og:image" content="https://numune.az/a.png">
  </head></html>`;
  const fallbackCard = cardFor(noOgTitle, "facebook");
  check(
    "og-onizleme: og:title yoxdursa başlıq <title>-dan götürülür",
    fallbackCard?.title === "Yalniz title var",
    `title: ${fallbackCard?.title}`,
  );

  // 7. And the visitor is told the fallback happened.
  check(
    "og-onizleme: og:title çatışmazlığı xəbərdarlıq verir",
    audit(noOgTitle).some(
      (issue) => issue.severity === "xeberdarliq" && issue.message.includes("og:title"),
    ),
    messages(audit(noOgTitle)),
  );

  /* 8. X sizes its card from `twitter:card` alone: a 1200x630 image does not
     make the card large if the tag does not say so. */
  const noCard = CLEAN.replace('<meta name="twitter:card" content="summary_large_image">', "");
  check(
    "og-onizleme: twitter:card yoxdursa X kartı kiçik qalır",
    cardFor(noCard, "twitter")?.large === false && cardFor(CLEAN, "twitter")?.large === true,
    `boş: ${cardFor(noCard, "twitter")?.large}, tam: ${cardFor(CLEAN, "twitter")?.large}`,
  );

  // 9. A missing image is the loudest defect there is.
  const noImage = `<html><head><meta property="og:title" content="Basliq"></head></html>`;
  check(
    "og-onizleme: og:image yoxdursa xəta verilir və kart şəkilsiz qalır",
    audit(noImage).some((issue) => issue.severity === "xeta" && issue.message.includes("og:image")) &&
      cardFor(noImage, "whatsapp")?.image === null,
    messages(audit(noImage)),
  );

  /* 10. `og:url` decides which address the share counter belongs to, so a
     mismatch is worth a warning - and a trailing slash is not a mismatch. */
  const wrongUrl = CLEAN.replace(
    'content="https://numune.az/bloq/yazi"',
    'content="https://basqa-sayt.az/bloq/yazi"',
  );
  const slashOnly = CLEAN.replace(
    'content="https://numune.az/bloq/yazi"',
    'content="https://www.numune.az/bloq/yazi/"',
  );
  check(
    "og-onizleme: og:url uyuşmazlığı bildirilir, www və sonluq kəsri isə yox",
    audit(wrongUrl).some((issue) => issue.message.includes("og:url")) &&
      !audit(slashOnly).some((issue) => issue.message.includes("uyuşmur")),
    `${messages(audit(wrongUrl))} // ${messages(audit(slashOnly))}`,
  );

  // 11. The cut limits are per platform, and the tightest one is named first.
  const longTitle = CLEAN.replace(
    'content="Qısa başlıq"',
    `content="${"a".repeat(75)}"`,
  );
  const cutIssue = audit(longTitle).find((issue) => issue.message.startsWith("Başlıq"));
  check(
    "og-onizleme: platforma kəsmə həddi keçiləndə platformalar adı ilə deyilir",
    cutIssue !== undefined &&
      cutIssue.message.includes("WhatsApp") &&
      cutIssue.message.includes("X") &&
      !cutIssue.message.includes("LinkedIn onu"),
    `issue: ${cutIssue?.message}`,
  );

  // 12. `link` targets are resolved against the page, like the image is.
  const linked = extractOpenGraph(CLEAN, PAGE);
  check(
    "og-onizleme: canonical və icon mütləq ünvana çevrilir",
    linked.canonical === "https://numune.az/bloq/yazi" &&
      linked.icon === "https://numune.az/favicon.ico",
    `canonical: ${linked.canonical}, icon: ${linked.icon}`,
  );

  /* 13. A repeated tag keeps its first value: an author who wrote og:image
     twice meant the second as an alternative, not as a correction, and that
     is what the scrapers do too. */
  const repeated = `<html><head>
    <meta property="og:title" content="birinci">
    <meta property="og:title" content="ikinci">
  </head></html>`;
  check(
    "og-onizleme: təkrarlanan teqdə birinci dəyər qalır",
    extractOpenGraph(repeated, PAGE).tags["og:title"] === "birinci",
    `title: ${extractOpenGraph(repeated, PAGE).tags["og:title"]}`,
  );

  // 14. The baseline itself must produce no errors, or every case above is
  // measuring the noise floor instead of the defect it introduced.
  check(
    "og-onizleme: qüsursuz səhifədə bir dənə də xəta yoxdur",
    audit(CLEAN).every((issue) => issue.severity !== "xeta"),
    messages(audit(CLEAN)),
  );

  /* 15. A comment is not markup: a `<meta>` written inside one is an example
     somebody left in the head, not a tag the scrapers will read. */
  const commented = `<html><head>
    <!-- <meta property="og:title" content="serhdeki"> -->
    <meta property="og:title" content="eslinde">
  </head></html>`;
  check(
    "og-onizleme: şərh içindəki meta teq oxunmur",
    extractOpenGraph(commented, PAGE).tags["og:title"] === "eslinde",
    `title: ${extractOpenGraph(commented, PAGE).tags["og:title"]}`,
  );
};
