/**
 * Sample data in Azerbaijani shape: names drawn from real Azerbaijani name
 * lists, mobile numbers on real operator prefixes, Baku addresses, and an
 * IBAN whose check digits are computed by the actual MOD-97 algorithm
 * (ISO 7064) rather than typed in to look right. Everything here is
 * fictional — the widget says so before a visitor generates a row, and nine
 * of the ten sample rows this file could produce collide with nobody, on
 * purpose: the point is a shape to paste into a form or a seed script, not a
 * person.
 *
 * A seeded PRNG (`mulberry32`, hand-written — `Math.random` cannot be
 * replayed) makes generation deterministic for a given seed, which is the
 * only way this file's own test suite can assert an exact row rather than
 * "some string came out".
 *
 * Worth checking: the IBAN's checksum actually passes MOD-97 verification —
 * against both a generated one and an independent known-valid IBAN, so the
 * verifier itself is trusted before it vouches for the generator; the same
 * seed reproducing the same row; CSV and SQL escaping a value that contains
 * the delimiter/quote it would otherwise break on; and the row-count cap
 * refusing rather than freezing.
 */

export type FieldKey = "ad" | "soyad" | "tamAd" | "cins" | "mobil" | "unvan" | "voen" | "eposta" | "tarix" | "iban" | "sirket" | "metn";

export const FIELD_LABELS: Record<FieldKey, string> = {
  ad: "Ad",
  soyad: "Soyad",
  tamAd: "Tam ad",
  cins: "Cins",
  mobil: "Mobil nömrə",
  unvan: "Ünvan",
  voen: "VÖEN",
  eposta: "E-poçt",
  tarix: "Tarix",
  iban: "IBAN",
  sirket: "Şirkət adı",
  metn: "Mətn",
};

export const ALL_FIELDS: FieldKey[] = ["ad", "soyad", "tamAd", "cins", "mobil", "unvan", "voen", "eposta", "tarix", "iban", "sirket", "metn"];

export const MAX_ROWS = 500;

/* ---------- seeded PRNG ---------- */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function digits(rng: Rng, count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) out += Math.floor(rng() * 10).toString();
  return out;
}

/* ---------- data pools ---------- */

const MALE_NAMES = ["Əli", "Vüqar", "Elvin", "Tural", "Kamran", "Rəşad", "Orxan", "Murad", "Cavid", "Anar", "Nicat", "Fərid", "Emin", "Rövşən", "Elşən"];
const FEMALE_NAMES = ["Aygün", "Günel", "Nərmin", "Leyla", "Səbinə", "Turanə", "Aynur", "Gülnar", "Ülviyyə", "Nigar", "Fidan", "Sevinc", "Kəmalə", "Aytac", "Nazlı"];

/** [male, female] pairs — stored as real pairs rather than derived by suffix rule, since Azerbaijani surname formation is not a reliable regular pattern. */
const SURNAME_PAIRS: [string, string][] = [
  ["Məmmədov", "Məmmədova"],
  ["Əliyev", "Əliyeva"],
  ["Həsənov", "Həsənova"],
  ["Quliyev", "Quliyeva"],
  ["Rəhimov", "Rəhimova"],
  ["Abbasov", "Abbasova"],
  ["Nəbiyev", "Nəbiyeva"],
  ["Kərimov", "Kərimova"],
  ["Süleymanov", "Süleymanova"],
  ["İbrahimov", "İbrahimova"],
  ["Vəliyev", "Vəliyeva"],
  ["Hüseynov", "Hüseynova"],
  ["Cəfərov", "Cəfərova"],
  ["Tağıyev", "Tağıyeva"],
  ["Şirinov", "Şirinova"],
];

/** Real Azerbaijani mobile operator prefixes: Azercell (50, 51), Bakcell (55, 99), Nar Mobile (70, 77). */
const MOBILE_PREFIXES = ["50", "51", "55", "70", "77", "99"];

