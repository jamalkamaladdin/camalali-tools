/*
 * Azerbaijani month and weekday names, written out rather than asked of
 * `toLocaleDateString("az-AZ", …)`. On the server Node carries full ICU and the
 * locale resolves, but a browser without `az` data silently falls back and
 * prints "2026 M08" where a long date belongs — measured in a headless Chrome.
 * Numbers and the clock still go through plain digits, which need no locale.
 */

export const AZ_MONTHS = [
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
] as const;

/** Monday first, the way a calendar is read here. */
export const AZ_WEEKDAYS_SHORT = ["B.e", "Ç.a", "Ç", "C.a", "C", "Ş", "B"] as const;

/** Indexed by `Date.getDay()`, so Sunday comes first. */
export const AZ_WEEKDAYS = [
  "bazar",
  "bazar ertəsi",
  "çərşənbə axşamı",
  "çərşənbə",
  "cümə axşamı",
  "cümə",
  "şənbə",
] as const;

/** Long date with the weekday appended. */
export function azFullDate(date: Date): string {
  return `${azLongDate(date)}, ${AZ_WEEKDAYS[date.getDay()]}`;
}

/** Day, month name, year. */
export function azLongDate(date: Date): string {
  return `${date.getDate()} ${AZ_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Month name and year, for a calendar header. */
export function azMonthLabel(date: Date): string {
  return `${AZ_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Digits only, so no locale data is involved. */
export function azTime(date: Date, withSeconds = false): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return withSeconds ? `${base}:${pad(date.getSeconds())}` : base;
}

/*
 * The tool layer speaks a second dialect of the same problem: it formats ISO
 * strings and durations rather than calendar dates. These four came over with
 * the tools from their own repository, where they lived in a file of the same
 * name with no overlapping exports. They are appended here rather than kept as
 * a private copy inside `invoice/pdf.ts`, so there is still exactly one month
 * table on the site.
 */

const pad2 = (value: number) => String(value).padStart(2, "0");

/** "2026-09-01" → "1 sentyabr 2026". Returns the input when it is not a date. */
export function formatAzDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso.trim() || "—";

  const [, year, month, day] = match;
  const monthName = AZ_MONTHS[Number(month) - 1];
  if (!monthName) return iso;

  return `${Number(day)} ${monthName} ${year}`;
}

/** Local time, because a cron schedule and a token expiry are read locally. */
export function formatAzDateTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return "—";
  return `${azLongDate(date)}, ${azTime(date)}`;
}

/** Local `yyyy-mm-dd hh:mm:ss` — the sortable form, for tables. */
export function formatAzStamp(date: Date): string {
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )} ${azTime(date, true)}`;
}

/**
 * "2 gün 3 saat", "14 dəqiqə", "5 saniyə" — two units at most, because a token
 * that expires in "1 gün 2 saat 13 dəqiqə 6 saniyə" is read as noise.
 */
export function formatDuration(seconds: number): string {
  const total = Math.floor(Math.abs(seconds));
  if (total < 1) return "0 saniyə";

  const units: [number, string][] = [
    [86400, "gün"],
    [3600, "saat"],
    [60, "dəqiqə"],
    [1, "saniyə"],
  ];

  const parts: string[] = [];
  let rest = total;
  for (const [size, name] of units) {
    const value = Math.floor(rest / size);
    if (value > 0) {
      parts.push(`${value} ${name}`);
      rest -= value * size;
    }
    if (parts.length === 2) break;
  }

  return parts.join(" ");
}

/** Signed distance from now: "3 saat sonra" / "2 gün əvvəl". */
export function formatRelative(target: Date, now = new Date()): string {
  const diffSeconds = (target.getTime() - now.getTime()) / 1000;
  const text = formatDuration(diffSeconds);
  return diffSeconds >= 0 ? `${text} sonra` : `${text} əvvəl`;
}
