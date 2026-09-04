/*
 * One address, twenty verdicts, read as a single answer.
 *
 * A dozen tools on this site already ask a live site one question each, and
 * each of them answers it well. None of them answers the question a visitor
 * actually arrives with — "is my site all right?" — because that answer is
 * spread over a dozen pages and a dozen visits, and nobody makes all twelve.
 * This module is where those separate readings are put back together.
 *
 * Nothing here touches the network. The route gathers four documents and one
 * handshake and hands the raw material in; every judgement below is a pure
 * function of that material, which is what lets
 * `scripts/tools-checks/sayt-hesabati.mts` pin the wording of a verdict to a
 * fixed page instead of to a live site that changes between two runs.
 *
 * A verdict has three states and never four. "Could not be measured" is not a
 * fourth state, it is a failure with an honest sentence — a report that
 * quietly drops the checks it could not run reads as a better report than it
 * is, and that is the one thing a report must never do.
 *
 * The judgement itself is borrowed wherever a tool here already owns it:
 * `hsts.ts` reads the `max-age`, `qarisiq-mezmun.ts` finds the http
 * references, `og-onizleme.ts` pulls the metadata out of the markup,
 * `robots-canli.ts` parses robots.txt, `sitemap-yoxlayici.ts` parses the
 * sitemap and `ssl.ts` phrases the expiry. Re-deciding any of those here would
 * mean two tools on the same site disagreeing about the same page.
 */
import { attr, collectTags } from "./html";
import { formatMaxAge, parseHstsHeader } from "./hsts";
import { checkLength, DESCRIPTION_SOFT_LIMIT, TITLE_SOFT_LIMIT } from "./meta";
import { extractOpenGraph } from "./og-onizleme";
import { buildMixedContentReport } from "./qarisiq-mezmun";
import { parseRobotsText } from "./robots-canli";
import { parseSitemapDocument } from "./sitemap-yoxlayici";
import { expiryVerdict } from "./ssl";

export type CheckStatus = "kecdi" | "xeberdarliq" | "kecmedi";

export const STATUS_LABELS: Record<CheckStatus, string> = {
  kecdi: "keçdi",
  xeberdarliq: "xəbərdarlıq",
  kecmedi: "keçmədi",
};

export type ReportSection = "tehlukesizlik" | "suret" | "meta" | "indeks";

export const SECTION_ORDER: ReportSection[] = ["tehlukesizlik", "suret", "meta", "indeks"];

export const SECTION_LABELS: Record<ReportSection, string> = {
  tehlukesizlik: "Təhlükəsizlik",
  suret: "Sürət",
  meta: "Meta məlumat",
  indeks: "İndeksləşmə",
};

export type SiteCheck = {
  /** Stable across releases, because the check file names cases by it. */
  id: string;
  section: ReportSection;
  /** What the row is called, in the visitor's language. */
  label: string;
  status: CheckStatus;
  /** The measured value itself, printed as it came off the wire. Null when there was none. */
  value: string | null;
  /** One sentence: what was found and why it counts as this verdict. */
  detail: string;
  /** What to change to turn this row green. Null when nothing needs changing. */
  fix: string | null;
};

/** What the plain-http request found, or that port 80 answered nothing at all. */
export type HttpProbe = {
  reachable: boolean;
  status: number;
  /** The `Location` value, resolved absolute. */
  location: string | null;
};

/** One of the two extra files the report reads, fetched or explained away. */
export type FetchedFile = {
  url: string;
  status: number;
  text: string;
  /** True when the file was longer than its byte budget and was cut. */
  truncated: boolean;
  /** The sentence saying why nothing was read, or null when something was. */
  error: string | null;
};

export type SiteReportInput = {
  /** The address that was actually fetched, after normalisation. */
  url: string;
  hostname: string;
  status: number;
  /** Where the page wanted to send us instead of answering. */
  redirectedTo: string | null;
  /** Raw pairs in the order the server sent them. */
  headers: readonly (readonly [string, string])[];
  html: string;
  /** True when the page was longer than the byte budget and was cut. */
  htmlTruncated: boolean;
  /** Wall clock for the whole page response, measured from this server. */
  responseMs: number | null;
  /** Null when the address was already http and there was nothing to compare. */
  httpProbe: HttpProbe | null;
  certificate: { daysLeft: number; issuer: string } | null;
  robots: FetchedFile | null;
  sitemap: FetchedFile | null;
  checkedAt: string;
};

export type SiteReport = {
  url: string;
  hostname: string;
  checkedAt: string;
  /** True when the page arrived over TLS; several rows read differently if not. */
  secure: boolean;
  htmlTruncated: boolean;
  checks: SiteCheck[];
  passed: number;
  warnings: number;
  failed: number;
  /** 0–100. A warning is worth half a pass, which is what makes it a middle state. */
  score: number;
  headline: string;
};

/**
 * What the endpoint sends the browser: the report, plus the four addresses it
 * was built from.
 *
 * The addresses are not decoration. A visitor who disagrees with a row needs
 * to know which document produced it — a report that grades a sitemap without
 * naming the file it read is a report nobody can argue with.
 */
export type SiteReportPayload = {
  report: SiteReport;
  status: number;
  redirectedTo: string | null;
  /** The plain-http address that was probed, or null when there was nothing to probe. */
  httpUrl: string | null;
  robotsUrl: string | null;
  /** Taken from robots.txt when it declares one, else the conventional path. */
  sitemapUrl: string | null;
};

/*
 * Six months, in seconds. Below this an HSTS header is a gesture rather than a
 * defence: the pin expires before most visitors come back, so the first
 * request of the next visit is unprotected again. The preload list asks for a
 * full year, and that is a separate bar the dedicated HSTS tool measures.
 */
