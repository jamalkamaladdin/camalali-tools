/**
 * A table held once, in memory, as headers + optional per-column alignment +
 * string rows, and read from or written to four surface formats: Markdown,
 * HTML, CSV and a JSON array of objects. Every cell is text in every format
 * this file reads and writes — there is deliberately no number/boolean
 * inference here (unlike `json-csv.ts`), because a Markdown or HTML table
 * cell has no type system to infer from in the first place, and a converter
 * that types CSV cells but not HTML ones would behave differently depending
 * on which pair of formats a visitor picked.
 *
 * What is worth checking: a known pair converts correctly for each of the
 * four formats, a JSON → Markdown → JSON round trip preserves headers and
 * rows, format auto-detection picks the right one for a clean sample of
 * each, a pipe character inside a Markdown cell survives escaping round
 * trip, alignment markers (`:---`, `:---:`, `---:`) are read and reproduced,
 * and a malformed input in each format (missing separator row, no `<table>`,
 * a ragged CSV row, a non-array JSON root) returns `{ ok: false }` rather
 * than throwing.
 */
import { formatJson } from "./json";

export type TableFormat = "markdown" | "html" | "csv" | "json";
export type Align = "left" | "center" | "right" | null;
export type Table = { headers: string[]; aligns: Align[]; rows: string[][] };

export type CsvDelimiter = "," | ";" | "\t";

export type TableParseResult =
  | { ok: true; table: Table }
  | { ok: false; error: string; line?: number };

/* ---------- format detection ---------- */

const MD_SEPARATOR_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

export function detectFormat(text: string): TableFormat {
  const trimmed = text.trim();
  if (trimmed === "") return "markdown";

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      /* not JSON after all — fall through to the other formats */
    }
  }

  if (/<table[\s>]/i.test(trimmed)) return "html";

  const lines = trimmed.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].includes("|") && lines[i + 1].includes("-") && MD_SEPARATOR_ROW.test(lines[i + 1])) {
      return "markdown";
    }
  }

  return "csv";
}

/* ---------- Markdown ---------- */

function splitMarkdownRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) {
    const backslashes = trimmed.length - trimmed.replace(/\\+$/, "").length;
    if (backslashes % 2 === 0) trimmed = trimmed.slice(0, -1);
  }

  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "\\" && trimmed[i + 1] === "|") {
      current += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function isSeparatorCell(cell: string): boolean {
  return /^:?-+:?$/.test(cell.trim());
}

function cellAlign(cell: string): Align {
  const trimmed = cell.trim();
  const left = trimmed.startsWith(":");
  const right = trimmed.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

export function parseMarkdownTable(text: string): TableParseResult {
  const lines = text.split("\n");

  let headerIndex = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes("|")) continue;
    const sepCells = splitMarkdownRow(lines[i + 1]);
    if (sepCells.length > 0 && lines[i + 1].includes("-") && sepCells.every(isSeparatorCell)) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) {
    return { ok: false, error: "Cədvəl başlığı və ayırıcı sətri (---) tapılmadı." };
  }

  const headers = splitMarkdownRow(lines[headerIndex]);
  const aligns = splitMarkdownRow(lines[headerIndex + 1]).map(cellAlign);
  if (aligns.length !== headers.length) {
    return {
      ok: false,
      error: `Ayırıcı sətirdə ${aligns.length} sütun var, başlıqda ${headers.length} — say uyğun gəlmir.`,
      line: headerIndex + 2,
    };
  }

  const rows: string[][] = [];
  for (let i = headerIndex + 2; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") break;
    if (!line.includes("|")) break;
    const cells = splitMarkdownRow(line);
    if (cells.length !== headers.length) {
      return {
        ok: false,
        error: `${i + 1}-ci sətirdə ${cells.length} sütun var, başlıqda ${headers.length} — say uyğun gəlmir.`,
        line: i + 1,
      };
    }
    rows.push(cells);
  }

  return { ok: true, table: { headers, aligns, rows } };
}

function escapeMarkdownCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function separatorCellFor(align: Align, width: number): string {
  const bodyWidth = Math.max(width - (align === "center" ? 2 : align ? 1 : 0), 1);
  const dashes = "-".repeat(bodyWidth);
  if (align === "center") return `:${dashes}:`;
  if (align === "right") return `${dashes}:`;
  if (align === "left") return `:${dashes}`;
  return dashes;
}

function padCell(text: string, width: number, align: Align): string {
  const gap = width - text.length;
  if (gap <= 0) return text;
  if (align === "right") return " ".repeat(gap) + text;
  if (align === "center") {
    const left = Math.floor(gap / 2);
    return " ".repeat(left) + text + " ".repeat(gap - left);
  }
  return text + " ".repeat(gap);
}

/** Columns are padded with spaces to a common width, and alignment colons are reproduced from `table.aligns`. */
export function stringifyMarkdownTable(table: Table): string {
  if (table.headers.length === 0) return "";

  const headers = table.headers.map(escapeMarkdownCell);
  const rows = table.rows.map((row) => row.map((cell) => escapeMarkdownCell(cell ?? "")));

  const widths = headers.map((header, col) => {
    let max = Math.max(header.length, 3);
    for (const row of rows) max = Math.max(max, (row[col] ?? "").length);
    return max;
  });

  const headerLine = `| ${headers.map((h, i) => padCell(h, widths[i], table.aligns[i] ?? null)).join(" | ")} |`;
  const sepLine = `| ${widths.map((w, i) => separatorCellFor(table.aligns[i] ?? null, w)).join(" | ")} |`;
  const rowLines = rows.map(
    (row) => `| ${row.map((cell, i) => padCell(cell, widths[i], table.aligns[i] ?? null)).join(" | ")} |`,
  );

  return [headerLine, sepLine, ...rowLines].join("\n");
}

/* ---------- HTML ---------- */

const HTML_NAMED_ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return HTML_NAMED_ENTITIES[entity] ?? match;
  });
}

function cellText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

export function parseHtmlTable(text: string): TableParseResult {
  const tableMatch = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(text);
  if (!tableMatch) return { ok: false, error: "Mətndə <table> teqi tapılmadı." };

  const rowMatches = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rowMatches.length === 0) return { ok: false, error: "Cədvəldə <tr> sətri tapılmadı." };

  const parsedRows = rowMatches.map((row) =>
    [...row[1].matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi)].map((cell) => ({
      isHeader: cell[1].toLowerCase() === "th",
      text: cellText(cell[2]),
    })),
  );

  if (parsedRows[0].length === 0 || !parsedRows[0].some((cell) => cell.isHeader)) {
    return { ok: false, error: "Başlıq sətri tapılmadı — ilk <tr> ən azı bir <th> xanası daşımalıdır." };
  }

  const headers = parsedRows[0].map((cell) => cell.text);
  const rows: string[][] = [];
  for (let r = 1; r < parsedRows.length; r++) {
    const cells = parsedRows[r].map((cell) => cell.text);
    if (cells.length !== headers.length) {
      return {
        ok: false,
        error: `${r + 1}-ci <tr> sətrində ${cells.length} xana var, başlıqda ${headers.length} — say uyğun gəlmir.`,
      };
    }
    rows.push(cells);
  }

  return { ok: true, table: { headers, aligns: headers.map(() => null), rows } };
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function stringifyHtmlTable(table: Table): string {
  const th = table.headers.map((h) => `      <th>${escapeHtmlText(h)}</th>`).join("\n");
  const bodyRows = table.rows
    .map(
      (row) =>
        `    <tr>\n${row.map((cell) => `      <td>${escapeHtmlText(cell ?? "")}</td>`).join("\n")}\n    </tr>`,
    )
    .join("\n");
  const body = bodyRows === "" ? "" : `\n${bodyRows}\n  `;
  return `<table>\n  <thead>\n    <tr>\n${th}\n    </tr>\n  </thead>\n  <tbody>${body}</tbody>\n</table>`;
}

/* ---------- CSV ---------- */

type CsvRows = { rows: string[][] } | { error: string; line: number };

