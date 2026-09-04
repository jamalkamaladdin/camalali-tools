/**
 * llms.txt building and checking — a markdown file a site places at its root
 * so a language model has a short, curated map of the site instead of having
 * to crawl and summarise it. The shape (https://llmstxt.org) is fixed: one
 * "# Name" heading, an optional "> summary" blockquote directly under it,
 * free paragraphs of context, then one or more "## Section" headings whose
 * body is a flat list of "- [Title](URL): note" lines, and a reserved
 * trailing "## Optional" section for links that matter less.
 *
 * The build side and the check side are written as exact opposites on
 * purpose: the check side has to recognise precisely the shape the build
 * side produces, or a file this tool built could fail its own audit.
 */

export type LlmsLink = { title: string; url: string; note: string };
export type LlmsSection = { heading: string; optional: boolean; links: LlmsLink[] };
export type LlmsDoc = { name: string; summary: string; details: string; sections: LlmsSection[] };

export const EMPTY_LLMS_DOC: LlmsDoc = {
  name: "",
  summary: "",
  details: "",
  sections: [],
};

/*
 * A link title can contain the four characters markdown link syntax itself
 * uses — "[", "]", "(", ")" — because a page title is free text a visitor
 * did not write with this format in mind. Left unescaped, a title such as
 * `Qeyd: [MUHUM] bolme` closes the "[...]" span early and turns the rest of
 * the line into stray text next to a broken link. Each of the four, plus a
 * literal backslash so an already-escaped title round-trips instead of
 * gaining a second layer of backslashes, is escaped on the way out and
 * reversed on the way back in by `unescapeLinkTitle`.
 */
const TITLE_ESCAPE_CHARS = /[\\[\]()]/g;

function escapeLinkTitle(title: string): string {
  return title.replace(TITLE_ESCAPE_CHARS, (char) => `\\${char}`);
}

function unescapeLinkTitle(raw: string): string {
  return raw.replace(/\\([\\[\]()])/g, "$1");
}

function renderLinkLine(link: LlmsLink): string {
  const title = escapeLinkTitle(link.title.trim());
  const url = link.url.trim();
  const note = link.note.trim();
  return `- [${title}](${url})${note === "" ? "" : `: ${note}`}`;
}

/** `null` when the heading is blank or every link in the section is missing a title or a URL — an empty section prints nothing rather than a bare heading with nothing under it. */
function renderSection(heading: string, links: LlmsLink[]): string[] | null {
  const trimmedHeading = heading.trim();
  const validLinks = links.filter((link) => link.title.trim() !== "" && link.url.trim() !== "");
  if (trimmedHeading === "" || validLinks.length === 0) return null;

  return [`## ${trimmedHeading}`, ...validLinks.map(renderLinkLine)];
}

/**
 * Renders a `LlmsDoc` into the file text. Sections flagged `optional` are
 * pulled out of their place in the list, merged into one, and printed last
 * under the exact reserved heading "## Optional" — the one word a consumer
 * that only understands the bare minimum of the format is still expected to
 * recognise — regardless of what the visitor typed as that section's own
 * heading while editing it.
 */
export function buildLlmsTxt(doc: LlmsDoc): string {
  const lines: string[] = [`# ${doc.name.trim()}`];

  const summary = doc.summary.trim();
  if (summary !== "") lines.push("", `> ${summary}`);

  const details = doc.details.trim();
  if (details !== "") lines.push("", details);

  const required = doc.sections.filter((section) => !section.optional);
  for (const section of required) {
    const block = renderSection(section.heading, section.links);
    if (block) lines.push("", ...block);
  }

  const optionalLinks = doc.sections.filter((section) => section.optional).flatMap((s) => s.links);
  const optionalBlock = renderSection("Optional", optionalLinks);
  if (optionalBlock) lines.push("", ...optionalBlock);

  return `${lines.join("\n")}\n`;
}

export type LlmsIssue = { severity: "xeta" | "xeberdarliq"; line: number; message: string };

/** A line matches "- [title](url)" with an optional ": note" tail — title may hold escaped `\[ \] \( \)`, url may hold anything but a bare ")". */
const LINK_LINE = /^- \[((?:\\.|[^\]\\])*)\]\(([^)]*)\)(?::\s*(.*))?$/;

