/**
 * Whether the world's DNS resolvers already agree on a name — the judging
 * half of the propagation checker. The asking half (opening `Resolver`
 * instances, pointing them at fixed addresses, walking the zone's own NS
 * records to find its authoritative servers) lives in the route, because it
 * needs `node:dns/promises` and a network. Nothing that needs a network is
 * testable offline, so every judgement is made here instead, over a plain
 * list of already-fetched results — which is what
 * `scripts/tools-checks/dns-propaqasiya.mts` proves.
 *
 * Two decisions carry the whole file:
 *
 * - Answers are compared as SETS, never as ordered lists. A resolver rotating
 *   round-robin A records is not a disagreement, and `normalizeAnswers`
 *   (dedupe, sort) is what keeps a rotation from reading as one.
 *
 * - A disagreement is not one verdict, it is two, and they call for opposite
 *   next steps. When the zone's own authoritative servers agree with each
 *   other but differ from the caching resolvers, the change is already live
 *   at the source and the only honest thing left to report is how long the
 *   caches have left to hold the old answer — `"disagree"`. When the
 *   authoritative servers do not even agree with EACH OTHER, waiting will
 *   not fix anything: the zone itself has not finished propagating between
 *   its own nameservers, which is a different problem with a different fix
 *   — `"not-synced"`. Collapsing the two into one "resolvers disagree"
 *   message would send somebody to wait out a TTL that was never the cause.
 */
import { formatDuration } from "../shared/az-date";

/** The seven types a visitor can ask about, in the order the widget lists them. */
export const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA"] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  A: "A — IPv4 ünvanı",
  AAAA: "AAAA — IPv6 ünvanı",
  CNAME: "CNAME — başqa ada yönləndirmə",
  MX: "MX — poçt serveri",
  TXT: "TXT — sərbəst mətn (SPF, DMARC, sahiblik)",
  NS: "NS — zonanın ad serverləri",
  SOA: "SOA — zonanın başlanğıc qeydi",
};

export function isRecordType(value: string): value is RecordType {
  return (RECORD_TYPES as readonly string[]).includes(value);
}

/** Caching resolvers answer from what they last fetched; authoritative rows answer from the zone itself. */
export type ResolverKind = "caching" | "authoritative";

export const RESOLVER_KIND_LABELS: Record<ResolverKind, string> = {
  caching: "keş server",
  authoritative: "mötəbər server",
};

export type ResolverStatus = "ok" | "timeout" | "error";

export type ResolverResult = {
  id: string;
  label: string;
  address: string;
  kind: ResolverKind;
  status: ResolverStatus;
  /**
   * The answer, one string per record — already formatted the way it should
   * be compared (see `formatMxAnswer`). An empty array under `status: "ok"`
   * is NODATA: a real, comparable answer, not a missing one.
   */
  answers: string[];
  /** Seconds, or null when this record type carries no TTL through the API — never 0. */
  ttlSeconds: number | null;
  ms: number | null;
  /** Set only for `status: "error"` — an Azerbaijani sentence shown as written. */
  message?: string;
};

export type StatusSummary = { ok: number; timeout: number; error: number };

/** How many resolvers answered, timed out, or errored — the at-a-glance line above the table. */
export function summarizeStatuses(results: readonly ResolverResult[]): StatusSummary {
  const summary: StatusSummary = { ok: 0, timeout: 0, error: 0 };
  for (const result of results) summary[result.status] += 1;
  return summary;
}

/**
 * An MX answer is its exchange host AND its preference number together — two
 * resolvers reporting the same two hosts with priorities swapped are NOT
 * reporting the same configuration, and collapsing them into one set entry
 * would hide exactly the kind of edit this tool exists to catch.
 */
export function formatMxAnswer(priority: number, exchange: string): string {
  return `${priority} ${exchange.toLowerCase().replace(/\.$/, "")}`;
}

/** Case-folded, trimmed, trailing-dot-stripped — a zone file writes a name either way and it is the same name. */
export function normalizeHostAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

/**
 * De-duplicated and sorted. This is the whole of "compare as a set, not as
 * an ordered list": two answer lists that reduce to the same sorted array
 * here are the same answer everywhere below, however the resolvers happened
 * to order their round-robin rotation.
 */
export function normalizeAnswers(answers: readonly string[]): string[] {
  return Array.from(new Set(answers.map((value) => value.trim()))).sort((a, b) =>
    a.localeCompare(b, "en"),
  );
}

