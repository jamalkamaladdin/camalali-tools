/**
 * Architecture picker. Every card is decided by an additive score over the eight
 * answers — no randomness, no model call — so the same answers always return the
 * same five recommendations and the test file can pin the behaviour down.
 */

export type QuestionId =
  | "shape"
  | "load"
  | "team"
  | "consistency"
  | "latency"
  | "ops"
  | "workload"
  | "budget";

export type Answers = {
  shape: "relational" | "document" | "timeseries" | "keyvalue" | "graph";
  load: "low" | "medium" | "high" | "veryHigh";
  team: "solo" | "small" | "medium" | "large";
  consistency: "strong" | "eventual";
  latency: "tight" | "normal" | "relaxed";
  ops: "managed" | "selfHosted";
  workload: "readHeavy" | "writeHeavy" | "balanced";
  budget: "high" | "medium" | "low";
};

type QuestionFor<K extends QuestionId> = {
  id: K;
  label: string;
  hint: string;
  options: readonly { value: Answers[K]; label: string }[];
};

/**
 * Authoring type: an option value that does not belong to its own question is a
 * compile error. Consumers get the widened `Question` below, because mapping
 * over a union of differently typed arrays is not callable in TypeScript.
 */
type StrictQuestion = { [K in QuestionId]: QuestionFor<K> }[QuestionId];

export type Question = {
  id: QuestionId;
  label: string;
  hint: string;
  options: readonly { value: string; label: string }[];
};

const strictQuestions = [
  {
    id: "shape",
    label: "Məlumatın forması",
    hint: "Əsas həcmi hansı forma tutur — hamısı yox, ən böyüyü.",
    options: [
      { value: "relational", label: "Relyasion: cədvəl və əlaqələr" },
      { value: "document", label: "Sənəd: iç-içə, dəyişkən sxem" },
      { value: "timeseries", label: "Vaxt sırası: hadisə, metrika, log" },
      { value: "keyvalue", label: "Açar-dəyər: tək açar üzrə giriş" },
      { value: "graph", label: "Qraf: çoxsəviyyəli əlaqə gəzişməsi" },
    ],
  },
  {
    id: "load",
    label: "Gözlənilən yük",
    hint: "Pik saatdakı sorğu sayı, orta deyil.",
    options: [
      { value: "low", label: "10 RPS-dən az" },
      { value: "medium", label: "10–100 RPS" },
      { value: "high", label: "100–1000 RPS" },
      { value: "veryHigh", label: "1000+ RPS" },
    ],
  },
  {
    id: "team",
    label: "Komanda ölçüsü",
    hint: "Bu kod bazasına yazan mühəndislər.",
    options: [
      { value: "solo", label: "1–2 nəfər" },
      { value: "small", label: "3–8 nəfər" },
      { value: "medium", label: "9–25 nəfər" },
      { value: "large", label: "25+ nəfər" },
    ],
  },
  {
    id: "consistency",
    label: "Uyğunluq tələbi",
    hint: "Yazılan dəyər dərhal hər yerdə düzgün görünməlidirmi?",
    options: [
      { value: "strong", label: "Güclü: pul, anbar, sifariş" },
      { value: "eventual", label: "Son nəticədə kifayətdir" },
    ],
  },
  {
    id: "latency",
    label: "Gecikmə hədəfi",
    hint: "Server tərəfdə p95 cavab vaxtı.",
    options: [
      { value: "tight", label: "50 ms-dən az" },
      { value: "normal", label: "300 ms-dən az" },
      { value: "relaxed", label: "Kritik deyil" },
    ],
  },
  {
    id: "ops",
    label: "Əməliyyat yetkinliyi",
    hint: "Serveri kim saxlayacaq — siz, yoxsa provayder?",
    options: [
      { value: "managed", label: "İdarə olunan servis istəyirik" },
      { value: "selfHosted", label: "Öz serverimizi saxlaya bilərik" },
    ],
  },
  {
    id: "workload",
    label: "Oxu-yazma profili",
    hint: "Sorğuların böyük hissəsi hansı istiqamətdədir?",
    options: [
      { value: "readHeavy", label: "Oxu ağır" },
      { value: "writeHeavy", label: "Yazma ağır" },
      { value: "balanced", label: "Balanslı" },
    ],
  },
  {
    id: "budget",
    label: "Büdcə həssaslığı",
    hint: "Aylıq infrastruktur xərci nə qədər sıxır?",
    options: [
      { value: "high", label: "Yüksək: hər manat sayılır" },
      { value: "medium", label: "Orta" },
      { value: "low", label: "Aşağı: sürət xərcdən vacibdir" },
    ],
  },
] satisfies readonly StrictQuestion[];

