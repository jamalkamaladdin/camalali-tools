/**
 * XML formatting, minification and well-formedness checking — a purpose-built
 * parser rather than `json-xml.ts`'s, because the two need different things
 * from the same grammar: this one has to reproduce comments, CDATA and the
 * XML declaration byte-for-byte and report *where* a document breaks, while
 * `json-xml.ts` only has to reduce a document down to the JSON it means.
 * Sharing one walk between two different jobs would have been the tighter
 * coupling, not the smaller file.
 *
 * What is worth checking: pretty-printing indents nested elements at 2, 4 and
 * tab width, minifying and then pretty-printing again is idempotent, self-
 * closing tags and CDATA/comments survive round trip untouched, and every
 * class of malformed document this file claims to catch — an unclosed tag, a
 * mismatched close, more than one root, a malformed attribute — comes back
 * with the exact line and column rather than throwing.
 */
import { locate } from "./json.js";

export type XmlIndent = "2" | "4" | "tab";

export type XmlFormatResult =
  | { ok: true; output: string }
  | { ok: false; error: string; line: number; column: number };

export type XmlValidateResult =
  | { ok: true; rootTag: string; elementCount: number }
  | { ok: false; error: string; line: number; column: number };

/* ---------- shared tokenizer ---------- */

type Node =
  | { kind: "element"; tag: string; attrs: [string, string][]; children: Node[]; selfClosing: boolean }
  | { kind: "text"; value: string }
  | { kind: "comment"; value: string }
  | { kind: "cdata"; value: string };

type Document = { declaration: string | null; root: Node; elementCount: number };

class XmlSyntaxError extends Error {
  position: number;
  constructor(position: number, message: string) {
    super(message);
    this.position = position;
  }
}

