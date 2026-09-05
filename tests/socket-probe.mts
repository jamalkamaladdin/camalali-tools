/*
 * The one part of the socket layer that is pure arithmetic rather than a
 * connection: whether a certificate's names cover the host that was asked for.
 *
 * It is checked here because it is the rule everybody gets wrong in the same
 * direction — too permissively. A wildcard covering two labels, or a suffix
 * match with no dot boundary, both turn "the certificate is valid" into a
 * sentence the tool has no business printing. The cases below are the ones a
 * loosened comparison would let through silently.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { CheckSuite } from "./harness.mts";
import {
  checkHostname,
  nameCoveredBy,
  oneAddressPerFamily,
  probeAcrossFamilies,
  SECOND_FAMILY_DELAY_MS,
  type HostAddress,
  type ProbeFail,
} from "../lib/socket-probe";

/*
 * The dual-stack race, proved without a network.
 *
 * This is a regression test for a fault that was measured on the production
 * server and is invisible everywhere else: `resolveHost` returns the
 * resolver's own order, that order puts IPv6 first on every dual-stack host,
 * and the server's IPv6 route works only intermittently. Every tool that
 * opened its own socket took that first address and nothing else, so a healthy
 * site came back as a six-second timeout: camalali.com 6029 ms and nothing on
 * its first address, 32 ms and an answer on its first A record.
 *
 * `fetch` never showed it, because undici races the families. That is exactly
 * why the cases below cannot be written against a live host: the fault only
 * appears when one address is a black hole, which no real name reliably is.
 * So the dial is injected, the same way `spf-yoxlayici.mts` injects a
 * resolver, and the black hole is a timer that never resolves in time.
 *
 * `CheckSuite` is synchronous and `verify-tools.mts` calls it without
 * awaiting, so the races are run here at module load through top-level await
 * and only their verdicts reach the suite.
 */

const V6: HostAddress = { address: "2606:4700:3035::6815:1cd3", family: 6 };
const V4: HostAddress = { address: "104.21.28.211", family: 4 };
const V4_SECOND: HostAddress = { address: "172.67.28.211", family: 4 };

type Answer = { ok: true; from: string };

const TIMED_OUT: ProbeFail = { ok: false, message: "ilk unvan cavab vermedi", status: 502 };
const REFUSED: ProbeFail = { ok: false, message: "ikinci unvan reddedildi", status: 502 };

/** A dial that answers after `ms`. A black hole is simply a very large `ms`. */
function answersIn(ms: number, value: Answer | ProbeFail): Promise<Answer | ProbeFail> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

/** Records which addresses were actually dialled, which is half of what is being proved. */
function recorder() {
  const dialled: string[] = [];
  return {
    dialled,
    dial(plan: (target: HostAddress) => Promise<Answer | ProbeFail>) {
      return (target: HostAddress) => {
        dialled.push(target.address);
        return plan(target);
      };
    },
  };
}

/* 1. The fault itself: the first address is a black hole, the second answers. */
const blackHole = recorder();
const blackHoleStarted = performance.now();
const blackHoleOutcome = await probeAcrossFamilies(
  [V6, V4],
  blackHole.dial((target) =>
    target.family === 6 ? answersIn(4_000, TIMED_OUT) : answersIn(10, { ok: true, from: target.address }),
  ),
);
const blackHoleMs = Math.round(performance.now() - blackHoleStarted);

/* 2. A host that answers on its first address must never pay for a second connection. */
const healthy = recorder();
const healthyOutcome = await probeAcrossFamilies(
  [V6, V4],
  healthy.dial((target) => answersIn(5, { ok: true, from: target.address })),
);

/* 3. When neither family answers, the verdict is the FIRST address's failure:
      that is the address a client would have used, so it is the one to name. */
const bothDead = await probeAcrossFamilies(
  [V6, V4],
  (target) => (target.family === 6 ? answersIn(20, TIMED_OUT) : answersIn(5, REFUSED)),
  30,
);

/* 4. A slow but healthy first address still wins, even though the head start
      expired and the second family was dialled alongside it. */
const slowFirst = recorder();
const slowOutcome = await probeAcrossFamilies(
  [V6, V4],
  slowFirst.dial((target) =>
    target.family === 6 ? answersIn(60, { ok: true, from: target.address }) : answersIn(200, REFUSED),
  ),
  20,
);