export const questions: readonly Question[] = strictQuestions;

export const defaultAnswers: Answers = {
  shape: "relational",
  load: "medium",
  team: "small",
  consistency: "strong",
  latency: "normal",
  ops: "managed",
  workload: "readHeavy",
  budget: "medium",
};

export type Preset = { id: string; label: string; answers: Answers };

export const presets: readonly Preset[] = [
  {
    id: "mvp",
    label: "MVP: iki nəfər",
    answers: {
      shape: "relational",
      load: "low",
      team: "solo",
      consistency: "strong",
      latency: "relaxed",
      ops: "managed",
      workload: "balanced",
      budget: "high",
    },
  },
  {
    id: "saas",
    label: "Böyüyən SaaS",
    answers: {
      shape: "relational",
      load: "high",
      team: "medium",
      consistency: "strong",
      latency: "normal",
      ops: "managed",
      workload: "readHeavy",
      budget: "medium",
    },
  },
  {
    id: "telemetry",
    label: "Telemetriya platforması",
    answers: {
      shape: "timeseries",
      load: "veryHigh",
      team: "medium",
      consistency: "eventual",
      latency: "normal",
      ops: "selfHosted",
      workload: "writeHeavy",
      budget: "medium",
    },
  },
  {
    id: "marketplace",
    label: "Böyük marketpleys",
    answers: {
      shape: "relational",
      load: "veryHigh",
      team: "large",
      consistency: "strong",
      latency: "tight",
      ops: "managed",
      workload: "readHeavy",
      budget: "low",
    },
  },
];

const optionLabels = Object.fromEntries(
  questions.map((question) => [
    question.id,
    Object.fromEntries(
      question.options.map((option) => [option.value, option.label]),
    ),
  ]),
) as Record<QuestionId, Record<string, string>>;

/** The visible label of the current answer, quoted inside the reason texts. */
export function answerLabel(answers: Answers, id: QuestionId): string {
  return optionLabels[id][answers[id]] ?? answers[id];
}

/**
 * Single writing door for the component. An unknown value is ignored instead of
 * being stored, so a stale link or a hand-edited value can never put the scoring
 * table into a state it has no weights for.
 */
export function withAnswer(
  answers: Answers,
  id: QuestionId,
  value: string,
): Answers {
  if (!(id in optionLabels) || optionLabels[id][value] === undefined) {
    return answers;
  }
  return { ...answers, [id]: value } as Answers;
}

export type CardId = "database" | "cache" | "deployment" | "queue" | "search";

export type Confidence = "high" | "medium" | "low";

export type Recommendation = {
  id: CardId;
  area: string;
  pick: string;
  why: string;
  wrongWhen: string;
  alternative: string;
  alternativeWhen: string;
  /** How far ahead the winner is — a close call is worth saying out loud. */
  confidence: Confidence;
};

type Candidate = {
  pick: string;
  score: (a: Answers) => number;
  why: (a: Answers) => string;
  wrongWhen: string;
  /** Shown when this candidate ends up as runner-up: when to take it instead. */
  insteadWhen: string;
};

type CardSpec = { id: CardId; area: string; candidates: readonly Candidate[] };

/** Missing keys weigh nothing, so only the meaningful pulls are written down. */
function w<T extends string>(value: T, table: Partial<Record<T, number>>): number {
  return table[value] ?? 0;
}

const L = answerLabel;

