/*
 * Sizes, speeds, durations and availability budgets — the four conversions a
 * developer looks up while reading a spec, kept in one place because they are
 * the same arithmetic seen from four sides: a quantity, a quantity per second,
 * a span of time, and a fraction of a span of time.
 *
 * The reason this tool exists at all is the pair of ladders. A gigabyte is
 * 1 000 000 000 bytes to the company that sold the disk and 1 073 741 824
 * bytes to the operating system that formatted it, and neither of them says
 * which one it means. Every other converter picks a side; this one prints both
 * columns beside each other, which is the only way the 7,4% gap stops being a
 * mystery.
 *
 * React-free on purpose: the widget in `components/tools/olcu-vahidleri-tool`
 * draws these numbers and the check file in `scripts/tools-checks` runs them,
 * and neither should need the other.
 */
import { formatNumber } from "../shared/format";
import type { ReferenceRow, ReferenceSection } from "./reference";

/* ---------- data volume ---------- */

export type ByteUnit =
  | "bit"
  | "B"
  | "kB"
  | "KiB"
  | "MB"
  | "MiB"
  | "GB"
  | "GiB"
  | "TB"
  | "TiB"
  | "PB"
  | "PiB";

const BITS_PER_BYTE = 8;

/*
 * How many bytes one of each unit is. `bit` is 0,125 rather than 1/8 written
 * as a division at every call site, and it costs nothing in precision: 0,125
 * is 2⁻³, which a double holds exactly, so `toBytes(8, "bit")` is 1 and not
 * 0,9999999999999999. Every other factor here is either a power of two or a
 * power of ten under 2⁵³, so they are exact too — which is what makes
 * `toBytes(1, "GiB")` land on 1 073 741 824 and not near it.
 */
const BYTE_FACTORS: Record<ByteUnit, number> = {
  bit: 1 / BITS_PER_BYTE,
  B: 1,
  kB: 1e3,
  KiB: 1024,
  MB: 1e6,
  MiB: 1024 ** 2,
  GB: 1e9,
  GiB: 1024 ** 3,
  TB: 1e12,
  TiB: 1024 ** 4,
  PB: 1e15,
  PiB: 1024 ** 5,
};

export const BYTE_UNITS: ByteUnit[] = [
  "bit",
  "B",
  "kB",
  "KiB",
  "MB",
  "MiB",
  "GB",
  "GiB",
  "TB",
  "TiB",
  "PB",
  "PiB",
];

/** What each unit is called in the dropdown, so nobody has to guess "KiB". */
export const BYTE_UNIT_LABELS: Record<ByteUnit, string> = {
  bit: "bit",
  B: "bayt",
  kB: "kilobayt · 1000",
  KiB: "kibibayt · 1024",
  MB: "meqabayt · 1000²",
  MiB: "mebibayt · 1024²",
  GB: "giqabayt · 1000³",
  GiB: "gibibayt · 1024³",
  TB: "terabayt · 1000⁴",
  TiB: "tebibayt · 1024⁴",
  PB: "petabayt · 1000⁵",
  PiB: "pebibayt · 1024⁵",
};

/**
 * The decimal unit and the binary unit of the same rung, in order.
 *
 * The whole point of the first tab is that these are printed as pairs rather
 * than as one list of twelve, so the pairing is data and not a layout the
 * widget invents.
 */
export const BYTE_PAIRS: { decimal: ByteUnit; binary: ByteUnit }[] = [
  { decimal: "kB", binary: "KiB" },
  { decimal: "MB", binary: "MiB" },
  { decimal: "GB", binary: "GiB" },
  { decimal: "TB", binary: "TiB" },
  { decimal: "PB", binary: "PiB" },
];

export function toBytes(value: number, unit: ByteUnit): number {
  return value * BYTE_FACTORS[unit];
}

export function fromBytes(bytes: number, unit: ByteUnit): number {
  return bytes / BYTE_FACTORS[unit];
}

