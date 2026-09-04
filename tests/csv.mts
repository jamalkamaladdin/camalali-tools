import type { CheckSuite } from "./harness.mts";
import { detectDelimiter, inspectCsv, parseCsvRows } from "../lib/csv";

export const checks: CheckSuite = (check) => {
  const basic = inspectCsv("name,age\nAli,28\nAygun,31");
  check(
    "known answer: header detected, two typed columns",
    basic.ok &&
      basic.data.hasHeader === true &&
      basic.data.columns[0].type === "text" &&
      basic.data.columns[1].type === "integer",
    `got: ${JSON.stringify(basic)}`,
  );

  check(
    "delimiter detection: semicolon file",
    detectDelimiter("a;b;c\n1;2;3\n4;5;6") === ";",
    `got: ${detectDelimiter("a;b;c\n1;2;3\n4;5;6")}`,
  );

  check(
    "delimiter detection: tab file",
    detectDelimiter("a\tb\n1\t2\n3\t4") === "\t",
    `got: ${JSON.stringify(detectDelimiter("a\tb\n1\t2\n3\t4"))}`,
  );

  const headerless = inspectCsv("1,2\n3,4\n5,6");
  check(
    "header detection: no signal falls back to no header",
    headerless.ok && headerless.data.hasHeader === false && headerless.data.headers[0] === "Sütun 1",
    `got: ${JSON.stringify(headerless)}`,
  );

  const quotedField = parseCsvRows('a,"b,c\nd",e', ",");
  check(
    "RFC 4180: quoted field keeps an embedded delimiter and newline, and does not split the row",
    quotedField.length === 1 && quotedField[0][1] === "b,c\nd",
    `got: ${JSON.stringify(quotedField)}`,
  );

  const escapedQuote = parseCsvRows('a,"b""c",d', ",");
  check(
    'RFC 4180: doubled quote inside a field decodes to one literal quote',
    escapedQuote[0][1] === 'b"c',
    `got: ${JSON.stringify(escapedQuote)}`,
  );

  const malformed = inspectCsv("a,b\n1,2\n3,4\n5,6,7");
  check(
    "malformed row: wrong column count reported with row number",
    malformed.ok &&
      malformed.data.malformedRows.length === 1 &&
      malformed.data.malformedRows[0].row === 4 &&
      malformed.data.malformedRows[0].expectedColumns === 2 &&
      malformed.data.malformedRows[0].actualColumns === 3,
    `got: ${JSON.stringify(malformed.ok ? malformed.data.malformedRows : malformed)}`,
  );

  const blank = inspectCsv("   \n  ");
  check("boundary: blank input is an error", blank.ok === false, `got: ${JSON.stringify(blank)}`);

  const withBlankCell = inspectCsv("a,b\n1,\n2,x");
  check(
    "blank cell counted in blankCount",
    withBlankCell.ok && withBlankCell.data.columns[1].blankCount === 1,
    `got: ${JSON.stringify(withBlankCell)}`,
  );

  const singleRow = inspectCsv("a,b,c");
  check(
    "boundary: a single row has no header signal to compare against, so it is read as one data row",
    singleRow.ok && singleRow.data.rowCount === 1 && singleRow.data.hasHeader === false,
    `got: ${JSON.stringify(singleRow)}`,
  );

  const mixedNumeric = inspectCsv("a\n1\n2\n3.5");
  check(
    "integer + decimal blend resolves to decimal",
    mixedNumeric.ok && mixedNumeric.data.columns[0].type === "decimal",
    `got: ${JSON.stringify(mixedNumeric)}`,
  );

  const withDate = inspectCsv("a,b\n2026-01-01,x\n2026-02-15,y");
  check(
    "known answer: ISO date column detected",
    withDate.ok && withDate.data.columns[0].type === "date",
    `got: ${JSON.stringify(withDate)}`,
  );

  const many = Array.from({ length: 25 }, (_, i) => `${i}`).join("\n");
  const preview = inspectCsv(`n\n${many}`);
  check(
    "preview limited to 20 rows",
    preview.ok && preview.data.preview.length === 20 && preview.data.rowCount === 25,
    `got: ${preview.ok ? preview.data.preview.length : "error"}`,
  );

  const unterminatedQuote = inspectCsv('a,b\n"unterminated,1');
  check(
    "malformed quote does not throw",
    unterminatedQuote.ok === true,
    `got: ${JSON.stringify(unterminatedQuote)}`,
  );
};
