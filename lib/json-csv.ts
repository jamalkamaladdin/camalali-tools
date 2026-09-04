/**
 * JSON array ⇄ CSV, written by hand rather than through a library so the two
 * lossy edges — a nested object flattened to a dotted column name, and a
 * nested array kept as a single JSON-string cell rather than exploded into
 * rows — are decisions this file states instead of ones a dependency made for
 * it years ago. What is worth checking: a known JSON/CSV pair converts both
 * ways, flattening and its inverse agree on a three-level object, a field
 * that contains the delimiter or a quote survives RFC 4180 quoting, a column
 * count that does not match the header errors instead of throwing, and type
 * inference is a switch the visitor controls rather than a guess this file
 * always makes.
 */
import { formatJson } from "./json";

export type CsvDelimiter = "," | ";" | "\t";

export type JsonToCsvOptions = {
  delimiter: CsvDelimiter;
};

export type JsonToCsvResult =
  | { ok: true; output: string; columns: string[]; rowCount: number }
  | { ok: false; error: string; line?: number; column?: number };

export type CsvToJsonOptions = {
  delimiter: CsvDelimiter;
  /** Off by default: an empty cell and a numeric cell both stay a string unless the visitor asks otherwise. */
  inferTypes: boolean;
};

export type CsvToJsonResult =
  | { ok: true; output: string; value: unknown[]; columns: string[]; rowCount: number }
  | { ok: false; error: string; line?: number };

/**
 * Recurses into a plain object only — an array is left as-is so the caller
 * can decide (JSON string for a cell, or a leaf value) without this function
 * guessing which columns the visitor wants exploded.
 */
function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flattenObject(value as Record<string, unknown>, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatCsvField(text: string, delimiter: CsvDelimiter): string {
  const needsQuoting = text.includes(delimiter) || text.includes('"') || text.includes("\n") || text.includes("\r");
  if (!needsQuoting) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function jsonToCsv(jsonText: string, options: JsonToCsvOptions): JsonToCsvResult {
  const parsed = formatJson(jsonText, { mode: "pretty", indent: "2", sortKeys: false });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error.message, line: parsed.error.line, column: parsed.error.column };
  }

  const value = parsed.value;
  if (!Array.isArray(value)) {
    return { ok: false, error: "CSV-yə çevirmək üçün JSON-un kökü massiv olmalıdır — məsələn [{...}, {...}]." };
  }
  if (value.length === 0) {
    return { ok: true, output: "", columns: [], rowCount: 0 };
  }

  for (const [index, item] of value.entries()) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return {
        ok: false,
        error: `Massivin ${index + 1}-ci elementi obyekt deyil — CSV sütunları yalnız obyekt sahələrindən qurula bilir.`,
      };
    }
  }

  const flatRows = (value as Record<string, unknown>[]).map((item) => flattenObject(item));

  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of flatRows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  const lines = [columns.map((c) => formatCsvField(c, options.delimiter)).join(options.delimiter)];
  for (const row of flatRows) {
    lines.push(
      columns.map((c) => formatCsvField(cellToText(row[c]), options.delimiter)).join(options.delimiter),
    );
  }

  return { ok: true, output: lines.join("\r\n"), columns, rowCount: flatRows.length };
}

type CsvRows = { rows: string[][] } | { error: string; line: number };

/**
 * A hand-written RFC 4180 scanner rather than a split on `\n`: a quoted field
 * is allowed to carry the delimiter, a literal quote (doubled) and a raw
 * newline, none of which a line-by-line split can tell apart from a row
 * boundary.
 */
function parseCsvRows(text: string, delimiter: CsvDelimiter): CsvRows {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (ch === "\n") line++;
      field += ch;
      i++;
      continue;
    }

    if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      line++;
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  if (inQuotes) {
    return { error: `${line}-ci sətirdə dırnaq bağlanmayıb.`, line };
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return { rows };
}

function inferCsvValue(raw: string): unknown {
  if (raw === "") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+$/.test(raw) && Number.isSafeInteger(Number(raw))) return Number(raw);
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);
  return raw;
}

/** A `__proto__` header must write an ordinary property, not reach the object's prototype. */
function setPath(target: Record<string, unknown>, path: string[], value: unknown): void {
  let node = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const existing = node[key];
    if (existing === null || typeof existing !== "object" || Array.isArray(existing)) {
      node[key] = Object.create(null) as Record<string, unknown>;
    }
    node = node[key] as Record<string, unknown>;
  }
  node[path[path.length - 1]] = value;
}

export function csvToJson(csvText: string, options: CsvToJsonOptions): CsvToJsonResult {
  if (csvText.trim() === "") return { ok: false, error: "CSV mətni boşdur." };

  const parsedRows = parseCsvRows(csvText, options.delimiter);
  if ("error" in parsedRows) return { ok: false, error: parsedRows.error, line: parsedRows.line };

  const [header, ...dataRows] = parsedRows.rows;
  if (!header || header.length === 0 || (header.length === 1 && header[0] === "")) {
    return { ok: false, error: "Başlıq sətri tapılmadı." };
  }

  const seenHeaders = new Set<string>();
  for (const name of header) {
    if (seenHeaders.has(name)) return { ok: false, error: `Təkrarlanan sütun adı: «${name}».` };
    seenHeaders.add(name);
  }

  const objects: Record<string, unknown>[] = [];
  for (const [rowIndex, row] of dataRows.entries()) {
    if (row.length !== header.length) {
      return {
        ok: false,
        error: `${rowIndex + 2}-ci sətirdə ${row.length} sütun var, başlıqda ${header.length} — say uyğun gəlmir.`,
        line: rowIndex + 2,
      };
    }

    const obj: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (let i = 0; i < header.length; i++) {
      setPath(obj, header[i].split("."), options.inferTypes ? inferCsvValue(row[i]) : row[i]);
    }
    objects.push(obj);
  }

  return {
    ok: true,
    output: JSON.stringify(objects, null, 2),
    value: objects,
    columns: header,
    rowCount: objects.length,
  };
}
