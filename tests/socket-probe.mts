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
import type { CheckSuite } from "./harness.mts";
import { checkHostname, nameCoveredBy } from "../lib/socket-probe";

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
};
