/**
 * JSON ⇄ TOML, written as a *documented subset* of TOML rather than a full
 * implementation of it — the same discipline `yaml.ts` uses, and for the same
 * reason: a construct this file does not understand is refused by name with a
 * line number, never silently mistranslated.
 *
 * Understood: strings (basic `"..."` and single-line literal `'...'`),
 * integers (decimal, `0x`, `0o`, `0b`, underscore separators), floats,
 * booleans, RFC 3339 dates/times (kept as the exact string written — TOML's
 * date is JSON's nearest exact type, an ISO string), inline arrays (which may
 * span several physical lines), inline tables, `[table]` and nested
 * `[a.b]` headers, and `[[array.of.tables]]` headers including one nested
 * under an array-of-tables element.
 *
 * Refused with a message: triple-quoted multi-line strings, `inf`/`nan`
 * (JSON has no way to write them, the same reason `yaml.ts` refuses
 * `.inf`/`.nan`), and a key redefined in the same table.
 *
 * The JSON → TOML direction never guesses a date from a plain string: a JSON
 * string is always written as a quoted TOML string, because nothing in JSON
 * says "this text was a date" and guessing wrong would be the silent
 * mistranslation this file exists to avoid.
 *
 * What is worth checking: a known JSON/TOML pair converts both ways, a
 * TOML → JSON → TOML round trip on tables, nested tables and an array of
 * tables agrees structurally, a date literal is kept as a string rather than
 * parsed, an inline array spanning several lines parses the same as one on a
 * single line, and every refused construct comes back as `{ ok: false }`
 * with a line and column rather than throwing.
 */
import { formatJson, locate } from "./json.js";

export type JsonToTomlResult = { ok: true; output: string } | { ok: false; error: string };

export type TomlToJsonResult =
  | { ok: true; output: string; value: unknown }
  | { ok: false; error: string; line?: number; column?: number };

/* ---------- TOML -> JSON ---------- */

