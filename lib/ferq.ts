/**
 * Line-by-line text comparison built on the longest common subsequence.
 *
 * LCS is the algorithm `diff` itself uses, and the reason is that the obvious
 * alternative — walk both texts together and call every line that differs a
 * change — reports a single inserted line at the top as "every line changed".
 * LCS finds the largest set of lines that appear in both texts in the same
 * order; whatever is left over on the left was removed and whatever is left
 * over on the right was added.
 *
 * Pure functions, no React and no DOM.
 */

/**
 * The most lines this will compare on either side.
 *
 * The dynamic programming table is (n+1)x(m+1) cells and it has to exist in
 * full, because the answer is read back out of it. At the limit that is
 * 2001 x 2001 = ~4 million 16-bit cells — 8 MB and about 4 million
 * comparisons, which finishes in well under a second. Doubling the limit
 * quadruples both: 5000 lines a side is 50 MB and 25 million cells, which is
 * where a phone browser either stalls visibly or fails the allocation
 * outright. A refused comparison with a sentence saying why is a better
 * outcome than a tab that stops responding.
 *
 * The common prefix and suffix are stripped before the table is built, so the
 * usual case — two versions of the same file — costs a fraction of this. The
 * limit guards the worst case, which is two texts with nothing in common.
 */
export const MAX_LINES = 2000;

export type DiffOptions = {
  /** Leading, trailing and repeated whitespace stops counting as a change. */
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
};

export const DEFAULT_OPTIONS: DiffOptions = {
  ignoreWhitespace: false,
  ignoreCase: false,
};

/** Which newline convention a text uses, reported separately from the diff. */
export type LineEnding = "lf" | "crlf" | "mixed" | "none";

export type DiffLine = {
  kind: "same" | "add" | "remove";
  /** The original line, never the normalised comparison key. */
  text: string;
  /** 1-based line number on the left, or null for an added line. */
  left: number | null;
  /** 1-based line number on the right, or null for a removed line. */
  right: number | null;
};

export type DiffSummary = {
  added: number;
  removed: number;
  unchanged: number;
  leftLines: number;
  rightLines: number;
  leftEnding: LineEnding;
  rightEnding: LineEnding;
  /**
   * True when the two texts use different newline characters. CRLF is folded
   * to LF before comparing — otherwise a file saved on Windows and the same
   * file saved on Linux would come back as every line changed, which is true
   * byte for byte and useless to read. The difference is reported here instead.
   */
  endingDiffers: boolean;
  identical: boolean;
};

export type DiffResult =
  | { ok: true; lines: DiffLine[]; summary: DiffSummary }
  | { ok: false; error: string };

/**
 * Splits into lines after folding CRLF and a lone CR to LF.
 *
 * An empty text is zero lines, not one empty line: `"".split("\n")` is `[""]`,
 * which would make an empty box compare as a text containing one blank line
 * and report a phantom difference against another empty box.
 *
 * A text that ends in a newline keeps the empty line that follows it. That is
 * deliberate — "no newline at end of file" is a real difference, and this is
 * how it becomes visible.
 */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

export function detectLineEnding(text: string): LineEnding {
  const total = (text.match(/\n/g) ?? []).length;
  if (total === 0) return "none";
  const crlf = (text.match(/\r\n/g) ?? []).length;
  if (crlf === 0) return "lf";
  if (crlf === total) return "crlf";
  return "mixed";
}

/**
 * Lowercasing that survives the Azerbaijani alphabet.
 *
 * Two facts make the built-in method unusable here. U+0130, the capital I with
 * a dot above, lowercases to TWO code points — U+0069 followed by U+0307
 * COMBINING DOT ABOVE — so a word typed with it never compares equal to the
 * same word typed in lowercase, however carefully. And U+0049, plain capital
 * I, lowercases to U+0069 in the root locale but to U+0131, the dotless i, in
 * this alphabet, where the dotted and dotless letters are different letters
 * entirely. `toLocaleLowerCase` gets the second one right only when the
 * runtime carries full ICU data, which a visitor's browser does not guarantee.
 *
 * Those two letters are therefore mapped by hand before the built-in runs, so
 * the result does not depend on which locale data happens to be present.
 */
