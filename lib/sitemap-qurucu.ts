/**
 * sitemap.xml building: a line-oriented parser that turns a pasted URL list
 * into entries, an XML builder that renders those entries back out, and a
 * splitter that keeps a file inside the sitemaps.org protocol's own limits.
 *
 * The protocol (https://www.sitemaps.org/protocol.html) caps a single sitemap
 * file at 50,000 URLs and 50MB uncompressed — cross either one and a crawler
 * is entitled to ignore the file outright, so `splitEntries` treats both as
 * hard boundaries and a `sitemap-index.xml` is how several files stay one
 * submission.
 *
 * Google has stated it does not read `priority` or `changefreq` at all
 * (https://developers.google.com/search/blog/2023/06/how-google-determines-canonical)
 * — this module still emits them, because other search engines and generic
 * crawlers do read them, but the widget built on top of this file is the
 * place that has to say so before a visitor spends time tuning numbers Google
 * throws away.
 */

export type ChangeFreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export const CHANGE_FREQ_VALUES: ChangeFreq[] = [
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
];

export type SitemapEntry = {
  /** Absolute, percent-encoded — see `encodeLoc`. Never relative. */
  loc: string;
  /** W3C Datetime (`YYYY-MM-DD` or a full ISO stamp), or absent. */
  lastmod: string | null;
  changefreq: ChangeFreq | null;
  /** Clamped to 0.0-1.0 by the time it reaches an entry. */
  priority: number | null;
};

export type SitemapDefaults = {
  changefreq: ChangeFreq | null;
  priority: number | null;
  /**
   * Already resolved to a concrete W3C date (or `null`) by the caller — the
   * "current date" vs "typed by hand" choice is a widget-level concern (it
   * needs `Date.now()`, which would make this module's output depend on the
   * clock it happens to run under). This module only ever validates and
   * formats what it is handed.
   */
  lastmod: string | null;
};

export type ParseIssue = {
  severity: "xeta" | "xeberdarliq";
  /**
   * 1-based line number in the pasted text. `0` marks an issue that belongs
   * to the shared defaults rather than one line — a clamped priority, for
   * instance, applies to every entry at once.
   */
  line: number;
  message: string;
};

export type ParseResult = {
  entries: SitemapEntry[];
  /** How many parsed URLs were dropped for repeating one already kept. */
  duplicates: number;
  issues: ParseIssue[];
};

/** sitemaps.org protocol: at most 50,000 URLs per sitemap file. */
export const MAX_URLS_PER_FILE = 50_000;

/** sitemaps.org protocol: at most 50MB uncompressed per sitemap file. */
export const MAX_BYTES_PER_FILE = 50 * 1024 * 1024;

const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/** A URL past this length still works, but is long enough to be worth flagging. */
const LONG_URL_WARNING_LENGTH = 2048;

/* ---------- XML escaping and URL encoding ---------- */

/**
 * The five characters XML forbids unescaped inside text content. `&` is
 * replaced first and only once, so a literal `&` in a query string
 * (`?a=1&b=2`, the common case) becomes `&amp;` and never `&amp;amp;` — the
 * later replacements only ever see the already-produced `&amp;` as a whole
 * and have nothing of their own left to touch inside it.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Percent-encodes a URL the way a browser address bar does, by handing it to
 * the platform's own `URL` parser and reading `href` back. That parser
 * percent-encodes every non-ASCII byte — a Cyrillic or Azerbaijani-specific
 * letter such as the schwa (Unicode U+0259) comes out as `%C9%99` — while
 * leaving an already-encoded `%20` alone, because it recognises `%` as a
 * character the path/query grammar already allows unescaped and never
 * re-escapes it into `%2520`. Throws exactly when `url` is not absolute;
 * callers validate with the same constructor first, so this is only reached
 * with a URL already known to parse.
 */
export function encodeLoc(url: string): string {
  return new URL(url).href;
}

/** A relative reference has no scheme; `new URL` requires one when given no base. */
function parseAbsoluteUrl(value: string): { ok: true; url: URL } | { ok: false } {
  try {
    return { ok: true, url: new URL(value) };
  } catch {
    return { ok: false };
  }
}

/* ---------- date normalisation ---------- */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** Catches the overflow a regex alone lets through — `2024-02-30` is shaped like a date but is not one. */
function isRealCalendarDate(year: number, month1to12: number, day: number): boolean {
  const asUtc = new Date(Date.UTC(year, month1to12 - 1, day));
  return (
    asUtc.getUTCFullYear() === year && asUtc.getUTCMonth() === month1to12 - 1 && asUtc.getUTCDate() === day
  );
}