const databaseCard: CardSpec = {
  id: "database",
  area: "Verilənlər bazası",
  candidates: [
    {
      pick: "PostgreSQL",
      score: (a) =>
        w(a.shape, { relational: 6, document: 3, timeseries: 1, graph: 2 }) +
        w(a.consistency, { strong: 2 }) +
        w(a.load, { low: 2, medium: 1, veryHigh: -1 }) +
        w(a.workload, { readHeavy: 1, balanced: 1 }) +
        w(a.budget, { high: 2, medium: 1 }) +
        w(a.team, { solo: 1 }),
      why: (a) =>
        `«${L(a, "shape")}» forma və «${L(a, "consistency")}» tələbi bir sistemdə həll olunur: sxem, tranzaksiya, JSONB sütunu və düzgün indeks. ${
          a.load === "veryHigh"
            ? "1000+ RPS-də oxu replikası və connection pooler əlavə olunur, amma baza dəyişmir."
            : `${L(a, "load")} yükdə tək instans və gündəlik ehtiyat nüsxə kifayət edir.`
        }`,
      wrongWhen:
        "Bir cədvəldə milyardlarla sətir üzərində aqreqasiya gedirsə — sütunlu baza həmin taramanı on dəfələrlə sürətli edir. Sxemi hər həftə dəyişən, hələ formalaşmamış məlumat üçün də ağırdır.",
      insteadWhen:
        "sxem sabitdirsə və tranzaksiya sərhədi bir sənəddən genişdirsə",
    },
    {
      pick: "MongoDB",
      score: (a) =>
        w(a.shape, {
          document: 6,
          relational: -1,
          timeseries: 1,
          keyvalue: 1,
        }) +
        w(a.consistency, { strong: -1, eventual: 1 }) +
        w(a.load, { high: 1, veryHigh: 1 }) +
        w(a.workload, { writeHeavy: 1 }) +
        w(a.budget, { low: 1 }),
      why: (a) =>
        `Sənəd forması + «${L(a, "consistency")}»: bir oxunuşda bütöv obyekt gəlir, sxem miqrasiyası olmadan yeni sahə əlavə edilir. ${L(a, "load")} yükdə şardlama sonradan da açıla bilər.`,
      wrongWhen:
        "Hesabat və birləşdirmə çoxalanda: bir neçə kolleksiyanı tətbiq kodunda birləşdirmək relyasion sorğudan həm yavaş, həm də səhvə açıq olur. Pul hərəkəti kimi çoxsənədli tranzaksiyalar da burada bahalıdır.",
      insteadWhen:
        "məlumat həqiqətən iç-içə sənəddirsə və sxem tez-tez dəyişirsə",
    },
    {
      pick: "ClickHouse",
      score: (a) =>
        w(a.shape, {
          timeseries: 6,
          relational: -2,
          document: -2,
          keyvalue: -3,
          graph: -4,
        }) +
        w(a.workload, { readHeavy: 2, writeHeavy: 1 }) +
        w(a.load, { high: 1, veryHigh: 2 }) +
        w(a.consistency, { strong: -3, eventual: 1 }) +
        w(a.latency, { tight: -1 }) +
        w(a.budget, { high: 1 }),
      why: (a) =>
        `Vaxt sırası + «${L(a, "workload")}» profil + ${L(a, "load")} yük: sütunlu saxlama yalnız lazım olan sahələri oxuyur, ona görə milyardlarla sətir üzərində aqreqasiya saniyələrlə yox, millisaniyələrlə qayıdır.`,
      wrongWhen:
        "Tək sətri tez-tez yeniləmək və ya silmək lazımdırsa: UPDATE və DELETE burada arxa planda işləyən bahalı əməliyyatdır, unikal açar zəmanəti isə yoxdur.",
      insteadWhen:
        "sorğular böyük zaman aralıqları üzrə aqreqasiyadırsa və yazma axını fasiləsizdirsə",
    },
    {
      pick: "TimescaleDB",
      score: (a) =>
        w(a.shape, {
          timeseries: 5,
          relational: 1,
          document: -3,
          keyvalue: -3,
          graph: -3,
        }) +
        w(a.consistency, { strong: 2 }) +
        w(a.load, { low: 2, medium: 1, veryHigh: -2 }) +
        w(a.team, { solo: 1, small: 1 }) +
        w(a.budget, { high: 1 }),
      why: (a) =>
        `Vaxt sırası, amma ${L(a, "load")} yük və «${L(a, "consistency")}» tələbi ilə: TimescaleDB PostgreSQL uzantısıdır — eyni SQL, eyni tranzaksiya, üstəlik vaxta görə avtomatik parçalama və sıxılma. Komanda yeni bir baza öyrənmir.`,
      wrongWhen:
        "Gündəlik həcm terabaytlara qalxanda: bu, hələ də sətir əsaslı Postgres-dir və sütunlu mühərrikin tarama sürətini vermir.",
      insteadWhen:
        "vaxt sırası ilə yanaşı adi relyasion cədvəllər də eyni bazada qalmalıdırsa",
    },
    {
      pick: "İdarə olunan açar-dəyər (DynamoDB)",
      score: (a) =>
        w(a.shape, {
          keyvalue: 5,
          document: 2,
          relational: -3,
          timeseries: -1,
          graph: -4,
        }) +
        w(a.ops, { managed: 3, selfHosted: -4 }) +
        w(a.load, { high: 1, veryHigh: 2 }) +
        w(a.budget, { high: -2, low: 1 }),
      why: (a) =>
        `Açar-dəyər forma + «${L(a, "ops")}» seçimi: replikasiya, şardlama və ehtiyat nüsxə provayderin işidir; ${L(a, "load")} yükdə tək açar üzrə gecikmə həcmdən asılı olaraq dəyişmir.`,
      wrongWhen:
        "Sorğu şəkli hələ məlum deyilsə: burada indeks sorğuya görə qurulur və sorğu sonradan dəyişəndə cədvəli yenidən modelləşdirmək lazım gəlir. Hesab da sorğu sayına görə gözlənilmədən böyüyür.",
      insteadWhen:
        "komanda server saxlamaq istəmirsə və yük kəskin dalğalanırsa",
    },
    {
      pick: "Redis",
      score: (a) =>
        w(a.shape, {
          keyvalue: 6,
          relational: -5,
          document: -3,
          timeseries: -2,
          graph: -5,
        }) +
        w(a.latency, { tight: 2 }) +
        w(a.consistency, { strong: -2 }) +
        w(a.load, { veryHigh: 1 }) +
        w(a.budget, { high: -1 }),
      why: (a) =>
        `Açar-dəyər forma + «${L(a, "latency")}» hədəf: bütün məlumat yaddaşdadır, tək açar üzrə oxu mikrosaniyələrlə ölçülür və disk gecikməsi tənlikdən çıxır.`,
      wrongWhen:
        "Məlumat RAM həcmindən böyüyəndə və ya itməsi qəbuledilməz olanda: davamlılıq konfiqurasiyadan asılıdır və sıfır itki zəmanəti vermir. RAM həm də diskdən qat-qat bahadır.",
      insteadWhen:
        "giriş həmişə tək açar üzrədirsə və gecikmə büdcəsi millisaniyələrlədirsə",
    },
    {
      pick: "Neo4j",
      score: (a) =>
        w(a.shape, {
          graph: 7,
          relational: -5,
          document: -4,
          timeseries: -6,
          keyvalue: -5,
        }) +
        w(a.load, { medium: 1, high: 2, veryHigh: 2 }) +
        w(a.team, { solo: -1 }) +
        w(a.budget, { high: -1 }) +
        w(a.ops, { managed: 1 }),
      why: (a) =>
        `Qraf forması + ${L(a, "load")} yük: «üç addım aralıqdakı əlaqələr» tipli sorğu SQL-də hər səviyyə üçün yeni birləşdirmə deməkdir; qraf bazasında bu, indeksdən keçən tək gəzişmədir.`,
      wrongWhen:
        "Qraf sadəcə bir neçə səviyyəli iyerarxiyadırsa: ayrıca baza, ayrıca ehtiyat nüsxə və ayrıca sorğu dili saxlamaq əvəzinə PostgreSQL-də rekursiv CTE eyni işi görür.",
      insteadWhen:
        "sorğuların mərkəzində «kimdən kimə neçə addım» tipli gəzişmə dayanırsa",
    },
  ],
};

