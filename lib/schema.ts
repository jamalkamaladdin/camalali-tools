/**
 * Schema.org JSON-LD in both directions: a form that assembles one, and a
 * reader that checks one somebody pasted.
 *
 * Everything here is pure — no DOM, no network — so the check suite pins each
 * rule down directly and the widget above it only draws state.
 *
 * `required` in `SCHEMA_FIELDS` is this file's own word and not Google's.
 * Google publishes nearly every Article property as "recommended", yet a node
 * with no headline still says nothing about the page it sits on. The gate here
 * is therefore "the record is meaningless without it", and every rule carries
 * the sentence that justifies itself so the tool never asserts a requirement
 * it cannot explain.
 */

import { locate } from "./json";

export type SchemaType =
  | "Article"
  | "FAQPage"
  | "BreadcrumbList"
  | "LocalBusiness"
  | "Organization"
  | "Person";

export const SCHEMA_TYPES: SchemaType[] = [
  "Article",
  "FAQPage",
  "BreadcrumbList",
  "LocalBusiness",
  "Organization",
  "Person",
];

/**
 * One rule about one property. `name` is a path into the parsed node, dotted
 * for a nested one (`publisher.logo`), because that is what the validator has
 * to walk — the build form's own field names are a separate concern.
 */
export type FieldRule = { name: string; required: boolean; why: string };

export const SCHEMA_FIELDS: Record<SchemaType, FieldRule[]> = {
  Article: [
    {
      name: "headline",
      required: true,
      why: "Başlıq olmadan qeydin hansı yazıya aid olduğu bilinmir; bu, düyünün özünü adlandıran yeganə sahədir.",
    },
    {
      name: "datePublished",
      required: true,
      why: "Dərc tarixi yazının nə vaxt aktual olduğunu bildirir; onsuz köhnə və yeni məzmun eyni görünür.",
    },
    {
      name: "author",
      required: true,
      why: "Müəllif mətnin arxasında kimin durduğunu göstərir; mənbəyi olmayan yazı yoxlanıla bilməz.",
    },
    {
      name: "description",
      required: false,
      why: "Qısa təsvir yazının nədən bəhs etdiyini bir cümlə ilə deyir və mətnin ilk abzasından asılılığı azaldır.",
    },
    {
      name: "image",
      required: false,
      why: "Şəkil qeydə görsəl bağlayır; siyahılarda miniatür göstərilməsi bu sahədən asılıdır.",
    },
    {
      name: "dateModified",
      required: false,
      why: "Yenilənmə tarixi köhnə yazının sonradan düzəldildiyini bildirir; dərc tarixi bunu deyə bilmir.",
    },
    {
      name: "publisher",
      required: false,
      why: "Nəşriyyatçı yazının hansı saytın adından dərc olunduğunu göstərir.",
    },
    {
      name: "mainEntityOfPage",
      required: false,
      why: "Qeydin hansı səhifəyə aid olduğunu açıq yazır; eyni yazı bir neçə ünvanda olanda əsas ünvanı bu təyin edir.",
    },
  ],
  FAQPage: [
    {
      name: "mainEntity",
      required: true,
      why: "Sual-cavab siyahısı bu açarın içindədir; onsuz qeyd boş bir FAQ elanıdır.",
    },
    {
      name: "inLanguage",
      required: false,
      why: "Dil kodu cavabların hansı auditoriya üçün yazıldığını dəqiqləşdirir.",
    },
  ],
  BreadcrumbList: [
    {
      name: "itemListElement",
      required: true,
      why: "Yol zəncirinin pillələri buradadır; boş siyahı heç bir naviqasiya göstərmir.",
    },
  ],
  LocalBusiness: [
    {
      name: "name",
      required: true,
      why: "Biznesin adı qeydin kimi təsvir etdiyini bildirən yeganə sahədir.",
    },
    {
      name: "address",
      required: true,
      why: "Ünvan yerli biznesi digərlərindən ayırır; küçə və şəhər olmadan qeyd xəritədə heç bir nöqtəyə bağlanmır.",
    },
    {
      name: "telephone",
      required: false,
      why: "Telefon nömrəsi ziyarətçinin sayta girmədən əlaqə saxlaya biləcəyi yeganə sahədir.",
    },
    {
      name: "url",
      required: false,
      why: "Rəsmi ünvan qeydi saytın özünə bağlayır.",
    },
    {
      name: "geo",
      required: false,
      why: "Koordinat xəritədə dəqiq nöqtə verir; ünvan mətni bəzən səhv yerə düşür.",
    },
    {
      name: "openingHoursSpecification",
      required: false,
      why: "İş saatları «indi açıqdır» tipli göstərişlərin qurulduğu sahədir.",
    },
    {
      name: "priceRange",
      required: false,
      why: "Qiymət aralığı ziyarətçinin gözləntisini əvvəlcədən qurur.",
    },
    {
      name: "image",
      required: false,
      why: "Şəkil qeydə məkanın görüntüsünü bağlayır.",
    },
  ],
  Organization: [
    {
      name: "name",
      required: true,
      why: "Təşkilatın adı qeydin əsas identifikatorudur.",
    },
    {
      name: "url",
      required: true,
      why: "Rəsmi ünvan eyni adlı iki təşkilatı bir-birindən ayıran yeganə sahədir.",
    },
    {
      name: "logo",
      required: false,
      why: "Loqo təşkilatın görsəl işarəsini qeydə bağlayır.",
    },
    {
      name: "sameAs",
      required: false,
      why: "Xarici profil linkləri qeydi artıq tanınan səhifələrlə eyniləşdirir.",
    },
    {
      name: "description",
      required: false,
      why: "Təsvir təşkilatın nə etdiyini bir cümlə ilə deyir.",
    },
    {
      name: "alternateName",
      required: false,
      why: "Alternativ ad qısaltma və ya ikinci yazılış formasını qeydə əlavə edir.",
    },
  ],
  Person: [
    {
      name: "name",
      required: true,
      why: "Ad şəxsi qeydin əsas identifikatorudur.",
    },
    {
      name: "url",
      required: false,
      why: "Şəxsi ünvan qeydi eyni adı daşıyan başqa şəxslərdən ayırır.",
    },
    {
      name: "jobTitle",
      required: false,
      why: "İş adı şəxsin hansı sahədə tanındığını bildirir.",
    },
    {
      name: "worksFor",
      required: false,
      why: "İşlədiyi təşkilat şəxsi qeydini təşkilat qeydi ilə birləşdirir.",
    },
    {
      name: "image",
      required: false,
      why: "Şəkil şəxsin görüntüsünü qeydə bağlayır.",
    },
    {
      name: "sameAs",
      required: false,
      why: "Profil linkləri şəxsi artıq mövcud səhifələrlə eyniləşdirir.",
    },
  ],
};