class TomlSyntaxError extends Error {
  position: number;
  constructor(position: number, message: string) {
    super(message);
    this.position = position;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?)?$/;
const TIME_RE = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;
const BASIC_ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\" };

function parseTomlDocument(text: string): Record<string, unknown> {
  let i = 0;
  const n = text.length;
  const root: Record<string, unknown> = Object.create(null);
  let current: Record<string, unknown> = root;

  const fail = (pos: number, message: string): never => {
    throw new TomlSyntaxError(pos, message);
  };

  const isWhitespace = (ch: string | undefined) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
  const isBareKeyChar = (ch: string | undefined) => ch !== undefined && /[A-Za-z0-9_-]/.test(ch);

  function skipInsignificant(): void {
    for (;;) {
      while (i < n && isWhitespace(text[i])) i++;
      if (text[i] === "#") {
        while (i < n && text[i] !== "\n") i++;
        continue;
      }
      break;
    }
  }

  function readBasicString(): string {
    const start = i;
    if (text.startsWith('"""', i)) fail(start, 'Çoxsətirli sətir («"""») dəstəklənmir: tək sətirdə yaz.');
    i++; // opening quote
    let out = "";
    while (i < n) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === "\n") fail(start, "Sətir bu sətirdə bağlanmır: çoxsətirli sətir dəstəklənmir.");
      if (ch === "\\") {
        const escape = text[i + 1];
        if (escape === undefined) fail(i, "Sətir bağlanmayıb.");
        if (escape in BASIC_ESCAPES) {
          out += BASIC_ESCAPES[escape];
          i += 2;
          continue;
        }
        if (escape === "u" || escape === "U") {
          const width = escape === "u" ? 4 : 8;
          const hex = text.slice(i + 2, i + 2 + width);
          if (hex.length < width || !/^[0-9a-fA-F]+$/.test(hex)) {
            fail(i, `«\\${escape}» ardınca ${width} onaltılıq rəqəm gözlənilir.`);
          }
          out += String.fromCodePoint(parseInt(hex, 16));
          i += 2 + width;
          continue;
        }
        fail(i, `Tanınmayan qaçış ardıcıllığı: «\\${escape}».`);
      }
      out += ch;
      i++;
    }
    return fail(start, "Sətir bağlanmayıb.");
  }

  function readLiteralString(): string {
    const start = i;
    if (text.startsWith("'''", i)) fail(start, "Çoxsətirli literal sətir («'''») dəstəklənmir: tək sətirdə yaz.");
    i++; // opening quote
    const closeIdx = text.indexOf("'", i);
    const newlineIdx = text.indexOf("\n", i);
    if (closeIdx === -1) fail(start, "Literal sətir bağlanmayıb.");
    if (newlineIdx !== -1 && newlineIdx < closeIdx) {
      fail(start, "Sətir bu sətirdə bağlanmır: çoxsətirli sətir dəstəklənmir.");
    }
    const value = text.slice(i, closeIdx);
    i = closeIdx + 1;
    return value;
  }

  function readBareOrQuotedKey(): string {
    if (text[i] === '"') return readBasicString();
    if (text[i] === "'") return readLiteralString();
    const start = i;
    while (i < n && isBareKeyChar(text[i])) i++;
    if (i === start) fail(i, "Açar adı gözlənilirdi.");
    return text.slice(start, i);
  }

  function readDottedKey(): string[] {
    const parts = [readBareOrQuotedKey()];
    for (;;) {
      let j = i;
      while (j < n && (text[j] === " " || text[j] === "\t")) j++;
      if (text[j] !== ".") break;
      i = j + 1;
      while (i < n && (text[i] === " " || text[i] === "\t")) i++;
      parts.push(readBareOrQuotedKey());
    }
    return parts;
  }

  function readDateOrNumber(): unknown {
    const start = i;
    while (i < n && /[0-9A-Za-z:+.\-_]/.test(text[i])) i++;
    const token = text.slice(start, i);
    if (token === "") fail(start, "Dəyər gözlənilirdi.");

    if (DATE_RE.test(token) || TIME_RE.test(token)) return token;

    if (/^[+-]?(inf|nan)$/.test(token)) {
      fail(start, `«${token}» JSON-da yazıla bilmir: JSON-un sonsuzluq və NaN dəyəri yoxdur.`);
    }

    const cleaned = token.replace(/_/g, "");
    if (/^[+-]?0x[0-9a-fA-F]+$/.test(cleaned)) {
      const negative = cleaned.startsWith("-");
      const hex = cleaned.replace(/^[+-]?0x/, "");
      return (negative ? -1 : 1) * parseInt(hex, 16);
    }
    if (/^0o[0-7]+$/.test(cleaned)) return parseInt(cleaned.slice(2), 8);
    if (/^0b[01]+$/.test(cleaned)) return parseInt(cleaned.slice(2), 2);
    if (/^[+-]?\d+$/.test(cleaned)) {
      const value = Number(cleaned);
      if (!Number.isSafeInteger(value)) {
        fail(start, `«${token}» tam ədədi 2^53 həddini keçir və dəqiq saxlanıla bilmir.`);
      }
      return value;
    }
    if (/^[+-]?(\d+\.\d+([eE][+-]?\d+)?|\d+[eE][+-]?\d+)$/.test(cleaned)) return Number(cleaned);

    return fail(start, `«${token}» tanınan ədəd, boolean və ya tarix formatına uyğun gəlmir.`);
  }

  function readValue(): unknown {
    if (i >= n) fail(i, "Dəyər gözlənilirdi.");
    const ch = text[i];
    if (ch === '"') return readBasicString();
    if (ch === "'") return readLiteralString();
    if (ch === "[") return readArray();
    if (ch === "{") return readInlineTable();
    if (text.startsWith("true", i) && !isBareKeyChar(text[i + 4])) {
      i += 4;
      return true;
    }
    if (text.startsWith("false", i) && !isBareKeyChar(text[i + 5])) {
      i += 5;
      return false;
    }
    return readDateOrNumber();
  }

  function readArray(): unknown[] {
    i++; // '['
    const items: unknown[] = [];
    skipInsignificant();
    if (text[i] === "]") {
      i++;
      return items;
    }
    for (;;) {
      items.push(readValue());
      skipInsignificant();
      if (text[i] === ",") {
        i++;
        skipInsignificant();
        if (text[i] === "]") {
          i++;
          return items;
        }
        continue;
      }
      if (text[i] === "]") {
        i++;
        return items;
      }
      fail(i, "Massiv elementləri arasında vergül gözlənilir.");
    }
  }

  function assign(target: Record<string, unknown>, path: string[], value: unknown, pos: number): void {
    let node = target;
    for (let idx = 0; idx < path.length - 1; idx++) {
      const key = path[idx];
      const existing = node[key];
      if (existing === undefined) {
        const created: Record<string, unknown> = Object.create(null);
        node[key] = created;
        node = created;
        continue;
      }
      if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
        fail(pos, `«${key}» artıq sadə dəyər kimi təyin olunub: iç-içə açar üçün istifadə edilə bilməz.`);
      }
      node = existing as Record<string, unknown>;
    }
    const lastKey = path[path.length - 1];
    if (lastKey in node) fail(pos, `Təkrarlanan açar: «${lastKey}».`);
    node[lastKey] = value;
  }

  function readInlineTable(): Record<string, unknown> {
    i++; // '{'
    const obj: Record<string, unknown> = Object.create(null);
    skipInsignificant();
    if (text[i] === "}") {
      i++;
      return obj;
    }
    for (;;) {
      skipInsignificant();
      const pos = i;
      const path = readDottedKey();
      skipInsignificant();
      if (text[i] !== "=") fail(i, '«=» gözlənilirdi.');
      i++;
      skipInsignificant();
      const value = readValue();
      assign(obj, path, value, pos);
      skipInsignificant();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") {
        i++;
        return obj;
      }
      fail(i, "Cütlərin arasında vergül gözlənilir.");
    }
  }

  /** Walks from the root to the table a `[path]` / `[[path]]` header names, creating tables as it goes. */
  function navigate(path: string[], pos: number, isArrayHeader: boolean): Record<string, unknown> {
    let node = root;
    for (let idx = 0; idx < path.length - 1; idx++) {
      const key = path[idx];
      let child = node[key];
      if (child === undefined) {
        child = Object.create(null) as Record<string, unknown>;
        node[key] = child;
      }
      if (Array.isArray(child)) {
        const last = child[child.length - 1];
        if (typeof last !== "object" || last === null) {
          fail(pos, `«${key}» massivinin son elementi cədvəl deyil.`);
        }
        node = last as Record<string, unknown>;
      } else if (typeof child === "object" && child !== null) {
        node = child as Record<string, unknown>;
      } else {
        fail(pos, `«${key}» artıq sadə dəyər kimi təyin olunub, cədvəl kimi açıla bilməz.`);
      }
    }

    const lastKey = path[path.length - 1];
    if (isArrayHeader) {
      let arr = node[lastKey];
      if (arr === undefined) {
        arr = [];
        node[lastKey] = arr;
      }
      if (!Array.isArray(arr)) fail(pos, `«${lastKey}» massiv cədvəli deyil.`);
      const created: Record<string, unknown> = Object.create(null);
      (arr as unknown[]).push(created);
      return created;
    }

    let obj = node[lastKey];
    if (obj === undefined) {
      obj = Object.create(null) as Record<string, unknown>;
      node[lastKey] = obj;
    }
    if (Array.isArray(obj)) {
      const last = obj[obj.length - 1];
      if (typeof last !== "object" || last === null) fail(pos, `«${lastKey}» massivinin son elementi cədvəl deyil.`);
      return last as Record<string, unknown>;
    }
    if (typeof obj !== "object" || obj === null) {
      fail(pos, `«${lastKey}» artıq sadə dəyər kimi təyin olunub.`);
    }
    return obj as Record<string, unknown>;
  }

  for (;;) {
    skipInsignificant();
    if (i >= n) break;

    if (text[i] === "[") {
      const pos = i;
      if (text[i + 1] === "[") {
        i += 2;
        const path = readDottedKey();
        if (!text.startsWith("]]", i)) fail(i, '«]]» gözlənilirdi.');
        i += 2;
        current = navigate(path, pos, true);
      } else {
        i += 1;
        const path = readDottedKey();
        if (text[i] !== "]") fail(i, '«]» gözlənilirdi.');
        i += 1;
        current = navigate(path, pos, false);
      }
      continue;
    }

    const pos = i;
    const path = readDottedKey();
    skipInsignificant();
    if (text[i] !== "=") fail(i, '«=» gözlənilirdi.');
    i++;
    skipInsignificant();
    const value = readValue();
    assign(current, path, value, pos);
  }

  return root;
}

