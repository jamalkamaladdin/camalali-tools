/*
 * The wildcard-maska cases are chosen around the one distinction the whole
 * tool exists to draw: a subnet mask must be contiguous ones-then-zeros and a
 * wildcard mask does not have to be. So the cases cover the ordinary
 * round-trip (prefix -> mask -> prefix, at every one of the 33 prefixes), the
 * 32-bit sign trap at /0 and /32, the two boundary prefixes with their own
 * host-count rule, and the pair that only differ by which field they were
 * typed into: 255.0.255.0 (an invalid subnet mask) against 0.0.0.254 (a legal
 * non-contiguous wildcard with a known match count).
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildAclLines,
  convertMaskInput,
  formatIpv4,
  maskFormsFromPrefix,
  maskFromPrefix,
  parseSubnetMaskText,
} from "../lib/wildcard-maska";

export const checks: CheckSuite = (check) => {
  /* ---------- the ordinary case, all six forms at once ---------- */

  const slash24 = convertMaskInput("prefix", "/24");
  check(
    "wildcard-maska: /24 alti formani da dogru verir",
    slash24.ok &&
      slash24.contiguous &&
      slash24.forms.subnetMask === "255.255.255.0" &&
      slash24.forms.wildcardMask === "0.0.0.255" &&
      slash24.forms.hexMask === "0xffffff00" &&
      slash24.forms.binaryMask === "11111111.11111111.11111111.00000000" &&
      slash24.forms.totalHosts === 256 &&
      slash24.forms.usableHosts === 254,
    slash24.ok && slash24.contiguous ? `alindi ${JSON.stringify(slash24.forms)}` : JSON.stringify(slash24),
  );

  /* ---------- wildcard resolves back to the same prefix as its mask ---------- */

  const wildcard255 = convertMaskInput("wildcard-mask", "0.0.0.255");
  check(
    "wildcard-maska: wildcard 0.0.0.255 /24-e qayidir",
    wildcard255.ok && wildcard255.contiguous && wildcard255.forms.prefix === 24,
    `alindi ${JSON.stringify(wildcard255)}`,
  );

  /* ---------- the 32-bit sign trap at the two boundaries ---------- */

  check(
    "wildcard-maska: maskFromPrefix(32) menfi reqem kimi cixmir",
    formatIpv4(maskFromPrefix(32)) === "255.255.255.255",
    `alindi ${formatIpv4(maskFromPrefix(32))}`,
  );

  const slash0 = convertMaskInput("prefix", "/0");
  check(
    "wildcard-maska: /0 butun unvan fezasini tutur",
    slash0.ok &&
      slash0.contiguous &&
      slash0.forms.subnetMask === "0.0.0.0" &&
      slash0.forms.wildcardMask === "255.255.255.255" &&
      slash0.forms.totalHosts === 4294967296 &&
      slash0.forms.usableHosts === 4294967294,
    `alindi ${JSON.stringify(slash0)}`,
  );

  const slash32 = convertMaskInput("prefix", "/32");
  check(
    "wildcard-maska: /32 tek hostdur, mask 255.255.255.255",
    slash32.ok &&
      slash32.contiguous &&
      slash32.forms.subnetMask === "255.255.255.255" &&
      slash32.forms.totalHosts === 1 &&
      slash32.forms.usableHosts === 1,
    `alindi ${JSON.stringify(slash32)}`,
  );

  /* ---------- the /30 known-answer pair ---------- */

  const slash30 = convertMaskInput("subnet-mask", "255.255.255.252");
  check(
    "wildcard-maska: 255.255.255.252 /30-dur, 2 istifade edilebilen host",
    slash30.ok && slash30.contiguous && slash30.forms.prefix === 30 && slash30.forms.usableHosts === 2,
    `alindi ${JSON.stringify(slash30)}`,
  );

  /* ---------- the pair that only differ by which field they were typed into ---------- */

  const invalidMask = convertMaskInput("subnet-mask", "255.0.255.0");
  check(
    "wildcard-maska: 255.0.255.0 subnet maska seheler kimi xeta verir",
    invalidMask.ok === false,
    `alindi ${JSON.stringify(invalidMask)}`,
  );

  const nonContiguous = convertMaskInput("wildcard-mask", "0.0.0.254");
  check(
    "wildcard-maska: 0.0.0.254 qeyri-ardicil isaretlenir, prefiks verilmir, cut unvanlar",
    nonContiguous.ok &&
      !nonContiguous.contiguous &&
      !("forms" in nonContiguous) &&
      nonContiguous.matchedCount === 128 &&
      nonContiguous.sampleAddresses.length === 10 &&
      nonContiguous.sampleAddresses[0] === "0.0.0.0" &&
      nonContiguous.sampleAddresses.every((address) => Number(address.split(".")[3]) % 2 === 0),
    `alindi ${JSON.stringify(nonContiguous)}`,
  );

  /* ---------- round-trip across all 33 prefixes ---------- */

  let roundTripFailure: string | null = null;
  for (let prefix = 0; prefix <= 32; prefix++) {
    const forms = maskFormsFromPrefix(prefix);
    const parsedBack = parseSubnetMaskText(forms.subnetMask);
    if (!parsedBack.ok || parsedBack.prefix !== prefix) {
      roundTripFailure = `/${prefix} -> ${forms.subnetMask} -> ${JSON.stringify(parsedBack)}`;
      break;
    }
  }
  check(
    "wildcard-maska: prefiks -> maska -> prefiks butun 33 uzunluqda deyismir",
    roundTripFailure === null,
    roundTripFailure ?? "hamisi kecdi",
  );

  /* ---------- hex and binary agree with the same prefix ---------- */

  const hex = convertMaskInput("hex-mask", "0xffffff00");
  const binary = convertMaskInput("binary-mask", "11111111.11111111.11111111.00000000");
  check(
    "wildcard-maska: hex ve binary daxiledilmesi /24 ile uygun gelir",
    hex.ok && hex.contiguous && hex.forms.prefix === 24 && binary.ok && binary.contiguous && binary.forms.prefix === 24,
    `hex: ${JSON.stringify(hex)}, binary: ${JSON.stringify(binary)}`,
  );

  /* ---------- ACL line generation ---------- */

  const acl24 = buildAclLines("10.1.1.0", "0.0.0.255", 24, 10, 0);
  check(
    "wildcard-maska: cisco acl setri numuneye tam uygundur",
    acl24.ok && acl24.lines.ciscoAcl === "access-list 10 permit 10.1.1.0 0.0.0.255",
    `alindi ${JSON.stringify(acl24)}`,
  );

  const aclNonContiguous = buildAclLines("10.1.1.0", "0.0.0.254", null, 10, 0);
  check(
    "wildcard-maska: qeyri-ardicil wildcard-da cidr/iptables null-dur, acl setri qalir",
    aclNonContiguous.ok &&
      aclNonContiguous.lines.cidr === null &&
      aclNonContiguous.lines.iptables === null &&
      aclNonContiguous.lines.ciscoAcl === "access-list 10 permit 10.1.1.0 0.0.0.254",
    `alindi ${JSON.stringify(aclNonContiguous)}`,
  );

  /* ---------- malformed input returns an error rather than throwing ---------- */

  const malformed = convertMaskInput("hex-mask", "not-hex");
  check(
    "wildcard-maska: bozuq hex daxiledilmesi xeta qaytarir, atmir",
    malformed.ok === false,
    `alindi ${JSON.stringify(malformed)}`,
  );
};
