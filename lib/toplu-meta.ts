/**
 * A whole site's titles and descriptions, judged in one pass.
 *
 * The single preview beside this one answers "is this page's snippet right".
 * That question cannot find the defect that actually costs a site rankings:
 * the same title on forty pages. A duplicate is invisible while you look at
 * one page at a time and obvious the moment the rows sit next to each other,
 * which is the only reason this tool exists as something separate.
 *
 * The measuring is not repeated here — `estimateWidth` and the device limits
 * are imported from `serp-onizleme`, so a row called "uzun" in this table is a
 * row that clips in that preview.
 */

import {
  DESCRIPTION_FONT_PX,
  descriptionBudgetPx,
  estimateWidth,
  SERP_LIMITS,
  TITLE_FONT_PX,
  type SerpDevice,
} from "./serp-onizleme";

/**
 * Where a paste stops being parsed.
 *
 * A sitemap export of a large site runs to tens of thousands of rows, and
 * every one of them would become a DOM node and a string in memory. The cap is
 * not a guess about what is reasonable — it is the point past which the tab
 * stops responding while the visitor is still typing, so it is enforced and
 * announced rather than silently exceeded.
 */
export const MAX_ROWS = 2000;

export type Delimiter = "," | "\t" | ";";

const DELIMITERS: Delimiter[] = [",", "\t", ";"];

/*
 * Which character separates the columns is guessed from the first record, not
 * asked. A visitor pasting out of Excel gets tabs, out of a German or Azeri
 * locale export gets semicolons, out of anything else gets commas — and none
 * of them know which one they have, because a spreadsheet never showed it.
 *
 * Counted outside quotes only: `"Baku, Azerbaijan";x` has one separator, not
 * two, and a naive count would split a perfectly good file down the middle of
 * a field.
 */
function detectDelimiter(text: string): Delimiter {
  const counts = new Map<Delimiter, number>(DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;

  for (const char of text) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) break; // the first record is enough
    if (inQuotes) continue;
    const delimiter = DELIMITERS.find((d) => d === char);
    if (delimiter !== undefined) counts.set(delimiter, (counts.get(delimiter) ?? 0) + 1);
  }

  let best: Delimiter = ",";
  for (const delimiter of DELIMITERS) {
    if ((counts.get(delimiter) ?? 0) > (counts.get(best) ?? 0)) best = delimiter;
  }
  return best;
}

/**
 * A field-by-field scanner rather than `split`.
 *
 * `split(",")` is where every home-made CSV reader dies: a description with a
 * comma in it — which is most descriptions — becomes two columns, and every
 * column after it shifts. Quotes have to be tracked, `""` has to become one
 * quote, and a newline inside quotes has to stay part of the field.
 */
