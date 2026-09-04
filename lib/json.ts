/**
 * JSON formatting, minifying, key-sorting and validation. Pure functions, no
 * React and no DOM beyond TextEncoder, so `pnpm test` can prove the parsing
 * and error-location behaviour that the page only displays.
 */

const encoder = new TextEncoder();

export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** Input above this size still works, the page only warns instead of blocking. */
export const LARGE_INPUT_BYTES = 1_000_000;

export type IndentOption = "2" | "4" | "tab";

export type FormatOptions = {
  mode: "pretty" | "minify";
  indent: IndentOption;
  sortKeys: boolean;
};

export type JsonError = {
  message: string;
  line: number;
  column: number;
  snippet: string;
};

export type FormatResult =
  | { ok: true; output: string; value: unknown }
  | { ok: false; error: JsonError };

export function formatJson(text: string, options: FormatOptions): FormatResult {
  const parsed = parseWithLocation(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const value = options.sortKeys ? sortKeysDeep(parsed.value) : parsed.value;

  if (options.mode === "minify") {
    return { ok: true, output: JSON.stringify(value), value };
  }

  const indent = options.indent === "tab" ? "\t" : Number(options.indent);
  return { ok: true, output: JSON.stringify(value, null, indent), value };
}

export type JsonStats = {
  keyCount: number;
  maxDepth: number;
  arrayItemCount: number;
  originalBytes: number;
  minifiedBytes: number;
  savingsPercent: number;
};

/** `value` is an already-parsed JSON value — the caller gets it from `formatJson`. */
export function analyseJson(value: unknown, originalText: string): JsonStats {
  const totals = { keys: 0, maxDepth: 0, arrayItems: 0 };
  countStructure(value, 1, totals);

  const originalBytes = byteLength(originalText);
  const minifiedBytes = byteLength(JSON.stringify(value));
  const savingsPercent =
    originalBytes > 0 ? ((originalBytes - minifiedBytes) / originalBytes) * 100 : 0;

  return {
    keyCount: totals.keys,
    maxDepth: totals.maxDepth,
    arrayItemCount: totals.arrayItems,
    originalBytes,
    minifiedBytes,
    savingsPercent,
  };
}

function countStructure(
  value: unknown,
  depth: number,
  totals: { keys: number; maxDepth: number; arrayItems: number },
): void {
  if (Array.isArray(value)) {
    totals.maxDepth = Math.max(totals.maxDepth, depth);
    totals.arrayItems += value.length;
    for (const item of value) countStructure(item, depth + 1, totals);
    return;
  }
  if (value !== null && typeof value === "object") {
    totals.maxDepth = Math.max(totals.maxDepth, depth);
    const entries = Object.entries(value as Record<string, unknown>);
    totals.keys += entries.length;
    for (const [, item] of entries) countStructure(item, depth + 1, totals);
  }
}

export type SizeChange = {
  /** Bytes of the text on screen, not of some other mode's result. */
  outputBytes: number;
  /** Always positive — `grew` carries the direction. */
  changePercent: number;
  grew: boolean;
};

/**
 * The stats block used to print `analyseJson`'s minified figures in every
 * mode, so "Formatla" — which always produces a bigger file — advertised a
 * saving the visitor never received, and the size of the text actually shown
 * was never printed. This compares the produced text with the pasted one.
 */
export function compareSize(originalText: string, outputText: string): SizeChange {
  const originalBytes = byteLength(originalText);
  const outputBytes = byteLength(outputText);
  const delta = outputBytes - originalBytes;

  return {
    outputBytes,
    changePercent: originalBytes > 0 ? (Math.abs(delta) / originalBytes) * 100 : 0,
    grew: delta > 0,
  };
}

/**
 * `JSON.parse` keeps the last value of a repeated key and drops the rest, so
 * `{"a":1,"a":2}` parses to `{"a":2}` and the loss is invisible in the result.
 * Only the raw text still carries the evidence. Runs after a successful parse,
 * so it walks known-good JSON rather than validating it; anything unexpected
 * ends the walk instead of guessing.
 *
 * Each repeated key is reported once, as a path — `user.id`, `items[2].id` —
 * so a nested duplicate can be found in a long document.
 */
export function findDuplicateKeys(text: string): string[] {
  const duplicates: string[] = [];
  const n = text.length;
  let i = 0;
  let stopped = false;

  const isWhitespace = (ch: string) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
  const skipWhitespace = () => {
    while (i < n && isWhitespace(text[i])) i++;
  };

  /** Consumes one string literal and returns its decoded value. */
  function readString(): string | null {
    if (text[i] !== '"') {
      stopped = true;
      return null;
    }

    const start = i;
    i++;
    while (i < n) {
      const ch = text[i];
      i++;
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === '"') return JSON.parse(text.slice(start, i)) as string;
    }

    stopped = true;
    return null;
  }

  function walkValue(path: string): void {
    if (stopped) return;
    skipWhitespace();
    if (i >= n) {
      stopped = true;
      return;
    }

    const ch = text[i];
    if (ch === "{") return walkObject(path);
    if (ch === "[") return walkArray(path);
    if (ch === '"') {
      readString();
      return;
    }

    // A number or a literal cannot hold a key, so it is only stepped over.
    while (i < n && !isWhitespace(text[i]) && text[i] !== "," && text[i] !== "}" && text[i] !== "]") {
      i++;
    }
  }

  function walkObject(path: string): void {
    i++; // '{'
    const seen = new Set<string>();
    const reported = new Set<string>();

    skipWhitespace();
    if (text[i] === "}") {
      i++;
      return;
    }

    while (i < n && !stopped) {
      skipWhitespace();
      const key = readString();
      if (key === null) return;

      const keyPath = path === "" ? key : `${path}.${key}`;
      if (seen.has(key)) {
        if (!reported.has(key)) {
          reported.add(key);
          duplicates.push(keyPath);
        }
      } else {
        seen.add(key);
      }

      skipWhitespace();
      if (text[i] !== ":") {
        stopped = true;
        return;
      }
      i++;

      walkValue(keyPath);
      if (stopped) return;

      skipWhitespace();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") {
        i++;
        return;
      }

      stopped = true;
      return;
    }
  }

  function walkArray(path: string): void {
    i++; // '['
    skipWhitespace();
    if (text[i] === "]") {
      i++;
      return;
    }

    let index = 0;
    while (i < n && !stopped) {
      walkValue(`${path}[${index}]`);
      if (stopped) return;
      index++;

      skipWhitespace();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") {
        i++;
        return;
      }

      stopped = true;
      return;
    }
  }

  walkValue("");
  return duplicates;
}

