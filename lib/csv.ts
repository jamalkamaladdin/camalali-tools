/**
 * A CSV file, read without a schema: what separates the fields, whether the
 * first row names them, what type each column actually holds and which rows
 * do not have the column count every other row agrees on.
 *
 * Nothing here trusts the file extension or a `Content-Type` — a `.csv` a
 * visitor pastes from a spreadsheet export is as likely to be
 * semicolon-separated (most European locales) or tab-separated (a copy out
 * of a table) as comma-separated, and the file itself is the only evidence
 * this tool gets. Every guess below — the delimiter, the header, a column's
 * type — is therefore made from the data, never assumed from the format
 * name, and is cheap to get wrong: a visitor who disagrees with a guess
 * still sees the parsed table and can tell why the guess landed where it did.
 */

export const CSV_DELIMITERS = [",", ";", "\t", "|"] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export const CSV_DELIMITER_LABELS: Record<CsvDelimiter, string> = {
  ",": "vergül",
  ";": "nöqtəli vergül",
  "\t": "tab",
  "|": "boru (|)",
};

export type ColumnType = "integer" | "decimal" | "date" | "boolean" | "text";

export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  integer: "tam ədəd",
  decimal: "onluq",
  date: "tarix",
  boolean: "boolean",
  text: "mətn",
};

/** How many data rows the table preview shows, regardless of how many the file has. */
export const PREVIEW_ROW_LIMIT = 20;

/*
 * A hand-rolled RFC 4180 tokenizer rather than `text.split("\n").map(l =>
 * l.split(delimiter))`: the whole reason a visitor reaches for this tool is
 * a field that itself contains the delimiter or a newline, quoted the way
 * RFC 4180 §2 requires (`"a, b"`) with `""` as the escaped quote — and a
 * naive split breaks exactly there. A quote only opens a field when it is
 * the field's first character; anywhere else it is taken literally, which
 * is lax rather than spec-strict on purpose — a visitor's pasted export is
 * more often slightly malformed than it is a hostile input this tool has to
 * reject.
 */
export function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
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
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // The loop only closes a row on a newline, so whatever is left in
  // `field`/`row` after the last character is the file's final row — unless
  // the text ended on a trailing newline, in which case that row was
  // already pushed and there is nothing left to add.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Splits one raw line on a delimiter without honouring quotes — used only by
 * delimiter detection, which needs a fast per-line field count across the
 * whole file, not a correct parse of it. Sniffing on the unquoted count is
 * the same trade Python's `csv.Sniffer` and every other delimiter guesser
 * makes: a quoted field that happens to embed the delimiter under
 * consideration will inflate that count on the odd line, but it inflates it
 * for every candidate delimiter's *wrong* count too, so it rarely changes
 * which candidate wins.
 */
function countFields(line: string, delimiter: string): number {
  return line.split(delimiter).length;
}

/**
 * The delimiter whose per-line field count is most consistent across the
 * file — the same measure a spreadsheet's own importer uses. A delimiter
 * that is not present at all scores as "every line has 1 field", which loses
 * to any delimiter that actually splits the file into more than one column,
 * so a single-column file falls back to the first candidate, comma, rather
 * than to a delimiter picked at random.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return ",";

  let best: CsvDelimiter = ",";
  let bestScore = -1;

  for (const delimiter of CSV_DELIMITERS) {
    const counts = lines.map((line) => countFields(line, delimiter));
    const frequency = new Map<number, number>();
    for (const count of counts) frequency.set(count, (frequency.get(count) ?? 0) + 1);

    let modeCount = 0;
    let modeFields = 1;
    for (const [fields, freq] of frequency) {
      if (freq > modeCount || (freq === modeCount && fields > modeFields)) {
        modeCount = freq;
        modeFields = fields;
      }
    }

    // A delimiter that never splits anything (mode is 1 field per line) is
    // never preferred over one that does, even if it is "consistently" 1.
    const score = modeFields > 1 ? modeCount / lines.length : 0;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

const INTEGER_PATTERN = /^[+-]?\d+$/;
const DECIMAL_PATTERN = /^[+-]?\d+\.\d+$/;
const BOOLEAN_VALUES = new Set(["true", "false"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

type CellType = ColumnType | "blank";

function classifyCell(raw: string): CellType {
  const value = raw.trim();
  if (value === "") return "blank";
  if (BOOLEAN_VALUES.has(value.toLowerCase())) return "boolean";
  if (INTEGER_PATTERN.test(value)) return "integer";
  if (DECIMAL_PATTERN.test(value)) return "decimal";
  if (DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value))) return "date";
  return "text";
}

/**
 * One column's type from the non-blank cells under it. A column is only
 * ever `integer`, `decimal`, `date`, `boolean` or `text` — never "mixed" —
 * because a visitor deciding "can I import this column as a number" needs
 * one of those five answers, not a sixth category to interpret. The one
 * blend this still resolves on its own is integer cells sitting beside
 * decimal ones: `1`, `2`, `3.5` is a decimal column with some whole numbers
 * in it, which is normal, not mixed. Any other combination of types falls
 * back to `text`, which is always a safe (if unhelpful) answer — treating
 * every value as text throws away no information.
 */
