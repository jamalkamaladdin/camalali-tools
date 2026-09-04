/**
 * Reading a site's HTTP response headers as a security posture.
 *
 * The scoring is a pure function on purpose: the route does the network part
 * and hands the result here, so every judgement in the tool can be checked
 * without a server to point at.
 *
 * The address rules that decide which sites the server may be pointed at used
 * to live in this file too. Four more tools now need the same fence, so they
 * moved to `safe-url.ts` and are re-exported here: a fence that is right in
 * four places and wrong in the fifth is not a fence, and callers written
 * against this module should not have to care that it grew a second home.
 */
export {
  isBlockedAddress,
  normalizeTargetUrl,
  parseIpv4,
  parseIpv6,
  type UrlCheck,
} from "./safe-url";

/* ---------- header assessment ---------- */

export type HeaderVerdict = "good" | "weak" | "missing";

export type HeaderFinding = {
  /** Canonical header name, as it is written in the specification. */
  header: string;
  /** What it does, in Azerbaijani, in one line. */
  purpose: string;
  verdict: HeaderVerdict;
  /** The value the server sent, or null. */
  value: string | null;
  /** Why this verdict - names the directive or the number responsible. */
  note: string;
  points: number;
  max: number;
};

export type HeaderReport = {
  url: string;
  status: number;
  /** Set when the server answered with a redirect instead of the page. */
  redirectedTo: string | null;
  checkedAt: string;
  findings: HeaderFinding[];
  score: number;
  grade: Grade;
  /** Every header the server sent, in the order it sent them. */
  all: { name: string; value: string; leaks: boolean }[];
  leaks: { name: string; value: string; note: string }[];
  /** What to fix, heaviest loss first. */
  todo: string[];
};

export type Grade = "A" | "B" | "C" | "D" | "E" | "F";

/*
 * Grade boundaries. A perfect answer is rare and should stay rare, but the
 * gap between "nothing at all" (0) and "the three cheap headers" (30) has to
 * be visible too, so the ladder is not evenly spaced - it is steeper at the
 * bottom, where a single header changes the letter.
 */
const GRADE_FLOORS: [Grade, number][] = [
  ["A", 90],
  ["B", 78],
  ["C", 65],
  ["D", 50],
  ["E", 35],
];

export function gradeFor(score: number): Grade {
  for (const [grade, floor] of GRADE_FLOORS) {
    if (score >= floor) return grade;
  }
  return "F";
}

export const GRADE_NOTES: Record<Grade, string> = {
  A: "Başlıqlar tam qurulub — bu səviyyəyə saytların çox az hissəsi çatır.",
  B: "Əsas qoruma var, bir-iki başlıq çatmır.",
  C: "Yarısı qurulub. Çatmayanlar sadə əlavələrdir.",
  D: "Yalnız ucuz başlıqlar var, əsas qoruma yoxdur.",
  E: "Demək olar heç nə qurulmayıb.",
  F: "Təhlükəsizlik başlıqları yoxdur.",
};

