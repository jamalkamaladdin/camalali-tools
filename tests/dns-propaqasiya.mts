import type { CheckSuite } from "./harness.mts";
import {
  answersEqual,
  buildVerdict,
  formatMxAnswer,
  normalizeAnswers,
  summarizeStatuses,
  type ResolverResult,
} from "../lib/dns-propaqasiya";

/** A fabricated resolver row — `status: "ok"`, `kind: "caching"` unless overridden. */
function row(overrides: Partial<ResolverResult> & Pick<ResolverResult, "id" | "label">): ResolverResult {
  return {
    address: "0.0.0.0",
    kind: "caching",
    status: "ok",
    answers: [],
    ttlSeconds: null,
    ms: 10,
    ...overrides,
  };
}

export const checks: CheckSuite = (check) => {
  const allAgree = [
    row({ id: "a", label: "Google", answers: ["1.1.1.1"] }),
    row({ id: "b", label: "Cloudflare", answers: ["1.1.1.1"] }),
    row({ id: "c", label: "Quad9", answers: ["1.1.1.1"] }),
  ];
  check(
    "identical answers from every resolver read as agreement",
    buildVerdict(allAgree).kind === "agree",
    `got: ${JSON.stringify(buildVerdict(allAgree))}`,
  );

  const rotated = [
    row({ id: "a", label: "Google", answers: ["1.1.1.1", "2.2.2.2"] }),
    row({ id: "b", label: "Cloudflare", answers: ["2.2.2.2", "1.1.1.1"] }),
  ];
  check(
    "the same two addresses in a different order still agree — the round-robin case",
    buildVerdict(rotated).kind === "agree",
    `got: ${JSON.stringify(buildVerdict(rotated))}`,
  );

  const oneOff = [
    row({ id: "a", label: "Google", answers: ["1.1.1.1"] }),
    row({ id: "b", label: "Cloudflare", answers: ["1.1.1.1"] }),
    row({ id: "c", label: "Quirky", answers: ["9.9.9.9"] }),
  ];
  const oneOffVerdict = buildVerdict(oneOff);
  check(
    "one differing resolver produces a disagreement naming it",
    oneOffVerdict.kind === "disagree" &&
      oneOffVerdict.differing.length === 1 &&
      oneOffVerdict.differing[0] === "Quirky",
    `got: ${JSON.stringify(oneOffVerdict)}`,
  );

  const withTimeout = [
    row({ id: "a", label: "Google", answers: ["1.1.1.1"] }),
    row({ id: "b", label: "Cloudflare", answers: ["1.1.1.1"] }),
    row({ id: "c", label: "Slow", status: "timeout" }),
  ];
  check(
    "a timed-out resolver is excluded rather than counted as a disagreement",
    buildVerdict(withTimeout).kind === "agree",
    `got: ${JSON.stringify(buildVerdict(withTimeout))}`,
  );

  const summary = summarizeStatuses([
    row({ id: "a", label: "Empty", status: "ok", answers: [] }),
    row({ id: "b", label: "Slow", status: "timeout" }),
  ]);
  check(
    "an empty answer set is distinguished from a timeout",
    summary.ok === 1 && summary.timeout === 1,
    `got: ${JSON.stringify(summary)}`,
  );

  const emptyVsFull = buildVerdict([
    row({ id: "a", label: "Empty", answers: [] }),
    row({ id: "b", label: "Full", answers: ["1.1.1.1"] }),
  ]);
  check(
    "an empty answer set still disagrees with a populated one",
    emptyVsFull.kind === "disagree",
    `got: ${JSON.stringify(emptyVsFull)}`,
  );

  const authAhead = [
    row({ id: "ns1", label: "ns1.example.com", kind: "authoritative", answers: ["2.2.2.2"] }),
    row({ id: "a", label: "Google", answers: ["1.1.1.1"], ttlSeconds: 300 }),
    row({ id: "b", label: "Cloudflare", answers: ["1.1.1.1"], ttlSeconds: 120 }),
  ];
  const authAheadVerdict = buildVerdict(authAhead);
  check(
    "authoritative already holding the new answer reads as the change being live, caches behind",
    authAheadVerdict.kind === "disagree" &&
      authAheadVerdict.maxWaitSeconds === 300 &&
      authAheadVerdict.message.includes("mötəbər"),
    `got: ${JSON.stringify(authAheadVerdict)}`,
  );

  const notSynced = [
    row({ id: "ns1", label: "ns1.example.com", kind: "authoritative", answers: ["2.2.2.2"] }),
    row({ id: "ns2", label: "ns2.example.com", kind: "authoritative", answers: ["1.1.1.1"] }),
    row({ id: "a", label: "Google", answers: ["1.1.1.1"] }),
  ];
  const notSyncedVerdict = buildVerdict(notSynced);
  check(
    "authoritative servers disagreeing with EACH OTHER reads differently from caches lagging behind them",
    notSyncedVerdict.kind === "not-synced" && notSyncedVerdict.kind !== authAheadVerdict.kind,
    `got: ${JSON.stringify(notSyncedVerdict)}`,
  );

  const ttlMissing = buildVerdict([
    row({ id: "ns1", label: "ns1.example.com", kind: "authoritative", answers: ["new"] }),
    row({ id: "a", label: "Google", answers: ["old"] }),
  ]);
  check(
    "a record type carrying no TTL reports the wait as unavailable, never as zero",
    ttlMissing.kind === "disagree" && ttlMissing.maxWaitSeconds === null,
    `got: ${JSON.stringify(ttlMissing)}`,
  );

  const mxSwapped = buildVerdict([
    row({
      id: "a",
      label: "Google",
      answers: [formatMxAnswer(10, "mail1.example.com"), formatMxAnswer(20, "mail2.example.com")],
    }),
    row({
      id: "b",
      label: "Cloudflare",
      answers: [formatMxAnswer(20, "mail1.example.com"), formatMxAnswer(10, "mail2.example.com")],
    }),
  ]);
  check(
    "the same MX hosts with swapped priorities is a disagreement, not a rotation",
    mxSwapped.kind === "disagree",
    `got: ${JSON.stringify(mxSwapped)}`,
  );

  check(
    "an empty resolver list is a stated error, never an 'all agree' verdict",
    buildVerdict([]).kind === "no-data",
    `got: ${JSON.stringify(buildVerdict([]))}`,
  );

  check(
    "normalizeAnswers dedupes and sorts, so a resolver repeating an answer cannot fake a difference",
    answersEqual(["1.1.1.1", "1.1.1.1", "2.2.2.2"], ["2.2.2.2", "1.1.1.1"]) &&
      normalizeAnswers(["1.1.1.1", "1.1.1.1", "2.2.2.2"]).length === 2,
    `got: ${JSON.stringify(normalizeAnswers(["1.1.1.1", "1.1.1.1", "2.2.2.2"]))}`,
  );
};
