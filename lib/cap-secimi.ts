/**
 * CAP theorem picker: turning five answers about one system into a CP-or-AP
 * recommendation, with the reasoning shown rather than hidden inside a score.
 *
 * The theorem itself only ever fires during a network partition — the rest of
 * the time a distributed system is choosing between latency and consistency,
 * which is PACELC's point, not CAP's. Both are modelled here because a tool
 * that only answered "CP or AP" would be silent about the far more common
 * case (`pacelcChoice`), and a visitor reading just the CAP verdict would
 * walk away thinking the trade-off only exists while something is broken.
 *
 * `decideCapSide` is additive scoring, no randomness, no model call, so the
 * same five answers always return the same side — and `buildReasons` returns
 * one entry per answer regardless of which way it leaned, so a visitor whose
 * answers pull in opposite directions sees exactly which ones disagreed
 * rather than a single number with no explanation behind it. That split is
 * also why this file exists apart from the widget: the score has to be
 * provable without a browser, and the widget only ever renders what this
 * file already decided.
 */

export type PartitionPreference = "staleData" | "returnError";
export type Workload = "readHeavy" | "writeHeavy" | "balanced";
export type Geography = "singleRegion" | "multiRegion";
export type LatencyBudget = "tight" | "relaxed";

export type CapAnswers = {
  /** What the system should do while a network partition is active. */
  partitionPreference: PartitionPreference;
  workload: Workload;
  geography: Geography;
  /** Payments, orders, inventory — anything where two conflicting writes is a real loss, not a merge conflict. */
  irreversibleOps: boolean;
  latencyBudget: LatencyBudget;
};

export const DEFAULT_CAP_ANSWERS: CapAnswers = {
  partitionPreference: "returnError",
  workload: "balanced",
  geography: "singleRegion",
  irreversibleOps: false,
  latencyBudget: "relaxed",
};

export type CapSide = "CP" | "AP";
export type CapConfidence = "aydın" | "sərhəd hal";
export type ReasonSide = "CP" | "AP" | "notr";

export type CapReason = { text: string; side: ReasonSide };

export type CapResult = {
  side: CapSide;
  score: number;
  confidence: CapConfidence;
  /** True when the score landed exactly on zero and `irreversibleOps` broke the tie. */
  tieBreak: boolean;
  reasons: CapReason[];
};

/* Below this, the two sides are close enough that the "why" text matters
   more than the verdict — a visitor should read `reasons`, not just the
   badge. At or above it, the five answers agree enough that the badge alone
   is a fair summary. */
const CONFIDENCE_THRESHOLD = 3;

/* The direct CAP question, weighted heaviest because it is the only answer
   that describes a partition specifically — every other question describes
   the system in general. */
function partitionScore(a: CapAnswers): number {
  return a.partitionPreference === "staleData" ? 5 : -5;
}

function irreversibleScore(a: CapAnswers): number {
  return a.irreversibleOps ? -3 : 0;
}

function geographyScore(a: CapAnswers): number {
  return a.geography === "multiRegion" ? 2 : 0;
}

function latencyScore(a: CapAnswers): number {
  return a.latencyBudget === "tight" ? 2 : -1;
}

function workloadScore(a: CapAnswers): number {
  if (a.workload === "readHeavy") return 1;
  if (a.workload === "writeHeavy") return -1;
  return 0;
}

function capScore(a: CapAnswers): number {
  return (
    partitionScore(a) + irreversibleScore(a) + geographyScore(a) + latencyScore(a) + workloadScore(a)
  );
}

/**
 * One reason per answer, always five, in the order the questions are asked.
 * An answer that does not pull either way (a balanced workload, no
 * irreversible operation) still gets an entry — `side: "notr"` — so the count
 * itself tells a visitor nothing was skipped.
 */
function buildReasons(a: CapAnswers): CapReason[] {
  return [
    {
      side: a.partitionPreference === "staleData" ? "AP" : "CP",
      text:
        a.partitionPreference === "staleData"
          ? "Bölünmə zamanı köhnə (bəlkə uyğunsuz) məlumatı qəbul edirsən. Bu, birbaşa AP-nin tərifidir: hər node cavab verməyə davam edir."
          : "Bölünmə zamanı xətanı üstün tutursan. Bu, CP-nin tərifidir: sistem düzgün cavab verə bilmədiyi halda susmaq əvəzinə açıq imtina edir.",
    },
    {
      side: a.irreversibleOps ? "CP" : "notr",
      text: a.irreversibleOps
        ? "Pul, sifariş və ya anbar kimi geri qaytarıla bilməyən əməliyyat var: iki node-un ziddiyyətli qərar verməsi (məsələn, eyni məhsulu iki dəfə satmaq) real itkidir, ona görə güclü tərəf ağırlıq qazanır."
        : "Dönməz əməliyyat yoxdur: ziddiyyətli yazını sonradan həll etmək (son-yazan-udur, birləşdirmə) adətən qəbul edilə bilər.",
    },
    {
      side: a.geography === "multiRegion" ? "AP" : "notr",
      text:
        a.geography === "multiRegion"
          ? "Coğrafi olaraq bir neçə regiona yayılmısan: regionlar arası hər yazını gözləmək gecikməni saniyələrə çıxarır, bu da əlçatanlıq tərəfini cəzbedici edir."
          : "Tək region daxilində işləyirsən: konsensus üçün lazım olan şəbəkə gedişi onsuz da qısadır, güclü konsistentliyin gecikmə cəzası kiçikdir.",
    },
    {
      side: a.latencyBudget === "tight" ? "AP" : "notr",
      text:
        a.latencyBudget === "tight"
          ? "Gecikmə büdcəsi sıxdır: konsensus gözləmək (quorum yazısı) bu büdcəni asanlıqla aşır."
          : "Gecikmə kritik deyil: konsensus üçün əlavə gediş-gəliş büdcəyə sığır.",
    },
    {
      side: a.workload === "readHeavy" ? "AP" : a.workload === "writeHeavy" ? "CP" : "notr",
      text:
        a.workload === "readHeavy"
          ? "Yük əsasən oxudur: köhnəlmiş replikadan oxumaq adətən zərərsizdir, bu da əlçatanlıq tərəfinə meyl yaradır."
          : a.workload === "writeHeavy"
            ? "Yük əsasən yazıdır: ziddiyyətli yazıları sonradan barışdırmaq getdikcə çətinləşir, bu da konsistentlik tərəfinə meyl yaradır."
            : "Oxu və yazı balanslıdır, bu sual tək başına tərəf seçmir.",
    },
  ];
}

