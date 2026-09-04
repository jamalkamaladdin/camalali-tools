/*
 * What is worth checking here: the RFC 5952 canonical-shortening rules
 * (longest run wins, leftmost breaks a tie, a lone zero group is never
 * collapsed) since a wrong edit to that algorithm produces a plausible-
 * looking but non-canonical address rather than an obvious crash; the
 * expand-then-compress round trip, because the two directions are separate
 * functions and can silently drift apart; the RFC-named address classes at
 * their exact boundaries (::1, ::, an IPv4-mapped address both ways);
 * prefix arithmetic against the RFC 3849 documentation range, where the
 * /64 count is the one named in the tool's own spec; a known-answer
 * `.ip6.arpa` name straight from RFC 3596 §2.5; a real containment case; and
 * four malformed inputs that must come back as `ok: false` rather than throw.
 */
import type { CheckSuite } from "./harness.mts";
import {
  analyseIpv6,
  compareContainment,
  compressGroups,
  expandGroups,
  formatAddressCount,
  parseIpv6Address,
} from "../lib/ipv6";

function groupsOf(text: string): number[] {
  const parsed = parseIpv6Address(text);
  if (!parsed.ok) throw new Error(`test setup: ${text} — ${parsed.error}`);
  return parsed.groups;
}

export const checks: CheckSuite = (check) => {
  const rfcExample = compressGroups(groupsOf("2001:0db8:0000:0000:0000:ff00:0042:8329"));
  check(
    "ipv6: the RFC 5952 worked example compresses to its documented form",
    rfcExample === "2001:db8::ff00:42:8329",
    `got: ${rfcExample}`,
  );

  const tie = compressGroups(groupsOf("2001:db8:0:0:1:0:0:1"));
  check(
    "ipv6: two equal-length zero runs collapse the leftmost one, not the rightmost",
    tie === "2001:db8::1:0:0:1",
    `got: ${tie}`,
  );

  const singleZero = compressGroups(groupsOf("2001:db8:0:1:1:1:1:1"));
  check(
    "ipv6: a lone zero group is never collapsed to ::",
    singleZero === "2001:db8:0:1:1:1:1:1" && !singleZero.includes("::"),
    `got: ${singleZero}`,
  );

  const original = groupsOf("2001:db8::ff00:42:8329");
  const roundTrip = compressGroups(groupsOf(expandGroups(original)));
  check(
    "ipv6: expanding an address and compressing it again reproduces the same canonical form",
    roundTrip === compressGroups(original),
    `got: ${roundTrip}, expected: ${compressGroups(original)}`,
  );

  const loopback = analyseIpv6("::1");
  const unspecified = analyseIpv6("::");
  check(
    "ipv6: ::1 classifies as loopback and :: as unspecified",
    loopback.ok && loopback.info.kind === "loopback" && unspecified.ok && unspecified.info.kind === "unspecified",
    `loopback: ${JSON.stringify(loopback)}, unspecified: ${JSON.stringify(unspecified)}`,
  );

  const mappedIn = analyseIpv6("::ffff:192.168.1.1");
  const mappedFromBareIpv4 = analyseIpv6("192.168.1.1");
  check(
    "ipv6: an ::ffff: address round-trips to its dotted IPv4, and a bare IPv4 maps back to ::ffff:",
    mappedIn.ok &&
      mappedIn.info.kind === "ipv4-mapped" &&
      mappedIn.info.ipv4Embedded === "192.168.1.1" &&
      mappedFromBareIpv4.ok &&
      mappedFromBareIpv4.info.mappedFromIpv4 &&
      mappedFromBareIpv4.info.ipv4Embedded === "192.168.1.1",
    `mapped: ${JSON.stringify(mappedIn)}, bare: ${JSON.stringify(mappedFromBareIpv4)}`,
  );

  const prefix64 = analyseIpv6("2001:db8::/64");
  const count64 = formatAddressCount(64);
  check(
    "ipv6: a /64 prefix's network, last address and exact address count are all correct",
    prefix64.ok &&
      prefix64.info.prefixInfo !== null &&
      prefix64.info.prefixInfo.networkCompressed === "2001:db8::" &&
      prefix64.info.prefixInfo.lastCompressed === "2001:db8::ffff:ffff:ffff:ffff" &&
      count64.exact === "18 446 744 073 709 551 616",
    `got: ${JSON.stringify(prefix64)}, count: ${JSON.stringify(count64)}`,
  );

  const reverseDns = analyseIpv6("4321:0:1:2:3:4:567:89ab");
  check(
    "ipv6: the .ip6.arpa reverse name matches the RFC 3596 §2.5 worked example",
    reverseDns.ok &&
      reverseDns.info.reverseDns ===
        "b.a.9.8.7.6.5.0.4.0.0.0.3.0.0.0.2.0.0.0.1.0.0.0.0.0.0.0.1.2.3.4.ip6.arpa.",
    `got: ${reverseDns.ok ? reverseDns.info.reverseDns : reverseDns.error}`,
  );

  const containment = compareContainment("2001:db8::/32", "2001:db8:1::/48");
  check(
    "ipv6: 2001:db8:1::/48 is correctly reported as contained in 2001:db8::/32",
    containment.ok && containment.relation === "a-contains-b",
    `got: ${JSON.stringify(containment)}`,
  );

  const disjoint = compareContainment("2001:db8::/32", "2001:db9::/32");
  check(
    "ipv6: two prefixes that share no network report as disjoint with a diverge bit set",
    disjoint.ok && disjoint.relation === "disjoint" && disjoint.divergeBit !== null,
    `got: ${JSON.stringify(disjoint)}`,
  );

  const twoDoubleColons = parseIpv6Address("2001:db8::1::2");
  check(
    "ipv6: an address with two :: comes back as an error, not a thrown exception",
    twoDoubleColons.ok === false && twoDoubleColons.error.length > 0,
    `got: ${JSON.stringify(twoDoubleColons)}`,
  );

  const overlongGroup = parseIpv6Address("2001:db8:12345::1");
  check(
    "ipv6: a group of more than four hex digits comes back as an error, not a thrown exception",
    overlongGroup.ok === false && overlongGroup.error.length > 0,
    `got: ${JSON.stringify(overlongGroup)}`,
  );

  const badPrefix = analyseIpv6("2001:db8::/129");
  const badTail = analyseIpv6("::ffff:999.1.1.1");
  check(
    "ipv6: a prefix outside 0-128 and a malformed IPv4 tail both come back as errors, not thrown exceptions",
    badPrefix.ok === false && badPrefix.error.length > 0 && badTail.ok === false && badTail.error.length > 0,
    `prefix: ${JSON.stringify(badPrefix)}, tail: ${JSON.stringify(badTail)}`,
  );
};