/* ---------- the shapes the form hands over ---------- */

export type FaqPair = { question: string; answer: string };
export type CrumbRow = { name: string; url: string };
export type HoursRow = { days: string[]; opens: string; closes: string };

/**
 * Day names go out in English because `dayOfWeek` is a schema.org enumeration,
 * not free text — an Azerbaijani day name there is an unrecognised value. The
 * label beside it is what the visitor actually reads.
 */
export const WEEKDAYS: { value: string; label: string }[] = [
  { value: "Monday", label: "B.e" },
  { value: "Tuesday", label: "Ç.a" },
  { value: "Wednesday", label: "Ç" },
  { value: "Thursday", label: "C.a" },
  { value: "Friday", label: "C" },
  { value: "Saturday", label: "Ş" },
  { value: "Sunday", label: "B" },
];

export const EMPTY_VALUES: Record<SchemaType, Record<string, unknown>> = {
  Article: {
    headline: "",
    description: "",
    image: "",
    datePublished: "",
    dateModified: "",
    authorName: "",
    publisherName: "",
    publisherLogo: "",
    mainEntityOfPage: "",
  },
  FAQPage: {
    questions: [{ question: "", answer: "" }] as FaqPair[],
  },
  BreadcrumbList: {
    items: [
      { name: "", url: "" },
      { name: "", url: "" },
    ] as CrumbRow[],
  },
  LocalBusiness: {
    name: "",
    description: "",
    telephone: "",
    streetAddress: "",
    addressLocality: "",
    postalCode: "",
    addressCountry: "",
    latitude: "",
    longitude: "",
    priceRange: "",
    url: "",
    hours: [{ days: ["Monday"], opens: "09:00", closes: "18:00" }] as HoursRow[],
  },
  Organization: {
    name: "",
    alternateName: "",
    url: "",
    logo: "",
    description: "",
    sameAs: "",
  },
  Person: {
    name: "",
    jobTitle: "",
    worksFor: "",
    url: "",
    image: "",
    sameAs: "",
  },
};

