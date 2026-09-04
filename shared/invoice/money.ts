/**
 * Money formatting and Azerbaijani number-to-words.
 *
 * `Intl` is deliberately not used for numbers: the az-AZ locale is missing in
 * some browsers and silently degrades (the same trap already hit date output on
 * camalali.com). The formatter below is explicit, so output is identical
 * everywhere: thousands separated by U+202F (narrow no-break space, so an
 * amount never breaks across lines), decimals by a comma.
 */

/**
 * Rounds to whole qəpik, half away from zero — the accounting convention.
 * `Math.round` alone rounds towards +∞, so it turns -12.345 into -12.34 while a
 * credit note has to read -12.35.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100;
}

export function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? roundMoney(value) : 0;
  const negative = safe < 0;
  const [whole, fraction] = Math.abs(safe).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${negative ? "-" : ""}${grouped},${fraction}`;
}

const ONES = [
  "",
  "bir",
  "iki",
  "üç",
  "dörd",
  "beş",
  "altı",
  "yeddi",
  "səkkiz",
  "doqquz",
];

const TENS = [
  "",
  "on",
  "iyirmi",
  "otuz",
  "qırx",
  "əlli",
  "altmış",
  "yetmiş",
  "səksən",
  "doxsan",
];

/** 1000 → "min", 10^6 → "milyon", … Index is the group position from the right. */
const SCALES = ["", "min", "milyon", "milyard", "trilyon"];

function groupToWords(group: number): string[] {
  const words: string[] = [];
  const hundreds = Math.floor(group / 100);
  const tens = Math.floor((group % 100) / 10);
  const ones = group % 10;

  if (hundreds > 0) {
    // 100 is "yüz", not "bir yüz"
    if (hundreds > 1) words.push(ONES[hundreds]);
    words.push("yüz");
  }
  if (tens > 0) words.push(TENS[tens]);
  if (ones > 0) words.push(ONES[ones]);

  return words;
}

/** 1234 → "min iki yüz otuz dörd" */
export function numberToAzWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "sıfır";

  const groups: number[] = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }

  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const group = groups[i];
    if (group === 0) continue;

    // "min" stands alone (min, not bir min); every larger scale keeps "bir".
    if (!(group === 1 && i === 1)) words.push(...groupToWords(group));
    if (i > 0) words.push(SCALES[i]);
  }

  return words.join(" ");
}

/** 1234.56 → "min iki yüz otuz dörd manat əlli altı qəpik" */
export function amountInAzWords(value: number): string {
  const safe = roundMoney(Math.abs(Number.isFinite(value) ? value : 0));
  const manat = Math.floor(safe);
  const qepik = Math.round((safe - manat) * 100);

  const parts = [`${numberToAzWords(manat)} manat`];
  if (qepik > 0) parts.push(`${numberToAzWords(qepik)} qəpik`);
  return parts.join(" ");
}

/**
 * Quantities are not money: 1 stays "1", 2.5 becomes "2,5". Printing "1,00 ədəd"
 * on an invoice line reads like a price, not a count.
 */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded).replace(".", ",");
}

/**
 * What a half-typed decimal field currently holds.
 *
 * `empty` and `invalid` are separate states because the form has to tell them
 * apart: a cleared field is a field waiting to be filled, and a field holding
 * `abc` is a mistake worth naming. Collapsing both to a number is how the
 * original code put the literal string `NaN` on screen.
 */
export type DecimalInput =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "number"; value: number };

/*
 * `19.` and `.5` are accepted: they are not finished numbers, they are the
 * middle of typing `19.99` and `0.5`. A parser that rejects them forces the
 * field to throw away the decimal point, which is exactly the 100x error this
 * replaced — `19.` parsed back to `19`, the next keystroke made it `199`.
 */
const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Reads a typed decimal. Both `.` and `,` are accepted as the decimal mark. */
export function parseDecimalInput(raw: string): DecimalInput {
  const text = raw.trim().replace(",", ".");
  if (text === "") return { kind: "empty" };
  if (!DECIMAL.test(text)) return { kind: "invalid" };
  const value = Number(text);
  return Number.isFinite(value) ? { kind: "number", value } : { kind: "invalid" };
}

/** The number a typed decimal contributes to the document; anything else is 0. */
export function decimalInputValue(raw: string): number {
  const parsed = parseDecimalInput(raw);
  return parsed.kind === "number" ? parsed.value : 0;
}
