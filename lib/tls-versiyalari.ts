/**
 * Reading four separate handshakes — one per TLS version — into one table and
 * one verdict.
 *
 * The route does four handshakes with `inspectTls`, one per version with
 * `minVersion`/`maxVersion` pinned to it, and hands each outcome here. The
 * interesting part is not the handshake itself, it is what a *failed* one
 * means: a server that refuses TLS 1.0 sends back a TCP reset or a TLS alert,
 * and that refusal is the expected, correct answer for this tool — not a
 * fault. A server that never answers at all (a timeout, a dropped
 * connection) is a different thing entirely: it might not support the
 * version, or the probe itself might just have been unlucky, and reporting
 * "unsupported" for that case would be a number this file did not actually
 * compute. `classifyFailure` is the line between the two.
 */
import type { ProbeFail, TlsResult } from "./socket-probe";

export const TLS_VERSIONS = ["TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"] as const;

export type TlsVersionId = (typeof TLS_VERSIONS)[number];

/** One line per version: when it was published, so the table needs no separate footnote. */
export const TLS_VERSION_LABELS: Record<TlsVersionId, string> = {
  TLSv1: "TLS 1.0 — 1999",
  "TLSv1.1": "TLS 1.1 — 2006",
  "TLSv1.2": "TLS 1.2 — 2008",
  "TLSv1.3": "TLS 1.3 — 2018",
};

/** The two versions every current guideline (PCI DSS, NIST, the major browsers) treats as retired. */
export const RISKY_VERSIONS: ReadonlySet<TlsVersionId> = new Set(["TLSv1", "TLSv1.1"]);

export type SupportVerdict = "supported" | "unsupported" | "unknown";

/*
 * Node error codes that only appear once a TLS handshake has actually begun
 * and the far end chose to reject the version — a clean, informative
 * refusal, not a network fault. Everything else (a timeout, a refused TCP
 * connection, a DNS failure) means the probe could not reach a verdict at
 * all, and is reported as such rather than guessed.
 */
const REFUSAL_CODES = new Set([
  "ECONNRESET",
  "EPIPE",
  "EPROTO",
  "ERR_SSL_UNSUPPORTED_PROTOCOL",
  "ERR_SSL_NO_PROTOCOLS_AVAILABLE",
  "ERR_SSL_VERSION_TOO_LOW",
  "ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION",
  "ERR_SSL_TLSV1_UNRECOGNIZED_NAME",
  "ERR_SSL_WRONG_VERSION_NUMBER",
]);

/** Pulls the Node error code out of `inspectTls`'s failure sentence, e.g. "... (ECONNRESET)." */
function codeFromMessage(message: string): string | null {
  const match = /\(([^)()]+)\)[.\s]*$/.exec(message);
  return match ? match[1] : null;
}

/**
 * Decides what a failed handshake actually tells us.
 *
 * Exported on its own because it is the one judgement call in this file that
 * is not arithmetic — a wrong entry in `REFUSAL_CODES` is a wrong verdict on
 * every version-support page this tool ever renders, so it is the thing the
 * check file pins down case by case.
 */
export function classifyFailure(message: string): SupportVerdict {
  const code = codeFromMessage(message);
  if (code !== null && REFUSAL_CODES.has(code)) return "unsupported";
  return "unknown";
}

export type TlsVersionRow = {
  version: TlsVersionId;
  label: string;
  risky: boolean;
  verdict: SupportVerdict;
  cipher: string | null;
  note: string | null;
};

/** Formats one outcome (a completed handshake or a failure) into a table row. */
export function buildRow(version: TlsVersionId, outcome: TlsResult | ProbeFail): TlsVersionRow {
  const risky = RISKY_VERSIONS.has(version);

  if (outcome.ok) {
    return {
      version,
      label: TLS_VERSION_LABELS[version],
      risky,
      verdict: "supported",
      cipher: outcome.cipher ? `${outcome.cipher.name} (${outcome.cipher.version})` : null,
      note: null,
    };
  }

  const verdict = classifyFailure(outcome.message);
  return {
    version,
    label: TLS_VERSION_LABELS[version],
    risky,
    verdict,
    cipher: null,
    note:
      verdict === "unknown"
        ? "Server bu cəhdə heç cavab vermədi — dəstəklənib-dəstəklənmədiyi bu sınaqdan bilinmir."
        : "Server bu versiyanı açıq şəkildə rədd etdi.",
  };
}

/**
 * One sentence for the top of the page, read before the table.
 *
 * Silence about a risky version is not an option here: if TLS 1.0 or 1.1
 * turned out supported, that is the first thing worth saying, ahead of
 * whatever the modern versions do.
 */
export function summarizeVerdict(rows: readonly TlsVersionRow[]): string {
  const riskySupported = rows.filter((row) => row.risky && row.verdict === "supported");
  const modernSupported = rows.filter((row) => !row.risky && row.verdict === "supported");
  const anyUnknown = rows.some((row) => row.verdict === "unknown");

  if (riskySupported.length > 0) {
    const names = riskySupported.map((row) => row.label).join(", ");
    return `Server köhnə protokolu da qəbul edir: ${names}. Bu, bağlantının zəif şifrələnmiş rejimə düşməsinə imkan verir.`;
  }
  if (modernSupported.length === rows.filter((row) => !row.risky).length && modernSupported.length > 0) {
    return anyUnknown
      ? "Yoxlanan versiyalardan dəstəklənənlər yalnız müasir TLS-dir, amma bəzi cəhd cavabsız qaldı."
      : "Server yalnız müasir TLS versiyalarını qəbul edir — köhnə protokol açıq deyil.";
  }
  if (modernSupported.length === 0 && riskySupported.length === 0) {
    return "Heç bir versiya bu sınaqda dəstəklənmiş kimi görünmədi — server bu cəhdlərin heç birinə TLS səviyyəsində cavab vermədi.";
  }
  return "Nəticə qarışıqdır — cədvələ bax: bəzi versiya dəstəklənir, bəzisi bu sınaqdan cavabsız qaldı.";
}

export type TlsVersionReport = {
  hostname: string;
  address: string;
  checkedAt: string;
  rows: TlsVersionRow[];
  hasRiskySupported: boolean;
  verdict: string;
};

/** Assembles the report from already-computed rows — the route owns fetching the four outcomes. */
export function buildVersionReport(hostname: string, address: string, rows: TlsVersionRow[]): TlsVersionReport {
  return {
    hostname,
    address,
    checkedAt: new Date().toISOString(),
    rows,
    hasRiskySupported: rows.some((row) => row.risky && row.verdict === "supported"),
    verdict: summarizeVerdict(rows),
  };
}