const cacheCard: CardSpec = {
  id: "cache",
  area: "Keş qatı",
  candidates: [
    {
      pick: "Lazım deyil",
      score: (a) =>
        w(a.load, { low: 5, medium: 2, high: -1, veryHigh: -3 }) +
        w(a.latency, { relaxed: 2, normal: 1, tight: -2 }) +
        w(a.workload, { writeHeavy: 2, readHeavy: -2 }) +
        // An in-memory primary store is already the cache; a second one in
        // front of it only adds a way to be wrong.
        w(a.shape, { keyvalue: 5 }) +
        w(a.budget, { high: 1 }),
      why: (a) =>
        `${L(a, "load")} yük və «${L(a, "latency")}» hədəf ilə keş sürət yox, ikinci həqiqət mənbəyi gətirir. ${
          a.shape === "keyvalue"
            ? "Seçilən saxlama onsuz da yaddaşda işləyir — üstünə keş qoymaq eyni işi iki dəfə görməkdir."
            : "Əvvəlcə itən indeksləri və N+1 sorğuları düzəlt: ölçmə göstərir ki, cavab vaxtının çoxu adətən oradadır."
        }`,
      wrongWhen:
        "Eyni ağır sorğu saniyədə onlarla dəfə təkrarlanırsa və indeks artıq kömək etmirsə. Onda keş bir günlük iş, sorğunun yenidən yazılması isə həftələrlə çəkə bilər.",
      insteadWhen:
        "ölçmə göstərirsə ki, baza cavab vaxtının yarısından azını tutur",
    },
    {
      pick: "Redis",
      score: (a) =>
        w(a.load, { low: -1, medium: 1, high: 3, veryHigh: 4 }) +
        w(a.latency, { tight: 3, normal: 1, relaxed: -1 }) +
        w(a.workload, { readHeavy: 3, balanced: 1, writeHeavy: -1 }) +
        w(a.shape, { keyvalue: -6 }) +
        w(a.consistency, { strong: -1 }) +
        w(a.budget, { high: -1 }),
      why: (a) =>
        `«${L(a, "workload")}» profil + ${L(a, "load")} yük: eyni nəticəni hər sorğuda yenidən hesablamaq əvəzinə açar üzrə saxlamaq baza yükünü kəskin azaldır və «${L(a, "latency")}» hədəfini əlçatan edir. Sessiya, rate limit və növbə üçün də eyni instans işlədilir.`,
      wrongWhen:
        "Yazma ağır olanda və hər yazıdan sonra keş silinməlidirsə: invalidasiya işi faydadan çox olur. Güclü uyğunluq tələb edən ekranda keşlənmiş dəyər sadəcə səhv cavabdır.",
      insteadWhen:
        "eyni sorğu təkrarlanırsa və cavabın bir neçə saniyə köhnə olması qəbul edilirsə",
    },
    {
      pick: "CDN / edge keş",
      score: (a) =>
        w(a.workload, { readHeavy: 3, writeHeavy: -2 }) +
        w(a.load, { medium: 1, high: 2, veryHigh: 2 }) +
        w(a.latency, { tight: 2 }) +
        w(a.consistency, { strong: -3 }) +
        w(a.shape, { timeseries: -1 }) +
        w(a.budget, { high: 2 }),
      why: (a) =>
        `«${L(a, "workload")}» profil və ${L(a, "load")} yük: cavab hamı üçün eynidirsə, onu istifadəçiyə ən yaxın nöqtədə saxlamaq həm gecikməni, həm də mənşə serverə düşən sorğu sayını azaldır — ən ucuz keş budur.`,
      wrongWhen:
        "Cavab hər istifadəçi üçün fərqli olanda: şəxsi məlumat CDN-də keşlənməməlidir, səhvən keşlənsə başqasına göstərilə bilər. Dərhal yenilənməli məzmun üçün də invalidasiya gecikməsi problemdir.",
      insteadWhen:
        "cavabların böyük hissəsi bütün istifadəçilər üçün eynidirsə",
    },
  ],
};

