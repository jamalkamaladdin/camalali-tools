/*
 * What is worth checking here: the language-code grammar rejects exactly the
 * shapes it claims to (wrong separator, three-letter region, a bare name),
 * the "uk" trap is surfaced by name rather than silently accepted, the audit
 * catches the reciprocal-set failures (missing self, duplicate code, relative
 * URL, missing x-default without treating it as fatal), and a quoted URL
 * cannot break out of the HTML attribute it lands in.
 */
import type { CheckSuite } from "./harness.mts";
import {
  auditHreflang,
  buildHttpHeader,
  buildLinkTags,
  buildSitemapBlock,
  checkLanguageCode,
  parseHreflangHtml,
  type HreflangEntry,
} from "../lib/hreflang";

export const checks: CheckSuite = (check) => {
  const azAz = checkLanguageCode("az-AZ");
  check("hreflang: az-AZ is a valid code", azAz.ok, `got: ${JSON.stringify(azAz)}`);

  const azUnderscore = checkLanguageCode("az_AZ");
  check(
    "hreflang: az_AZ (underscore separator) is rejected",
    !azUnderscore.ok,
    `got: ${JSON.stringify(azUnderscore)}`,
  );

  const azThreeLetterRegion = checkLanguageCode("az-AZE");
  check(
    "hreflang: az-AZE (three-letter region) is rejected",
    !azThreeLetterRegion.ok,
    `got: ${JSON.stringify(azThreeLetterRegion)}`,
  );

  const bareName = checkLanguageCode("azerbaijan");
  check(
    "hreflang: a spelled-out language name is rejected, not accepted as a code",
    !bareName.ok,
    `got: ${JSON.stringify(bareName)}`,
  );

  const xDefault = checkLanguageCode("x-default");
  check("hreflang: x-default is accepted", xDefault.ok, `got: ${JSON.stringify(xDefault)}`);

  const uk = checkLanguageCode("uk");
  check(
    "hreflang: uk is well-formed and its label names the Britain trap explicitly",
    uk.ok && uk.language === "uk" && (uk.label ?? "").includes("Britaniya"),
    `got: ${JSON.stringify(uk)}`,
  );

  const ukEntries: HreflangEntry[] = [{ code: "uk", url: "https://example.com/uk" }];
  const ukIssues = auditHreflang(ukEntries, null);
  const ukWarning = ukIssues.find((issue) => issue.message.includes("uk"));
  check(
    "hreflang: an entry coded uk raises a warning, not an error",
    ukWarning !== undefined && ukWarning.severity === "xeberdarliq",
    `issues: ${JSON.stringify(ukIssues)}`,
  );

  const missingSelfIssues = auditHreflang(
    [
      { code: "az", url: "https://example.com/az" },
      { code: "en", url: "https://example.com/en" },
    ],
    "https://example.com/ru",
  );
  check(
    "hreflang: a set that never lists the page's own URL is flagged as an error",
    missingSelfIssues.some(
      (issue) => issue.severity === "xeta" && issue.message.includes("istinad"),
    ),
    `issues: ${JSON.stringify(missingSelfIssues)}`,
  );

  const hasSelfIssues = auditHreflang(
    [
      { code: "az", url: "https://example.com/az" },
      { code: "en", url: "https://example.com/en" },
    ],
    "https://example.com/az",
  );
  check(
    "hreflang: a set that does list the page's own URL raises no self-reference error",
    !hasSelfIssues.some((issue) => issue.message.includes("istinad")),
    `issues: ${JSON.stringify(hasSelfIssues)}`,
  );

  const duplicateIssues = auditHreflang(
    [
      { code: "az", url: "https://example.com/one" },
      { code: "az", url: "https://example.com/two" },
    ],
    null,
  );
  check(
    "hreflang: the same code pointing at two different URLs is an error",
    duplicateIssues.some(
      (issue) => issue.severity === "xeta" && issue.message.toLowerCase().includes("az"),
    ),
    `issues: ${JSON.stringify(duplicateIssues)}`,
  );

  const relativeIssues = auditHreflang([{ code: "az", url: "/az/" }], null);
  check(
    "hreflang: a relative href is an error",
    relativeIssues.some((issue) => issue.severity === "xeta" && issue.message.includes("/az/")),
    `issues: ${JSON.stringify(relativeIssues)}`,
  );

  const missingDefaultIssues = auditHreflang(
    [{ code: "az", url: "https://example.com/az" }],
    "https://example.com/az",
  );
  const defaultWarning = missingDefaultIssues.find((issue) => issue.message.includes("x-default"));
  check(
    "hreflang: a missing x-default is a warning, not an error",
    defaultWarning !== undefined && defaultWarning.severity === "xeberdarliq",
    `issues: ${JSON.stringify(missingDefaultIssues)}`,
  );

  const quotedTags = buildLinkTags([{ code: "az", url: 'https://example.com/a"b' }]);
  check(
    "hreflang: a quoted URL cannot break out of the href attribute",
    quotedTags.includes("&quot;") && !quotedTags.includes('href="https://example.com/a"b"'),
    `got: ${quotedTags}`,
  );

  const headerForm = buildHttpHeader([{ code: "az", url: "https://example.com/az" }]);
  check(
    "hreflang: the HTTP header form carries rel=alternate and the hreflang code",
    headerForm.includes("<https://example.com/az>") &&
      headerForm.includes('rel="alternate"') &&
      headerForm.includes('hreflang="az"'),
    `got: ${headerForm}`,
  );

  const sitemapBlock = buildSitemapBlock("https://example.com/az", [
    { code: "az", url: "https://example.com/az" },
    { code: "en", url: "https://example.com/en" },
  ]);
  check(
    "hreflang: the sitemap block wraps one loc and one xhtml:link per entry inside <url>",
    sitemapBlock.startsWith("<url>") &&
      sitemapBlock.endsWith("</url>") &&
      sitemapBlock.includes("<loc>https://example.com/az</loc>") &&
      (sitemapBlock.match(/<xhtml:link/g) ?? []).length === 2,
    `got: ${sitemapBlock}`,
  );

  const parsed = parseHreflangHtml(
    '<link rel="canonical" href="https://example.com/">\n' +
      '<link rel="alternate" hreflang="az" href="https://example.com/az/" />\n' +
      "<link rel=\"alternate\" hreflang='en' href='https://example.com/en/'>",
  );
  check(
    "hreflang: parsing a pasted block keeps only rel=alternate links and reads single- or double-quoted attributes",
    parsed.length === 2 &&
      parsed[0].code === "az" &&
      parsed[0].url === "https://example.com/az/" &&
      parsed[1].code === "en" &&
      parsed[1].url === "https://example.com/en/",
    `got: ${JSON.stringify(parsed)}`,
  );
};
