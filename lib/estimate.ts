/*
 * The project estimator's arithmetic, kept out of React on purpose: it is the
 * part that makes a claim about the real world, so it has to be testable
 * (`pnpm verify:tools`) and readable by someone who wants to change a number
 * without reading a component.
 *
 * The unit is a working day, and that is the whole point of this file. The
 * first version counted weeks, because weeks are what the industry quotes —
 * and the industry quotes the pace of a team writing every line by hand. This
 * site was built in hours, not months, and an estimator that answers "three
 * weeks" to a day of work is not conservative, it is wrong. The table below is
 * calibrated to one person working with AI assistance, which is how the work
 * actually happens here.
 *
 * The model is deliberately coarse. Every answer contributes a range in days,
 * the ranges add up, and two multipliers widen the result. It never returns a
 * single number, because a single number here would be a false claim: the
 * honest output of four questions is a band and a list of what is not in it.
 *
 * No money. The site quotes duration and scope; the price belongs in a
 * conversation, not in a calculator that has not seen the codebase.
 */

export type Range = { min: number; max: number };

export const PROJECT_KINDS = [
  { id: "veb", label: "Fərdi veb tətbiq", days: { min: 4, max: 8 } },
  { id: "saas", label: "SaaS məhsulu", days: { min: 8, max: 15 } },
  { id: "panel", label: "Daxili idarəetmə paneli", days: { min: 3, max: 6 } },
  { id: "elave", label: "Mövcud sistemə əlavə", days: { min: 1, max: 4 } },
  { id: "mvp", label: "MVP / prototip", days: { min: 2, max: 4 } },
] as const;

export type ProjectKind = (typeof PROJECT_KINDS)[number]["id"];

export const FEATURES = [
  { id: "hesablar", label: "İstifadəçi hesabları və icazələr", days: { min: 0.5, max: 1 } },
  { id: "odenis", label: "Ödəniş qəbulu", days: { min: 1, max: 2 } },
  { id: "admin", label: "Admin paneli", days: { min: 0.5, max: 1.5 } },
  { id: "hesabatlar", label: "Hesabat və statistika", days: { min: 0.5, max: 1.5 } },
  { id: "media", label: "Fayl və media yükləmə", days: { min: 0.5, max: 1 } },
  { id: "realtime", label: "Real-time (canlı yenilənmə, bildiriş)", days: { min: 1, max: 2 } },
  { id: "ai", label: "Süni intellekt funksiyası", days: { min: 1, max: 3 } },
  { id: "coxdilli", label: "Çoxdillilik", days: { min: 0.5, max: 1 } },
] as const;

export type FeatureId = (typeof FEATURES)[number]["id"];

/** Each third-party service to wire up, on top of the features above. */
export const INTEGRATION_DAYS: Range = { min: 0.5, max: 1 };
export const MAX_INTEGRATIONS = 6;

export const SCALES = [
  { id: "kicik", label: "Bir neçə yüz istifadəçi", factor: 1 },
  { id: "orta", label: "Minlərlə istifadəçi", factor: 1.15 },
  { id: "boyuk", label: "On minlərlə və daha çox", factor: 1.35 },
] as const;

export type ScaleId = (typeof SCALES)[number]["id"];

export const DEADLINES = [
  { id: "esnek", label: "Tarix çevikdir" },
  { id: "planli", label: "Konkret tarix var, amma məsafə real görünür" },
  { id: "tecili", label: "Təcilidir" },
] as const;

export type DeadlineId = (typeof DEADLINES)[number]["id"];

/** Migration is sized as its own small project, not as a checkbox. */
const MIGRATION_DAYS: Range = { min: 1, max: 2 };
/* Working inside a system somebody else wrote costs reading time before the
   first line is changed. */
const EXISTING_SYSTEM_FACTOR = 1.12;

export type Answers = {
  kind: ProjectKind;
  features: FeatureId[];
  integrations: number;
  scale: ScaleId;
  existingSystem: boolean;
  migration: boolean;
  deadline: DeadlineId;
};