const deploymentCard: CardSpec = {
  id: "deployment",
  area: "Yerləşdirmə modeli",
  candidates: [
    {
      pick: "Modular monolit",
      score: (a) =>
        w(a.team, { solo: 2, small: 5, medium: 5, large: 3 }) +
        w(a.load, { low: 1, medium: 2, high: 2, veryHigh: 1 }) +
        w(a.budget, { high: 1, medium: 1 }) +
        w(a.ops, { selfHosted: 1 }),
      why: (a) =>
        `${L(a, "team")} komanda + ${L(a, "load")} yük: modulların sərhədi kodda qoyulur — ayrı sxem, ayrı servis qatı, aydın interfeys — amma deploy tək qalır. Şəbəkə gecikməsi və paylanmış tranzaksiya problemi yaranmır, sərhəd səhv çəkilibsə düzəlişi bir refaktordur.`,
      wrongWhen:
        "Hissələr həqiqətən fərqli miqyaslanma tələb edəndə: video emalı ilə API-ni eyni prosesdə saxlamaq hər ikisini bahalaşdırır. Bir modulun yaddaş sızması bütün prosesi yıxır.",
      insteadWhen:
        "komanda bir neçə dəstəyə bölünübsə, amma yük hələ bir prosesə sığırsa",
    },
    {
      pick: "Monolit",
      score: (a) =>
        w(a.team, { solo: 5, small: 2, large: -3 }) +
        w(a.load, { low: 2, medium: 1, high: -1, veryHigh: -3 }) +
        w(a.budget, { high: 2, medium: 1 }) +
        w(a.ops, { selfHosted: 1 }),
      why: (a) =>
        `${L(a, "team")} komanda və ${L(a, "load")} yük: bir repo, bir deploy, bir log axını. Bu ölçüdə arxitekturanın əsas məsələsi miqyas yox, sürətdir — paylanmış sistem burada yalnız gecikmə və əməliyyat işi əlavə edir.`,
      wrongWhen:
        "Komanda böyüyəndə və bir neçə dəstə eyni fayllara toxunanda: hər deploy növbəyə düşür, release qorxulu hadisəyə çevrilir. Sərhədsiz kod bazası iki ildən sonra yenidən yazılır.",
      insteadWhen:
        "komanda kiçikdirsə və məhsulun sərhədləri hələ dəqiqləşməyibsə",
    },
    {
      pick: "Mikroservis",
      score: (a) =>
        w(a.team, { solo: -4, small: -2, medium: 1, large: 5 }) +
        w(a.load, { low: -3, medium: -1, high: 1, veryHigh: 3 }) +
        w(a.budget, { high: -3, medium: -1, low: 1 }) +
        w(a.ops, { managed: 1, selfHosted: -2 }),
      why: (a) =>
        `${L(a, "team")} komanda və ${L(a, "load")} yük: bu ölçüdə deploy növbəsi real itkidir və hissələr ayrıca miqyaslanmalıdır. Servis sərhədi komanda sərhədini əks etdirməlidir — texniki qatlara görə bölmə (auth-servis, baza-servisi) əvəzinə biznes sahəsinə görə.`,
      wrongWhen:
        "Komanda 10 nəfərdən azdırsa: paylanmış izləmə, servislərarası kontrakt, ayrıca CI, ayrıca baza və şəbəkə xətalarının idarəsi — bunların hamısı məhsul işindən oğurlanan vaxtdır. Yanlış çəkilmiş sərhəd isə refaktorla yox, miqrasiya ilə düzəlir.",
      insteadWhen:
        "komanda sərhədləri bir deploy-a sığmırsa və hissələr ayrıca miqyaslanmalıdırsa",
    },
  ],
};

