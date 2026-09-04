/*
 * The redirect-chain reader, checked without a network.
 *
 * Every case below is a hand-built list of hops, which is the whole reason the
 * module takes one instead of doing its own fetching: a loop, a scheme
 * downgrade and a blown hop limit are all things that are miserable to arrange
 * against a real server and trivial to state as data.
 *
 * The shapes are not invented. `followRedirects` stops *before* re-walking an
 * address it has already seen, so a real loop arrives as a chain whose last
 * `Location` points back at an earlier hop with `truncated: true` - and that
 * shape is checked here beside the simpler duplicate-row one, because a reader
 * that only caught the second would never fire in production.
 */
import type { CheckSuite } from "./harness.mts";
import {
  auditChain,
  buildChain,
  countRedirects,
  describeStatus,
} from "../lib/yonlendirme-zenciri";

type RawHop = { url: string; status: number; location: string | null };

const hop = (url: string, status: number, location: string | null = null): RawHop => ({
  url,
  status,
  location,
});

export const checks: CheckSuite = (check) => {
  /* ---------- classification ---------- */

  check(
    "yonlendirme-zenciri: 301 daimi kimi tesnif olunur",
    describeStatus(301).kind === "daimi",
    `kind: ${describeStatus(301).kind}`,
  );

  check(
    "yonlendirme-zenciri: 308 de daimidir",
    describeStatus(308).kind === "daimi",
    `kind: ${describeStatus(308).kind}`,
  );

  check(
    "yonlendirme-zenciri: 302 muveqqeti kimi tesnif olunur",
    describeStatus(302).kind === "muveqqeti" &&
      describeStatus(303).kind === "muveqqeti" &&
      describeStatus(307).kind === "muveqqeti",
    `302/303/307: ${describeStatus(302).kind}, ${describeStatus(303).kind}, ${describeStatus(307).kind}`,
  );

  check(
    "yonlendirme-zenciri: 200 son kimi tesnif olunur",
    describeStatus(200).kind === "son",
    `kind: ${describeStatus(200).kind}`,
  );

  /* 304 is a 3xx by number and a cache answer by meaning - counting it as a
     redirect would put a hop in the chain that nobody travelled. */
  check(
    "yonlendirme-zenciri: 304 yonlendirme sayilmir",
    describeStatus(304).kind === "son",
    `kind: ${describeStatus(304).kind}`,
  );

  check(
    "yonlendirme-zenciri: 404 ve 503 xeta kimi tesnif olunur",
    describeStatus(404).kind === "xeta" && describeStatus(503).kind === "xeta",
    `404/503: ${describeStatus(404).kind}, ${describeStatus(503).kind}`,
  );

  /* An unlisted code still has to be described rather than dropped. */
  check(
    "yonlendirme-zenciri: cedvelde olmayan status oz sinfine dusur",
    describeStatus(451).kind === "xeta" && describeStatus(226).kind === "son",
    `451/226: ${describeStatus(451).kind}, ${describeStatus(226).kind}`,
  );

  /* ---------- building ---------- */

  const simple = buildChain([
    hop("https://a.com/", 301, "https://b.com/"),
    hop("https://b.com/", 200),
  ]);

  check(
    "yonlendirme-zenciri: buildChain unvanlari ve sirani saxlayir",
    simple.length === 2 &&
      simple[0].url === "https://a.com/" &&
      simple[1].url === "https://b.com/" &&
      simple[0].location === "https://b.com/",
    `steps: ${JSON.stringify(simple.map((step) => step.url))}`,
  );

  check(
    "yonlendirme-zenciri: countRedirects yalniz kocuren addimlari sayir",
    countRedirects(simple) === 1,
    `count: ${countRedirects(simple)}`,
  );

  check(
    "yonlendirme-zenciri: bos zencir cokmur",
    buildChain([]).length === 0 && auditChain([], false).length === 0,
    `issues: ${JSON.stringify(auditChain([], false))}`,
  );

  /* ---------- auditing ---------- */

  check(
    "yonlendirme-zenciri: tek yonlendirme xeberdarliq vermir",
    auditChain(simple, false).length === 0,
    `issues: ${JSON.stringify(auditChain(simple, false))}`,
  );

  const threeHops = buildChain([
    hop("https://a.com/", 301, "https://b.com/"),
    hop("https://b.com/", 301, "https://c.com/"),
    hop("https://c.com/", 200),
  ]);
  const threeHopIssues = auditChain(threeHops, false);

  check(
    "yonlendirme-zenciri: uc hoplu zencir xeberdarliq verir",
    threeHopIssues.some(
      (issue) => issue.severity === "xeberdarliq" && issue.message.includes("2 yönləndirmə"),
    ),
    `issues: ${JSON.stringify(threeHopIssues.map((issue) => issue.message))}`,
  );

  /* A duplicate row: the shape a chain assembled by hand can take. */
  const duplicated = buildChain([
    hop("https://a.com/", 301, "https://b.com/"),
    hop("https://b.com/", 301, "https://a.com/"),
    hop("https://a.com/", 301, "https://b.com/"),
  ]);

  check(
    "yonlendirme-zenciri: tekrarlanan unvan dovre kimi tapilir",
    auditChain(duplicated, true).some(
      (issue) => issue.severity === "xeta" && issue.message.startsWith("Dövrə"),
    ),
    `issues: ${JSON.stringify(auditChain(duplicated, true).map((issue) => issue.message))}`,
  );

  /* The shape `followRedirects` actually produces for a loop: it stops before
     repeating the address, so the evidence is the last hop's Location. */
  const loopedBack = buildChain([
    hop("https://a.com/", 301, "https://b.com/"),
    hop("https://b.com/", 301, "https://a.com/"),
  ]);

  check(
    "yonlendirme-zenciri: sonuncu Location geri qayidirsa da dovre tapilir",
    auditChain(loopedBack, true).some(
      (issue) => issue.severity === "xeta" && issue.message.startsWith("Dövrə"),
    ),
    `issues: ${JSON.stringify(auditChain(loopedBack, true).map((issue) => issue.message))}`,
  );

  /* Truncated with no repeated address is the hop limit, not a loop, and the
     two must not be reported as each other. */
  const overLimit = buildChain([
    hop("https://a.com/1", 301, "https://a.com/2"),
    hop("https://a.com/2", 301, "https://a.com/3"),
    hop("https://a.com/3", 301, "https://a.com/4"),
  ]);
  const overLimitIssues = auditChain(overLimit, true);

  check(
    "yonlendirme-zenciri: hop heddi kecildi dovreden ayrilir",
    overLimitIssues.some(
      (issue) => issue.severity === "xeta" && issue.message.startsWith("Hop həddi"),
    ) && !overLimitIssues.some((issue) => issue.message.startsWith("Dövrə")),
    `issues: ${JSON.stringify(overLimitIssues.map((issue) => issue.message))}`,
  );

  const downgraded = buildChain([
    hop("https://a.com/", 301, "http://a.com/"),
    hop("http://a.com/", 200),
  ]);

  check(
    "yonlendirme-zenciri: https-den http-ye enis xetadir",
    auditChain(downgraded, false).some(
      (issue) => issue.severity === "xeta" && issue.message.includes("https-dən http-yə"),
    ),
    `issues: ${JSON.stringify(auditChain(downgraded, false).map((issue) => issue.message))}`,
  );

  const temporary = buildChain([
    hop("https://a.com/kohne", 302, "https://a.com/yeni"),
    hop("https://a.com/yeni", 200),
  ]);

  check(
    "yonlendirme-zenciri: 302 daimi kocurme yerine islenibse xeberdarliq verilir",
    auditChain(temporary, false).some(
      (issue) => issue.severity === "xeberdarliq" && issue.message.includes("302"),
    ),
    `issues: ${JSON.stringify(auditChain(temporary, false).map((issue) => issue.message))}`,
  );

  /* http -> https -> www: two hops that each change exactly one thing. */
  const twoStep = buildChain([
    hop("http://sayt.com/", 301, "https://sayt.com/"),
    hop("https://sayt.com/", 301, "https://www.sayt.com/"),
    hop("https://www.sayt.com/", 200),
  ]);

  check(
    "yonlendirme-zenciri: sxem+domen iki addimda edilirse birlesdirme teklif olunur",
    auditChain(twoStep, false).some((issue) => issue.message.includes("bir işi ikiyə bölür")),
    `issues: ${JSON.stringify(auditChain(twoStep, false).map((issue) => issue.message))}`,
  );

  /* One hop that changes the scheme and the host together is already the fix,
     so it must not be reported as the thing it is the fix for. */
  const oneStep = buildChain([
    hop("http://sayt.com/", 301, "https://www.sayt.com/"),
    hop("https://www.sayt.com/", 200),
  ]);

  check(
    "yonlendirme-zenciri: birlesdirilmis tek addim xeberdarliq vermir",
    auditChain(oneStep, false).length === 0,
    `issues: ${JSON.stringify(auditChain(oneStep, false).map((issue) => issue.message))}`,
  );

  const brokenEnd = buildChain([
    hop("https://a.com/kohne", 301, "https://a.com/yeni"),
    hop("https://a.com/yeni", 404),
  ]);

  check(
    "yonlendirme-zenciri: son unvan 4xx olanda xeta verilir",
    auditChain(brokenEnd, false).some(
      (issue) => issue.severity === "xeta" && issue.message.includes("404"),
    ),
    `issues: ${JSON.stringify(auditChain(brokenEnd, false).map((issue) => issue.message))}`,
  );

  /* Step numbers are 1-based and are what the widget prints beside the row. */
  check(
    "yonlendirme-zenciri: xeta setiri 1-den baslayan addim nomresi dasiyir",
    auditChain(brokenEnd, false).every(
      (issue) => issue.step === null || (issue.step >= 1 && issue.step <= brokenEnd.length),
    ),
    `steps: ${JSON.stringify(auditChain(brokenEnd, false).map((issue) => issue.step))}`,
  );
};
