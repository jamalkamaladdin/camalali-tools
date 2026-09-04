/*
 * The TLS version tool's reading of a handshake outcome, proven offline.
 *
 * The one judgement call in this tool — whether a failed handshake means
 * "the server refused this version" or "the probe could not tell" — is
 * exactly what a live run cannot pin down (the network only ever hands back
 * one outcome per run), so every case here is built from a constructed
 * message string instead.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildRow,
  buildVersionReport,
  classifyFailure,
  RISKY_VERSIONS,
  summarizeVerdict,
  TLS_VERSIONS,
  type TlsVersionRow,
} from "../lib/tls-versiyalari";
import type { ProbeFail, TlsResult } from "../lib/socket-probe";

function ok(cipherName = "TLS_AES_128_GCM_SHA256"): TlsResult {
  return {
    ok: true,
    address: "93.184.216.34",
    port: 443,
    protocol: "TLSv1.3",
    cipher: { name: cipherName, version: "TLSv1.3" },
    trusted: true,
    trustError: null,
    chain: [],
    nameMatches: true,
    ms: 12,
  };
}

function fail(message: string): ProbeFail {
  return { ok: false, message, status: 502 };
}

export const checks: CheckSuite = (check) => {
  /* ---- classifying a failure ---- */

  check(
    "tls-versiyalari: ECONNRESET protokol seviyyesinde redd kimi oxunur",
    classifyFailure("TLS əlaqəsi qurulmadı (ECONNRESET).") === "unsupported",
    `alindi ${classifyFailure("TLS əlaqəsi qurulmadı (ECONNRESET).")}`,
  );

  check(
    "tls-versiyalari: ETIMEDOUT nomelum kimi qalir, redd sayilmir",
    classifyFailure("TLS əlaqəsi qurulmadı (ETIMEDOUT).") === "unknown",
    `alindi ${classifyFailure("TLS əlaqəsi qurulmadı (ETIMEDOUT).")}`,
  );

  check(
    "tls-versiyalari: mötərizəsiz vaxt bitmesi mesaji da nomelum sayilir",
    classifyFailure("example.com TLS əlsıxmasını vaxtında tamamlamadı.") === "unknown",
    `alindi ${classifyFailure("example.com TLS əlsıxmasını vaxtında tamamlamadı.")}`,
  );

  /* ---- building a row ---- */

  check(
    "tls-versiyalari: uğurlu elsixma desteklenir kimi qeyd olunur, sifr formatlanir",
    buildRow("TLSv1.3", ok()).verdict === "supported" &&
      buildRow("TLSv1.3", ok()).cipher === "TLS_AES_128_GCM_SHA256 (TLSv1.3)",
    `alindi ${JSON.stringify(buildRow("TLSv1.3", ok()))}`,
  );

  check(
    "tls-versiyalari: redd kodu ile basarisizliq desteklenmir sayilir",
    buildRow("TLSv1", fail("TLS əlaqəsi qurulmadı (ECONNRESET).")).verdict === "unsupported",
    `alindi ${buildRow("TLSv1", fail("TLS əlaqəsi qurulmadı (ECONNRESET).")).verdict}`,
  );

  check(
    "tls-versiyalari: naməlum kodlu basarisizliq nomelum sayilir, fergli qeyd dasiyir",
    buildRow("TLSv1", fail("TLS əlaqəsi qurulmadı (ETIMEDOUT).")).verdict === "unknown" &&
      buildRow("TLSv1", fail("TLS əlaqəsi qurulmadı (ETIMEDOUT).")).note !==
        buildRow("TLSv1", fail("TLS əlaqəsi qurulmadı (ECONNRESET).")).note,
    "iki hal eyni qeydi dasiyir",
  );

  /* ---- taxonomy ---- */

  check(
    "tls-versiyalari: 1.0 ve 1.1 riskli, 1.2 ve 1.3 riskli deyil",
    RISKY_VERSIONS.has("TLSv1") &&
      RISKY_VERSIONS.has("TLSv1.1") &&
      !RISKY_VERSIONS.has("TLSv1.2") &&
      !RISKY_VERSIONS.has("TLSv1.3"),
    `alindi ${[...RISKY_VERSIONS].join(",")}`,
  );

  check(
    "tls-versiyalari: versiya sirasi kohnedn yeniye",
    TLS_VERSIONS.join(",") === "TLSv1,TLSv1.1,TLSv1.2,TLSv1.3",
    `alindi ${TLS_VERSIONS.join(",")}`,
  );

  /* ---- verdict sentence ---- */

  function row(version: TlsVersionRow["version"], verdict: TlsVersionRow["verdict"]): TlsVersionRow {
    return {
      version,
      label: version,
      risky: RISKY_VERSIONS.has(version),
      verdict,
      cipher: verdict === "supported" ? "TEST_CIPHER" : null,
      note: null,
    };
  }

  check(
    "tls-versiyalari: riskli versiya desteklenende hokm onu adla bildirir",
    summarizeVerdict([
      row("TLSv1", "supported"),
      row("TLSv1.1", "unsupported"),
      row("TLSv1.2", "supported"),
      row("TLSv1.3", "supported"),
    ]).includes("TLSv1"),
    `alindi ${summarizeVerdict([row("TLSv1", "supported"), row("TLSv1.1", "unsupported"), row("TLSv1.2", "supported"), row("TLSv1.3", "supported")])}`,
  );

  check(
    "tls-versiyalari: yalniz muasir versiyalar desteklenende musbet hokm",
    summarizeVerdict([
      row("TLSv1", "unsupported"),
      row("TLSv1.1", "unsupported"),
      row("TLSv1.2", "supported"),
      row("TLSv1.3", "supported"),
    ]).includes("müasir"),
    "musbet hokm gorunmedi",
  );

  check(
    "tls-versiyalari: hec biri test edile bilmeyende yalan iddia edilmir",
    !summarizeVerdict([
      row("TLSv1", "unknown"),
      row("TLSv1.1", "unknown"),
      row("TLSv1.2", "unknown"),
      row("TLSv1.3", "unknown"),
    ]).includes("müasir"),
    "test edilmeyen hal ucun yanlis musbet hokm verildi",
  );

  /* ---- assembled report ---- */

  check(
    "tls-versiyalari: hesabatda riskli-destekleme bayragi dogru qurulur",
    buildVersionReport("example.com", "93.184.216.34", [
      row("TLSv1", "supported"),
      row("TLSv1.1", "unsupported"),
      row("TLSv1.2", "supported"),
      row("TLSv1.3", "supported"),
    ]).hasRiskySupported === true,
    "riskli destekleme bayragi yanlis",
  );
};