export function foldCase(value: string): string {
  return value.replaceAll("İ", "i").replaceAll("I", "ı").toLowerCase();
}

function keyOf(line: string, options: DiffOptions): string {
  let key = line;
  if (options.ignoreWhitespace) key = key.trim().replace(/\s+/g, " ");
  if (options.ignoreCase) key = foldCase(key);
  return key;
}

/**
 * The LCS length table, filled from the bottom right so cell (i,j) holds the
 * answer for the two suffixes starting at i and j.
 *
 * `Uint16Array` rather than a plain array: a cell holds a subsequence length,
 * which can never exceed `MAX_LINES` and so fits in 16 bits, and a typed array
 * of 4 million cells is 8 MB where an ordinary JavaScript array of the same
 * size is several times that.
 */
function lcsTable(a: string[], b: string[]): Uint16Array {
  const cols = b.length + 1;
  const table = new Uint16Array((a.length + 1) * cols);

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + (j + 1)] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + (j + 1)]);
    }
  }

  return table;
}

export function diffLines(
  leftText: string,
  rightText: string,
  options: DiffOptions = DEFAULT_OPTIONS,
): DiffResult {
  const leftRaw = splitLines(leftText);
  const rightRaw = splitLines(rightText);

  if (leftRaw.length > MAX_LINES || rightRaw.length > MAX_LINES) {
    const worst = Math.max(leftRaw.length, rightRaw.length);
    return {
      ok: false,
      error: `Mətn həddi aşır: hər tərəf ən çox ${MAX_LINES} sətir ola bilər, ${worst} sətir verildi. Müqayisə cədvəli sətir sayının kvadratı qədər yaddaş tutur, bu hədd brauzerin donmaması üçündür. Mətni hissələrə bölüb müqayisə et.`,
    };
  }

  const leftKeys = leftRaw.map((line) => keyOf(line, options));
  const rightKeys = rightRaw.map((line) => keyOf(line, options));

  /*
   * The identical head and tail are peeled off before the table is built. Two
   * versions of the same file usually share almost everything, so this is the
   * difference between a 4-million-cell table and a table of a few hundred —
   * and it costs one linear pass.
   */
  let head = 0;
  while (
    head < leftKeys.length &&
    head < rightKeys.length &&
    leftKeys[head] === rightKeys[head]
  ) {
    head++;
  }

  let leftEnd = leftKeys.length;
  let rightEnd = rightKeys.length;
  while (
    leftEnd > head &&
    rightEnd > head &&
    leftKeys[leftEnd - 1] === rightKeys[rightEnd - 1]
  ) {
    leftEnd--;
    rightEnd--;
  }

  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;

  for (let i = 0; i < head; i++) {
    lines.push({ kind: "same", text: leftRaw[i], left: i + 1, right: i + 1 });
  }

  const midLeft = leftKeys.slice(head, leftEnd);
  const midRight = rightKeys.slice(head, rightEnd);
  const table = lcsTable(midLeft, midRight);
  const cols = midRight.length + 1;

  let i = 0;
  let j = 0;
  while (i < midLeft.length && j < midRight.length) {
    if (midLeft[i] === midRight[j]) {
      lines.push({
        kind: "same",
        text: leftRaw[head + i],
        left: head + i + 1,
        right: head + j + 1,
      });
      i++;
      j++;
      continue;
    }
    /*
     * The tie goes to the removal, so a replaced line reads as "- old" then
     * "+ new" — the order every diff tool and every code review has trained
     * people to expect. Flipping this comparison would produce a correct but
     * backwards-reading "+ new" above "- old".
     */
    if (table[(i + 1) * cols + j] >= table[i * cols + (j + 1)]) {
      lines.push({ kind: "remove", text: leftRaw[head + i], left: head + i + 1, right: null });
      removed++;
      i++;
    } else {
      lines.push({ kind: "add", text: rightRaw[head + j], left: null, right: head + j + 1 });
      added++;
      j++;
    }
  }

  while (i < midLeft.length) {
    lines.push({ kind: "remove", text: leftRaw[head + i], left: head + i + 1, right: null });
    removed++;
    i++;
  }
  while (j < midRight.length) {
    lines.push({ kind: "add", text: rightRaw[head + j], left: null, right: head + j + 1 });
    added++;
    j++;
  }

  const tailLength = leftKeys.length - leftEnd;
  for (let k = 0; k < tailLength; k++) {
    lines.push({
      kind: "same",
      text: leftRaw[leftEnd + k],
      left: leftEnd + k + 1,
      right: rightEnd + k + 1,
    });
  }

  const leftEnding = detectLineEnding(leftText);
  const rightEnding = detectLineEnding(rightText);

  return {
    ok: true,
    lines,
    summary: {
      added,
      removed,
      unchanged: lines.length - added - removed,
      leftLines: leftRaw.length,
      rightLines: rightRaw.length,
      leftEnding,
      rightEnding,
      /* "none" means the text holds no newline at all, so there is no
         convention to disagree about — a single-line box must not be reported
         as having a different line ending from a multi-line one. */
      endingDiffers:
        leftEnding !== "none" && rightEnding !== "none" && leftEnding !== rightEnding,
      identical: added === 0 && removed === 0,
    },
  };
}

