/**
 * JSON ⇄ XML, both directions hand-written against one fixed convention
 * rather than any of the several incompatible ones real converters use: an
 * object key becomes a tag, an array value repeats that tag once per item, a
 * key prefixed with `@` becomes an attribute on the tag that holds it, and
 * `#text` holds an element's own text alongside its attributes or children.
 * What is worth checking: the convention round-trips (JSON → XML → JSON
 * returns the same value once numbers are compared as the strings XML always
 * makes them), attributes and repeated tags both survive that round trip, a
 * self-closing element and an entity-escaped text node come back correctly,
 * and a broken document — an unclosed tag, a mismatched close, more than one
 * root — errors with a line and column instead of throwing past the caller.
 */
import { formatJson, locate } from "./json";

export type JsonToXmlResult =
  | { ok: true; output: string }
  | { ok: false; error: string; line?: number; column?: number };

export type XmlToJsonResult =
  | { ok: true; output: string; value: unknown; rootTag: string }
  | { ok: false; error: string; line?: number; column?: number };

/* ---------- JSON -> XML ---------- */

const TAG_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export function isValidXmlTagName(name: string): boolean {
  return TAG_NAME_PATTERN.test(name);
}

function escapeXmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeXmlAttr(text: string): string {
  return escapeXmlText(text).replace(/"/g, "&quot;");
}

class XmlBuildError extends Error {}

function buildElement(tagName: string, value: unknown, depth: number): string[] {
  const pad = "  ".repeat(depth);

  if (!isValidXmlTagName(tagName)) {
    throw new XmlBuildError(`"${tagName}" düzgün XML teq adı deyil: hərf və ya "_" ilə başlamalıdır.`);
  }

  if (value === null || value === undefined) {
    return [`${pad}<${tagName} />`];
  }

  if (Array.isArray(value)) {
    throw new XmlBuildError(
      `"${tagName}" massiv içində massivdir: XML bunu birbaşa ifadə edə bilmir, əvvəlcə düzləşdir.`,
    );
  }

  if (typeof value !== "object") {
    return [`${pad}<${tagName}>${escapeXmlText(String(value))}</${tagName}>`];
  }

  const obj = value as Record<string, unknown>;
  const attrs: string[] = [];
  const children: string[] = [];
  let textContent: string | null = null;

  for (const [key, item] of Object.entries(obj)) {
    if (key.startsWith("@")) {
      if (item !== null && typeof item === "object") {
        throw new XmlBuildError(`"${key}" atributunun dəyəri sadə olmalıdır, obyekt və ya massiv ola bilməz.`);
      }
      attrs.push(`${key.slice(1)}="${escapeXmlAttr(String(item))}"`);
      continue;
    }
    if (key === "#text") {
      textContent = String(item);
      continue;
    }
    if (Array.isArray(item)) {
      for (const entry of item) children.push(...buildElement(key, entry, depth + 1));
    } else {
      children.push(...buildElement(key, item, depth + 1));
    }
  }

  const attrString = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";

  if (children.length === 0 && textContent === null) {
    return [`${pad}<${tagName}${attrString} />`];
  }
  if (children.length === 0 && textContent !== null) {
    return [`${pad}<${tagName}${attrString}>${escapeXmlText(textContent)}</${tagName}>`];
  }

  const lines = [`${pad}<${tagName}${attrString}>`];
  if (textContent !== null) lines.push(`${"  ".repeat(depth + 1)}${escapeXmlText(textContent)}`);
  lines.push(...children);
  lines.push(`${pad}</${tagName}>`);
  return lines;
}

export function jsonToXml(jsonText: string, rootTag: string): JsonToXmlResult {
  if (!isValidXmlTagName(rootTag)) {
    return { ok: false, error: `"${rootTag}" düzgün XML teq adı deyil: hərf və ya "_" ilə başlamalıdır.` };
  }

  const parsed = formatJson(jsonText, { mode: "pretty", indent: "2", sortKeys: false });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error.message, line: parsed.error.line, column: parsed.error.column };
  }

  try {
    const lines = buildElement(rootTag, parsed.value, 0);
    return { ok: true, output: `<?xml version="1.0" encoding="UTF-8"?>\n${lines.join("\n")}\n` };
  } catch (cause) {
    if (cause instanceof XmlBuildError) return { ok: false, error: cause.message };
    throw cause;
  }
}

/* ---------- XML -> JSON ---------- */

