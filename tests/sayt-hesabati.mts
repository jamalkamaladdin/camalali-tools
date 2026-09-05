/*
 * The combined report, proved against fixed pages instead of a live site.
 *
 * The cases below are the ones a careless edit turns silently wrong rather
 * than the ones a specification illustrates. Three shapes recur.
 *
 * A verdict must not be invented. Every row that could not be measured — no
 * certificate, no robots.txt, an http-only address — has to come back as a
 * stated failure with a sentence, because the one thing a report may never do
 * is quietly drop the checks it could not run and look better for it.
 *
 * The middle state has to stay a middle state. A header that exists and is
 * imperfect (a short `max-age`, a CSP with `unsafe-inline`, a temporary
 * redirect) is a warning; collapsing it into either neighbour would make the
 * score say less than the rows do.
 *
 * And a well-built page has to come out clean. A checker that finds something
 * wrong with a correct page is worse than no checker, so the perfect input is
 * pinned here as tightly as the broken ones.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildSiteReport,
  type FetchedFile,
  type SiteCheck,
  type SiteReportInput,
} from "../lib/site-report";

const GOOD_HTML = `<!doctype html>
<html lang="az">
  <head>
    <title>Numune sayt — sistem dizayni haqqinda</title>
    <meta name="description" content="Bu sehife sistem dizayni movzusunda yazilar toplayir ve her yazinin sonunda menbe siyahisi verilir.">
    <link rel="canonical" href="https://numune.az/">
    <meta property="og:title" content="Numune sayt">
    <meta property="og:description" content="Sistem dizayni haqqinda yazilar.">
    <meta property="og:image" content="https://numune.az/og.png">
  </head>
  <body>
    <h1>Numune sayt</h1>
    <img src="https://numune.az/a.png" alt="Diaqram">
    <img src="https://numune.az/b.png" alt="">
  </body>
</html>`;

const GOOD_HEADERS: [string, string][] = [
  ["content-type", "text/html; charset=utf-8"],
  ["content-encoding", "br"],
  ["strict-transport-security", "max-age=31536000; includeSubDomains"],
  ["content-security-policy", "default-src 'self'; frame-ancestors 'self'"],
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
];

const ROBOTS: FetchedFile = {
  url: "https://numune.az/robots.txt",
  status: 200,
  text: "User-agent: *\nDisallow: /admin\n\nSitemap: https://numune.az/sitemap.xml\n",
  truncated: false,
  error: null,
};

const SITEMAP: FetchedFile = {
  url: "https://numune.az/sitemap.xml",
  status: 200,
  text: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://numune.az/</loc><lastmod>2026-08-01</lastmod></url>
  <url><loc>https://numune.az/bloq</loc><lastmod>2026-08-30</lastmod></url>
</urlset>`,
  truncated: false,
  error: null,
};

function input(overrides: Partial<SiteReportInput> = {}): SiteReportInput {
  return {
    url: "https://numune.az/",
    hostname: "numune.az",
    status: 200,
    redirectedTo: null,
    headers: GOOD_HEADERS,
    html: GOOD_HTML,
    htmlTruncated: false,
    responseMs: 180,
    httpProbe: { reachable: true, status: 301, location: "https://numune.az/" },
    certificate: { ok: true, daysLeft: 74, issuer: "Let's Encrypt" },
    robots: ROBOTS,
    sitemap: SITEMAP,
    checkedAt: "2026-09-04T09:00:00.000Z",
    ...overrides,
  };
}

function row(overrides: Partial<SiteReportInput>, id: string): SiteCheck {
  const found = buildSiteReport(input(overrides)).checks.find((check) => check.id === id);
  if (found === undefined) throw new Error(`yoxlama tapilmadi: ${id}`);
  return found;
}

function withHeaders(pairs: [string, string][]): [string, string][] {
  return pairs;
}

export const checks: CheckSuite = (check) => {
  // 1. A page that is built correctly has to come out entirely clean.
  const clean = buildSiteReport(input());
  check(
    "sayt-hesabati: duzgun qurulmus sehife butun yoxlamalari kecir",
    clean.failed === 0 && clean.warnings === 0 && clean.score === 100,
    `kecdi ${clean.passed}, xeberdarliq ${clean.warnings}, kecmedi ${clean.failed}: ${clean.checks
      .filter((item) => item.status !== "kecdi")
      .map((item) => `${item.id}=${item.status}`)
      .join(", ")}`,
  );

  /* 2. Twenty rows in four sections, and every row carries the sentence that
     makes it readable. A row with no detail is a row nobody can act on. */
  const sections = new Set(clean.checks.map((item) => item.section));
  check(
    "sayt-hesabati: iyirmi yoxlama dord bolmeye paylanir ve hamisinin izahi var",
    clean.checks.length === 20 &&
      sections.size === 4 &&
      clean.checks.every((item) => item.detail.trim() !== "") &&
      new Set(clean.checks.map((item) => item.id)).size === 20,
    `say ${clean.checks.length}, bolme ${sections.size}`,
  );

  /* 3. A passing row must not carry a fix and a failing row must carry one.
     The opposite of either is how a report becomes decoration. */
  check(
    "sayt-hesabati: kecen setirde duzelis yoxdur, kecmeyende var",
    clean.checks.every((item) => (item.status === "kecdi" ? item.fix === null : item.fix !== null)),
    clean.checks
      .filter((item) => (item.status === "kecdi") === (item.fix !== null))
      .map((item) => item.id)
      .join(", "),
  );

  /* 4. The three states are worth 1, 0.5 and 0. A warning that scored like
     either neighbour would make the headline disagree with the rows. */
  const middling = buildSiteReport(
    input({
      headers: withHeaders([
        ["strict-transport-security", "max-age=86400"],
        ["content-security-policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'self'"],
        ["x-content-type-options", "nosniff"],
        ["referrer-policy", "unsafe-url"],
        ["content-encoding", "gzip"],
      ]),
    }),
  );
  check(
    "sayt-hesabati: xeberdarliq yarim bal sayilir",
    middling.warnings === 3 &&
      middling.failed === 0 &&
      middling.score === Math.round(((middling.passed + 1.5) / 20) * 100),
    `xeberdarliq ${middling.warnings}, kecmedi ${middling.failed}, bal ${middling.score}`,
  );

  /* 5. An http address is not "a site without HSTS": four separate rows turn
     into failures with their own sentences, and none of them may go missing. */
  const insecure = buildSiteReport(
    input({
      url: "http://numune.az/",
      httpProbe: null,
      certificate: null,
      headers: withHeaders([["content-type", "text/html"]]),
      html: GOOD_HTML.replace(/https:\/\/numune\.az\/a\.png/, "http://numune.az/a.png"),
    }),
  );
  const insecureIds = insecure.checks
    .filter((item) => item.status === "kecmedi")
    .map((item) => item.id);
  check(
    "sayt-hesabati: http unvanda dord ayri setir oz sebebi ile kecmir",
    ["https-yonlendirme", "hsts", "sertifikat", "qarisiq-mezmun"].every((id) =>
      insecureIds.includes(id),
    ) && insecure.checks.every((item) => item.detail.trim() !== ""),
    insecureIds.join(", "),
  );

  /* 6. A redirect to https is only a pass when it is permanent: a 302 tells
     both the browser and the crawler to keep asking over http tomorrow. */
  const permanent = row({ httpProbe: { reachable: true, status: 308, location: "https://numune.az/" } }, "https-yonlendirme");
  const temporary = row({ httpProbe: { reachable: true, status: 302, location: "https://numune.az/" } }, "https-yonlendirme");
  const toHttp = row({ httpProbe: { reachable: true, status: 301, location: "http://www.numune.az/" } }, "https-yonlendirme");
  const noRedirect = row({ httpProbe: { reachable: true, status: 200, location: null } }, "https-yonlendirme");
  check(
    "sayt-hesabati: 301/308 kecir, 302 xeberdarliqdir, http hedefi kecmir",
    permanent.status === "kecdi" &&
      temporary.status === "xeberdarliq" &&
      toHttp.status === "kecmedi" &&
      noRedirect.status === "kecmedi",
    `308=${permanent.status}, 302=${temporary.status}, http=${toHttp.status}, 200=${noRedirect.status}`,
  );

  /* 7. `Disallow: /` under `User-agent: *` removes a whole site from search.
     It is the one line in robots.txt that has to outrank everything else the
     file says, including a correctly declared sitemap. */
  const blocked = row(
    {
      robots: {
        ...ROBOTS,
        text: "User-agent: *\nDisallow: /\n\nSitemap: https://numune.az/sitemap.xml\n",
      },
    },
    "robots-txt",
  );
  const missingRobots = row(
    { robots: { url: "https://numune.az/robots.txt", status: 404, text: "", truncated: false, error: "Ünvan HTTP 404 qaytardı." } },
    "robots-txt",
  );
  check(
    "sayt-hesabati: «Disallow: /» kecmir, olmayan robots.txt yalniz xeberdarliqdir",
    blocked.status === "kecmedi" && missingRobots.status === "xeberdarliq",
    `bagli=${blocked.status}, yox=${missingRobots.status}`,
  );

  /* 8. An empty `alt=""` is how a decorative image is marked and a reader is
     meant to skip it. Counting it as a defect would push every correctly
     built page below a hundred. */
  const decorative = row({}, "alt-metn");
  const missingAlt = row(
    {
      html: GOOD_HTML.replace('<img src="https://numune.az/b.png" alt="">', '<img src="https://numune.az/b.png">'),
    },
    "alt-metn",
  );
  check(
    "sayt-hesabati: bos alt bezek sayilir, atributun yoxlugu qusurdur",
    decorative.status === "kecdi" && missingAlt.status === "kecmedi" && missingAlt.value === "1/2",
    `bezek=${decorative.status}, eskik=${missingAlt.status} (${missingAlt.value})`,
  );

  /* 9. One H1 passes, none fails, several warn — the middle case exists
     because two H1s is an ambiguity rather than an absence. */
  const noH1 = row({ html: GOOD_HTML.replace("<h1>Numune sayt</h1>", "<p>Numune sayt</p>") }, "h1");
  const twoH1 = row(
    { html: GOOD_HTML.replace("<h1>Numune sayt</h1>", "<h1>Bir</h1><h1>Iki</h1>") },
    "h1",
  );
  check(
    "sayt-hesabati: H1 sayinda sifir kecmir, iki xeberdarliqdir",
    noH1.status === "kecmedi" && noH1.value === "0" && twoH1.status === "xeberdarliq" && twoH1.value === "2",
    `sifir=${noH1.status}, iki=${twoH1.status}`,
  );

  /* 10. A certificate is a countdown, not a boolean: expired, expiring and
     healthy are three different sentences and two different verdicts. */
  const expired = row({ certificate: { ok: true, daysLeft: -3, issuer: "Let's Encrypt" } }, "sertifikat");
  const expiring = row({ certificate: { ok: true, daysLeft: 9, issuer: "Let's Encrypt" } }, "sertifikat");
  const healthy = row({ certificate: { ok: true, daysLeft: 60, issuer: "Let's Encrypt" } }, "sertifikat");
  check(
    "sayt-hesabati: sertifikat muddeti uc hala ayrilir",
    expired.status === "kecmedi" &&
      expiring.status === "xeberdarliq" &&
      healthy.status === "kecdi" &&
      expired.fix !== null,
    `bitib=${expired.status}, azalib=${expiring.status}, saglam=${healthy.status}`,
  );

  /*
   * 10b. The row this report used to get exactly backwards, and the reason
   * this file has a case for it.
   *
   * A handshake that never produced a date says nothing about the date. The
   * first version read the two as one verdict, so every host this server
   * could not reach on its first resolved address came back as a failed
   * certificate check while the certificate itself had months left. The
   * failing state has to stay reachable, though: an expiry that has actually
   * passed is still a failure, which is why `expired` is asserted again here
   * rather than only above.
   */
  const unreadable = row(
    { certificate: { ok: false, reason: "TLS elaqesi qurulmadi (ETIMEDOUT)." } },
    "sertifikat",
  );
  const noReading = row({ certificate: null }, "sertifikat");
  check(
    "sayt-hesabati: oxunmayan sertifikat kecmedi vermir, vaxti bitmis verir",
    unreadable.status === "xeberdarliq" &&
      noReading.status === "xeberdarliq" &&
      unreadable.detail.includes("ETIMEDOUT") &&
      unreadable.fix !== null &&
      expired.status === "kecmedi",
    `oxunmayan=${unreadable.status}, olculmemis=${noReading.status}, bitmis=${expired.status}, izah=${unreadable.detail}`,
  );

  /* 11. `frame-ancestors` in the CSP is the modern form and `X-Frame-Options`
     the older one; either protects, and `frame-ancestors *` protects nothing
     while looking like it does. */
  const legacyFraming = row(
    { headers: withHeaders([["x-frame-options", "SAMEORIGIN"]]) },
    "cerceve",
  );
  const openFraming = row(
    { headers: withHeaders([["content-security-policy", "frame-ancestors *"]]) },
    "cerceve",
  );
  const noFraming = row({ headers: withHeaders([["content-type", "text/html"]]) }, "cerceve");
  check(
    "sayt-hesabati: X-Frame-Options kifayetdir, «frame-ancestors *» kifayet etmir",
    legacyFraming.status === "kecdi" && openFraming.status === "kecmedi" && noFraming.status === "kecmedi",
    `xfo=${legacyFraming.status}, aciq=${openFraming.status}, yox=${noFraming.status}`,
  );

  /* 12. A cut page still has to be graded, and the fact that it was cut has
     to survive into the report — the HTML size row reads it as a floor. */
  const truncated = buildSiteReport(input({ htmlTruncated: true }));
  const sizeRow = truncated.checks.find((item) => item.id === "html-olcusu");
  check(
    "sayt-hesabati: kesilmis sehife hem qeyd olunur, hem de olcu setrinde kecmir",
    truncated.htmlTruncated && sizeRow?.status === "kecmedi" && (sizeRow?.value ?? "").endsWith("+"),
    `bayraq ${truncated.htmlTruncated}, setir ${sizeRow?.status} (${sizeRow?.value})`,
  );

  /* 13. Compression is judged against the size it would have saved: a page
     under a kilobyte is not a compression defect, and calling it one would
     teach the visitor to ignore the row. */
  const uncompressed = row(
    {
      headers: withHeaders([["content-type", "text/html"]]),
      html: `${GOOD_HTML}<p>${"a".repeat(4000)}</p>`,
    },
    "sixilma",
  );
  const tiny = row(
    { headers: withHeaders([["content-type", "text/html"]]), html: "<html lang=\"az\"><h1>a</h1></html>" },
    "sixilma",
  );
  check(
    "sayt-hesabati: sixilmamis boyuk sehife kecmir, kicik sehife kecir",
    uncompressed.status === "kecmedi" && tiny.status === "kecdi",
    `boyuk=${uncompressed.status}, kicik=${tiny.status}`,
  );

  /* 14. The meta rows read the page rather than the headers, so their inputs
     are markup: a missing title fails, an overlong one warns. */
  const noTitle = row({ html: GOOD_HTML.replace(/<title>[^<]*<\/title>/, "") }, "title");
  const longTitle = row(
    {
      html: GOOD_HTML.replace(
        /<title>[^<]*<\/title>/,
        `<title>${"a".repeat(90)}</title>`,
      ),
    },
    "title",
  );
  check(
    "sayt-hesabati: basliq yoxdursa kecmir, hedden uzundursa xeberdarliqdir",
    noTitle.status === "kecmedi" && longTitle.status === "xeberdarliq",
    `yox=${noTitle.status}, uzun=${longTitle.status}`,
  );

  /* 15. A sitemap that answers but lists nothing is worse than one that is
     missing, because the site looks covered and is not. */
  const emptySitemap = row(
    {
      sitemap: {
        ...SITEMAP,
        text: '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
      },
    },
    "sitemap",
  );
  const indexSitemap = row(
    {
      sitemap: {
        ...SITEMAP,
        text: `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://numune.az/s1.xml</loc></sitemap></sitemapindex>`,
      },
    },
    "sitemap",
  );
  check(
    "sayt-hesabati: bos sitemap kecmir, sitemap indeksi kecir",
    emptySitemap.status === "kecmedi" && indexSitemap.status === "kecdi",
    `bos=${emptySitemap.status}, indeks=${indexSitemap.status}`,
  );

  /* 16. Response time has three bands and the middle one exists because a
     server-to-server second is a phone's several. */
  const fast = row({ responseMs: 120 }, "cavab-vaxti");
  const middle = row({ responseMs: 900 }, "cavab-vaxti");
  const slow = row({ responseMs: 2600 }, "cavab-vaxti");
  check(
    "sayt-hesabati: cavab vaxti uc zolaga bolunur",
    fast.status === "kecdi" && middle.status === "xeberdarliq" && slow.status === "kecmedi",
    `120=${fast.status}, 900=${middle.status}, 2600=${slow.status}`,
  );

  /* 17. The headline is what a visitor reads before anything else, so it has
     to agree with the counters underneath it in every one of the three
     shapes a report can take. */
  const allClean = buildSiteReport(input()).headline;
  const mixed = buildSiteReport(
    input({ certificate: { ok: true, daysLeft: -3, issuer: "Let's Encrypt" }, responseMs: 900 }),
  );
  check(
    "sayt-hesabati: yekun setri saylarla uzlasir",
    allClean.includes("hamısı") &&
      mixed.headline.includes(String(mixed.passed)) &&
      mixed.headline.includes(String(mixed.failed)),
    `${allClean} | ${mixed.headline}`,
  );
};
