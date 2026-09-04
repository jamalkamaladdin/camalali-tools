/*
 * The sitemap builder has three jobs worth proving on their own: XML escaping
 * has to survive a URL that already contains `&` without doubling it,
 * percent-encoding has to reach non-ASCII letters, and the 50,000-URL /
 * 50MB sitemaps.org ceiling has to actually split a file rather than emit
 * one that crawlers are entitled to ignore.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildSitemap,
  buildSitemapIndex,
  escapeXml,
  MAX_URLS_PER_FILE,
  parseUrlList,
  splitEntries,
  type SitemapDefaults,
} from "../lib/sitemap-qurucu";

const NO_DEFAULTS: SitemapDefaults = { changefreq: null, priority: null, lastmod: null };

export const checks: CheckSuite = (check) => {
  const ampersand = parseUrlList("https://sayt.com/axtar?a=1&b=2", NO_DEFAULTS);
  const ampersandXml = buildSitemap(ampersand.entries);
  check(
    "sitemap-qurucu: a literal & in a query string becomes &amp; and is never double-escaped",
    ampersandXml.includes("&amp;") && !ampersandXml.includes("&amp;amp;"),
    `xml: ${ampersandXml}`,
  );

  const azLetter = parseUrlList("https://sayt.com/haqqımızda", NO_DEFAULTS);
  check(
    "sitemap-qurucu: an Azerbaijani letter (ə/ı) is percent-encoded in <loc>",
    azLetter.entries.length === 1 && azLetter.entries[0].loc.includes("%C4%B1") && !/[^\x00-\x7F]/.test(azLetter.entries[0].loc),
    `loc: ${azLetter.entries[0]?.loc}`,
  );

  const relative = parseUrlList("/bloq/yazi\nhttps://sayt.com/ok", NO_DEFAULTS);
  check(
    "sitemap-qurucu: a relative URL is rejected, the absolute one on the next line still parses",
    relative.entries.length === 1 &&
      relative.entries[0].loc === "https://sayt.com/ok" &&
      relative.issues.some((issue) => issue.severity === "xeta" && issue.line === 1),
    `entries: ${JSON.stringify(relative.entries)}, issues: ${JSON.stringify(relative.issues)}`,
  );

  const duplicate = parseUrlList("https://sayt.com/a\nhttps://sayt.com/a\nhttps://sayt.com/b", NO_DEFAULTS);
  check(
    "sitemap-qurucu: a repeated URL is kept once and the drop count is reported",
    duplicate.entries.length === 2 && duplicate.duplicates === 1,
    `entries: ${duplicate.entries.length}, duplicates: ${duplicate.duplicates}`,
  );

  const clampedPriority = parseUrlList("https://sayt.com/a", { ...NO_DEFAULTS, priority: 1.7 });
  check(
    "sitemap-qurucu: an out-of-range priority (1.7) is clamped into 0-1",
    clampedPriority.entries[0]?.priority === 1 &&
      clampedPriority.issues.some((issue) => issue.severity === "xeberdarliq"),
    `priority: ${clampedPriority.entries[0]?.priority}, issues: ${JSON.stringify(clampedPriority.issues)}`,
  );

  const badDate = parseUrlList("https://sayt.com/a,2024-13-40", NO_DEFAULTS);
  check(
    "sitemap-qurucu: an invalid calendar date is dropped and reported, the URL still parses",
    badDate.entries.length === 1 &&
      badDate.entries[0].lastmod === null &&
      badDate.issues.some((issue) => issue.severity === "xeta" && issue.line === 1),
    `entries: ${JSON.stringify(badDate.entries)}, issues: ${JSON.stringify(badDate.issues)}`,
  );

  const manyUrls = Array.from({ length: MAX_URLS_PER_FILE + 1 }, (_, i) => `https://sayt.com/p${i}`).join("\n");
  const manyParsed = parseUrlList(manyUrls, NO_DEFAULTS);
  const manyChunks = splitEntries(manyParsed.entries);
  check(
    "sitemap-qurucu: 50,001 URLs split into two files, the first capped at the 50,000 limit",
    manyChunks.length === 2 && manyChunks[0].length === MAX_URLS_PER_FILE && manyChunks[1].length === 1,
    `chunk sizes: ${manyChunks.map((chunk) => chunk.length).join(", ")}`,
  );

  const indexXml = buildSitemapIndex(["sitemap-1.xml", "sitemap-2.xml"], "https://sayt.com/", "2026-01-01");
  check(
    "sitemap-qurucu: buildSitemapIndex emits a sitemapindex root with both files and no doubled slash",
    indexXml.includes("<sitemapindex") &&
      indexXml.includes("<loc>https://sayt.com/sitemap-1.xml</loc>") &&
      indexXml.includes("<loc>https://sayt.com/sitemap-2.xml</loc>") &&
      !indexXml.includes("//sitemap-1"),
    `xml: ${indexXml}`,
  );

  const empty = parseUrlList("   \n\n  ", NO_DEFAULTS);
  check(
    "sitemap-qurucu: an empty/whitespace-only input parses to zero entries without throwing",
    empty.entries.length === 0 && empty.duplicates === 0 && empty.issues.length === 0,
    `result: ${JSON.stringify(empty)}`,
  );

  const declaration = buildSitemap([]);
  check(
    "sitemap-qurucu: output starts with the XML declaration",
    declaration.startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
    `head: ${declaration.slice(0, 60)}`,
  );

  const mixedHost = parseUrlList("https://sayt.com/a\nhttps://basqa.com/b\nhttps://sayt.com/c", NO_DEFAULTS);
  check(
    "sitemap-qurucu: a URL from a different host is kept but flagged as a mismatch",
    mixedHost.entries.length === 3 &&
      mixedHost.issues.some((issue) => issue.severity === "xeberdarliq" && issue.line === 2 && issue.message.includes("basqa.com")),
    `issues: ${JSON.stringify(mixedHost.issues)}`,
  );

  const longUrl = `https://sayt.com/${"a".repeat(2100)}`;
  const longParsed = parseUrlList(longUrl, NO_DEFAULTS);
  check(
    "sitemap-qurucu: a URL over 2048 characters is kept but produces a length warning",
    longParsed.entries.length === 1 &&
      longParsed.issues.some((issue) => issue.severity === "xeberdarliq" && issue.message.includes("2048")),
    `issues: ${JSON.stringify(longParsed.issues)}`,
  );

  check(
    "sitemap-qurucu: escapeXml handles all five reserved characters in one pass",
    escapeXml(`&<>"'`) === "&amp;&lt;&gt;&quot;&apos;",
    `escaped: ${escapeXml(`&<>"'`)}`,
  );

  const fullEntry = parseUrlList("https://sayt.com/a", {
    changefreq: "weekly",
    priority: 0.8,
    lastmod: "2026-01-01",
  });
  const fullXml = buildSitemap(fullEntry.entries);
  check(
    "sitemap-qurucu: defaults fill lastmod, changefreq and priority onto every entry",
    fullXml.includes("<lastmod>2026-01-01</lastmod>") &&
      fullXml.includes("<changefreq>weekly</changefreq>") &&
      fullXml.includes("<priority>0.8</priority>"),
    `xml: ${fullXml}`,
  );
};
