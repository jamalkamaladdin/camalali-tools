/**
 * Markdown to HTML, written from nothing rather than pulled in as a
 * dependency, because the output is handed straight to
 * `dangerouslySetInnerHTML` on the preview pane -- the one place on this site
 * where a bug is not a wrong number but a script tag that runs in a
 * visitor's browser.
 *
 * The defence is structural, not a denylist bolted on afterwards: this file
 * never emits a byte of HTML the visitor typed. Every character with meaning
 * to an HTML parser (&, <, >, ", ') is escaped the moment it leaves the
 * input, before any markdown syntax is read -- so a typed `<script>` is
 * never a tag here, only five escaped characters that happen to print the
 * word "script" on screen. The only tags this file writes are the ones it
 * builds itself (`<strong>`, `<code>`, `<a href="...">`, ...), and a link or
 * image target is checked against a scheme denylist before it is allowed
 * into an `href` or `src` at all. Raw HTML written by the visitor is never
 * passed through -- that one rule is what makes the four XSS cases in the
 * check suite pass without four separate patches.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** `&` first -- escaping it after the others would double-escape their output. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const DANGEROUS_SCHEMES = new Set(["javascript", "data", "vbscript", "file"]);

/**
 * A link is the one piece of a document a reader acts on without reading
 * first, so its target gets its own check independent of the HTML escaping
 * above. `javascript:` and `data:` both run code the instant the link opens
 * or the image loads.
 *
 * Tab and newline inside the scheme are stripped before it is read, not
 * just trimmed off the ends: the WHATWG URL spec has browsers strip ASCII
 * tab and newline from anywhere in a URL before parsing it, so a scheme
 * written as "java" + TAB + "script:" still resolves to the javascript
 * scheme on a real page even though a naive prefix check would miss it.
 */
function sanitizeUrl(rawUrl: string): string | null {
  const cleaned = rawUrl.replace(/[\t\n\r]/g, "").trim();
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);
  if (scheme && DANGEROUS_SCHEMES.has(scheme[1].toLowerCase())) return null;
  return cleaned;
}

const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function renderLink(label: string, url: string): string {
  const safe = sanitizeUrl(url);
  // A blocked scheme keeps the visitor's words and drops only the markup
  // that would have carried them somewhere the visitor never asked to go --
  // silently deleting the whole line would look like a parser bug.
  if (safe === null) return label;
  return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function renderImage(alt: string, url: string): string {
  const safe = sanitizeUrl(url);
  if (safe === null) return alt;
  return `<img src="${safe}" alt="${alt}" />`;
}

/**
 * Sentinel wrapping a protected inline-code span while emphasis runs. Built
 * from the NUL character, which `stripControlChars` (below) guarantees
 * cannot appear in the input by the time this runs, so a placeholder can
 * never collide with anything the visitor actually typed the way a
 * printable marker like "@@0@@" could.
 */
const NUL = "\u0000";
const PLACEHOLDER_RE = /\u0000(\d+)\u0000/g;

/**
 * The one function every block-level renderer below calls on a raw line of
 * markdown. It always starts from *unescaped* text and always returns safe
 * HTML -- that contract is what lets every caller just interpolate the
 * result without re-checking it.
 */
function renderInline(raw: string): string {
  const codeSpans: string[] = [];

  // Code spans are pulled out before escaping, not after: their content
  // must never be read as emphasis syntax (a code span containing asterisks
  // stays literal), and the NUL placeholder survives the escape and
  // emphasis passes intact because none of those passes touch it.
  let text = raw.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `${NUL}${codeSpans.length - 1}${NUL}`;
  });

  text = escapeHtml(text);

  // Images before links: image syntax is link syntax with a leading "!", so
  // resolving images first consumes the "[...](...)" before the link pass
  // can misread it as a bare link with a stray "!" beside it.
  text = text.replace(IMAGE_RE, (_m, alt: string, url: string) => renderImage(alt, url));
  text = text.replace(LINK_RE, (_m, label: string, url: string) => renderLink(label, url));

  // "**" before "*": matching the single-character form first would read
  // "**bold**" as two unmatched single asterisks either side of nothing.
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Underscore italics require a non-word boundary on both sides, or
  // "camel_case_name" would grow an <em> around "case".
  text = text.replace(/(?<![\p{L}\p{N}_])_([^_]+)_(?![\p{L}\p{N}_])/gu, "<em>$1</em>");
  text = text.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  text = text.replace(PLACEHOLDER_RE, (_m, index: string) => codeSpans[Number(index)]);

  return text;
}