function parseXml(text: string): Document {
  let i = 0;
  const n = text.length;
  let elementCount = 0;

  const fail = (pos: number, message: string): never => {
    throw new XmlSyntaxError(pos, message);
  };

  const isWhitespace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);
  const skipWhitespace = () => {
    while (i < n && isWhitespace(text[i])) i++;
  };

  let declaration: string | null = null;

  function skipMisc(): void {
    for (;;) {
      skipWhitespace();
      if (text.startsWith("<?", i)) {
        const start = i;
        const end = text.indexOf("?>", i);
        if (end === -1) fail(i, "İşləmə göstərişi («<? ?>») bağlanmayıb.");
        if (text.startsWith("<?xml", i) && declaration === null && start === 0) {
          declaration = text.slice(start, end + 2);
        }
        i = end + 2;
        continue;
      }
      if (text.startsWith("<!--", i)) {
        const end = text.indexOf("-->", i);
        if (end === -1) fail(i, "Şərh («<!-- -->») bağlanmayıb.");
        i = end + 3;
        continue;
      }
      if (text.startsWith("<!DOCTYPE", i)) {
        const end = text.indexOf(">", i);
        if (end === -1) fail(i, "DOCTYPE bağlanmayıb.");
        i = end + 1;
        continue;
      }
      break;
    }
  }

  const isNameStart = (ch: string | undefined) => ch !== undefined && /[A-Za-z_:]/.test(ch);
  const isNameChar = (ch: string | undefined) => ch !== undefined && /[A-Za-z0-9_:.-]/.test(ch);

  function readName(): string {
    const start = i;
    if (!isNameStart(text[i])) fail(i, "Teq adı gözlənilirdi.");
    i++;
    while (isNameChar(text[i])) i++;
    return text.slice(start, i);
  }

  function readAttrs(): [string, string][] {
    const attrs: [string, string][] = [];
    const seen = new Set<string>();
    for (;;) {
      skipWhitespace();
      if (i >= n) fail(i, "Teq bağlanmayıb.");
      const ch = text[i];
      if (ch === ">" || ch === "/") break;
      const attrStart = i;
      const name = readName();
      skipWhitespace();
      if (text[i] !== "=") fail(i, `"${name}" atributundan sonra "=" gözlənilirdi.`);
      i++;
      skipWhitespace();
      const quote = text[i];
      if (quote !== '"' && quote !== "'") fail(i, "Atribut dəyəri dırnaq içində olmalıdır.");
      i++;
      const start = i;
      while (i < n && text[i] !== quote) i++;
      if (i >= n) fail(start, "Atribut dəyərinin dırnağı bağlanmayıb.");
      const value = text.slice(start, i);
      i++;
      if (seen.has(name)) fail(attrStart, `Təkrarlanan atribut: "${name}".`);
      seen.add(name);
      attrs.push([name, value]);
    }
    return attrs;
  }

  function readElement(): Node {
    const startPos = i;
    i++; // '<'
    const tag = readName();
    elementCount++;
    const attrs = readAttrs();
    skipWhitespace();
    if (text.startsWith("/>", i)) {
      i += 2;
      return { kind: "element", tag, attrs, children: [], selfClosing: true };
    }
    if (text[i] !== ">") fail(i, `"<${tag}>" bağlanmayıb: ">" gözlənilirdi.`);
    i++;

    const children: Node[] = [];
    let textBuffer = "";
    const flushText = () => {
      if (textBuffer !== "") {
        children.push({ kind: "text", value: textBuffer });
        textBuffer = "";
      }
    };

    for (;;) {
      if (i >= n) fail(startPos, `"<${tag}>" üçün bağlanış teqi tapılmadı.`);
      if (text.startsWith("<![CDATA[", i)) {
        flushText();
        const end = text.indexOf("]]>", i + 9);
        if (end === -1) fail(i, "CDATA bağlanmayıb.");
        children.push({ kind: "cdata", value: text.slice(i + 9, end) });
        i = end + 3;
        continue;
      }
      if (text.startsWith("<!--", i)) {
        flushText();
        const end = text.indexOf("-->", i);
        if (end === -1) fail(i, "Şərh bağlanmayıb.");
        children.push({ kind: "comment", value: text.slice(i + 4, end) });
        i = end + 3;
        continue;
      }
      if (text.startsWith("</", i)) {
        flushText();
        const closeStart = i;
        i += 2;
        const closeName = readName();
        skipWhitespace();
        if (text[i] !== ">") fail(i, "Bağlanış teqi düzgün formatlanmayıb.");
        i++;
        if (closeName !== tag) fail(closeStart, `"</${closeName}>" "<${tag}>" ilə uyğun gəlmir.`);
        return { kind: "element", tag, attrs, children, selfClosing: false };
      }
      if (text[i] === "<") {
        flushText();
        children.push(readElement());
        continue;
      }
      textBuffer += text[i];
      i++;
    }
  }

  skipMisc();
  if (i >= n || text[i] !== "<") fail(i, "Kök element tapılmadı.");
  const root = readElement();
  skipWhitespace();
  skipMisc();
  skipWhitespace();
  if (i < n) fail(i, "Kök elementdən sonra əlavə məzmun var: XML-də yalnız bir kök ola bilər.");

  return { declaration, root, elementCount };
}

function parseOrThrowIssue(text: string): Document {
  if (text.trim() === "") throw new XmlSyntaxError(0, "XML mətni boşdur.");
  return parseXml(text);
}

function toIssue(text: string, cause: unknown): { error: string; line: number; column: number } {
  if (cause instanceof XmlSyntaxError) {
    const loc = locate(text, cause.position);
    return { error: cause.message, line: loc.line, column: loc.column };
  }
  return { error: "XML təhlil oluna bilmədi, quruluş gözlənilməz formadadır.", line: 1, column: 1 };
}

/* ---------- validation ---------- */

export function validateXml(text: string): XmlValidateResult {
  try {
    const doc = parseOrThrowIssue(text);
    const rootTag = doc.root.kind === "element" ? doc.root.tag : "";
    return { ok: true, rootTag, elementCount: doc.elementCount };
  } catch (cause) {
    return { ok: false, ...toIssue(text, cause) };
  }
}

