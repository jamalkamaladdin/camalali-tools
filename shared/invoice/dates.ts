/*
 * Calendar arithmetic on the `yyyy-mm-dd` strings an `<input type="date">`
 * reads and writes.
 *
 * It sits in `lib` rather than beside the form because the due date is a claim
 * the document prints: a payment date earlier than the invoice date is wrong on
 * paper and nobody sees it until the PDF is open. A claim that survives into a
 * file has to be provable by `pnpm verify:tools`, so the rule lives in a pure
 * function and the component only calls it.
 *
 * `new Date("2026-09-01")` is deliberately not used: the short ISO form is
 * parsed as UTC, so a visitor west of Greenwich would land a day early. The
 * parts are read by hand and the day is built on the local calendar.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `yyyy-mm-dd` → a local-calendar date, or null when the string is not one. */
export function isoToDate(iso: string): Date | null {
  const match = ISO_DAY.exec(iso.trim());
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function dateToIso(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Adds days to a `yyyy-mm-dd` string, staying on the local calendar. */
export function isoAddDays(iso: string, days: number): string {
  const date = isoToDate(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  return dateToIso(date);
}

/** The payment term a fresh invoice is prefilled with. */
export const DUE_DAYS = 14;

/**
 * The due date the form should be showing.
 *
 * Two rules, and both were broken: the date was derived once when the document
 * was built, so moving the invoice date left the payment date behind — an
 * invoice dated December could print a September payment date. It now follows
 * the invoice date for as long as the visitor has not set one of their own, and
 * an overridden date is never allowed to precede the invoice it belongs to.
 */
export function deriveDueDate(params: {
  date: string;
  dueDate: string;
  /** True once the visitor has typed into the due date field themselves. */
  overridden: boolean;
  days?: number;
}): string {
  const { date, dueDate, overridden, days = DUE_DAYS } = params;
  const invoiceDay = isoToDate(date);
  if (!invoiceDay) return dueDate;

  if (!overridden) return isoAddDays(date, days);

  const dueDay = isoToDate(dueDate);
  if (!dueDay) return isoAddDays(date, days);
  return dueDay.getTime() < invoiceDay.getTime() ? date : dueDate;
}
