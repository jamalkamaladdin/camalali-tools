/*
 * The claims worth checking here: a quote or an ampersand in the visitor's
 * own text must not break the tag it lands in, a blank field must not print
 * as an empty tag, and the two soft length limits must classify at the exact
 * boundary they claim to use — off-by-one there is the whole point of a
 * "near the limit" warning.
 */
import ts from "typescript";
import type { CheckSuite } from "./harness.mts";
import {
  buildMetaHtml,
  buildMetaTags,
  buildNextMetadata,
  buildNextMetadataCode,
  checkLength,
  DESCRIPTION_SOFT_LIMIT,
  EMPTY_META_FIELDS,
  escapeHtmlAttribute,
  resolveImageUrl,
  TITLE_SOFT_LIMIT,
  type MetaFields,
} from "../lib/meta";

function fields(overrides: Partial<MetaFields>): MetaFields {
  return { ...EMPTY_META_FIELDS, ...overrides };
}

/** A syntax-only pass — this is what "valid TypeScript" is actually checked against, not eyeballing the string. */
function hasSyntaxErrors(code: string): boolean {
  const result = ts.transpileModule(code, {
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  return (result.diagnostics?.length ?? 0) > 0;
}

export const checks: CheckSuite = (check) => {
  const quoted = buildMetaHtml(fields({ title: 'O dedi "salam"' }));
  check(
    "meta: quoted title does not break out of the title tag",
    quoted.includes("&quot;salam&quot;") && !quoted.includes('"salam"'),
    `got: ${quoted}`,
  );

  const ampersandAndAngle = buildMetaHtml(
    fields({ description: "Sürət & <b>performans</b>" }),
  );
  check(
    "meta: & and < in description are entity-escaped",
    ampersandAndAngle.includes("Sürət &amp; &lt;b&gt;performans&lt;/b&gt;"),
    `got: ${ampersandAndAngle}`,
  );

  const blankTags = buildMetaTags(EMPTY_META_FIELDS);
  check(
    "meta: a blank title produces no <title> line",
    !blankTags.some((line) => line.startsWith("<title>")),
    `lines: ${JSON.stringify(blankTags)}`,
  );
  check(
    "meta: a blank field never prints an empty content attribute",
    !blankTags.some((line) => line.includes('content=""')),
    `lines: ${JSON.stringify(blankTags)}`,
  );
  check(
    "meta: fully blank input still emits robots, og:type and twitter:card",
    blankTags.length === 3 &&
      blankTags.some((line) => line.startsWith("<meta name=\"robots\"")) &&
      blankTags.some((line) => line.includes('og:type" content="website"')) &&
      blankTags.some((line) => line.startsWith("<meta name=\"twitter:card\"")),
    `lines: ${JSON.stringify(blankTags)}`,
  );

  check(
    "meta: a title well under the limit is 'ok'",
    checkLength("a".repeat(Math.floor(TITLE_SOFT_LIMIT / 2)), TITLE_SOFT_LIMIT).status === "ok",
    `status: ${checkLength("a".repeat(Math.floor(TITLE_SOFT_LIMIT / 2)), TITLE_SOFT_LIMIT).status}`,
  );
  check(
    "meta: title one character over the limit is 'over'",
    checkLength("a".repeat(TITLE_SOFT_LIMIT + 1), TITLE_SOFT_LIMIT).status === "over",
    `status: ${checkLength("a".repeat(TITLE_SOFT_LIMIT + 1), TITLE_SOFT_LIMIT).status}`,
  );
  check(
    "meta: title at 90% of the limit is already 'near'",
    checkLength("a".repeat(Math.ceil(TITLE_SOFT_LIMIT * 0.9)), TITLE_SOFT_LIMIT).status === "near",
    `status: ${checkLength("a".repeat(Math.ceil(TITLE_SOFT_LIMIT * 0.9)), TITLE_SOFT_LIMIT).status}`,
  );
  check(
    "meta: description well under the limit is 'ok'",
    checkLength("a".repeat(100), DESCRIPTION_SOFT_LIMIT).status === "ok",
    `status: ${checkLength("a".repeat(100), DESCRIPTION_SOFT_LIMIT).status}`,
  );
  check(
    "meta: description over the limit is 'over'",
    checkLength("a".repeat(DESCRIPTION_SOFT_LIMIT + 1), DESCRIPTION_SOFT_LIMIT).status === "over",
    `status: ${checkLength("a".repeat(DESCRIPTION_SOFT_LIMIT + 1), DESCRIPTION_SOFT_LIMIT).status}`,
  );

  const azerbaijani = escapeHtmlAttribute('İşıqlı şəhər "gecə"');
  check(
    "meta: azerbaijani letters pass through escaping untouched",
    azerbaijani.includes("İşıqlı şəhər") && azerbaijani.includes("&quot;gecə&quot;"),
    `got: ${azerbaijani}`,
  );

  check(
    "meta: a relative image path resolves against the page URL",
    resolveImageUrl("/og/cover.png", "https://example.com/post") ===
      "https://example.com/og/cover.png",
    `got: ${resolveImageUrl("/og/cover.png", "https://example.com/post")}`,
  );

  const ampersandUrl = buildMetaHtml(
    fields({ url: "https://example.com/x?a=1&b=2" }),
  );
  check(
    "meta: & in the canonical URL is escaped in the href attribute",
    ampersandUrl.includes('href="https://example.com/x?a=1&amp;b=2"'),
    `got: ${ampersandUrl}`,
  );

  check(
    "meta: robots content reflects noindex + nofollow",
    buildMetaHtml(fields({ robotsIndex: false, robotsFollow: false })).includes(
      '<meta name="robots" content="noindex, nofollow">',
    ),
    "robots content did not match noindex, nofollow",
  );
  check(
    "meta: robots content reflects index + nofollow independently",
    buildMetaHtml(fields({ robotsIndex: true, robotsFollow: false })).includes(
      '<meta name="robots" content="index, nofollow">',
    ),
    "robots content did not match index, nofollow",
  );

  const nextMetadata = buildNextMetadata(
    fields({
      title: "Başlıq",
      description: "Təsvir",
      url: "https://example.com/",
      siteName: "camalali",
      twitterCard: "summary",
    }),
  );
  const openGraph = nextMetadata.openGraph as Record<string, unknown>;
  const twitter = nextMetadata.twitter as Record<string, unknown>;
  check(
    "meta: Next.js metadata nests title/siteName under openGraph, not top-level",
    openGraph.title === "Başlıq" && openGraph.siteName === "camalali",
    `openGraph: ${JSON.stringify(openGraph)}`,
  );
  check(
    "meta: Next.js metadata carries the chosen twitter card type",
    twitter.card === "summary",
    `twitter: ${JSON.stringify(twitter)}`,
  );

  const code = buildNextMetadataCode(fields({ title: 'Alət "meta"', url: "https://example.com/" }));
  check(
    "meta: generated Next.js code is syntactically valid TypeScript",
    !hasSyntaxErrors(code),
    `code: ${code}`,
  );
  check(
    "meta: generated Next.js code imports the Metadata type it annotates with",
    code.includes('import type { Metadata } from "next"') && code.includes(": Metadata ="),
    `code: ${code}`,
  );
};