const BAKU_DISTRICTS = ["Binəqədi", "Nərimanov", "Nəsimi", "Nizami", "Xətai", "Yasamal", "Səbail", "Xəzər", "Suraxanı", "Qaradağ", "Sabunçu"];
const STREET_NAMES = ["Neftçilər prospekti", "28 May küçəsi", "Nizami küçəsi", "Azadlıq prospekti", "M. Müşfiq küçəsi", "Xaqani küçəsi", "H. Zərdabi küçəsi", "Bakıxanov küçəsi"];

const EMAIL_DOMAINS = ["gmail.com", "mail.ru", "box.az", "yahoo.com", "outlook.com"];

const COMPANY_WORDS = ["Zirvə", "Xəzər", "Bakı", "Şərq", "Qafqaz", "Nur", "Atlas", "Mirvari", "Günəş", "Ozan"];
const COMPANY_SUFFIXES = ["MMC", "ASC", "QSC"];

const SENTENCES = [
  "Sınaq üçün hazırlanmış nümunə mətn parçasıdır.",
  "Bu sətir formanın uzunluq həddini yoxlamaq üçün istifadə olunur.",
  "Verilənlər bazasına test qeydi kimi əlavə edilə bilər.",
  "Mətn sahəsinin doldurulmasını göstərən qısa nümunədir.",
  "Real məzmun deyil, yalnız yer tutmaq üçün yazılıb.",
];

/*
 * Every letter form mapped explicitly, upper and lower, before anything is
 * case-folded: JS's own `.toLowerCase()` on the dotted capital letter at
 * U+0130 yields the plain letter plus a combining dot above (Unicode
 * default case folding), not the plain letter alone — a well-known
 * Turkish/Azerbaijani case-folding pitfall. Mapping every accented form up
 * front and only ever running `.toLowerCase()` over what is left (plain
 * ASCII, always safe) avoids that pitfall entirely.
 */
const TRANSLIT: Record<string, string> = {
  ə: "e", Ə: "e", ö: "o", Ö: "o", ü: "u", Ü: "u",
  ş: "sh", Ş: "sh", ç: "c", Ç: "c", ğ: "g", Ğ: "g",
  ı: "i", İ: "i",
};

function translit(text: string): string {
  return text
    .split("")
    .map((char) => TRANSLIT[char] ?? char.toLowerCase())
    .join("")
    .replace(/[^a-z0-9]/g, "");
}

/* ---------- IBAN: MOD-97 (ISO 7064) ---------- */

const BANK_CODES = ["ADAB", "TFKB", "ULIB", "BRES", "AIIB", "NABZ", "KAPB"];

function ibanNumericString(bban: string, countryAndCheck: string): string {
  const rearranged = bban + countryAndCheck;
  let numeric = "";
  for (const char of rearranged) {
    if (/[0-9]/.test(char)) numeric += char;
    else numeric += (char.toUpperCase().charCodeAt(0) - 55).toString(); // A=10 ... Z=35
  }
  return numeric;
}

/** `numeric mod 97`, computed digit by digit so it never needs a number bigger than `97 * 10 + 9`. */
function mod97(numeric: string): number {
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

export function generateIban(rng: Rng): string {
  const bankCode = pick(rng, BANK_CODES);
  const account = digits(rng, 20);
  const bban = bankCode + account;
  const numeric = ibanNumericString(bban, "AZ00");
  const checkDigits = (98 - mod97(numeric)).toString().padStart(2, "0");
  return `AZ${checkDigits}${bban}`;
}

/** Independent re-check: moves the first four characters to the end and requires `numeric mod 97 === 1`. */
export function verifyIbanChecksum(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) return false;
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  let numeric = "";
  for (const char of rearranged) {
    if (/[0-9]/.test(char)) numeric += char;
    else numeric += (char.charCodeAt(0) - 55).toString();
  }
  return mod97(numeric) === 1;
}

/* ---------- row generation ---------- */