function columnTypeOf(cellTypes: CellType[]): ColumnType {
  const present = new Set(cellTypes.filter((type) => type !== "blank"));
  if (present.size === 0) return "text";
  if (present.size === 1) return [...present][0] as ColumnType;
  if (present.size === 2 && present.has("integer") && present.has("decimal")) return "decimal";
  return "text";
}

/**
 * Whether the first row reads as column names rather than data: for each
 * column where the rows below it agree on a non-text type, the header cell
 * disagreeing (being text) is the signal a spreadsheet header always gives —
 * `"prices"` over a column of `19.99`, `24.50`. A file with no typed column
 * at all (every column is text top to bottom) has no such signal and is
 * conservatively read as headerless, since guessing "yes" from nothing but
 * silence would be the tool inventing a fact it does not have.
 */
export function detectHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false;

  const [first, ...rest] = rows;
  let comparableColumns = 0;
  let headerLikeColumns = 0;

  for (let column = 0; column < first.length; column++) {
    const bodyTypes = rest
      .map((row) => classifyCell(row[column] ?? ""))
      .filter((type): type is ColumnType => type !== "blank");
    if (bodyTypes.length === 0) continue;

    const bodyType = columnTypeOf(bodyTypes);
    if (bodyType === "text") continue;

    comparableColumns++;
    if (classifyCell(first[column] ?? "") === "text") headerLikeColumns++;
  }

  if (comparableColumns === 0) return false;
  return headerLikeColumns / comparableColumns >= 0.5;
}

export type CsvColumnStats = {
  name: string;
  type: ColumnType;
  blankCount: number;
  filledCount: number;
};

export type CsvMalformedRow = {
  /** 1-based position in the row sequence — row 1 is the header when one is detected. */
  row: number;
  expectedColumns: number;
  actualColumns: number;
};

export type CsvInspection = {
  delimiter: CsvDelimiter;
  hasHeader: boolean;
  headers: string[];
  columns: CsvColumnStats[];
  dataRows: string[][];
  preview: string[][];
  rowCount: number;
  malformedRows: CsvMalformedRow[];
};

export type CsvResult = { ok: true; data: CsvInspection } | { ok: false; error: string };

export function inspectCsv(text: string, delimiterOverride?: CsvDelimiter): CsvResult {
  if (text.trim() === "") {
    return { ok: false, error: "CSV mətni boşdur: cədvəli yapışdır." };
  }

  const delimiter = delimiterOverride ?? detectDelimiter(text);
  const allRows = parseCsvRows(text, delimiter).filter(
    (row) => !(row.length === 1 && row[0] === ""),
  );

  if (allRows.length === 0) {
    return { ok: false, error: "Heç bir sətir tapılmadı." };
  }

  const hasHeader = detectHeader(allRows);
  const dataRows = hasHeader ? allRows.slice(1) : allRows;
  const columnCount = allRows[0].length;
  const headers = hasHeader
    ? allRows[0].map((name, index) => (name.trim() === "" ? `Sütun ${index + 1}` : name.trim()))
    : Array.from({ length: columnCount }, (_, index) => `Sütun ${index + 1}`);

  // The expected column count is the mode across every row (header
  // included), not just the header's own length — a headerless file has no
  // header row to anchor on, and a header whose own count is itself the
  // outlier (a trailing extra comma, say) should not make every honest data
  // row look malformed.
  const countFrequency = new Map<number, number>();
  for (const row of allRows) countFrequency.set(row.length, (countFrequency.get(row.length) ?? 0) + 1);
  let expectedColumns = columnCount;
  let expectedFrequency = 0;
  for (const [count, freq] of countFrequency) {
    if (freq > expectedFrequency) {
      expectedFrequency = freq;
      expectedColumns = count;
    }
  }

  const malformedRows: CsvMalformedRow[] = [];
  allRows.forEach((row, index) => {
    if (row.length !== expectedColumns) {
      malformedRows.push({ row: index + 1, expectedColumns, actualColumns: row.length });
    }
  });

  const columns: CsvColumnStats[] = headers.map((name, column) => {
    const cellTypes = dataRows.map((row) => classifyCell(row[column] ?? ""));
    const blankCount = cellTypes.filter((type) => type === "blank").length;
    return {
      name,
      type: columnTypeOf(cellTypes),
      blankCount,
      filledCount: cellTypes.length - blankCount,
    };
  });

  return {
    ok: true,
    data: {
      delimiter,
      hasHeader,
      headers,
      columns,
      dataRows,
      preview: dataRows.slice(0, PREVIEW_ROW_LIMIT),
      rowCount: dataRows.length,
      malformedRows,
    },
  };
}