/* ---------- building ---------- */

type Node = Record<string, unknown>;

function text(values: Record<string, unknown>, key: string): string {
  const value = values[key];
  return typeof value === "string" ? value.trim() : "";
}

function rows<T>(values: Record<string, unknown>, key: string): T[] {
  const value = values[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

/** One address per line, blanks dropped — a `sameAs` with an empty string in it is a broken link the tool wrote itself. */
function lines(values: Record<string, unknown>, key: string): string[] {
  return text(values, key)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * Writes the key only when something survives trimming. An empty value is not
 * a neutral placeholder in structured data: a crawler reads `"headline": ""`
 * as the author stating the headline is blank, which is worse than the
 * property never having been written.
 */
function put(node: Node, key: string, value: string): void {
  if (value !== "") node[key] = value;
}

/** A nested node is written only when it carries something besides its own `@type`. */
function putNode(parent: Node, key: string, child: Node, typeName: string): void {
  if (Object.keys(child).length === 0) return;
  parent[key] = { "@type": typeName, ...child };
}

function putList(parent: Node, key: string, items: unknown[]): void {
  if (items.length > 0) parent[key] = items;
}

/** Coordinates are numbers in schema.org, and an Azerbaijani keyboard types the decimal comma. */
function coordinate(raw: string): number | null {
  if (raw === "") return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildArticle(node: Node, values: Record<string, unknown>): void {
  put(node, "headline", text(values, "headline"));
  put(node, "description", text(values, "description"));
  put(node, "image", text(values, "image"));
  put(node, "datePublished", text(values, "datePublished"));
  put(node, "dateModified", text(values, "dateModified"));

  const author: Node = {};
  put(author, "name", text(values, "authorName"));
  putNode(node, "author", author, "Person");

  const publisher: Node = {};
  put(publisher, "name", text(values, "publisherName"));
  const logo = text(values, "publisherLogo");
  if (logo !== "") publisher.logo = { "@type": "ImageObject", url: logo };
  putNode(node, "publisher", publisher, "Organization");

  const page = text(values, "mainEntityOfPage");
  if (page !== "") node.mainEntityOfPage = { "@type": "WebPage", "@id": page };
}

/** A pair with no question is dropped whole; an answer alone has nothing to answer. */
function buildFaq(node: Node, values: Record<string, unknown>): void {
  const list = rows<FaqPair>(values, "questions").flatMap((pair) => {
    const question = (pair.question ?? "").trim();
    if (question === "") return [];
    const item: Node = { "@type": "Question", name: question };
    const answer = (pair.answer ?? "").trim();
    if (answer !== "") item.acceptedAnswer = { "@type": "Answer", text: answer };
    return [item];
  });
  putList(node, "mainEntity", list);
}

/*
 * `position` is counted after the blank rows are dropped, not from the row's
 * index in the form. Numbering from the form index leaves a hole the moment a
 * visitor clears the middle row, and a breadcrumb list that jumps 1, 3, 4 is
 * read as three unrelated steps rather than one path.
 */
function buildBreadcrumb(node: Node, values: Record<string, unknown>): void {
  const list = rows<CrumbRow>(values, "items")
    .filter((row) => (row.name ?? "").trim() !== "")
    .map((row, index) => {
      const item: Node = {
        "@type": "ListItem",
        position: index + 1,
        name: (row.name ?? "").trim(),
      };
      const url = (row.url ?? "").trim();
      /* The last step is the page itself, and schema.org allows it to carry no
         `item` — so a row with a name and no address stays in the list. */
      if (url !== "") item.item = url;
      return item;
    });
  putList(node, "itemListElement", list);
}

/** A row without days, or without both ends of the interval, states nothing and is dropped. */
function buildHours(values: Record<string, unknown>): Node[] {
  return rows<HoursRow>(values, "hours").flatMap((row) => {
    const days = (row.days ?? []).filter((day) => day !== "");
    const opens = (row.opens ?? "").trim();
    const closes = (row.closes ?? "").trim();
    if (days.length === 0 || opens === "" || closes === "") return [];
    return [{ "@type": "OpeningHoursSpecification", dayOfWeek: days, opens, closes }];
  });
}

function buildLocalBusiness(node: Node, values: Record<string, unknown>): void {
  put(node, "name", text(values, "name"));
  put(node, "description", text(values, "description"));
  put(node, "telephone", text(values, "telephone"));
  put(node, "url", text(values, "url"));
  put(node, "priceRange", text(values, "priceRange"));

  const address: Node = {};
  put(address, "streetAddress", text(values, "streetAddress"));
  put(address, "addressLocality", text(values, "addressLocality"));
  put(address, "postalCode", text(values, "postalCode"));
  put(address, "addressCountry", text(values, "addressCountry"));
  putNode(node, "address", address, "PostalAddress");

  /* Half a coordinate points at the wrong place with full confidence, so the
     pair is written only when both halves parse as numbers. */
  const latitude = coordinate(text(values, "latitude"));
  const longitude = coordinate(text(values, "longitude"));
  if (latitude !== null && longitude !== null) {
    node.geo = { "@type": "GeoCoordinates", latitude, longitude };
  }

  putList(node, "openingHoursSpecification", buildHours(values));
}

function buildOrganization(node: Node, values: Record<string, unknown>): void {
  put(node, "name", text(values, "name"));
  put(node, "alternateName", text(values, "alternateName"));
  put(node, "url", text(values, "url"));
  put(node, "logo", text(values, "logo"));
  put(node, "description", text(values, "description"));
  putList(node, "sameAs", lines(values, "sameAs"));
}

function buildPerson(node: Node, values: Record<string, unknown>): void {
  put(node, "name", text(values, "name"));
  put(node, "jobTitle", text(values, "jobTitle"));
  put(node, "url", text(values, "url"));
  put(node, "image", text(values, "image"));

  const worksFor: Node = {};
  put(worksFor, "name", text(values, "worksFor"));
  putNode(node, "worksFor", worksFor, "Organization");

  putList(node, "sameAs", lines(values, "sameAs"));
}

export function buildSchema(
  type: SchemaType,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const node: Node = { "@context": "https://schema.org", "@type": type };

  switch (type) {
    case "Article":
      buildArticle(node, values);
      break;
    case "FAQPage":
      buildFaq(node, values);
      break;
    case "BreadcrumbList":
      buildBreadcrumb(node, values);
      break;
    case "LocalBusiness":
      buildLocalBusiness(node, values);
      break;
    case "Organization":
      buildOrganization(node, values);
      break;
    case "Person":
      buildPerson(node, values);
      break;
  }

  return node;
}

/** Two-space indent — the readable half of the output, shown on its own and reused inside the script block. */
export function formatSchema(schema: unknown): string {
  return JSON.stringify(schema, null, 2);
}

/*
 * `src/lib/json-ld.ts` already escapes these three characters, and this is the
 * same set on purpose — but that helper stringifies compactly and takes no
 * indent, while a block meant to be read before it is pasted has to stay
 * indented. The escaping is repeated here rather than the output being
 * flattened to reuse it; the check suite asserts both produce the same
 * escapes for the same input.
 *
 * `<` is the one that matters: a value containing `</script>` would close the
 * tag it was written into and the rest of the JSON would be parsed as markup.
 * `>` and `&` follow so the block is also safe inside XHTML and inside an
 * HTML-escaping template.
 */
const SCRIPT_UNSAFE = /[<>&]/g;
const SCRIPT_ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
};

export function toScriptBlock(schema: unknown): string {
  const body = formatSchema(schema).replace(
    SCRIPT_UNSAFE,
    (character) => SCRIPT_ESCAPES[character],
  );
  return `<script type="application/ld+json">\n${body}\n</script>`;
}

/* ---------- validating ---------- */

export type Validation = {
  ok: boolean;
  type: string | null;
  missing: FieldRule[];
  notes: string[];
  parseError: { message: string; line: number; column: number } | null;
};

/**
 * Subtypes this tool checks with their parent's rules. They are genuine
 * schema.org descendants, so every rule of the parent applies to them — which
 * is why the mapping is safe to make and is stated in a note rather than
 * applied silently.
 */
const TYPE_ALIASES: Record<string, SchemaType> = {
  BlogPosting: "Article",
  NewsArticle: "Article",
  TechArticle: "Article",
  ScholarlyArticle: "Article",
  Report: "Article",
  Corporation: "Organization",
  NGO: "Organization",
  OnlineStore: "Organization",
  EducationalOrganization: "Organization",
  Restaurant: "LocalBusiness",
  Store: "LocalBusiness",
  ProfessionalService: "LocalBusiness",
  CafeOrCoffeeShop: "LocalBusiness",
  Dentist: "LocalBusiness",
};

const SCRIPT_WRAPPER = /^<script[^>]*>([\s\S]*?)<\/script>$/i;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMeaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Node).length > 0;
  return true;
}

/** Walks a dotted rule name; a missing step is the same answer as a blank value. */
function hasValue(node: Node, path: string): boolean {
  let current: unknown = node;
  for (const step of path.split(".")) {
    if (!isNode(current)) return false;
    current = current[step];
  }
  return isMeaningful(current);
}

/** `@type` is allowed to be an array — the first entry is the one the record leads with. */
function typeNameOf(node: Node): string | null {
  const raw = node["@type"];
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => typeof entry === "string" && entry.trim() !== "");
    if (typeof first === "string") return first.trim();
  }
  return null;
}

