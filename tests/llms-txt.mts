/*
 * The claims worth checking here: buildLlmsTxt produces the exact shape
 * llms.txt expects (one heading, the blockquote summary right under it, an
 * "Optional" section forced regardless of what the visitor typed as its
 * heading), a title carrying "]" survives the build-then-audit round trip
 * without breaking the link it sits in, and auditLlmsTxt's structural checks
 * — duplicate H1, malformed link line, relative URL, empty section, missing
 * summary, duplicate URL — fire with the severities the tool page promises.
 */
import type { CheckSuite } from "./harness.mts";
import { auditLlmsTxt, buildLlmsTxt, EMPTY_LLMS_DOC, type LlmsDoc } from "../lib/llms-txt";

function doc(overrides: Partial<LlmsDoc>): LlmsDoc {
  return { ...EMPTY_LLMS_DOC, ...overrides };
}

export const checks: CheckSuite = (check) => {
  const basic = buildLlmsTxt(doc({ name: "Sayt", summary: "Qısa xülasə" }));
  check(
    "llms-txt: build emits '# Name' then '> summary' directly under it",
    basic.startsWith("# Sayt\n\n> Qısa xülasə"),
    `got: ${JSON.stringify(basic)}`,
  );

  const withOptional = buildLlmsTxt(
    doc({
      name: "Sayt",
      sections: [
        {
          heading: "Əsas",
          optional: false,
          links: [{ title: "Ana səhifə", url: "https://sayt.az", note: "qeyd" }],
        },
        {
          heading: "Arxiv",
          optional: true,
          links: [{ title: "Köhnə səhifə", url: "https://sayt.az/arxiv", note: "" }],
        },
      ],
    }),
  );
  check(
    "llms-txt: a section flagged optional prints under the literal '## Optional' heading, not its own",
    withOptional.includes("## Optional") && !withOptional.includes("## Arxiv"),
    `got: ${JSON.stringify(withOptional)}`,
  );

  const emptySectionBuild = buildLlmsTxt(
    doc({ name: "Sayt", sections: [{ heading: "Boş", optional: false, links: [] }] }),
  );
  check(
    "llms-txt: a section with no valid links prints no heading at all",
    !emptySectionBuild.includes("## Boş"),
    `got: ${JSON.stringify(emptySectionBuild)}`,
  );

  const bracketTitleDoc = doc({
    name: "Sayt",
    sections: [
      {
        heading: "Bölmə",
        optional: false,
        links: [{ title: "Bax: [MÜHÜM] qeyd", url: "https://sayt.az/x", note: "" }],
      },
    ],
  });
  const bracketBuilt = buildLlmsTxt(bracketTitleDoc);
  const bracketAudited = auditLlmsTxt(bracketBuilt);
  check(
    "llms-txt: a ']' inside a link title is escaped on build and does not break the link line",
    bracketBuilt.includes("[Bax: \\[MÜHÜM\\] qeyd](https://sayt.az/x)"),
    `got: ${JSON.stringify(bracketBuilt)}`,
  );
  check(
    "llms-txt: the escaped ']' in the title round-trips back to the original text on audit",
    bracketAudited.doc?.sections[0]?.links[0]?.title === "Bax: [MÜHÜM] qeyd",
    `got: ${JSON.stringify(bracketAudited.doc)}`,
  );

  const twoHeadings = auditLlmsTxt("# Birinci\n\n# İkinci\n\n## Bölmə\n- [Ad](https://sayt.az): qeyd\n");
  check(
    "llms-txt: a second '# ' heading is a xeta",
    twoHeadings.issues.some((issue) => issue.severity === "xeta" && issue.message.includes("İkinci")),
    `got: ${JSON.stringify(twoHeadings.issues)}`,
  );

  const relativeLink = auditLlmsTxt("# Ad\n\n## Bölmə\n- [Ad](/bloq/yazi): qeyd\n");
  check(
    "llms-txt: a relative link URL is a xeberdarliq, not a xeta",
    relativeLink.issues.some(
      (issue) => issue.severity === "xeberdarliq" && issue.message.includes("nisbi"),
    ),
    `got: ${JSON.stringify(relativeLink.issues)}`,
  );

  const noSummary = auditLlmsTxt("# Ad\n\n## Bölmə\n- [Ad](https://sayt.az): qeyd\n");
  check(
    "llms-txt: a missing '>' summary is flagged",
    noSummary.issues.some((issue) => issue.message.includes("xülasə")),
    `got: ${JSON.stringify(noSummary.issues)}`,
  );

  const malformedLine = auditLlmsTxt("# Ad\n\n## Bölmə\n* [Ad](https://sayt.az): qeyd\n");
  check(
    "llms-txt: a bullet line not shaped like '- [Ad](URL): qeyd' is a xeta",
    malformedLine.issues.some((issue) => issue.severity === "xeta" && issue.message.includes("format")),
    `got: ${JSON.stringify(malformedLine.issues)}`,
  );

  const emptySectionAudit = auditLlmsTxt("# Ad\n\n> Xülasə\n\n## Boş\n## Dolu\n- [Ad](https://sayt.az): qeyd\n");
  check(
    "llms-txt: a section closed with zero links is flagged empty",
    emptySectionAudit.issues.some((issue) => issue.message.includes("Boş")),
    `got: ${JSON.stringify(emptySectionAudit.issues)}`,
  );

  const duplicateUrl = auditLlmsTxt(
    "# Ad\n\n> Xülasə\n\n## Bölmə\n- [Bir](https://sayt.az/a): birinci\n- [İki](https://sayt.az/a): ikinci\n",
  );
  check(
    "llms-txt: the same URL used twice is flagged as a duplicate",
    duplicateUrl.issues.some((issue) => issue.message.includes("təkrar")),
    `got: ${JSON.stringify(duplicateUrl.issues)}`,
  );

  const cleanDoc = doc({
    name: "Sayt",
    summary: "Qısa xülasə",
    sections: [
      {
        heading: "Bölmə",
        optional: false,
        links: [{ title: "Ana səhifə", url: "https://sayt.az/", note: "qeyd" }],
      },
    ],
  });
  const cleanRoundTrip = auditLlmsTxt(buildLlmsTxt(cleanDoc));
  check(
    "llms-txt: a fully valid document built by this tool audits clean",
    cleanRoundTrip.issues.length === 0,
    `got: ${JSON.stringify(cleanRoundTrip.issues)}`,
  );
};
