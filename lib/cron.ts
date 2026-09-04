/**
 * Standard five-field cron: minute, hour, day-of-month, month, day-of-week.
 * Pure functions with no `Date.now()` inside — `nextRuns` is handed its start
 * point, so the schedule the page prints is the schedule a test can assert.
 */

export type CronFieldName =
  | "minute"
  | "hour"
  | "dayOfMonth"
  | "month"
  | "dayOfWeek";

export type CronPart =
  | { kind: "all"; step: number }
  | { kind: "value"; value: number }
  | { kind: "range"; from: number; to: number; step: number };

export type CronField = {
  name: CronFieldName;
  /** Field name as shown in the table. */
  label: string;
  /** Exactly what the user typed for this field. */
  raw: string;
  parts: CronPart[];
  /** Sorted, unique, day-of-week 7 already folded into 0. */
  values: number[];
  /** Only a literal star (or a step of one) leaves the field unrestricted. */
  wildcard: boolean;
  /** Which moments the field matches, as a readable list. */
  matchText: string;
  /** One-line reading of the field. */
  summary: string;
};

export type ParsedCron = {
  /** Whitespace collapsed to single spaces. */
  expression: string;
  fields: CronField[];
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
  /** Both day fields restricted — cron then ORs them. The classic misread. */
  dayOrRule: boolean;
};

export type CronError = {
  /** 1-based field position, or null when the whole expression is wrong. */
  fieldIndex: number | null;
  fieldLabel: string | null;
  message: string;
};

export type CronParseResult =
  | { ok: true; cron: ParsedCron }
  | { ok: false; error: CronError };

export type NextRunsResult = {
  runs: Date[];
  /** Nothing inside the horizon — "30 February" and its relatives. */
  never: boolean;
  /** Fewer than `count` found before the horizon ran out. */
  truncated: boolean;
  horizonYears: number;
};

type FieldSpec = {
  name: CronFieldName;
  label: string;
  min: number;
  max: number;
  rangeText: string;
  /** Unit word for the summary, plus its ablative form for step phrases. */
  unit: string;
  unitFrom: string;
  tokens?: string[];
  tokenBase?: number;
};

const MONTH_TOKENS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

const DOW_TOKENS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const MONTH_NAMES = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avqust",
  "sentyabr",
  "oktyabr",
  "noyabr",
  "dekabr",
];

const DAY_NAMES = [
  "bazar",
  "bazar ertəsi",
  "çərşənbə axşamı",
  "çərşənbə",
  "cümə axşamı",
  "cümə",
  "şənbə",
];

const ORDINALS = ["1-ci", "2-ci", "3-cü", "4-cü", "5-ci"];

const FIELD_SPECS: FieldSpec[] = [
  {
    name: "minute",
    label: "dəqiqə",
    min: 0,
    max: 59,
    rangeText: "0–59",
    unit: "dəqiqə",
    unitFrom: "dəqiqədən",
  },
  {
    name: "hour",
    label: "saat",
    min: 0,
    max: 23,
    rangeText: "0–23",
    unit: "saat",
    unitFrom: "saatdan",
  },
  {
    name: "dayOfMonth",
    label: "ayın günü",
    min: 1,
    max: 31,
    rangeText: "1–31",
    unit: "gün",
    unitFrom: "gündən",
  },
  {
    name: "month",
    label: "ay",
    min: 1,
    max: 12,
    rangeText: "1–12",
    unit: "ay",
    unitFrom: "aydan",
    tokens: MONTH_TOKENS,
    tokenBase: 1,
  },
  {
    name: "dayOfWeek",
    label: "həftənin günü",
    min: 0,
    max: 7,
    rangeText: "0–7, 7 = bazar",
    unit: "gün",
    unitFrom: "gündən",
    tokens: DOW_TOKENS,
    tokenBase: 0,
  },
];

