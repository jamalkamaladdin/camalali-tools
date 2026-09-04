/*
 * The sitemap reader, proved against fixed documents.
 *
 * The cases are the shapes that make a hand-written parser wrong rather than
 * the ones the specification illustrates: a namespace prefix on every element,
 * a byte-order mark before a missing declaration, a URL wrapped in CDATA, a
 * feed that is Atom and not RSS. Each of those is a file Google reads without
 * complaint, so a tool that calls any of them broken is worse than no tool.
 *
 * The other half is the opposite failure - inventing a number. A document that
 * is not a sitemap must come back as `namelum` with no counts attached, and a
 * file that was cut off must say so instead of reporting the fragment's size
 * as the file's size.
 */
import type { CheckSuite } from "./harness.mts";
import { parseSitemapDocument, MAX_URLS_PER_SITEMAP } from "../lib/sitemap-yoxlayici";

const SOURCE = "https://numune.az/sitemap.xml";

function report(text: string, truncated = false, source = SOURCE) {
  return parseSitemapDocument(text, source, truncated);
}

function problems(text: string, truncated = false, source = SOURCE): string {
  return report(text, truncated, source)
    .issues.map((issue) => `${issue.severity}:${issue.message.slice(0, 44)}`)
    .join(" | ");
}

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://numune.az/</loc><lastmod>2026-01-05</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://numune.az/bloq</loc><lastmod>2026-08-30</lastmod></url>
  <url><loc>https://numune.az/haqqimda</loc><lastmod>2025-03-11</lastmod></url>
