/*
 * The two cases with a literal expected word list ("XMLHttpRequest" and
 * "getHTTPResponse") are not this file's own opinion — they are the exact
 * examples the task that commissioned this tool specified as the correct
 * split, so they serve as the external reference the harness convention
 * asks every algorithmic check file to have at least two of.
 */
import type { CheckSuite } from "./harness.mts";
import { convertName, splitWords } from "../lib/ad-formati";

export const checks: CheckSuite = (check) => {
  const xmlWords = splitWords("XMLHttpRequest");
  check(
    "ad-formati: XMLHttpRequest splits into the three words the spec names, acronym boundary included",
    JSON.stringify(xmlWords) === JSON.stringify(["XML", "Http", "Request"]),
    `got ${JSON.stringify(xmlWords)}`,
  );

  const httpWords = splitWords("getHTTPResponse").map((w) => w.toLowerCase());
  check(
    "ad-formati: getHTTPResponse splits into get, http, response",
    JSON.stringify(httpWords) === JSON.stringify(["get", "http", "response"]),
    `got ${JSON.stringify(httpWords)}`,
  );

  const alreadySnake = convertName("user_id_number");
  check(
    "ad-formati: an already snake_case input round-trips to the same snake_case",
    alreadySnake?.snake_case === "user_id_number",
    `got ${JSON.stringify(alreadySnake)}`,
  );

  const mixed = convertName("some-mixed_Name");
  check(
    "ad-formati: a mixed kebab+snake+Pascal input still lands on the right words",
    mixed?.snake_case === "some_mixed_name" && mixed?.PascalCase === "SomeMixedName",
    `got ${JSON.stringify(mixed)}`,
  );

  const singleWord = convertName("Password");
  check(
    "ad-formati: a single word has no boundary to insert and converts cleanly",
    singleWord?.camelCase === "password" && singleWord?.CONSTANT_CASE === "PASSWORD",
    `got ${JSON.stringify(singleWord)}`,
  );

  const empty = convertName("");
  check(
    "ad-formati: empty input produces no conversions rather than nine empty strings",
    empty === null,
    `got ${JSON.stringify(empty)}`,
  );

  const numeric = convertName("user2Name");
  check(
    "ad-formati: a digit between two letters becomes its own word, not glued to either side",
    numeric?.["kebab-case"] === "user-2-name",
    `got ${JSON.stringify(numeric)}`,
  );

  const azerbaijaniLetter = convertName("istifadəçi ad");
  check(
    "ad-formati: an Azerbaijani letter (schwa) uppercases to its own dedicated capital in CONSTANT_CASE",
    azerbaijaniLetter?.CONSTANT_CASE === "ISTIFADƏÇI_AD",
    `got ${JSON.stringify(azerbaijaniLetter)}`,
  );

  const punctuationOnly = convertName("!!!");
  check(
    "ad-formati: punctuation-only input has no letters or digits to build a word from",
    punctuationOnly === null,
    `got ${JSON.stringify(punctuationOnly)}`,
  );
};