type XmlElement = { tag: string; attrs: [string, string][]; children: XmlNode[] };
type XmlNode = XmlElement | { text: string };

function isElement(node: XmlNode): node is XmlElement {
  return "tag" in node;
}

class XmlSyntaxError extends Error {
  position: number;
  constructor(position: number, message: string) {
    super(message);
    this.position = position;
  }
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    switch (entity) {
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "amp":
        return "&";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        return match;
    }
  });
}

function parseXmlDocument(text: string): XmlElement {
  let i = 0;
  const n = text.length;

  const fail = (pos: number, message: string): never => {
    throw new XmlSyntaxError(pos, message);
  };

  const isWhitespace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);
  const skipWhitespace = () => {
    while (i < n && isWhitespace(text[i])) i++;
  };

  function skipMisc(): void {
    for (;;) {
      skipWhitespace();
      if (text.startsWith("<?", i)) {
        const end = text.indexOf("?>", i);
        if (end === -1) fail(i, "İşləmə göstərişi («<? ?>») bağlanmayıb.");
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
    for (;;) {
      skipWhitespace();
      if (i >= n) fail(i, "Teq bağlanmayıb.");
      const ch = text[i];
      if (ch === ">" || ch === "/") break;
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
      attrs.push([name, decodeEntities(text.slice(start, i))]);
      i++;
    }
    return attrs;
  }

  function readElement(): XmlElement {
    const startPos = i;
    i++; // '<'
    const tag = readName();
    const attrs = readAttrs();
    skipWhitespace();
    if (text.startsWith("/>", i)) {
      i += 2;
      return { tag, attrs, children: [] };
    }
    if (text[i] !== ">") fail(i, `"<${tag}>" bağlanmayıb: ">" gözlənilirdi.`);
    i++;

    const children: XmlNode[] = [];
    let textBuffer = "";
    const flushText = () => {
      if (textBuffer !== "") {
        children.push({ text: decodeEntities(textBuffer) });
        textBuffer = "";
      }
    };

    for (;;) {
      if (i >= n) fail(startPos, `"<${tag}>" üçün bağlanış teqi tapılmadı.`);
      if (text.startsWith("<![CDATA[", i)) {
        const end = text.indexOf("]]>", i + 9);
        if (end === -1) fail(i, "CDATA bağlanmayıb.");
        textBuffer += text.slice(i + 9, end);
        i = end + 3;
        continue;
      }
      if (text.startsWith("<!--", i)) {
        const end = text.indexOf("-->", i);
        if (end === -1) fail(i, "Şərh bağlanmayıb.");
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
        return { tag, attrs, children };
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

  return root;
}

function elementToJson(el: XmlElement): unknown {
  const hasElementChildren = el.children.some(isElement);
  const combinedText = el.children
    .filter((c): c is { text: string } => !isElement(c))
    .map((c) => c.text)
    .join("")
    .trim();

  if (el.attrs.length === 0 && !hasElementChildren) return combinedText;

  const obj: Record<string, unknown> = {};
  for (const [name, value] of el.attrs) obj[`@${name}`] = value;
  if (combinedText !== "") obj["#text"] = combinedText;

  const order: string[] = [];
  const grouped = new Map<string, unknown[]>();
  for (const child of el.children) {
    if (!isElement(child)) continue;
    const value = elementToJson(child);
    if (!grouped.has(child.tag)) {
      grouped.set(child.tag, []);
      order.push(child.tag);
    }
    grouped.get(child.tag)?.push(value);
  }
  for (const tag of order) {
    const values = grouped.get(tag) ?? [];
    obj[tag] = values.length === 1 ? values[0] : values;
  }

  return obj;
}

export function xmlToJson(xmlText: string, indent: "2" | "4" | "tab" = "2"): XmlToJsonResult {
  if (xmlText.trim() === "") return { ok: false, error: "XML mətni boşdur." };

  try {
    const root = parseXmlDocument(xmlText);
    const value = elementToJson(root);
    const indentStr = indent === "tab" ? "\t" : Number(indent);
    return { ok: true, output: JSON.stringify(value, null, indentStr), value, rootTag: root.tag };
  } catch (cause) {
    if (cause instanceof XmlSyntaxError) {
      const loc = locate(xmlText, cause.position);
      return { ok: false, error: cause.message, line: loc.line, column: loc.column };
    }
    return { ok: false, error: "XML təhlil oluna bilmədi: quruluş gözlənilməz formadadır." };
  }
}
