/**
 * JSON-to-type generator: one sample document in, a matching type in five
 * languages out — TypeScript `interface`, a Zod schema, a Go `struct`, a
 * Python `TypedDict` and a Python `dataclass`.
 *
 * The inference happens once, in `buildShape`, as a language-neutral tree;
 * the five functions after it only print that tree in a different syntax, so
 * a rule about *what the type is* (an array's elements merge into one shape,
 * a key missing from some samples is optional, a key that was ever `null`
 * gains `| null`) is written once and every language agrees with it by
 * construction. Nested objects are pulled out into their own named type by
 * `hoist`, depth-first, so `interface Root` never contains another
 * `interface` inline.
 *
 * Worth checking: optional-detection across objects with different key sets,
 * `null`-widening, union merging of mixed array elements, name collisions on
 * hoisted types, and that a bare non-object sample (a lone string or an
 * array of numbers) still produces valid code in all five outputs instead of
 * an empty type.
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/* ---------- language-neutral shape ---------- */

type Atom =
  | { kind: "string" }
  | { kind: "number"; allInteger: boolean }
  | { kind: "boolean" }
  | { kind: "null" }
  | { kind: "unknown" } // no sample ever observed here (e.g. an always-empty array)
  | { kind: "array"; of: Atom[] }
  | { kind: "object"; name: string; fields: FieldShape[] };

type FieldShape = { key: string; type: Atom[]; optional: boolean };

/** Builds the union of atoms describing every value in `values` at one tree position. */
function buildShape(values: JsonValue[], nameHint: string): Atom[] {
  const seen = { string: false, number: false, boolean: false, null: false };
  let allInteger = true;
  const arrays: JsonValue[] = [];
  const objects: Record<string, JsonValue>[] = [];

  for (const value of values) {
    if (value === null) seen.null = true;
    else if (typeof value === "string") seen.string = true;
    else if (typeof value === "boolean") seen.boolean = true;
    else if (typeof value === "number") {
      seen.number = true;
      if (!Number.isInteger(value)) allInteger = false;
    } else if (Array.isArray(value)) arrays.push(...value);
    else objects.push(value as Record<string, JsonValue>);
  }

  const atoms: Atom[] = [];
  if (seen.string) atoms.push({ kind: "string" });
  if (seen.number) atoms.push({ kind: "number", allInteger });
  if (seen.boolean) atoms.push({ kind: "boolean" });
  if (values.some((v) => Array.isArray(v))) atoms.push({ kind: "array", of: buildShape(arrays, singularize(nameHint)) });
  if (objects.length > 0) atoms.push({ kind: "object", name: nameHint, fields: buildFields(objects) });
  if (seen.null) atoms.push({ kind: "null" });
  if (atoms.length === 0) atoms.push({ kind: "unknown" });
  return atoms;
}

function buildFields(objects: Record<string, JsonValue>[]): FieldShape[] {
  const keys = new Set<string>();
  for (const obj of objects) for (const key of Object.keys(obj)) keys.add(key);

  return [...keys].map((key) => {
    const occurrences = objects.filter((obj) => key in obj);
    const values = occurrences.map((obj) => obj[key]);
    return {
      key,
      type: buildShape(values, pascalCase(key)),
      optional: occurrences.length < objects.length,
    };
  });
}

function pascalCase(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9əğıöşüçəĞIÖŞÜÇ]+/g, " ").trim();
  const parts = cleaned.split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return "Field";
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

/** `items` -> `Item`, `addresses` -> `Address` — a plain trailing-`s` strip, not a real English singularizer. */
function singularize(name: string): string {
  if (name.length > 1 && name.endsWith("s") && !name.endsWith("ss")) return name.slice(0, -1);
  return name;
}

export function sanitizeTypeName(raw: string): string {
  const cleaned = pascalCase(raw.trim());
  if (cleaned === "" || /^[0-9]/.test(cleaned)) return `T${cleaned || "Root"}`;
  return cleaned;
}

/* ---------- hoisting: pull every "object" atom out into a named, flat list ---------- */

export type ResolvedAtom =
  | { kind: "string" }
  | { kind: "number"; allInteger: boolean }
  | { kind: "boolean" }
  | { kind: "null" }
  | { kind: "unknown" }
  | { kind: "array"; of: ResolvedAtom[] }
  | { kind: "ref"; name: string };

export type NamedType = { name: string; fields: { key: string; type: ResolvedAtom[]; optional: boolean }[] };