/** Order-independent equality over two answer lists. */
export function answersEqual(a: readonly string[], b: readonly string[]): boolean {
  const left = normalizeAnswers(a);
  const right = normalizeAnswers(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

type AnswerGroup = { answers: string[]; results: ResolverResult[] };

/** Buckets results that answered the same thing, once each answer list is normalized. */
function groupByAnswer(results: readonly ResolverResult[]): AnswerGroup[] {
  const groups = new Map<string, AnswerGroup>();
  for (const result of results) {
    const normalized = normalizeAnswers(result.answers);
    const key = JSON.stringify(normalized);
    const existing = groups.get(key);
    if (existing) {
      existing.results.push(result);
    } else {
      groups.set(key, { answers: normalized, results: [result] });
    }
  }
  return [...groups.values()];
}

export type PropagationVerdict =
  /** No resolver produced a comparable answer — an empty input list included; never reported as agreement. */
  | { kind: "no-data"; message: string }
  | { kind: "agree"; message: string }
  /** The zone's own authoritative servers do not agree with each other. Waiting does not help this one. */
  | { kind: "not-synced"; message: string }
  | {
      kind: "disagree";
      message: string;
      /** Labels of the resolvers holding an answer other than the reference. */
      differing: string[];
      /** Max TTL among `differing` resolvers that had one, or null when none did. */
      maxWaitSeconds: number | null;
    };

/**
 * Reads a verdict off already-fetched resolver results. Pure and total: every
 * branch below is one of the readings a visitor can act on, and none of them
 * invents a number that was not measured.
 */
export function buildVerdict(results: readonly ResolverResult[]): PropagationVerdict {
  if (results.length === 0) {
    return { kind: "no-data", message: "Yoxlanacaq ad server yoxdur — sorğu göndərilmədi." };
  }

  const comparable = results.filter((result) => result.status === "ok");
  if (comparable.length === 0) {
    return {
      kind: "no-data",
      message:
        "Heç bir ad server vaxtında və ya düzgün cavab vermədi — nəticələr müqayisə edilə bilmədi.",
    };
  }

  const authoritative = comparable.filter((result) => result.kind === "authoritative");
  const authGroups = groupByAnswer(authoritative);

  /* The zone's own nameservers disagreeing with each other is a different
     fault from a cache lagging behind a settled zone, and it gets a
     different message before the general comparison below ever runs. */
  if (authGroups.length > 1) {
    return {
      kind: "not-synced",
      message:
        "Domenin mötəbər ad serverləri bir-biri ilə razılaşmır — zona hələ öz bütün ad serverlərinə tam yayılmayıb. Bu, keşin gözlənilməsi ilə düzəlmir; problem keş serverlərdə deyil, zonanın öz mənbəyindədir.",
    };
  }

  const allGroups = groupByAnswer(comparable);
  if (allGroups.length === 1) {
    return { kind: "agree", message: "Bütün soruşulan ad serverləri eyni cavabı verir." };
  }

  /* Ground truth wins when it exists and is conclusive: an authoritative
     server cannot hand out an answer the zone does not have, so a single
     authoritative group is always the reference. Without one, the largest
     group stands in for it — not a certificate of correctness, but the
     honest default when nothing better is available to check against. */
  const reference =
    authGroups.length === 1
      ? authGroups[0]
      : [...allGroups].sort((a, b) => b.results.length - a.results.length)[0];

  const differing = comparable.filter((result) => !reference.results.includes(result));
  const differingLabels = differing.map((result) => result.label);
  const maxWaitSeconds = differing.reduce<number | null>((max, result) => {
    if (result.ttlSeconds === null) return max;
    return max === null ? result.ttlSeconds : Math.max(max, result.ttlSeconds);
  }, null);

  const message =
    authGroups.length === 1
      ? maxWaitSeconds !== null
        ? `Dəyişiklik mötəbər ad serverdə artıq var. ${differingLabels.length} keş server hələ köhnə cavabı saxlayır — gözləmə vaxtı ən çox ${formatDuration(maxWaitSeconds)} qədərdir.`
        : `Dəyişiklik mötəbər ad serverdə artıq var. ${differingLabels.length} keş server hələ köhnə cavabı saxlayır — bu qeyd növü TTL daşımadığı üçün dəqiq gözləmə vaxtı bilinmir.`
      : `Ad serverləri fərqli cavab verir: ${differingLabels.join(", ")} qalanlarından fərqlənir.`;

  return { kind: "disagree", message, differing: differingLabels, maxWaitSeconds };
}

export type PropagationReport = {
  domain: string;
  recordType: RecordType;
  checkedAt: string;
  resolvers: ResolverResult[];
  summary: StatusSummary;
  verdict: PropagationVerdict;
};
