/**
 * `hreflang` tag building and auditing: the pair {language code, URL} a
 * multilingual page hands a crawler, in three interchangeable shapes
 * (`<link>` tags, an HTTP `Link:` header, a sitemap's `<xhtml:link>` block —
 * all three say the same thing to the same audience of one, Googlebot and
 * friends), plus the audit that catches the ways a hand-written set of them
 * quietly stops working.
 *
 * The one fact worth stating up front, because it drives half the audit: a
 * crawler does not treat one page's hreflang list as advice about that page
 * alone. It expects the whole set to be reciprocal — every URL in the list
 * must itself carry a hreflang set naming every other URL, including itself.
 * A missing self-reference or a code pointing at two different URLs both
 * break that expectation silently; nothing 404s, the tag set is just wrong.
 */
import { escapeHtmlAttribute } from "./meta";

export type HreflangEntry = { code: string; url: string };

export type CodeCheck = {
  ok: boolean;
  /** Lowercase ISO 639-1, or `null` for `x-default` and for a code too malformed to extract one from. */
  language: string | null;
  /** Uppercase ISO 3166-1 alpha-2, or `null` when the code carries no region. */
  region: string | null;
  /** A sentence naming the language when it is recognised, or explaining that the format is fine but the language unfamiliar. `null` when the code is invalid. */
  label: string | null;
  /** Why the code was rejected, in Azerbaijani, or `null` when it is valid. */
  problem: string | null;
};

/*
 * Not every language a site might target — the ones an Azerbaijani-audience
 * site actually reaches for, named rather than guessed. A code outside this
 * list is not treated as wrong: `checkLanguageCode` still accepts anything
 * that is the right *shape*, and says plainly that it does not know the name
 * rather than inventing one.
 */
const KNOWN_LANGUAGES: Record<string, string> = {
  az: "Azərbaycan dili",
  en: "İngilis dili",
  ru: "Rus dili",
  tr: "Türk dili",
  ar: "Ərəb dili",
  fa: "Fars dili",
  de: "Alman dili",
  fr: "Fransız dili",
  es: "İspan dili",
  it: "İtalyan dili",
  zh: "Çin dili",
  ka: "Gürcü dili",
  uk: "Ukrayna dili",
};

/*
 * The one code on this list that is worth a sentence of its own. "uk" reads
 * as "United Kingdom" to almost everyone who is not thinking in ISO 639-1,
 * and it is not — it is Ukrainian. The code a British-English page actually
 * wants is `en-GB`; there is no country dimension in a bare two-letter
 * hreflang value at all.
 */
const UK_TRAP_NOTE =
  ' — DİQQƏT: bu, Böyük Britaniya demək DEYİL. "uk" ISO 639-1-də Ukrayna dilini bildirir; Böyük Britaniya ingiliscəsi üçün "en-GB" işlədilir. Bu, hreflang-da ən çox yayılan səhvdir.';

function languageLabel(language: string): string {
  const known = KNOWN_LANGUAGES[language];
  if (known === undefined) {
    return "Format düzgündür, amma bu dil kodu tanınmır — uydurma ad vermirik.";
  }
  return language === "uk" ? `${known}${UK_TRAP_NOTE}` : known;
}

const LANGUAGE_PART = /^[A-Za-z]{2}$/;
const REGION_PART = /^[A-Za-z]{2}$/;

/**
 * Accepts only what `hreflang` is actually specified to carry: an ISO 639-1
 * language, optionally followed by `-` and an ISO 3166-1 alpha-2 region, or
 * the literal `x-default`. Script subtags (`az-Latn-AZ`), three-letter
 * region codes and underscore separators are all real things somebody
 * pastes and all three are rejected here, each with the reason named.
 */