function hoistAtom(atom: Atom, out: NamedType[], usedNames: Set<string>): ResolvedAtom {
  if (atom.kind === "array") return { kind: "array", of: atom.of.map((a) => hoistAtom(a, out, usedNames)) };
  if (atom.kind !== "object") return atom;

  // The name is claimed before recursing, so two sibling fields that both
  // hoist to "Address" don't collide with each other. The record itself is
  // pushed only after its fields are resolved, so any nested object a field
  // hoists lands in `out` before this one — leaf types first, root type
  // last. Zod's `const childSchema = ...` has to exist before a parent's
  // `z.object({ field: childSchema })` references it, which is the reason
  // this order is not just cosmetic.
  const name = uniqueName(atom.name, usedNames);
  const fields = atom.fields.map((field) => ({
    key: field.key,
    optional: field.optional,
    type: field.type.map((a) => hoistAtom(a, out, usedNames)),
  }));
  out.push({ name, fields });
  return { kind: "ref", name };
}

function uniqueName(base: string, used: Set<string>): string {
  let candidate = base === "" ? "Item" : base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

export type ShapeResult = { root: ResolvedAtom[]; types: NamedType[] };

export function shapeFromJson(value: JsonValue, rootName: string): ShapeResult {
  const rootAtoms = Array.isArray(value) ? buildShape([value], `${rootName}Item`) : buildShape([value], rootName);
  const types: NamedType[] = [];
  const used = new Set<string>();
  const root = rootAtoms.map((atom) => hoistAtom(atom, types, used));
  return { root, types };
}

/* ---------- emitters ---------- */

function tsAtom(atom: ResolvedAtom): string {
  switch (atom.kind) {
    case "string": return "string";
    case "number": return "number";
    case "boolean": return "boolean";
    case "null": return "null";
    case "unknown": return "unknown";
    case "ref": return atom.name;
    case "array": {
      const inner = tsUnion(atom.of);
      return atom.of.length > 1 ? `(${inner})[]` : `${inner}[]`;
    }
  }
}
function tsUnion(atoms: ResolvedAtom[]): string {
  return atoms.map(tsAtom).join(" | ");
}

export function toTypeScript(shape: ShapeResult, rootName: string): string {
  const blocks = shape.types.map((type) => {
    const fields = type.fields
      .map((f) => `  ${safeKey(f.key)}${f.optional ? "?" : ""}: ${tsUnion(f.type)};`)
      .join("\n");
    return `interface ${type.name} {\n${fields}\n}`;
  });
  // A root that resolved to a single "ref" atom already has its interface
  // declared above (an object root and its own name are the same type); any
  // other shape — an array of it, a bare primitive, a union — still needs a
  // named alias for the root itself.
  if (shape.root.length !== 1 || shape.root[0].kind !== "ref") {
    blocks.push(`type ${rootName} = ${tsUnion(shape.root)};`);
  }
  return blocks.join("\n\n");
}

function zodAtom(atom: ResolvedAtom): string {
  switch (atom.kind) {
    case "string": return "z.string()";
    case "number": return "z.number()";
    case "boolean": return "z.boolean()";
    case "null": return "z.null()";
    case "unknown": return "z.unknown()";
    case "ref": return schemaVar(atom.name);
    case "array": return `z.array(${zodUnion(atom.of)})`;
  }
}
function zodUnion(atoms: ResolvedAtom[]): string {
  if (atoms.length === 1) return zodAtom(atoms[0]);
  return `z.union([${atoms.map(zodAtom).join(", ")}])`;
}
function schemaVar(name: string): string {
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}Schema`;
}

export function toZod(shape: ShapeResult, rootName: string): string {
  const blocks = shape.types.map((type) => {
    const fields = type.fields
      .map((f) => {
        const expr = zodUnion(f.type);
        return `  ${safeKey(f.key)}: ${expr}${f.optional ? ".optional()" : ""},`;
      })
      .join("\n");
    return `const ${schemaVar(type.name)} = z.object({\n${fields}\n});`;
  });
  if (shape.root.length !== 1 || shape.root[0].kind !== "ref") {
    blocks.push(`const ${schemaVar(rootName)} = ${zodUnion(shape.root)};`);
  }
  return blocks.join("\n\n");
}

function goAtom(atom: ResolvedAtom): string {
  switch (atom.kind) {
    case "string": return "string";
    case "number": return atom.allInteger ? "int64" : "float64";
    case "boolean": return "bool";
    case "null": return "interface{}";
    case "unknown": return "interface{}";
    case "ref": return atom.name;
    case "array": return `[]${goUnion(atom.of)}`;
  }
}
function goUnion(atoms: ResolvedAtom[]): string {
  const nonNull = atoms.filter((a) => a.kind !== "null");
  if (nonNull.length === 1) return goAtom(nonNull[0]);
  if (nonNull.length === 0) return "interface{}";
  return "interface{}"; // Go has no union type — mixed kinds fall back to any, noted at the field
}

export function toGo(shape: ShapeResult, rootName: string): string {
  const blocks = shape.types.map((type) => {
    const fields = type.fields
      .map((f) => {
        const nonNull = f.type.filter((a) => a.kind !== "null");
        const hasNull = f.type.some((a) => a.kind === "null");
        const mixed = nonNull.length > 1;
        let goType = goUnion(f.type);
        if ((hasNull || f.optional) && !mixed && nonNull.length === 1 && nonNull[0].kind !== "ref" && nonNull[0].kind !== "array") {
          goType = `*${goType}`;
        }
        const tag = f.optional ? `\`json:"${f.key},omitempty"\`` : `\`json:"${f.key}"\``;
        const comment = mixed ? " // mixed type in the sample — narrowed to interface{}" : "";
        return `  ${pascalCase(f.key)} ${goType} ${tag}${comment}`;
      })
      .join("\n");
    return `type ${type.name} struct {\n${fields}\n}`;
  });
  if (shape.root.length !== 1 || shape.root[0].kind !== "ref") {
    blocks.push(`type ${rootName} = ${goUnion(shape.root)}`);
  }
  return blocks.join("\n\n");
}

