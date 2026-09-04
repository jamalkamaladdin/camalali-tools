/*
 * What is worth checking: a known JSON/CSV pair converts correctly in both
 * directions, a JSON → CSV → JSON round trip preserves a nested object once
 * `inferTypes` is on, a field carrying the delimiter and a quote survives
 * RFC 4180 quoting, an array value is kept as a single JSON-string cell
 * rather than exploded, and every malformed shape (non-array JSON root, a
 * non-object array element, an unterminated quote, a short row) comes back
 * as `{ ok: false }` rather than throwing.
 */
import type { CheckSuite } from "./harness.mts";
import { csvToJson, jsonToCsv, type CsvDelimiter } from "../lib/json-csv";

const COMMA: CsvDelimiter = ",";

export const checks: CheckSuite = (check) => {
  const basic = jsonToCsv(JSON.stringify([{ ad: "Ali", yas: 30 }, { ad: "Aygun", yas: 25 }]), {
    delimiter: COMMA,
  });
  check(
    "json-csv: known array of two objects becomes a two-row CSV with the right header",
    basic.ok && basic.output === "ad,yas\r\nAli,30\r\nAygun,25",
    `got: ${JSON.stringify(basic)}`,
  );

  const backToJson = basic.ok
    ? csvToJson(basic.output, { delimiter: COMMA, inferTypes: true })
    : { ok: false as const, error: "n/a" };
  check(
    "json-csv: the CSV produced above converts back to the original values with inferTypes on",
    backToJson.ok &&
      JSON.stringify(backToJson.value) === JSON.stringify([{ ad: "Ali", yas: 30 }, { ad: "Aygun", yas: 25 }]),
    `got: ${JSON.stringify(backToJson)}`,
  );

  const nested = { user: { name: "Ali", address: { city: "Baki" } }, active: true };
  const nestedCsv = jsonToCsv(JSON.stringify([nested]), { delimiter: COMMA });
  const nestedBack = nestedCsv.ok
    ? csvToJson(nestedCsv.output, { delimiter: COMMA, inferTypes: true })
    : { ok: false as const, error: "n/a" };
  check(
    "json-csv: a three-level nested object round-trips through dotted columns",
    nestedCsv.ok &&
      nestedCsv.columns.join(",") === "user.name,user.address.city,active" &&
      nestedBack.ok &&
      JSON.stringify(nestedBack.value) === JSON.stringify([nested]),
    `csv: ${JSON.stringify(nestedCsv)}, back: ${JSON.stringify(nestedBack)}`,
  );

  const arrayField = jsonToCsv(JSON.stringify([{ id: 1, tags: ["a", "b"] }]), { delimiter: COMMA });
  check(
    "json-csv: an array value is kept as a single JSON-string cell, not exploded into rows",
    arrayField.ok && arrayField.output.includes('"[""a"",""b""]"'),
    `got: ${JSON.stringify(arrayField)}`,
  );

  const quotedField = jsonToCsv(JSON.stringify([{ note: 'has a "quote", and a comma' }]), {
    delimiter: COMMA,
  });
  const quotedBack = quotedField.ok
    ? csvToJson(quotedField.output, { delimiter: COMMA, inferTypes: false })
    : { ok: false as const, error: "n/a" };
  check(
    "json-csv: a field with a quote and the delimiter survives RFC 4180 quoting round-trip",
    quotedField.ok &&
      quotedBack.ok &&
      (quotedBack.value[0] as Record<string, unknown>).note === 'has a "quote", and a comma',
    `csv: ${JSON.stringify(quotedField)}, back: ${JSON.stringify(quotedBack)}`,
  );

  const emptyArray = jsonToCsv("[]", { delimiter: COMMA });
  check(
    "json-csv: an empty JSON array produces empty CSV output rather than an error",
    emptyArray.ok && emptyArray.output === "" && emptyArray.rowCount === 0,
    `got: ${JSON.stringify(emptyArray)}`,
  );

  const singleColumn = csvToJson("ad\nAli\nAygun", { delimiter: COMMA, inferTypes: false });
  check(
    "json-csv: a single-column CSV converts to an array of single-key objects",
    singleColumn.ok && singleColumn.value.length === 2 && singleColumn.columns.length === 1,
    `got: ${JSON.stringify(singleColumn)}`,
  );

  const notArray = jsonToCsv(JSON.stringify({ a: 1 }), { delimiter: COMMA });
  check(
    "json-csv: a JSON object at the root (not an array) returns an error rather than throwing",
    notArray.ok === false && notArray.error.length > 0,
    `got: ${JSON.stringify(notArray)}`,
  );

  const notObjectElement = jsonToCsv(JSON.stringify([1, 2, 3]), { delimiter: COMMA });
  check(
    "json-csv: an array of primitives (not objects) returns an error naming the bad element",
    notObjectElement.ok === false && notObjectElement.error.includes("1-ci"),
    `got: ${JSON.stringify(notObjectElement)}`,
  );

  const unterminatedQuote = csvToJson('ad,yas\n"Ali,30', { delimiter: COMMA, inferTypes: false });
  check(
    "json-csv: an unterminated quoted field returns an error rather than throwing",
    unterminatedQuote.ok === false && typeof unterminatedQuote.error === "string",
    `got: ${JSON.stringify(unterminatedQuote)}`,
  );

  const raggedRow = csvToJson("ad,yas\nAli,30,extra", { delimiter: COMMA, inferTypes: false });
  check(
    "json-csv: a data row with more columns than the header returns a line-numbered error",
    raggedRow.ok === false && raggedRow.line === 2,
    `got: ${JSON.stringify(raggedRow)}`,
  );

  const typedOff = csvToJson("id,active\n1,true", { delimiter: COMMA, inferTypes: false });
  const typedOn = csvToJson("id,active\n1,true", { delimiter: COMMA, inferTypes: true });
  check(
    "json-csv: inferTypes off keeps every cell a string, inferTypes on reads number and boolean",
    typedOff.ok &&
      typedOn.ok &&
      (typedOff.value[0] as Record<string, unknown>).id === "1" &&
      (typedOn.value[0] as Record<string, unknown>).id === 1 &&
      (typedOn.value[0] as Record<string, unknown>).active === true,
    `off: ${JSON.stringify(typedOff)}, on: ${JSON.stringify(typedOn)}`,
  );

  const semicolon = jsonToCsv(JSON.stringify([{ a: "1;2", b: "x" }]), { delimiter: ";" });
  check(
    "json-csv: a value containing the semicolon delimiter is quoted when the delimiter is ;",
    semicolon.ok && semicolon.output.includes('"1;2"'),
    `got: ${JSON.stringify(semicolon)}`,
  );
};