/**
 * The two shapes the sitemap protocol accepts (a W3C Datetime subset): a
 * bare date, or a full date-time with an explicit `Z` or numeric offset. A
 * string that merely parses under `new Date` but is not one of these two
 * shapes — "March 2024", "2024/01/01" — is rejected rather than reformatted,
 * because guessing at a visitor's intended format is how a wrong date ends
 * up looking plausible.
 */
function normalizeLastmod(raw: string): string | null {
  const value = raw.trim();

  if (DATE_ONLY.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return isRealCalendarDate(year, month, day) ? value : null;
  }

  if (DATE_TIME.test(value)) {
    const [datePart, timePart] = value.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    if (!isRealCalendarDate(year, month, day)) return null;
    const hour = Number(timePart.slice(0, 2));
    const minute = Number(timePart.slice(3, 5));
    const second = timePart.length >= 8 && timePart[5] === ":" ? Number(timePart.slice(6, 8)) : 0;
    if (hour > 23 || minute > 59 || second > 59) return null;
    return Number.isNaN(new Date(value).getTime()) ? null : value;
  }

  return null;
}

/* ---------- priority clamping ---------- */

function clampPriority(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/* ---------- line parsing ---------- */

/**
 * The URL and the optional `lastmod` column share one line, separated by a
 * comma or a tab. A tab is unambiguous — no URL contains one — so it is
 * tried first; a comma is resolved by its *last* occurrence, on the
 * assumption that a trailing date column is more likely than a literal comma
 * inside the URL itself. A URL that both omits the date column and contains
 * a comma (rare — commas are legal but unusual in a path or query) will be
 * misread; there is no separator choice that avoids that without a quoting
 * convention this plain-text format does not have.
 */
function splitLine(line: string): { url: string; lastmodRaw: string } {
  const tabIndex = line.indexOf("\t");
  if (tabIndex !== -1) {
    return { url: line.slice(0, tabIndex).trim(), lastmodRaw: line.slice(tabIndex + 1).trim() };
  }
  const commaIndex = line.lastIndexOf(",");
  if (commaIndex !== -1) {
    return { url: line.slice(0, commaIndex).trim(), lastmodRaw: line.slice(commaIndex + 1).trim() };
  }
  return { url: line.trim(), lastmodRaw: "" };
}

const NON_ASCII = /[^\x00-\x7F]/;

/**
 * Reads the pasted textarea: one URL per line, an optional `lastmod` column,
 * and the three site-wide defaults filled in where a line does not override
 * them. Every rejection and correction below is recorded in `issues` rather
 * than thrown — a paste of a few hundred URLs with one bad line should still
 * produce a sitemap for the rest.
 */
export function parseUrlList(text: string, defaults: SitemapDefaults): ParseResult {
  const issues: ParseIssue[] = [];

  let defaultPriority: number | null = null;
  if (defaults.priority !== null) {
    defaultPriority = clampPriority(defaults.priority);
    if (defaultPriority !== defaults.priority) {
      issues.push({
        severity: "xeberdarliq",
        line: 0,
        message: `priority ${defaults.priority} 0–1 aralığına salındı: ${defaultPriority}`,
      });
    }
  }

  let defaultLastmod: string | null = null;
  if (defaults.lastmod !== null && defaults.lastmod.trim() !== "") {
    defaultLastmod = normalizeLastmod(defaults.lastmod);
    if (defaultLastmod === null) {
      issues.push({
        severity: "xeta",
        line: 0,
        message: `defolt lastmod tarixi tanınmadı və boş buraxıldı: "${defaults.lastmod}"`,
      });
    }
  }

  const rawEntries: { entry: SitemapEntry; host: string; line: number }[] = [];

  const lines = text.split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index].trim();
    if (rawLine === "") continue;

    const { url, lastmodRaw } = splitLine(rawLine);
    if (url === "") {
      issues.push({ severity: "xeta", line: lineNumber, message: "URL xanası boşdur" });
      continue;
    }

    const parsed = parseAbsoluteUrl(url);
    if (!parsed.ok) {
      issues.push({
        severity: "xeta",
        line: lineNumber,
        message: `nisbi URL rədd olundu, <loc> mütləq olmalıdır: "${url}"`,
      });
      continue;
    }

    if (NON_ASCII.test(url)) {
      issues.push({
        severity: "xeberdarliq",
        line: lineNumber,
        message: "URL faiz-kodlandı (azərbaycan/kiril hərfləri %XX oldu)",
      });
    }

    const loc = encodeLoc(url);
    if (loc.length > LONG_URL_WARNING_LENGTH) {
      issues.push({
        severity: "xeberdarliq",
        line: lineNumber,
        message: `URL ${loc.length} simvoldur: 2048 həddini keçir`,
      });
    }

    let lastmod: string | null = defaultLastmod;
    if (lastmodRaw !== "") {
      const normalized = normalizeLastmod(lastmodRaw);
      if (normalized === null) {
        issues.push({
          severity: "xeta",
          line: lineNumber,
          message: `tarix tanınmadı və atıldı: "${lastmodRaw}"`,
        });
      } else {
        lastmod = normalized;
      }
    }

    rawEntries.push({
      entry: { loc, lastmod, changefreq: defaults.changefreq, priority: defaultPriority },
      host: parsed.url.host,
      line: lineNumber,
    });
  }

  /* Mixed hosts: one sitemap file is only supposed to carry one host's URLs,
     so every entry disagreeing with whichever host is in the majority gets a
     warning naming the mismatch. A tie keeps the first host seen. */
  if (rawEntries.length > 0) {
    const hostCounts = new Map<string, number>();
    for (const { host } of rawEntries) hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
    let primaryHost = rawEntries[0].host;
    let bestCount = 0;
    for (const [host, count] of hostCounts) {
      if (count > bestCount) {
        bestCount = count;
        primaryHost = host;
      }
    }
    for (const { host, line } of rawEntries) {
      if (host !== primaryHost) {
        issues.push({
          severity: "xeberdarliq",
          line,
          message: `fərqli host: "${host}", sitemap-in əsas hostu "${primaryHost}"`,
        });
      }
    }
  }

  const seen = new Set<string>();
  const entries: SitemapEntry[] = [];
  let duplicates = 0;
  for (const { entry } of rawEntries) {
    if (seen.has(entry.loc)) {
      duplicates += 1;
      continue;
    }
    seen.add(entry.loc);
    entries.push(entry);
  }

  return { entries, duplicates, issues };
}