const WEAK_HSTS_MAX_AGE = 15_552_000;

/** Under a month left is where a certificate stops being somebody's next-quarter problem. */
const CERT_WARNING_DAYS = 30;

/* Measured server to server on a warm network, so the bar is stricter than the
   one a visitor on mobile would experience — a page this server waits a second
   for is a page a phone waits several for. */
const FAST_RESPONSE_MS = 600;
const SLOW_RESPONSE_MS = 1_500;

/** Uncompressed markup. Past the second number the HTML alone is the bottleneck. */
const GOOD_HTML_BYTES = 100 * 1024;
const HEAVY_HTML_BYTES = 250 * 1024;

/** Below this a description is too short to say anything a snippet can use. */
const MIN_DESCRIPTION_LENGTH = 50;

/** Below this a title is a label rather than a sentence. */
const MIN_TITLE_LENGTH = 10;

/** Anything under this share of images carrying `alt` is a systematic omission, not an oversight. */
const ALT_WARNING_RATIO = 0.9;

/** Case-insensitive lookup, with repeated headers joined the way a browser reads them. */
function headerMap(headers: SiteReportInput["headers"]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [name, value] of headers) {
    const key = name.toLowerCase();
    const existing = map.get(key);
    map.set(key, existing === undefined ? value : `${existing}, ${value}`);
  }
  return map;
}

/** Splits a CSP into `directive -> sources`, lowercased on the directive only. */
function cspDirectives(value: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of value.split(";")) {
    const pieces = part.trim().split(/\s+/).filter(Boolean);
    if (pieces.length === 0) continue;
    directives.set(pieces[0].toLowerCase(), pieces.slice(1));
  }
  return directives;
}

/** The decoded markup's own size, which is the number a slow page is made of. */
function byteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ---------- security ---------- */

function checkHttpsRedirect(input: SiteReportInput): SiteCheck {
  const base = {
    id: "https-yonlendirme",
    section: "tehlukesizlik" as const,
    label: "HTTPS-ə yönləndirmə",
  };

  const probe = input.httpProbe;
  if (probe === null) {
    return {
      ...base,
      status: "kecmedi",
      value: "http://",
      detail:
        "Yoxlanan ünvanın özü http-dir, ona görə müqayisə üçün şifrələnmiş versiya yoxdur.",
      fix: "Sayta TLS sertifikatı qur və bütün http trafikini https-ə yönləndir.",
    };
  }

  if (!probe.reachable) {
    return {
      ...base,
      status: "xeberdarliq",
      value: "80 portu cavab vermir",
      detail:
        "80 portu bağlıdır: http ilə açmağa çalışan ziyarətçi yönləndirmə yox, əlaqə xətası alır.",
      fix: "80 portunu açıq saxla və oradan gələn hər sorğunu 301 ilə https ünvanına göndər.",
    };
  }

  const toHttps = probe.location !== null && probe.location.toLowerCase().startsWith("https://");
  const value = `HTTP ${probe.status}${probe.location === null ? "" : ` → ${probe.location}`}`;

  if (probe.status >= 300 && probe.status < 400 && toHttps) {
    /* 301 and 308 are the permanent pair; a 302 works today but tells the
       browser and the search engine to keep asking over http tomorrow. */
    const permanent = probe.status === 301 || probe.status === 308;
    return {
      ...base,
      status: permanent ? "kecdi" : "xeberdarliq",
      value,
      detail: permanent
        ? "http ünvanı daimi yönləndirmə ilə https-ə göndərilir."
        : "Yönləndirmə var, amma müvəqqətidir — brauzer də, axtarış robotu da növbəti dəfə yenə http ilə soruşacaq.",
      fix: permanent ? null : "302/307 əvəzinə 301 (və ya 308) qaytar.",
    };
  }

  if (probe.status >= 300 && probe.status < 400) {
    return {
      ...base,
      status: "kecmedi",
      value,
      detail: "http ünvanı yönləndirilir, amma hədəf yenə şifrələnməmiş ünvandır.",
      fix: "Yönləndirmənin hədəfini «https://» ilə başlayan ünvana dəyiş.",
    };
  }

  return {
    ...base,
    status: "kecmedi",
    value,
    detail: "Səhifə http üzərindən birbaşa açılır — məzmun şifrələnmədən gedir.",
    fix: "80 portundan gələn bütün sorğuları 301 ilə eyni yolun https variantına yönləndir.",
  };
}