/* ---------- formatting ---------- */

/*
 * Neither entities nor angle brackets are decoded on the way in (unlike
 * `json-xml.ts`, which turns them into a JS value): this file's job is to
 * re-indent a document, not reinterpret it, so a captured text or attribute
 * run is already valid XML content and is written back verbatim. The one
 * exception is a literal `"` inside an attribute value that was originally
 * single-quoted — this file always re-emits attributes in double quotes, so
 * that one character is escaped to keep the result well-formed.
 */
function escapeText(text: string): string {
  return text;
}
function escapeAttr(text: string): string {
  return text.replace(/"/g, "&quot;");
}

function indentUnit(indent: XmlIndent): string {
  return indent === "tab" ? "\t" : " ".repeat(Number(indent));
}

/** True when an element's only content is a single text node — the case that gets `<a>text</a>` on one line. */
function isTextOnly(node: Node & { kind: "element" }): string | null {
  if (node.children.length !== 1) return null;
  const only = node.children[0];
  return only.kind === "text" ? only.value : null;
}

function renderNode(node: Node, depth: number, unit: string, lines: string[]): void {
  const pad = unit.repeat(depth);

  if (node.kind === "text") {
    const trimmed = node.value.trim();
    if (trimmed !== "") lines.push(`${pad}${escapeText(trimmed)}`);
    return;
  }
  if (node.kind === "comment") {
    lines.push(`${pad}<!--${node.value}-->`);
    return;
  }
  if (node.kind === "cdata") {
    lines.push(`${pad}<![CDATA[${node.value}]]>`);
    return;
  }

  const attrString = node.attrs.map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join("");

  if (node.selfClosing || (node.children.length === 0 && !node.selfClosing)) {
    lines.push(node.children.length === 0 ? `${pad}<${node.tag}${attrString} />` : `${pad}<${node.tag}${attrString}></${node.tag}>`);
    return;
  }

  const asText = isTextOnly(node);
  if (asText !== null) {
    lines.push(`${pad}<${node.tag}${attrString}>${escapeText(asText.trim())}</${node.tag}>`);
    return;
  }

  lines.push(`${pad}<${node.tag}${attrString}>`);
  for (const child of node.children) renderNode(child, depth + 1, unit, lines);
  lines.push(`${pad}</${node.tag}>`);
}

export function prettyPrintXml(text: string, indent: XmlIndent): XmlFormatResult {
  try {
    const doc = parseOrThrowIssue(text);
    const unit = indentUnit(indent);
    const lines: string[] = [];
    if (doc.declaration) lines.push(doc.declaration);
    renderNode(doc.root, 0, unit, lines);
    return { ok: true, output: `${lines.join("\n")}\n` };
  } catch (cause) {
    return { ok: false, ...toIssue(text, cause) };
  }
}

function renderNodeMinified(node: Node, out: string[]): void {
  if (node.kind === "text") {
    const trimmed = node.value.trim();
    if (trimmed !== "") out.push(escapeText(trimmed));
    return;
  }
  if (node.kind === "comment") {
    out.push(`<!--${node.value}-->`);
    return;
  }
  if (node.kind === "cdata") {
    out.push(`<![CDATA[${node.value}]]>`);
    return;
  }

  const attrString = node.attrs.map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join("");
  if (node.children.length === 0) {
    out.push(`<${node.tag}${attrString} />`);
    return;
  }
  out.push(`<${node.tag}${attrString}>`);
  for (const child of node.children) renderNodeMinified(child, out);
  out.push(`</${node.tag}>`);
}

export function minifyXml(text: string): XmlFormatResult {
  try {
    const doc = parseOrThrowIssue(text);
    const parts: string[] = [];
    if (doc.declaration) parts.push(doc.declaration);
    renderNodeMinified(doc.root, parts);
    return { ok: true, output: parts.join("") };
  } catch (cause) {
    return { ok: false, ...toIssue(text, cause) };
  }
}
