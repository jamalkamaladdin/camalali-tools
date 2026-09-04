/*
 * Currency conversion, backed by two sources that never talk to each other.
 *
 * The Azerbaijani central bank publishes the one AZN rate that counts — every
 * bank, invoice and customs form in the country prices off it — so the AZN
 * side of this tool is that bulletin, parsed, and nothing invented on top of
 * it. Frankfurter covers conversion between currencies that have nothing to
 * do with AZN, and it does not carry AZN at all, which is exactly why a
 * second source is here instead of one API doing both.
 *
 * The two are kept as two separate modes rather than bridged into one
 * conversion matrix. A bridge (the bank gives AZN per USD, Frankfurter gives
 * EUR per USD, so AZN per EUR is derivable) is arithmetically possible, but it
 * would quietly make up a cross-rate neither source actually quotes and
 * present it as if it were. What each source actually publishes is what this
 * tool shows.
 */

/* ---------- CBAR: the official AZN bulletin ---------- */

export type CbarRate = {
  code: string;
  /** How many units of the currency the value below prices — 1 for most, 100 for a few thin ones (KRW, KZT, ...) so the AZN figure isn't a fraction with several leading zeros. */
  nominal: number;
  /** As the bulletin names it, still carrying the leading nominal (e.g. "100 <currency name>"). Use `stripNominalPrefix` for a label without it. */
  nameAz: string;
  /** Local currency per ONE unit — `Value` already divided by `Nominal`, so a caller never has to remember the nominal again. */
  aznPerUnit: number;
};

export type CbarBulletin = {
  /** The bank's own format, DD.MM.YYYY — kept as that string because that is what belongs next to "official rate", not a reformatted guess. */
  date: string;
  rates: CbarRate[];
};

const DATE_ATTR = /<ValCurs\s+Date="(\d{2}\.\d{2}\.\d{4})"/;
/*
 * The bulletin has two `<ValType>` blocks: bank metals (priced per troy
 * ounce, nominal "1 t.u.") and foreign currencies (priced per 1 or 100
 * units). Only the second is an exchange rate in the sense this tool means,
 * so parsing is scoped to that one block rather than to the whole document —
 * a metal's "nominal" is not a plain number and would corrupt `aznPerUnit` if
 * it were read the same way.
 */
const CURRENCY_BLOCK_TAG = "Xarici valyutalar";
const CURRENCY_BLOCK = new RegExp(
  `<ValType\\s+Type="${CURRENCY_BLOCK_TAG}">([\\s\\S]*?)<\\/ValType>`,
);
const NOMINAL_TAG = /<Nominal>\s*(\d+)/;
const NAME_TAG = /<Name>([^<]*)<\/Name>/;
const VALUE_TAG = /<Value>([\d.]+)<\/Value>/;

/**
 * Turns the bulletin the bank serves at `currencies/DD.MM.YYYY.xml` into a
 * typed list. No XML library is used — the document has one shallow,
 * unvarying shape, and a handful of small regexes read it without adding a
 * dependency for a format this site parses exactly once.
 */
export function parseCbarXml(xml: string): CbarBulletin {
  const dateMatch = DATE_ATTR.exec(xml);
  if (!dateMatch) throw new Error("Bulletin is missing the ValCurs Date attribute.");

  const blockMatch = CURRENCY_BLOCK.exec(xml);
  if (!blockMatch) throw new Error(`Bulletin is missing the "${CURRENCY_BLOCK_TAG}" section.`);

  const rates: CbarRate[] = [];
  // A fresh /g regex per call: one declared at module scope would carry its
  // `lastIndex` from the previous parse into this one and silently skip or
  // duplicate entries the second time this function runs in the same process.
  const valuteRe = /<Valute\s+Code="([A-Z]+)">([\s\S]*?)<\/Valute>/g;
  let match: RegExpExecArray | null;
  while ((match = valuteRe.exec(blockMatch[1])) !== null) {
    const [, code, body] = match;
    const nominalMatch = NOMINAL_TAG.exec(body);
    const nameMatch = NAME_TAG.exec(body);
    const valueMatch = VALUE_TAG.exec(body);
    // An entry missing one of its three fields is not one this tool can
    // price — skipped rather than failing the whole bulletin over one bad
    // row, since the other ~35 rows are still good.
    if (!nominalMatch || !nameMatch || !valueMatch) continue;

    const nominal = parseInt(nominalMatch[1], 10);
    const value = parseFloat(valueMatch[1]);
    rates.push({ code, nominal, nameAz: nameMatch[1].trim(), aznPerUnit: value / nominal });
  }

  return { date: dateMatch[1], rates };
}

/** e.g. "100 <name>" with nominal 100 -> "<name>" — the number is already shown as the nominal, so repeating it in the label is noise. */
export function stripNominalPrefix(nameAz: string, nominal: number): string {
  const prefix = `${nominal} `;
  return nameAz.startsWith(prefix) ? nameAz.slice(prefix.length) : nameAz;
}

/** The bank's file name format: DD.MM.YYYY, read in UTC calendar terms — the retry loop that calls this only needs consecutive calendar days, not a specific timezone's midnight. */
export function formatCbarDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/**
 * `count` calendar days ending on `today`, newest first. This is the retry
 * order used when the bank's server does not answer for "today" at all
 * (network hiccup, or a file genuinely not written yet) — measured
 * separately: requesting a weekend's or a future date's file does not 404 the
 * way this list exists to cover, it silently returns the latest real
 * bulletin, dated earlier, inside a 200 response. That self-correcting
 * behaviour is exactly why the caller must read the `date` the returned XML
 * carries rather than assume the date it asked for — this list is a fallback
 * for the rarer case where the server does not answer at all.
 */
