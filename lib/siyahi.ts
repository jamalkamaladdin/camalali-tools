/**
 * A list of lines, put through a sequence of steps the visitor assembles —
 * deduplicate, sort, reverse, shuffle, drop the blanks, trim, add a
 * prefix/suffix, number, change case, pick the output separator — in
 * whichever order they add them.
 *
 * The order is the point: the same steps in a different sequence are a
 * different tool. Numbering before a sort renumbers nothing once the sort
 * moves the items; numbering after it produces the ranked list a visitor
 * actually wanted. So this file never reorders what it is given — it folds
 * the steps left to right over the array exactly once, and every step is a
 * pure `string[] -> string[]` function so the fold is the only place
 * sequencing happens.
 *
 * Two Azerbaijani-specific traps live in here on purpose, both documented
 * where they are guarded against: `.toLocaleLowerCase("az")` /
 * `.toLocaleUpperCase("az")` rather than the locale-free form, because the
 * locale-free case conversion mishandles the dotted and dotless capital and
 * lowercase I pair (U+0130/U+0049 vs U+0069/U+0131) — and
 * `localeCompare(..., "az")` rather than the default comparator, so the
 * alphabetic sort follows Azerbaijani collation order rather than raw code
 * point order.
 */

export type SortBy = "alpha" | "numeric" | "length";
export type SortDirection = "asc" | "desc";
export type CaseMode = "lower" | "upper";
export type JoinSeparator = "newline" | "comma" | "space";

export const JOIN_SEPARATOR_CHARS: Record<JoinSeparator, string> = {
  newline: "\n",
  comma: ", ",
  space: " ",
};

export const JOIN_SEPARATOR_LABELS: Record<JoinSeparator, string> = {
  newline: "sətir",
  comma: "vergül",
  space: "boşluq",
};

export type ListStep =
  | { kind: "dedupe" }
  | { kind: "sort"; by: SortBy; direction: SortDirection }
  | { kind: "reverse" }
  | { kind: "shuffle"; seed: number }
  | { kind: "drop-blank" }
  | { kind: "trim" }
  | { kind: "prefix"; text: string }
  | { kind: "suffix"; text: string }
  | { kind: "number" }
  | { kind: "case"; mode: CaseMode }
  | { kind: "separator"; join: JoinSeparator };

/** Splits the pasted textarea into items — one per line, blank lines kept (a step removes them, if the visitor asks for it), the one trailing newline a textarea always adds dropped. */
export function parseListText(text: string): string[] {
  const lines = text.split(/\r\n|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "" && text.endsWith("\n")) {
    lines.pop();
  }
  return lines;
}

function dedupeList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/**
 * Numeric sort separates the parseable items from the rest rather than
 * mixing `NaN` into the comparator — `NaN` is neither less than nor greater
 * than anything, so any comparator that lets it in produces an order that
 * depends on the sort algorithm's internal comparisons, not on the data.
 * Unparseable items keep their original relative order and are appended
 * after the numeric ones, in both directions.
 */
function sortNumeric(items: string[], direction: SortDirection): string[] {
  const numeric: { item: string; value: number }[] = [];
  const rest: string[] = [];
  for (const item of items) {
    const value = Number(item.trim());
    if (item.trim() !== "" && !Number.isNaN(value)) numeric.push({ item, value });
    else rest.push(item);
  }
  numeric.sort((a, b) => (direction === "asc" ? a.value - b.value : b.value - a.value));
  return [...numeric.map((entry) => entry.item), ...rest];
}

function sortList(items: string[], by: SortBy, direction: SortDirection): string[] {
  if (by === "numeric") return sortNumeric(items, direction);

  const sorted = [...items].sort((a, b) => {
    if (by === "length") return [...a].length - [...b].length;
    return a.localeCompare(b, "az");
  });
  if (direction === "desc") sorted.reverse();
  return sorted;
}

/**
 * A tiny deterministic PRNG (mulberry32) rather than `Math.random`: the same
 * seed always produces the same shuffle, which is what makes this testable
 * without the test asserting an exact "random" order is somehow wrong. The
 * UI mints a fresh seed each time a shuffle step is added; a check file can
 * pin one.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleList(items: string[], seed: number): string[] {
  const rng = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function applyStep(items: string[], step: ListStep): string[] {
  switch (step.kind) {
    case "dedupe":
      return dedupeList(items);
    case "sort":
      return sortList(items, step.by, step.direction);
    case "reverse":
      return [...items].reverse();
    case "shuffle":
      return shuffleList(items, step.seed);
    case "drop-blank":
      return items.filter((item) => item.trim() !== "");
    case "trim":
      return items.map((item) => item.trim());
    case "prefix":
      return items.map((item) => step.text + item);
    case "suffix":
      return items.map((item) => item + step.text);
    case "number":
      return items.map((item, index) => `${index + 1}. ${item}`);
    case "case":
      return items.map((item) =>
        step.mode === "lower" ? item.toLocaleLowerCase("az") : item.toLocaleUpperCase("az"),
      );
    case "separator":
      // Handled by the caller when it joins the final array — a step here
      // has nothing to do to the items themselves.
      return items;
  }
}

/** Folds every step over the list, left to right, exactly once. */
export function runPipeline(items: string[], steps: ListStep[]): string[] {
  return steps.reduce((acc, step) => applyStep(acc, step), items);
}

/** The separator the last `"separator"` step in the sequence set; the default when none was added. */
export function outputSeparatorOf(steps: ListStep[]): JoinSeparator {
  let separator: JoinSeparator = "newline";
  for (const step of steps) {
    if (step.kind === "separator") separator = step.join;
  }
  return separator;
}

export function joinList(items: string[], separator: JoinSeparator): string {
  return items.join(JOIN_SEPARATOR_CHARS[separator]);
}

export type ListPipelineResult = { items: string[]; separator: JoinSeparator; text: string };

export function processList(rawText: string, steps: ListStep[]): ListPipelineResult {
  const items = runPipeline(parseListText(rawText), steps);
  const separator = outputSeparatorOf(steps);
  return { items, separator, text: joinList(items, separator) };
}

/** A short Azerbaijani description of one step, in the order the visitor sees the pipeline printed back. */
export function describeStep(step: ListStep): string {
  switch (step.kind) {
    case "dedupe":
      return "Təkrarı sil";
    case "sort": {
      const byLabel = step.by === "alpha" ? "əlifba" : step.by === "numeric" ? "rəqəm" : "uzunluq";
      const dirLabel = step.direction === "asc" ? "artan" : "azalan";
      return `Sırala (${byLabel}, ${dirLabel})`;
    }
    case "reverse":
      return "Tərsinə çevir";
    case "shuffle":
      return "Qarışdır";
    case "drop-blank":
      return "Boş sətirləri at";
    case "trim":
      return "Kənar boşluqları kəs";
    case "prefix":
      return `Prefiks əlavə et: "${step.text}"`;
    case "suffix":
      return `Suffiks əlavə et: "${step.text}"`;
    case "number":
      return "Nömrələ";
    case "case":
      return step.mode === "lower" ? "Kiçik hərfə çevir" : "Böyük hərfə çevir";
    case "separator":
      return `Ayırıcını dəyiş: ${JOIN_SEPARATOR_LABELS[step.join]}`;
  }
}

/** Items of `a` that also appear in `b`, in `a`'s order, each once. */
export function intersectLists(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of a) {
    if (setB.has(item) && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/** Items of `a` that do not appear in `b`, in `a`'s order, each once. */
export function differenceLists(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of a) {
    if (!setB.has(item) && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}