function checkHsts(map: Map<string, string>, secure: boolean): SiteCheck {
  const base = { id: "hsts", section: "tehlukesizlik" as const, label: "HSTS" };
  const value = map.get("strict-transport-security") ?? null;

  if (!secure) {
    return {
      ...base,
      status: "kecmedi",
      value: null,
      detail:
        "Sayt https ilə açılmadığı üçün bu başlıq ümumiyyətlə tətbiq olunmur — brauzer onu yalnız şifrələnmiş cavabda qəbul edir.",
      fix: "Əvvəlcə saytı https-ə keçir, sonra başlığı əlavə et.",
    };
  }

  if (value === null) {
    return {
      ...base,
      status: "kecmedi",
      value: null,
      detail:
        "Strict-Transport-Security başlığı yoxdur: domen adı sadəcə yazılanda ilk sorğu hələ də http ilə gedə bilər.",
      fix: "Cavaba «Strict-Transport-Security: max-age=31536000; includeSubDomains» başlığını əlavə et.",
    };
  }

  const directives = parseHstsHeader(value);
  const seconds = directives.maxAgeSeconds;

  if (seconds === null || seconds === 0) {
    return {
      ...base,
      status: "kecmedi",
      value,
      detail:
        seconds === 0
          ? "«max-age=0» yazılıb — bu, HSTS-i söndürən və brauzerdəki köhnə qaydanı silən dəyərdir."
          : "Başlıq var, amma «max-age» oxunmur, ona görə brauzer onu tətbiq etmir.",
      fix: "«max-age» dəyərini saniyə ilə yaz: bir il üçün 31536000.",
    };
  }

  if (seconds < WEAK_HSTS_MAX_AGE) {
    return {
      ...base,
      status: "xeberdarliq",
      value: `max-age ${formatMaxAge(seconds)}`,
      detail: `Müddət ${formatMaxAge(seconds)} — tövsiyə olunan minimum 180 gündür, qısa müddət isə ziyarətlər arasında bitir.`,
      fix: "«max-age» dəyərini ən azı 15552000 (180 gün) et.",
    };
  }

  return {
    ...base,
    status: "kecdi",
    value: `max-age ${formatMaxAge(seconds)}${directives.includeSubDomains ? " + includeSubDomains" : ""}`,
    detail: directives.includeSubDomains
      ? "Başlıq uzun müddətə qurulub və alt domenləri də əhatə edir."
      : "Müddət kifayətdir; «includeSubDomains» yazılmayıb, yəni qayda yalnız bu host adına aiddir.",
    fix: directives.includeSubDomains
      ? null
      : "Bütün alt domenlərin https ilə işlədiyinə əmin olduqdan sonra başlığa «includeSubDomains» əlavə et.",
  };
}

function checkCsp(map: Map<string, string>): SiteCheck {
  const base = {
    id: "csp",
    section: "tehlukesizlik" as const,
    label: "Content-Security-Policy",
  };
  const value = map.get("content-security-policy") ?? null;

  if (value === null) {
    const reportOnly = map.get("content-security-policy-report-only") ?? null;
    return {
      ...base,
      status: "kecmedi",
      value: reportOnly === null ? null : "yalnız Report-Only",
      detail:
        reportOnly === null
          ? "Content-Security-Policy başlığı yoxdur: səhifəyə yeridilən skript heç nə tərəfindən dayandırılmır."
          : "Yalnız «Report-Only» versiyası var — pozuntular hesabata düşür, amma heç nə bloklanmır.",
      fix: "Ən azı «default-src 'self'» ilə başla, sonra saytın həqiqətən işlətdiyi mənbələri bir-bir əlavə et.",
    };
  }

  const directives = cspDirectives(value);
  const scriptSources = directives.get("script-src") ?? directives.get("default-src") ?? null;

  if (scriptSources === null) {
    return {
      ...base,
      status: "xeberdarliq",
      value,
      detail:
        "Siyasət var, amma nə «script-src», nə də «default-src» yazılıb — skriptlər üçün heç bir məhdudiyyət qalmır.",
      fix: "Siyasətə «default-src 'self'» və ya konkret «script-src» direktivi əlavə et.",
    };
  }

  /* `unsafe-inline` in the script sources is the one setting that turns a
     policy back into decoration: the injected `<script>` an XSS relies on is
     exactly an inline script, so allowing them allows the attack the header
     exists to stop. */
  const unsafe = scriptSources.some(
    (source) => source === "'unsafe-inline'" || source === "'unsafe-eval'",
  );

  return {
    ...base,
    status: unsafe ? "xeberdarliq" : "kecdi",
    value,
    detail: unsafe
      ? "Siyasət qurulub, amma skript mənbələrində «unsafe-inline» və ya «unsafe-eval» var — səhifəyə yeridilən skript yenə işləyir."
      : "Siyasət var və skript mənbələri konkretdir.",
    fix: unsafe
      ? "Inline skriptləri ayrıca fayla çıxar və ya onlara nonce/hash ver, sonra «unsafe-inline» sətrini sil."
      : null,
  };
}

function checkNosniff(map: Map<string, string>): SiteCheck {
  const base = {
    id: "nosniff",
    section: "tehlukesizlik" as const,
    label: "X-Content-Type-Options",
  };
  const value = map.get("x-content-type-options") ?? null;

  if (value !== null && value.trim().toLowerCase() === "nosniff") {
    return {
      ...base,
      status: "kecdi",
      value,
      detail: "Brauzer faylın növünü məzmuna baxıb təxmin etmir, serverin dediyini götürür.",
      fix: null,
    };
  }

  return {
    ...base,
    status: "kecmedi",
    value,
    detail:
      value === null
        ? "Başlıq yoxdur: brauzer faylın növünü təxmin edə bilir və yüklənən şəkil skript kimi icra oluna bilər."
        : `Dəyər «${value}» tanınmır — yeganə etibarlı dəyər «nosniff»-dir.`,
    fix: "Cavaba «X-Content-Type-Options: nosniff» başlığını əlavə et.",
  };
}

function checkReferrerPolicy(map: Map<string, string>): SiteCheck {
  const base = {
    id: "referrer-policy",
    section: "tehlukesizlik" as const,
    label: "Referrer-Policy",
  };
  const value = map.get("referrer-policy") ?? null;

  if (value === null) {
    return {
      ...base,
      status: "kecmedi",
      value: null,
      detail:
        "Başlıq yoxdur: keçid ediləndə qarşı sayta hansı səhifədən gəldiyin, yəni tam ünvan göndərilə bilər.",
      fix: "«Referrer-Policy: strict-origin-when-cross-origin» başlığını əlavə et.",
    };
  }

  /* The last value wins when several are sent, which is how a browser reads
     the joined header. */
  const chosen = value.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean).pop() ?? "";
  const leaky = chosen === "unsafe-url" || chosen === "no-referrer-when-downgrade" || chosen === "origin-when-cross-origin";

  return {
    ...base,
    status: leaky ? "xeberdarliq" : "kecdi",
    value,
    detail: leaky
      ? `«${chosen}» dəyəri kənar sayta tam ünvanı və ya onun bir hissəsini göndərməyə icazə verir.`
      : "Kənar sayta göndərilən istinad məhdudlaşdırılıb.",
    fix: leaky ? "Dəyəri «strict-origin-when-cross-origin» ilə əvəz et." : null,
  };
}