export const cronExamples: { expression: string; label: string }[] = [
  { expression: "* * * * *", label: "Hər dəqiqə" },
  { expression: "0 * * * *", label: "Hər saat başı" },
  { expression: "0 3 * * *", label: "Hər gecə 03:00" },
  { expression: "0 9 * * 1", label: "Hər bazar ertəsi 09:00" },
  { expression: "0 0 1 * *", label: "Ayın 1-i 00:00" },
  { expression: "*/15 * * * 1-5", label: "İş günləri hər 15 dəqiqə" },
];

const pad2 = (value: number) => String(value).padStart(2, "0");

class FieldError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "FieldError";
  }
}

function normalise(value: number, spec: FieldSpec): number {
  // 0 and 7 are both Sunday; folding here keeps every later comparison simple.
  return spec.name === "dayOfWeek" ? value % 7 : value;
}

function readValue(text: string, spec: FieldSpec): number {
  const token = text.trim();
  if (token === "") throw new FieldError("boş dəyər var.");

  let value: number;
  if (/^\d+$/.test(token)) {
    value = Number(token);
  } else {
    const index = spec.tokens?.indexOf(token.toUpperCase()) ?? -1;
    if (index < 0) throw new FieldError(`"${token}" tanınmır.`);
    value = index + (spec.tokenBase ?? 0);
  }

  if (value < spec.min || value > spec.max) {
    throw new FieldError(
      `${value} icazə verilən aralıqdan (${spec.rangeText}) kənardır.`,
    );
  }
  return value;
}

function expandField(raw: string, spec: FieldSpec) {
  const text = raw.trim();
  if (text === "") throw new FieldError("sahə boşdur.");

  const parts: CronPart[] = [];
  const values = new Set<number>();

  for (const chunk of text.split(",")) {
    const piece = chunk.trim();
    if (piece === "") {
      throw new FieldError(`"${text}" siyahısında boş element var.`);
    }

    const slices = piece.split("/");
    if (slices.length > 2) {
      throw new FieldError(`"${piece}" ifadəsində birdən çox "/" var.`);
    }

    let step = 1;
    if (slices.length === 2) {
      const stepText = slices[1].trim();
      if (!/^\d+$/.test(stepText)) {
        throw new FieldError(`"${piece}": addım müsbət tam ədəd olmalıdır.`);
      }
      step = Number(stepText);
      if (step === 0) throw new FieldError(`"${piece}": addım 0 ola bilməz.`);
    }

    const base = slices[0].trim();

    if (base === "*") {
      parts.push({ kind: "all", step });
      for (let v = spec.min; v <= spec.max; v += step) values.add(normalise(v, spec));
      continue;
    }

    const dash = base.indexOf("-");
    if (dash > 0) {
      const from = readValue(base.slice(0, dash), spec);
      const to = readValue(base.slice(dash + 1), spec);
      if (from > to) {
        throw new FieldError(`"${base}": aralığın başlanğıcı sonundan böyükdür.`);
      }
      parts.push({ kind: "range", from, to, step });
      for (let v = from; v <= to; v += step) values.add(normalise(v, spec));
      continue;
    }

    const value = readValue(base, spec);
    if (slices.length === 2) {
      // "5/10" is Vixie cron's shorthand for "5-<max>/10".
      parts.push({ kind: "range", from: value, to: spec.max, step });
      for (let v = value; v <= spec.max; v += step) values.add(normalise(v, spec));
    } else {
      parts.push({ kind: "value", value });
      values.add(normalise(value, spec));
    }
  }

  return { parts, values: [...values].sort((a, b) => a - b) };
}

function valueLabel(spec: FieldSpec, value: number): string {
  if (spec.name === "month") return MONTH_NAMES[value - 1] ?? String(value);
  if (spec.name === "dayOfWeek") return DAY_NAMES[value % 7] ?? String(value);
  return String(value);
}

/** Possessive form of a day number; the suffix follows the last spoken word. */
function monthDayPossessive(value: number): string {
  const unitSuffix = ["", "i", "si", "ü", "ü", "i", "sı", "si", "i", "u"];
  const tensSuffix: Record<number, string> = { 10: "u", 20: "si", 30: "u" };
  const unit = value % 10;
  const suffix = unit === 0 ? (tensSuffix[value] ?? "u") : unitSuffix[unit];
  return `${value}-${suffix}`;
}

