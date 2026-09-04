import type { CheckSuite } from "./harness.mts";
import {
  differenceLists,
  intersectLists,
  joinList,
  outputSeparatorOf,
  runPipeline,
} from "../lib/siyahi";

export const checks: CheckSuite = (check) => {
  check(
    "known answer: dedupe keeps first occurrence order",
    JSON.stringify(runPipeline(["a", "b", "a", "c", "b"], [{ kind: "dedupe" }])) ===
      JSON.stringify(["a", "b", "c"]),
    `got: ${JSON.stringify(runPipeline(["a", "b", "a", "c", "b"], [{ kind: "dedupe" }]))}`,
  );

  const azSorted = runPipeline(["c", "ç", "b"], [{ kind: "sort", by: "alpha", direction: "asc" }]);
  check(
    "Azerbaijani alphabetic sort places ç right after c",
    JSON.stringify(azSorted) === JSON.stringify(["b", "c", "ç"]),
    `got: ${JSON.stringify(azSorted)}`,
  );

  const numericSorted = runPipeline(
    ["10", "2", "x", "1"],
    [{ kind: "sort", by: "numeric", direction: "asc" }],
  );
  check(
    "numeric sort: unparseable items keep their place at the end",
    JSON.stringify(numericSorted) === JSON.stringify(["1", "2", "10", "x"]),
    `got: ${JSON.stringify(numericSorted)}`,
  );

  const lengthSorted = runPipeline(["bb", "a", "ccc"], [{ kind: "sort", by: "length", direction: "asc" }]);
  check(
    "length sort: ascending by code-point count",
    JSON.stringify(lengthSorted) === JSON.stringify(["a", "bb", "ccc"]),
    `got: ${JSON.stringify(lengthSorted)}`,
  );

  check(
    "known answer: reverse",
    JSON.stringify(runPipeline(["a", "b", "c"], [{ kind: "reverse" }])) === JSON.stringify(["c", "b", "a"]),
    `got: ${JSON.stringify(runPipeline(["a", "b", "c"], [{ kind: "reverse" }]))}`,
  );

  const shuffled = runPipeline(["a", "b", "c", "d", "e"], [{ kind: "shuffle", seed: 42 }]);
  check(
    "shuffle: same seed is deterministic and stays a permutation of the input",
    JSON.stringify([...shuffled].sort()) === JSON.stringify(["a", "b", "c", "d", "e"]) &&
      JSON.stringify(shuffled) ===
        JSON.stringify(runPipeline(["a", "b", "c", "d", "e"], [{ kind: "shuffle", seed: 42 }])),
    `got: ${JSON.stringify(shuffled)}`,
  );

  check(
    "boundary: drop-blank removes only whitespace-only items",
    JSON.stringify(runPipeline(["a", "", "  ", "b"], [{ kind: "drop-blank" }])) ===
      JSON.stringify(["a", "b"]),
    `got: ${JSON.stringify(runPipeline(["a", "", "  ", "b"], [{ kind: "drop-blank" }]))}`,
  );

  check(
    "trim strips leading and trailing whitespace per item",
    JSON.stringify(runPipeline(["  a  ", "b"], [{ kind: "trim" }])) === JSON.stringify(["a", "b"]),
    `got: ${JSON.stringify(runPipeline(["  a  ", "b"], [{ kind: "trim" }]))}`,
  );

  check(
    "prefix and suffix apply to every item",
    JSON.stringify(
      runPipeline(["a", "b"], [
        { kind: "prefix", text: "> " },
        { kind: "suffix", text: "!" },
      ]),
    ) === JSON.stringify(["> a!", "> b!"]),
    `got: ${JSON.stringify(runPipeline(["a", "b"], [{ kind: "prefix", text: "> " }, { kind: "suffix", text: "!" }]))}`,
  );

  check(
    "numbering reflects position at the time the step runs",
    JSON.stringify(runPipeline(["b", "a"], [{ kind: "number" }])) === JSON.stringify(["1. b", "2. a"]),
    `got: ${JSON.stringify(runPipeline(["b", "a"], [{ kind: "number" }]))}`,
  );

  check(
    'Azerbaijani case trap: locale-aware lowercase splits dotted and dotless I correctly',
    runPipeline(["İ", "I"], [{ kind: "case", mode: "lower" }]).join(",") === "i,ı",
    `got: ${JSON.stringify(runPipeline(["İ", "I"], [{ kind: "case", mode: "lower" }]))}`,
  );

  check(
    "separator step changes the final join character, and the default with no step is newline",
    joinList(runPipeline(["a", "b"], [{ kind: "separator", join: "comma" }]), "comma") === "a, b" &&
      outputSeparatorOf([]) === "newline",
    `got: ${joinList(runPipeline(["a", "b"], [{ kind: "separator", join: "comma" }]), "comma")}`,
  );

  const intersection = intersectLists(["a", "b", "c"], ["b", "c", "d"]);
  const difference = differenceLists(["a", "b", "c"], ["b", "c", "d"]);
  check(
    "known answer: intersection and difference of two lists",
    JSON.stringify(intersection) === JSON.stringify(["b", "c"]) &&
      JSON.stringify(difference) === JSON.stringify(["a"]),
    `intersection: ${JSON.stringify(intersection)}, difference: ${JSON.stringify(difference)}`,
  );

  const numberThenSort = runPipeline(["b", "a"], [
    { kind: "number" },
    { kind: "sort", by: "alpha", direction: "asc" },
  ]);
  const sortThenNumber = runPipeline(["b", "a"], [
    { kind: "sort", by: "alpha", direction: "asc" },
    { kind: "number" },
  ]);
  check(
    "step order changes the result: number-then-sort differs from sort-then-number",
    JSON.stringify(numberThenSort) !== JSON.stringify(sortThenNumber) &&
      JSON.stringify(sortThenNumber) === JSON.stringify(["1. a", "2. b"]),
    `number-then-sort: ${JSON.stringify(numberThenSort)}, sort-then-number: ${JSON.stringify(sortThenNumber)}`,
  );
};