/** The same RFC 4180 scanner `json-csv.ts` uses — kept as its own copy here because the two files must stay independently readable. */
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

  if (inQuotes) return { error: `${line}-ci sətirdə dırnaq bağlanmayıb.`, line };
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { rows };
}

export function parseCsvTable(text: string, delimiter: CsvDelimiter): TableParseResult {
  if (text.trim() === "") return { ok: false, error: "CSV mətni boşdur." };

  const parsed = parseCsvRows(text, delimiter);
  if ("error" in parsed) return { ok: false, error: parsed.error, line: parsed.line };

  const [header, ...dataRows] = parsed.rows;
  if (!header || header.length === 0 || (header.length === 1 && header[0] === "")) {
    return { ok: false, error: "Başlıq sətri tapılmadı." };
  }

  for (const [index, row] of dataRows.entries()) {
    if (row.length !== header.length) {
      return {
        ok: false,
        error: `${index + 2}-ci sətirdə ${row.length} sütun var, başlıqda ${header.length} — say uyğun gəlmir.`,
        line: index + 2,
      };
    }
  }

  return { ok: true, table: { headers: header, aligns: header.map(() => null), rows: dataRows } };
}

function formatCsvField(text: string, delimiter: CsvDelimiter): string {
  const needsQuoting = text.includes(delimiter) || text.includes('"') || text.includes("\n") || text.includes("\r");
  return needsQuoting ? `"${text.replace(/"/g, '""')}"` : text;
}

export function stringifyCsvTable(table: Table, delimiter: CsvDelimiter): string {
  const lines = [table.headers.map((h) => formatCsvField(h, delimiter)).join(delimiter)];
  for (const row of table.rows) {
    lines.push(row.map((cell) => formatCsvField(cell ?? "", delimiter)).join(delimiter));
  }
  return lines.join("\r\n");
}

/* ---------- JSON ---------- */

function jsonCellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function parseJsonTable(text: string): TableParseResult {
  const parsed = formatJson(text, { mode: "pretty", indent: "2", sortKeys: false });
  if (!parsed.ok) return { ok: false, error: parsed.error.message, line: parsed.error.line };

  const value = parsed.value;
  if (!Array.isArray(value)) {
    return { ok: false, error: "Cədvələ çevirmək üçün JSON-un kökü massiv olmalıdır — məsələn [{...}, {...}]." };
  }
  if (value.length === 0) return { ok: true, table: { headers: [], aligns: [], rows: [] } };

  for (const [index, item] of value.entries()) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `Massivin ${index + 1}-ci elementi obyekt deyil.` };
    }
  }

  const headers: string[] = [];
  const seen = new Set<string>();
  for (const item of value as Record<string, unknown>[]) {
    for (const key of Object.keys(item)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }

  const rows = (value as Record<string, unknown>[]).map((item) =>
    headers.map((key) => (key in item ? jsonCellToText(item[key]) : "")),
  );

  return { ok: true, table: { headers, aligns: headers.map(() => null), rows } };
}

export function stringifyJsonTable(table: Table): string {
  const objects = table.rows.map((row) => {
    const obj: Record<string, string> = {};
    table.headers.forEach((header, index) => {
      obj[header] = row[index] ?? "";
    });
    return obj;
  });
  return JSON.stringify(objects, null, 2);
}

/* ---------- dispatch ---------- */

export function parseTable(text: string, format: TableFormat, delimiter: CsvDelimiter): TableParseResult {
  switch (format) {
    case "markdown":
      return parseMarkdownTable(text);
    case "html":
      return parseHtmlTable(text);
    case "csv":
      return parseCsvTable(text, delimiter);
    case "json":
      return parseJsonTable(text);
  }
}

export function stringifyTable(table: Table, format: TableFormat, delimiter: CsvDelimiter): string {
  switch (format) {
    case "markdown":
      return stringifyMarkdownTable(table);
    case "html":
      return stringifyHtmlTable(table);
    case "csv":
      return stringifyCsvTable(table, delimiter);
    case "json":
      return stringifyJsonTable(table);
  }
}
