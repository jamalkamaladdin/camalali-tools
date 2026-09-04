/*
 * What is worth pinning down here: the generated block cannot be escaped out
 * of, a blank form field never reaches the output, and the validator says
 * nothing it cannot support — no invented "missing" list for a type it has
 * never heard of, and a real line and column when the paste is broken.
 */
import type { CheckSuite } from "./harness.mts";
import { jsonLd } from "../shared/json-ld";
import {
  buildSchema,
  EMPTY_VALUES,
  formatSchema,
  SCHEMA_FIELDS,
  SCHEMA_TYPES,
  toScriptBlock,
  validateSchema,
} from "../lib/schema";

export const checks: CheckSuite = (check) => {
  /* ---------- building ---------- */

  const injected = buildSchema("Article", {
    ...EMPTY_VALUES.Article,
    headline: "Bitir</script><img src=x onerror=alert(1)>",
    datePublished: "2026-09-03",
    authorName: "Camal Əli",
  });
  const injectedBlock = toScriptBlock(injected);
  check(
    "schema: </script> in a value cannot close the generated script tag",
    injectedBlock.includes("\\u003c/script\\u003e") &&
      injectedBlock.split("</script>").length === 2,
    `got: ${injectedBlock}`,
  );
  check(
    "schema: the script escape set matches the site's own jsonLd helper",
    jsonLd(injected).includes("\\u003c/script\\u003e") &&
      !jsonLd(injected).includes("</script>"),
    `got: ${jsonLd(injected)}`,
  );

  const sparse = buildSchema("Article", {
    ...EMPTY_VALUES.Article,
    headline: "Yalnız başlıq",
  });
  check(
    "schema: a blank field is left out entirely, not written as an empty string",
    !("description" in sparse) &&
      !("image" in sparse) &&
      !("author" in sparse) &&
      !("publisher" in sparse) &&
      !formatSchema(sparse).includes('""'),
    `got: ${formatSchema(sparse)}`,
  );

  const azerbaijani = buildSchema("Article", {
    ...EMPTY_VALUES.Article,
    headline: "Şəbəkə üçün İİ: ötürücü və çeviricilər",
    authorName: "Camal Əli",
  });
  const azerbaijaniText = formatSchema(azerbaijani);
  check(
    "schema: azerbaijani letters survive JSON serialisation unescaped",
    azerbaijaniText.includes("Şəbəkə üçün İİ: ötürücü və çeviricilər") &&
      azerbaijaniText.includes("Camal Əli") &&
      toScriptBlock(azerbaijani).includes("ötürücü"),
    `got: ${azerbaijaniText}`,
  );

  const article = buildSchema("Article", {
    ...EMPTY_VALUES.Article,
    headline: "Başlıq",
    authorName: "Camal Əli",
    publisherName: "camalali",
    publisherLogo: "https://camalali.com/logo.png",
    mainEntityOfPage: "https://camalali.com/bloq/yazi",
  });
  const author = article.author as Record<string, unknown>;
  const publisher = article.publisher as Record<string, unknown>;
  check(
    "schema: Article nests author as a Person and publisher logo as an ImageObject",
    author["@type"] === "Person" &&
      author.name === "Camal Əli" &&
      publisher["@type"] === "Organization" &&
      (publisher.logo as Record<string, unknown>)["@type"] === "ImageObject",
    `got: ${formatSchema(article)}`,
  );

  const faq = buildSchema("FAQPage", {
    questions: [
      { question: "Sual birdir?", answer: "Cavab birdir." },
      { question: "   ", answer: "Sualsız cavab" },
      { question: "Sual ikidir?", answer: "" },
    ],
  });
  const faqList = faq.mainEntity as Record<string, unknown>[];
  check(
    "schema: a FAQ pair with no question is dropped, and an unanswered one keeps no empty answer",
    faqList.length === 2 &&
      faqList[0].name === "Sual birdir?" &&
      faqList[1].name === "Sual ikidir?" &&
      !("acceptedAnswer" in faqList[1]),
    `got: ${formatSchema(faq)}`,
  );

  const crumbs = buildSchema("BreadcrumbList", {
    items: [
      { name: "Ana səhifə", url: "https://camalali.com/" },
      { name: "", url: "https://camalali.com/bosluq" },
      { name: "Bloq", url: "https://camalali.com/bloq" },
      { name: "Yazı", url: "" },
    ],
  });
  const crumbList = crumbs.itemListElement as Record<string, unknown>[];
  check(
    "schema: BreadcrumbList positions run 1,2,3 after the blank row is dropped",
    crumbList.length === 3 &&
      crumbList[0].position === 1 &&
      crumbList[1].position === 2 &&
      crumbList[2].position === 3 &&
      !("item" in crumbList[2]),
    `got: ${formatSchema(crumbs)}`,
  );

  const business = buildSchema("LocalBusiness", {
    ...EMPTY_VALUES.LocalBusiness,
    name: "Kafe",
    streetAddress: "Nizami küç. 10",
    addressLocality: "Bakı",
    latitude: "40,4093",
    longitude: "49.8671",
    hours: [
      { days: ["Monday", "Tuesday"], opens: "09:00", closes: "18:00" },
      { days: [], opens: "09:00", closes: "18:00" },
      { days: ["Sunday"], opens: "", closes: "" },
    ],
  });
  const geo = business.geo as Record<string, unknown>;
  const hours = business.openingHoursSpecification as Record<string, unknown>[];
  check(
    "schema: LocalBusiness takes a comma decimal as a number and drops empty hour rows",
    geo.latitude === 40.4093 &&
      geo.longitude === 49.8671 &&
      hours.length === 1 &&
      (business.address as Record<string, unknown>)["@type"] === "PostalAddress",
    `got: ${formatSchema(business)}`,
  );

  const halfGeo = buildSchema("LocalBusiness", {
    ...EMPTY_VALUES.LocalBusiness,
    name: "Kafe",
    latitude: "40.4093",
    longitude: "",
  });
  check(
    "schema: half a coordinate pair produces no geo node at all",
    !("geo" in halfGeo),
    `got: ${formatSchema(halfGeo)}`,
  );

  const person = buildSchema("Person", {
    ...EMPTY_VALUES.Person,
    name: "Camal Əli",
    worksFor: "camalali",
    sameAs: "https://github.com/jamalkamaladdin\n\n  https://orcid.org/0000  \n",
  });
  check(
    "schema: multiline sameAs becomes a trimmed array with no blank entries",
    Array.isArray(person.sameAs) &&
      (person.sameAs as string[]).length === 2 &&
      (person.sameAs as string[])[1] === "https://orcid.org/0000" &&
      (person.worksFor as Record<string, unknown>)["@type"] === "Organization",
    `got: ${formatSchema(person)}`,
  );

  check(
    "schema: every one of the six types has at least one required field, each with a reason",
    SCHEMA_TYPES.every(
      (type) =>
        SCHEMA_FIELDS[type].some((rule) => rule.required) &&
        SCHEMA_FIELDS[type].every((rule) => rule.why.trim().length > 20),
    ),
    `types: ${SCHEMA_TYPES.map((type) => `${type}=${SCHEMA_FIELDS[type].filter((r) => r.required).length}`).join(", ")}`,
  );

  check(
    "schema: every generated document parses back as JSON",
    SCHEMA_TYPES.every((type) => {
      const built = buildSchema(type, EMPTY_VALUES[type]);
      const parsed = JSON.parse(formatSchema(built)) as Record<string, unknown>;
      return parsed["@context"] === "https://schema.org" && parsed["@type"] === type;
    }),
    "one of the six built documents did not round-trip",
  );

  /* ---------- validating ---------- */

  const broken = validateSchema('{\n  "@context": "https://schema.org",\n  "@type": "Article",\n}');
  check(
    "schema: a broken paste reports a line and a column, not just a failure",
    broken.parseError !== null &&
      broken.parseError.line === 4 &&
      broken.parseError.column >= 1 &&
      broken.ok === false,
    `got: ${JSON.stringify(broken.parseError)}`,
  );

  const graph = validateSchema(
    '{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"camalali"},{"@type":"Person","name":"Camal Əli","url":"https://camalali.com"}]}',
  );
  check(
    "schema: an @graph wrapper is unpacked and the recognised node is the one checked",
    graph.type === "Person" && graph.parseError === null && graph.ok,
    `got: ${JSON.stringify({ type: graph.type, ok: graph.ok, notes: graph.notes })}`,
  );

  const arrayForm = validateSchema(
    '[{"@context":"https://schema.org","@type":"Organization","name":"camalali","url":"https://camalali.com"}]',
  );
  check(
    "schema: a top-level array is accepted the same way a bare object is",
    arrayForm.type === "Organization" && arrayForm.ok && arrayForm.missing.every((rule) => !rule.required),
    `got: ${JSON.stringify({ type: arrayForm.type, ok: arrayForm.ok })}`,
  );

  const unknown = validateSchema('{"@context":"https://schema.org","@type":"Recipe","name":"Plov"}');
  check(
    "schema: an unrecognised type produces no invented missing-field list",
    unknown.type === "Recipe" &&
      unknown.missing.length === 0 &&
      unknown.notes.some((note) => note.includes("tanımıram")),
    `got: ${JSON.stringify(unknown)}`,
  );

  const thin = validateSchema('{"@context":"https://schema.org","@type":"Article","headline":"Başlıq"}');
  const missingNames = thin.missing.filter((rule) => rule.required).map((rule) => rule.name);
  check(
    "schema: a thin Article lists its missing required fields with the reason for each",
    thin.ok === false &&
      missingNames.includes("datePublished") &&
      missingNames.includes("author") &&
      thin.missing.every((rule) => rule.why !== ""),
    `missing: ${missingNames.join(", ")}`,
  );

  const wrapped = validateSchema(
    '<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"Person","name":"Camal Əli"}\n</script>',
  );
  check(
    "schema: a pasted <script> wrapper is stripped and reported rather than failing to parse",
    wrapped.parseError === null &&
      wrapped.type === "Person" &&
      wrapped.notes.some((note) => note.includes("script")),
    `got: ${JSON.stringify(wrapped)}`,
  );

  const alias = validateSchema(
    '{"@context":"https://schema.org","@type":"BlogPosting","headline":"Başlıq","datePublished":"2026-09-03","author":{"@type":"Person","name":"Camal Əli"}}',
  );
  check(
    "schema: BlogPosting is checked with Article's rules and the substitution is stated",
    alias.type === "BlogPosting" &&
      alias.ok &&
      alias.notes.some((note) => note.includes("Article")),
    `got: ${JSON.stringify({ ok: alias.ok, notes: alias.notes })}`,
  );

  const noContext = validateSchema('{"@type":"Person","name":"Camal Əli"}');
  check(
    "schema: a missing @context is a failure with an explanation, not a silent pass",
    noContext.ok === false && noContext.notes.some((note) => note.includes("@context")),
    `got: ${JSON.stringify(noContext)}`,
  );

  const crookedCrumbs = validateSchema(
    '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":2,"name":"Bloq"}]}',
  );
  check(
    "schema: breadcrumb positions that do not start at 1 are called out",
    crookedCrumbs.notes.some((note) => note.includes("position")),
    `got: ${JSON.stringify(crookedCrumbs.notes)}`,
  );

  const roundTrip = validateSchema(
    formatSchema(
      buildSchema("LocalBusiness", {
        ...EMPTY_VALUES.LocalBusiness,
        name: "Kafe",
        streetAddress: "Nizami küç. 10",
        addressLocality: "Bakı",
      }),
    ),
  );
  check(
    "schema: what the builder produces passes the validator it ships with",
    roundTrip.ok && roundTrip.type === "LocalBusiness" && roundTrip.parseError === null,
    `got: ${JSON.stringify(roundTrip)}`,
  );
};