export function tomlToJson(tomlText: string, indent: "2" | "4" | "tab" = "2"): TomlToJsonResult {
  if (tomlText.trim() === "") return { ok: false, error: "TOML mətni boşdur." };

  try {
    const value = parseTomlDocument(tomlText);
    const indentStr = indent === "tab" ? "\t" : Number(indent);
    return { ok: true, output: JSON.stringify(value, null, indentStr), value };
  } catch (cause) {
    if (cause instanceof TomlSyntaxError) {
      const loc = locate(tomlText, cause.position);
      return { ok: false, error: cause.message, line: loc.line, column: loc.column };
    }
    return { ok: false, error: "TOML təhlil oluna bilmədi, quruluş gözlənilməz formadadır." };
  }
}

/* ---------- JSON -> TOML ---------- */

class TomlBuildError extends Error {}

function tomlQuoteString(text: string): string {
  let out = '"';
  for (const ch of text) {
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\r") out += "\\r";
    else if (ch.charCodeAt(0) < 0x20) out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return `${out}"`;
}

function tomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlQuoteString(key);
}

/*
 * A JSON string is always written back as a quoted TOML string, never as a
 * bare TOML date — nothing in a JSON value says "this text used to be a
 * date", and guessing would be exactly the silent mistranslation this file
 * exists to avoid. The date literal only appears on the TOML -> JSON side,
 * where TOML's own grammar names it.
 */
