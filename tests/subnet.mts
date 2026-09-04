/*
 * The subnet tool answers questions people copy into firewall rules, so the
 * cases below are the ones a wrong edit would break quietly rather than
 * loudly: the 32-bit sign trap at the extremes of the address space, the two
 * prefixes where the "minus two" host rule does not apply, the boundaries of
 * the RFC 1918 blocks, and the RFC 5952 shortening rules for IPv6.
 */
import type { CheckSuite } from "./harness.mts";
import {
  analyseIpv4,
  analyseIpv6,
  classOf,
  compressIpv6,
  describeSubnet,
  expandIpv6,
  formatIpv4,
  maskFromPrefix,
  parseIpv4,
  parseIpv6,
  splitCidrText,
  splitSubnet,
  subnetReport,
} from "../lib/subnet";

function value(text: string): number {
  const parsed = parseIpv4(text);
  if (!parsed.ok) throw new Error(`test setup: ${text} — ${parsed.error}`);
  return parsed.value;
}

function ipv4(text: string, fallbackPrefix = 32) {
  const result = analyseIpv4(text, fallbackPrefix);
  return result.ok ? result.info : null;
}

export const checks: CheckSuite = (check) => {
  /* ---------- the ordinary case, every field at once ---------- */

  const home = ipv4("192.168.1.10/24");
  check(
    "subnet: 192.168.1.10/24 butun sahelerde duzgundur",
    home !== null &&
      formatIpv4(home.network) === "192.168.1.0" &&
      home.broadcast !== null &&
      formatIpv4(home.broadcast) === "192.168.1.255" &&
      formatIpv4(home.mask) === "255.255.255.0" &&
      formatIpv4(home.wildcard) === "0.0.0.255" &&
      home.firstHost !== null &&
      formatIpv4(home.firstHost) === "192.168.1.1" &&
      home.lastHost !== null &&
      formatIpv4(home.lastHost) === "192.168.1.254" &&
      home.totalAddresses === 256 &&
      home.usableHosts === 254,
    home === null
      ? "cidr parse olunmadi"
      : `alindi ${formatIpv4(home.network)} / ${home.broadcast === null ? "-" : formatIpv4(home.broadcast)} / ${home.usableHosts} host`,
  );

  /* ---------- the 32-bit sign trap ---------- */

  check(
    "subnet: 255.255.255.255 menfi reqem kimi cixmir",
    formatIpv4(value("255.255.255.255")) === "255.255.255.255",
    `alindi ${formatIpv4(value("255.255.255.255"))}`,
  );

  check(
    "subnet: /1 maskasi 128.0.0.0-dir",
    formatIpv4(maskFromPrefix(1)) === "128.0.0.0",
    `alindi ${formatIpv4(maskFromPrefix(1))}`,
  );

  const everything = describeSubnet(value("255.255.255.255"), 0);
  check(
    "subnet: /0 butun unvan fezasini tutur",
    formatIpv4(everything.mask) === "0.0.0.0" &&
      formatIpv4(everything.network) === "0.0.0.0" &&
      everything.broadcast !== null &&
      formatIpv4(everything.broadcast) === "255.255.255.255" &&
      everything.totalAddresses === 4294967296 &&
      everything.usableHosts === 4294967294,
    `alindi maska ${formatIpv4(everything.mask)}, sebeke ${formatIpv4(everything.network)}, say ${everything.totalAddresses}`,
  );

  /* ---------- the two prefixes with their own host rule ---------- */

  const single = describeSubnet(value("8.8.8.8"), 32);
  check(
    "subnet: /32 tek hostdur, broadcast yoxdur",
    single.broadcast === null &&
      single.totalAddresses === 1 &&
      single.usableHosts === 1 &&
      single.firstHost === single.lastHost,
    `alindi ${single.totalAddresses} unvan, ${single.usableHosts} host, broadcast ${single.broadcast === null ? "yox" : "var"}`,
  );

  // RFC 3021: a /31 is a point-to-point link and both of its addresses are
  // usable — the "minus two" rule would report 0 hosts here.
  const pointToPoint = describeSubnet(value("192.0.2.0"), 31);
  check(
    "subnet: /31 RFC 3021 uzre 2 host verir",
    pointToPoint.broadcast === null &&
      pointToPoint.totalAddresses === 2 &&
      pointToPoint.usableHosts === 2 &&
      pointToPoint.firstHost !== null &&
      formatIpv4(pointToPoint.firstHost) === "192.0.2.0" &&
      pointToPoint.lastHost !== null &&
      formatIpv4(pointToPoint.lastHost) === "192.0.2.1",
    `alindi ${pointToPoint.usableHosts} host`,
  );

  check(
    "subnet: /30 hele de iki unvan itirir",
    describeSubnet(value("192.0.2.0"), 30).usableHosts === 2 &&
      describeSubnet(value("192.0.2.0"), 30).totalAddresses === 4,
    `alindi ${describeSubnet(value("192.0.2.0"), 30).usableHosts} host`,
  );

  /* ---------- RFC 1918 boundaries ---------- */

  const privateCases: [string, boolean][] = [
    ["9.255.255.255", false],
    ["10.0.0.0", true],
    ["10.255.255.255", true],
    ["11.0.0.0", false],
    ["172.15.255.255", false],
    ["172.16.0.0", true],
    ["172.31.255.255", true],
    ["172.32.0.0", false],
    ["192.167.255.255", false],
    ["192.168.0.0", true],
    ["192.168.255.255", true],
    ["192.169.0.0", false],
  ];
  const wrongPrivate = privateCases.filter(
    ([address, expected]) => describeSubnet(value(address), 32).scope.private !== expected,
  );
  check(
    "subnet: 10/8, 172.16/12, 192.168/16 serhedleri dogru sayilir",
    wrongPrivate.length === 0,
    `sehv tesnif edilenler: ${wrongPrivate.map(([a]) => a).join(", ")}`,
  );

  check(
    "subnet: 127.0.0.1 ve 169.254.1.1 sexsi sayilmir",
    describeSubnet(value("127.0.0.1"), 32).scope.private === false &&
      describeSubnet(value("169.254.1.1"), 32).scope.private === false &&
      describeSubnet(value("169.254.1.1"), 32).scope.reference === "RFC 3927",
    "loopback ve ya link-local sexsi kimi isaretlendi",
  );

  /* ---------- classful boundaries ---------- */

  const classCases: [string, string][] = [
    ["0.0.0.0", "A"],
    ["127.255.255.255", "A"],
    ["128.0.0.0", "B"],
    ["191.255.255.255", "B"],
    ["192.0.0.0", "C"],
    ["223.255.255.255", "C"],
    ["224.0.0.0", "D"],
    ["239.255.255.255", "D"],
    ["240.0.0.0", "E"],
    ["255.255.255.255", "E"],
  ];
  const wrongClass = classCases.filter(([address, expected]) => classOf(value(address)) !== expected);
  check(
    "subnet: sinif serhedleri A/B/C/D/E uzre dogrudur",
    wrongClass.length === 0,
    `sehv sinif: ${wrongClass.map(([a, e]) => `${a} ${e} gozlenilirdi, ${classOf(value(a))} alindi`).join("; ")}`,
  );

  /* ---------- rejected input ---------- */

  const badInputs = ["256.1.1.1", "192.168.1.1/33", "", "abc", "1.2.3", "1.2.3.4.5", "1.2.3.-4"];
  const accepted = badInputs.filter((text) => analyseIpv4(text, 24).ok);
  check(
    "subnet: yanlis girisler qebul edilmir",
    accepted.length === 0,
    `qebul edilenler: ${accepted.join(", ")}`,
  );

  // Leading zeros are the classic SSRF filter bypass: 0177.0.0.1 is 127.0.0.1
  // to a C library and 177.0.0.1 to JavaScript, so the tool refuses to guess.
  check(
    "subnet: sifirla baslayan oktet redd edilir",
    !parseIpv4("192.168.01.1").ok && !parseIpv4("0177.0.0.1").ok,
    "sekkizlik oxuna bilen oktet qebul edildi",
  );

  check(
    "subnet: 1e2 ve 12abc oktet kimi qebul edilmir",
    !parseIpv4("1e2.0.0.1").ok && !parseIpv4("12abc.0.0.1").ok,
    "reqem olmayan oktet qebul edildi",
  );

  /* ---------- splitting ---------- */

  const parent = ipv4("192.168.1.0/24");
  const quarters = parent === null ? null : splitSubnet(parent, 26);
  check(
    "subnet: /24 dord /26-ya bolunur ve cemi ana sebekeye beraberdir",
    parent !== null &&
      quarters !== null &&
      quarters.total === 4 &&
      quarters.parts.length === 4 &&
      quarters.parts.reduce((sum, part) => sum + part.usableHosts + 2, 0) === parent.totalAddresses &&
      quarters.parts[0].network === parent.network &&
      quarters.parts[3].broadcast === parent.broadcast &&
      quarters.parts[1].cidr === "192.168.1.64/26",
    quarters === null ? "ana sebeke parse olunmadi" : `alindi ${quarters.total} altsebeke`,
  );

  const wide = splitSubnet(describeSubnet(0, 0), 1);
  check(
    "subnet: /0 iki /1-e bolunende ikinci hisse 128.0.0.0-dir",
    wide.total === 2 && formatIpv4(wide.parts[1].network) === "128.0.0.0",
    `alindi ${wide.parts.length > 1 ? formatIpv4(wide.parts[1].network) : "-"}`,
  );

  const huge = splitSubnet(describeSubnet(value("10.0.0.0"), 8), 24);
  check(
    "subnet: cox boyuk bolme kesilir, amma cemi dogru sayilir",
    huge.total === 65536 && huge.truncated && huge.parts.length === 128,
    `alindi cem ${huge.total}, gosterilen ${huge.parts.length}`,
  );

  /* ---------- text splitting for the widget ---------- */

  check(
    "subnet: cidr metni unvan ve prefiksa ayrilir",
    splitCidrText("10.0.0.1/8").prefix === 8 &&
      splitCidrText("10.0.0.1/8").address === "10.0.0.1" &&
      splitCidrText("10.0.0.1").prefix === null,
    "cidr metni duzgun ayrilmadi",
  );

  check(
    "subnet: prefikssiz unvan slayderin prefiksini goturur",
    ipv4("10.1.2.3", 16)?.prefix === 16 && ipv4("10.1.2.3/28", 16)?.prefix === 28,
    "prefiks secimi yanlisdir",
  );

  /* ---------- the copied reading ---------- */

  const report = parent === null ? "" : subnetReport(parent);
  check(
    "subnet: kopyalanan metn panelde gorunen reqemlerle eynidir",
    report.includes("255.255.255.0") &&
      report.includes("192.168.1.1 – 192.168.1.254") &&
      report.includes("254"),
    `alindi ${JSON.stringify(report.slice(0, 80))}`,
  );

  const singleReport = subnetReport(describeSubnet(value("8.8.8.8"), 32));
  check(
    "subnet: /32 hesabatinda broadcast yoxdur deyilir",
    singleReport.includes("Broadcast: yoxdur"),
    `alindi ${JSON.stringify(singleReport)}`,
  );

  /* ---------- IPv6 ---------- */

  const loopback = parseIpv6("::1");
  check(
    "ipv6: ::1 tam formaya acilir",
    loopback.ok && expandIpv6(loopback.groups) === "0000:0000:0000:0000:0000:0000:0000:0001",
    loopback.ok ? `alindi ${expandIpv6(loopback.groups)}` : loopback.error,
  );

  // RFC 5952 section 4 uses exactly this address as its worked example.
  const rfc5952 = parseIpv6("2001:0db8:0000:0000:0000:ff00:0042:8329");
  check(
    "ipv6: RFC 5952 numunesi 2001:db8::ff00:42:8329 kimi qisalir",
    rfc5952.ok && compressIpv6(rfc5952.groups) === "2001:db8::ff00:42:8329",
    rfc5952.ok ? `alindi ${compressIpv6(rfc5952.groups)}` : rfc5952.error,
  );

  // RFC 5952 section 4.2.2: a single zero group is written as "0", never "::".
  const singleZero = parseIpv6("2001:db8:0:1:1:1:1:1");
  check(
    "ipv6: tek sifir qrupu :: ile evez edilmir",
    singleZero.ok && compressIpv6(singleZero.groups) === "2001:db8:0:1:1:1:1:1",
    singleZero.ok ? `alindi ${compressIpv6(singleZero.groups)}` : singleZero.error,
  );

  const allZero = parseIpv6("::");
  check(
    "ipv6: butun sifirlar :: kimi yazilir",
    allZero.ok &&
      compressIpv6(allZero.groups) === "::" &&
      expandIpv6(allZero.groups) === "0000:0000:0000:0000:0000:0000:0000:0000",
    allZero.ok ? `alindi ${compressIpv6(allZero.groups)}` : allZero.error,
  );

  const mapped = parseIpv6("::ffff:192.168.0.1");
  check(
    "ipv6: sondaki ipv4 iki qrupa cevrilir",
    mapped.ok && expandIpv6(mapped.groups) === "0000:0000:0000:0000:0000:ffff:c0a8:0001",
    mapped.ok ? `alindi ${expandIpv6(mapped.groups)}` : mapped.error,
  );

  check(
    "ipv6: zona identifikatoru ve kvadrat moterize atilir",
    parseIpv6("fe80::1%eth0").ok && parseIpv6("[2001:db8::1]").ok,
    "zona ve ya moterize ile unvan parse olunmadi",
  );

  const badIpv6 = ["2001::db8::1", "12345::1", "2001:db8:0:0:0:0:0:0:1", "192.168.1.1", ""];
  const acceptedIpv6 = badIpv6.filter((text) => parseIpv6(text).ok);
  check(
    "ipv6: yanlis girisler redd edilir",
    acceptedIpv6.length === 0,
    `qebul edilenler: ${acceptedIpv6.join(", ")}`,
  );

  const documentation = analyseIpv6("2001:db8::/32", 128);
  check(
    "ipv6: /32 prefiksi 2^96 unvan sayir",
    documentation.ok &&
      documentation.info.addressExponent === 96 &&
      documentation.info.addressCount === BigInt(2) ** BigInt(96) &&
      documentation.info.networkCompressed === "2001:db8::",
    documentation.ok ? `alindi 2^${documentation.info.addressExponent}` : documentation.error,
  );

  const halfMask = analyseIpv6("2001:db8:abcd:ef12::1/33", 128);
  check(
    "ipv6: qrup ortasindan kecen prefiks duzgun maskalanir",
    halfMask.ok && halfMask.info.networkCompressed === "2001:db8:8000::",
    halfMask.ok ? `alindi ${halfMask.info.networkCompressed}` : halfMask.error,
  );

  check(
    "ipv6: 128-den boyuk prefiks redd edilir",
    !analyseIpv6("2001:db8::1/129", 64).ok,
    "/129 qebul edildi",
  );
};
