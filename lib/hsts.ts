/**
 * Reading `Strict-Transport-Security` the way a browser does, and the way
 * Chrome's preload list does — which are two different bars.
 *
 * A browser accepts the header the moment `max-age` parses to a positive
 * number: the site is pinned to HTTPS for that long, full stop. The preload
 * list is stricter on purpose, because it ships the pin to every browser
 * before that browser has ever visited the site at all, with no way back
 * short of a browser release — so it requires a full year, every subdomain
 * covered, and an explicit `preload` token nobody types by accident. A header
 * can satisfy the first bar and fail the second, and a tool that only checked
 * presence would call that site done when it is only halfway there.
 *
 * The route does the fetching (the header value over https, whether the same
 * header leaked over plain http, and whether http redirects to https at all)
 * and hands the three facts here, which is what keeps this file offline and
 * checkable without a server to point at.
 */

export type HstsDirectives = {
  maxAgeSeconds: number | null;
  includeSubDomains: boolean;
  preload: boolean;
};

/** The header lets `max-age` repeat or camel-case its neighbours; only the first parseable value of each is kept. */
export function parseHstsHeader(value: string): HstsDirectives {
  const maxAgeMatch = /max-age\s*=\s*"?(-?\d+)"?/i.exec(value);
  const maxAgeSeconds = maxAgeMatch ? Number.parseInt(maxAgeMatch[1], 10) : null;

  return {
    maxAgeSeconds: maxAgeSeconds !== null && Number.isFinite(maxAgeSeconds) && maxAgeSeconds >= 0 ? maxAgeSeconds : null,
    includeSubDomains: /(?:^|;)\s*includesubdomains\s*(?:;|$)/i.test(value),
    preload: /(?:^|;)\s*preload\s*(?:;|$)/i.test(value),
  };
}

/** One year, to the second — the preload list's own floor, not a rounded approximation of it. */
export const PRELOAD_MIN_MAX_AGE = 31_536_000;

/** A duration below this reads as decorative rather than protective. */
const WEAK_MAX_AGE = 86_400 * 180;

/**
 * `max-age` in seconds, in the words a visitor reads rather than a raw
 * number. Down-shifts to the next smaller unit once the count would
 * otherwise round to zero in the one above it, so a five-minute value never
 * prints as a rounded-down zero of a much larger unit.
 */
export function formatMaxAge(seconds: number): string {
  if (seconds <= 0) return "0 saniyə: HSTS söndürülür";
  const days = Math.floor(seconds / 86_400);
  if (days >= 365) {
    const years = (days / 365).toFixed(1).replace(/\.0$/, "");
    return `${days} gün (≈${years} il)`;
  }
  if (days >= 1) return `${days} gün`;
  const hours = Math.floor(seconds / 3_600);
  if (hours >= 1) return `${hours} saat`;
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 1) return `${minutes} dəqiqə`;
  return `${seconds} saniyə`;
}

export type PreloadRequirement = { met: boolean; label: string };

export type HstsReport = {
  present: boolean;
  directives: HstsDirectives | null;
  humanMaxAge: string | null;
  maxAgeStrength: "yoxdur" | "zeif" | "yaxsi";
  /** True when the *plain http* response also carried the header — the spec says a browser must ignore it there, so this is dead weight rather than protection. */
  httpLeaksHeader: boolean;
  /** Whether an http request to the same host redirects to https at all. Null when the caller did not check. */
  httpRedirectsToHttps: boolean | null;
  preloadEligible: boolean;
  preloadRequirements: PreloadRequirement[];
  summary: string;
};

export type HstsCheckInput = {
  /** The header value from the https response, or null when absent. */
  httpsValue: string | null;
  /** The header value from the plain http response, or null when absent. */
  httpValue: string | null;
  httpRedirectsToHttps: boolean | null;
};

/**
 * Turns the three fetched facts into the full report: parsed directives,
 * strength against a plain-browser bar, and eligibility against the stricter
 * preload bar with the exact missing requirements named.
 */
export function evaluateHsts(input: HstsCheckInput): HstsReport {
  const { httpsValue, httpValue, httpRedirectsToHttps } = input;
  const httpLeaksHeader = httpValue !== null;

  if (httpsValue === null) {
    return {
      present: false,
      directives: null,
      humanMaxAge: null,
      maxAgeStrength: "yoxdur",
      httpLeaksHeader,
      httpRedirectsToHttps,
      preloadEligible: false,
      preloadRequirements: [
        { met: false, label: `max-age ən azı ${PRELOAD_MIN_MAX_AGE} saniyə (1 il) olmalıdır` },
        { met: false, label: "includeSubDomains yazılmalıdır" },
        { met: false, label: "preload açar sözü yazılmalıdır" },
      ],
      summary: "Strict-Transport-Security başlığı yoxdur: ilk müraciət http ilə gedərsə, araya girən şəbəkə onu oxuya bilər.",
    };
  }

  const directives = parseHstsHeader(httpsValue);
  const { maxAgeSeconds, includeSubDomains, preload } = directives;

  const maxAgeStrength: HstsReport["maxAgeStrength"] =
    maxAgeSeconds === null || maxAgeSeconds === 0 ? "yoxdur" : maxAgeSeconds < WEAK_MAX_AGE ? "zeif" : "yaxsi";

  const preloadRequirements: PreloadRequirement[] = [
    {
      met: maxAgeSeconds !== null && maxAgeSeconds >= PRELOAD_MIN_MAX_AGE,
      label: `max-age ən azı ${PRELOAD_MIN_MAX_AGE} saniyə (1 il) olmalıdır`,
    },
    { met: includeSubDomains, label: "includeSubDomains yazılmalıdır" },
    { met: preload, label: "preload açar sözü yazılmalıdır" },
  ];
  const preloadEligible = preloadRequirements.every((requirement) => requirement.met);

  let summary: string;
  if (maxAgeSeconds === null) {
    summary = "Başlıq var, amma «max-age» oxunmadı. Dəyər etibarsızdır və brauzer onu tətbiq etmir.";
  } else if (maxAgeSeconds === 0) {
    summary = "«max-age=0» yazılıb: bu HSTS-i söndürən dəyərdir, brauzer yaddaşındakı qaydanı dərhal silir.";
  } else if (maxAgeStrength === "zeif") {
    summary = `max-age ${formatMaxAge(maxAgeSeconds)}, tövsiyə olunan minimum 180 gündür.`;
  } else if (preloadEligible) {
    summary = `max-age ${formatMaxAge(maxAgeSeconds)}, includeSubDomains və preload da var: preload siyahısına müraciət üçün bütün şərtlər ödənir.`;
  } else {
    summary = `max-age ${formatMaxAge(maxAgeSeconds)}: adi qoruma kifayətdir, preload siyahısı üçün isə aşağıdakı şərtlər çatmır.`;
  }

  return {
    present: true,
    directives,
    humanMaxAge: maxAgeSeconds === null ? null : formatMaxAge(maxAgeSeconds),
    maxAgeStrength,
    httpLeaksHeader,
    httpRedirectsToHttps,
    preloadEligible,
    preloadRequirements,
    summary,
  };
}
