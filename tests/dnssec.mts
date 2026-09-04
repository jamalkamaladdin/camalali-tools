/*
 * The DNSSEC tool's arithmetic, proven without a resolver.
 *
 * Two things are checked here that are not obviously "logic": that
 * `SUPPORTED_RRTYPES` does not contain DS, DNSKEY or RRSIG, and that
 * `UNMEASURABLE_TYPES` names exactly those three. Both are measured facts
 * about Node's own `dns` module (confirmed against a running Node 24 before
 * this file was written — `resolve(host, "DS")` throws
 * `ERR_INVALID_ARG_VALUE`), written down here so a future Node release that
 * changes the supported list is caught by a failing test instead of by the
 * tool quietly claiming a number it cannot compute.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildDnssecReport,
  compareDelegation,
  normalizeNsName,
  parentZoneOf,
  SUPPORTED_RRTYPES,
  UNMEASURABLE_TYPES,
  unmeasurableExplanation,
  type DelegationResult,
} from "../lib/dnssec";

export const checks: CheckSuite = (check) => {
  /* ---- parent zone ---- */

  check("dnssec: iki hisseli domenin valideyni TLD-dir", parentZoneOf("example.com") === "com", `alindi ${parentZoneOf("example.com")}`);

  check("dnssec: tek hisseli addin valideyni yoxdur", parentZoneOf("com") === null, `alindi ${parentZoneOf("com")}`);

  check(
    "dnssec: alt-domenin valideyni bir seviyye yuxaridir, koke qeder deyil",
    parentZoneOf("a.b.example.com") === "b.example.com",
    `alindi ${parentZoneOf("a.b.example.com")}`,
  );

  /* ---- name normalisation ---- */

  check(
    "dnssec: NS adi kicik herfe salinir, sondaki noqte atilir",
    normalizeNsName("NS1.EXAMPLE.COM.") === "ns1.example.com",
    `alindi ${normalizeNsName("NS1.EXAMPLE.COM.")}`,
  );

  /* ---- delegation comparison ---- */

  {
    const result = compareDelegation(["ns1.example.com.", "ns2.example.com."], ["NS1.example.com", "NS2.example.com"]);
    check(
      "dnssec: boyuk-kicik herf ve sondaki noqte ferqi uygunlugu pozmur",
      result.consistent && result.matches.length === 2 && result.onlyChild.length === 0 && result.onlyParent.length === 0,
      `alindi ${JSON.stringify(result)}`,
    );
  }

  {
    const result = compareDelegation(["ns1.example.com"], ["ns2.example.com"]);
    check(
      "dnssec: uygunsuz siyahilar onlyChild ve onlyParent-i dogru doldurur",
      !result.consistent && result.onlyChild[0] === "ns1.example.com" && result.onlyParent[0] === "ns2.example.com",
      `alindi ${JSON.stringify(result)}`,
    );
  }

  check(
    "dnssec: bos siyahi hec vaxt uygun sayilmir",
    !compareDelegation([], []).consistent && !compareDelegation(["ns1.example.com"], []).consistent,
    "bos siyahi yanlisliqla uygun sayildi",
  );

  /* ---- the measured Node limitation ---- */

  check(
    "dnssec: destaklenen tip siyahisinda DS/DNSKEY/RRSIG yoxdur",
    !SUPPORTED_RRTYPES.includes("DS" as never) &&
      !SUPPORTED_RRTYPES.includes("DNSKEY" as never) &&
      !SUPPORTED_RRTYPES.includes("RRSIG" as never),
    `alindi ${SUPPORTED_RRTYPES.join(",")}`,
  );

  check(
    "dnssec: olculmeyen tipler tam olaraq DS, DNSKEY, RRSIG-dir",
    UNMEASURABLE_TYPES.join(",") === "DS,DNSKEY,RRSIG",
    `alindi ${UNMEASURABLE_TYPES.join(",")}`,
  );

  check(
    "dnssec: izah metni her uc tipi de adla cekir",
    UNMEASURABLE_TYPES.every((type) => unmeasurableExplanation().includes(type)),
    `alindi ${unmeasurableExplanation()}`,
  );

  /* ---- assembled report ---- */

  {
    const failing: DelegationResult = { ok: false, parentZone: "com", message: "test xetasi" };
    const report = buildDnssecReport("example.com", failing);
    check(
      "dnssec: basarisiz delegasiya netice obyektine atmadan yigilir",
      report.domain === "example.com" && report.unmeasurable.length === 3 && report.delegation.ok === false,
      `alindi ${JSON.stringify(report.delegation)}`,
    );
  }

  {
    const success: DelegationResult = {
      ok: true,
      parentZone: "com",
      parentNsHost: "a.gtld-servers.net",
      childNs: ["ns1.example.com"],
      parentNs: ["ns1.example.com"],
      matches: ["ns1.example.com"],
      onlyChild: [],
      onlyParent: [],
      consistent: true,
    };
    const report = buildDnssecReport("example.com", success);
    check(
      "dnssec: uygun delegasiya netice obyektinde consistent saxlanilir",
      report.delegation.ok === true && report.delegation.consistent === true,
      `alindi ${JSON.stringify(report.delegation)}`,
    );
  }
};