export function convertBytes(value: number, unit: ByteUnit): Record<ByteUnit, number> {
  const bytes = toBytes(value, unit);
  const result = {} as Record<ByteUnit, number>;
  for (const target of BYTE_UNITS) result[target] = fromBytes(bytes, target);
  return result;
}

/**
 * How much bigger the binary unit is than the decimal one of the same rung, in
 * percent: 2,4 for kB→KiB, 7,4 for GB→GiB, 12,6 for TB→TiB.
 *
 * This is the number the visitor came for, so it is computed from the factors
 * rather than typed into the copy — a table of gaps written by hand goes stale
 * the moment somebody adds a rung.
 */
export function binaryGapPercent(decimal: ByteUnit, binary: ByteUnit): number {
  return (BYTE_FACTORS[binary] / BYTE_FACTORS[decimal] - 1) * 100;
}

/* ---------- transfer speed ---------- */

export type SpeedUnit =
  | "bit/s"
  | "kbit/s"
  | "Mbit/s"
  | "Gbit/s"
  | "B/s"
  | "kB/s"
  | "MB/s"
  | "GB/s";

/** Bits per second, because that is the unit a link is actually sold in. */
const SPEED_FACTORS: Record<SpeedUnit, number> = {
  "bit/s": 1,
  "kbit/s": 1e3,
  "Mbit/s": 1e6,
  "Gbit/s": 1e9,
  "B/s": BITS_PER_BYTE,
  "kB/s": BITS_PER_BYTE * 1e3,
  "MB/s": BITS_PER_BYTE * 1e6,
  "GB/s": BITS_PER_BYTE * 1e9,
};

export const SPEED_UNITS: SpeedUnit[] = [
  "bit/s",
  "kbit/s",
  "Mbit/s",
  "Gbit/s",
  "B/s",
  "kB/s",
  "MB/s",
  "GB/s",
];

export const SPEED_UNIT_LABELS: Record<SpeedUnit, string> = {
  "bit/s": "bit / saniyə",
  "kbit/s": "kilobit / saniyə",
  "Mbit/s": "meqabit / saniyə",
  "Gbit/s": "giqabit / saniyə",
  "B/s": "bayt / saniyə",
  "kB/s": "kilobayt / saniyə",
  "MB/s": "meqabayt / saniyə",
  "GB/s": "giqabayt / saniyə",
};

export function toBitsPerSecond(value: number, unit: SpeedUnit): number {
  return value * SPEED_FACTORS[unit];
}

export function convertSpeed(value: number, unit: SpeedUnit): Record<SpeedUnit, number> {
  const bits = toBitsPerSecond(value, unit);
  const result = {} as Record<SpeedUnit, number>;
  for (const target of SPEED_UNITS) result[target] = bits / SPEED_FACTORS[target];
  return result;
}

/**
 * How long a file of this many bytes takes over a link of this many bits per
 * second — the question the whole speed tab is built around.
 *
 * No protocol overhead is subtracted. TCP, TLS and HTTP headers cost somewhere
 * between 3% and 10% of a real transfer, and the honest thing is to say that
 * in the copy rather than to bake a made-up efficiency factor into a number
 * that then cannot be checked by hand.
 */
export function transferSeconds(bytes: number, bitsPerSecond: number): number {
  if (bitsPerSecond <= 0) return Number.POSITIVE_INFINITY;
  return (bytes * BITS_PER_BYTE) / bitsPerSecond;
}

/* ---------- duration ---------- */

export type TimeUnit = "ms" | "s" | "min" | "h" | "d" | "wk" | "mo" | "yr";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
/** A month is 30 days and a year is 365 here, and every reading says so. */
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY;
const SECONDS_PER_WEEK = SECONDS_PER_DAY * DAYS_PER_WEEK;
const SECONDS_PER_MONTH = SECONDS_PER_DAY * DAYS_PER_MONTH;
const SECONDS_PER_YEAR = SECONDS_PER_DAY * DAYS_PER_YEAR;

