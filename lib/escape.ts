/**
 * Ten ways to make a string safe to embed somewhere else, each both
 * directions: escape a raw string for a destination, or unescape a string
 * copied out of one back to what it actually says.
 *
 * Three of the ten reuse another tool's already-correct, already-tested
 * implementation rather than a second copy of it: URL encoding is
 * `url.ts`'s `encodeWithStyle`/`decodeWithStyle`, Base64 is `base64.ts`'s
 * `encodeBase64`/`decodeBase64`, and HTML decoding is `html.ts`'s
 * `decodeEntities`. The other seven modes have no existing implementation on
 * this site to reuse and are written here.
 *
 * No mode's decoder uses `eval`, `new Function` or a JSON round-trip through
 * an unrelated destination's parser to unescape its own encoding — each
 * walks its own input by hand, so a malformed escape sequence is a returned
 * error rather than arbitrary code running or a wrong destination's rules
 * silently applying.
 */
import { decodeBase64, encodeBase64, type Base64Options, type DecodeResult as Base64DecodeResult } from "./base64.js";
import { decodeEntities } from "./html.js";
import { decodeWithStyle, encodeWithStyle } from "./url.js";

export type EscapeResult = { ok: true; text: string } | { ok: false; error: string };

/* ---------- JSON string ---------- */

/** `JSON.stringify` of a single string is already a spec-correct JSON string literal, quotes included — there is no reason to hand-write RFC 8259's escaping rules a second time. */
export function encodeJsonString(text: string): string {
  return JSON.stringify(text);
}

export function decodeJsonString(text: string): EscapeResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "Boş sahə: qaçırılmış JSON sətrini yapışdır." };
  const candidate = trimmed.startsWith('"') ? trimmed : `"${trimmed}"`;
  try {
    const value = JSON.parse(candidate);
    if (typeof value !== "string") {
      return { ok: false, error: "Bu düzgün JSON sətri deyil: nəticə string tipində çıxmadı." };
    }
    return { ok: true, text: value };
  } catch {
    return { ok: false, error: "Bu düzgün JSON sətri deyil. Qaçırma ardıcıllığı yarımçıqdır." };
  }
}

/* ---------- HTML entity ---------- */

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const HTML_ESCAPE_PATTERN = /[&<>"']/g;

export function encodeHtmlEntities(text: string): string {
  return text.replace(HTML_ESCAPE_PATTERN, (char) => HTML_ESCAPE_MAP[char]);
}

/** `decodeEntities` also resolves the ~50 named entities beyond the five HTML mandates (`&copy;`, `&mdash;`, ...) and numeric references — exactly what a visitor pasting real page markup needs, and never fails, so this never returns an error. */
export function decodeHtmlEntities(text: string): EscapeResult {
  return { ok: true, text: decodeEntities(text) };
}

/* ---------- XML ---------- */

const XML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
const XML_ESCAPE_PATTERN = /[&<>"']/g;

/** XML has no legacy bare-entity forms and no named table beyond these five — every one of them is escaped every time, unlike HTML mode's five-mandatory-plus-others-optional rule. */
export function encodeXml(text: string): string {
  return text.replace(XML_ESCAPE_PATTERN, (char) => XML_ESCAPE_MAP[char]);
}

const XML_NAMED = new Map(Object.entries(XML_ESCAPE_MAP).map(([raw, entity]) => [entity, raw]));

/**
 * Only the five predefined XML entities and numeric character references —
 * `&copy;` is not decoded, because a real XML document has no built-in name
 * for it and would fail to parse; a name this decoder does not recognise is
 * left exactly as written, matching how a strict XML parser treats it as an
 * error condition it should surface rather than guess past.
 */
export function decodeXml(text: string): EscapeResult {
  let sawUnknown = false;
  const result = text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const digits = hex ? body.slice(2) : body.slice(1);
      const code = Number.parseInt(digits, hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
        sawUnknown = true;
        return whole;
      }
      return String.fromCodePoint(code);
    }
    const named = XML_NAMED.get(`&${body};`);
    if (named === undefined) {
      sawUnknown = true;
      return whole;
    }
    return named;
  });

  if (sawUnknown) {
    return {
      ok: false,
      error: "Naməlum entity var: XML-də yalnız &amp; &lt; &gt; &quot; &apos; və ədədi istinadlar tanınır.",
    };
  }
  return { ok: true, text: result };
}

/* ---------- URL ---------- */

export type UrlEscapeStyle = "component" | "full";

/** Delegates straight to `url.ts`, which already draws the line between escaping one query value (`component`) and escaping a whole URL while leaving its structure characters alone (`full`). */
export function encodeUrl(text: string, style: UrlEscapeStyle): string {
  return encodeWithStyle(text, style === "component" ? "component" : "uri");
}

export function decodeUrl(text: string, style: UrlEscapeStyle): EscapeResult {
  const outcome = decodeWithStyle(text, style === "component" ? "component" : "uri");
  return outcome.ok ? { ok: true, text: outcome.text } : { ok: false, error: outcome.error };
}

/* ---------- SQL string ---------- */

export type SqlEscapeDialect = "standard" | "mysql";

