/*
 * What is worth checking here: every address kind named in the brief
 * classified correctly for both IPv4 and IPv6, a boundary right at the edge
 * of a range (the last address inside RFC 1918's /12 versus the first one
 * outside it), a malformed address rejected rather than misclassified, the
 * domain-vs-address input detector, and the forward-confirmation check that
 * decides whether a PTR record is trustworthy.
 */
import type { CheckSuite } from "./harness.mts";
import { classifyAddress, detectInputKind, isForwardConfirmed } from "../lib/ip";

export const checks: CheckSuite = (check) => {
  check(
    "ip: 10.0.0.1 is classified private (RFC 1918)",
    classifyAddress("10.0.0.1")?.kind === "private",
    `got: ${JSON.stringify(classifyAddress("10.0.0.1"))}`,
  );

  check(
    "ip: 127.0.0.1 is classified loopback",
    classifyAddress("127.0.0.1")?.kind === "loopback",
    `got: ${JSON.stringify(classifyAddress("127.0.0.1"))}`,
  );

  check(
    "ip: 100.64.0.1 is classified as carrier-grade NAT (RFC 6598), not private",
    classifyAddress("100.64.0.1")?.kind === "cgnat",
    `got: ${JSON.stringify(classifyAddress("100.64.0.1"))}`,
  );

  check(
    "ip: 169.254.0.1 is classified link-local",
    classifyAddress("169.254.0.1")?.kind === "link-local",
    `got: ${JSON.stringify(classifyAddress("169.254.0.1"))}`,
  );

  check(
    "ip: ::1 is classified loopback in IPv6",
    classifyAddress("::1")?.kind === "loopback" && classifyAddress("::1")?.version === "v6",
    `got: ${JSON.stringify(classifyAddress("::1"))}`,
  );

  check(
    "ip: 2001:db8::1 is classified as the IPv6 documentation block (RFC 3849)",
    classifyAddress("2001:db8::1")?.kind === "documentation",
    `got: ${JSON.stringify(classifyAddress("2001:db8::1"))}`,
  );

  check(
    "ip: fc00::1 is classified unique-local (IPv6 ULA), ff02::1 is classified multicast",
    classifyAddress("fc00::1")?.kind === "unique-local" && classifyAddress("ff02::1")?.kind === "multicast",
    `fc00: ${JSON.stringify(classifyAddress("fc00::1"))}, ff02: ${JSON.stringify(classifyAddress("ff02::1"))}`,
  );

  check(
    "ip: a plainly ordinary address (8.8.8.8, 2606:4700:4700::1111) is classified public",
    classifyAddress("8.8.8.8")?.kind === "public" && classifyAddress("2606:4700:4700::1111")?.kind === "public",
    `v4: ${JSON.stringify(classifyAddress("8.8.8.8"))}, v6: ${JSON.stringify(classifyAddress("2606:4700:4700::1111"))}`,
  );

  check(
    "ip: 172.31.255.255 (last address in 172.16.0.0/12) is private, 172.32.0.0 (first address outside it) is public",
    classifyAddress("172.31.255.255")?.kind === "private" && classifyAddress("172.32.0.0")?.kind === "public",
    `inside: ${JSON.stringify(classifyAddress("172.31.255.255"))}, outside: ${JSON.stringify(classifyAddress("172.32.0.0"))}`,
  );

  check(
    "ip: a malformed address (octet over 255) classifies as neither IPv4 nor IPv6 — null, not a guess",
    classifyAddress("999.1.1.1") === null,
    `got: ${JSON.stringify(classifyAddress("999.1.1.1"))}`,
  );

  check(
    "ip: input-kind detection tells an address, a domain and an empty string apart",
    detectInputKind("8.8.8.8") === "ipv4" &&
      detectInputKind("2001:db8::1") === "ipv6" &&
      detectInputKind("example.com") === "domain" &&
      detectInputKind("") === "invalid",
    `v4: ${detectInputKind("8.8.8.8")}, v6: ${detectInputKind("2001:db8::1")}, domain: ${detectInputKind("example.com")}, empty: ${detectInputKind("")}`,
  );

  check(
    "ip: forward confirmation is true when the target address appears (case-insensitively) among the forward-resolved addresses",
    isForwardConfirmed("2606:4700:4700::1111", ["2606:4700:4700::1111".toUpperCase()]) === true &&
      isForwardConfirmed("8.8.8.8", ["8.8.4.4"]) === false,
    `match: ${isForwardConfirmed("2606:4700:4700::1111", ["2606:4700:4700::1111".toUpperCase()])}, mismatch: ${isForwardConfirmed("8.8.8.8", ["8.8.4.4"])}`,
  );
};