/*
 * Milliseconds, not seconds, as the base. A seconds base makes `ms` a factor
 * of 0,001 — a number a double does not hold exactly — and the error surfaces
 * immediately: 1 500 000 ms would convert to 25,000000000000004 minutes. In
 * milliseconds every factor is a whole number and the division is exact.
 */
const TIME_MS: Record<TimeUnit, number> = {
  ms: 1,
  s: MS_PER_SECOND,
  min: SECONDS_PER_MINUTE * MS_PER_SECOND,
  h: SECONDS_PER_HOUR * MS_PER_SECOND,
  d: SECONDS_PER_DAY * MS_PER_SECOND,
  wk: SECONDS_PER_WEEK * MS_PER_SECOND,
  mo: SECONDS_PER_MONTH * MS_PER_SECOND,
  yr: SECONDS_PER_YEAR * MS_PER_SECOND,
};

export const TIME_UNITS: TimeUnit[] = ["ms", "s", "min", "h", "d", "wk", "mo", "yr"];

export const TIME_UNIT_LABELS: Record<TimeUnit, string> = {
  ms: "millisaniyə",
  s: "saniyə",
  min: "dəqiqə",
  h: "saat",
  d: "gün",
  wk: "həftə",
  mo: "ay · 30 gün",
  yr: "il · 365 gün",
};

export function convertTime(value: number, unit: TimeUnit): Record<TimeUnit, number> {
  const ms = value * TIME_MS[unit];
  const result = {} as Record<TimeUnit, number>;
  for (const target of TIME_UNITS) result[target] = ms / TIME_MS[target];
  return result;
}

export function timeToSeconds(value: number, unit: TimeUnit): number {
  return (value * TIME_MS[unit]) / MS_PER_SECOND;
}

/**
 * A number of seconds as a person would say it: "13 dəq 20 san", "1 gün 1 saat
 * 1 dəq 1 san", "500 ms".
 *
 * Rounding happens once, on the whole, before the parts are split off. Doing it
 * per part is what produces "60,0 san" — 59,96 rounds to 60 in the seconds slot
 * while the minutes slot has already been decided as 0.
 */
export function humanDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";

  const sign = seconds < 0 ? "−" : "";
  const total = Math.abs(seconds);

  if (total === 0) return "0 san";
  if (total < 1) return `${sign}${trimZeros(formatNumber(total * MS_PER_SECOND, 1))} ms`;

  /* Under an hour the fraction of a second is still information — an uptime
     budget of 315,36 seconds is "5 dəq 15,4 san". Above it the fraction is
     noise beside the hours. */
  const decimals = total < SECONDS_PER_HOUR ? 1 : 0;
  const step = 10 ** decimals;
  const rounded = Math.round(total * step) / step;

  let rest = rounded;
  const days = Math.floor(rest / SECONDS_PER_DAY);
  rest -= days * SECONDS_PER_DAY;
  const hours = Math.floor(rest / SECONDS_PER_HOUR);
  rest -= hours * SECONDS_PER_HOUR;
  const minutes = Math.floor(rest / SECONDS_PER_MINUTE);
  rest -= minutes * SECONDS_PER_MINUTE;

  const parts: string[] = [];
  if (days > 0) parts.push(`${formatNumber(days)} gün`);
  if (hours > 0) parts.push(`${hours} saat`);
  if (minutes > 0) parts.push(`${minutes} dəq`);

  const secondsText = trimZeros(formatNumber(rest, decimals));
  if (secondsText !== "0") parts.push(`${secondsText} san`);

  return sign + (parts.length > 0 ? parts.join(" ") : "0 san");
}

/* ---------- availability ---------- */

/**
 * How much downtime a given availability percentage buys, per period, in
 * seconds. 99,9% is 8 saat 45 dəq 36 san a year; 99,999% is 5 dəq 15 san.
 *
 * The year is 365 days, matching `TimeUnit`. Some calculators use 365,25 and
 * report 8 saat 45 dəq 58 san for the same 99,9%; the 22-second difference is
 * the leap-year quarter, not a mistake in either. One year length across the
 * whole tool is worth more than agreeing with any particular calculator.
 */