</urlset>`;

export const checks: CheckSuite = (check) => {
  // 1. The two sitemap shapes are told apart by their root element.
  const index = `<?xml version="1.0"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://numune.az/sitemap-1.xml</loc><lastmod>2026-02-01</lastmod></sitemap>
      <sitemap><loc>https://numune.az/sitemap-2.xml</loc></sitemap>
    </sitemapindex>`;
  const indexReport = report(index);
  check(
    "sitemap-yoxlayici: <sitemapindex> ilə <urlset> ayırd edilir",
    indexReport.kind === "sitemapindex" &&
      report(URLSET).kind === "urlset" &&
      indexReport.childSitemaps.length === 2 &&
      indexReport.urls.length === 0,
    `kind: ${indexReport.kind}, alt: ${indexReport.childSitemaps.length}`,
  );

  /* 2. Namespace prefixes are legal on every element and common in the wild;
     matching on the full name would call a valid sitemap unrecognised. */
  const prefixed = `<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sm:url><sm:loc>https://numune.az/a</sm:loc><sm:lastmod>2026-04-02</sm:lastmod></sm:url>
    </sm:urlset>`;
  const prefixedReport = report(prefixed);
  check(
    "sitemap-yoxlayici: ad sahəsi prefiksli <ns:urlset> tanınır",
    prefixedReport.kind === "urlset" &&
      prefixedReport.urls.length === 1 &&
      prefixedReport.rootElement === "sm:urlset",
    `kind: ${prefixedReport.kind}, kök: ${prefixedReport.rootElement}`,
  );

  // 3. CDATA is verbatim text, and an address is often wrapped in it.
  const cdata = `<urlset><url><loc><![CDATA[https://numune.az/a?x=1&y=2]]></loc></url></urlset>`;
  check(
    "sitemap-yoxlayici: CDATA içindəki <loc> oxunur və içi dekod edilmir",
    report(cdata).urls[0]?.loc === "https://numune.az/a?x=1&y=2",
    `loc: ${report(cdata).urls[0]?.loc}`,
  );

  // 4. Outside CDATA the same ampersand is an entity and must be decoded.
  const entity = `<urlset><url><loc>https://numune.az/a?x=1&amp;y=2</loc></url></urlset>`;
  check(
    "sitemap-yoxlayici: &amp; adi mətndə dekod olunur",
    report(entity).urls[0]?.loc === "https://numune.az/a?x=1&y=2",
    `loc: ${report(entity).urls[0]?.loc}`,
  );

  // 5. The two feed formats look nothing alike and both have to be read.
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
      <title>Numunə lenti</title>
      <item><title>Bir</title><link>https://numune.az/1</link><pubDate>Mon, 02 Feb 2026 10:00:00 GMT</pubDate></item>
      <item><title>İki</title><link>https://numune.az/2</link><pubDate>Tue, 03 Feb 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>`;
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom lenti</title>
      <entry><link rel="alternate" href="https://numune.az/1"/><updated>2026-02-02T10:00:00Z</updated></entry>
    </feed>`;
  const rssReport = report(rss);
  const atomReport = report(atom);
  check(
    "sitemap-yoxlayici: RSS və Atom ayırd edilir, başlıq və element sayı oxunur",
    rssReport.kind === "rss" &&
      rssReport.urls.length === 2 &&
      rssReport.feedTitle === "Numunə lenti" &&
      atomReport.kind === "atom" &&
      atomReport.urls.length === 1 &&
      atomReport.feedTitle === "Atom lenti",
    `rss: ${rssReport.kind}/${rssReport.urls.length}/${rssReport.feedTitle}, atom: ${atomReport.kind}/${atomReport.urls.length}`,
  );

  // 6. Atom keeps the address in an attribute, not in the element's text.
  check(
    "sitemap-yoxlayici: Atom ünvanı link href atributundan götürülür",
    atomReport.urls[0]?.loc === "https://numune.az/1",
    `loc: ${atomReport.urls[0]?.loc}`,
  );

  /* 7. The important refusal: an HTML page is not a feed, and the tool must
     say so with the element it actually found instead of inventing counts. */
  const html = `<!DOCTYPE html><html><head><title>Sayt</title></head><body><a href="/a">a</a></body></html>`;
  const htmlReport = report(html);
  check(
    "sitemap-yoxlayici: tanınmayan kök element namelum verir və say uydurmur",
    htmlReport.kind === "namelum" &&
      htmlReport.rootElement === "html" &&
      htmlReport.urls.length === 0 &&
      htmlReport.childSitemaps.length === 0 &&
      htmlReport.issues.some((issue) => issue.message.includes("«html»")),
    `kind: ${htmlReport.kind}, kök: ${htmlReport.rootElement}, say: ${htmlReport.urls.length}`,
  );

  /* 7b. ...and it says only that. An HTML page fails XML well-formedness on
     every unclosed `<meta>`, and burying the useful sentence under "your XML
     is broken at line 27" is how a tool becomes noise. */
  check(
    "sitemap-yoxlayici: HTML səhifə pozuq XML kimi yox, «sitemap deyil» kimi bildirilir",
    !htmlReport.issues.some((issue) => issue.message.includes("XML pozuqdur")),
    problems(html),
  );

  /* 8. A cut file leaves elements open. That is not broken markup, and the
     report has to carry the flag rather than the accusation. */
  const cut = `<urlset><url><loc>https://numune.az/a</loc></url><url><loc>https://numune.az/`;
  const cutReport = report(cut, true);
  check(
    "sitemap-yoxlayici: truncated hesabatda görünür və pozuq XML kimi sayılmır",
    cutReport.truncated === true &&
      cutReport.issues.some((issue) => issue.message.includes("yalnız başlanğıcı oxundu")) &&
      !cutReport.issues.some((issue) => issue.message.includes("bağlanmayıb")),
    problems(cut, true),
  );

  /* 9. ...while the same document read whole is broken, and the visitor gets
     the place rather than the verdict alone. */
  const broken = `<urlset>\n  <url>\n    <loc>https://numune.az/a</loc>\n  </urlset>`;
  const brokenReport = report(broken);
  check(
    "sitemap-yoxlayici: pozuq XML sətir və mövqe ilə bildirilir",
    brokenReport.issues.some(
      (issue) => issue.severity === "xeta" && /sətir \d+, mövqe \d+/.test(issue.message),
    ),
    problems(broken),
  );

  // 10. A byte-order mark with no declaration behind it is still a sitemap.
  const bom = `﻿<urlset><url><loc>https://numune.az/a</loc></url></urlset>`;
  check(
    "sitemap-yoxlayici: BOM və bəyannaməsiz fayl oxunur",
    report(bom).kind === "urlset" && report(bom).urls.length === 1,
    `kind: ${report(bom).kind}`,
  );

  /* 11. `<loc>` is mandatory and an entry without one is silently dropped by
     crawlers, so it is counted rather than ignored. */
  const missing = `<urlset><url><lastmod>2026-01-01</lastmod></url><url><loc>https://numune.az/a</loc></url></urlset>`;
  check(
    "sitemap-yoxlayici: <loc>-suz <url> xəta kimi sayılır",
    report(missing).issues.some(
      (issue) => issue.severity === "xeta" && issue.message.startsWith("1 <url>"),
    ),
    problems(missing),
  );

  // 12. A relative address is the one defect the protocol names outright.
  const relative = `<urlset><url><loc>/bloq/yazi</loc></url></urlset>`;
  check(
    "sitemap-yoxlayici: nisbi <loc> xəta verir",
    report(relative).issues.some(
      (issue) => issue.severity === "xeta" && issue.message.includes("mütləq deyil"),
    ),
    problems(relative),
  );

  // 13. Duplicates and mixed hosts are both counted, and both are warnings.
  const mixed = `<urlset>
      <url><loc>https://numune.az/a</loc></url>
      <url><loc>https://numune.az/a</loc></url>
      <url><loc>https://basqa.az/b</loc></url>
    </urlset>`;
  const mixedReport = report(mixed);
  check(
    "sitemap-yoxlayici: təkrar ünvan və qarışmış host sayılır",
    mixedReport.duplicates === 1 &&
      mixedReport.hosts.length === 2 &&
      mixedReport.issues.filter((issue) => issue.severity === "xeberdarliq").length >= 2,
    `təkrar: ${mixedReport.duplicates}, host: ${mixedReport.hosts.join(",")}`,
  );

  // 14. The date range is reported as written, not as a reformatted date.
  const range = report(URLSET);
  check(
    "sitemap-yoxlayici: lastmod aralığı ən köhnə və ən yeni ilə verilir",
    range.oldest === "2025-03-11" && range.newest === "2026-08-30",
    `aralıq: ${range.oldest} → ${range.newest}`,
  );

  /* 15. A gzipped file cannot be parsed here and the honest answer is to say
     which file to ask for instead of reporting an empty sitemap. */
  const gzipSource = "https://numune.az/sitemap.xml.gz";
  const gzipped = report("", false, gzipSource);
  check(
    "sitemap-yoxlayici: gzip sıxılmış fayl açıq şəkildə rədd edilir",
    gzipped.kind === "namelum" &&
      gzipped.issues.some((issue) => issue.severity === "xeta" && issue.message.includes("gzip")),
    problems("", false, gzipSource),
  );

  // 16. hreflang alternates live in a second namespace and are counted.
  const hreflang = `<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml">
      <url>
        <loc>https://numune.az/a</loc>
        <xhtml:link rel="alternate" hreflang="az" href="https://numune.az/a"/>
        <xhtml:link rel="alternate" hreflang="en" href="https://numune.az/en/a"/>
      </url>
      <url><loc>https://numune.az/b</loc></url>
    </urlset>`;
  check(
    "sitemap-yoxlayici: hreflang alternativi olan ünvanlar sayılır",
    report(hreflang).hreflangCount === 1 && report(hreflang).urls.length === 2,
    `hreflang: ${report(hreflang).hreflangCount}`,
  );

  /* 17. changefreq and priority survive the parse, since the widget reports
     how many entries bother to carry them. */
  check(
    "sitemap-yoxlayici: changefreq və priority sahələri saxlanılır",
    range.urls[0]?.changefreq === "daily" && range.urls[0]?.priority === "1.0",
    `ilk sətir: ${JSON.stringify(range.urls[0])}`,
  );

  /* 18. The protocol's 50 000 ceiling, checked at the boundary rather than
     trusted: the count is exact and the warning names the limit. */
  const many = (count: number) =>
    `<urlset>${Array.from(
      { length: count },
      (_, at) => `<url><loc>https://numune.az/${at}</loc></url>`,
    ).join("")}</urlset>`;
  const overLimit = report(many(MAX_URLS_PER_SITEMAP + 1));
  check(
    "sitemap-yoxlayici: 50 000 həddi keçiləndə xəbərdarlıq verilir",
    overLimit.urls.length === MAX_URLS_PER_SITEMAP + 1 &&
      overLimit.issues.some((issue) => issue.message.includes("protokolun həddi")),
    `say: ${overLimit.urls.length}`,
  );
};