function checkFraming(map: Map<string, string>): SiteCheck {
  const base = {
    id: "cerceve",
    section: "tehlukesizlik" as const,
    label: "Çərçivəyə salınma qoruması",
  };

  const csp = map.get("content-security-policy") ?? null;
  const ancestors = csp === null ? null : cspDirectives(csp).get("frame-ancestors") ?? null;
  const xfo = map.get("x-frame-options") ?? null;
  const xfoValue = xfo === null ? null : xfo.trim().toLowerCase();

  if (ancestors !== null) {
    const open = ancestors.includes("*");
    return {
      ...base,
      status: open ? "kecmedi" : "kecdi",
      value: `frame-ancestors ${ancestors.join(" ")}`,
      detail: open
        ? "«frame-ancestors *» yazılıb — istənilən sayt bu səhifəni öz çərçivəsinə sala bilər."
        : "CSP-dəki «frame-ancestors» kimin bu səhifəni çərçivəyə sala biləcəyini məhdudlaşdırır.",
      fix: open ? "«*» əvəzinə «'self'» yaz, kənar sayt lazımdırsa onu ad-ad sadala." : null,
    };
  }

  if (xfoValue === "deny" || xfoValue === "sameorigin") {
    return {
      ...base,
      status: "kecdi",
      value: xfo,
      detail:
        "X-Frame-Options çərçivəyə salınmanın qarşısını alır; müasir qarşılığı CSP-dəki «frame-ancestors»-dur.",
      fix: null,
    };
  }

  return {
    ...base,
    status: "kecmedi",
    value: xfo,
    detail:
      "Nə «frame-ancestors», nə də işlək «X-Frame-Options» var: səhifə görünməz çərçivəyə salınıb kliklərin oğurlanmasına açıqdır.",
    fix: "CSP-yə «frame-ancestors 'self'» əlavə et.",
  };
}

function checkMixedContent(input: SiteReportInput, map: Map<string, string>, secure: boolean): SiteCheck {
  const base = {
    id: "qarisiq-mezmun",
    section: "tehlukesizlik" as const,
    label: "Qarışıq məzmun",
  };

  if (!secure) {
    return {
      ...base,
      status: "kecmedi",
      value: null,
      detail:
        "Səhifənin özü http ilə açılır, ona görə «qarışıq məzmun» anlayışı burada tətbiq olunmur — bütün resurslar şifrələnməmiş gedir.",
      fix: "Saytı https-ə keçir; qarışıq məzmun yoxlaması ondan sonra məna kəsb edir.",
    };
  }

  const report = buildMixedContentReport(input.html, input.url, map.get("content-security-policy") ?? null);
  const total = report.findings.length;

  if (total === 0) {
    return {
      ...base,
      status: "kecdi",
      value: "0 resurs",
      detail: "Səhifədə «http://» ilə çağırılan resurs tapılmadı.",
      fix: null,
    };
  }

  if (report.upgradeInsecureRequests) {
    return {
      ...base,
      status: "xeberdarliq",
      value: `${total} resurs`,
      detail:
        "http ilə yazılmış resurslar var, amma CSP-dəki «upgrade-insecure-requests» brauzeri onları https ilə istəməyə məcbur edir.",
      fix: "Markup-dakı ünvanları da «https://» ilə yaz — direktiv köməkçidir, düzəliş deyil.",
    };
  }

  return {
    ...base,
    status: report.blockedCount > 0 ? "kecmedi" : "xeberdarliq",
    value: `${total} resurs (${report.blockedCount} bloklanır)`,
    detail:
      report.blockedCount > 0
        ? `${report.blockedCount} aktiv resurs (skript və ya iframe) http ilə çağırılır — brauzer onları yükləmir, yəni səhifənin bir hissəsi işləmir.`
        : `${report.passiveCount} passiv resurs (şəkil, media) http ilə çağırılır — yüklənir, amma ünvan sətrindəki kilid işarəsini qırır.`,
    fix: "Səhifədəki «http://» ünvanlarını «https://» ilə əvəz et.",
  };
}

function checkCertificate(input: SiteReportInput, secure: boolean): SiteCheck {
  const base = {
    id: "sertifikat",
    section: "tehlukesizlik" as const,
    label: "TLS sertifikatının müddəti",
  };

  if (!secure) {
    return {
      ...base,
      status: "kecmedi",
      value: null,
      detail: "Sayt https ilə açılmadığı üçün yoxlanacaq sertifikat yoxdur.",
      fix: "Ödənişsiz Let's Encrypt sertifikatı qur və onu avtomatik yeniləyən xidməti işə sal.",
    };
  }

  const certificate = input.certificate;
  if (certificate === null) {
    return {
      ...base,
      status: "kecmedi",
      value: null,
      detail: "TLS əl sıxması baş tutmadı, ona görə sertifikatın müddəti oxunmadı.",
      fix: "443 portunun açıq olduğunu və serverin sertifikat zəncirini tam göndərdiyini yoxla.",
    };
  }

  const verdict = expiryVerdict(certificate.daysLeft);
  const value = `${certificate.daysLeft} gün · ${certificate.issuer}`;

  if (certificate.daysLeft < 0) {
    return {
      ...base,
      status: "kecmedi",
      value,
      detail: `${verdict.message} Brauzer saytı açmadan xəbərdarlıq səhifəsi göstərir.`,
      fix: "Sertifikatı dərhal yenilə və yenilənməni avtomatlaşdır.",
    };
  }

  if (certificate.daysLeft < CERT_WARNING_DAYS) {
    return {
      ...base,
      status: "xeberdarliq",
      value,
      detail: verdict.message,
      fix: "Yenilənməni avtomatlaşdır — əl ilə yeniləmə unudulan ilk işdir.",
    };
  }

  return { ...base, status: "kecdi", value, detail: verdict.message, fix: null };
}