/** A bare object, an array of objects, and an `@graph` wrapper are all shapes a page really ships. */
function collectNodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.filter(isNode);
  if (!isNode(value)) return [];
  const graph = value["@graph"];
  if (Array.isArray(graph)) return graph.filter(isNode);
  return [value];
}

/*
 * `JSON.parse` reports in English and the wording differs between engines. The
 * json tool next door keeps a fuller translation table, unexported and tied to
 * its own scanner; this is the short version, and anything it does not
 * recognise falls through to the engine's own words rather than to a vague
 * Azerbaijani sentence that hides what actually broke.
 */
function translateParseFailure(message: string): string {
  if (/Unexpected end of JSON input/i.test(message)) {
    return "JSON yarımçıqdır: mötərizə və ya kvadrat mötərizə bağlanmayıb.";
  }
  if (/Expected (double-quoted )?property name/i.test(message)) {
    return "Açar adı cüt dırnaqla yazılmalıdır: dırnaqsız açar və ya artıq vergül JSON-da qadağandır.";
  }
  if (message.includes("Expected ','")) {
    return "Elementlər arasında vergül çatışmır. Ya da sonuncudan sonra artıq vergül var.";
  }
  if (/Unexpected non-whitespace character/i.test(message)) {
    return "Düzgün JSON-dan sonra əlavə mətn var (bir sənəddə yalnız bir dəyər ola bilər).";
  }
  if (/Unexpected token/i.test(message)) {
    return "Gözlənilməz simvol var: sintaksis bu nöqtədə pozulub.";
  }
  return message;
}

