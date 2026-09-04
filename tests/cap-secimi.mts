/*
 * What is worth checking here: the same five answers always return the same
 * verdict (no randomness snuck in), a clear AP-leaning and a clear CP-leaning
 * answer set land where the scoring says they should, a genuine tie between
 * the two sides resolves through the irreversible-operation answer rather
 * than silently picking one, the confidence label's threshold is exact at
 * its boundary, and the static reference tables (known systems, consistency
 * models) have not drifted out of the shape the widget assumes.
 */
import type { CheckSuite } from "./harness.mts";
import {
  CONSISTENCY_MODELS,
  KNOWN_SYSTEMS,
  decideCapSide,
  pacelcChoice,
  type CapAnswers,
} from "../lib/cap-secimi";

const CLEAR_AP: CapAnswers = {
  partitionPreference: "staleData",
  workload: "readHeavy",
  geography: "multiRegion",
  irreversibleOps: false,
  latencyBudget: "tight",
};

const CLEAR_CP: CapAnswers = {
  partitionPreference: "returnError",
  workload: "writeHeavy",
  geography: "singleRegion",
  irreversibleOps: true,
  latencyBudget: "relaxed",
};

/* Every weighted answer cancels exactly: 5 (stale data) - 3 (irreversible) +
   0 (single region) - 1 (relaxed) - 1 (write heavy) = 0. */
const TIE_TOWARD_CP: CapAnswers = {
  partitionPreference: "staleData",
  workload: "writeHeavy",
  geography: "singleRegion",
  irreversibleOps: true,
  latencyBudget: "relaxed",
};

/* -5 (return error) + 0 (not irreversible) + 2 (multi region) + 2 (tight) +
   1 (read heavy) = 0. */
const TIE_TOWARD_AP: CapAnswers = {
  partitionPreference: "returnError",
  workload: "readHeavy",
  geography: "multiRegion",
  irreversibleOps: false,
  latencyBudget: "tight",
};

/* 5 (stale data) - 3 (irreversible) + 0 (single region) - 1 (relaxed) + 1
   (read heavy) = 2 — just under the confidence threshold of 3. */
const BORDERLINE_SCORE_2: CapAnswers = {
  partitionPreference: "staleData",
  workload: "readHeavy",
  geography: "singleRegion",
  irreversibleOps: true,
  latencyBudget: "relaxed",
};

/* Same as above with latency swapped to tight: 5 - 3 + 0 + 2 - 1 = 3 — right
   at the threshold. */
const CLEAR_SCORE_3: CapAnswers = {
  partitionPreference: "staleData",
  workload: "writeHeavy",
  geography: "singleRegion",
  irreversibleOps: true,
  latencyBudget: "tight",
};

export const checks: CheckSuite = (check) => {
  const firstRun = decideCapSide(CLEAR_AP);
  const secondRun = decideCapSide(CLEAR_AP);
  check(
    "cap-secimi: the same five answers always return the same verdict",
    JSON.stringify(firstRun) === JSON.stringify(secondRun),
    `first: ${JSON.stringify(firstRun)}, second: ${JSON.stringify(secondRun)}`,
  );

  const ap = decideCapSide(CLEAR_AP);
  check(
    "cap-secimi: an answer set weighted toward availability lands on AP with high confidence",
    ap.side === "AP" && ap.confidence === "aydın",
    `got: ${JSON.stringify(ap)}`,
  );

  const cp = decideCapSide(CLEAR_CP);
  check(
    "cap-secimi: an answer set weighted toward consistency lands on CP with high confidence",
    cp.side === "CP" && cp.confidence === "aydın",
    `got: ${JSON.stringify(cp)}`,
  );

  const tieCp = decideCapSide(TIE_TOWARD_CP);
  check(
    "cap-secimi: a genuine tie (score 0) with an irreversible operation resolves to CP through the tie-break",
    tieCp.score === 0 && tieCp.tieBreak && tieCp.side === "CP",
    `got: ${JSON.stringify(tieCp)}`,
  );

  const tieAp = decideCapSide(TIE_TOWARD_AP);
  check(
    "cap-secimi: a genuine tie (score 0) without an irreversible operation resolves to AP through the tie-break",
    tieAp.score === 0 && tieAp.tieBreak && tieAp.side === "AP",
    `got: ${JSON.stringify(tieAp)}`,
  );

  const borderline = decideCapSide(BORDERLINE_SCORE_2);
  check(
    "cap-secimi: a score of 2 (below the threshold of 3) is reported as a borderline call, not a clear one",
    borderline.score === 2 && borderline.confidence === "sərhəd hal",
    `got: ${JSON.stringify(borderline)}`,
  );

  const clear3 = decideCapSide(CLEAR_SCORE_3);
  check(
    "cap-secimi: a score of 3 (at the threshold) is reported as a clear call",
    clear3.score === 3 && clear3.confidence === "aydın",
    `got: ${JSON.stringify(clear3)}`,
  );

  check(
    "cap-secimi: every answer set produces exactly one reason per question, never fewer",
    decideCapSide(CLEAR_AP).reasons.length === 5 && decideCapSide(TIE_TOWARD_CP).reasons.length === 5,
    `got: ${decideCapSide(CLEAR_AP).reasons.length}`,
  );

  const stanceValues = new Set(KNOWN_SYSTEMS.map((system) => system.stance));
  check(
    "cap-secimi: known systems table lists six systems, each stanced CP or AP and nothing else",
    KNOWN_SYSTEMS.length === 6 &&
      [...stanceValues].every((stance) => stance === "CP" || stance === "AP"),
    `count: ${KNOWN_SYSTEMS.length}, stances: ${JSON.stringify([...stanceValues])}`,
  );

  const modelIds = CONSISTENCY_MODELS.map((model) => model.id);
  check(
    "cap-secimi: consistency model table lists the four named models in order",
    JSON.stringify(modelIds) === JSON.stringify(["strong", "read-your-writes", "monotonic-read", "eventual"]),
    `got: ${JSON.stringify(modelIds)}`,
  );

  check(
    "cap-secimi: PACELC picks latency when the latency budget is tight, and consistency otherwise, regardless of the other four answers",
    pacelcChoice(CLEAR_AP) === "EL" && pacelcChoice(CLEAR_CP) === "EC",
    `tight: ${pacelcChoice(CLEAR_AP)}, relaxed: ${pacelcChoice(CLEAR_CP)}`,
  );
};
