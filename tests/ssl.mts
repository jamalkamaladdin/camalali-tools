/*
 * The SSL tool's readings, proven against constructed certificates rather
 * than a live server — a certificate that changes underneath a test (a
 * renewal, a reissue) would make the test flaky for a reason that has
 * nothing to do with whether the arithmetic is right.
 */
import type { CheckSuite } from "./harness.mts";
import {
  assessKey,
  buildSslReport,
  chainVerdict,
  expiryVerdict,
  nameVerdict,
  trustErrorMessage,
} from "../lib/ssl";
import type { CertificateInfo, TlsResult } from "../lib/socket-probe";

function cert(overrides: Partial<CertificateInfo> = {}): CertificateInfo {
  return {
    subject: "CN=example.com",
    names: ["example.com"],
    issuer: "CN=Test CA",
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: "2027-01-01T00:00:00.000Z",
    daysLeft: 90,
    serialNumber: "01",
    fingerprint256: "AA:BB",
    signatureAlgorithm: null,
    keyBits: 2048,
    isCa: false,
    ...overrides,
  };
}

export const checks: CheckSuite = (check) => {
  /* ---- expiry ---- */

  {
    const verdict = expiryVerdict(0);
    check(
      "ssl: bu gün biten sertifikat 0 gun ve xeberdarliq tonu",
      verdict.tone === "warning" && verdict.message.includes("bu gün"),
      `alindi tone=${verdict.tone} message=${verdict.message}`,
    );
  }

  check("ssl: 29 gun qalanda xeberdarliq", expiryVerdict(29).tone === "warning", `alindi ${expiryVerdict(29).tone}`);
  check("ssl: 30 gun qalanda defolt ton", expiryVerdict(30).tone === "default", `alindi ${expiryVerdict(30).tone}`);

  {
    const verdict = expiryVerdict(-3);
    check(
      "ssl: menfi gun bitmis sertifikat kimi oxunur",
      verdict.tone === "warning" && verdict.message.includes("3 gün əvvəl"),
      `alindi ${verdict.message}`,
    );
  }

  /* ---- chain ---- */

  check(
    "ssl: tek sertifikat araliq yoxdur kimi isarelenir",
    !chainVerdict([cert()]).hasIntermediate && chainVerdict([cert()]).message.includes("aralıq"),
    `alindi ${chainVerdict([cert()]).message}`,
  );

  check(
    "ssl: iki sertifikatli zencir araliq var kimi isarelenir",
    chainVerdict([cert(), cert({ isCa: true })]).hasIntermediate,
    "araliq tapilmadi",
  );

  /* ---- name coverage ---- */

  check(
    "ssl: uygun gelen ad tesdiqlenir",
    nameVerdict("example.com", true, ["example.com"]).matches,
    "uygunluq tapilmadi",
  );

  check(
    "ssl: uygun gelmeyen ad SAN siyahisi ile birlikde bildirilir",
    !nameVerdict("other.com", false, ["example.com"]).matches &&
      nameVerdict("other.com", false, ["example.com"]).message.includes("example.com"),
    `alindi ${nameVerdict("other.com", false, ["example.com"]).message}`,
  );

  /* ---- key strength ---- */

  check(
    "ssl: RSA 1024 zeif, RSA 2048 zeif deyil",
    assessKey(1024, null).weak && !assessKey(2048, null).weak,
    `alindi 1024=${assessKey(1024, null).weak} 2048=${assessKey(2048, null).weak}`,
  );

  check(
    "ssl: EC 256 bit zeif deyil, EC 112 bit zeifdir",
    !assessKey(256, "prime256v1").weak && assessKey(112, "secp112r1").weak,
    `alindi 256=${assessKey(256, "prime256v1").weak} 112=${assessKey(112, "secp112r1").weak}`,
  );

  check(
    "ssl: acar olcusu bilinmeyende zeif iddia edilmir",
    !assessKey(null, null).weak && assessKey(null, null).message.length > 0,
    `alindi ${JSON.stringify(assessKey(null, null))}`,
  );

  /* ---- trust error translation ---- */

  check(
    "ssl: taninan OpenSSL kodu cumleye cevrilir",
    trustErrorMessage("DEPTH_ZERO_SELF_SIGNED_CERT").includes("özü-özünü imzalayıb"),
    `alindi ${trustErrorMessage("DEPTH_ZERO_SELF_SIGNED_CERT")}`,
  );

  check(
    "ssl: taninmayan kod oldugu kimi gosterilir, bos deyil",
    trustErrorMessage("Error: SOME_UNKNOWN_CODE") === "SOME_UNKNOWN_CODE" &&
      trustErrorMessage(null) === "Naməlum səbəb.",
    `alindi ${trustErrorMessage("Error: SOME_UNKNOWN_CODE")} / ${trustErrorMessage(null)}`,
  );

  /* ---- assembled report ---- */

  {
    const tls: TlsResult = {
      ok: true,
      address: "93.184.216.34",
      port: 443,
      protocol: "TLSv1.3",
      cipher: { name: "TLS_AES_128_GCM_SHA256", version: "TLSv1.3" },
      trusted: false,
      trustError: "CERT_HAS_EXPIRED",
      chain: [cert({ daysLeft: -1 })],
      nameMatches: true,
      ms: 42,
    };
    const report = buildSslReport("example.com", tls);
    check(
      "ssl: buildSslReport butun hissesleri bir-birine baglayir, atmir",
      report.expiry.daysLeft === -1 &&
        report.expiry.tone === "warning" &&
        !report.chainInfo.hasIntermediate &&
        report.trustMessage.includes("bitib") &&
        report.key.bits === 2048,
      `alindi ${JSON.stringify({ expiry: report.expiry, trust: report.trustMessage, key: report.key })}`,
    );
  }
};