function isFence(line: string): RegExpExecArray | null {
  return /^ {0,3}(```|~~~)(.*)$/.exec(line);
}

function isHeading(line: string): RegExpExecArray | null {
  return /^ {0,3}(#{1,6})(?:\s+(.*))?$/.exec(line);
}

/** Thematic break: three or more of the same rule character, spaces allowed between them. */
function isThematicBreak(line: string): boolean {
  const compact = line.trim().replace(/\s+/g, "");
  return /^(-{3,}|\*{3,}|_{3,})$/.test(compact);
}

function isBlockquoteLine(line: string): boolean {
  return /^ {0,3}>/.test(line);
}

const BULLET_UL = /^(\s*)[-*+]\s+(.*)$/;
const BULLET_OL = /^(\s*)\d+[.)]\s+(.*)$/;

function isListLine(line: string): boolean {
  return BULLET_UL.test(line) || BULLET_OL.test(line);
}

function tableRowCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparatorRow(line: string): boolean {
  if (!line.includes("-") || !line.includes("|")) return false;
  const cells = tableRowCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function tableAlign(separatorCell: string): "left" | "right" | "center" | null {
  const left = separatorCell.startsWith(":");
  const right = separatorCell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function alignAttr(align: "left" | "right" | "center" | null): string {
  return align ? ` style="text-align:${align}"` : "";
}

/** Starts a new block, so a paragraph accumulating lines stops here rather than swallowing it. */
function startsNewBlock(line: string): boolean {
  return (
    isFence(line) !== null ||
    isHeading(line) !== null ||
    isThematicBreak(line) ||
    isBlockquoteLine(line) ||
    isListLine(line)
  );
}

type BlockResult = { html: string; next: number };

function renderFence(lines: string[], start: number): BlockResult {
  const open = isFence(lines[start]);
  if (!open) throw new Error("renderFence called on a non-fence line");
  const fenceChar = open[1];
  // A language tag becomes an HTML class, so it is stripped to the
  // characters a class name can hold rather than escaped -- escaping would
  // leave "&quot;"-style entities sitting inside an attribute value.
  const lang = open[2].trim().replace(/[^a-zA-Z0-9_-]/g, "");

  const body: string[] = [];
  let i = start + 1;
  while (i < lines.length && !lines[i].trim().startsWith(fenceChar)) {
    body.push(lines[i]);
    i++;
  }
  // An unterminated fence (EOF before the closing marker) still renders what
  // it has rather than dropping the block -- a half-typed fence is a
  // common, recoverable state while someone is actively editing the left pane.
  const next = i < lines.length ? i + 1 : i;

  const langClass = lang ? ` class="language-${lang}"` : "";
  return {
    html: `<pre><code${langClass}>${escapeHtml(body.join("\n"))}</code></pre>`,
    next,
  };
}

function renderHeading(lines: string[], start: number): BlockResult {
  const match = isHeading(lines[start]);
  if (!match) throw new Error("renderHeading called on a non-heading line");
  const level = match[1].length;
  const content = (match[2] ?? "").replace(/\s+#+\s*$/, "").trim();
  return { html: `<h${level}>${renderInline(content)}</h${level}>`, next: start + 1 };
}

function renderBlockquote(lines: string[], start: number): BlockResult {
  const quoted: string[] = [];
  let i = start;
  while (i < lines.length && isBlockquoteLine(lines[i])) {
    quoted.push(lines[i].replace(/^ {0,3}>\s?/, ""));
    i++;
  }
  return { html: `<blockquote>${parseBlocks(quoted)}</blockquote>`, next: i };
}

function renderTable(lines: string[], start: number): BlockResult {
  const headerCells = tableRowCells(lines[start]);
  const aligns = tableRowCells(lines[start + 1]).map(tableAlign);

  let i = start + 2;
  const bodyRows: string[][] = [];
  while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
    bodyRows.push(tableRowCells(lines[i]));
    i++;
  }

  const th = headerCells
    .map((cell, index) => `<th${alignAttr(aligns[index] ?? null)}>${renderInline(cell)}</th>`)
    .join("");
  const rows = bodyRows
    .map(
      (row) =>
        `<tr>${headerCells
          .map(
            (_h, index) =>
              `<td${alignAttr(aligns[index] ?? null)}>${renderInline(row[index] ?? "")}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  return {
    html: `<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`,
    next: i,
  };
}

/**
 * One level of a list. `baseIndent` is the indentation of the first item at
 * this level, taken from the input rather than assumed to be 2 or 4 spaces,
 * so either convention nests correctly. A line indented further that is
 * itself a bullet becomes a nested list; a line indented further that is
 * not a bullet is a continuation line folded into the current item's text.
 *
 * A blank line ends the list block outright -- this tool renders a live
 * preview of whatever is being typed right now, not a full CommonMark
 * parser, and "loose" lists with blank lines between items are the one
 * piece of that spec traded away for a parser simple enough to read in one
 * sitting.
 */
function renderList(lines: string[], start: number): BlockResult {
  const firstOrdered = BULLET_OL.exec(lines[start]);
  const ordered = firstOrdered !== null;
  const baseIndent = (ordered ? firstOrdered : BULLET_UL.exec(lines[start]))![1].length;
  const startNumber = ordered ? lines[start].trim().match(/^\d+/)![0] : null;

  const items: string[] = [];
  let i = start;

  while (i < lines.length && lines[i].trim() !== "") {
    const line = lines[i];
    const match = ordered ? BULLET_OL.exec(line) : BULLET_UL.exec(line);
    if (!match || match[1].length !== baseIndent) break;

    let itemText = match[2];
    i++;

    const nestedLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      const next = lines[i];
      const nextIndent = /^(\s*)/.exec(next)![1].length;
      if (nextIndent <= baseIndent) break;
      if (isListLine(next)) {
        nestedLines.push(next);
      } else {
        itemText += ` ${next.trim()}`;
      }
      i++;
    }

    const nestedHtml = nestedLines.length > 0 ? renderList(nestedLines, 0).html : "";
    items.push(`<li>${renderInline(itemText)}${nestedHtml}</li>`);
  }

  const tag = ordered ? "ol" : "ul";
  const startAttr = ordered && startNumber !== "1" ? ` start="${startNumber}"` : "";
  return { html: `<${tag}${startAttr}>${items.join("")}</${tag}>`, next: i };
}

/**
 * A hard line break is two-or-more trailing spaces before the newline (the
 * GFM rule) -- a bare newline between two lines of the same paragraph is a
 * soft break and is left as a plain newline, which HTML collapses to a
 * space, the same place a soft break ends up in any markdown renderer.
 */
function renderParagraph(lines: string[]): string {
  return lines
    .map((line, index) => {
      const hardBreak = index < lines.length - 1 && / {2,}$/.test(line);
      const rendered = renderInline(line.replace(/\s+$/, ""));
      return hardBreak ? `${rendered}<br />` : rendered;
    })
    .join("\n");
}

function parseBlocks(lines: string[]): string {
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (isFence(line)) {
      const result = renderFence(lines, i);
      html.push(result.html);
      i = result.next;
      continue;
    }

    if (isHeading(line)) {
      const result = renderHeading(lines, i);
      html.push(result.html);
      i = result.next;
      continue;
    }

    if (isThematicBreak(line)) {
      html.push("<hr />");
      i++;
      continue;
    }

    if (isBlockquoteLine(line)) {
      const result = renderBlockquote(lines, i);
      html.push(result.html);
      i = result.next;
      continue;
    }

    if (i + 1 < lines.length && line.includes("|") && isTableSeparatorRow(lines[i + 1])) {
      const result = renderTable(lines, i);
      html.push(result.html);
      i = result.next;
      continue;
    }

    if (isListLine(line)) {
      const result = renderList(lines, i);
      html.push(result.html);
      i = result.next;
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !startsNewBlock(lines[i])) {
      paragraphLines.push(lines[i]);
      i++;
    }
    html.push(`<p>${renderParagraph(paragraphLines)}</p>`);
  }

  return html.join("\n");
}

/**
 * C0 control characters other than tab and newline are dropped up front.
 * Two reasons: they have no legitimate place in a pasted document, and
 * their absence -- specifically NUL's -- is what guarantees the sentinel
 * `renderInline` uses to protect code spans during emphasis parsing cannot
 * collide with anything the visitor actually typed.
 */
function stripControlChars(source: string): string {
  return source.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

export function markdownToHtml(source: string): string {
  if (source.trim() === "") return "";

  const normalized = stripControlChars(source.replace(/\r\n?/g, "\n"));
  return parseBlocks(normalized.split("\n"));
}
