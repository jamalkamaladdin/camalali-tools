/**
 * Judgement on top of one TLS handshake: whether the certificate is worth
 * trusting, not just what it contains.
 *
 * `socket-probe.ts` already does the hard part — it opens the socket, walks
 * the chain and decides whether this machine's trust store accepts it. What
 * is missing is the visitor-facing reading of that data: how many days are
 * actually left, whether the missing intermediate is the reason a phone
 * would reject this while a desktop browser (which ships more roots) does
 * not, and what an OpenSSL verify code like DEPTH_ZERO_SELF_SIGNED_CERT
 * means in a sentence. None of that touches a socket, so it lives here where
 * `scripts/tools-checks/ssl.mts` can prove it against constructed
 * certificates instead of a live server that changes underneath the test.
 */
import type { CertificateInfo, TlsResult } from "./socket-probe";

/** Below this many days the expiry reading switches from informational to a warning. */
const EXPIRY_WARNING_DAYS = 30;

/** RSA/DSA convention: under this, a key is considered weak by every current guideline. */
const WEAK_RSA_BITS = 2048;

/** EC convention: P-224 (224 bits) is the smallest curve still recommended anywhere. */
const WEAK_EC_BITS = 224;

export type ExpiryTone = "default" | "warning";

export type ExpiryVerdict = {
  daysLeft: number;
  tone: ExpiryTone;
  message: string;
};

/**
 * Reads the days-left number the way a visitor needs it read, not just the
 * number itself. A certificate that expires today shows zero days, not one —
 * the boundary the check file pins down — because a same-day expiry and a
 * zero-day countdown are the same fact and only one phrasing is confusing.
 */
export function expiryVerdict(daysLeft: number): ExpiryVerdict {
  if (daysLeft < 0) {
    return {
      daysLeft,
      tone: "warning",
      message: `Sertifikatın müddəti ${Math.abs(daysLeft)} gün əvvəl bitib.`,
    };
  }
  if (daysLeft === 0) {
    return { daysLeft, tone: "warning", message: "Sertifikat bu gün bitir." };
  }
  if (daysLeft < EXPIRY_WARNING_DAYS) {
    return {
      daysLeft,
      tone: "warning",
      message: `Sertifikatın müddətinə ${daysLeft} gün qalıb — bu, ${EXPIRY_WARNING_DAYS} gündən azdır.`,
    };
  }
  return { daysLeft, tone: "default", message: `Sertifikatın müddətinə ${daysLeft} gün qalıb.` };
}

export type ChainVerdict = {
  hasIntermediate: boolean;
  message: string;
};

/**
 * The single most common misconfiguration this tool exists to catch: a server
 * that presents only its own leaf certificate and never sends the
 * intermediate that signed it.
 *
 * A browser usually hides the fault because it already cached or fetched the
 * intermediate through AIA chasing, so the site "works" in the browser that
 * was used to configure it and fails everywhere else — an older phone, a
 * command-line client, a payment gateway's server-to-server call.
 */
export function chainVerdict(chain: readonly CertificateInfo[]): ChainVerdict {
  const hasIntermediate = chain.length > 1;
  if (!hasIntermediate) {
    return {
      hasIntermediate,
      message:
        "Server yalnız öz sertifikatını göndərir — heç bir aralıq sertifikat yoxdur. Bu, ən çox rast gəlinən konfiqurasiya səhvidir: bəzi brauzer əvvəlcədən keşlədiyi üçün fərqinə varmır, amma köhnə cihaz və server-server bağlantısı sertifikatı rədd edə bilər.",
    };
  }
  const extra = chain.length - 1;
  return {
    hasIntermediate,
    message: `Server ${chain.length} sertifikat göndərir — leaf sertifikatdan başqa ${extra} aralıq/kök sertifikat.`,
  };
}

export type NameVerdict = {
  matches: boolean;
  message: string;
};

export function nameVerdict(hostname: string, matches: boolean, names: readonly string[]): NameVerdict {
  if (matches) {
    return { matches, message: `«${hostname}» sertifikatın əhatə etdiyi adlar arasındadır.` };
  }
  const list = names.length > 0 ? names.join(", ") : "heç bir ad tapılmadı";
  return {
    matches,
    message: `«${hostname}» sertifikatın SAN siyahısında yoxdur (siyahıda: ${list}) — brauzer bu sertifikatı bu ad üçün rədd edəcək.`,
  };
}

export type KeyAssessment = {
  bits: number | null;
  /** The EC curve name when the key is elliptic-curve, else null — RSA keys carry no curve. */
  curve: string | null;
  weak: boolean;
  message: string;
};

/**
 * Reads key size against the two conventions that actually exist: an RSA/DSA
 * key under 2048 bits and an EC key under 224 bits are both considered weak by
 * every current CA/Browser Forum guideline.
 *
 * `curve` is honestly named after what `socket-probe.ts` actually reports —
 * the field it fills is `nistCurve`, which Node only populates for EC keys —
 * so its presence, not a separately parsed OID, is what tells RSA and EC
 * apart here. Node exposes no direct read of the signature algorithm itself,
 * and this file does not invent one.
 */