/**
 * The standard SQL rule (PostgreSQL, SQLite, the ANSI standard itself)
 * doubles an embedded single quote and nothing else. MySQL additionally
 * accepts a backslash before a quote or a backslash — the same dialect
 * split `sql.ts`'s own string scanner documents from the parsing side.
 */
export function encodeSqlString(text: string, dialect: SqlEscapeDialect): string {
  if (dialect === "mysql") return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return text.replace(/'/g, "''");
}

export function decodeSqlString(text: string, dialect: SqlEscapeDialect): EscapeResult {
  if (dialect === "mysql") {
    let out = "";
    let index = 0;
    while (index < text.length) {
      if (text[index] === "\\") {
        if (index + 1 >= text.length) {
          return { ok: false, error: "Sətir tək tərs slashla bitir: qaçırma ardıcıllığı yarımçıqdır." };
        }
        out += text[index + 1];
        index += 2;
        continue;
      }
      out += text[index];
      index += 1;
    }
    return { ok: true, text: out };
  }

  let out = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "'") {
      if (text[index + 1] === "'") {
        out += "'";
        index += 2;
        continue;
      }
      return {
        ok: false,
        error: "Tək qalan dırnaq var: standart SQL-də daxili dırnaq iki dəfə yazılmalıdır (''), tək yox.",
      };
    }
    out += char;
    index += 1;
  }
  return { ok: true, text: out };
}

/* ---------- POSIX shell ---------- */

/** Wraps the whole value in single quotes — the one POSIX form nothing inside can break out of, because a single quote cannot be escaped inside itself and must instead close the quote, insert one escaped quote, and reopen it. */
export function encodeShellSingleQuote(text: string): string {
  return `'${text.split("'").join(`'\\''`)}'`;
}

/**
 * `restored` legitimately containing a single quote is not by itself a sign
 * of malformed input — the decoded text is allowed to contain one, that is
 * the entire point of decoding it. The real check is a round trip: feeding
 * `restored` straight back through `encodeShellSingleQuote` has to
 * reproduce the exact input, or the input was never one this function's own
 * encoder could have produced.
 */
export function decodeShellSingleQuote(text: string): EscapeResult {
  const trimmed = text.trim();
  if (trimmed.length < 2 || !trimmed.startsWith("'") || !trimmed.endsWith("'")) {
    return { ok: false, error: "Tək dırnaqla başlayıb bitməyən sətir POSIX qaçırması deyil." };
  }
  const inner = trimmed.slice(1, -1);
  const restored = inner.split(`'\\''`).join("'");
  if (encodeShellSingleQuote(restored) !== trimmed) {
    return { ok: false, error: "Tək dırnaq düzgün qaçırılmayıb: `'\\''` ardıcıllığı gözlənilir." };
  }
  return { ok: true, text: restored };
}

/* ---------- regular expression ---------- */

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

export function encodeRegex(text: string): string {
  return text.replace(REGEX_SPECIALS, "\\$&");
}

export function decodeRegex(text: string): EscapeResult {
  return { ok: true, text: text.replace(/\\([.*+?^${}()|[\]\\])/g, "$1") };
}

/* ---------- CSV cell ---------- */

/** RFC 4180: a cell only needs quoting when it contains the delimiter, a quote or a line break; quoting every cell would be legal but is not what a hand-inspected diff expects. */
export function encodeCsvCell(text: string): string {
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * A hand-walked scanner rather than a strip-and-replace: a lone,
 * un-doubled quote inside a quoted cell is malformed CSV, and the only way
 * to tell "malformed" apart from "a legitimately doubled quote" is to read
 * the field one character at a time.
 */
export function decodeCsvCell(text: string): EscapeResult {
  if (!text.startsWith('"')) {
    if (text.includes('"')) {
      return { ok: false, error: "Dırnaqla başlamayan xanada dırnaq işarəsi var, bu düzgün CSV xanası deyil." };
    }
    return { ok: true, text };
  }

  let out = "";
  let index = 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      if (text[index + 1] === '"') {
        out += '"';
        index += 2;
        continue;
      }
      if (index === text.length - 1) return { ok: true, text: out };
      return { ok: false, error: "Qapanan dırnaqdan sonra artıq mətn var, xana düzgün bağlanmayıb." };
    }
    out += char;
    index += 1;
  }
  return { ok: false, error: "Qapanmayan dırnaq: CSV xanası bağlanmayıb." };
}

/* ---------- Base64 ---------- */

export type { Base64Options };
export type BaseSixtyFourResult = Base64DecodeResult;

export function encodeBase64Text(text: string, options: Base64Options): string {
  return encodeBase64(text, options);
}

export function decodeBase64Text(text: string): BaseSixtyFourResult {
  return decodeBase64(text);
}

/* ---------- JS string literal ---------- */

export type JsQuoteChar = "'" | '"';

/**
 * Differs from JSON mode in two ways a visitor actually hits: the quote
 * character is a choice (JSON is always double-quoted), and non-ASCII text
 * can be forced through `\u` escapes for a codebase or a log pipeline that
 * still assumes plain ASCII source — JSON mode never does this, because
 * RFC 8259 already allows raw Unicode in a JSON string and forcing it would
 * only be noise.
 */
