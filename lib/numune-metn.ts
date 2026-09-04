/**
 * Azerbaijani filler text, in place of Latin lorem ipsum. The whole point of
 * this file is that Latin lorem ipsum lies about layout: its word lengths and
 * letter frequencies are Latin, and Azerbaijani words run longer
 * (agglutinative suffixes) and lean on letters -- schwa, dotless i, and a
 * handful of other diacritics -- that Latin text has none of, so a Latin
 * placeholder wraps and truncates differently from the real copy that
 * eventually replaces it. Real Azerbaijani words strung together at random
 * -- nonsensical sentences, but real words and real suffixes -- measure the
 * layout honestly instead.
 */

export type SampleUnit = "paragraph" | "sentence" | "word" | "list";

export type SampleOptions = {
  unit: SampleUnit;
  count: number;
  /** Prepends a short, plain heading line before the body. */
  withHeading: boolean;
  /** Wraps the body in `<p>`/`<ul><li>` tags instead of plain lines. */
  html: boolean;
};

export type SampleResult = {
  text: string;
  wordCount: number;
  sentenceCount: number;
};

/**
 * Everyday Azerbaijani vocabulary -- mostly the software/business register
 * this site's own audience reads, which also happens to exercise the full
 * set of extra letters a layout test actually needs. No word here carries a
 * hyphen or apostrophe, so a generated line can be split into words on
 * whitespace alone.
 */
const WORD_BANK: readonly string[] = [
  "sistem", "layihə", "məlumat", "texnologiya", "istifadəçi", "proses",
  "nəticə", "əlaqə", "vəziyyət", "imkan", "tələb", "səviyyə", "quruluş",
  "hədəf", "idarəetmə", "təhlil", "araşdırma", "inkişaf", "keyfiyyət",
  "sürət", "təhlükəsizlik", "performans", "interfeys", "funksiya", "modul",
  "komponent", "server", "verilənlər", "baza", "şəbəkə", "brauzer", "cihaz",
  "proqram", "tətbiq", "xidmət", "müştəri", "təcrübə", "dizayn", "struktur",
  "element", "obyekt", "dəyər", "parametr", "sənəd", "hesabat", "cədvəl",
  "qrafik", "diaqram", "model", "nümunə", "üsul", "metod", "alqoritm",
  "prinsip", "qayda", "standart", "format", "kodlaşdırma", "şifrələmə",
  "doğrulama", "yoxlama", "sınaq", "nəzarət", "idarə", "təşkilat", "komanda",
  "hazırlıq", "icra", "yenilənmə", "təkmilləşdirmə", "optimallaşdırma",
  "genişləndirmə", "inteqrasiya", "əməkdaşlıq", "razılaşma", "müqavilə",
  "büdcə", "xərc", "mənfəət", "bazar", "rəqabət", "strategiya", "məqsəd",
  "vəzifə", "öhdəlik", "məsuliyyət", "səlahiyyət", "qərar", "təklif",
  "tövsiyə", "ölçü", "göstərici", "amil", "səbəb", "təsir", "dəyişiklik",
  "sürətli", "sadə", "mürəkkəb", "əsas", "əlavə", "ümumi", "xüsusi",
  "müasir", "ənənəvi", "davamlı", "etibarlı", "səmərəli", "faydalı",
  "vacib", "zəruri", "mümkün", "virtual", "rəqəmsal", "avtomatik", "təbii",
  "böyük", "kiçik", "yeni", "köhnə", "aktiv", "passiv", "yaratmaq",
  "araşdırmaq", "yoxlamaq", "sınamaq", "planlaşdırmaq", "hazırlamaq",
  "birləşdirmək", "ayırmaq", "müəyyən", "qiymətləndirmək",
];

export const COUNT_LIMITS: Record<SampleUnit, { min: number; max: number }> = {
  paragraph: { min: 1, max: 50 },
  sentence: { min: 1, max: 200 },
  word: { min: 1, max: 2000 },
  list: { min: 1, max: 100 },
};

/**
 * Clamps rather than rejects: a zero, a negative number or a wildly large
 * request from a stray keystroke in the count field should still produce a
 * usable batch of text, not an error the visitor has to read and dismiss.
 */
export function clampCount(unit: SampleUnit, count: number): number {
  const { min, max } = COUNT_LIMITS[unit];
  if (!Number.isFinite(count)) return min;
  return Math.min(max, Math.max(min, Math.round(count)));
}

