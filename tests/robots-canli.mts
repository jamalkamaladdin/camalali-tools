/*
 * The live robots.txt reader, checked against fixed text and no network.
 *
 * Two halves are worth proving separately. The parser is the half this module
 * had to write itself, because `robots.ts` carries no line numbers - so the
 * cases below pin the group boundaries, the line counting and what lands in
 * `unknown`. The precedence half is imported from `robots.ts` and is checked
 * here anyway, through `testPaths`: the point is not to re-test the matcher,
 * it is to prove that this module's rule selection sits on top of it correctly
 * and reports the line that actually decided.
 *
 * The encoding cases matter more than they look. A byte order mark glues
 * itself to the first directive's name, so an unstripped one deletes the whole
 * first group from a file that reads correctly in every editor.
 */
import type { CheckSuite } from "./harness.mts";
import {
  auditRobots,
  parseRobotsText,
  testPaths,
  KNOWN_BOTS,
} from "../lib/robots-canli";

/** The default audit input: a plain 200 that puts nothing of its own in the list. */
const HEALTHY = { status: 200, contentType: "text/plain", byteLength: 100 };

export const checks: CheckSuite = (check) => {
  /* ---------- parsing ---------- */

  const basic = parseRobotsText(
    ["User-agent: *", "Disallow: /admin", "Allow: /admin/acik", "", "Sitemap: https://sayt.com/sitemap.xml"].join("\n"),
  );

  check(
    "robots-canli: qaydalar oz setir nomresini dasiyir",
    basic.groups.length === 1 &&
      basic.groups[0].rules[0].line === 2 &&
      basic.groups[0].rules[1].line === 3 &&
      basic.sitemaps[0].line === 5,
    `lines: ${JSON.stringify(basic.groups[0]?.rules.map((rule) => rule.line))}, sitemap: ${basic.sitemaps[0]?.line}`,
  );

  /* Consecutive User-agent lines share one rule set; one seen after a rule
     opens a new group. Both halves of that boundary are checked at once. */
  const twoAgents = parseRobotsText(
    ["User-agent: Googlebot", "User-agent: Bingbot", "Disallow: /gizli", "", "User-agent: *", "Disallow: /admin"].join("\n"),
  );

  check(
    "robots-canli: iki agentli blok tek qrup kimi oxunur",
    twoAgents.groups.length === 2 &&
      twoAgents.groups[0].agents.length === 2 &&
      twoAgents.groups[0].agents[0] === "Googlebot" &&
      twoAgents.groups[0].agents[1] === "Bingbot" &&
      twoAgents.groups[1].agents[0] === "*",
    `groups: ${JSON.stringify(twoAgents.groups.map((group) => group.agents))}`,
  );

  const withBom = parseRobotsText("\uFEFFUser-agent: *\nDisallow: /admin\n");

  check(
    "robots-canli: BOM faylin birinci direktivini udmur",
    withBom.groups.length === 1 &&
      withBom.groups[0].agents[0] === "*" &&
      withBom.unknown.length === 0,
    `groups: ${withBom.groups.length}, unknown: ${JSON.stringify(withBom.unknown)}`,
  );

  const withUnknown = parseRobotsText(
    ["User-agent: *", "Dissalow: /admin", "Crawl-delay: 10", "Host: sayt.com"].join("\n"),
  );

  check(
    "robots-canli: taninmayan direktiv unknown-a dusur, qayda sayilmir",
    withUnknown.groups[0].rules.length === 0 &&
      withUnknown.unknown.length === 2 &&
      withUnknown.unknown[0].line === 2 &&
      withUnknown.groups[0].crawlDelay === 10,
    `rules: ${withUnknown.groups[0]?.rules.length}, unknown: ${JSON.stringify(withUnknown.unknown)}`,
  );

  const commented = parseRobotsText("User-agent: *  # hamiya\nDisallow: /admin # panel\n");

  check(
    "robots-canli: '#' serhi direktivin deyerinden kesilir",
    commented.groups[0].agents[0] === "*" && commented.groups[0].rules[0].path === "/admin",
    `agent: ${commented.groups[0]?.agents[0]}, path: ${commented.groups[0]?.rules[0]?.path}`,
  );

  /* ---------- precedence, on top of the matcher imported from robots.ts ---------- */

  const adminDoc = parseRobotsText("User-agent: *\nDisallow: /admin\n");

  check(
    "robots-canli: Disallow: /admin yolu /admin/x ucun qalib gelir",
    (() => {
      const [verdict] = testPaths(adminDoc, "*", ["/admin/x"]);
      return verdict.allowed === false && verdict.rule?.line === 2 && verdict.rule?.path === "/admin";
    })(),
    `verdict: ${JSON.stringify(testPaths(adminDoc, "*", ["/admin/x"]))}`,
  );

  const longerAllow = parseRobotsText("User-agent: *\nDisallow: /admin\nAllow: /admin/acik\n");

  check(
    "robots-canli: daha uzun Allow qisa Disallow-u ustelesir",
    (() => {
      const [verdict] = testPaths(longerAllow, "*", ["/admin/acik/x"]);
      return verdict.allowed === true && verdict.rule?.line === 3;
    })(),
    `verdict: ${JSON.stringify(testPaths(longerAllow, "*", ["/admin/acik/x"]))}`,
  );

  const pdfDoc = parseRobotsText("User-agent: *\nDisallow: /*.pdf$\n");
  const pdfVerdicts = testPaths(pdfDoc, "*", ["/senedler/hesabat.pdf", "/senedler/hesabat.pdf.html"]);

  check(
    "robots-canli: /*.pdf$ sonluq jokeri isleyir",
    pdfVerdicts[0].allowed === false && pdfVerdicts[1].allowed === true,
    `verdicts: ${JSON.stringify(pdfVerdicts.map((verdict) => verdict.allowed))}`,
  );

  const emptyDisallow = parseRobotsText("User-agent: *\nDisallow:\n");
  const emptyVerdict = testPaths(emptyDisallow, "*", ["/istenilen/yol"])[0];

  check(
    "robots-canli: bos Disallow her seye icaze demekdir",
    emptyVerdict.allowed === true && emptyVerdict.rule === null,
    `verdict: ${JSON.stringify(emptyVerdict)}`,
  );

  /* A named bot reads only its own group - the `*` group is a fallback for
     bots nobody wrote a group for, not an extra layer on top of one. */
  const namedBot = parseRobotsText(
    ["User-agent: *", "Disallow: /gizli", "", "User-agent: Googlebot", "Allow: /"].join("\n"),
  );

  check(
    "robots-canli: adi cekilen bot '*' qrupunu miras almir",
    testPaths(namedBot, "Googlebot", ["/gizli"])[0].allowed === true &&
      testPaths(namedBot, "Bingbot", ["/gizli"])[0].allowed === false,
    `google: ${JSON.stringify(testPaths(namedBot, "Googlebot", ["/gizli"])[0])}`,
  );

  check(
    "robots-canli: agent adi buyuk-kicik herfe hessas deyil",
    testPaths(namedBot, "googlebot", ["/gizli"])[0].allowed === true,
    `verdict: ${JSON.stringify(testPaths(namedBot, "googlebot", ["/gizli"])[0])}`,
  );

  check(
    "robots-canli: yapisdirilan tam unvan yola qisaldilir",
    testPaths(adminDoc, "*", ["https://sayt.com/admin/x"])[0].path === "/admin/x",
    `path: ${testPaths(adminDoc, "*", ["https://sayt.com/admin/x"])[0].path}`,
  );

  /* ---------- auditing ---------- */

  const blockAll = parseRobotsText("User-agent: *\nDisallow: /\n");

  check(
    "robots-canli: 'Disallow: /' butun sayti baglayan xeta kimi verilir",
    auditRobots(blockAll, HEALTHY).some(
      (issue) => issue.severity === "xeta" && issue.line === 2 && issue.message.includes("bütün botlara"),
    ),
    `issues: ${JSON.stringify(auditRobots(blockAll, HEALTHY).map((issue) => [issue.severity, issue.line]))}`,
  );

  const relativeSitemap = parseRobotsText("User-agent: *\nDisallow: /admin\nSitemap: /sitemap.xml\n");

  check(
    "robots-canli: nisbi Sitemap unvani xetadir",
    auditRobots(relativeSitemap, HEALTHY).some(
      (issue) => issue.severity === "xeta" && issue.line === 3 && issue.message.includes("nisbi"),
    ),
    `issues: ${JSON.stringify(auditRobots(relativeSitemap, HEALTHY).map((issue) => [issue.severity, issue.message.slice(0, 30)]))}`,
  );

  check(
    "robots-canli: Sitemap setri yoxdursa melumat verilir",
    auditRobots(adminDoc, HEALTHY).some(
      (issue) => issue.severity === "melumat" && issue.message.includes("«Sitemap:» sətri yoxdur"),
    ),
    `issues: ${JSON.stringify(auditRobots(adminDoc, HEALTHY).map((issue) => issue.severity))}`,
  );

  const noGroups = parseRobotsText("Sitemap: https://sayt.com/sitemap.xml\n");

  check(
    "robots-canli: hec bir User-agent qrupu yoxdursa xeberdarliq verilir",
    auditRobots(noGroups, HEALTHY).some(
      (issue) => issue.severity === "xeberdarliq" && issue.message.includes("User-agent"),
    ),
    `issues: ${JSON.stringify(auditRobots(noGroups, HEALTHY).map((issue) => issue.severity))}`,
  );

  check(
    "robots-canli: 404 xeta yox, 'fayl yoxdur' melumatidir",
    (() => {
      const issues = auditRobots(parseRobotsText(""), { ...HEALTHY, status: 404, byteLength: 0 });
      return (
        issues.some((issue) => issue.severity === "melumat" && issue.message.includes("robots.txt yoxdur")) &&
        !issues.some((issue) => issue.severity === "xeta")
      );
    })(),
    `issues: ${JSON.stringify(auditRobots(parseRobotsText(""), { ...HEALTHY, status: 404, byteLength: 0 }).map((issue) => issue.severity))}`,
  );

  check(
    "robots-canli: text/plain olmayan cavab teleni adi ile deyir",
    auditRobots(adminDoc, { ...HEALTHY, contentType: "text/html; charset=utf-8" }).some(
      (issue) => issue.severity === "xeberdarliq" && issue.message.includes("HTML səhifə"),
    ),
    `issues: ${JSON.stringify(auditRobots(adminDoc, { ...HEALTHY, contentType: "text/html" }).map((issue) => issue.message.slice(0, 40)))}`,
  );

  check(
    "robots-canli: 500 KB-dan boyuk fayl xeta verir",
    auditRobots(adminDoc, { ...HEALTHY, byteLength: 600 * 1024 }).some(
      (issue) => issue.severity === "xeta" && issue.message.includes("500 KB"),
    ),
    `issues: ${JSON.stringify(auditRobots(adminDoc, { ...HEALTHY, byteLength: 600 * 1024 }).map((issue) => issue.severity))}`,
  );

  check(
    "robots-canli: BOM ve UTF-16 kodlasma ayrica bildirilir",
    auditRobots(adminDoc, { ...HEALTHY, text: "\uFEFFUser-agent: *" }).some(
      (issue) => issue.line === 1 && issue.message.includes("BOM"),
    ) &&
      auditRobots(adminDoc, { ...HEALTHY, text: "U\u0000s\u0000e\u0000r\u0000" }).some(
        (issue) => issue.severity === "xeta" && issue.message.includes("UTF-16"),
      ),
    `bom: ${JSON.stringify(auditRobots(adminDoc, { ...HEALTHY, text: "\uFEFFx" }).map((issue) => issue.message.slice(0, 20)))}`,
  );

  check(
    "robots-canli: Crawl-delay Google terefinden oxunmadigi bildirilir",
    auditRobots(parseRobotsText("User-agent: *\nCrawl-delay: 10\n"), HEALTHY).some(
      (issue) => issue.severity === "melumat" && issue.message.includes("Crawl-delay"),
    ),
    `issues: ${JSON.stringify(auditRobots(parseRobotsText("User-agent: *\nCrawl-delay: 10\n"), HEALTHY).map((issue) => issue.severity))}`,
  );

  check(
    "robots-canli: bot siyahisinda '*' ve adli botlar var",
    KNOWN_BOTS.some((bot) => bot.id === "*") &&
      KNOWN_BOTS.some((bot) => bot.id === "Googlebot") &&
      KNOWN_BOTS.every((bot) => bot.id.trim() !== "" && bot.label.trim() !== ""),
    `bots: ${JSON.stringify(KNOWN_BOTS.map((bot) => bot.id))}`,
  );
};