const queueCard: CardSpec = {
  id: "queue",
  area: "Növbə (queue)",
  candidates: [
    {
      pick: "Lazım deyil",
      score: (a) =>
        w(a.load, { low: 4, medium: 1, high: -2, veryHigh: -4 }) +
        w(a.workload, { readHeavy: 3, writeHeavy: -3 }) +
        w(a.team, { solo: 2, small: 1, medium: -1, large: -2 }) +
        w(a.latency, { tight: -1 }) +
        w(a.budget, { high: 1 }),
      why: (a) =>
        `${L(a, "load")} yük və «${L(a, "workload")}» profil: sorğunu sinxron cavablandırmaq hələ ki, ucuzdur. Növbə əlavə edən kimi sifariş, təkrar cəhd və «görünməyən xəta» məsələləri də əlavə olunur.`,
      wrongWhen:
        "Sorğunun içində e-poçt göndərmək, şəkil emal etmək və ya üçüncü tərəf API çağırmaq varsa: xarici servis yavaşlayanda istifadəçi gözləyir və taymaut alır.",
      insteadWhen:
        "hər sorğu yalnız öz bazasına toxunursa və uzun sürən iş yoxdursa",
    },
    {
      pick: "PostgreSQL cədvəli (SKIP LOCKED)",
      score: (a) =>
        w(a.load, { low: 2, medium: 3, veryHigh: -4 }) +
        w(a.team, { solo: 2, small: 2, large: -1 }) +
        // Only worth it when the stack already has a relational database to
        // put the table in — otherwise this adds a second engine, not fewer.
        w(a.shape, { relational: 2, document: -1, timeseries: -1, keyvalue: -4, graph: -2 }) +
        w(a.budget, { high: 1 }) +
        w(a.consistency, { strong: 2 }) +
        w(a.workload, { writeHeavy: 1, readHeavy: -1 }) +
        w(a.ops, { selfHosted: 1 }),
      why: (a) =>
        `${L(a, "load")} yük + «${L(a, "consistency")}» tələbi: iş elementi eyni tranzaksiyada yazılır, ona görə «baza yazıldı, növbəyə düşmədi» halı ümumiyyətlə mümkün olmur. ${
          a.budget === "high"
            ? "Yeni servis qaldırılmır — mövcud baza kifayətdir."
            : "Bir cədvəl, bir indeks və FOR UPDATE SKIP LOCKED — bütün quruluş budur."
        }`,
      wrongWhen:
        "Saniyədə minlərlə iş elementi yazılanda: növbə cədvəli əsas bazanı yeyir, vacuum yükü artır və bir sistemin problemi hər ikisini dayandırır.",
      insteadWhen:
        "iş həcmi kiçikdirsə və növbənin bazadakı yazma ilə eyni tranzaksiyada olması vacibdirsə",
    },
    {
      pick: "İdarə olunan növbə (SQS / Cloud Tasks)",
      score: (a) =>
        w(a.ops, { managed: 4, selfHosted: -4 }) +
        w(a.load, { medium: 1, high: 2, veryHigh: 2 }) +
        w(a.team, { medium: 1, large: 2 }) +
        w(a.budget, { high: -1, low: 1 }),
      why: (a) =>
        `«${L(a, "ops")}» seçimi + ${L(a, "load")} yük: təkrar cəhd, ölü məktub növbəsi və miqyaslanma provayderdə hazırdır; komanda yalnız istehlakçı yazır və növbə uzunluğunu izləyir.`,
      wrongWhen:
        "Mesaj sırası ciddi vacibdirsə və ya eyni hadisəni bir neçə müstəqil abunəçi oxumalıdırsa: klassik növbə mesajı bir dəfə paylayır, hadisə jurnalı isə saxlayır.",
      insteadWhen:
        "server saxlamaq istəmirsinizsə və yük gün ərzində kəskin dəyişirsə",
    },
    {
      pick: "Redis növbəsi (BullMQ / Sidekiq)",
      score: (a) =>
        w(a.load, { medium: 2, high: 3, veryHigh: 1 }) +
        w(a.workload, { writeHeavy: 2, balanced: 1 }) +
        w(a.latency, { tight: 2 }) +
        w(a.team, { small: 1, medium: 2, large: 1 }) +
        w(a.consistency, { strong: -1 }) +
        w(a.budget, { high: 1 }),
      why: (a) =>
        `${L(a, "load")} yük + «${L(a, "latency")}» hədəf: iş elementi millisaniyələr ərzində götürülür, gecikmiş və təkrarlanan tapşırıqlar hazır gəlir. Redis onsuz da keş üçün lazımdırsa, yeni infrastruktur əlavə olunmur.`,
      wrongWhen:
        "İtkiyə dözümsüz iş üçün: Redis yaddaş əsaslıdır və çökmə anında təsdiqlənməmiş elementlər itə bilər. Növbə keşlə eyni instansı bölüşəndə isə biri digərinin yaddaşını yeyir.",
      insteadWhen:
        "fon işi qısa və tez-tezdirsə, itən tək elementə isə dözmək olarsa",
    },
    {
      pick: "Kafka",
      score: (a) =>
        w(a.load, { low: -4, medium: -2, high: 1, veryHigh: 5 }) +
        w(a.shape, { timeseries: 3 }) +
        w(a.workload, { writeHeavy: 3, readHeavy: -1 }) +
        w(a.team, { solo: -4, small: -2, large: 2 }) +
        w(a.budget, { high: -3, medium: -1, low: 1 }) +
        w(a.ops, { managed: 1, selfHosted: -1 }),
      why: (a) =>
        `${L(a, "load")} yük və «${L(a, "workload")}» profil: Kafka növbə yox, saxlanan hadisə jurnalıdır — eyni axını bir neçə müstəqil istehlakçı öz sürəti ilə oxuyur, yeni istehlakçı isə keçmişi əvvəldən təkrar oxuya bilir.`,
      wrongWhen:
        "Yük bu səviyyəyə çatmayanda: bölmə (partition), istehlakçı qrupu, offset idarəsi və saxlama siyasəti kiçik komandanın gündəlik problemi olur. «Sadəcə fon işi» üçün bu, artıq alətdir.",
      insteadWhen:
        "eyni hadisəni bir neçə sistem oxumalıdırsa və axın davamlı olaraq böyükdürsə",
    },
  ],
};