/* ---------- rendering ---------- */

function renderUrlBlock(entry: SitemapEntry): string {
  const lines = ["  <url>", `    <loc>${escapeXml(entry.loc)}</loc>`];
  if (entry.lastmod !== null) lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
  if (entry.changefreq !== null) lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
  if (entry.priority !== null) lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
  lines.push("  </url>");
  return lines.join("\n");
}

/** Renders `<urlset>`. An empty `entries` array is a valid, empty sitemap — not an error. */
export function buildSitemap(entries: SitemapEntry[]): string {
  const blocks = entries.map(renderUrlBlock);
  return [XML_DECLARATION, `<urlset xmlns="${SITEMAP_NAMESPACE}">`, ...blocks, "</urlset>"].join("\n") + "\n";
}

/**
 * Renders the `sitemap-index.xml` that lists several split files. `baseUrl`
 * is the folder they will be served from — trailing slashes are trimmed so
 * doubling one is not possible.
 */
export function buildSitemapIndex(fileNames: string[], baseUrl: string, lastmod: string | null): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const blocks = fileNames.map((fileName) => {
    const lines = ["  <sitemap>", `    <loc>${escapeXml(`${trimmedBase}/${fileName}`)}</loc>`];
    if (lastmod !== null) lines.push(`    <lastmod>${escapeXml(lastmod)}</lastmod>`);
    lines.push("  </sitemap>");
    return lines.join("\n");
  });
  return (
    [XML_DECLARATION, `<sitemapindex xmlns="${SITEMAP_NAMESPACE}">`, ...blocks, "</sitemapindex>"].join("\n") + "\n"
  );
}

const EMPTY_ENVELOPE_BYTES = new TextEncoder().encode(buildSitemap([])).length;

/**
 * Splits entries into files that each respect both sitemaps.org limits —
 * 50,000 URLs and 50MB uncompressed — whichever is hit first. Byte size is
 * measured with `TextEncoder`, i.e. real UTF-8 bytes, not UTF-16 code units,
 * because `.length` on a string undercounts the moment a multi-byte
 * character is in the mix and the 50MB cap is a byte cap.
 *
 * Returns `[]` for no entries, one chunk when everything fits, several
 * chunks otherwise — the caller decides from the chunk count whether a
 * `sitemap-index.xml` is needed at all.
 */
export function splitEntries(entries: SitemapEntry[]): SitemapEntry[][] {
  if (entries.length === 0) return [];

  const chunks: SitemapEntry[][] = [];
  let current: SitemapEntry[] = [];
  let currentBytes = EMPTY_ENVELOPE_BYTES;

  for (const entry of entries) {
    const entryBytes = new TextEncoder().encode(renderUrlBlock(entry) + "\n").length;
    const wouldExceedCount = current.length + 1 > MAX_URLS_PER_FILE;
    const wouldExceedBytes = currentBytes + entryBytes > MAX_BYTES_PER_FILE;
    if (current.length > 0 && (wouldExceedCount || wouldExceedBytes)) {
      chunks.push(current);
      current = [];
      currentBytes = EMPTY_ENVELOPE_BYTES;
    }
    current.push(entry);
    currentBytes += entryBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
