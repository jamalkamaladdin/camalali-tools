/*
 * robots.txt precedence is the one thing worth proving here: the rule with
 * the longest declared pattern wins regardless of file order or directive
 * type, a tie goes to Allow, and a specific bot's own group overrides `*`
 * rather than adding to it. The first two cases are the textbook examples
 * from RFC 9309 §2.2.2 (the IETF standardisation of the algorithm every major
 * crawler already implemented), used as known-answer checks rather than
 * checking the tool's output against itself.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildRobotsTxt,
  buildTemplateConfig,
  checkUrl,
  parseRobotsTxt,
  pathMatchesRule,
} from "../lib/robots";

export const checks: CheckSuite = (check) => {
  // RFC 9309 §2.2.2, first example: "/p" (2 chars) outranks "/" (1 char).
  const rfcExampleOne = parseRobotsTxt("User-agent: *\nAllow: /p\nDisallow: /\n");
  check(
    "robots: RFC 9309 example — /p allow beats / disallow for /page",
    checkUrl(rfcExampleOne, "*", "/page").allowed === true,
    `result: ${JSON.stringify(checkUrl(rfcExampleOne, "*", "/page"))}`,
  );

  // Same section: equal-length allow and disallow on the same path — the tie
  // is broken in favour of the less restrictive rule.
  const rfcExampleTwo = parseRobotsTxt("User-agent: *\nAllow: /folder\nDisallow: /folder\n");
  check(
    "robots: equal-length allow and disallow — allow wins the tie",
    checkUrl(rfcExampleTwo, "*", "/folder/page").allowed === true,
    `result: ${JSON.stringify(checkUrl(rfcExampleTwo, "*", "/folder/page"))}`,
  );

  check(
    "robots: '*' in the middle of a pattern matches an arbitrary segment",
    pathMatchesRule("/files/report.pdf", "/*.pdf"),
    "expected /*.pdf to match /files/report.pdf",
  );

  check(
    "robots: '$' anchors the pattern to the end of the path",
    pathMatchesRule("/page", "/page$") &&
      !pathMatchesRule("/page2", "/page$") &&
      !pathMatchesRule("/page/sub", "/page$"),
    `matches: ${pathMatchesRule("/page", "/page$")}, ${pathMatchesRule("/page2", "/page$")}, ${pathMatchesRule("/page/sub", "/page$")}`,
  );

  const emptyDisallow = parseRobotsTxt("User-agent: *\nDisallow:\n");
  check(
    "robots: an empty Disallow value blocks nothing",
    checkUrl(emptyDisallow, "*", "/anything/at/all").allowed === true,
    `result: ${JSON.stringify(checkUrl(emptyDisallow, "*", "/anything/at/all"))}`,
  );

  const blockAll = parseRobotsTxt("User-agent: *\nDisallow: /\n");
  check(
    "robots: Disallow: / blocks every path",
    checkUrl(blockAll, "*", "/anything").allowed === false,
    `result: ${JSON.stringify(checkUrl(blockAll, "*", "/anything"))}`,
  );

  const specificVsWildcard = parseRobotsTxt(
    "User-agent: *\nAllow: /\n\nUser-agent: Googlebot\nDisallow: /private\n",
  );
  check(
    "robots: a bot's own group overrides '*' instead of adding to it",
    checkUrl(specificVsWildcard, "Googlebot", "/private").allowed === false &&
      checkUrl(specificVsWildcard, "Bingbot", "/private").allowed === true,
    `googlebot: ${JSON.stringify(checkUrl(specificVsWildcard, "Googlebot", "/private"))}, bingbot: ${JSON.stringify(checkUrl(specificVsWildcard, "Bingbot", "/private"))}`,
  );
  check(
    "robots: falling back to '*' is reported so the UI can say so",
    checkUrl(specificVsWildcard, "Bingbot", "/private").usedWildcardFallback === true &&
      checkUrl(specificVsWildcard, "Googlebot", "/private").usedWildcardFallback === false,
    "fallback flag did not match which group actually applied",
  );

  const caseSensitivePath = parseRobotsTxt("User-agent: *\nDisallow: /Secret\n");
  check(
    "robots: path matching is case-sensitive",
    checkUrl(caseSensitivePath, "*", "/Secret").allowed === false &&
      checkUrl(caseSensitivePath, "*", "/secret").allowed === true,
    `Secret: ${checkUrl(caseSensitivePath, "*", "/Secret").allowed}, secret: ${checkUrl(caseSensitivePath, "*", "/secret").allowed}`,
  );

  const mixedCaseDirectives = parseRobotsTxt("User-Agent: *\nDISALLOW: /admin\n");
  check(
    "robots: directive names are case-insensitive (path values are not)",
    checkUrl(mixedCaseDirectives, "*", "/admin").allowed === false,
    `result: ${JSON.stringify(checkUrl(mixedCaseDirectives, "*", "/admin"))}`,
  );

  const withComments = parseRobotsTxt(
    "# top-level comment\nUser-agent: *\nDisallow: /admin # internal only\n",
  );
  check(
    "robots: comments are stripped, before and after a directive",
    withComments.groups.length === 1 &&
      withComments.groups[0].rules.length === 1 &&
      withComments.groups[0].rules[0].path === "/admin",
    `groups: ${JSON.stringify(withComments.groups)}`,
  );

  const withSitemap = parseRobotsTxt(
    "User-agent: *\nSitemap: https://example.com/sitemap.xml\nDisallow: /admin\n",
  );
  check(
    "robots: a Sitemap line is collected separately and does not split the group",
    withSitemap.sitemaps.length === 1 &&
      withSitemap.sitemaps[0] === "https://example.com/sitemap.xml" &&
      withSitemap.groups.length === 1 &&
      withSitemap.groups[0].rules.length === 1,
    `sitemaps: ${JSON.stringify(withSitemap.sitemaps)}, groups: ${JSON.stringify(withSitemap.groups)}`,
  );

  const sharedGroup = parseRobotsTxt("User-agent: AgentA\nUser-agent: AgentB\nDisallow: /x\n");
  check(
    "robots: consecutive User-agent lines share the rules that follow them",
    checkUrl(sharedGroup, "AgentA", "/x").allowed === false &&
      checkUrl(sharedGroup, "AgentB", "/x").allowed === false,
    `AgentA: ${checkUrl(sharedGroup, "AgentA", "/x").allowed}, AgentB: ${checkUrl(sharedGroup, "AgentB", "/x").allowed}`,
  );

  const crawlDelay = parseRobotsTxt("User-agent: *\nCrawl-delay: 10\n");
  check(
    "robots: Crawl-delay is parsed as a number",
    crawlDelay.groups[0]?.crawlDelay === 10,
    `crawlDelay: ${crawlDelay.groups[0]?.crawlDelay}`,
  );

  const roundTripText = buildRobotsTxt(buildTemplateConfig("admin-bagli", "https://example.com/sitemap.xml"));
  const roundTripped = parseRobotsTxt(roundTripText);
  check(
    "robots: the admin-closed template round-trips through build -> parse with the same verdicts",
    checkUrl(roundTripped, "*", "/admin/panel").allowed === false &&
      checkUrl(roundTripped, "*", "/blog/post").allowed === true &&
      roundTripped.sitemaps.includes("https://example.com/sitemap.xml"),
    `text: ${roundTripText}`,
  );

  const aiTemplate = parseRobotsTxt(buildRobotsTxt(buildTemplateConfig("ai-bagli", "")));
  check(
    "robots: the AI-crawlers template blocks ClaudeBot while leaving Googlebot on the general allow",
    checkUrl(aiTemplate, "ClaudeBot", "/bloq/yazi").allowed === false &&
      checkUrl(aiTemplate, "Googlebot", "/bloq/yazi").allowed === true,
    `claude: ${checkUrl(aiTemplate, "ClaudeBot", "/bloq/yazi").allowed}, googlebot: ${checkUrl(aiTemplate, "Googlebot", "/bloq/yazi").allowed}`,
  );

  const vendorDirective = parseRobotsTxt("User-agent: *\nHost: example.com\nDisallow: /admin\n");
  check(
    "robots: an unknown vendor directive (Host:) is ignored without breaking the group",
    vendorDirective.groups.length === 1 && vendorDirective.groups[0].rules.length === 1,
    `groups: ${JSON.stringify(vendorDirective.groups)}`,
  );
};