/** Arrays keep their order — only object keys are sorted, at every depth. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);

  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysDeep(source[key]);
    }
    return sorted;
  }

  return value;
}

/**
 * Turns a character index into a 1-based line/column plus a snippet of the
 * broken line with one line of context on each side. Kept separate from
 * parsing so both the message-derived position and the scanner-derived
 * position share one formatter.
 */
export function locate(
  text: string,
  position: number,
): { line: number; column: number; snippet: string } {
  const clamped = Math.max(0, Math.min(position, text.length));
  const lines = text.split("\n");

  let line = 1;
  let column = 1;
  let consumed = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length;
    if (clamped <= consumed + lineLength) {
      line = i + 1;
      column = clamped - consumed + 1;
      break;
    }
    consumed += lineLength + 1; // +1 for the '\n' that split() removed
    line = i + 1;
    column = lineLength + 1;
  }

  const startIndex = Math.max(0, line - 2);
  const endIndex = Math.min(lines.length - 1, line);
  const width = String(endIndex + 1).length;

  const snippetLines: string[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const isErrorLine = i === line - 1;
    const marker = isErrorLine ? ">" : " ";
    const number = String(i + 1).padStart(width, " ");
    snippetLines.push(`${marker} ${number} | ${lines[i]}`);
    if (isErrorLine) {
      snippetLines.push(`${" ".repeat(width + 5 + (column - 1))}^`);
    }
  }

  return { line, column, snippet: snippetLines.join("\n") };
}

type ParseResult = { ok: true; value: unknown } | { ok: false; error: JsonError };

/**
 * `JSON.parse`'s error message differs between engines — some carry a
 * character position, some carry nothing at all (see `scanJson`). Position is
 * extracted from the message first; the manual scan runs when that fails and
 * for the one message family the engine cannot tell apart.
 */
function parseWithLocation(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const { position, reason } = resolveFailure(text, message);

    const location = locate(text, position);
    return {
      ok: false,
      error: {
        message: reason,
        line: location.line,
        column: location.column,
        snippet: location.snippet,
      },
    };
  }
}