function isAbsoluteUrl(value: string): boolean {
  try {
    // A relative reference ("/en", "bloq/post") has no scheme for the URL
    // constructor to resolve without a base, so it throws — which is exactly
    // the distinction llms.txt needs, since a consuming model has no page
    // context to resolve a relative link against.
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

type OpenSection = { heading: string; optional: boolean; links: LlmsLink[]; headingLine: number };

/**
 * Reads a pasted llms.txt back apart, structural problem by structural
 * problem, in one left-to-right pass. `doc` is the best-effort structure
 * recovered even when `issues` is non-empty — a heading typo does not erase
 * the sections that parsed cleanly around it — and is `null` only when the
 * text carries nothing to recover at all.
 */
export function auditLlmsTxt(text: string): { doc: LlmsDoc | null; issues: LlmsIssue[] } {
  if (text.trim() === "") {
    return { doc: null, issues: [{ severity: "xeta", line: 1, message: "Fayl boşdur." }] };
  }

  const issues: LlmsIssue[] = [];
  const rawLines = text.split(/\r\n|\r|\n/);

  let name = "";
  let titleCount = 0;
  let summary = "";
  let summaryLine: number | null = null;
  const detailLines: string[] = [];
  const closedSections: OpenSection[] = [];
  let current: OpenSection | null = null;
  const firstSeenAtLine = new Map<string, number>();

  const closeCurrentSection = () => {
    if (!current) return;
    if (current.links.length === 0) {
      issues.push({
        severity: "xeberdarliq",
        line: current.headingLine,
        message: `"${current.heading || "(adsız)"}" bölməsində heç bir link yoxdur.`,
      });
    }
    closedSections.push(current);
    current = null;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const lineNumber = i + 1;
    const line = rawLines[i];
    const trimmed = line.trim();

    const titleMatch = /^#\s+(.*)$/.exec(line);
    if (titleMatch) {
      titleCount++;
      if (titleCount === 1) {
        name = titleMatch[1].trim();
      } else {
        issues.push({
          severity: "xeta",
          line: lineNumber,
          message: "İkinci `# ` başlığı tapıldı: sənəddə yalnız bir başlıq ola bilər.",
        });
      }
      continue;
    }

    const sectionMatch = /^##\s+(.*)$/.exec(line);
    if (sectionMatch) {
      closeCurrentSection();
      const heading = sectionMatch[1].trim();
      current = { heading, optional: heading === "Optional", links: [], headingLine: lineNumber };
      continue;
    }

    if (trimmed === "") continue;

    if (current) {
      const linkMatch = LINK_LINE.exec(line);
      if (!linkMatch) {
        issues.push({
          severity: "xeta",
          line: lineNumber,
          message: 'Link sətri gözlənilən formata uymur: "- [Ad](URL): izah" formatında olmalıdır.',
        });
        continue;
      }

      const [, rawTitle, rawUrl, rawNote] = linkMatch;
      const url = rawUrl.trim();
      current.links.push({ title: unescapeLinkTitle(rawTitle), url, note: (rawNote ?? "").trim() });

      if (url !== "" && !isAbsoluteUrl(url)) {
        issues.push({
          severity: "xeberdarliq",
          line: lineNumber,
          message: `"${url}" nisbi URL-dir, llms.txt hər linkin mütləq (https://…) olmasını tələb edir.`,
        });
      }

      if (url !== "") {
        const firstLine = firstSeenAtLine.get(url);
        if (firstLine) {
          issues.push({
            severity: "xeberdarliq",
            line: lineNumber,
            message: `"${url}" artıq ${firstLine}-ci sətirdə var idi (təkrar URL).`,
          });
        } else {
          firstSeenAtLine.set(url, lineNumber);
        }
      }
      continue;
    }

    // Before the first "##" section: the blockquote summary, once, then
    // everything else is free-text context.
    if (trimmed.startsWith(">")) {
      if (summary === "") {
        summary = trimmed.replace(/^>\s?/, "");
        summaryLine = lineNumber;
      } else {
        detailLines.push(trimmed.replace(/^>\s?/, ""));
      }
      continue;
    }

    detailLines.push(line);
  }
  closeCurrentSection();

  if (titleCount === 0) {
    issues.push({ severity: "xeta", line: 1, message: "`# ` başlığı yoxdur: sənəd bir başlıqla başlamalıdır." });
  }
  if (summary === "") {
    issues.push({
      severity: "xeberdarliq",
      line: summaryLine ?? 1,
      message: "`>` ilə başlayan bir cümləlik xülasə yoxdur.",
    });
  }

  const doc: LlmsDoc = {
    name,
    summary,
    details: detailLines.join("\n").trim(),
    sections: closedSections.map(({ heading, optional, links }) => ({ heading, optional, links })),
  };

  return { doc, issues };
}
