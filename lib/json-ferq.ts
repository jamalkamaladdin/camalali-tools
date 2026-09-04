/**
 * Structural JSON diff: two JSON documents compared key by key, not line by
 * line. A line-based diff (this project's `ferq`) treats a JSON document as
 * text, so re-indenting it or adding one array element shifts every closing
 * brace below and looks like the whole file changed. This file walks both
 * parsed values in parallel instead, so a change is reported at the path
 * that actually changed (`user.address[0].city`) no matter how either side
 * is formatted. Kept apart from `ferq.ts` on purpose — line diff (LCS over
 * strings) and structural diff (walking two trees) share no code.
 *
 * Worth checking: the four operation kinds (add/remove/replace/type-change)
 * land on the right path; the two array-matching modes (position vs a named
 * key) disagree on purpose for the same input; `orderSensitive` actually
 * changes position-mode output; and the JSON Patch this produces, applied to
 * the first document, reconstructs the second one.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DiffOp = "add" | "remove" | "replace" | "type-change";

export type DiffEntry = {
  /** Human path, e.g. `user.address[0].city` — what the result table shows. Root is `""`. */
  path: string;
  /** RFC 6901 JSON Pointer for the same location, e.g. `/user/address/0/city` — what the patch uses. */
  pointer: string;
  op: DiffOp;
  before: JsonValue | undefined;
  after: JsonValue | undefined;
};

export type ArrayMatchMode = "index" | "key";

export type DiffOptions = {
  arrayMode: ArrayMatchMode;
  /** The field used to pair array elements when `arrayMode` is `"key"`. Ignored otherwise. */
  arrayKey: string;
  /**
   * Only meaningful for `arrayMode: "index"`. On: two arrays are compared
   * position by position, so swapping two elements is two `replace` entries.
   * Off: elements are matched by deep equality wherever they sit in either
   * array, so a pure reorder produces no entries at all and only a value with
   * no equal partner on the other side shows up as `add`/`remove`. Off mode
   * cannot tell an edit from a remove-then-add — two elements that differ in
   * one field are reported as one of each, never as a `replace` — because
   * nothing says which old element a changed one used to be without a key.
   */
  orderSensitive: boolean;
};

export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  arrayMode: "index",
  arrayKey: "id",
  orderSensitive: true,
};

type Kind = "null" | "array" | "object" | "string" | "number" | "boolean";

function kindOf(value: JsonValue): Kind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as Kind;
}

function deepEqual(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  const ka = kindOf(a);
  if (ka !== kindOf(b)) return false;
  if (ka === "array") {
    const arrA = a as JsonValue[];
    const arrB = b as JsonValue[];
    return arrA.length === arrB.length && arrA.every((item, i) => deepEqual(item, arrB[i]));
  }
  if (ka === "object") {
    const objA = a as Record<string, JsonValue>;
    const objB = b as Record<string, JsonValue>;
    const keysA = Object.keys(objA);
    return (
      keysA.length === Object.keys(objB).length &&
      keysA.every((key) => key in objB && deepEqual(objA[key], objB[key]))
    );
  }
  return false; // primitives of the same kind already covered by a === b
}

function escapeToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

function appendObjectPath(path: string, pointer: string, key: string) {
  return { path: path === "" ? key : `${path}.${key}`, pointer: `${pointer}/${escapeToken(key)}` };
}

function appendArrayPath(path: string, pointer: string, index: number) {
  return { path: `${path}[${index}]`, pointer: `${pointer}/${index}` };
}

function diffValue(
  path: string,
  pointer: string,
  a: JsonValue | undefined,
  b: JsonValue | undefined,
  options: DiffOptions,
  out: DiffEntry[],
): void {
  if (a === undefined && b === undefined) return;
  if (a === undefined) {
    out.push({ path, pointer, op: "add", before: undefined, after: b });
    return;
  }
  if (b === undefined) {
    out.push({ path, pointer, op: "remove", before: a, after: undefined });
    return;
  }
  if (deepEqual(a, b)) return;

  const ka = kindOf(a);
  const kb = kindOf(b);
  if (ka !== kb) {
    out.push({ path, pointer, op: "type-change", before: a, after: b });
    return;
  }
  if (ka === "array") {
    diffArrays(path, pointer, a as JsonValue[], b as JsonValue[], options, out);
    return;
  }
  if (ka === "object") {
    diffObjects(path, pointer, a as Record<string, JsonValue>, b as Record<string, JsonValue>, options, out);
    return;
  }
  out.push({ path, pointer, op: "replace", before: a, after: b });
}