export function encodeJsString(text: string, quote: JsQuoteChar, forceUnicodeEscape: boolean): string {
  let out = quote;
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (char === "\\") out += "\\\\";
    else if (char === quote) out += `\\${quote}`;
    else if (char === "\n") out += "\\n";
    else if (char === "\r") out += "\\r";
    else if (char === "\t") out += "\\t";
    else if (codePoint < 0x20) out += `\\u${codePoint.toString(16).padStart(4, "0")}`;
    else if (forceUnicodeEscape && codePoint > 0x7e) {
      out += codePoint > 0xffff ? `\\u{${codePoint.toString(16)}}` : `\\u${codePoint.toString(16).padStart(4, "0")}`;
    } else out += char;
  }
  return out + quote;
}

/** Walked by hand rather than through `JSON.parse` or `eval`: a JS string literal allows escapes (`\xNN`, a bare `\0`) that JSON forbids, and `eval` on visitor-typed text is not a line this tool crosses. */
export function decodeJsString(text: string): EscapeResult {
  let body = text;
  if (body.length >= 2 && (body[0] === "'" || body[0] === '"') && body[body.length - 1] === body[0]) {
    body = body.slice(1, -1);
  }

  let out = "";
  let index = 0;
  while (index < body.length) {
    const char = body[index];
    if (char !== "\\") {
      out += char;
      index += 1;
      continue;
    }

    const next = body[index + 1];
    if (next === undefined) {
      return { ok: false, error: "Sətir tək tərs slashla bitir: qaçırma ardıcıllığı yarımçıqdır." };
    }

    if (next === "u" && body[index + 2] === "{") {
      const end = body.indexOf("}", index + 3);
      if (end === -1) return { ok: false, error: "`\\u{...}` bağlanmayıb." };
      const hex = body.slice(index + 3, end);
      const codePoint = Number.parseInt(hex, 16);
      if (hex === "" || Number.isNaN(codePoint) || codePoint > 0x10ffff) {
        return { ok: false, error: "`\\u{...}` içindəki kod nöqtəsi düzgün deyil." };
      }
      out += String.fromCodePoint(codePoint);
      index = end + 1;
      continue;
    }

    if (next === "u") {
      const hex = body.slice(index + 2, index + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        return { ok: false, error: "`\\u` qaçırmasından sonra 4 onaltılıq rəqəm gözlənilir." };
      }
      out += String.fromCharCode(Number.parseInt(hex, 16));
      index += 6;
      continue;
    }

    if (next === "x") {
      const hex = body.slice(index + 2, index + 4);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
        return { ok: false, error: "`\\x` qaçırmasından sonra 2 onaltılıq rəqəm gözlənilir." };
      }
      out += String.fromCharCode(Number.parseInt(hex, 16));
      index += 4;
      continue;
    }

    const named: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "0": "\0" };
    out += named[next] ?? next;
    index += 2;
  }

  return { ok: true, text: out };
}

/* ---------- mode metadata ---------- */

export type EscapeModeId =
  | "json"
  | "html"
  | "xml"
  | "url"
  | "sql"
  | "shell"
  | "regex"
  | "csv"
  | "base64"
  | "js";

export const ESCAPE_MODES: EscapeModeId[] = [
  "json",
  "html",
  "xml",
  "url",
  "sql",
  "shell",
  "regex",
  "csv",
  "base64",
  "js",
];

export const ESCAPE_MODE_LABELS: Record<EscapeModeId, string> = {
  json: "JSON sətri",
  html: "HTML entity",
  xml: "XML",
  url: "URL",
  sql: "SQL sətri",
  shell: "Shell (POSIX)",
  regex: "Regex",
  csv: "CSV xanası",
  base64: "Base64",
  js: "JS sətri",
};

/** One sentence per mode: what actually goes wrong without this escaping. */
export const ESCAPE_MODE_WHY: Record<EscapeModeId, string> = {
  json: "Qaçırılmamış dırnaq və ya sətir keçidi JSON.parse-i sındırır.",
  html: "Qaçırılmamış < və & brauzerdə mətni teq kimi oxutdurur.",
  xml: "XML-də bu beş simvoldan biri qaçırılmasa sənəd ümumiyyətlə parse olunmur.",
  url: "Boşluq və xüsusi simvol sorğu sətrini yanlış yerdən bölür.",
  sql: "Qaçırılmamış tək dırnaq SQL inyeksiyasının ən sadə yoludur.",
  shell: "Qaçırılmamış boşluq və `$` shell-də ayrı arqument və ya dəyişən kimi oxunur.",
  regex: "Nöqtə, ulduz və mötərizə kimi simvollar qaçırılmasa hərfi mənasını itirir.",
  csv: "Vergül və sətir keçidi qaçırılmasa cədvəl sütunları sürüşür.",
  base64: "İkilik məlumat mətn kanalından (e-poçt, JSON) keçmək üçün Base64-ə çevrilir.",
  js: "Qaçırılmamış dırnaq JS mənbə faylında sintaksis xətası yaradır.",
};