type Person = { gender: "m" | "f"; firstName: string; lastName: string };

function generatePerson(rng: Rng): Person {
  const gender: "m" | "f" = rng() < 0.5 ? "m" : "f";
  const firstName = gender === "m" ? pick(rng, MALE_NAMES) : pick(rng, FEMALE_NAMES);
  const pair = pick(rng, SURNAME_PAIRS);
  const lastName = gender === "m" ? pair[0] : pair[1];
  return { gender, firstName, lastName };
}

function randomDate(rng: Rng): string {
  const start = Date.UTC(2015, 0, 1);
  const end = Date.UTC(2026, 11, 31);
  const timestamp = start + Math.floor(rng() * (end - start));
  return new Date(timestamp).toISOString().slice(0, 10);
}

function fieldValue(key: FieldKey, rng: Rng, person: Person): string {
  switch (key) {
    case "ad":
      return person.firstName;
    case "soyad":
      return person.lastName;
    case "tamAd":
      return `${person.firstName} ${person.lastName}`;
    case "cins":
      return person.gender === "m" ? "kişi" : "qadın";
    case "mobil":
      return `+994 (${pick(rng, MOBILE_PREFIXES)}) ${digits(rng, 3)} ${digits(rng, 2)} ${digits(rng, 2)}`;
    case "unvan":
      return `Bakı, ${pick(rng, BAKU_DISTRICTS)} r., ${pick(rng, STREET_NAMES)}, ev ${1 + Math.floor(rng() * 200)}`;
    case "voen":
      return digits(rng, 10);
    case "eposta":
      return `${translit(person.firstName)}.${translit(person.lastName)}${Math.floor(rng() * 900) + 10}@${pick(rng, EMAIL_DOMAINS)}`;
    case "tarix":
      return randomDate(rng);
    case "iban":
      return generateIban(rng);
    case "sirket":
      return `${pick(rng, COMPANY_WORDS)} ${pick(rng, COMPANY_WORDS)} ${pick(rng, COMPANY_SUFFIXES)}`;
    case "metn":
      return pick(rng, SENTENCES);
  }
}

export type DataRow = Record<FieldKey, string>;

export function generateDataset(count: number, fields: FieldKey[], seed: number): { ok: true; rows: DataRow[] } | { ok: false; error: string } {
  if (fields.length === 0) return { ok: false, error: "Ən azı bir sahə seç." };
  if (!Number.isInteger(count) || count < 1) return { ok: false, error: "Sətir sayı ən azı 1 olmalıdır." };
  if (count > MAX_ROWS) return { ok: false, error: `Sətir sayı ${MAX_ROWS}-dən çox ola bilməz.` };

  const rng = mulberry32(seed);
  const rows: DataRow[] = [];
  for (let i = 0; i < count; i++) {
    const person = generatePerson(rng);
    const row = {} as DataRow;
    for (const field of fields) row[field] = fieldValue(field, rng, person);
    rows.push(row);
  }
  return { ok: true, rows };
}

/* ---------- output formats ---------- */

export function toJson(rows: DataRow[], fields: FieldKey[]): string {
  return JSON.stringify(
    rows.map((row) => Object.fromEntries(fields.map((f) => [f, row[f]]))),
    null,
    2,
  );
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(rows: DataRow[], fields: FieldKey[]): string {
  const header = fields.map((f) => csvCell(FIELD_LABELS[f])).join(",");
  const lines = rows.map((row) => fields.map((f) => csvCell(row[f])).join(","));
  return [header, ...lines].join("\n");
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function toSqlInsert(rows: DataRow[], fields: FieldKey[], tableName: string): string {
  const table = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName) ? tableName : "test_data";
  const columns = fields.join(", ");
  const values = rows.map((row) => `  (${fields.map((f) => sqlString(row[f])).join(", ")})`).join(",\n");
  return `INSERT INTO ${table} (${columns})\nVALUES\n${values};`;
}