export const DEFAULT_ANSWERS: Answers = {
  kind: "veb",
  features: [],
  integrations: 0,
  scale: "kicik",
  existingSystem: false,
  migration: false,
  deadline: "esnek",
};

export type Phase = { id: string; name: string; days: Range };

export type Estimate = {
  phases: Phase[];
  total: Range;
  risks: string[];
  assumptions: string[];
};

/*
 * How the total splits across the way the work actually runs. The shares are
 * fixed because they describe a process, not a project: discovery and release
 * do not disappear when the build gets bigger.
 */
const PHASES: { id: string; name: string; share: number }[] = [
  { id: "kesfiyyat", name: "Kəşfiyyat və tələblər", share: 0.12 },
  { id: "dizayn", name: "Dizayn və texniki plan", share: 0.15 },
  { id: "qurulma", name: "Qurulma", share: 0.45 },
  { id: "sinaq", name: "Sınaq və düzəlişlər", share: 0.16 },
  { id: "buraxilis", name: "Buraxılış və təhvil", share: 0.12 },
];

const ASSUMPTIONS = [
  "Rəqəm iş həcminin təxminidir, təklif deyil — dəqiq müddət söhbətdən sonra verilir.",
  "Ölçü iş günüdür: bir nəfərin süni intellektlə işlədiyi templə, komanda norması ilə yox.",
  "Dizayn faylı hazır deyilsə, dizayn mərhələsi bu aralığın içindədir; ayrıca brend işi daxil deyil.",
  "Mətn, şəkil və məhsul məlumatı sizin tərəfinizdən gəlir.",
  "Hostinq, domen və üçüncü tərəf xidmətlərinin abunə haqqı daxil deyil.",
  "Sizin tərəfinizdən sual-cavab bir iş günü ərzində gəlirsə bu müddət saxlanılır.",
];

function round(value: number): number {
  /* Half-day steps: the model is not precise enough to promise an hour. */
  return Math.round(value * 2) / 2;
}

function lookup<T extends { id: string }>(list: readonly T[], id: string): T {
  return list.find((item) => item.id === id) ?? list[0]!;
}

/** Clamps the integration count to the range the form can actually express. */
export function normaliseIntegrations(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_INTEGRATIONS, Math.max(0, Math.round(value)));
}

function risks(answers: Answers): string[] {
  const found: string[] = [];

  if (answers.deadline === "tecili") {
    found.push(
      "Təcili tarix müddəti qısaltmır — əhatəni kiçildir. Birinci söhbətdə hansı hissənin birinci buraxılışdan kənarda qalacağını seçirəm.",
    );
  }
  if (answers.migration) {
    found.push(
      "Məlumat köçürülməsi ən çox sürpriz çıxan mərhələdir: köhnə məlumatın vəziyyəti işə başlamazdan əvvəl bir nüsxə üzərində yoxlanılır.",
    );
  }
  if (answers.existingSystem) {
    found.push(
      "Mövcud sistemə toxunulacaq: ilk günlər kod oxumağa gedir və aralıq bunu nəzərə alır.",
    );
  }
  if (answers.features.includes("odenis")) {
    found.push(
      "Ödəniş inteqrasiyasında əsas iş uğursuz ssenarilərdədir; provayderin təsdiq müddəti bizdən asılı deyil.",
    );
  }
  if (answers.features.includes("ai")) {
    found.push(
      "Süni intellekt funksiyası pilotla başlayır: nəticə ölçülməsə, aralıq mənasızdır.",
    );
  }
  if (answers.integrations >= 3) {
    found.push(
      "Üç və daha çox xarici xidmət: onların sənədləşməsi və limitləri işin sürətini bizim kodumuz qədər müəyyən edir.",
    );
  }

  return found;
}