function tomlScalar(value: unknown): string {
  if (value === null) throw new TomlBuildError('TOML-da "null" dəyəri yoxdur: sahəni sil, ya da boş sətir yaz.');
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TomlBuildError("Sonsuz və ya NaN ədəd TOML-da yazıla bilmir.");
    return String(value);
  }
  if (typeof value === "string") return tomlQuoteString(value);
  throw new TomlBuildError("Gözlənilməz dəyər növü.");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArrayOfTables(value: unknown[]): value is Record<string, unknown>[] {
  return value.length > 0 && value.every((item) => isPlainObject(item));
}

function tomlInlineArray(value: unknown[]): string {
  const parts = value.map((item) => {
    if (isPlainObject(item)) throw new TomlBuildError("Massiv həm cədvəl, həm sadə dəyər eyni vaxtda daşıya bilməz.");
    if (Array.isArray(item)) return tomlInlineArray(item);
    return tomlScalar(item);
  });
  return `[${parts.join(", ")}]`;
}

function emitBody(obj: Record<string, unknown>, path: string[], lines: string[]): void {
  const scalarLines: string[] = [];
  const tableEntries: [string, Record<string, unknown>][] = [];
  const arrayTableEntries: [string, Record<string, unknown>[]][] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (isPlainObject(value)) {
      tableEntries.push([key, value]);
    } else if (Array.isArray(value) && isArrayOfTables(value)) {
      arrayTableEntries.push([key, value]);
    } else if (Array.isArray(value)) {
      scalarLines.push(`${tomlKey(key)} = ${tomlInlineArray(value)}`);
    } else {
      scalarLines.push(`${tomlKey(key)} = ${tomlScalar(value)}`);
    }
  }

  lines.push(...scalarLines);

  for (const [key, child] of tableEntries) {
    lines.push("");
    lines.push(`[${[...path, key].map(tomlKey).join(".")}]`);
    emitBody(child, [...path, key], lines);
  }
  for (const [key, items] of arrayTableEntries) {
    for (const item of items) {
      lines.push("");
      lines.push(`[[${[...path, key].map(tomlKey).join(".")}]]`);
      emitBody(item, [...path, key], lines);
    }
  }
}

export function jsonToToml(jsonText: string): JsonToTomlResult {
  const parsed = formatJson(jsonText, { mode: "pretty", indent: "2", sortKeys: false });
  if (!parsed.ok) return { ok: false, error: parsed.error.message };
  if (!isPlainObject(parsed.value)) {
    return { ok: false, error: "TOML-a çevirmək üçün JSON-un kökü obyekt olmalıdır: massiv və ya sadə dəyər ola bilməz." };
  }

  try {
    const lines: string[] = [];
    emitBody(parsed.value, [], lines);
    const output = lines.join("\n").replace(/^\n+/, "");
    return { ok: true, output: output === "" ? "" : `${output}\n` };
  } catch (cause) {
    if (cause instanceof TomlBuildError) return { ok: false, error: cause.message };
    throw cause;
  }
}