function pyAtom(atom: ResolvedAtom): string {
  switch (atom.kind) {
    case "string": return "str";
    case "number": return atom.allInteger ? "int" : "float";
    case "boolean": return "bool";
    case "null": return "None";
    case "unknown": return "Any";
    case "ref": return atom.name;
    case "array": return `list[${pyUnion(atom.of)}]`;
  }
}
function pyUnion(atoms: ResolvedAtom[]): string {
  return atoms.map(pyAtom).join(" | ");
}

export function toPythonTypedDict(shape: ShapeResult, rootName: string): string {
  const needsNotRequired = shape.types.some((t) => t.fields.some((f) => f.optional));
  const header = [
    "from typing import Any, TypedDict",
    needsNotRequired ? "from typing import NotRequired  # Python 3.11+" : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const blocks = shape.types.map((type) => {
    const fields = type.fields
      .map((f) => {
        const inner = pyUnion(f.type);
        return `    ${safeKey(f.key)}: ${f.optional ? `NotRequired[${inner}]` : inner}`;
      })
      .join("\n");
    return `class ${type.name}(TypedDict):\n${fields || "    pass"}`;
  });
  if (shape.root.length !== 1 || shape.root[0].kind !== "ref") {
    blocks.push(`${rootName} = ${pyUnion(shape.root)}`);
  }
  return [header, "", blocks.join("\n\n")].join("\n");
}

export function toPythonDataclass(shape: ShapeResult, rootName: string): string {
  const blocks = shape.types.map((type) => {
    // dataclass fields without a default cannot follow one that has a default,
    // so required fields are emitted first and optional/nullable ones after.
    const required = type.fields.filter((f) => !f.optional);
    const optional = type.fields.filter((f) => f.optional);
    const lines = [
      ...required.map((f) => `    ${safeKey(f.key)}: ${pyUnion(f.type)}`),
      ...optional.map((f) => `    ${safeKey(f.key)}: ${pyUnion(f.type)} | None = None`),
    ];
    return `@dataclass\nclass ${type.name}:\n${lines.join("\n") || "    pass"}`;
  });
  if (shape.root.length !== 1 || shape.root[0].kind !== "ref") {
    blocks.push(`${rootName} = ${pyUnion(shape.root)}`);
  }
  return ["from dataclasses import dataclass", "", blocks.join("\n\n")].join("\n");
}

function safeKey(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
}

/* ---------- entry point ---------- */

export type GeneratedTypes = {
  typescript: string;
  zod: string;
  go: string;
  pythonTypedDict: string;
  pythonDataclass: string;
};

export function parseJsonSample(text: string): { ok: true; value: JsonValue } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "Boş JSON." };
  try {
    return { ok: true, value: JSON.parse(trimmed) as JsonValue };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `JSON düzgün deyil: ${message}` };
  }
}

export function generateTypesFromJson(text: string, rootTypeName: string): { ok: true; result: GeneratedTypes } | { ok: false; error: string } {
  const parsed = parseJsonSample(text);
  if (!parsed.ok) return parsed;

  const rootName = sanitizeTypeName(rootTypeName || "Root");
  const shape = shapeFromJson(parsed.value, rootName);
  return {
    ok: true,
    result: {
      typescript: toTypeScript(shape, rootName),
      zod: toZod(shape, rootName),
      go: toGo(shape, rootName),
      pythonTypedDict: toPythonTypedDict(shape, rootName),
      pythonDataclass: toPythonDataclass(shape, rootName),
    },
  };
}