export function checkLanguageCode(raw: string): CodeCheck {
  const code = raw.trim();

  if (code === "") {
    return { ok: false, language: null, region: null, label: null, problem: "Boş dil kodu." };
  }

  if (code.toLowerCase() === "x-default") {
    return {
      ok: true,
      language: null,
      region: null,
      label: "x-default: ziyarətçinin dili siyahıdakı heç bir kodla üst-üstə düşmürsə göstərilən fallback.",
      problem: null,
    };
  }

  if (code.includes("_")) {
    return {
      ok: false,
      language: null,
      region: null,
      label: null,
      problem: `"${code}" — ayırıcı alt xətt (_) yox, defis (-) olmalıdır, məsələn "az-AZ".`,
    };
  }

  const parts = code.split("-");
  if (parts.length > 2) {
    return {
      ok: false,
      language: null,
      region: null,
      label: null,
      problem: `"${code}" — yalnız dil ("az") və ya dil-ölkə ("az-AZ") formatı qəbul olunur, üçüncü hissə (məsələn skript alt-kodu) dəstəklənmir.`,
    };
  }

  const [languagePart, regionPart] = parts;
  if (!LANGUAGE_PART.test(languagePart)) {
    return {
      ok: false,
      language: null,
      region: null,
      label: null,
      problem: `"${languagePart}" ISO 639-1 dil kodu deyil — iki hərfli olmalıdır (məsələn "az", "en"). Dilin tam adını yox, kodunu yaz.`,
    };
  }

  const language = languagePart.toLowerCase();

  if (regionPart === undefined) {
    return { ok: true, language, region: null, label: languageLabel(language), problem: null };
  }

  if (!REGION_PART.test(regionPart)) {
    return {
      ok: false,
      language,
      region: null,
      label: null,
      problem: `"${regionPart}" ISO 3166-1 alpha-2 ölkə kodu deyil — iki hərfli olmalıdır (məsələn "AZ"), "${regionPart}" ${regionPart.length} hərflidir.`,
    };
  }

  const region = regionPart.toUpperCase();
  return { ok: true, language, region, label: languageLabel(language), problem: null };
}

/** One `<link>` line per entry — the form that goes in `<head>`. */
export function buildLinkTags(entries: HreflangEntry[]): string {
  return entries
    .map(
      (entry) =>
        `<link rel="alternate" hreflang="${escapeHtmlAttribute(entry.code)}" href="${escapeHtmlAttribute(entry.url)}" />`,
    )
    .join("\n");
}

/**
 * One `Link:` field per entry, for a non-HTML resource (a PDF, say) where
 * there is no `<head>` to put a tag in. HTTP allows a field name to repeat,
 * so these are meant to be sent as separate header lines rather than joined
 * into one with commas.
 */
export function buildHttpHeader(entries: HreflangEntry[]): string {
  return entries
    .map(
      (entry) =>
        `Link: <${escapeHtmlAttribute(entry.url)}>; rel="alternate"; hreflang="${escapeHtmlAttribute(entry.code)}"`,
    )
    .join("\n");
}

/** One `<url>` block, `<loc>` plus one `<xhtml:link>` per entry — the form a sitemap carries when the site would rather not add tags to every page's `<head>`. */
export function buildSitemapBlock(pageUrl: string, entries: HreflangEntry[]): string {
  const lines = [
    "<url>",
    `  <loc>${escapeHtmlAttribute(pageUrl)}</loc>`,
    ...entries.map(
      (entry) =>
        `  <xhtml:link rel="alternate" hreflang="${escapeHtmlAttribute(entry.code)}" href="${escapeHtmlAttribute(entry.url)}"/>`,
    ),
    "</url>",
  ];
  return lines.join("\n");
}

export type HreflangIssue = {
  severity: "xeta" | "xeberdarliq";
  message: string;
  entry: HreflangEntry | null;
};

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Everything wrong with a hreflang set that is checkable without asking the
 * other pages what they say — code shape, self-reference, duplicate codes,
 * relative URLs, a missing `x-default`, and the `uk`-is-not-Britain trap by
 * name. `selfUrl` is the URL of the page this set is meant to sit on; `null`
 * when the visitor has not said which one that is, which skips only the
 * self-reference check and nothing else.
 */