/* ---------- the two views ---------- */

/**
 * The unified form, with the prefixes `diff -u` uses: one space for a line
 * both texts share, "-" for a line only the left has, "+" for a line only the
 * right has. Written without line numbers so the result can be pasted straight
 * into a review comment.
 */
export function toUnifiedText(lines: DiffLine[]): string {
  return lines
    .map((line) => {
      const mark = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
      return `${mark} ${line.text}`;
    })
    .join("\n");
}

export type SideCell = { number: number; text: string; changed: boolean };

export type SideRow = { left: SideCell | null; right: SideCell | null };

/**
 * Pairs the two columns.
 *
 * A block of removals followed by a block of additions is one edit, not two,
 * so the blocks are zipped: the first removed line sits opposite the first
 * added line. Laying them out one after the other instead would put a replaced
 * line and its replacement several rows apart, which is exactly the comparison
 * the side-by-side view exists to make easy.
 */
export function toSideBySide(lines: DiffLine[]): SideRow[] {
  const rows: SideRow[] = [];
  let removals: DiffLine[] = [];
  let additions: DiffLine[] = [];

  const flush = () => {
    const height = Math.max(removals.length, additions.length);
    for (let i = 0; i < height; i++) {
      const removal = removals[i];
      const addition = additions[i];
      rows.push({
        left:
          removal === undefined
            ? null
            : { number: removal.left ?? 0, text: removal.text, changed: true },
        right:
          addition === undefined
            ? null
            : { number: addition.right ?? 0, text: addition.text, changed: true },
      });
    }
    removals = [];
    additions = [];
  };

  for (const line of lines) {
    if (line.kind === "remove") {
      removals.push(line);
      continue;
    }
    if (line.kind === "add") {
      additions.push(line);
      continue;
    }
    flush();
    rows.push({
      left: { number: line.left ?? 0, text: line.text, changed: false },
      right: { number: line.right ?? 0, text: line.text, changed: false },
    });
  }

  flush();
  return rows;
}

/** The one-line count above the views. */
export function summaryText(summary: DiffSummary): string {
  if (summary.identical) return "Fərq yoxdur: iki mətn eynidir.";
  return `${summary.added} sətir əlavə, ${summary.removed} sətir silindi, ${summary.unchanged} sətir dəyişməyib.`;
}