/* ---------- speed ---------- */

function checkResponseTime(input: SiteReportInput): SiteCheck {
  const base = { id: "cavab-vaxti", section: "suret" as const, label: "Cavab vaxtı" };
  const ms = input.responseMs;

  if (ms === null) {
    return {
      ...base,
      status: "xeberdarliq",
      value: null,
      detail: "Cavab vaxtı ölçülmədi.",
      fix: "Ünvanı yenidən yoxla; problem təkrarlanarsa serverin jurnalına bax.",
    };
  }

  const value = `${ms} ms`;
  /* Measured from this server, not from a phone on mobile data — so the bar is
     stricter than the visitor's own experience would justify. */
  if (ms <= FAST_RESPONSE_MS) {
    return {
      ...base,
      status: "kecdi",
      value,
      detail: `Səhifə ${ms} millisaniyəyə gəldi — bu server üçün sürətli sayılır.`,
      fix: null,
    };
  }

  if (ms <= SLOW_RESPONSE_MS) {
    return {
      ...base,
      status: "xeberdarliq",
      value,
      detail: `Səhifə ${ms} millisaniyəyə gəldi; mobil şəbəkədə bu rəqəm bir neçə dəfə böyüyür.`,
      fix: "Səhifəni keşlə və ya statik olaraq qabaqcadan hazırla; bazaya gedən sorğuların sayını azalt.",
    };
  }

  return {
    ...base,
    status: "kecmedi",
    value,
    detail: `Səhifə ${ms} millisaniyə çəkdi — ziyarətçi boş ekrana baxır.`,
    fix: "Serverin cavabını keşlə, ağır sorğuları arxa fona çıxar və hostinqin coğrafi məsafəsini yoxla.",
  };
}

function checkCompression(map: Map<string, string>, htmlBytes: number): SiteCheck {
  const base = { id: "sixilma", section: "suret" as const, label: "Sıxılma" };
  const encoding = map.get("content-encoding") ?? null;
  const normalised = encoding === null ? null : encoding.trim().toLowerCase();

  if (normalised !== null && normalised !== "identity") {
    return {
      ...base,
      status: "kecdi",
      value: encoding,
      detail: `Server cavabı «${normalised}» ilə sıxılmış göndərir.`,
      fix: null,
    };
  }

  /* A short answer is not worth a compressor: the CPU cost and the few extra
     header bytes cancel the saving out, and most servers skip it on purpose. */
  if (htmlBytes < 1024) {
    return {
      ...base,
      status: "kecdi",
      value: "sıxılmayıb",
      detail: `Cavab ${formatBytes(htmlBytes)}-dır — bu ölçüdə sıxılma qazanc vermir.`,
      fix: null,
    };
  }

  return {
    ...base,
    status: "kecmedi",
    value: "sıxılmayıb",
    detail: `HTML ${formatBytes(htmlBytes)} olduğu halda «Content-Encoding» başlığı yoxdur — mətn olduğu kimi göndərilir.`,
    fix: "Serverdə gzip və ya brotli sıxılmasını aç; mətn tipli cavablarda çəki adətən üç-dörd dəfə azalır.",
  };
}

function checkHtmlSize(input: SiteReportInput, htmlBytes: number): SiteCheck {
  const base = { id: "html-olcusu", section: "suret" as const, label: "HTML ölçüsü" };
  const value = input.htmlTruncated ? `${formatBytes(htmlBytes)}+` : formatBytes(htmlBytes);

  if (input.htmlTruncated) {
    return {
      ...base,
      status: "kecmedi",
      value,
      detail:
        "Səhifə oxuma büdcəsindən böyük olduğu üçün kəsildi — yəni HTML-in özü yarım meqabaytdan çoxdur.",
      fix: "Səhifəni bölmələrə ayır, siyahıları səhifələ və markup-a yerləşdirilmiş böyük məlumatı ayrıca sorğuya çıxar.",
    };
  }

  if (htmlBytes <= GOOD_HTML_BYTES) {
    return {
      ...base,
      status: "kecdi",
      value,
      detail: `Markup ${formatBytes(htmlBytes)}-dır — brauzer onu bir anda oxuyur.`,
      fix: null,
    };
  }

  const heavy = htmlBytes > HEAVY_HTML_BYTES;
  return {
    ...base,
    status: heavy ? "kecmedi" : "xeberdarliq",
    value,
    detail: heavy
      ? `Markup ${formatBytes(htmlBytes)}-dır: bu ölçüdə səhifənin ilk görünüşü təkcə HTML-i gözləyir.`
      : `Markup ${formatBytes(htmlBytes)}-dır — 100 KB-dan yuxarıdır, amma hələ idarə oluna bilər.`,
    fix: "Səhifəyə yerləşdirilmiş stil və məlumat bloklarını ayrıca fayla çıxar, uzun siyahıları səhifələ.",
  };
}

