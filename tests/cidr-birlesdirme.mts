/*
 * The range→CIDR splitter is the one piece of arithmetic in this tool a wrong
 * edit could break without any test noticing: the alignment/remaining-size
 * trade-off at its core has exactly one correct answer per input, and the
 * `2 ** (32 - prefix)` block-size formula exists specifically to dodge the
 * `<<`-by-32 wraparound that a "simplification" back to a shift would
 * reintroduce. The cases below are the known-answer pair, the two edges of
 * the address space, the sibling-vs-non-sibling merge distinction aggregation
 * depends on, and the four malformed-input shapes the widget must reject
 * without throwing.
 */
import type { CheckSuite } from "./harness.mts";
import {
  aggregate,
  cidrRange,
  convertCidrListToRange,
  convertRangeToCidr,
  exclude,
  formatCidr,
  formatIpv4,
  rangeToCidr,
  type CidrBlock,
} from "../lib/cidr-birlesdirme";

function list(blocks: CidrBlock[]): string {
  return blocks.map(formatCidr).join(" ");
}

function ip(text: string): number {
  const parts = text.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export const checks: CheckSuite = (check) => {
  /* ---------- the known-answer pair ---------- */

  const known = rangeToCidr(ip("192.168.1.5"), ip("192.168.1.130"));
  const expectedKnown = [
    "192.168.1.5/32",
    "192.168.1.6/31",
    "192.168.1.8/29",
    "192.168.1.16/28",
    "192.168.1.32/27",
    "192.168.1.64/26",
    "192.168.1.128/31",
    "192.168.1.130/32",
  ];
  check(
    "cidr-birlesdirme: 192.168.1.5-192.168.1.130 tanınan blok siyahısını verir",
    list(known) === expectedKnown.join(" "),
    `alındı: ${list(known)}`,
  );

  /* ---------- already a single aligned block ---------- */

  const aligned = rangeToCidr(ip("192.168.1.0"), ip("192.168.1.255"));
  check(
    "cidr-birlesdirme: aligned /24 aralığı tək blok verir",
    aligned.length === 1 && formatCidr(aligned[0]) === "192.168.1.0/24",
    `alındı: ${list(aligned)}`,
  );

  /* ---------- the two edges of the address space ---------- */

  const everything = rangeToCidr(ip("0.0.0.0"), ip("255.255.255.255"));
  check(
    "cidr-birlesdirme: 0.0.0.0-255.255.255.255 tek 0.0.0.0/0 verir",
    everything.length === 1 && formatCidr(everything[0]) === "0.0.0.0/0",
    `alındı: ${list(everything)}`,
  );

  const single = rangeToCidr(ip("10.0.0.5"), ip("10.0.0.5"));
  check(
    "cidr-birlesdirme: tek unvan araligi /32 verir",
    single.length === 1 && formatCidr(single[0]) === "10.0.0.5/32",
    `alındı: ${list(single)}`,
  );

  /* ---------- round-trip: range → CIDRs → range ---------- */

  const roundTripCases: [string, string][] = [
    ["192.168.1.5", "192.168.1.130"],
    ["10.0.0.0", "10.0.0.255"],
    ["0.0.0.0", "255.255.255.255"],
    ["172.16.5.9", "172.16.5.9"],
    ["203.0.113.12", "203.0.114.40"],
  ];
  const roundTripOk = roundTripCases.every(([startText, endText]) => {
    const blocks = rangeToCidr(ip(startText), ip(endText));
    const ranges = blocks.map(cidrRange);
    const first = Math.min(...ranges.map((r) => r.start));
    const last = Math.max(...ranges.map((r) => r.end));
    return first === ip(startText) && last === ip(endText);
  });
  check(
    "cidr-birlesdirme: range -> CIDR -> range ilk/son unvani saxlayir (5 hal)",
    roundTripOk,
    "biri veya bir necesi baslangic/son unvani deyisdi",
  );

  /* ---------- aggregation: sibling merge, non-sibling does not ---------- */

  const siblingMerge = aggregate("10.0.0.0/25\n10.0.0.128/25");
  const nonSiblingNoMerge = aggregate("10.0.0.128/25\n10.0.1.0/25");
  check(
    "cidr-birlesdirme: qonşu qardaş /25-lər /24-ə birləşir, qardaş olmayan /25-lər birləşmir",
    siblingMerge.ok &&
      siblingMerge.after.length === 1 &&
      formatCidr(siblingMerge.after[0]) === "10.0.0.0/24" &&
      nonSiblingNoMerge.ok &&
      nonSiblingNoMerge.after.length === 2,
    `sibling: ${siblingMerge.ok ? list(siblingMerge.after) : siblingMerge.error} · non-sibling: ${nonSiblingNoMerge.ok ? list(nonSiblingNoMerge.after) : nonSiblingNoMerge.error}`,
  );

  /* ---------- containment ---------- */

  const contained = aggregate("10.0.0.0/24\n10.0.0.16/28");
  check(
    "cidr-birlesdirme: /24 icindeki /28 atilir",
    contained.ok && contained.after.length === 1 && formatCidr(contained.after[0]) === "10.0.0.0/24",
    contained.ok ? `alındı: ${list(contained.after)}` : contained.error,
  );

  /* ---------- shift-by-32 boundary: /0 and /32 together ---------- */

  const boundary = aggregate("0.0.0.0/0\n10.0.0.5/32");
  check(
    "cidr-birlesdirme: /0 ve /32 eyni siyahida - /0 hamisini udur",
    boundary.ok && boundary.after.length === 1 && formatCidr(boundary.after[0]) === "0.0.0.0/0",
    boundary.ok ? `alındı: ${list(boundary.after)}` : boundary.error,
  );

  /* ---------- exclusion ---------- */

  const excluded = exclude("10.0.0.0/16", "10.0.1.0/24");
  const stillInside = excluded.ok
    ? excluded.result.some((block) => {
        const range = cidrRange(block);
        return ip("10.0.0.5") >= range.start && ip("10.0.0.5") <= range.end;
      })
    : false;
  const stillCoversTail = excluded.ok
    ? excluded.result.some((block) => {
        const range = cidrRange(block);
        return ip("10.0.255.5") >= range.start && ip("10.0.255.5") <= range.end;
      })
    : false;
  const excludedGone = excluded.ok
    ? !excluded.result.some((block) => {
        const range = cidrRange(block);
        return ip("10.0.1.5") >= range.start && ip("10.0.1.5") <= range.end;
      })
    : false;
  check(
    "cidr-birlesdirme: 10.0.0.0/16-dan 10.0.1.0/24 cixarilanda dogru aligned qaliq qalir",
    excluded.ok &&
      excluded.totalAddresses === 65536 - 256 &&
      stillInside &&
      stillCoversTail &&
      excludedGone,
    excluded.ok ? `${excluded.totalAddresses} ünvan, ${list(excluded.result)}` : excluded.error,
  );

  /* ---------- CIDR list → range ---------- */

  const toRange = convertCidrListToRange("10.0.0.0/24\n10.0.1.0/24");
  check(
    "cidr-birlesdirme: iki bitisik /24 -dan ilk/son/say dogru cixir",
    toRange.ok &&
      formatIpv4(toRange.first) === "10.0.0.0" &&
      formatIpv4(toRange.last) === "10.0.1.255" &&
      toRange.totalAddresses === 512 &&
      toRange.blockCount === 2,
    toRange.ok
      ? `${formatIpv4(toRange.first)}-${formatIpv4(toRange.last)}, ${toRange.totalAddresses}`
      : toRange.error,
  );

  /* ---------- malformed input: bad octet ---------- */

  const badOctet = convertRangeToCidr("10.0.0.999", "10.0.0.5");
  check(
    "cidr-birlesdirme: pis oktet at deyil, xeta qaytarir",
    badOctet.ok === false && typeof badOctet.error === "string" && badOctet.error.length > 0,
    badOctet.ok ? "xeta gozlenilirdi" : badOctet.error,
  );

  /* ---------- malformed input: reversed range ---------- */

  const reversed = convertRangeToCidr("10.0.0.10", "10.0.0.1");
  check(
    "cidr-birlesdirme: ters araliq (son evvel) xeta qaytarir",
    reversed.ok === false,
    reversed.ok ? "xeta gozlenilirdi" : reversed.error,
  );

  /* ---------- malformed input: mixed IPv4/IPv6 list ---------- */

  const mixed = aggregate("10.0.0.0/24\n2001:db8::/32");
  check(
    "cidr-birlesdirme: qarisiq IPv4/IPv6 siyahisi at deyil, xeta qaytarir",
    mixed.ok === false && typeof mixed.error === "string" && mixed.error.length > 0,
    mixed.ok ? "xeta gozlenilirdi" : mixed.error,
  );

  /* ---------- malformed input: over the entry limit ---------- */

  const tooMany = aggregate(Array.from({ length: 5001 }, (_, i) => `10.${i % 256}.0.0/32`).join("\n"));
  check(
    "cidr-birlesdirme: 5000-den cox setir limiti soyleyir, asilmir",
    tooMany.ok === false && typeof tooMany.error === "string" && tooMany.error.includes("5000"),
    tooMany.ok ? "xeta gozlenilirdi" : tooMany.error,
  );
};