export function cbarRetryDates(today: Date, count: number): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d);
  }
  return dates;
}

/** DD.MM.YYYY -> YYYY-MM-DD, so both bulletins can be handed to the same `formatAzDate`. Returns the input unchanged if it is not that shape. */
export function cbarDateToIso(ddmmyyyy: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ddmmyyyy);
  if (!match) return ddmmyyyy;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/* ---------- Frankfurter: world currencies, USD-pivoted ---------- */

/**
 * Static because Frankfurter's currency list changes on the order of years,
 * not requests — fetching it fresh every session would spend a whole call on
 * data this stable. Codes and labels come from the live `/v1/currencies`
 * response, checked by hand against the same names the bank's own bulletin
 * uses for the currencies the two lists share.
 */
export const WORLD_CURRENCIES: { code: string; nameAz: string }[] = [
  { code: "USD", nameAz: "ABŞ dolları" },
  { code: "AUD", nameAz: "Avstraliya dolları" },
  { code: "BRL", nameAz: "Braziliya reyalı" },
  { code: "CAD", nameAz: "Kanada dolları" },
  { code: "CHF", nameAz: "İsveçrə frankı" },
  { code: "CNY", nameAz: "Çin yuanı" },
  { code: "CZK", nameAz: "Çexiya kronu" },
  { code: "DKK", nameAz: "Danimarka kronu" },
  { code: "EUR", nameAz: "Avro" },
  { code: "GBP", nameAz: "İngilis funt sterlinqi" },
  { code: "HKD", nameAz: "Honq Konq dolları" },
  { code: "HUF", nameAz: "Macarıstan forinti" },
  { code: "IDR", nameAz: "İndoneziya rupiası" },
  { code: "ILS", nameAz: "İsrail şekeli" },
  { code: "INR", nameAz: "Hindistan rupisi" },
  { code: "ISK", nameAz: "İslandiya kronu" },
  { code: "JPY", nameAz: "Yaponiya yeni" },
  { code: "KRW", nameAz: "Cənubi Koreya vonu" },
  { code: "MXN", nameAz: "Meksika pesosu" },
  { code: "MYR", nameAz: "Malayziya ringgiti" },
  { code: "NOK", nameAz: "Norveç kronu" },
  { code: "NZD", nameAz: "Yeni Zelandiya dolları" },
  { code: "PHP", nameAz: "Filippin pesosu" },
  { code: "PLN", nameAz: "Polşa zlotisi" },
  { code: "RON", nameAz: "Rumıniya leyi" },
  { code: "SEK", nameAz: "İsveç kronu" },
  { code: "SGD", nameAz: "Sinqapur dolları" },
  { code: "THB", nameAz: "Tailand bahtı" },
  { code: "TRY", nameAz: "Türkiyə lirəsi" },
  { code: "ZAR", nameAz: "Cənubi Afrika randı" },
];

export function isWorldCurrencyCode(code: string): boolean {
  return WORLD_CURRENCIES.some((currency) => currency.code === code);
}

/**
 * Frankfurter's `/latest?base=USD` body, folded into a USD-per-unit map with
 * `USD` itself set to 1. That one addition is what turns "the rates
 * Frankfurter quotes against USD" into a table any of the 30 currencies can
 * be converted through — `crossRate` below no longer needs to special-case
 * USD as either side of a pair, because the table already prices it against
 * itself.
 */
export function buildUsdRateTable(latestJson: unknown): Record<string, number> {
  const table: Record<string, number> = { USD: 1 };
  if (!latestJson || typeof latestJson !== "object") return table;

  const rates = (latestJson as { rates?: unknown }).rates;
  if (!rates || typeof rates !== "object") return table;

  for (const [code, value] of Object.entries(rates as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) table[code] = value;
  }
  return table;
}

/**
 * Units of `to` per one unit of `from`, read off a USD-pivoted table. Both
 * currencies go through the same division regardless of which one is USD,
 * because the table already carries `USD: 1` — a currency missing from the
 * table (never USD, since that key is always present) throws rather than
 * silently pricing it at zero.
 */
export function crossRate(usdRates: Record<string, number>, from: string, to: string): number {
  const fromRate = usdRates[from];
  const toRate = usdRates[to];
  if (fromRate === undefined) throw new Error(`Unknown currency code: ${from}`);
  if (toRate === undefined) throw new Error(`Unknown currency code: ${to}`);
  return toRate / fromRate;
}

/* ---------- shared: amount parsing and the one multiply everything uses ---------- */

export type AmountResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * A comma is accepted alongside a dot, because a visitor typing on an
 * Azerbaijani keyboard reaches for "," as the decimal separator out of habit —
 * rejecting it would fail the most natural input this field gets. Negative
 * amounts are rejected outright: nothing here converts a debt, only a typed
 * sum, and zero is kept legal because "0 of one currency is 0 of another" is
 * still a true answer, not a missing one.
 */
export function parseAmount(raw: string): AmountResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Məbləğ boşdur." };

  const normalized = trimmed.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, error: "Məbləğ rəqəm deyil." };
  if (value < 0) return { ok: false, error: "Məbləğ mənfi ola bilməz." };

  return { ok: true, value };
}

/** The one multiply every conversion in this tool goes through, whichever direction or source produced `rate`. */
export function convertAmount(amount: number, rate: number): number {
  return amount * rate;
}

/** The other direction of a rate that was only fetched one way — inverting is exact for the values this tool deals in, since neither source publishes a rate of 0. */
export function invertRate(rate: number): number {
  return 1 / rate;
}