/* ---------- meta ---------- */

function checkTitle(title: string | null): SiteCheck {
  const base = { id: "title", section: "meta" as const, label: "<title>" };

  if (title === null || title.trim() === "") {
    return {
      ...base,
      status: "kecmedi",
      value: null,
      detail: "Səhifənin başlığı yoxdur — axtarış nəticəsində ünvanın özü görünəcək.",
      fix: "<head> içində 50-60 simvolluq, səhifəni təsvir edən <title> yaz.",
    };
  }

  const trimmed = title.trim();
  const length = checkLength(trimmed, TITLE_SOFT_LIMIT);
  const value = `${trimmed.length} simvol`;

  if (trimmed.length < MIN_TITLE_LENGTH) {
    return {
      ...base,
      status: "xeberdarliq",
      value,
      detail: `Başlıq ${trimmed.length} simvoldur — bu qısalıqda o, səhifəni təsvir etmir, sadəcə adlandırır.`,
      fix: "Başlığa səhifənin mövzusunu və sayt adını əlavə et.",
    };
  }

  if (length.status === "over") {
    return {
      ...base,
      status: "xeberdarliq",
      value,
      detail: `Başlıq ${trimmed.length} simvoldur; axtarış nəticəsində təxminən ${TITLE_SOFT_LIMIT} simvoldan sonrası kəsilir.`,
      fix: "Ən vacib sözləri əvvələ çək və başlığı qısalt.",
    };
  }

  return {
    ...base,
    status: "kecdi",
    value,
    detail: `Başlıq var və uzunluğu (${trimmed.length} simvol) axtarış nəticəsinə sığır.`,
    fix: null,
  };
}

function checkDescription(description: string | null): SiteCheck {
  const base = { id: "description", section: "meta" as const, label: "meta description" };

  if (description === null || description.trim() === "") {
    return {
      ...base,
      status: "kecmedi",
      value: null,
      detail:
        "Təsvir yoxdur: axtarış sistemi nəticədə göstərəcək mətni səhifədən özü seçəcək.",
      fix: "<meta name=\"description\" content=\"...\"> yaz — 120-155 simvol arası kifayətdir.",
    };
  }

  const trimmed = description.trim();
  const length = checkLength(trimmed, DESCRIPTION_SOFT_LIMIT);
  const value = `${trimmed.length} simvol`;

  if (trimmed.length < MIN_DESCRIPTION_LENGTH) {
    return {
      ...base,
      status: "xeberdarliq",
      value,
      detail: `Təsvir ${trimmed.length} simvoldur — bu qədər yerdə səhifənin nə təklif etdiyi deyilmir.`,
      fix: "Təsviri 120-155 simvola çatdır və səhifənin konkret faydasını yaz.",
    };
  }

  if (length.status === "over") {
    return {
      ...base,
      status: "xeberdarliq",
      value,
      detail: `Təsvir ${trimmed.length} simvoldur; nəticədə təxminən ${DESCRIPTION_SOFT_LIMIT} simvoldan sonrası kəsilir.`,
      fix: "Təsviri qısalt və əsas fikri birinci cümləyə yığ.",
    };
  }

  return {
    ...base,
    status: "kecdi",
    value,
    detail: `Təsvir var və uzunluğu (${trimmed.length} simvol) nəticəyə sığır.`,
    fix: null,
  };
}

function checkLang(html: string): SiteCheck {
  const base = { id: "lang", section: "meta" as const, label: "<html lang>" };
  const root = collectTags(html, "html")[0];
  const lang = root === undefined ? null : attr(root, "lang");

  if (lang === null || lang.trim() === "") {
    return {
      ...base,
      status: "kecmedi",
      value: null,
      detail:
        "<html> etiketində «lang» yoxdur: ekran oxuyucusu mətni hansı dildə tələffüz edəcəyini bilmir, brauzer isə tərcümə təklifini səhv verir.",
      fix: "<html lang=\"az\"> yaz — dili səhifənin əsas mətninə görə seç.",
    };
  }

  const value = lang.trim();
  /* A tag like `az` or `az-AZ`; anything else is a value no consumer maps to
     a language, which is the same as not writing one. */
  const wellFormed = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(value);

  return {
    ...base,
    status: wellFormed ? "kecdi" : "xeberdarliq",
    value,
    detail: wellFormed
      ? `Səhifənin dili «${value}» kimi elan olunub.`
      : `«${value}» dəyəri dil koduna oxşamır, ona görə heç bir proqram onu tanımır.`,
    fix: wellFormed ? null : "Dəyəri BCP 47 formatında yaz: «az», «az-AZ», «en-US».",
  };
}

function checkCanonical(canonical: string | null, pageUrl: string): SiteCheck {
  const base = { id: "canonical", section: "meta" as const, label: "Canonical" };

  if (canonical === null) {
    return {
      ...base,
      status: "xeberdarliq",
      value: null,
      detail:
        "rel=canonical yoxdur: eyni səhifə iki ünvandan açılırsa (www və www-suz, parametrli və parametrsiz) axtarış sistemi hansının əsas olduğunu özü seçəcək.",
      fix: "<link rel=\"canonical\" href=\"...\"> əlavə et və orada səhifənin tam, mütləq ünvanını yaz.",
    };
  }

  let sameHost = false;
  try {
    sameHost = new URL(canonical).hostname === new URL(pageUrl).hostname;
  } catch {
    sameHost = false;
  }

  return {
    ...base,
    status: sameHost ? "kecdi" : "xeberdarliq",
    value: canonical,
    detail: sameHost
      ? "Səhifə öz əsas ünvanını elan edir."
      : "Canonical başqa domenə işarə edir — bu, məzmunun həmin sayta aid olduğunu bildirir və səhv yazılıbsa səhifəni indeksdən çıxarır.",
    fix: sameHost ? null : "Canonical ünvanının doğrudan da bu səhifənin əsas nüsxəsi olduğunu təsdiqlə.",
  };
}

