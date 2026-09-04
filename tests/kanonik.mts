/*
 * What is worth checking here: the full rule set collapses a deliberately
 * messy URL into the exact canonical form the spec names, each rule can be
 * turned off independently and the result reflects that, duplicate-content
 * URLs (a tracking parameter is the whole difference) land on one canonical,
 * the root URL keeps its trailing slash even with that rule on, and a
 * malformed URL comes back as a table-friendly error rather than a thrown
 * exception.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildCanonicalTag,
  canonicalise,
  CANON_RULES,
  groupDuplicates,
  type CanonRule,
} from "../lib/kanonik";

const ALL_RULES = new Set<CanonRule>(CANON_RULES);

export const checks: CheckSuite = (check) => {
  const messy = canonicalise("https://WWW.Example.COM:443/a/../b/", ALL_RULES);
  check(
    "kanonik: scheme, host case, www, default port and dot segments together collapse to the spec example",
    messy.canonical === "https://example.com/b",
    `got: ${JSON.stringify(messy)}`,
  );

  const sortedParams = canonicalise("https://example.com/?b=2&a=1", ALL_RULES);
  check(
    "kanonik: remaining query parameters are sorted alphabetically",
    sortedParams.canonical === "https://example.com/?a=1&b=2",
    `got: ${JSON.stringify(sortedParams)}`,
  );

  const withUtm = canonicalise("https://example.com/x?utm_source=instagram", ALL_RULES);
  const withoutUtm = canonicalise("https://example.com/x", ALL_RULES);
  check(
    "kanonik: a URL differing only by utm_source lands on the same canonical as the one without it",
    withUtm.canonical !== null && withUtm.canonical === withoutUtm.canonical,
    `with: ${JSON.stringify(withUtm)}, without: ${JSON.stringify(withoutUtm)}`,
  );

  const root = canonicalise("https://example.com", ALL_RULES);
  check(
    "kanonik: the root URL keeps its trailing slash even with the trailing-slash rule enabled",
    root.canonical === "https://example.com/",
    `got: ${JSON.stringify(root)}`,
  );

  const broken = canonicalise("not a url at all", ALL_RULES);
  check(
    "kanonik: an unparsable input comes back as a table-row error, not a thrown exception",
    broken.canonical === null && typeof broken.error === "string" && broken.error.length > 0,
    `got: ${JSON.stringify(broken)}`,
  );

  const wwwOnly = new Set<CanonRule>(["www"]);
  const wwwDisabledResult = canonicalise("https://www.example.com/path", new Set<CanonRule>());
  const wwwEnabledResult = canonicalise("https://www.example.com/path", wwwOnly);
  check(
    "kanonik: the www rule alone strips the prefix, and turning it off leaves the host untouched",
    wwwEnabledResult.canonical === "https://example.com/path" &&
      wwwDisabledResult.canonical === "https://www.example.com/path",
    `enabled: ${JSON.stringify(wwwEnabledResult)}, disabled: ${JSON.stringify(wwwDisabledResult)}`,
  );

  const indexFile = canonicalise("https://example.com/blog/index.html", ALL_RULES);
  check(
    "kanonik: an index.html file is dropped along with the trailing slash it leaves behind",
    indexFile.canonical === "https://example.com/blog",
    `got: ${JSON.stringify(indexFile)}`,
  );

  const percentCase = canonicalise("https://example.com/a%2fb", ALL_RULES);
  check(
    "kanonik: percent-encoding is normalised to uppercase hex digits",
    percentCase.canonical === "https://example.com/a%2Fb",
    `got: ${JSON.stringify(percentCase)}`,
  );

  const groups = groupDuplicates([
    canonicalise("https://www.example.com/a", ALL_RULES),
    canonicalise("https://example.com/a", ALL_RULES),
    canonicalise("https://example.com/z", ALL_RULES),
    broken,
  ]);
  check(
    "kanonik: two inputs sharing a canonical form group together, a unique one and a broken one do not",
    groups.length === 1 && groups[0].inputs.length === 2,
    `got: ${JSON.stringify(groups)}`,
  );

  const tag = buildCanonicalTag('https://example.com/a"b');
  check(
    "kanonik: the copy-paste canonical tag escapes a quote in the URL",
    tag.includes("&quot;") && !tag.includes('href="https://example.com/a"b"'),
    `got: ${tag}`,
  );
};