/** Case-insensitive lookup over the raw pairs the server sent. */
function headerValue(map: ReadonlyMap<string, string>, name: string): string | null {
  return map.get(name.toLowerCase()) ?? null;
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

function assessCsp(map: ReadonlyMap<string, string>): HeaderFinding {
  const base = {
    header: "Content-Security-Policy",
    purpose: "Səhifənin hansı mənbədən skript, stil və şəkil yükləyə biləcəyini məhdudlaşdırır — XSS-ə qarşı ən güclü başlıq.",
    max: 25,
  };

  const value = headerValue(map, "content-security-policy");
  if (value === null) {
    const reportOnly = headerValue(map, "content-security-policy-report-only");
    return {
      ...base,
      verdict: "missing",
      value: null,
      points: 0,
      note: reportOnly
        ? "Yalnız «Report-Only» versiyası var: pozuntular hesabata düşür, amma heç nə bloklanmır. Sınaq bitibsə əsl başlığa keçmək lazımdır."
        : "Başlıq yoxdur — səhifəyə düşən istənilən skript icra olunur.",
    };
  }

  const directives = cspDirectives(value);
  const script = directives.get("script-src") ?? directives.get("default-src");

  if (!script) {
    return {
      ...base,
      verdict: "weak",
      value,
      points: 8,
      note: "Nə «script-src», nə «default-src» var — siyasət skriptlərə toxunmur, yəni əsas işini görmür.",
    };
  }

  const sources = script.map((source) => source.toLowerCase());
  const hasNonceOrHash = sources.some(
    (source) => source.startsWith("'nonce-") || source.startsWith("'sha256-") || source.startsWith("'sha384-") || source.startsWith("'sha512-"),
  );

  if (sources.includes("*") || sources.includes("'unsafe-inline'")) {
    /* A nonce or a hash beside `unsafe-inline` is the documented fallback for
       old browsers: a modern one ignores `unsafe-inline` entirely when either
       is present, so penalising it there would be marking a correct policy. */
    if (!(sources.includes("'unsafe-inline'") && hasNonceOrHash)) {
      return {
        ...base,
        verdict: "weak",
        value,
        points: 12,
        note: sources.includes("*")
          ? "Skript mənbəyi «*» — hər ünvandan skript yüklənə bilir, siyasət praktiki olaraq boşdur."
          : "«unsafe-inline» var və nonce/hash ilə müşayiət olunmur — səhifəyə yazılan inline skript yenə də işləyir.",
      };
    }
  }

  if (sources.includes("'unsafe-eval'")) {
    return {
      ...base,
      verdict: "weak",
      value,
      points: 18,
      note: "«unsafe-eval» açıqdır — eval() və new Function() ilə mətndən kod qurmaq mümkün qalır.",
    };
  }

  const extras: string[] = [];
  if (!directives.has("object-src") && !directives.has("default-src")) extras.push("object-src");
  if (!directives.has("base-uri")) extras.push("base-uri");

  return {
    ...base,
    verdict: "good",
    value,
    points: 25,
    note:
      extras.length > 0
        ? `Skript mənbələri məhduddur. Əlavə olaraq ${extras.join(" və ")} direktivini də yazmaq olar.`
        : "Skript mənbələri məhduddur və təhlükəli açar sözlər yoxdur.",
  };
}

/** 180 days - the minimum the HSTS preload list requires is a year, this is half. */
const HSTS_STRONG_SECONDS = 15_552_000;

function assessHsts(map: ReadonlyMap<string, string>, https: boolean): HeaderFinding {
  const base = {
    header: "Strict-Transport-Security",
    purpose: "Brauzerə bu domenə yalnız HTTPS ilə müraciət etməyi əmr edir — http keçidi ümumiyyətlə qurulmur.",
    max: 20,
  };

  const value = headerValue(map, "strict-transport-security");

  if (!https) {
    /* The specification says a browser must ignore HSTS delivered over plain
       http, so scoring it here would reward a header that does nothing. */
    return {
      ...base,
      verdict: value === null ? "missing" : "weak",
      value,
      points: 0,
      note: "Ünvan http-dir. Bu başlıq yalnız https bağlantısında nəzərə alınır — əvvəlcə saytı https-ə keçirmək lazımdır.",
    };
  }

  if (value === null) {
    return {
      ...base,
      verdict: "missing",
      value: null,
      points: 0,
      note: "Başlıq yoxdur — ilk müraciət http ilə gedirsə, araya girən şəbəkə onu oxuya bilər.",
    };
  }

  const maxAge = Number.parseInt(/max-age\s*=\s*"?(\d+)/i.exec(value)?.[1] ?? "", 10);
  const includeSubDomains = /includesubdomains/i.test(value);

  if (!Number.isFinite(maxAge) || maxAge === 0) {
    return {
      ...base,
      verdict: "weak",
      value,
      points: 0,
      note: Number.isFinite(maxAge)
        ? "max-age=0 — bu, HSTS-i söndürən dəyərdir, brauzer yaddaşındakı qaydanı silir."
        : "«max-age» yoxdur və ya oxunmur — başlıq etibarsızdır.",
    };
  }

  const days = Math.round(maxAge / 86400);
  if (maxAge < 86400) {
    return {
      ...base,
      verdict: "weak",
      value,
      points: 8,
      note: `max-age ${maxAge} saniyədir (bir gündən az) — qoruma demək olar dərhal bitir.`,
    };
  }

  if (maxAge < HSTS_STRONG_SECONDS) {
    return {
      ...base,
      verdict: "weak",
      value,
      points: 14,
      note: `max-age ${days} gündür. Tövsiyə olunan minimum 180 gün, preload siyahısı üçün isə 1 ildir.`,
    };
  }

  return {
    ...base,
    verdict: "good",
    value,
    points: includeSubDomains ? 20 : 18,
    note: includeSubDomains
      ? `max-age ${days} gün, includeSubDomains da var — bütün alt domenlər əhatə olunur.`
      : `max-age ${days} gün. «includeSubDomains» əlavə edilsə alt domenlər də qorunar.`,
  };
}

function assessFrameOptions(map: ReadonlyMap<string, string>): HeaderFinding {
  const base = {
    header: "X-Frame-Options",
    purpose: "Saytın başqa səhifənin iframe-inə salınmasının qarşısını alır — clickjacking-ə qarşı.",
    max: 15,
  };

  const csp = headerValue(map, "content-security-policy");
  const frameAncestors = csp ? cspDirectives(csp).get("frame-ancestors") : undefined;
  const value = headerValue(map, "x-frame-options");

  if (frameAncestors && frameAncestors.length > 0) {
    const open = frameAncestors.some((source) => source === "*");
    return {
      ...base,
      verdict: open ? "weak" : "good",
      value: value ?? `CSP frame-ancestors ${frameAncestors.join(" ")}`,
      points: open ? 6 : 15,
      note: open
        ? "CSP-də «frame-ancestors *» yazılıb — hər sayt bu səhifəni iframe-ə sala bilər."
        : "CSP-nin «frame-ancestors» direktivi bu işi görür; X-Frame-Options köhnə brauzerlər üçün əlavə qalır.",
    };
  }

  if (value === null) {
    return {
      ...base,
      verdict: "missing",
      value: null,
      points: 0,
      note: "Nə X-Frame-Options, nə də CSP «frame-ancestors» var — səhifə görünməz iframe-ə salına bilər.",
    };
  }

  const upper = value.trim().toUpperCase();
  if (upper === "DENY" || upper === "SAMEORIGIN") {
    return { ...base, verdict: "good", value, points: 15, note: `«${upper}» qoyulub — iframe bağlıdır.` };
  }

  return {
    ...base,
    verdict: "weak",
    value,
    points: 6,
    note: "«ALLOW-FROM» və digər dəyərləri müasir brauzerlər nəzərə almır. Əvəzinə CSP «frame-ancestors» yazılmalıdır.",
  };
}

function assessNosniff(map: ReadonlyMap<string, string>): HeaderFinding {
  const base = {
    header: "X-Content-Type-Options",
    purpose: "Brauzerin faylın tipini məzmuna baxıb «təxmin etməsini» dayandırır.",
    max: 10,
  };

  const value = headerValue(map, "x-content-type-options");
  if (value === null) {
    return {
      ...base,
      verdict: "missing",
      value: null,
      points: 0,
      note: "Başlıq yoxdur — yüklənmiş fayl brauzerdə skript kimi şərh oluna bilər.",
    };
  }
  if (value.trim().toLowerCase() === "nosniff") {
    return { ...base, verdict: "good", value, points: 10, note: "«nosniff» qoyulub." };
  }
  return {
    ...base,
    verdict: "weak",
    value,
    points: 3,
    note: "Yeganə etibarlı dəyər «nosniff»-dir; başqa mətn yazılıbsa brauzer başlığı nəzərə almır.",
  };
}

const REFERRER_STRONG = new Set(["no-referrer", "same-origin", "strict-origin", "strict-origin-when-cross-origin"]);
const REFERRER_WEAK = new Set(["origin", "origin-when-cross-origin", "no-referrer-when-downgrade"]);

function assessReferrer(map: ReadonlyMap<string, string>): HeaderFinding {
  const base = {
    header: "Referrer-Policy",
    purpose: "Kənar sayta keçəndə hansı ünvanın «haradan gəldim» kimi göndəriləcəyini müəyyən edir.",
    max: 10,
  };

  const value = headerValue(map, "referrer-policy");
  if (value === null) {
    return {
      ...base,
      verdict: "missing",
      value: null,
      points: 0,
      note: "Başlıq yoxdur. Müasir brauzerlər defolt olaraq «strict-origin-when-cross-origin» tətbiq edir, amma bunu açıq yazmaq daha etibarlıdır.",
    };
  }

  /* A list is allowed: browsers take the last value they understand, so the
     verdict has to be about that one, not about the first. */
  const tokens = value.split(",").map((token) => token.trim().toLowerCase()).filter(Boolean);
  const effective = [...tokens].reverse().find((token) => REFERRER_STRONG.has(token) || REFERRER_WEAK.has(token) || token === "unsafe-url");

  if (effective === undefined) {
    return { ...base, verdict: "weak", value, points: 3, note: "Dəyər tanınmır — brauzer öz defoltuna qayıdır." };
  }
  if (effective === "unsafe-url") {
    return {
      ...base,
      verdict: "weak",
      value,
      points: 0,
      note: "«unsafe-url» tam ünvanı, o cümlədən sorğu parametrlərini kənar sayta göndərir.",
    };
  }
  if (REFERRER_WEAK.has(effective)) {
    return {
      ...base,
      verdict: "weak",
      value,
      points: 5,
      note: `«${effective}» domen adını kənar sayta ötürür. «strict-origin-when-cross-origin» daha dar variantdır.`,
    };
  }
  return { ...base, verdict: "good", value, points: 10, note: `«${effective}» — ünvan kənara sızmır.` };
}

function assessPermissions(map: ReadonlyMap<string, string>): HeaderFinding {
  const base = {
    header: "Permissions-Policy",
    purpose: "Kamera, mikrofon, geolokasiya kimi brauzer imkanlarını səhifə və onun iframe-ləri üçün bağlayır.",
    max: 10,
  };

  const value = headerValue(map, "permissions-policy") ?? headerValue(map, "feature-policy");
  if (value === null) {
    return {
      ...base,
      verdict: "missing",
      value: null,
      points: 0,
      note: "Başlıq yoxdur — səhifəyə düşən üçüncü tərəf skripti kamera və ya geolokasiya istəyə bilər.",
    };
  }
  if (value.trim() === "") {
    return { ...base, verdict: "weak", value, points: 3, note: "Dəyər boşdur — heç bir imkan məhdudlaşdırılmır." };
  }
  const count = value.split(",").filter((part) => part.trim() !== "").length;
  return {
    ...base,
    verdict: "good",
    value,
    points: 10,
    note: `${count} imkan üçün qayda yazılıb.`,
  };
}

function assessCoop(map: ReadonlyMap<string, string>): HeaderFinding {
  const base = {
    header: "Cross-Origin-Opener-Policy",
    purpose: "window.open ilə açılan kənar səhifənin bu pəncərəyə çıxışını kəsir.",
    max: 4,
  };

  const value = headerValue(map, "cross-origin-opener-policy");
  if (value === null) {
    return { ...base, verdict: "missing", value: null, points: 0, note: "Başlıq yoxdur." };
  }
  const token = value.trim().toLowerCase();
  if (token === "same-origin") {
    return { ...base, verdict: "good", value, points: 4, note: "«same-origin» — pəncərə tam təcrid olunub." };
  }
  if (token === "same-origin-allow-popups") {
    return {
      ...base,
      verdict: "weak",
      value,
      points: 2,
      note: "«same-origin-allow-popups» ödəniş və giriş pəncərələri üçün lazım olan güzəştdir; ehtiyac yoxdursa «same-origin» götür.",
    };
  }
  return { ...base, verdict: "weak", value, points: 0, note: "«unsafe-none» defolt davranışdır, əlavə qoruma vermir." };
}

function assessCoep(map: ReadonlyMap<string, string>): HeaderFinding {
  const base = {
    header: "Cross-Origin-Embedder-Policy",
    purpose: "Kənar resursların yalnız açıq icazə ilə yüklənməsini tələb edir; SharedArrayBuffer bunsuz işləmir.",
    max: 3,
  };

  const value = headerValue(map, "cross-origin-embedder-policy");
  if (value === null) {
    return {
      ...base,
      verdict: "missing",
      value: null,
      points: 0,
      note: "Başlıq yoxdur. Adi sayt üçün bu ciddi qüsur deyil — tələb yalnız cross-origin izolyasiya lazım olanda yaranır.",
    };
  }
  const token = value.trim().toLowerCase();
  if (token === "require-corp" || token === "credentialless") {
    return { ...base, verdict: "good", value, points: 3, note: `«${token}» qoyulub.` };
  }
  return { ...base, verdict: "weak", value, points: 0, note: "«unsafe-none» defolt davranışdır." };
}

function assessCorp(map: ReadonlyMap<string, string>): HeaderFinding {
  const base = {
    header: "Cross-Origin-Resource-Policy",
    purpose: "Bu ünvandakı faylın başqa saytın səhifəsinə yüklənməsinin qarşısını alır.",
    max: 3,
  };

  const value = headerValue(map, "cross-origin-resource-policy");
  if (value === null) {
    return { ...base, verdict: "missing", value: null, points: 0, note: "Başlıq yoxdur." };
  }
  const token = value.trim().toLowerCase();
  if (token === "same-origin" || token === "same-site") {
    return { ...base, verdict: "good", value, points: 3, note: `«${token}» qoyulub.` };
  }
  return {
    ...base,
    verdict: "weak",
    value,
    points: 1,
    note: "«cross-origin» hər sayta yükləməyə icazə verir — CDN üçün düzgün, adi səhifə üçün yox.",
  };
}

/*
 * Headers that name the software behind the site. None of them is a hole on
 * its own; together they turn "find a vulnerable version" into a search rather
 * than an experiment, which is why removing them is standard hardening.
 */
const LEAK_HEADERS: Record<string, string> = {
  server: "Veb serverin adı",
  "x-powered-by": "Tətbiqin platforması",
  "x-aspnet-version": "ASP.NET versiyası",
  "x-aspnetmvc-version": "ASP.NET MVC versiyası",
  "x-generator": "Saytı yaradan sistem",
  "x-drupal-cache": "Drupal keş vəziyyəti",
  "x-runtime": "Sorğunun icra müddəti",
  "x-served-by": "Daxili server adı",
  "x-backend-server": "Daxili server adı",
  "x-varnish": "Varnish keş qatı",
};

export type HeaderReportInput = {
  url: string;
  status: number;
  redirectedTo: string | null;
  /** Raw pairs in the order the server sent them. */
  headers: readonly (readonly [string, string])[];
  checkedAt: string;
};

/**
 * Turns a fetched response into the grade, the eight verdicts and the fix list.
 *
 * Pure on purpose: the route does the network part and hands the result here,
 * so every judgement in the tool can be checked without a server to point at.
 */
export function buildHeaderReport(input: HeaderReportInput): HeaderReport {
  const map = new Map<string, string>();
  for (const [name, value] of input.headers) {
    const key = name.toLowerCase();
    /* Repeated headers are joined the way a browser reads them, so a policy
       split across two lines is judged whole rather than by its last half. */
    const existing = map.get(key);
    map.set(key, existing === undefined ? value : `${existing}, ${value}`);
  }

  const https = input.url.startsWith("https://");

  const findings: HeaderFinding[] = [
    assessCsp(map),
    assessHsts(map, https),
    assessFrameOptions(map),
    assessNosniff(map),
    assessReferrer(map),
    assessPermissions(map),
    assessCoop(map),
    assessCoep(map),
    assessCorp(map),
  ];

  const score = findings.reduce((total, finding) => total + finding.points, 0);

  const all = input.headers.map(([name, value]) => ({
    name,
    value,
    leaks: name.toLowerCase() in LEAK_HEADERS,
  }));

  const leaks = input.headers
    .filter(([name]) => name.toLowerCase() in LEAK_HEADERS)
    .map(([name, value]) => ({
      name,
      value,
      note: /\d/.test(value)
        ? `${LEAK_HEADERS[name.toLowerCase()]} — versiya nömrəsi ilə birlikdə açıqlanır.`
        : `${LEAK_HEADERS[name.toLowerCase()]} açıqlanır.`,
    }));

  const todo = findings
    .filter((finding) => finding.points < finding.max)
    .sort((left, right) => right.max - right.points - (left.max - left.points))
    .map((finding) => `${finding.header}: ${finding.note}`);

  return {
    url: input.url,
    status: input.status,
    redirectedTo: input.redirectedTo,
    checkedAt: input.checkedAt,
    findings,
    score,
    grade: gradeFor(score),
    all,
    leaks,
    todo,
  };
}