/* 5. A single-family host dials once and does not wait out the head start. */
const singleFamily = recorder();
const singleStarted = performance.now();
const singleOutcome = await probeAcrossFamilies(
  [V4],
  singleFamily.dial((target) => answersIn(5, { ok: true, from: target.address })),
);
const singleMs = Math.round(performance.now() - singleStarted);

/* 6. Several A records are not several attempts: one per family, no more. */
const manyRecords = recorder();
await probeAcrossFamilies(
  [V6, V4, V4_SECOND],
  manyRecords.dial((target) =>
    target.family === 6 ? answersIn(4_000, TIMED_OUT) : answersIn(10, { ok: true, from: target.address }),
  ),
  20,
);

/* 7. Nothing to dial is a stated failure, not a crash. */
const noAddresses = await probeAcrossFamilies([], () => answersIn(1, { ok: true, from: "x" }));

/*
 * The routes themselves. A behaviour test cannot see a route reverting to the
 * resolver's first address, because the route is not importable outside Next;
 * these read the source instead, which is the cheapest thing that fails when
 * somebody puts the bug back.
 */
const ROUTES = ["ssl", "tls-versiyalari", "cavab-vaxti", "dns-propaqasiya", "sayt-hesabati"];
const routeSource = new Map<string, string>();
for (const slug of ROUTES) {
  routeSource.set(
    slug,
    readFileSync(join(import.meta.dirname, "..", "api", slug, "route.ts"), "utf8"),
  );
}

/** Only the code counts: a comment explaining the old bug is not the old bug. */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

