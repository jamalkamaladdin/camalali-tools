/**
 * `.env` files, read the way `export`, a shell and a quoting convention
 * actually write them — not the way `KEY=VALUE` looks if you only ever
 * paste one line of it. Three jobs live here: turning a file into JSON and
 * back, building a `.env.example` that keeps the shape of a file but throws
 * away every secret in it, and comparing two files for the keys one has that
 * the other does not.
 *
 * Deliberately line-oriented rather than grammar-oriented: a `.env` file is
 * not a nested format, so every line is independently one of four things —
 * blank, a full-line comment, a `KEY=VALUE` entry, or a line this parser
 * declines to guess at — and nothing here needs to look past the line it is
 * on to make that call. That is also why a multi-line quoted value is
 * reported rather than assembled: guessing where such a value ends would be
 * exactly the kind of silent, plausible-looking wrong answer this whole
 * project refuses to produce.
 */

export type EnvLine =
  | { kind: "blank"; lineNumber: number }
  | { kind: "comment"; text: string; lineNumber: number }
  | { kind: "entry"; key: string; value: string; comment: string | null; lineNumber: number }
  | { kind: "unsupported"; raw: string; lineNumber: number; reason: string };

const EXPORT_PREFIX = /^export\s+/;

/**
 * Finds where a double-quoted value ends, honouring `\"` as an escaped quote
 * rather than the end of the string. Returns the index of the closing quote,
 * or `-1` if the value runs off the end of the line unterminated.
 */
function findClosingDoubleQuote(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === '"') return i;
    i++;
  }
  return -1;
}

function findClosingSingleQuote(text: string, start: number): number {
  // Single-quoted values are literal, shell-style: nothing inside them is an
  // escape, so the very next quote character always closes them.
  return text.indexOf("'", start);
}