export function estimate(answers: Answers): Estimate {
  const kind = lookup(PROJECT_KINDS, answers.kind);
  const scale = lookup(SCALES, answers.scale);
  const integrations = normaliseIntegrations(answers.integrations);

  let min = kind.days.min;
  let max = kind.days.max;

  /* Unknown ids are dropped rather than defaulted: a stale link should lose a
     checkbox, not silently add weeks the visitor never asked for. */
  for (const id of answers.features) {
    const feature = FEATURES.find((f) => f.id === id);
    if (!feature) continue;
    min += feature.days.min;
    max += feature.days.max;
  }

  min += integrations * INTEGRATION_DAYS.min;
  max += integrations * INTEGRATION_DAYS.max;

  if (answers.migration) {
    min += MIGRATION_DAYS.min;
    max += MIGRATION_DAYS.max;
  }

  const factor = scale.factor * (answers.existingSystem ? EXISTING_SYSTEM_FACTOR : 1);
  min *= factor;
  max *= factor;

  /* A day is the smallest thing this model can honestly name: below that the
     answer is "bir gündən az", not a number. */
  const total = { min: Math.max(1, Math.floor(min)), max: Math.max(2, Math.ceil(max)) };

  const phases = PHASES.map((phase) => ({
    id: phase.id,
    name: phase.name,
    days: {
      min: Math.max(0.5, round(total.min * phase.share)),
      max: Math.max(0.5, round(total.max * phase.share)),
    },
  }));

  return { phases, total, risks: risks(answers), assumptions: ASSUMPTIONS };
}

/*
 * The answers travel in the URL, so a visitor can send the estimate to a
 * colleague and the back button steps through the questions. The reader is
 * deliberately forgiving: an edited or truncated link falls back to the
 * default rather than showing an error nobody can act on.
 */
export function answersToQuery(answers: Answers): string {
  const params = new URLSearchParams();
  params.set("n", answers.kind);
  if (answers.features.length) params.set("f", answers.features.join("."));
  if (answers.integrations) params.set("i", String(answers.integrations));
  params.set("m", answers.scale);
  if (answers.existingSystem) params.set("x", "1");
  if (answers.migration) params.set("k", "1");
  params.set("t", answers.deadline);
  return params.toString();
}

export function answersFromQuery(query: string | URLSearchParams): Answers {
  const params = typeof query === "string" ? new URLSearchParams(query) : query;

  const kind = PROJECT_KINDS.find((k) => k.id === params.get("n"))?.id;
  const scale = SCALES.find((s) => s.id === params.get("m"))?.id;
  const deadline = DEADLINES.find((d) => d.id === params.get("t"))?.id;
  const features = (params.get("f") ?? "")
    .split(".")
    .filter((id): id is FeatureId => FEATURES.some((f) => f.id === id));

  return {
    kind: kind ?? DEFAULT_ANSWERS.kind,
    features,
    integrations: normaliseIntegrations(Number(params.get("i") ?? 0)),
    scale: scale ?? DEFAULT_ANSWERS.scale,
    existingSystem: params.get("x") === "1",
    migration: params.get("k") === "1",
    deadline: deadline ?? DEFAULT_ANSWERS.deadline,
  };
}

/** The estimate as plain text, so it can travel in an enquiry. */
export function estimateSummary(answers: Answers, result: Estimate): string {
  const features = answers.features
    .map((id) => FEATURES.find((f) => f.id === id)?.label)
    .filter(Boolean);

  return [
    `Layihə növü: ${lookup(PROJECT_KINDS, answers.kind).label}`,
    `Funksiyalar: ${features.length ? features.join(", ") : "seçilməyib"}`,
    /* The clamped count, because that is the one the range below was priced
       from. A hand-edited link that said 999 used to be copied straight into
       the enquiry under an estimate computed at 6. */
    `İnteqrasiya sayı: ${normaliseIntegrations(answers.integrations)}`,
    `Miqyas: ${lookup(SCALES, answers.scale).label}`,
    `Mövcud sistem: ${answers.existingSystem ? "var" : "yoxdur"}`,
    `Məlumat köçürülməsi: ${answers.migration ? "lazımdır" : "lazım deyil"}`,
    `Tarix: ${lookup(DEADLINES, answers.deadline).label}`,
    `Alətin verdiyi aralıq: ${result.total.min}-${result.total.max} iş günü`,
  ].join("\n");
}