export function uptimeBudget(percent: number): {
  day: number;
  week: number;
  month: number;
  year: number;
} {
  /* An unreadable percentage is not a claim of perfect uptime, so it cannot
     fall through to a 100 that quietly prints zeros: the widget rejects the
     input before it gets here, and a direct caller gets a zero budget with no
     exception. */
  const safe = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 100;
  const share = (100 - safe) / 100;

  return {
    day: SECONDS_PER_DAY * share,
    week: SECONDS_PER_WEEK * share,
    month: SECONDS_PER_MONTH * share,
    year: SECONDS_PER_YEAR * share,
  };
}

/** The rungs everybody quotes, as chips over the percentage field. */
export const UPTIME_PRESETS: number[] = [99, 99.5, 99.9, 99.95, 99.99, 99.999];

/* ---------- input and output ---------- */

export type ParsedAmount = { value: number | null; error: string | null };

/**
 * A typed quantity, or the reason it is not one.
 *
 * The message is the point. A field that silently shows nothing when it is
 * handed "10 GB" teaches nobody anything; a field that says the unit belongs
 * in the list beside it teaches the visitor the shape of the tool once.
 */
export function parseAmount(raw: string, { allowZero = true } = {}): ParsedAmount {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return { value: null, error: "Rəqəm yaz." };

  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    return { value: null, error: "Bu, rəqəm deyil — vahidi yanındakı siyahıdan seç." };
  }
  if (value < 0) return { value: null, error: "Mənfi ölçü olmur — sıfırdan böyük rəqəm yaz." };
  if (!allowZero && value === 0) return { value: null, error: "Sıfırdan böyük rəqəm yaz." };

  return { value, error: null };
}

/** The digit-group separator `formatNumber` uses, read from it rather than repeated. */
const groupSeparator = formatNumber(1000).replace(/\d/g, "");

function trimZeros(text: string): string {
  return text.replace(/(,\d*?)0+$/, "$1").replace(/,$/, "");
}

/**
 * A converted number, printed so it can be read aloud.
 *
 * Two things are banned in the output and both come from `toFixed`: the
 * exponent it switches to above 1e21, and the "0" it collapses everything
 * below its precision into. A bit expressed in pebibytes is 0,000000000000000111
 * — long, but a number; "1.1102230246251565e-16" is a different kind of answer
 * to a different kind of question.
 */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";

  const abs = Math.abs(value);

  if (abs >= 1e21) {
    const whole = value.toLocaleString("fullwide", {
      useGrouping: false,
      maximumFractionDigits: 0,
    });
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator);
  }

  if (Number.isInteger(value)) return formatNumber(value, 0);
  if (abs < 1e-20) return "0-a yaxın";

  /* Four significant figures, wherever the decimal point happens to be: 931,32
     keeps two decimals, 12,5 keeps one, 0,125 keeps three, and a bit in
     pebibytes keeps the twenty it needs to say anything at all. */
  const exponent = Math.floor(Math.log10(abs));
  const digits = Math.min(20, Math.max(0, 4 - exponent));

  return trimZeros(formatNumber(value, digits));
}

/* ---------- reference ---------- */

export const olcuSections: ReferenceSection[] = [
  {
    id: "prefiks",
    label: "Prefikslər",
    hint: "Onluq prefikslər 1000-in, ikilik prefikslər 1024-ün qatlarıdır. Yeganə fərq budur, qalan hər şey ondan çıxır.",
  },
  {
    id: "hecm",
    label: "Tanış həcmlər",
    hint: "Rəqəmi bir şeyə bağlamaq üçün: bunlar müqayisə nöqtəsidir, dəqiq ölçü deyil.",
  },
  {
    id: "suret",
    label: "Tipik sürətlər",
    hint: "Real şəraitdə görünən sürətlər — qutunun üstündə yazılan nəzəri hədd deyil.",
  },
  {
    id: "vaxt",
    label: "Gecikmə şkalası",
    hint: "Bir prosessor taktından qitələrarası paketə qədər — Jeff Dean-in məşhur siyahısının yenilənmiş rəqəmləri.",
  },
  {
    id: "uptime",
    label: "Əlçatanlıq pillələri",
    hint: "Faizin arxasında duran dayanma müddəti. İl 365, ay 30 gün sayılır.",
  },
];