function unescapeDoubleQuoted(text: string): string {
  return text.replace(/\\(["\\])/g, "$1");
}

/**
 * Splits an unquoted value from a trailing `# comment`. `.env` convention
 * (matched by `dotenv` and the shells that source these files) is that the
 * comment must be preceded by whitespace, so a value such as a URL
 * fragment (`https://x/#y`) is not cut in half by a `#` that is not a
 * comment.
 */
function splitUnquotedComment(text: string): { value: string; comment: string | null } {
  const match = /(?:^|\s)#(.*)$/.exec(text);
  if (!match || match.index === undefined) return { value: text.trim(), comment: null };
  return { value: text.slice(0, match.index).trim(), comment: match[1].trim() };
}

/** Parses one non-blank, non-comment line into a key/value entry, or reports why it could not be. */
function parseEntryLine(line: string, lineNumber: number): EnvLine {
  const withoutExport = line.replace(EXPORT_PREFIX, "");
  const equalsIndex = withoutExport.indexOf("=");
  if (equalsIndex === -1) {
    return { kind: "unsupported", raw: line, lineNumber, reason: '"=" işarəsi yoxdur' };
  }

  const key = withoutExport.slice(0, equalsIndex).trim();
  const rest = withoutExport.slice(equalsIndex + 1);
  const trimmedRest = rest.trim();
  const leadingChar = trimmedRest[0];

  if (leadingChar === '"') {
    const closing = findClosingDoubleQuote(trimmedRest, 1);
    if (closing === -1) {
      return {
        kind: "unsupported",
        raw: line,
        lineNumber,
        reason: "dırnaq bağlanmayıb: çoxsətirli dəyər dəstəklənmir",
      };
    }
    const value = unescapeDoubleQuoted(trimmedRest.slice(1, closing));
    const after = trimmedRest.slice(closing + 1).trim();
    const comment = after.startsWith("#") ? after.slice(1).trim() : null;
    return { kind: "entry", key, value, comment, lineNumber };
  }

  if (leadingChar === "'") {
    const closing = findClosingSingleQuote(trimmedRest, 1);
    if (closing === -1) {
      return {
        kind: "unsupported",
        raw: line,
        lineNumber,
        reason: "dırnaq bağlanmayıb: çoxsətirli dəyər dəstəklənmir",
      };
    }
    const value = trimmedRest.slice(1, closing);
    const after = trimmedRest.slice(closing + 1).trim();
    const comment = after.startsWith("#") ? after.slice(1).trim() : null;
    return { kind: "entry", key, value, comment, lineNumber };
  }

  const { value, comment } = splitUnquotedComment(trimmedRest);
  return { kind: "entry", key, value, comment, lineNumber };
}

export function parseEnv(text: string): EnvLine[] {
  const lines = text.split(/\r\n|\n/);
  return lines.map((raw, index) => {
    const lineNumber = index + 1;
    const trimmed = raw.trim();
    if (trimmed === "") return { kind: "blank", lineNumber };
    if (trimmed.startsWith("#")) return { kind: "comment", text: trimmed.slice(1).trim(), lineNumber };
    return parseEntryLine(raw, lineNumber);
  });
}

export type EnvEntry = { key: string; value: string };

/**
 * The last occurrence of a repeated key wins, matching how a shell sourcing
 * the same file would behave — later assignments overwrite earlier ones.
 */
export function entriesOf(lines: EnvLine[]): { entries: EnvEntry[]; duplicateKeys: string[] } {
  const order: string[] = [];
  const byKey = new Map<string, string>();
  const seenCount = new Map<string, number>();

  for (const line of lines) {
    if (line.kind !== "entry") continue;
    if (!byKey.has(line.key)) order.push(line.key);
    byKey.set(line.key, line.value);
    seenCount.set(line.key, (seenCount.get(line.key) ?? 0) + 1);
  }

  const duplicateKeys = order.filter((key) => (seenCount.get(key) ?? 0) > 1);
  return { entries: order.map((key) => ({ key, value: byKey.get(key) ?? "" })), duplicateKeys };
}

export type EnvToJsonResult = {
  json: string;
  entries: EnvEntry[];
  duplicateKeys: string[];
  unsupportedLines: { lineNumber: number; reason: string }[];
};

/** Never fails: every line of a `.env` file is scannable on its own, so there is nothing here `JSON.parse` would throw on. */
export function envToJson(text: string): EnvToJsonResult {
  const lines = parseEnv(text);
  const { entries, duplicateKeys } = entriesOf(lines);
  const record: Record<string, string> = {};
  for (const entry of entries) record[entry.key] = entry.value;

  return {
    json: JSON.stringify(record, null, 2),
    entries,
    duplicateKeys,
    unsupportedLines: lines
      .filter((line): line is Extract<EnvLine, { kind: "unsupported" }> => line.kind === "unsupported")
      .map((line) => ({ lineNumber: line.lineNumber, reason: line.reason })),
  };
}

/** A value needs quoting the moment an unquoted line would misparse it — whitespace, `#`, `=`, a quote, or nothing at all. */
function needsQuoting(value: string): boolean {
  return (
    value === "" ||
    /\s/.test(value) ||
    value.includes("#") ||
    value.includes("=") ||
    value.includes('"') ||
    value.includes("'")
  );
}

function quoteEnvValue(value: string): string {
  if (!needsQuoting(value)) return value;
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export type JsonToEnvResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * The one direction that can genuinely fail: the pasted text has to parse as
 * JSON, and it has to be a flat object — a nested object or an array has no
 * single-line `.env` representation this tool is willing to invent one for.
 */
export function jsonToEnv(jsonText: string): JsonToEnvResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `JSON sintaksisi səhvdir: ${message}` };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "JSON kökdə açar-dəyər obyekti olmalıdır: massiv və ya sadə dəyər deyil." };
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  const lines: string[] = [];
  for (const [key, value] of entries) {
    if (value !== null && typeof value === "object") {
      return {
        ok: false,
        error: `"${key}" açarının dəyəri iç-içə obyekt və ya massivdir: .env yalnız düz (sətir, ədəd, boolean) dəyərləri dəstəkləyir.`,
      };
    }
    const stringValue = value === null ? "" : String(value);
    lines.push(`${key}=${quoteEnvValue(stringValue)}`);
  }

  return { ok: true, text: lines.join("\n") };
}

export type ExampleResult = {
  text: string;
  entryCount: number;
  unsupportedLines: { lineNumber: number; reason: string }[];
};

/**
 * Keeps every line's shape — comments and blank lines untouched, key names
 * untouched — and empties only the value half of an entry line, which is
 * the one piece of a `.env` file that should never leave a repository. A
 * line this parser could not read as an entry is copied through verbatim
 * rather than dropped, and is also named in `unsupportedLines` so the page
 * can warn that whatever value it held was not cleared.
 */
export function buildEnvExample(text: string): ExampleResult {
  const lines = parseEnv(text);
  const output = lines.map((line) => {
    if (line.kind === "blank") return "";
    if (line.kind === "comment") return `#${line.text === "" ? "" : ` ${line.text}`}`;
    if (line.kind === "unsupported") return line.raw;
    return line.comment ? `${line.key}= # ${line.comment}` : `${line.key}=`;
  });

  return {
    text: output.join("\n"),
    entryCount: lines.filter((line) => line.kind === "entry").length,
    unsupportedLines: lines
      .filter((line): line is Extract<EnvLine, { kind: "unsupported" }> => line.kind === "unsupported")
      .map((line) => ({ lineNumber: line.lineNumber, reason: line.reason })),
  };
}

export type EnvDiff = {
  onlyInA: string[];
  onlyInB: string[];
  sameValue: string[];
  differentValue: { key: string; valueA: string; valueB: string }[];
};

export function diffEnv(textA: string, textB: string): EnvDiff {
  const a = entriesOf(parseEnv(textA)).entries;
  const b = entriesOf(parseEnv(textB)).entries;
  const mapA = new Map(a.map((entry) => [entry.key, entry.value]));
  const mapB = new Map(b.map((entry) => [entry.key, entry.value]));

  const onlyInA = a.filter((entry) => !mapB.has(entry.key)).map((entry) => entry.key);
  const onlyInB = b.filter((entry) => !mapA.has(entry.key)).map((entry) => entry.key);
  const sameValue: string[] = [];
  const differentValue: { key: string; valueA: string; valueB: string }[] = [];

  for (const entry of a) {
    const valueB = mapB.get(entry.key);
    if (valueB === undefined) continue;
    if (valueB === entry.value) sameValue.push(entry.key);
    else differentValue.push({ key: entry.key, valueA: entry.value, valueB });
  }

  return { onlyInA, onlyInB, sameValue, differentValue };
}