function extractPosition(message: string): number | null {
  const match = message.match(/position (\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * V8 answers "Expected double-quoted property name" both for a key that really
 * is unquoted (`{a:1}`) and for a comma with nothing after it (`{"a":1,}`,
 * `{"a":1,,}`): the message names what the parser wanted next, not what is
 * wrong. Because it carries a position, the translation used to win and a
 * trailing comma was reported as a key-quoting mistake.
 */
const AMBIGUOUS_PROPERTY_NAME = /Expected (double-quoted )?property name/i;

function resolveFailure(
  text: string,
  message: string,
): { position: number; reason: string } {
  const extracted = extractPosition(message);

  // The scan is preferred only where the engine's verdict is ambiguous. Any
  // other message is more precise than the scan can be — the engine separates
  // `{"a": 01}` from a plain unexpected character, the scan does not.
  if (extracted === null || AMBIGUOUS_PROPERTY_NAME.test(message)) {
    const found = scanJson(text);
    if (found) return { position: found.index, reason: found.reason };
  }

  if (extracted !== null) return { position: extracted, reason: translateMessage(message) };
  return { position: text.length, reason: "JSON sintaksisi səhvdir." };
}

function translateMessage(message: string): string {
  if (/Unexpected end of JSON input/i.test(message)) {
    return "JSON yarımçıqdır: mötərizə və ya kvadrat mötərizə bağlanmayıb.";
  }
  if (/Expected double-quoted property name/i.test(message)) {
    return "Açar adı cüt dırnaqla yazılmalıdır: tək dırnaq və ya dırnaqsız açar JSON-da qadağandır.";
  }
  if (/Expected property name/i.test(message)) {
    return "Açar adı gözlənilirdi: burada cüt dırnaqla yazılmış sətir olmalıdır.";
  }
  if (message.includes("Expected ','")) {
    return "Elementlər arasında vergül çatışmır, və ya sondan sonra artıq vergül var.";
  }
  if (/Unexpected number/i.test(message)) {
    return "Rəqəm formatı yanlışdır: məsələn, sıfırla başlayan çoxrəqəmli ədəd JSON-da qadağandır.";
  }
  if (/Unexpected non-whitespace character/i.test(message)) {
    return "Doğru JSON-dan sonra əlavə mətn var: sənəddə yalnız bir dəyər ola bilər.";
  }
  if (/Unexpected token/i.test(message)) {
    return "Gözlənilməz simvol var: sintaksis bu nöqtədə pozulub.";
  }
  return "JSON sintaksisi səhvdir.";
}

/**
 * A minimal JSON grammar walk used only when the engine's own error carries no
 * position (several browsers report "Unexpected token" or "is not valid JSON"
 * with no index at all). It does not need to be a fully spec-correct parser —
 * `JSON.parse` already decided the input is invalid — only to point at a
 * plausible first break with a plain-language reason.
 */
function scanJson(text: string): { index: number; reason: string } | null {
  const n = text.length;
  let i = 0;

  const isWhitespace = (ch: string) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
  const skipWhitespace = () => {
    while (i < n && isWhitespace(text[i])) i++;
  };
  const fail = (index: number, reason: string) => ({ index, reason });

  function parseValue(): { index: number; reason: string } | null {
    skipWhitespace();
    if (i >= n) return fail(n, "Dəyər gözlənilirdi, giriş bitdi.");

    const ch = text[i];
    if (ch === "{") return parseObject();
    if (ch === "[") return parseArray();
    if (ch === '"') return parseString();
    if (ch === "-" || (ch >= "0" && ch <= "9")) return parseNumber();
    if (text.startsWith("true", i)) {
      i += 4;
      return null;
    }
    if (text.startsWith("false", i)) {
      i += 5;
      return null;
    }
    if (text.startsWith("null", i)) {
      i += 4;
      return null;
    }
    return fail(
      i,
      `Gözlənilməz simvol: "${ch}". Dəyər obyekt, massiv, sətir, rəqəm, true/false/null olmalıdır.`,
    );
  }

  function parseObject(): { index: number; reason: string } | null {
    i++; // '{'
    skipWhitespace();
    if (i < n && text[i] === "}") {
      i++;
      return null;
    }

    while (true) {
      skipWhitespace();
      if (i >= n) return fail(n, "Obyekt bağlanmayıb: \"}\" gözlənilirdi.");
      if (text[i] !== '"') {
        // Same sentence as `translateMessage`: both paths can reach a genuinely
        // unquoted key and they must not describe it differently.
        return fail(
          i,
          "Açar adı cüt dırnaqla yazılmalıdır: tək dırnaq və ya dırnaqsız açar JSON-da qadağandır.",
        );
      }

      const keyError = parseString();
      if (keyError) return keyError;

      skipWhitespace();
      if (i >= n || text[i] !== ":") {
        return fail(Math.min(i, n), "Açardan sonra \":\" gözlənilirdi.");
      }
      i++; // ':'

      const valueError = parseValue();
      if (valueError) return valueError;

      skipWhitespace();
      if (i >= n) return fail(n, "Obyekt bağlanmayıb: \"}\" gözlənilirdi.");
      if (text[i] === ",") {
        i++;
        skipWhitespace();
        if (i < n && text[i] === "}") {
          return fail(i, "Sondakı vergül artıqdır: son elementdən sonra vergül qoyulmur.");
        }
        // A second comma is the same mistake one step earlier: the slot between
        // them holds no member. Without this the loop falls through to the
        // key-quoting branch and blames the quotes.
        if (i < n && text[i] === ",") {
          return fail(i, "Artıq vergül var: iki vergülün arasında element yoxdur.");
        }
        continue;
      }
      if (text[i] === "}") {
        i++;
        return null;
      }
      return fail(i, "Elementlər arasında \",\" və ya sonunda \"}\" gözlənilirdi.");
    }
  }

  function parseArray(): { index: number; reason: string } | null {
    i++; // '['
    skipWhitespace();
    if (i < n && text[i] === "]") {
      i++;
      return null;
    }

    while (true) {
      const valueError = parseValue();
      if (valueError) return valueError;

      skipWhitespace();
      if (i >= n) return fail(n, "Massiv bağlanmayıb: \"]\" gözlənilirdi.");
      if (text[i] === ",") {
        i++;
        skipWhitespace();
        if (i < n && text[i] === "]") {
          return fail(i, "Sondakı vergül artıqdır: son elementdən sonra vergül qoyulmur.");
        }
        continue;
      }
      if (text[i] === "]") {
        i++;
        return null;
      }
      return fail(i, "Elementlər arasında \",\" və ya sonunda \"]\" gözlənilirdi.");
    }
  }

  function parseString(): { index: number; reason: string } | null {
    const start = i;
    i++; // opening quote
    while (i < n) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return null;
      }
      if (ch === "\\") {
        i++;
        if (i >= n) return fail(n, "Sətir bağlanmayıb.");
        const escaped = text[i];
        if (escaped === "u") {
          const hex = text.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            return fail(i - 1, "Yanlış \\u qaçış ardıcıllığı: dörd hex rəqəm lazımdır.");
          }
          i += 5;
        } else if ('"\\/bfnrt'.includes(escaped)) {
          i++;
        } else {
          return fail(i - 1, `Yanlış qaçış ardıcıllığı: "\\${escaped}".`);
        }
        continue;
      }
      if (ch.charCodeAt(0) < 0x20) {
        return fail(i, "Sətir daxilində idarə simvolu icazəsizdir.");
      }
      i++;
    }
    return fail(start, "Sətir bağlanmayıb: \" işarəsi çatışmır.");
  }

  function parseNumber(): { index: number; reason: string } | null {
    const start = i;
    if (text[i] === "-") i++;

    if (text[i] === "0") {
      i++;
    } else if (text[i] >= "1" && text[i] <= "9") {
      i++;
      while (i < n && text[i] >= "0" && text[i] <= "9") i++;
    } else {
      return fail(start, "Rəqəm gözlənilirdi.");
    }

    if (text[i] === ".") {
      i++;
      if (!(text[i] >= "0" && text[i] <= "9")) return fail(i, "Nöqtədən sonra rəqəm lazımdır.");
      while (i < n && text[i] >= "0" && text[i] <= "9") i++;
    }

    if (text[i] === "e" || text[i] === "E") {
      i++;
      if (text[i] === "+" || text[i] === "-") i++;
      if (!(text[i] >= "0" && text[i] <= "9")) return fail(i, "Üstlü ədəddə rəqəm lazımdır.");
      while (i < n && text[i] >= "0" && text[i] <= "9") i++;
    }

    return null;
  }

  skipWhitespace();
  const valueError = parseValue();
  if (valueError) return valueError;

  skipWhitespace();
  if (i < n) return fail(i, "Doğru JSON-dan sonra əlavə mətn var.");

  return null;
}
