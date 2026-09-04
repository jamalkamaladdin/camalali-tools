import type { CheckSuite } from "./harness.mts";
import { buildEnvExample, diffEnv, envToJson, jsonToEnv } from "../lib/env";

export const checks: CheckSuite = (check) => {
  const basic = envToJson("PORT=3000\nNAME=camalali");
  check(
    "known answer: basic KEY=VALUE pairs",
    basic.json === JSON.stringify({ PORT: "3000", NAME: "camalali" }, null, 2),
    `got: ${basic.json}`,
  );

  const exported = envToJson("export TOKEN=abc123");
  check(
    '"export " prefix is stripped from the key',
    exported.entries.length === 1 && exported.entries[0].key === "TOKEN" && exported.entries[0].value === "abc123",
    `got: ${JSON.stringify(exported.entries)}`,
  );

  const unquotedComment = envToJson("PORT=3000 # server portu");
  check(
    "unquoted trailing comment is dropped from the value",
    unquotedComment.entries[0].value === "3000",
    `got: ${JSON.stringify(unquotedComment.entries)}`,
  );

  const quotedHash = envToJson('URL="https://example.com/#bolme"');
  check(
    "a # inside quotes is kept, not treated as a comment",
    quotedHash.entries[0].value === "https://example.com/#bolme",
    `got: ${JSON.stringify(quotedHash.entries)}`,
  );

  const example = buildEnvExample("# top comment\nAPI_KEY=sirr-1234\n\nPORT=3000");
  check(
    ".env.example builder: keys survive, values are cleared, comment kept",
    example.text === "# top comment\nAPI_KEY=\n\nPORT=",
    `got: ${JSON.stringify(example.text)}`,
  );

  const diff = diffEnv("A=1\nB=2\nC=3", "A=1\nB=9\nD=4");
  check(
    "diff: only-in-A, only-in-B and differing values are all reported",
    JSON.stringify(diff.onlyInA) === JSON.stringify(["C"]) &&
      JSON.stringify(diff.onlyInB) === JSON.stringify(["D"]) &&
      diff.sameValue.length === 1 &&
      diff.differentValue.length === 1 &&
      diff.differentValue[0].key === "B",
    `got: ${JSON.stringify(diff)}`,
  );

  const nested = jsonToEnv(JSON.stringify({ A: "1", B: { nested: true } }));
  check(
    "jsonToEnv: nested object is rejected, not silently flattened",
    nested.ok === false,
    `got: ${JSON.stringify(nested)}`,
  );

  const brokenJson = jsonToEnv("{not valid json");
  check(
    "jsonToEnv: invalid JSON syntax returns an error instead of throwing",
    brokenJson.ok === false,
    `got: ${JSON.stringify(brokenJson)}`,
  );

  const original = "API_KEY=sirr\nPORT=3000\nDEBUG=true";
  const asJson = envToJson(original).json;
  const backToEnv = jsonToEnv(asJson);
  const roundTripped = backToEnv.ok ? envToJson(backToEnv.text) : null;
  check(
    "round trip: .env -> JSON -> .env keeps the same key/value pairs",
    backToEnv.ok === true &&
      roundTripped !== null &&
      JSON.stringify(roundTripped.entries) === JSON.stringify(envToJson(original).entries),
    `got: ${JSON.stringify(backToEnv)}`,
  );

  const empty = envToJson("");
  check("boundary: empty .env input produces an empty object", empty.json === "{}", `got: ${empty.json}`);

  const noValue = envToJson("KEY=");
  check(
    "boundary: a key with no value parses to an empty string",
    noValue.entries[0].value === "",
    `got: ${JSON.stringify(noValue.entries)}`,
  );

  const unterminated = envToJson('SECRET="starts but never closes');
  check(
    "unterminated quote is flagged as unsupported, not guessed at",
    unterminated.unsupportedLines.length === 1 && unterminated.entries.length === 0,
    `got: ${JSON.stringify(unterminated)}`,
  );

  const duplicate = envToJson("KEY=first\nKEY=second");
  check(
    "duplicate keys: last value wins and the key is reported",
    duplicate.entries[0].value === "second" && duplicate.duplicateKeys.includes("KEY"),
    `got: ${JSON.stringify(duplicate)}`,
  );
};