function randomWord(): string {
  return WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function buildWords(count: number): string[] {
  return Array.from({ length: count }, randomWord);
}

/**
 * `String.prototype.toUpperCase` is correct for every Azerbaijani letter
 * except the dotted/dotless i pair, because that mapping is locale-specific
 * rather than a fixed Unicode rule: the default table maps the ASCII "i" to
 * "I" and has no rule at all for the dotless lowercase letter, which is the
 * well-known Turkish-I problem. The two cases are handled by hand instead of
 * trusting a browser's Azerbaijani locale data to be present -- the same
 * reason `lib/az-date.ts` writes out month names instead of calling
 * `toLocaleDateString("az-AZ", …)`.
 */
function capitalizeFirst(word: string): string {
  if (word === "") return word;
  const first = word[0];
  const rest = word.slice(1);
  if (first === "i") return `İ${rest}`;
  if (first === "ı") return `I${rest}`;
  return first.toUpperCase() + rest;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

function countSentences(text: string): number {
  return (text.match(/\./g) ?? []).length;
}

function buildSentenceFromWords(words: string[]): string {
  const capped = [capitalizeFirst(words[0]), ...words.slice(1)];
  return `${capped.join(" ")}.`;
}

function buildSentence(): string {
  return buildSentenceFromWords(buildWords(randomInt(4, 14)));
}

function buildParagraph(): string {
  const sentences = Array.from({ length: randomInt(3, 6) }, buildSentence);
  return sentences.join(" ");
}

function buildListItem(): string {
  const words = buildWords(randomInt(3, 7));
  return [capitalizeFirst(words[0]), ...words.slice(1)].join(" ");
}

function buildHeading(): string {
  const words = buildWords(randomInt(2, 4));
  return [capitalizeFirst(words[0]), ...words.slice(1)].join(" ");
}

type UnitOutput = { body: string; wordCount: number; sentenceCount: number };

function renderWordUnit(count: number, html: boolean): UnitOutput {
  const words = buildWords(count);
  const sentence = buildSentenceFromWords(words);
  return { body: html ? `<p>${sentence}</p>` : sentence, wordCount: words.length, sentenceCount: 1 };
}

function renderSentenceUnit(count: number, html: boolean): UnitOutput {
  const sentences = Array.from({ length: count }, buildSentence);
  const joined = sentences.join(" ");
  return {
    body: html ? `<p>${joined}</p>` : joined,
    wordCount: sentences.reduce((sum, s) => sum + countWords(s), 0),
    sentenceCount: sentences.length,
  };
}

function renderParagraphUnit(count: number, html: boolean): UnitOutput {
  const paragraphs = Array.from({ length: count }, buildParagraph);
  return {
    body: paragraphs.map((p) => (html ? `<p>${p}</p>` : p)).join(html ? "\n" : "\n\n"),
    wordCount: paragraphs.reduce((sum, p) => sum + countWords(p), 0),
    sentenceCount: paragraphs.reduce((sum, p) => sum + countSentences(p), 0),
  };
}

function renderListUnit(count: number, html: boolean): UnitOutput {
  const items = Array.from({ length: count }, buildListItem);
  const body = html
    ? `<ul>\n${items.map((item) => `  <li>${item}</li>`).join("\n")}\n</ul>`
    : items.map((item) => `- ${item}`).join("\n");
  return { body, wordCount: items.reduce((sum, item) => sum + countWords(item), 0), sentenceCount: 0 };
}

const UNIT_RENDERERS: Record<SampleUnit, (count: number, html: boolean) => UnitOutput> = {
  word: renderWordUnit,
  sentence: renderSentenceUnit,
  paragraph: renderParagraphUnit,
  list: renderListUnit,
};

/**
 * Deliberately not seeded: two calls with identical options must read
 * differently, or a page needing several filler blocks would show the same
 * sentence repeated across every one of them.
 */
export function generateSampleText(options: SampleOptions): SampleResult {
  const count = clampCount(options.unit, options.count);
  const { body, wordCount, sentenceCount } = UNIT_RENDERERS[options.unit](count, options.html);

  if (!options.withHeading) {
    return { text: body, wordCount, sentenceCount };
  }

  const heading = buildHeading();
  const headingBlock = options.html ? `<h2>${heading}</h2>` : heading;
  const separator = options.html ? "\n" : "\n\n";

  return {
    text: `${headingBlock}${separator}${body}`,
    wordCount: wordCount + countWords(heading),
    sentenceCount,
  };
}
