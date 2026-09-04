/*
 * What is worth checking: a known JSON/TOML pair converts both ways, a
 * TOML -> JSON -> TOML round trip over tables, a nested table and an array
 * of tables agrees structurally, an inline array spanning several physical
 * lines parses the same as one on a single line, a date literal is kept as
 * a plain string rather than parsed into some other shape, and every
 * refused construct (triple-quoted string, duplicate key, unterminated
 * string, `inf`) comes back as `{ ok: false }` with a line rather than
 * throwing.
 */
import type { CheckSuite } from "./harness.mts";
import { jsonToToml, tomlToJson } from "../lib/json-toml";

export const checks: CheckSuite = (check) => {
  const known = tomlToJson('ad = "Ali"\nyas = 30\naktiv = true');
  check(
    "json-toml: a known flat table converts to the matching JSON object",
    known.ok && JSON.stringify(known.value) === JSON.stringify({ ad: "Ali", yas: 30, aktiv: true }),
    `got: ${JSON.stringify(known)}`,
  );

  const nestedTable = tomlToJson("[server]\nhost = \"localhost\"\nport = 8080");
  check(
    "json-toml: a [table] header nests its keys under that table name",
    nestedTable.ok &&
      JSON.stringify(nestedTable.value) === JSON.stringify({ server: { host: "localhost", port: 8080 } }),
    `got: ${JSON.stringify(nestedTable)}`,
  );

  const arrayOfTables = tomlToJson('[[fruits]]\nname = "apple"\n\n[[fruits]]\nname = "banana"');
  check(
    "json-toml: repeated [[table]] headers build an array of objects",
    arrayOfTables.ok &&
      JSON.stringify(arrayOfTables.value) === JSON.stringify({ fruits: [{ name: "apple" }, { name: "banana" }] }),
    `got: ${JSON.stringify(arrayOfTables)}`,
  );

  const original = { a: 1, b: { c: 2 }, d: [{ x: 1 }, { x: 2 }] };
  const asToml = jsonToToml(JSON.stringify(original));
  const backToJson = asToml.ok ? tomlToJson(asToml.output) : { ok: false as const, error: "n/a" };
  check(
    "json-toml: JSON -> TOML -> JSON round-trips a scalar, a nested table and an array of tables",
    asToml.ok && backToJson.ok && JSON.stringify(backToJson.value) === JSON.stringify(original),
    `toml: ${JSON.stringify(asToml)}, back: ${JSON.stringify(backToJson)}`,
  );

  const multilineArray = tomlToJson("nums = [\n  1,\n  2,\n  3,\n]");
  const singleLineArray = tomlToJson("nums = [1, 2, 3]");
  check(
    "json-toml: an inline array spanning several physical lines parses the same as one on a single line",
    multilineArray.ok &&
      singleLineArray.ok &&
      JSON.stringify(multilineArray.value) === JSON.stringify(singleLineArray.value),
    `multi: ${JSON.stringify(multilineArray)}, single: ${JSON.stringify(singleLineArray)}`,
  );

  const dateField = tomlToJson("gun = 2026-09-04\nan = 2026-09-04T10:30:00Z");
  check(
    "json-toml: a date/datetime literal is kept as the exact string written, not parsed further",
    dateField.ok &&
      (dateField.value as Record<string, unknown>).gun === "2026-09-04" &&
      (dateField.value as Record<string, unknown>).an === "2026-09-04T10:30:00Z",
    `got: ${JSON.stringify(dateField)}`,
  );

  const nestedUnderArray = tomlToJson('[[fruits]]\nname = "apple"\n[fruits.physical]\ncolor = "red"');
  check(
    "json-toml: a [table] nested under the current array-of-tables element attaches to that element",
    nestedUnderArray.ok &&
      JSON.stringify(nestedUnderArray.value) ===
        JSON.stringify({ fruits: [{ name: "apple", physical: { color: "red" } }] }),
    `got: ${JSON.stringify(nestedUnderArray)}`,
  );

  const tripleQuoted = tomlToJson('a = """multi\nline"""');
  check(
    "json-toml: a triple-quoted multi-line string is refused by name rather than mistranslated",
    tripleQuoted.ok === false && tripleQuoted.error.includes('"""'),
    `got: ${JSON.stringify(tripleQuoted)}`,
  );

  const infinite = tomlToJson("a = inf");
  check(
    "json-toml: inf is refused because JSON has no infinity value",
    infinite.ok === false,
    `got: ${JSON.stringify(infinite)}`,
  );

  const duplicateKey = tomlToJson('a = 1\na = 2');
  check(
    "json-toml: a key redefined in the same table returns an error rather than silently overwriting",
    duplicateKey.ok === false && duplicateKey.line === 2,
    `got: ${JSON.stringify(duplicateKey)}`,
  );

  const unterminated = tomlToJson('a = "unterminated');
  check(
    "json-toml: an unterminated string returns an error rather than throwing",
    unterminated.ok === false && typeof unterminated.error === "string",
    `got: ${JSON.stringify(unterminated)}`,
  );

  const rootArray = jsonToToml("[1, 2, 3]");
  check(
    "json-toml: a JSON array at the root is refused — TOML documents are always a table",
    rootArray.ok === false,
    `got: ${JSON.stringify(rootArray)}`,
  );

  const nullField = jsonToToml(JSON.stringify({ a: null }));
  check(
    "json-toml: a null value is refused rather than written as an invalid TOML token",
    nullField.ok === false,
    `got: ${JSON.stringify(nullField)}`,
  );
};