function checkOpenGraph(tags: Record<string, string>): SiteCheck {
  const base = { id: "open-graph", section: "meta" as const, label: "Open Graph" };
  const wanted = ["og:title", "og:description", "og:image"];
  const present = wanted.filter((key) => (tags[key] ?? "").trim() !== "");
  const value = `${present.length}/3`;

  if (present.length === 0) {
    return {
      ...base,
      status: "kecmedi",
      value,
      detail:
        "Open Graph etiketləri yoxdur: link mesajlaşma və sosial şəbəkədə paylaşılanda şəkilsiz, çılpaq ünvan kimi görünür.",
      fix: "og:title, og:description və 1200×630 ölçülü og:image əlavə et.",
    };
  }

  if (present.length < wanted.length) {
    const missing = wanted.filter((key) => !present.includes(key));
    return {
      ...base,
      status: "xeberdarliq",
      value,
      detail: `Paylaşım kartı yarımçıqdır — ${missing.join(", ")} yazılmayıb.`,
      fix: `Çatmayan etiketləri əlavə et: ${missing.join(", ")}.`,
    };
  }

  return {
    ...base,
    status: "kecdi",
    value,
    detail: "Başlıq, təsvir və şəkil — paylaşım kartının üç hissəsi də var.",
    fix: null,
  };
}

/* ---------- indexing ---------- */

function checkRobots(file: FetchedFile | null): SiteCheck {
  const base = { id: "robots-txt", section: "indeks" as const, label: "robots.txt" };

  if (file === null || file.error !== null) {
    return {
      ...base,
      status: "xeberdarliq",
      value: file === null ? null : `HTTP ${file.status}`,
      detail:
        file === null
          ? "robots.txt oxunmadı."
          : `${file.error} Fayl olmadan da sayt indekslənir, amma sitemap ünvanını elan edəcək yer qalmır.`,
      fix: "Kök qovluqda robots.txt yarat və içində sitemap ünvanını göstər.",
    };
  }

  const document = parseRobotsText(file.text);
  const wildcard = document.groups.find((group) =>
    group.agents.some((agent) => agent.trim() === "*"),
  );
  /* `Disallow: /` under `User-agent: *` is the one line in this file that can
     remove an entire site from search, and it is usually left over from a
     staging environment somebody copied the configuration from. */
  const blocksEverything =
    wildcard !== undefined &&
    wildcard.rules.some((rule) => rule.kind === "disallow" && rule.path.trim() === "/");

  if (blocksEverything) {
    return {
      ...base,
      status: "kecmedi",
      value: "Disallow: /",
      detail:
        "robots.txt bütün robotlara saytın hamısını qadağan edir — sayt axtarışdan tamamilə çıxır.",
      fix: "«User-agent: *» qrupundakı «Disallow: /» sətrini sil.",
    };
  }

  const sitemapCount = document.sitemaps.length;
  return {
    ...base,
    status: sitemapCount > 0 ? "kecdi" : "xeberdarliq",
    value: `${document.groups.length} qrup · ${sitemapCount} sitemap`,
    detail:
      sitemapCount > 0
        ? "Fayl var, saytı bağlamır və sitemap ünvanını elan edir."
        : "Fayl var və saytı bağlamır, amma içində «Sitemap:» sətri yoxdur.",
    fix: sitemapCount > 0 ? null : "Fayla «Sitemap: https://.../sitemap.xml» sətrini əlavə et.",
  };
}

function checkSitemap(file: FetchedFile | null): SiteCheck {
  const base = { id: "sitemap", section: "indeks" as const, label: "sitemap.xml" };

  if (file === null || file.error !== null) {
    return {
      ...base,
      status: "kecmedi",
      value: file === null ? null : `HTTP ${file.status}`,
      detail:
        file === null
          ? "Sitemap oxunmadı."
          : `${file.error} Sitemap olmadan robot səhifələri yalnız daxili keçidlərlə tapır.`,
      fix: "sitemap.xml yarat, robots.txt-də ünvanını göstər və Search Console-a təqdim et.",
    };
  }

  const report = parseSitemapDocument(file.text, file.url, file.truncated);

  if (report.kind === "namelum") {
    return {
      ...base,
      status: "xeberdarliq",
      value: "format tanınmadı",
      detail: "Ünvan cavab verir, amma sənəd sitemap kimi oxunmur — kök element gözlənilən deyil.",
      fix: "Faylın <urlset> və ya <sitemapindex> ilə başladığını və XML kimi verildiyini yoxla.",
    };
  }

  if (report.kind === "sitemapindex") {
    return {
      ...base,
      status: "kecdi",
      value: `${report.childSitemaps.length} alt fayl`,
      detail: "Sitemap indeksidir: alt fayllar burada açılmır, ünvanları sadalanır.",
      fix: null,
    };
  }

  const count = report.urls.length;
  if (count === 0) {
    return {
      ...base,
      status: "kecmedi",
      value: "0 ünvan",
      detail: "Sitemap açılır, amma içində bir dənə də ünvan yoxdur.",
      fix: "Sitemap-ı yaradan prosesin doğrudan da səhifələri yazdığını yoxla.",
    };
  }

  const errors = report.issues.filter((issue) => issue.severity === "xeta").length;
  return {
    ...base,
    status: errors > 0 ? "xeberdarliq" : "kecdi",
    value: `${count} ünvan`,
    detail:
      errors > 0
        ? `Faylda ${count} ünvan var, amma ${errors} qüsur tapıldı — təfərrüat üçün sitemap yoxlayıcısına bax.`
        : `Fayl düzgündür və ${count} ünvan sadalayır.`,
    fix: errors > 0 ? "Sitemap yoxlayıcısı ilə faylı ayrıca aç və göstərilən sətirləri düzəlt." : null,
  };
}