export const checks: CheckSuite = (check) => {
  check(
    "socket-probe: an exact name matches",
    nameCoveredBy("camalali.com", ["camalali.com", "www.camalali.com"]),
    "exact match failed",
  );

  check(
    "socket-probe: the comparison ignores case on both sides",
    nameCoveredBy("CamalAli.COM", ["camalali.com"]) && nameCoveredBy("camalali.com", ["CAMALALI.COM"]),
    "case folding failed",
  );

  check(
    "socket-probe: a wildcard covers one label",
    nameCoveredBy("www.camalali.com", ["*.camalali.com"]),
    "single-label wildcard failed",
  );

  check(
    "socket-probe: a wildcard does NOT cover two labels",
    !nameCoveredBy("a.b.camalali.com", ["*.camalali.com"]),
    "two labels passed a single-label wildcard",
  );

  check(
    "socket-probe: a wildcard does NOT cover the bare domain",
    !nameCoveredBy("camalali.com", ["*.camalali.com"]),
    "bare domain matched its own wildcard",
  );

  check(
    "socket-probe: a suffix without a dot boundary is not a match",
    !nameCoveredBy("evilcamalali.com", ["*.camalali.com"]) &&
      !nameCoveredBy("notcamalali.com", ["camalali.com"]),
    "a suffix match passed",
  );

  check(
    "socket-probe: a wildcard in a position other than the leftmost label is not honoured",
    !nameCoveredBy("www.camalali.com", ["www.*.com"]),
    "a mid-label wildcard matched",
  );

  check(
    "socket-probe: an empty name list covers nothing",
    !nameCoveredBy("camalali.com", []),
    "empty list matched",
  );

  check(
    "socket-probe: one matching entry among several is enough",
    nameCoveredBy("cdn.camalali.com", ["camalali.com", "*.camalali.com", "other.example"]),
    "match among several failed",
  );

  /*
   * The name check that does no DNS. It exists because the mail tools ask a
   * resolver about a name rather than connecting to it, and requiring an
   * address record would have refused the mail-only domains they are for.
   */
  const good = checkHostname("  Camalali.COM.  ");
  check(
    "socket-probe: checkHostname trims, lower-cases and drops the root dot",
    good.ok && good.hostname === "camalali.com",
    `got: ${JSON.stringify(good)}`,
  );

  check(
    "socket-probe: checkHostname accepts a mail-only name without resolving it",
    checkHostname("mx-only.example.com").ok,
    "a name with no address record was refused",
  );

  for (const bad of ["", "   ", "http://a.com", "a.com/x", "a.com:443", "no-dot", "-lead.com", "a..b.com", "a b.com"]) {
    const verdict = checkHostname(bad);
    check(
      `socket-probe: checkHostname refuses ${JSON.stringify(bad)}`,
      !verdict.ok,
      `got: ${JSON.stringify(verdict)}`,
    );
  }

  check(
    "socket-probe: checkHostname refuses a name over 253 characters",
    !checkHostname(`${[..."abcdef"].map((c) => c.repeat(60)).join(".")}.com`).ok,
    "an over-long name passed",
  );

  check(
    "socket-probe: an IP address in the name list is compared literally",
    nameCoveredBy("93.184.216.34", ["93.184.216.34"]) && !nameCoveredBy("93.184.216.3", ["93.184.216.34"]),
    "literal address comparison failed",
  );

  /* The RFC 8305 connection attempt delay, pinned because every timing below
     is stated relative to it and undici uses the same number. */
  check(
    "socket-probe: the second family waits 250 ms and not longer",
    SECOND_FAMILY_DELAY_MS === 250,
    `got: ${SECOND_FAMILY_DELAY_MS}`,
  );

  check(
    "socket-probe: oneAddressPerFamily takes the first of each family in resolver order",
    JSON.stringify(oneAddressPerFamily([V6, V4, V4_SECOND])) === JSON.stringify([V6, V4]),
    `got: ${JSON.stringify(oneAddressPerFamily([V6, V4, V4_SECOND]))}`,
  );

  /*
   * The regression. Before the fix the first address was the only address, so
   * this case came back as a failure after the full probe deadline.
   */
  check(
    "socket-probe: a black-holed first address still yields an answer from the other family",
    blackHoleOutcome.ok && blackHoleOutcome.result.from === V4.address,
    `got: ${JSON.stringify(blackHoleOutcome)}`,
  );

  check(
    "socket-probe: the answer arrives in about the head start, not in the probe timeout",
    blackHoleMs < 1_000,
    `took ${blackHoleMs} ms, which is the timeout being waited out rather than raced`,
  );

  check(
    "socket-probe: the family that actually answered is the one reported",
    blackHoleOutcome.ok && blackHoleOutcome.family === 4 && blackHoleOutcome.address === V4.address,
    `got: ${JSON.stringify(blackHoleOutcome)}`,
  );

  check(
    "socket-probe: both families are dialled when the first goes quiet",
    blackHole.dialled.length === 2,
    `dialled: ${JSON.stringify(blackHole.dialled)}`,
  );

  check(
    "socket-probe: a host that answers on its first address is dialled once only",
    healthy.dialled.length === 1 && healthyOutcome.ok && healthyOutcome.family === 6,
    `dialled: ${JSON.stringify(healthy.dialled)}, got: ${JSON.stringify(healthyOutcome)}`,
  );

  check(
    "socket-probe: when neither family answers the first address's reason is the one reported",
    !bothDead.ok && bothDead.message === TIMED_OUT.message,
    `got: ${JSON.stringify(bothDead)}`,
  );

  check(
    "socket-probe: a slow but healthy first address still wins its own race",
    slowOutcome.ok && slowOutcome.family === 6 && slowFirst.dialled.length === 2,
    `got: ${JSON.stringify(slowOutcome)}, dialled: ${JSON.stringify(slowFirst.dialled)}`,
  );

  check(
    "socket-probe: a single-family host never waits out the head start",
    singleOutcome.ok && singleFamily.dialled.length === 1 && singleMs < SECOND_FAMILY_DELAY_MS,
    `took ${singleMs} ms, dialled: ${JSON.stringify(singleFamily.dialled)}`,
  );

  check(
    "socket-probe: a second A record is not a second attempt",
    manyRecords.dialled.length === 2 && !manyRecords.dialled.includes(V4_SECOND.address),
    `dialled: ${JSON.stringify(manyRecords.dialled)}`,
  );

  check(
    "socket-probe: an empty address list is refused rather than dialled",
    !noAddresses.ok && noAddresses.status === 400,
    `got: ${JSON.stringify(noAddresses)}`,
  );

  for (const slug of ROUTES) {
    const code = codeOf(routeSource.get(slug) ?? "");

    check(
      `socket-probe: /alet/${slug} does not hand the resolver's first address to a socket`,
      !/\.primary\b/.test(code),
      "the route reads `resolved.primary`, which is the IPv6-first bug this file exists to stop",
    );

    check(
      `socket-probe: /alet/${slug} reaches its host through the shared family race`,
      code.includes("probeAcrossFamilies"),
      "the route opens sockets without probeAcrossFamilies",
    );
  }
};