const searchCard: CardSpec = {
  id: "search",
  area: "Axtarış qatı",
  candidates: [
    {
      pick: "Lazım deyil",
      score: (a) =>
        w(a.shape, {
          timeseries: 3,
          keyvalue: 3,
          graph: 2,
          relational: -1,
          document: -1,
        }) +
        w(a.load, { low: 2, medium: 1, high: -1, veryHigh: -2 }) +
        w(a.workload, { readHeavy: -2, writeHeavy: 2 }) +
        w(a.team, { solo: 2, small: 1, large: -1 }) +
        w(a.budget, { high: 2 }),
      why: (a) =>
        `«${L(a, "shape")}» forma və ${L(a, "load")} yük: giriş nöqtəsi açar və ya filtrdirsə, adi indeksli sorğu kifayət edir. Ayrıca axtarış sistemi məlumatın ikinci nüsxəsi və onu sinxron saxlamaq işi deməkdir.`,
      wrongWhen:
        "İstifadəçi sözü səhv yazanda və ya nəticələrin sıralanması vacib olanda: adi indeks «yaxın» nəticə tapmır, nə də uyğunluq balı verir.",
      insteadWhen:
        "istifadəçi mətn axtarmırsa, yalnız məlum açar üzrə süzgəc verirsə",
    },
    {
      pick: "PostgreSQL full-text (tsvector)",
      score: (a) =>
        w(a.shape, { relational: 3, document: 2, timeseries: -2, keyvalue: -2 }) +
        w(a.load, { low: 3, medium: 3, veryHigh: -3 }) +
        w(a.budget, { high: 3, medium: 1 }) +
        w(a.team, { solo: 2, small: 2, large: -1 }) +
        w(a.consistency, { strong: 1 }) +
        w(a.workload, { readHeavy: 1 }),
      why: (a) =>
        `${L(a, "load")} yük + «${L(a, "budget")}»: axtarış indeksi məlumatın yanında, eyni tranzaksiyada yenilənir — sinxronizasiya boru xətti yoxdur, gecikmə yoxdur, yeni servis yoxdur.`,
      wrongWhen:
        "Azərbaycan dilində söz kökü lazım olanda: Postgres-də hazır azərbaycan konfiqurasiyası yoxdur, «simple» isə «kitabları» ilə «kitab» sözünü fərqli sayır. Səhv yazıya dözüm və faset filtrləri də burada zəifdir.",
      insteadWhen:
        "korpus kiçikdirsə və axtarış məhsulun əsas funksiyası deyilsə",
    },
    {
      pick: "Meilisearch / Typesense",
      score: (a) =>
        w(a.shape, { document: 2, relational: 1 }) +
        w(a.load, { medium: 1, high: 3, veryHigh: 2 }) +
        w(a.workload, { readHeavy: 3, balanced: 1, writeHeavy: -1 }) +
        w(a.latency, { tight: 2 }) +
        w(a.budget, { medium: 1, low: 1 }) +
        w(a.team, { small: 1, medium: 2, large: 1 }),
      why: (a) =>
        `«${L(a, "workload")}» profil + «${L(a, "latency")}» hədəf: səhv yazıya dözümlü, hərf-hərf yazıldıqca cavab verən axtarış hazır gəlir və konfiqurasiyası bir neçə sətirdir. ${L(a, "load")} yükdə tək instans adətən kifayət edir.`,
      wrongWhen:
        "Korpus onlarla milyon sənədə çatanda və ya axtarışın üstündə dərin analitik aqreqasiya lazım olanda: bu alətlər sadəlik üçün qurulub və orada həddə dəyirlər.",
      insteadWhen:
        "axtarış istifadəçi üçün əsas girişdirsə, korpus isə milyonlarla sənəddən azdırsa",
    },
    {
      pick: "Elasticsearch / OpenSearch",
      score: (a) =>
        w(a.shape, { document: 2, timeseries: 2, keyvalue: -2, graph: -2 }) +
        w(a.load, { low: -3, medium: -1, high: 2, veryHigh: 4 }) +
        w(a.team, { solo: -4, small: -2, medium: 1, large: 3 }) +
        w(a.budget, { high: -3, medium: -1, low: 1 }) +
        w(a.workload, { readHeavy: 2 }) +
        w(a.ops, { managed: 1, selfHosted: -1 }),
      why: (a) =>
        `${L(a, "load")} yük + ${L(a, "team")} komanda: faset, aqreqasiya, çoxdilli analiz və log axtarışı bir sistemdə birləşir; klaster üfüqi genişlənir və axtarışdan başqa müşahidə (observability) yükünü də daşıya bilir.`,
      wrongWhen:
        "Kiçik komandada: klaster, shard sayı, yaddaş ayarları və versiya yüksəlişi ayrıca iş yerinə çevrilir. Xərc də adətən əsas bazadan yüksək olur.",
      insteadWhen:
        "korpus və sorğu həcmi böyükdürsə və faset/aqreqasiya tələb olunursa",
    },
  ],
};