/**
 * The five answers in, one verdict out. A score of exactly zero is a real
 * tie — the five weighted answers cancel out — and `irreversibleOps` breaks
 * it, because losing money to a conflicting write is a sharper cost than
 * serving a stale read: when nothing else decides, safety wins.
 */
export function decideCapSide(answers: CapAnswers): CapResult {
  const score = capScore(answers);
  const tieBreak = score === 0;
  const side: CapSide = tieBreak ? (answers.irreversibleOps ? "CP" : "AP") : score > 0 ? "AP" : "CP";
  const confidence: CapConfidence = Math.abs(score) >= CONFIDENCE_THRESHOLD ? "aydın" : "sərhəd hal";
  return { side, score, confidence, tieBreak, reasons: buildReasons(answers) };
}

/* ---------- static reference tables shown beside the decision ---------- */

export type ConsistencyModel = { id: string; label: string; promise: string };

export const CONSISTENCY_MODELS: ConsistencyModel[] = [
  {
    id: "strong",
    label: "Güclü konsistentlik",
    promise: "Hər oxu, harada baş versə də, ən son yazının nəticəsini görür, sanki tək node var.",
  },
  {
    id: "read-your-writes",
    label: "Oxu-öz-yazını",
    promise: "Yazan tərəf öz yazdığını dərhal görür; başqa oxuyucu üçün belə zəmanət yoxdur.",
  },
  {
    id: "monotonic-read",
    label: "Monoton oxu",
    promise: "Bir dəfə yeni dəyəri gördükdən sonra həmin oxuyucu heç vaxt daha köhnə dəyərə geri qayıtmır.",
  },
  {
    id: "eventual",
    label: "Son nəticədə konsistentlik",
    promise: "Yazı dayandıqdan müəyyən müddət sonra bütün node-lar eyni dəyərə gəlir. Nə vaxt olduğuna zəmanət yoxdur.",
  },
];

export type SystemStance = { name: string; stance: CapSide; note: string };

/*
 * A well-known system's stance is the mode it ships with, not every
 * configuration it can be tuned into — Cassandra's consistency level is
 * per-query, DynamoDB offers a strongly consistent read flag. What is listed
 * here is the behaviour a team gets without reaching for those knobs.
 */
export const KNOWN_SYSTEMS: SystemStance[] = [
  { name: "PostgreSQL", stance: "CP", note: "Tək yazan node: bölünmədə əlçatanlıq itir, konsistentlik qorunur." },
  {
    name: "Cassandra",
    stance: "AP",
    note: "Defolt tənzimləmədə hər node yazını qəbul edir; ziddiyyət sonradan (last-write-wins) həll olunur.",
  },
  {
    name: "DynamoDB",
    stance: "AP",
    note: "Çox-master reallıqda əlçatanlıq üstündür; güclü konsistent oxu ayrıca bayraqla istənilir.",
  },
  { name: "etcd", stance: "CP", note: "Raft konsensusu: əksəriyyət əlçatan olmasa yazı dayanır." },
  {
    name: "Redis",
    stance: "CP",
    note: "Tək master modeldə master əlçatan deyilsə yazı dayanır, Sentinel failover-i gözləyir.",
  },
  {
    name: "MongoDB",
    stance: "CP",
    note: "Replika dəstində əksəriyyət yoxdursa primary seçilmir, yazı qəbul edilmir.",
  },
];

export type PacelcChoice = "EL" | "EC";

/**
 * PACELC's second half — no partition, so the trade-off is not CP-vs-AP but
 * latency-vs-consistency (Else, Latency-or-Consistency). This is the choice a
 * system makes on an ordinary day, which is most days: a partition-only
 * verdict would leave the far more common trade-off unexplained.
 */
export function pacelcChoice(a: CapAnswers): PacelcChoice {
  return a.latencyBudget === "tight" ? "EL" : "EC";
}

/** The copy-paste summary behind the tool's copy button. */
export function formatCapReport(answers: CapAnswers, result: CapResult): string {
  const lines = [
    "CAP seçimi",
    "",
    `Nəticə: ${result.side} (${result.confidence}${result.tieBreak ? ", bərabərlik həlli" : ""})`,
    `Xal: ${result.score}`,
    "",
    "Səbəblər:",
    ...result.reasons.map((reason) => `- [${reason.side}] ${reason.text}`),
    "",
    `Bölünmə yoxdursa (PACELC): ${
      pacelcChoice(answers) === "EL" ? "gecikmə seçilir (EL)" : "konsistentlik seçilir (EC)"
    }`,
  ];
  return lines.join("\n");
}