function diffObjects(
  path: string,
  pointer: string,
  a: Record<string, JsonValue>,
  b: Record<string, JsonValue>,
  options: DiffOptions,
  out: DiffEntry[],
): void {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const next = appendObjectPath(path, pointer, key);
    diffValue(next.path, next.pointer, a[key], b[key], options, out);
  }
}

/* Position mode: shared indices recurse, a trailing shrink removes from the
   highest index down (so earlier indices stay valid while removes apply in
   order), a trailing growth appends with the RFC 6901 "-" pointer (so the
   exact numeric index never has to be predicted). A single array frame is
   either shrinking or growing, never both — so the two loops below never
   have to reason about each other. */
function diffArraysByIndex(
  path: string,
  pointer: string,
  a: JsonValue[],
  b: JsonValue[],
  options: DiffOptions,
  out: DiffEntry[],
): void {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    const next = appendArrayPath(path, pointer, i);
    diffValue(next.path, next.pointer, a[i], b[i], options, out);
  }
  for (let i = a.length - 1; i >= shared; i--) {
    const next = appendArrayPath(path, pointer, i);
    out.push({ path: next.path, pointer: next.pointer, op: "remove", before: a[i], after: undefined });
  }
  for (let i = shared; i < b.length; i++) {
    out.push({ path: `${path}[${i}]`, pointer: `${pointer}/-`, op: "add", before: undefined, after: b[i] });
  }
}

/* Order-insensitive: greedily pairs each element of `a` with the first
   still-unused deeply-equal element of `b`. A matched pair is identical by
   definition, so it never produces an entry — only what is left over on
   either side does. */
function diffArraysByValue(path: string, pointer: string, a: JsonValue[], b: JsonValue[], out: DiffEntry[]): void {
  const usedB = new Array<boolean>(b.length).fill(false);
  const unmatchedA: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const j = b.findIndex((item, idx) => !usedB[idx] && deepEqual(item, a[i]));
    if (j === -1) unmatchedA.push(i);
    else usedB[j] = true;
  }
  for (const i of [...unmatchedA].sort((x, y) => y - x)) {
    const next = appendArrayPath(path, pointer, i);
    out.push({ path: next.path, pointer: next.pointer, op: "remove", before: a[i], after: undefined });
  }
  b.forEach((item, j) => {
    if (!usedB[j]) out.push({ path: `${path}[${j}]`, pointer: `${pointer}/-`, op: "add", before: undefined, after: item });
  });
}

function keyOf(item: JsonValue, arrayKey: string): string | null {
  if (kindOf(item) !== "object") return null;
  const value = (item as Record<string, JsonValue>)[arrayKey];
  return value === undefined ? null : JSON.stringify(value);
}

/* Key mode matches regardless of position, so a matched pair keeps `a`'s
   relative order in the patch — nothing here models "moved to index 3",
   because the visible vocabulary is add/remove/replace/type-change, not
   move. A visitor whose `b` also reorders the matched elements gets correct
   values back out of `applyJsonPatch` but not that exact new order; this is
   stated in the tool's own copy, not left to be discovered. */
function diffArraysByKey(
  path: string,
  pointer: string,
  a: JsonValue[],
  b: JsonValue[],
  options: DiffOptions,
  out: DiffEntry[],
): void {
  const bByKey = new Map<string, number>();
  b.forEach((item, index) => {
    const key = keyOf(item, options.arrayKey);
    if (key !== null && !bByKey.has(key)) bByKey.set(key, index);
  });

  const usedB = new Array<boolean>(b.length).fill(false);
  const unmatchedA: number[] = [];

  a.forEach((item, i) => {
    const key = keyOf(item, options.arrayKey);
    const bIndex = key === null ? undefined : bByKey.get(key);
    if (bIndex === undefined) {
      unmatchedA.push(i);
      return;
    }
    usedB[bIndex] = true;
    const next = appendArrayPath(path, pointer, i);
    diffValue(next.path, next.pointer, item, b[bIndex], options, out);
  });

  for (const i of [...unmatchedA].sort((x, y) => y - x)) {
    const next = appendArrayPath(path, pointer, i);
    out.push({ path: next.path, pointer: next.pointer, op: "remove", before: a[i], after: undefined });
  }

  b.forEach((item, j) => {
    if (!usedB[j]) out.push({ path: `${path}[${j}]`, pointer: `${pointer}/-`, op: "add", before: undefined, after: item });
  });
}

