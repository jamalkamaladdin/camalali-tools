/**
 * Heading outline auditor: turns pasted HTML into the H1-H6 tree a crawler
 * (or a screen reader in "headings list" mode) actually reads, plus the list
 * of structural problems in that outline.
 *
 * Pure functions over the tolerant scanner in `html.ts` — no DOM, so the same
 * code runs in the browser widget without a server round trip.
 */
import { attr, collectTags, stripTags, type HtmlTag } from "./html";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type Heading = {
  level: HeadingLevel;
  text: string;
  index: number;
  /** No usable text at all — neither a text node nor an image `alt`. */
  empty: boolean;
  /**
   * The heading's only content is an image, and that image has no `alt` —
   * a more specific reason for `empty` than a truly blank tag, so the two
   * are reported as different problems.
   */
  hasImageOnly: boolean;
};

export type OutlineIssue = {
  severity: "xeta" | "xeberdarliq";
  kind: string;
  message: string;
  heading: Heading | null;
};

export type OutlineNode = {
  heading: Heading;
  children: OutlineNode[];
};

const LEVELS: HeadingLevel[] = [1, 2, 3, 4, 5, 6];

/*
 * The visible text of a heading, with one fallback: a heading whose only
 * content is `<img alt="...">` is not empty to a crawler or a screen reader —
 * both compute the accessible name from `alt` when there is no text node.
 * `hasImageOnly` stays true only when that fallback also comes up empty, which
 * is the one case worth a dedicated warning instead of the generic "empty".
 */
function headingContent(inner: string): { text: string; hasImageOnly: boolean } {
  const visible = stripTags(inner).trim();
  if (visible !== "") return { text: visible, hasImageOnly: false };

  const images = collectTags(inner, "img");
  if (images.length === 0) return { text: "", hasImageOnly: false };

  const altText = images
    .map((image) => (attr(image, "alt") ?? "").trim())
    .find((value) => value !== "");
  if (altText !== undefined) return { text: altText, hasImageOnly: false };

  return { text: "", hasImageOnly: true };
}

function toHeading(level: HeadingLevel, tag: HtmlTag): Heading {
  const { text, hasImageOnly } = headingContent(tag.inner);
  return { level, text, index: tag.index, empty: text === "", hasImageOnly };
}

/** Every H1-H6 in the document, in the order they appear. */
export function extractHeadings(html: string): Heading[] {
  const found: Heading[] = [];
  for (const level of LEVELS) {
    for (const tag of collectTags(html, `h${level}`)) {
      found.push(toHeading(level, tag));
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

const LONG_HEADING_LIMIT = 70;

function normalisedText(heading: Heading): string {
  return heading.text.trim().toLowerCase();
}

/**
 * The structural and textual problems in a heading outline.
 *
 * Level-skip detection tracks the deepest level reached so far in document
 * order — a heading two or more levels past that is a skip, and going
 * shallower again is not, which is what lets `H2, H3, H2, H5` flag only the
 * last jump. Nothing is checked against the state before the first heading,
 * so a page that opens on H2 is only ever caught by the missing-H1 rule.
 */
export function auditOutline(headings: Heading[]): OutlineIssue[] {
  const issues: OutlineIssue[] = [];

  const h1s = headings.filter((heading) => heading.level === 1);
  if (h1s.length === 0) {
    issues.push({
      severity: "xeta",
      kind: "h1-yoxdur",
      message: "Səhifədə H1 yoxdur — səhifənin nədən bəhs etdiyini bildirən yeganə başlıq budur.",
      heading: null,
    });
  } else if (h1s.length > 1) {
    issues.push({
      severity: "xeberdarliq",
      kind: "coxlu-h1",
      message: `Səhifədə ${h1s.length} H1 var. HTML5-də bu qanunidir və Google da bununla işləyir, amma çox vaxt səhifənin nədən bəhs etdiyinə qərar verilməməsinin əlamətidir.`,
      heading: null,
    });
  }

  /*
   * The same nesting the tree builder computes: a heading's "parent" is the
   * nearest earlier heading shallower than it. Comparing against that parent
   * rather than a running maximum is what lets the check reset correctly —
   * `H1, H2, H3, H4, H2, H4` flags only the second H4, because by then the
   * nearest shallower heading is the second H2, not the first H3.
   */
  const path: HeadingLevel[] = [];
  for (const heading of headings) {
    while (path.length > 0 && path[path.length - 1] >= heading.level) {
      path.pop();
    }
    const parentLevel = path[path.length - 1] ?? 0;
    if (parentLevel > 0 && heading.level > parentLevel + 1) {
      issues.push({
        severity: "xeta",
        kind: "seviyye-atlanib",
        message: `H${parentLevel}-dan sonra H${parentLevel + 1} gəlmədən birbaşa H${heading.level}-a keçilib.`,
        heading,
      });
    }
    path.push(heading.level);

    if (heading.hasImageOnly) {
      issues.push({
        severity: "xeberdarliq",
        kind: "sekil-alt-siz",
        message: "Başlıq şəkil daşıyır, amma şəklin alt mətni yoxdur — başlıq mətni maşın üçün boşdur.",
        heading,
      });
    } else if (heading.empty) {
      issues.push({
        severity: "xeta",
        kind: "bos-basliq",
        message: "Başlıq boşdur — içində heç bir mətn yoxdur.",
        heading,
      });
    } else {
      const wordCount = heading.text.split(/\s+/).filter(Boolean).length;
      if (wordCount === 1) {
        issues.push({
          severity: "xeberdarliq",
          kind: "tek-soz",
          message: `Başlıq yalnız bir sözdən ibarətdir: «${heading.text}».`,
          heading,
        });
      }
      if (heading.text.length > LONG_HEADING_LIMIT) {
        issues.push({
          severity: "xeberdarliq",
          kind: "uzun-basliq",
          message: `Başlıq ${heading.text.length} simvoldur — ${LONG_HEADING_LIMIT} simvol hədddən uzundur.`,
          heading,
        });
      }
    }
  }

  const byText = new Map<string, Heading[]>();
  for (const heading of headings) {
    if (heading.text === "") continue;
    const key = normalisedText(heading);
    const list = byText.get(key) ?? [];
    list.push(heading);
    byText.set(key, list);
  }
  for (const list of byText.values()) {
    if (list.length < 2) continue;
    for (const heading of list) {
      issues.push({
        severity: "xeberdarliq",
        kind: "tekrar-metn",
        message: `«${heading.text}» mətni ${list.length} başlıqda təkrarlanır.`,
        heading,
      });
    }
  }

  return issues;
}

/**
 * The outline as a tree, tolerant of a skipped level: a heading nests under
 * the nearest heading shallower than it in document order, whatever that
 * level happens to be — `H2, H4` puts the H4 under the H2 rather than
 * refusing to build a tree at all.
 */
export function buildOutlineTree(headings: Heading[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: { node: OutlineNode; level: HeadingLevel }[] = [];

  for (const heading of headings) {
    const node: OutlineNode = { heading, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      roots.push(node);
    } else {
      parent.node.children.push(node);
    }
    stack.push({ node, level: heading.level });
  }

  return roots;
}