export function auditHreflang(entries: HreflangEntry[], selfUrl: string | null): HreflangIssue[] {
  const issues: HreflangIssue[] = [];

  for (const entry of entries) {
    const check = checkLanguageCode(entry.code);
    if (!check.ok) {
      issues.push({ severity: "xeta", message: `"${entry.code}" — ${check.problem}`, entry });
    } else if (check.language === "uk") {
      issues.push({
        severity: "xeberdarliq",
        message: `"${entry.url}" sətrində hreflang="uk" yazılıb${UK_TRAP_NOTE}`,
        entry,
      });
    }

    if (!isAbsoluteHttpUrl(entry.url)) {
      issues.push({
        severity: "xeta",
        message: `"${entry.url}" mütləq URL deyil — hreflang sxem daxil olmaqla tam ünvan tələb edir (https://sayt.com/... kimi), nisbi yol qəbul etmir.`,
        entry,
      });
    }
  }

  const urlsByCode = new Map<string, Set<string>>();
  for (const entry of entries) {
    const key = entry.code.trim().toLowerCase();
    const urls = urlsByCode.get(key) ?? new Set<string>();
    urls.add(entry.url.trim());
    urlsByCode.set(key, urls);
  }
  for (const [code, urls] of urlsByCode) {
    if (urls.size > 1) {
      issues.push({
        severity: "xeta",
        message: `"${code}" dil kodu ${urls.size} fərqli URL-ə verilib — hər kod yalnız bir URL-i göstərə bilər, yoxsa crawler hansının doğru olduğunu bilmir.`,
        entry: null,
      });
    }
  }

  if (selfUrl !== null && selfUrl.trim() !== "") {
    const trimmedSelf = selfUrl.trim();
    const hasSelfReference = entries.some((entry) => entry.url.trim() === trimmedSelf);
    if (!hasSelfReference) {
      issues.push({
        severity: "xeta",
        message: `Özünə istinad yoxdur — "${trimmedSelf}" özü də bu hreflang dəstində sadalanmalıdır. Hər səhifə, o cümlədən özü, tam dəsti daşımalıdır.`,
        entry: null,
      });
    }
  }

  const hasDefault = entries.some((entry) => entry.code.trim().toLowerCase() === "x-default");
  if (!hasDefault) {
    issues.push({
      severity: "xeberdarliq",
      message:
        "x-default yoxdur — dili siyahıdakı heç bir kodla üst-üstə düşməyən ziyarətçi üçün hansı səhifənin göstəriləcəyi deyilməyib.",
      entry: null,
    });
  }

  return issues;
}

const LINK_TAG = /<link\b[^>]*>/gi;
const ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  ATTRIBUTE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE.exec(tag)) !== null) {
    const [, name, doubleQuoted, singleQuoted] = match;
    attributes[name.toLowerCase()] = doubleQuoted !== undefined ? doubleQuoted : (singleQuoted ?? "");
  }
  return attributes;
}

/**
 * Pulls `{code, url}` pairs out of a pasted block of `<link>` tags — the
 * shape a visitor copies straight out of a page's `<head>`. Only
 * `rel="alternate"` tags carrying both `hreflang` and `href` count; a
 * `rel="canonical"` or `rel="stylesheet"` tag sitting in the same paste is
 * silently not a hreflang entry, not a parse error.
 */
export function parseHreflangHtml(html: string): HreflangEntry[] {
  const entries: HreflangEntry[] = [];
  LINK_TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_TAG.exec(html)) !== null) {
    const attributes = parseAttributes(match[0]);
    if ((attributes.rel ?? "").trim().toLowerCase() !== "alternate") continue;
    if (attributes.hreflang === undefined || attributes.href === undefined) continue;
    entries.push({ code: attributes.hreflang, url: attributes.href });
  }
  return entries;
}