function diffArrays(
  path: string,
  pointer: string,
  a: JsonValue[],
  b: JsonValue[],
  options: DiffOptions,
  out: DiffEntry[],
): void {
  if (options.arrayMode === "key") {
    diffArraysByKey(path, pointer, a, b, options, out);
    return;
  }
  if (options.orderSensitive) diffArraysByIndex(path, pointer, a, b, options, out);
  else diffArraysByValue(path, pointer, a, b, out);
}

export function diffJson(a: JsonValue, b: JsonValue, options: DiffOptions = DEFAULT_DIFF_OPTIONS): DiffEntry[] {
  const out: DiffEntry[] = [];
  diffValue("", "", a, b, options, out);
  return out;
}

/* ---------- JSON Patch (RFC 6902), one direction: a -> b ---------- */

export type JsonPatchOp =
  | { op: "add"; path: string; value: JsonValue }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: JsonValue };

export function toJsonPatch(entries: DiffEntry[]): JsonPatchOp[] {
  return entries.map((entry) => {
    if (entry.op === "remove") return { op: "remove", path: entry.pointer };
    if (entry.op === "add") return { op: "add", path: entry.pointer, value: entry.after as JsonValue };
    return { op: "replace", path: entry.pointer, value: entry.after as JsonValue };
  });
}

function unescapeToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function resolveParent(doc: JsonValue, pointer: string): { parent: JsonValue; lastToken: string } | null {
  const tokens = pointer.slice(1).split("/").map(unescapeToken);
  let current: JsonValue = doc;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return null;
      current = current[index];
    } else if (current !== null && typeof current === "object") {
      const record = current as Record<string, JsonValue>;
      if (!(token in record)) return null;
      current = record[token];
    } else {
      return null;
    }
  }
  return { parent: current, lastToken: tokens[tokens.length - 1] };
}

/** Applies a patch to a deep clone of `doc` and returns the result — never throws. */
export function applyJsonPatch(doc: JsonValue, patch: JsonPatchOp[]): { ok: true; result: JsonValue } | { ok: false; error: string } {
  let working: JsonValue = JSON.parse(JSON.stringify(doc)) as JsonValue;

  for (const op of patch) {
    if (op.path === "") {
      if (op.op === "remove") return { ok: false, error: "Kök sənəd silinə bilməz." };
      working = op.value;
      continue;
    }
    const resolved = resolveParent(working, op.path);
    if (resolved === null) return { ok: false, error: `Patch yolu tapılmadı: ${op.path}` };
    const { parent, lastToken } = resolved;

    if (Array.isArray(parent)) {
      if (op.op === "remove") {
        const index = Number(lastToken);
        if (!Number.isInteger(index) || index < 0 || index >= parent.length) {
          return { ok: false, error: `Massiv indeksi mövcud deyil: ${op.path}` };
        }
        parent.splice(index, 1);
      } else {
        const index = lastToken === "-" ? parent.length : Number(lastToken);
        if (!Number.isInteger(index) || index < 0 || index > parent.length) {
          return { ok: false, error: `Massiv indeksi mövcud deyil: ${op.path}` };
        }
        if (op.op === "add") parent.splice(index, 0, op.value);
        else parent[index] = op.value;
      }
    } else if (parent !== null && typeof parent === "object") {
      const record = parent as Record<string, JsonValue>;
      if (op.op === "remove") {
        if (!(lastToken in record)) return { ok: false, error: `Açar mövcud deyil: ${op.path}` };
        delete record[lastToken];
      } else {
        record[lastToken] = op.value;
      }
    } else {
      return { ok: false, error: `Patch yolunun valideyni obyekt və ya massiv deyil: ${op.path}` };
    }
  }

  return { ok: true, result: working };
}

export function parseJsonSafe(text: string): { ok: true; value: JsonValue } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "Boş JSON." };
  try {
    return { ok: true, value: JSON.parse(trimmed) as JsonValue };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `JSON düzgün deyil: ${message}` };
  }
}