function parseJson(
  source: string,
): { ok: true; value: unknown } | { ok: false; error: Validation["parseError"] } {
  try {
    return { ok: true, value: JSON.parse(source) };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const match = message.match(/position (\d+)/);
    const position = match ? Number(match[1]) : 0;
    const spot = locate(source, position);
    return {
      ok: false,
      error: { message: translateParseFailure(message), line: spot.line, column: spot.column },
    };
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** Checks that survive only inside one type, written as notes because they describe a shape rather than a missing key. */
function typeNotes(type: SchemaType, node: Node, notes: string[]): void {
  if (type === "Article") {
    const published = node.datePublished;
    if (typeof published === "string" && published !== "" && !ISO_DATE.test(published)) {
      notes.push(
        "«datePublished» ISO-8601 formatında deyil: 2026-09-03 və ya 2026-09-03T10:00:00+04:00 gözlənilir.",
      );
    }
  }

  if (type === "FAQPage" && Array.isArray(node.mainEntity)) {
    const broken = node.mainEntity.filter(
      (item) => !isNode(item) || !hasValue(item, "name") || !hasValue(item, "acceptedAnswer.text"),
    ).length;
    if (broken > 0) {
      notes.push(
        `${broken} sualın adı və ya «acceptedAnswer.text» cavabı boşdur, belə sual-cavab cütü oxunmur.`,
      );
    }
  }

  if (type === "BreadcrumbList" && Array.isArray(node.itemListElement)) {
    const positions = node.itemListElement.map((item) =>
      isNode(item) && typeof item.position === "number" ? item.position : null,
    );
    const ordered = positions.every((value, index) => value === index + 1);
    if (!ordered) {
      notes.push(
        "«position» dəyərləri 1-dən başlayıb ardıcıl getmir: pillələr ayrı-ayrı addım kimi oxunur.",
      );
    }
  }

  if (type === "LocalBusiness" && typeof node.address === "string") {
    notes.push(
      "«address» mətn kimi yazılıb (küçə, şəhər və indeks ayrı-ayrı sahələr olanda ünvan daha etibarlı oxunur).",
    );
  }
}

/** Empty input, a script wrapper, and a lone JSON body all arrive here as the same thing: a string that might be JSON. */
function unwrap(text: string, notes: string[]): string {
  const trimmed = text.trim();
  const wrapped = SCRIPT_WRAPPER.exec(trimmed);
  if (!wrapped) return trimmed;
  notes.push("«script» sarğısı kənara qoyuldu, yalnız içindəki JSON yoxlanıldı.");
  return wrapped[1].trim();
}

export function validateSchema(text: string): Validation {
  const notes: string[] = [];
  const source = unwrap(text, notes);

  if (source === "") {
    return {
      ok: false,
      type: null,
      missing: [],
      notes: ["Yoxlamaq üçün hazır JSON-LD yapışdır."],
      parseError: null,
    };
  }

  const parsed = parseJson(source);
  if (!parsed.ok) {
    return { ok: false, type: null, missing: [], notes, parseError: parsed.error };
  }

  const nodes = collectNodes(parsed.value);
  if (nodes.length === 0) {
    notes.push("JSON düzgündür, amma içində yoxlanacaq obyekt yoxdur.");
    return { ok: false, type: null, missing: [], notes, parseError: null };
  }

  /* Several nodes in one graph is normal — the first recognised one is checked
     and the choice is stated, rather than a silent "the first one". */
  const chosen = nodes.find((node) => resolveType(typeNameOf(node)) !== null) ?? nodes[0];
  if (nodes.length > 1) {
    notes.push(`Girişdə ${nodes.length} qeyd var: yoxlama tanınan ilk qeyd üzərində aparıldı.`);
  }

  const rootHasContext = isNode(parsed.value) && isMeaningful(parsed.value["@context"]);
  const hasContext = rootHasContext || isMeaningful(chosen["@context"]);
  if (!hasContext) {
    notes.push(
      "«@context» yoxdur: schema.org ünvanı göstərilmədən açarların hansı lüğətə aid olduğu bilinmir.",
    );
  }

  const rawType = typeNameOf(chosen);
  if (rawType === null) {
    notes.push("«@type» yoxdur: qeydin nəyi təsvir etdiyi bəlli deyil.");
    return { ok: false, type: null, missing: [], notes, parseError: null };
  }

  const known = resolveType(rawType);
  if (known === null) {
    notes.push(
      `«${rawType}» tipini tanımıram: yalnız JSON düzgünlüyünü yoxladım, sahə siyahısı çıxarmadım.`,
    );
    return { ok: hasContext, type: rawType, missing: [], notes, parseError: null };
  }

  if (known !== rawType) {
    notes.push(`«${rawType}»: «${known}» tipinin alt növüdür, ona görə ${known} qaydaları ilə yoxlanıldı.`);
  }

  const missing = SCHEMA_FIELDS[known].filter((rule) => !hasValue(chosen, rule.name));
  typeNotes(known, chosen, notes);

  return {
    ok: hasContext && !missing.some((rule) => rule.required),
    type: rawType,
    missing,
    notes,
    parseError: null,
  };
}

function resolveType(rawType: string | null): SchemaType | null {
  if (rawType === null) return null;
  if ((SCHEMA_TYPES as string[]).includes(rawType)) return rawType as SchemaType;
  return TYPE_ALIASES[rawType] ?? null;
}