const cards: readonly CardSpec[] = [
  databaseCard,
  cacheCard,
  deploymentCard,
  queueCard,
  searchCard,
];

export function recommend(answers: Answers): Recommendation[] {
  return cards.map((card) => {
    const ranked = card.candidates
      .map((candidate, index) => ({
        candidate,
        index,
        score: candidate.score(answers),
      }))
      // Declaration order is the second sort key: an equal score must always
      // resolve the same way, and the safer option is listed first in each card.
      .sort((a, b) => b.score - a.score || a.index - b.index);

    const [best, runnerUp] = ranked;
    const margin = best.score - runnerUp.score;

    return {
      id: card.id,
      area: card.area,
      pick: best.candidate.pick,
      why: best.candidate.why(answers),
      wrongWhen: best.candidate.wrongWhen,
      alternative: runnerUp.candidate.pick,
      alternativeWhen: runnerUp.candidate.insteadWhen,
      confidence: margin >= 4 ? "high" : margin >= 2 ? "medium" : "low",
    };
  });
}

export const confidenceLabels: Record<Confidence, string> = {
  high: "aydın seçim",
  medium: "ehtimallı",
  low: "sərhəd hal",
};

/** One line describing the chosen profile — the header of the copied report. */
export function profileSummary(answers: Answers): string {
  return questions
    .map((question) => `${question.label}: ${answerLabel(answers, question.id)}`)
    .join(" · ");
}

export function formatReport(answers: Answers): string {
  const lines = [
    "Arxitektura seçimi — ilkin istiqamət",
    "",
    profileSummary(answers),
    "",
  ];

  for (const item of recommend(answers)) {
    lines.push(
      `## ${item.area}: ${item.pick} (${confidenceLabels[item.confidence]})`,
      `Niyə: ${item.why}`,
      `Nə vaxt səhv olar: ${item.wrongWhen}`,
      `Alternativ: ${item.alternative} — ${item.alternativeWhen}.`,
      "",
    );
  }

  return lines.join("\n").trimEnd();
}