/**
 * Locative suffix for a clock time. Vowel harmony follows the last spoken word,
 * which for HH:MM is the minute, so 30 and 15 take different suffixes.
 */
function clockSuffix(minute: number): string {
  const unitVowel: Record<number, string> = {
    1: "də",
    2: "də",
    3: "də",
    4: "də",
    5: "də",
    6: "da",
    7: "də",
    8: "də",
    9: "da",
  };
  const tensVowel: Record<number, string> = {
    0: "da",
    10: "da",
    20: "də",
    30: "da",
    40: "da",
    50: "də",
  };
  const unit = minute % 10;
  return unit === 0 ? (tensVowel[minute] ?? "da") : unitVowel[unit];
}

function joinAz(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} və ${items[items.length - 1]}`;
}

function capitalise(text: string): string {
  // Not `toLocaleUpperCase("az")`: a browser without that locale upper-cases
  // "i" to "I", which is a different letter in this alphabet.
  const first = text.charAt(0);
  return (first === "i" ? "İ" : first.toUpperCase()) + text.slice(1);
}

function fieldMatchText(
  spec: FieldSpec,
  values: number[],
  wildcard: boolean,
): string {
  if (wildcard) return `hamısı (${spec.rangeText})`;
  if (spec.name === "month" || spec.name === "dayOfWeek") {
    return values.map((value) => valueLabel(spec, value)).join(", ");
  }
  if (values.length <= 12) return values.join(", ");
  return `${values.length} dəyər · ${values[0]}–${values[values.length - 1]}`;
}

function partPhrase(part: CronPart, spec: FieldSpec): string {
  if (part.kind === "all") {
    return part.step === 1
      ? `hər ${spec.unit}`
      : `hər ${part.step} ${spec.unitFrom} bir`;
  }
  if (part.kind === "value") return valueLabel(spec, part.value);

  const base = `${valueLabel(spec, part.from)}–${valueLabel(spec, part.to)} arası`;
  return part.step === 1 ? base : `${base} hər ${part.step} ${spec.unitFrom} bir`;
}

function fieldSummary(spec: FieldSpec, parts: CronPart[]): string {
  const onlyValues = parts.every((part) => part.kind === "value");
  if (onlyValues) {
    const values = parts.map((part) => (part.kind === "value" ? part.value : 0));
    return spec.name === "dayOfMonth"
      ? `ayın ${joinAz(values.map(monthDayPossessive))}`
      : `yalnız ${joinAz(values.map((value) => valueLabel(spec, value)))}`;
  }
  return parts.map((part) => partPhrase(part, spec)).join(", ");
}

function fieldCountMessage(count: number): string {
  if (count === 6) {
    return "Cron ifadəsi 5 sahədən ibarət olmalıdır: burada 6 sahə var. Altıncı sahə (saniyə və ya il) yalnız Quartz və node-cron kimi sistemlərdə var, standart crontab-da yoxdur.";
  }
  return `Cron ifadəsi 5 sahədən ibarət olmalıdır: burada ${count} sahə var. Sıra belədir: dəqiqə, saat, ayın günü, ay, həftənin günü.`;
}

export function parseCron(expression: string): CronParseResult {
  const text = expression.trim().replace(/\s+/g, " ");
  if (text === "") {
    return {
      ok: false,
      error: {
        fieldIndex: null,
        fieldLabel: null,
        message: "Boş sahə: cron ifadəsini yaz (məsələn: 0 3 * * *).",
      },
    };
  }

  const chunks = text.split(" ");
  if (chunks.length !== 5) {
    return {
      ok: false,
      error: {
        fieldIndex: null,
        fieldLabel: null,
        message: fieldCountMessage(chunks.length),
      },
    };
  }

  const fields: CronField[] = [];
  for (let index = 0; index < FIELD_SPECS.length; index += 1) {
    const spec = FIELD_SPECS[index];
    const raw = chunks[index];
    try {
      const { parts, values } = expandField(raw, spec);
      const wildcard = raw === "*" || raw === "*/1";
      fields.push({
        name: spec.name,
        label: spec.label,
        raw,
        parts,
        values,
        wildcard,
        matchText: fieldMatchText(spec, values, wildcard),
        summary: fieldSummary(spec, parts),
      });
    } catch (error) {
      if (error instanceof FieldError) {
        return {
          ok: false,
          error: {
            fieldIndex: index + 1,
            fieldLabel: spec.label,
            message: `${ORDINALS[index]} sahə (${spec.label}): ${error.detail}`,
          },
        };
      }
      throw error;
    }
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return {
    ok: true,
    cron: {
      expression: text,
      fields,
      minute,
      hour,
      dayOfMonth,
      month,
      dayOfWeek,
      dayOrRule: !dayOfMonth.wildcard && !dayOfWeek.wildcard,
    },
  };
}

function singleValue(field: CronField): number | null {
  return field.values.length === 1 ? field.values[0] : null;
}

/** `*` with a step: the whole range walked in jumps, and nothing else. */
function fullStep(field: CronField): number | null {
  if (field.parts.length !== 1) return null;
  const part = field.parts[0];
  return part.kind === "all" && part.step > 1 ? part.step : null;
}

function singleRange(field: CronField) {
  if (field.parts.length !== 1) return null;
  const part = field.parts[0];
  return part.kind === "range" ? part : null;
}

function describeHourSet(hour: CronField): string {
  const step = fullStep(hour);
  if (step !== null) return `hər ${step} saatdan bir`;

  const range = singleRange(hour);
  if (range && range.step === 1) return `saat ${range.from}–${range.to} arası`;
  if (range) {
    return `saat ${range.from}–${range.to} arası hər ${range.step} saatdan bir`;
  }
  return `saat ${joinAz(hour.values.map(String))} olanda`;
}

function describeTime(minute: CronField, hour: CronField) {
  const m = singleValue(minute);
  const h = singleValue(hour);

  if (m !== null && h !== null) {
    return { text: `saat ${pad2(h)}:${pad2(m)}-${clockSuffix(m)}`, isClock: true };
  }

  if (m !== null && hour.wildcard) {
    return m === 0
      ? { text: "hər saat başı", isClock: false }
      : { text: `hər saat :${pad2(m)} dəqiqədə`, isClock: false };
  }

  if (m !== null && hour.values.length <= 4) {
    const stamps = hour.values.map((value) => `${pad2(value)}:${pad2(m)}`);
    return { text: `saat ${joinAz(stamps)}-${clockSuffix(m)}`, isClock: true };
  }

  const step = fullStep(minute);
  const minutePart = minute.wildcard
    ? "hər dəqiqə"
    : step !== null
      ? `hər ${step} dəqiqədən bir`
      : m !== null
        ? m === 0
          ? "hər saat başı"
          : `hər saat :${pad2(m)} dəqiqədə`
        : `${joinAz(minute.values.map((value) => `:${pad2(value)}`))} dəqiqələrində`;

  if (hour.wildcard) return { text: minutePart, isClock: false };

  // A stepped hour set already reads as a clause, so it needs a comma; a plain
  // range reads as a phrase and runs straight into the minute part.
  const hourPart = describeHourSet(hour);
  const separator = hourPart.startsWith("hər") ? ", " : " ";
  return { text: `${hourPart}${separator}${minutePart}`, isClock: false };
}

function describeMonthDays(field: CronField, monthRestricted: boolean): string {
  const prefix = monthRestricted ? "" : "hər ";
  const step = fullStep(field);
  if (step !== null) return `${prefix}ayın hər ${step} günündən bir`;

  const range = singleRange(field);
  if (range && range.step === 1) {
    return `${prefix}ayın ${range.from}–${range.to} günləri`;
  }

  if (field.values.length <= 5) {
    return `${prefix}ayın ${joinAz(field.values.map(monthDayPossessive))}`;
  }
  return `${prefix}ayın ${field.values.length} günü (${field.raw})`;
}

function describeWeekDays(field: CronField): string {
  const set = field.values.join(",");
  if (set === "1,2,3,4,5") return "iş günləri";
  if (set === "0,6") return "həftə sonu";
  if (field.values.length === 1) return `hər ${DAY_NAMES[field.values[0]]}`;
  return `${joinAz(field.values.map((value) => DAY_NAMES[value]))} günləri`;
}

function describeMonths(field: CronField): string {
  if (field.wildcard) return "";
  const names = field.values.map((value) => MONTH_NAMES[value - 1]);
  return `${joinAz(names)} ${names.length === 1 ? "ayında" : "aylarında"}`;
}

export function describeCron(cron: ParsedCron): string {
  const time = describeTime(cron.minute, cron.hour);
  const monthPart = describeMonths(cron.month);
  const monthRestricted = monthPart !== "";

  let dayPart: string;
  if (cron.dayOfMonth.wildcard && cron.dayOfWeek.wildcard) {
    // The "every day" phrase earns its place only before a clock time; in front
    // of "every minute" it repeats what the time phrase already says.
    dayPart = time.isClock || monthRestricted ? "hər gün" : "";
  } else {
    const domPart = cron.dayOfMonth.wildcard
      ? ""
      : describeMonthDays(cron.dayOfMonth, monthRestricted);
    const dowPart = cron.dayOfWeek.wildcard
      ? ""
      : describeWeekDays(cron.dayOfWeek);
    dayPart = domPart && dowPart ? `${domPart} və ya ${dowPart}` : domPart || dowPart;
  }

  const sentence = [monthPart, dayPart, time.text].filter(Boolean).join(" ");
  return capitalise(sentence);
}

/** How many times a matching day fires: the minute set times the hour set. */
export function runsPerMatchingDay(cron: ParsedCron): number {
  return cron.minute.values.length * cron.hour.values.length;
}

function dayMatches(cron: ParsedCron, date: Date): boolean {
  if (!cron.month.values.includes(date.getMonth() + 1)) return false;

  const domHit = cron.dayOfMonth.values.includes(date.getDate());
  const dowHit = cron.dayOfWeek.values.includes(date.getDay());

  if (cron.dayOfMonth.wildcard && cron.dayOfWeek.wildcard) return true;
  if (cron.dayOfMonth.wildcard) return dowHit;
  if (cron.dayOfWeek.wildcard) return domHit;
  // Both restricted: cron ORs them, so the 13th fires and every Friday fires.
  return domHit || dowHit;
}

const HORIZON_YEARS = 4;

/**
 * Walks whole days, not minutes: "0 0 30 2 *" never matches, and a search that
 * stepped a minute at a time would burn two million iterations proving it.
 */
export function nextRuns(
  cron: ParsedCron,
  count: number,
  from: Date,
): NextRunsResult {
  const runs: Date[] = [];
  if (count <= 0 || Number.isNaN(from.getTime())) {
    return { runs, never: false, truncated: false, horizonYears: HORIZON_YEARS };
  }

  const limit = new Date(from.getTime());
  limit.setFullYear(limit.getFullYear() + HORIZON_YEARS);

  let cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let stop = false;

  while (!stop && runs.length < count && cursor.getTime() <= limit.getTime()) {
    if (dayMatches(cron, cursor)) {
      for (const hour of cron.hour.values) {
        for (const minute of cron.minute.values) {
          const at = new Date(
            cursor.getFullYear(),
            cursor.getMonth(),
            cursor.getDate(),
            hour,
            minute,
          );
          if (at.getTime() <= from.getTime()) continue;
          if (at.getTime() > limit.getTime()) {
            stop = true;
            break;
          }
          runs.push(at);
          if (runs.length >= count) break;
        }
        if (stop || runs.length >= count) break;
      }
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }

  return {
    runs,
    never: runs.length === 0,
    truncated: runs.length < count,
    horizonYears: HORIZON_YEARS,
  };
}
