/*
 * A reference table: a list of terms somebody looks up rather than a
 * calculation somebody runs.
 *
 * Eleven tools in the `arayis` family are the same page — HTTP status codes,
 * MIME types, well-known ports, git and Linux and Docker commands, request
 * headers, regex syntax, the ASCII table. Each is a few dozen rows of "this
 * string means this thing", a box to narrow them with, and nothing else. Left
 * alone, that would have been eleven filter functions and eleven tables that
 * drift apart the week after they are written.
 *
 * So the data shape and the search live here, React-free, and the drawing
 * lives in `components/tools/reference-table.tsx`. What a tool ships is the
 * rows.
 */

/** A heading inside a table: 4xx, "gündəlik iş", "şəbəkə". */
export type ReferenceSection = {
  /** ASCII — it becomes a DOM id and a button's `aria-controls`. */
  id: string;
  label: string;
  /** One line under the heading, when the group needs explaining. */
  hint?: string;
};

export type ReferenceRow = {
  /** The looked-up thing itself: `404`, `git rebase`, `Cache-Control`. */
  term: string;
  /** Its short name, printed beside the term: "Not Found". */
  label?: string;
  /** The sentence that answers the question. Azerbaijani. */
  note: string;
  /** `id` of the section this row belongs to. */
  section: string;
  /** A concrete line — a command as typed, a header as sent. */
  example?: string;
  /**
   * Words that should find this row without being printed on it: the English
   * name of a thing whose Azerbaijani name is in `note`, a synonym, the older
   * spelling of a command.
   */
  match?: string[];
};

/**
 * The key both sides of a search are reduced to.
 *
 * Same fold the glossary search uses, and for the same two reasons. Locale
 * lower-casing is what turns `İ` into `i` instead of into `i` plus a combining
 * dot — and it turns `I` into `ı`, which is why the diacritic map has to run
 * after it or a search for "IP" would look for "ıp" and find nothing. The rest
 * of the map is tolerance: somebody typing on a keyboard without `ə` still
 * finds «şəbəkə» by typing "sebeke".
 */
export function fold(value: string): string {
  return value
    .toLocaleLowerCase("az")
    .replace(/ə/g, "e")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g");
}

/** Everything about a row a search is allowed to match, folded once. */
function haystack(row: ReferenceRow): string {
  return fold(
    [row.term, row.label ?? "", row.note, row.example ?? "", ...(row.match ?? [])].join(" "),
  );
}

/**
 * The rows left after a query and a section filter.
 *
 * Every word in the query has to appear somewhere in the row, in any order:
 * "404 tapılmadı" and "tapılmadı 404" are the same search, and neither is a
 * phrase anybody would have written in that order. An empty query keeps
 * everything, which is the state the page loads in.
 */
export function filterReference(
  rows: ReferenceRow[],
  { query = "", section }: { query?: string; section?: string } = {},
): ReferenceRow[] {
  const inSection = section === undefined ? rows : rows.filter((row) => row.section === section);
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return inSection;

  return inSection.filter((row) => {
    const hay = haystack(row);
    return words.every((word) => hay.includes(word));
  });
}

/** How many rows each section holds, keyed by section id. */
export function sectionCounts(rows: ReferenceRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.section] = (counts[row.section] ?? 0) + 1;
  return counts;
}

/** Rows grouped under their section, sections in declared order, empties gone. */
export function groupBySection(
  rows: ReferenceRow[],
  sections: ReferenceSection[],
): { section: ReferenceSection; rows: ReferenceRow[] }[] {
  return sections
    .map((section) => ({ section, rows: rows.filter((row) => row.section === section.id) }))
    .filter((group) => group.rows.length > 0);
}

/**
 * What a reference table has to be true of before it ships.
 *
 * These tools are written by hand from documentation, and the mistakes are
 * always the same four: a row filed under a section that does not exist, the
 * same term entered twice, a section nobody put anything in, and a note that
 * is a repeat of the label rather than an explanation. Each tool's check file
 * runs this over its own rows, so none of them has to remember the list.
 */
export function auditReference(
  rows: ReferenceRow[],
  sections: ReferenceSection[],
  { minNote = 30 }: { minNote?: number } = {},
): string[] {
  const problems: string[] = [];
  const ids = new Set(sections.map((section) => section.id));
  const seen = new Set<string>();

  for (const id of ids) {
    if (!rows.some((row) => row.section === id)) problems.push(`bos bolme: ${id}`);
  }

  for (const row of rows) {
    if (!ids.has(row.section)) problems.push(`${row.term}: bolme yoxdur (${row.section})`);

    /*
     * Exact, not folded. Folding was the first version and it was wrong for
     * the one table that needed this check most: in regex syntax `\d` and `\D`
     * are opposites, `\s` and `\S` are opposites, and a case-insensitive key
     * reported all four as duplicates of each other. A term is the literal
     * string somebody looks up, so two terms differing by case are two terms.
     */
    const key = `${row.section} ${row.term.trim()}`;
    if (seen.has(key)) problems.push(`${row.term}: eyni bolmede tekrarlanir`);
    seen.add(key);

    if (row.note.trim().length < minNote) problems.push(`${row.term}: izah cox qisadir`);
    if (fold(row.note) === fold(row.label ?? "")) problems.push(`${row.term}: izah adin tekraridir`);
  }

  return problems;
}