function parseWith(text: string, delimiter: Delimiter): { rows: string[][]; unterminated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote is one literal quote; a single one closes the field.
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    // A quote opens a quoted field only at the start of one. Leading spaces
    // before it are dropped rather than kept, because ` "a, b"` is a hand-typed
    // row meaning one field, not a field beginning with a space.
    if (char === '"' && field.trim() === "") {
      field = "";
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === delimiter) {
      endField();
      index += 1;
      continue;
    }

    if (char === "\r" || char === "\n") {
      endRow();
      index += char === "\r" && text[index + 1] === "\n" ? 2 : 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // A file that does not end in a newline still has a last row in it.
  if (field !== "" || row.length > 0) endRow();

  return { rows, unterminated: inQuotes };
}

/** A row of nothing but separators is a blank line in the paste, not a page with no title. */
function isBlankRow(cells: string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}

export function parseDelimited(text: string): {
  rows: string[][];
  delimiter: Delimiter;
  error: string | null;
} {
  const delimiter = detectDelimiter(text);
  const parsed = parseWith(text, delimiter);
  const rows = parsed.rows.filter((cells) => !isBlankRow(cells));

  if (parsed.unterminated) {
    return {
      rows,
      delimiter,
      error: "Dırnaq bağlanmayıb: mətnin sonuna qədər bir sahə açıq qaldı. Nəticə natamam ola bilər.",
    };
  }

  if (rows.length > MAX_ROWS) {
    return {
      rows: rows.slice(0, MAX_ROWS),
      delimiter,
      error: `${rows.length} sətir yapışdırıldı, yalnız ilk ${MAX_ROWS} sətir yoxlanıldı.`,
    };
  }

  return { rows, delimiter, error: null };
}

export type MetaRow = { url: string; title: string; description: string };

/*
 * A header row is recognised by its first three cells, not by "the first row
 * looks different". Every export writes these words in one of a handful of
 * spellings, and a data row never begins with any of them — so a file with no
 * header keeps all of its pages, and a file with one does not audit the word
 * "title" as if it were a page title.
 */
const URL_HEADERS = new Set(["url", "unvan", "ünvan", "link", "address", "adres", "sehife", "səhifə"]);
const TITLE_HEADERS = new Set(["title", "basliq", "başlıq", "meta title", "meta_title", "page title"]);
const DESCRIPTION_HEADERS = new Set([
  "description",
  "desc",
  "tesvir",
  "təsvir",
  "meta description",
  "meta_description",
  "aciqlama",
  "açıqlama",
]);

export function looksLikeHeader(cells: string[]): boolean {
  const cell = (index: number) => (cells[index] ?? "").trim().toLowerCase();
  return URL_HEADERS.has(cell(0)) && TITLE_HEADERS.has(cell(1)) && DESCRIPTION_HEADERS.has(cell(2));
}

/**
 * The parsed grid as three named columns.
 *
 * A short row is filled with empty strings instead of being dropped: a page
 * whose description column was never written is exactly the row this tool is
 * looking for, and dropping it would hide the defect. Extra columns are
 * ignored, because an export carrying a status code or a word count beside the
 * three is still a usable export.
 */
export function toMetaRows(rows: string[][]): MetaRow[] {
  const body = rows.length > 0 && looksLikeHeader(rows[0]) ? rows.slice(1) : rows;
  return body.map((cells) => ({
    url: (cells[0] ?? "").trim(),
    title: (cells[1] ?? "").trim(),
    description: (cells[2] ?? "").trim(),
  }));
}

export type MetaIssue =
  | "bos-basliq"
  | "bos-tesvir"
  | "uzun-basliq"
  | "qisa-basliq"
  | "uzun-tesvir"
  | "qisa-tesvir"
  | "tekrar-basliq"
  | "tekrar-tesvir";

/** Fixed order, so the summary and the legend list the same things in the same places every time. */
export const META_ISSUES: MetaIssue[] = [
  "bos-basliq",
  "bos-tesvir",
  "tekrar-basliq",
  "tekrar-tesvir",
  "uzun-basliq",
  "qisa-basliq",
  "uzun-tesvir",
  "qisa-tesvir",
];

export const ISSUE_LABELS: Record<MetaIssue, string> = {
  "bos-basliq": "boş başlıq",
  "bos-tesvir": "boş təsvir",
  "tekrar-basliq": "təkrar başlıq",
  "tekrar-tesvir": "təkrar təsvir",
  "uzun-basliq": "uzun başlıq",
  "qisa-basliq": "qısa başlıq",
  "uzun-tesvir": "uzun təsvir",
  "qisa-tesvir": "qısa təsvir",
};

export type MetaAudit = {
  row: MetaRow;
  titlePx: number;
  descriptionPx: number;
  issues: MetaIssue[];
};

/**
 * The set of texts that appear on more than one page.
 *
 * Compared case-insensitively and after trimming, because "Ana Səhifə" and
 * "ana səhifə " are the same title to a search engine and to a reader. The
 * count is of distinct *addresses*, not of rows: the same page listed twice in
 * an export is a duplicated line, and calling that a duplicate title would
 * send the visitor looking for a second page that does not exist. A row with
 * no address counts as its own page, since nothing says otherwise.
 */
function duplicatedTexts(rows: MetaRow[], pick: (row: MetaRow) => string): Set<string> {
  const addresses = new Map<string, Set<string>>();

  rows.forEach((row, index) => {
    const key = pick(row).trim().toLowerCase();
    if (key === "") return;
    const url = row.url.trim().toLowerCase();
    const seen = addresses.get(key) ?? new Set<string>();
    seen.add(url === "" ? `#${index}` : url);
    addresses.set(key, seen);
  });

  const duplicates = new Set<string>();
  for (const [key, seen] of addresses) {
    if (seen.size > 1) duplicates.add(key);
  }
  return duplicates;
}

function emptySummary(): Record<MetaIssue, number> {
  const summary = {} as Record<MetaIssue, number>;
  for (const issue of META_ISSUES) summary[issue] = 0;
  return summary;
}

/*
 * The same half-of-budget line the single preview draws, restated here rather
 * than imported: `judgeTitle` works on one string and returns a verdict, and
 * calling it per row would measure every title twice — once for the verdict
 * and once for the pixel column the table prints.
 */
const SHORT_RATIO = 0.5;

export function auditRows(
  rows: MetaRow[],
  device: SerpDevice,
): { audits: MetaAudit[]; summary: Record<MetaIssue, number> } {
  const titleBudget = SERP_LIMITS[device].titlePx;
  const descriptionBudget = descriptionBudgetPx(device);
  const shortTitle = titleBudget * SHORT_RATIO;
  const shortDescription = descriptionBudget * SHORT_RATIO;

  const duplicateTitles = duplicatedTexts(rows, (row) => row.title);
  const duplicateDescriptions = duplicatedTexts(rows, (row) => row.description);

  const summary = emptySummary();
  const audits = rows.map((row) => {
    const titlePx = estimateWidth(row.title, TITLE_FONT_PX);
    const descriptionPx = estimateWidth(row.description, DESCRIPTION_FONT_PX);
    const issues: MetaIssue[] = [];

    // Empty and "too short" are the same fact stated twice, and a row carrying
    // both reads as two defects in the summary. Empty wins: it is the one the
    // visitor can act on without reading a pixel count.
    if (row.title === "") {
      issues.push("bos-basliq");
    } else if (titlePx > titleBudget) {
      issues.push("uzun-basliq");
    } else if (titlePx < shortTitle) {
      issues.push("qisa-basliq");
    }

    if (row.description === "") {
      issues.push("bos-tesvir");
    } else if (descriptionPx > descriptionBudget) {
      issues.push("uzun-tesvir");
    } else if (descriptionPx < shortDescription) {
      issues.push("qisa-tesvir");
    }

    if (row.title !== "" && duplicateTitles.has(row.title.trim().toLowerCase())) {
      issues.push("tekrar-basliq");
    }
    if (row.description !== "" && duplicateDescriptions.has(row.description.trim().toLowerCase())) {
      issues.push("tekrar-tesvir");
    }

    for (const issue of issues) summary[issue] += 1;
    return { row, titlePx, descriptionPx, issues };
  });

  return { audits, summary };
}

/** Anything with a separator, a quote or a line break in it has to be quoted, and a quote inside doubles. */
function csvCell(value: string): string {
  return /["\r\n,]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const CSV_COLUMNS = [
  "url",
  "title",
  "description",
  "basliq_simvol",
  "basliq_piksel",
  "tesvir_simvol",
  "tesvir_piksel",
  "hokm",
];

/**
 * The table on its way back out to the spreadsheet it came from.
 *
 * The first three columns keep their original names, and the escaping is the
 * mirror of the parser above, so a file can go out of this tool and come back
 * into it unchanged — a description with a comma or a quoted phrase in it
 * survives the round trip. The verdict column holds the issue keys rather than
 * a sentence, because the next thing that reads this file is a filter.
 */
export function toCsv(audits: MetaAudit[]): string {
  const lines = [CSV_COLUMNS.join(",")];

  for (const audit of audits) {
    lines.push(
      [
        audit.row.url,
        audit.row.title,
        audit.row.description,
        String(Array.from(audit.row.title).length),
        String(audit.titlePx),
        String(Array.from(audit.row.description).length),
        String(audit.descriptionPx),
        audit.issues.length === 0 ? "uygun" : audit.issues.join(" "),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return lines.join("\r\n");
}