const latencyMatch = ["gecikmə", "latency", "gözləmə", "nanosaniyə"];

export const olcuRows: ReferenceRow[] = [
  /* prefiks — SI */
  {
    term: "k",
    label: "kilo — 1000",
    note: "Onluq prefiks. 1 kB = 1000 bayt; internet paketi və disk qutusu bu hesabla yazılır.",
    section: "prefiks",
    example: "1 kB = 1 000 B",
    match: ["si", "kilo", "onluq"],
  },
  {
    term: "M",
    label: "meqa — 1000²",
    note: "1 MB = 1 000 000 bayt. Video bitreyti, trafik hesabı və fayl ölçüsü adətən bu vahiddədir.",
    section: "prefiks",
    example: "1 MB = 1 000 000 B",
    match: ["si", "meqa", "mega"],
  },
  {
    term: "G",
    label: "giqa — 1000³",
    note: "1 GB = 1 000 000 000 bayt. Disk istehsalçısı «1 TB» yazanda da məhz bu hesabı işlədir.",
    section: "prefiks",
    example: "1 GB = 1 000 000 000 B",
    match: ["si", "giqa", "giga"],
  },
  {
    term: "T",
    label: "tera — 1000⁴",
    note: "1 TB = min GB. Bu gün adi ev diskinin ölçüsü; buludda saxlama planları da bu pillədən başlayır.",
    section: "prefiks",
    match: ["si", "tera"],
  },
  {
    term: "P",
    label: "peta — 1000⁵",
    note: "1 PB = min TB. Böyük şirkətin bir günlük log axını bu pillədə ölçülür.",
    section: "prefiks",
    match: ["si", "peta"],
  },
  {
    term: "E",
    label: "eksa — 1000⁶",
    note: "1 EB = min PB. Bu artıq bir bulud provayderinin ümumi saxlama tutumu sırasındadır.",
    section: "prefiks",
    match: ["si", "eksa", "exa"],
  },
  /* prefiks — IEC */
  {
    term: "Ki",
    label: "kibi — 1024",
    note: "İkilik prefiks. 1 KiB = 1024 bayt; fayl sistemi, RAM və proqram yaddaşı bu hesabla işləyir.",
    section: "prefiks",
    example: "1 KiB = 1 024 B",
    match: ["iec", "ikilik", "kibi", "binary"],
  },
  {
    term: "Mi",
    label: "mebi — 1024²",
    note: "1 MiB = 1 048 576 bayt. Linux-da `ls -lh` çıxışındakı «M» hərfi məhz bunu bildirir.",
    section: "prefiks",
    example: "1 MiB = 1 048 576 B",
    match: ["iec", "mebi", "ikilik"],
  },
  {
    term: "Gi",
    label: "gibi — 1024³",
    note: "1 GiB = 1 073 741 824 bayt — eyni pillədəki GB-dan 7,4% böyük. Windows bunu sadəcə «GB» yazır.",
    section: "prefiks",
    example: "1 GiB = 1 073 741 824 B",
    match: ["iec", "gibi", "ikilik", "windows"],
  },
  {
    term: "Ti",
    label: "tebi — 1024⁴",
    note: "1 TiB = 1024 GiB, yəni onluq TB-dan 10% böyük. Fərq pillə qalxdıqca böyüyür.",
    section: "prefiks",
    match: ["iec", "tebi", "ikilik"],
  },
  {
    term: "Pi",
    label: "pebi — 1024⁵",
    note: "1 PiB = 1024 TiB. Fayl saxlama klasterlərinin tutumu bu vahidlə yazılır.",
    section: "prefiks",
    match: ["iec", "pebi", "ikilik"],
  },
  {
    term: "Ei",
    label: "eksbi — 1024⁶",
    note: "1 EiB = 1024 PiB. ZFS və btrfs kimi fayl sistemlərinin nəzəri həddi bu aralıqdadır.",
    section: "prefiks",
    match: ["iec", "eksbi", "ikilik"],
  },

  /* hecm */
  {
    term: "CD",
    label: "700 MB",
    note: "Bir audio CD — 74 dəqiqə səs. İndi bir telefonun bir neçə şəkli qədərdir.",
    section: "hecm",
    match: ["disk", "kompakt"],
  },
  {
    term: "DVD",
    label: "4,7 GB",
    note: "Bir təbəqəli DVD. İki təbəqəli variantı 8,5 GB tutur, yəni təxminən iki dəfə çox.",
    section: "hecm",
    match: ["disk", "film"],
  },
  {
    term: "Blu-ray",
    label: "25 GB",
    note: "Bir təbəqəli Blu-ray; iki təbəqəlisi 50 GB. Tam HD film sıxılmadan bura sığır.",
    section: "hecm",
    match: ["disk", "film", "bluray"],
  },
  {
    term: "1080p video",
    label: "≈ 3 GB / saat",
    note: "8 Mbit/s bitreytdə bir saatlıq yazı. Eyni saat 4K-da 15–20 GB-a qalxır.",
    section: "hecm",
    match: ["video", "netflix", "youtube", "film"],
  },
  {
    term: "MP3",
    label: "≈ 1 MB / dəqiqə",
    note: "128 kbit/s-də bir dəqiqə səs. Bir saatlıq podkast təxminən 60 MB edir.",
    section: "hecm",
    match: ["audio", "musiqi", "podkast"],
  },
  {
    term: "Veb səhifə",
    label: "≈ 2,5 MB",
    note: "HTTP Archive-ın ölçdüyü orta səhifə çəkisi — şəkil, şrift və skript daxil.",
    section: "hecm",
    match: ["sayt", "sehife", "performans"],
  },
  {
    term: "SMS",
    label: "140 bayt",
    note: "Bir SMS-in gövdəsi: 160 latın hərfi 7 bitlə yerləşir, Unicode-da isə cəmi 70 simvol.",
    section: "hecm",
    match: ["mesaj", "telefon"],
  },
  {
    term: "UUID",
    label: "16 bayt",
    note: "İkilik formada 16 bayt, mətn formasında isə tire ilə birlikdə 36 simvol tutur.",
    section: "hecm",
    match: ["id", "baza", "identifikator"],
  },
  {
    term: "IPv4 ünvanı",
    label: "4 bayt",
    note: "Cəmi 32 bit — dünyada mümkün ünvanların sayı buna görə 4,3 milyardla məhdudlaşır.",
    section: "hecm",
    match: ["sebeke", "ip", "unvan"],
  },
  {
    term: "IPv6 ünvanı",
    label: "16 bayt",
    note: "128 bit. Ünvan sahəsi IPv4-dən 2⁹⁶ dəfə genişdir, yəni praktikada tükənmir.",
    section: "hecm",
    match: ["sebeke", "ip", "unvan"],
  },
  {
    term: "Disk bloku",
    label: "4 KiB",
    note: "Müasir fayl sisteminin blok ölçüsü. 1 baytlıq fayl da diskdə bütöv bir blok tutur.",
    section: "hecm",
    match: ["fayl", "sistem", "sektor"],
  },
  {
    term: "Ethernet paketi",
    label: "1500 bayt",
    note: "Standart MTU — şəbəkədən bir dəfəyə keçən çərçivənin ən böyük gövdəsi.",
    section: "hecm",
    match: ["sebeke", "mtu", "paket"],
  },

  /* suret */
  {
    term: "ADSL",
    label: "≈ 8 Mbit/s",
    note: "Telefon xətti üzərindən internet: saniyədə 1 MB-dan az endirmə deməkdir.",
    section: "suret",
    match: ["internet", "dsl"],
  },
  {
    term: "4G / LTE",
    label: "≈ 30 Mbit/s",
    note: "Mobil şəbəkədə real orta sürət. Nəzəri hədd bundan qat-qat yuxarıdır, amma nadir hallarda görünür.",
    section: "suret",
    match: ["mobil", "lte", "internet"],
  },
  {
    term: "5G",
    label: "≈ 200 Mbit/s",
    note: "Şəhər şəraitində tipik 5G sürəti — 1 GB fayl təxminən 40 saniyəyə enir.",
    section: "suret",
    match: ["mobil", "internet"],
  },
  {
    term: "Wi-Fi 5",
    label: "≈ 400 Mbit/s",
    note: "802.11ac ilə eyni otaqda alınan real sürət; divar arxasında təxminən yarıya düşür.",
    section: "suret",
    match: ["wifi", "802.11ac", "simsiz"],
  },
  {
    term: "Wi-Fi 6",
    label: "≈ 900 Mbit/s",
    note: "802.11ax. Əsas qazanc tək cihazın sürətində yox, çox cihazın eyni anda işləməsindədir.",
    section: "suret",
    match: ["wifi", "802.11ax", "simsiz"],
  },
  {
    term: "Ethernet 1G",
    label: "1000 Mbit/s",
    note: "Adi kabel şəbəkəsi: nəzəri 125 MB/s, praktikada 110–115 MB/s.",
    section: "suret",
    match: ["kabel", "lan", "sebeke"],
  },
  {
    term: "USB 3.0",
    label: "5 Gbit/s",
    note: "Xarici disk üçün geniş kanal — məhdudiyyət adətən kanalda yox, diskin özündə olur.",
    section: "suret",
    match: ["usb", "xarici disk"],
  },
  {
    term: "SATA SSD",
    label: "≈ 550 MB/s",
    note: "SATA kanalının praktiki həddi, yəni təxminən 4,4 Gbit/s. Disk daha sürətli olsa da kanal buraxmır.",
    section: "suret",
    match: ["ssd", "disk", "sata"],
  },
  {
    term: "NVMe SSD",
    label: "≈ 3500 MB/s",
    note: "PCIe 3.0 nəsli. PCIe 4.0 və 5.0 diskləri 7000 MB/s-i də keçir.",
    section: "suret",
    match: ["ssd", "disk", "nvme", "pcie"],
  },
  {
    term: "HDD",
    label: "≈ 150 MB/s",
    note: "Fırlanan diskin ardıcıl oxu sürəti. Təsadüfi oxuda bu rəqəm onlarla dəfə aşağı düşür.",
    section: "suret",
    match: ["disk", "hard", "fırlanan"],
  },

  /* vaxt */
  {
    term: "L1 keş",
    label: "≈ 1 ns",
    note: "Prosessorun ən yaxın keşi — bir maşın taktı ilə eyni sıradadır.",
    section: "vaxt",
    match: [...latencyMatch, "cpu", "kes"],
  },
  {
    term: "L2 keş",
    label: "≈ 4 ns",
    note: "L1-dən təxminən dörd dəfə uzaq, RAM-dan isə iyirmi beş dəfə yaxın.",
    section: "vaxt",
    match: [...latencyMatch, "cpu", "kes"],
  },
  {
    term: "Mutex kilidi",
    label: "≈ 25 ns",
    note: "Kilidi tutub buraxmaq. Yaddaşa bir gedişdən ucuzdur, ona görə qorxulu olan kilidin özü yox, gözləmədir.",
    section: "vaxt",
    match: [...latencyMatch, "lock", "paralel"],
  },
  {
    term: "RAM oxuma",
    label: "≈ 100 ns",
    note: "Yaddaşdan təsadüfi oxu — L1 keşdən yüz dəfə yavaş, diskdən min dəfələrlə sürətli.",
    section: "vaxt",
    match: [...latencyMatch, "yaddas", "memory"],
  },
  {
    term: "1 MB — RAM-dan",
    label: "≈ 100 µs",
    note: "Yaddaşdan ardıcıl bir meqabayt oxumaq. Eyni həcm SSD-dən on dəfə uzun çəkir.",
    section: "vaxt",
    match: [...latencyMatch, "yaddas", "ardicil"],
  },
  {
    term: "SSD təsadüfi oxu",
    label: "≈ 150 µs",
    note: "NVMe diskdə bir bloka müraciət — RAM-dan min dəfəyə yaxın yavaş.",
    section: "vaxt",
    match: [...latencyMatch, "disk", "nvme"],
  },
  {
    term: "1 MB — SSD-dən",
    label: "≈ 1 ms",
    note: "Diskdən ardıcıl bir meqabayt. Bir səhifə açılışında bunlardan onlarla olur.",
    section: "vaxt",
    match: [...latencyMatch, "disk", "ardicil"],
  },
  {
    term: "Eyni datamərkəz RTT",
    label: "≈ 0,5 ms",
    note: "Bir serverdən qonşusuna gedib-qayıtma. Mikroservis çağırışının minimum qiyməti budur.",
    section: "vaxt",
    match: [...latencyMatch, "sebeke", "rtt", "ping"],
  },
  {
    term: "HDD axtarışı",
    label: "≈ 10 ms",
    note: "Başlığın lazımi treki tapması — fiziki hərəkətdir, keşlə örtülməsə dərhal hiss olunur.",
    section: "vaxt",
    match: [...latencyMatch, "disk", "seek"],
  },
  {
    term: "Qitələrarası RTT",
    label: "≈ 150 ms",
    note: "Avropadan Kaliforniyaya gedib-qayıtma. Bunu heç bir optimallaşdırma qısaltmır, yalnız CDN kömək edir.",
    section: "vaxt",
    match: [...latencyMatch, "sebeke", "rtt", "cdn"],
  },

  /* uptime */
  {
    term: "99%",
    label: "iki doqquz",
    note: "İldə 3 gün 15 saat dayanma. Pullu servis üçün bu pillə artıq az sayılır.",
    section: "uptime",
    match: ["sla", "elcatanliq", "uptime"],
  },
  {
    term: "99,5%",
    note: "İldə 1 gün 19 saat, ayda təxminən 3,6 saat dayanma deməkdir.",
    section: "uptime",
    match: ["sla", "elcatanliq", "uptime"],
  },
  {
    term: "99,9%",
    label: "üç doqquz",
    note: "İldə 8 saat 45 dəq, ayda 43 dəq. Adi SaaS müqaviləsinin standart pilləsi.",
    section: "uptime",
    match: ["sla", "elcatanliq", "uptime", "saas"],
  },
  {
    term: "99,95%",
    note: "İldə 4 saat 22 dəq. Bulud provayderləri əksər xidmətlərə bu zəmanəti verir.",
    section: "uptime",
    match: ["sla", "elcatanliq", "uptime", "bulud"],
  },
  {
    term: "99,99%",
    label: "dörd doqquz",
    note: "İldə 52 dəq, ayda 4 dəq 19 san. Əl ilə müdaxilə ilə bu pilləni tutmaq çətindir.",
    section: "uptime",
    match: ["sla", "elcatanliq", "uptime"],
  },
  {
    term: "99,999%",
    label: "beş doqquz",
    note: "İldə cəmi 5 dəq 15 san. Bu pillə insanın oyanmasına belə vaxt qoymur, hər şey avtomatik olmalıdır.",
    section: "uptime",
    match: ["sla", "elcatanliq", "uptime"],
  },
];