export function assessKey(bits: number | null, curve: string | null): KeyAssessment {
  if (curve !== null) {
    const weak = bits !== null && bits < WEAK_EC_BITS;
    const sizeText = bits !== null ? `${bits} bit` : "ölçüsü bilinmir";
    return {
      bits,
      curve,
      weak,
      message: weak
        ? `Əyri ${curve}, ${sizeText} — bu, tövsiyə edilən minimumdan (${WEAK_EC_BITS} bit) kiçikdir.`
        : `Əyri ${curve}, ${sizeText}.`,
    };
  }
  if (bits !== null) {
    const weak = bits < WEAK_RSA_BITS;
    return {
      bits,
      curve: null,
      weak,
      message: weak
        ? `Açar ${bits} bit — tövsiyə edilən minimumdan (${WEAK_RSA_BITS} bit) kiçikdir.`
        : `Açar ${bits} bit.`,
    };
  }
  return { bits: null, curve: null, weak: false, message: "Açar ölçüsü sertifikatdan oxunmadı." };
}

/*
 * OpenSSL's own verify-error constants, translated rather than replaced: the
 * code Node hands back in `authorizationError` is already the fact, this map
 * only puts it in a sentence a visitor did not have to look up. A code that
 * is not in the list is shown as Node reported it — never swapped for a
 * guess.
 */
const TRUST_ERROR_LABELS: Record<string, string> = {
  DEPTH_ZERO_SELF_SIGNED_CERT: "Sertifikat özü-özünü imzalayıb — heç bir mərkəzə bağlı deyil.",
  SELF_SIGNED_CERT_IN_CHAIN: "Zəncirdə özü-özünü imzalayan sertifikat var — kök tanınan mərkəzlərdən deyil.",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "Verən mərkəzin kök sertifikatı bu maşının etibar mağazasında tapılmadı.",
  UNABLE_TO_GET_ISSUER_CERT: "Zəncirdəki bir sertifikatın verəni tapılmadı.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "Zəncirdəki imzalardan biri doğrulanmadı — çox güman aralıq sertifikat çatışmır.",
  CERT_HAS_EXPIRED: "Sertifikatın etibarlılıq müddəti bitib.",
  CERT_NOT_YET_VALID: "Sertifikatın etibarlılığı hələ başlamayıb.",
  CERT_UNTRUSTED: "Kök sertifikat bu maşının etibar mağazasında yoxdur.",
  CERT_CHAIN_TOO_LONG: "Sertifikat zənciri həddindən uzundur.",
  CERT_REVOKED: "Sertifikat geri çağırılıb (revoked).",
  CERT_REJECTED: "Sertifikat mərkəz tərəfindən rədd edilib.",
  HOSTNAME_MISMATCH: "Sertifikat bu adı əhatə etmir.",
  ERR_TLS_CERT_ALTNAME_INVALID: "Sertifikat bu adı əhatə etmir.",
};

/** Turns Node's raw `authorizationError` text into a sentence, or passes an unknown code through as-is. */
export function trustErrorMessage(raw: string | null): string {
  if (raw === null || raw.trim() === "") return "Naməlum səbəb.";
  const code = raw.replace(/^Error:\s*/i, "").trim();
  for (const [key, label] of Object.entries(TRUST_ERROR_LABELS)) {
    if (code === key || code.includes(key)) return label;
  }
  return code;
}

export type SslReport = {
  hostname: string;
  address: string;
  port: number;
  checkedAt: string;
  protocol: string | null;
  cipher: { name: string; version: string } | null;
  trusted: boolean;
  trustMessage: string;
  name: NameVerdict;
  chain: CertificateInfo[];
  chainInfo: ChainVerdict;
  expiry: ExpiryVerdict;
  key: KeyAssessment;
  ms: number;
};

/**
 * Assembles everything a visitor sees from one completed handshake.
 *
 * Takes `TlsResult` rather than reaching for a socket itself — the route owns
 * the network call, this owns the reading of its answer, and that split is
 * the whole reason this file is separate from `socket-probe.ts`.
 */
export function buildSslReport(hostname: string, tls: TlsResult): SslReport {
  const leaf = tls.chain[0];

  return {
    hostname,
    address: tls.address,
    port: tls.port,
    checkedAt: new Date().toISOString(),
    protocol: tls.protocol,
    cipher: tls.cipher,
    trusted: tls.trusted,
    trustMessage: tls.trusted ? "Bu maşının etibar mağazası zənciri təsdiqləyir." : trustErrorMessage(tls.trustError),
    name: nameVerdict(hostname, tls.nameMatches, leaf?.names ?? []),
    chain: tls.chain,
    chainInfo: chainVerdict(tls.chain),
    expiry: expiryVerdict(leaf?.daysLeft ?? 0),
    key: assessKey(leaf?.keyBits ?? null, leaf?.signatureAlgorithm ?? null),
    ms: tls.ms,
  };
}