function checkH1(html: string): SiteCheck {
  const base = { id: "h1", section: "indeks" as const, label: "H1 sayı" };
  const count = collectTags(html, "h1").length;

  if (count === 1) {
    return {
      ...base,
      status: "kecdi",
      value: "1",
      detail: "Səhifənin bir baş başlığı var.",
      fix: null,
    };
  }

  if (count === 0) {
    return {
      ...base,
      status: "kecmedi",
      value: "0",
      detail:
        "Səhifədə H1 yoxdur: nə axtarış robotu, nə də ekran oxuyucusu səhifənin nədən bəhs etdiyini bir cümlə ilə öyrənə bilir.",
      fix: "Səhifənin əsas başlığını <h1> ilə yaz — səhifədə bir dənə olsun.",
    };
  }

  return {
    ...base,
    status: "xeberdarliq",
    value: String(count),
    detail: `Səhifədə ${count} H1 var — hansının əsas başlıq olduğu bilinmir.`,
    fix: "Yalnız birini H1 saxla, qalanlarını H2-yə çevir.",
  };
}

function checkAltText(html: string): SiteCheck {
  const base = { id: "alt-metn", section: "indeks" as const, label: "Şəkillərdə alt mətn" };
  const images = collectTags(html, "img");

  if (images.length === 0) {
    return {
      ...base,
      status: "kecdi",
      value: "şəkil yoxdur",
      detail: "Səhifədə <img> elementi yoxdur, ona görə yoxlanacaq alt mətn də yoxdur.",
      fix: null,
    };
  }

  /* An empty `alt=""` counts as written on purpose: that is the standard way
     to mark a decorative image, and a reader is meant to skip it. The missing
     attribute is the defect, not the empty one. */
  const withAlt = images.filter((image) => attr(image, "alt") !== null).length;
  const ratio = withAlt / images.length;
  const value = `${withAlt}/${images.length}`;

  if (withAlt === images.length) {
    return {
      ...base,
      status: "kecdi",
      value,
      detail: "Bütün şəkillərdə «alt» atributu var.",
      fix: null,
    };
  }

  const missing = images.length - withAlt;
  return {
    ...base,
    status: ratio >= ALT_WARNING_RATIO ? "xeberdarliq" : "kecmedi",
    value,
    detail: `${missing} şəkildə «alt» atributu yoxdur — ekran oxuyucusu onların yerinə fayl adını oxuyur.`,
    fix: "Məzmun daşıyan şəklə şəkli izah edən alt mətn yaz; bəzək şəkli üçün «alt=\"\"» qoy.",
  };
}

/* ---------- assembly ---------- */

function headlineFor(passed: number, warnings: number, failed: number): string {
  const total = passed + warnings + failed;
  if (failed === 0 && warnings === 0) return `${total} yoxlamanın hamısı keçdi.`;
  if (failed === 0) return `${passed} yoxlama keçdi, ${warnings} yerdə xəbərdarlıq var.`;
  if (warnings === 0) return `${passed} yoxlama keçdi, ${failed} yoxlama keçmədi.`;
  return `${passed} keçdi · ${warnings} xəbərdarlıq · ${failed} keçmədi.`;
}

/**
 * Turns the gathered material into the twenty rows and the one line above them.
 *
 * The order of the rows is the order of the sections, and inside a section the
 * order is fixed rather than sorted by severity: a report whose rows move
 * between two runs is a report nobody can compare with last week's.
 */
export function buildSiteReport(input: SiteReportInput): SiteReport {
  const map = headerMap(input.headers);
  const secure = input.url.toLowerCase().startsWith("https://");
  const htmlBytes = byteSize(input.html);
  const meta = extractOpenGraph(input.html, input.url);

  const checks: SiteCheck[] = [
    checkHttpsRedirect(input),
    checkHsts(map, secure),
    checkCsp(map),
    checkNosniff(map),
    checkReferrerPolicy(map),
    checkFraming(map),
    checkMixedContent(input, map, secure),
    checkCertificate(input, secure),

    checkResponseTime(input),
    checkCompression(map, htmlBytes),
    checkHtmlSize(input, htmlBytes),

    checkTitle(meta.title),
    checkDescription(meta.description),
    checkLang(input.html),
    checkCanonical(meta.canonical, input.url),
    checkOpenGraph(meta.tags),

    checkRobots(input.robots),
    checkSitemap(input.sitemap),
    checkH1(input.html),
    checkAltText(input.html),
  ];

  const passed = checks.filter((check) => check.status === "kecdi").length;
  const warnings = checks.filter((check) => check.status === "xeberdarliq").length;
  const failed = checks.filter((check) => check.status === "kecmedi").length;

  /* A warning is half a pass rather than a failure: it is the state where the
     thing exists and is imperfect, and collapsing it into either neighbour
     would make the number say less than the rows do. */
  const score = Math.round(((passed + warnings * 0.5) / checks.length) * 100);

  return {
    url: input.url,
    hostname: input.hostname,
    checkedAt: input.checkedAt,
    secure,
    htmlTruncated: input.htmlTruncated,
    checks,
    passed,
    warnings,
    failed,
    score,
    headline: headlineFor(passed, warnings, failed),
  };
}
