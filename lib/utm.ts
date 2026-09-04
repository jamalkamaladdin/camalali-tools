/**
 * UTM campaign-link building and parsing — the mirror pair matters more than
 * either half alone, because the mistakes this tool exists to catch (mixed
 * case, a literal space, a link built twice over an old one) only become
 * convincing when the same page can build a link and then read one apart.
 *
 * `utm_source` / `utm_medium` / `utm_campaign` are the mandatory triple —
 * Google Analytics silently falls back to "(not set)" for the whole hit if
 * any of the three is missing, which defeats the point of tagging the link
 * at all. `utm_term` and `utm_content` exist for paid search and A/B link
 * variants respectively; `utm_id` ties the hit to an ad-platform campaign ID.
 * None of the three optional fields change how the hit is bucketed on their
 * own, so they stay optional here too.
 */
import { foldCase } from "./ferq";

export type UtmFields = {
  url: string;
  source: string;
  medium: string;
  campaign: string;
  term: string;
  content: string;
  id: string;
};

export const EMPTY_UTM: UtmFields = {
  url: "",
  source: "",
  medium: "",
  campaign: "",
  term: "",
  content: "",
  id: "",
};

export type UtmPreset = { label: string; source: string; medium: string };

/**
 * Eight starting points rather than a blank source/medium pair. The two
 * values have to land in GA4's own channel vocabulary ("social", "email",
 * not "facebook-ads") for the platform's default channel grouping to bucket
 * them correctly — a visitor pasting a link into a form is not expected to
 * already know that vocabulary.
 */
export const UTM_PRESETS: UtmPreset[] = [
  { label: "Facebook", source: "facebook", medium: "social" },
  { label: "Instagram", source: "instagram", medium: "social" },
  { label: "LinkedIn", source: "linkedin", medium: "social" },
  { label: "WhatsApp", source: "whatsapp", medium: "social" },
  { label: "Telegram", source: "telegram", medium: "social" },
  { label: "E-poçt bülleteni", source: "newsletter", medium: "email" },
  { label: "QR kod", source: "qr", medium: "offline" },
  { label: "Oflayn afişa", source: "poster", medium: "offline" },
];

/** The six utm_* query parameters, paired with the UtmFields key that holds each one's value. */
const UTM_PARAMS: { field: Exclude<keyof UtmFields, "url">; param: string }[] = [
  { field: "source", param: "utm_source" },
  { field: "medium", param: "utm_medium" },
  { field: "campaign", param: "utm_campaign" },
  { field: "term", param: "utm_term" },
  { field: "content", param: "utm_content" },
  { field: "id", param: "utm_id" },
];

const MANDATORY_FIELDS: Exclude<keyof UtmFields, "url">[] = ["source", "medium", "campaign"];

function fieldLabel(field: keyof UtmFields): string {
  switch (field) {
    case "url":
      return "Hədəf URL";
    case "source":
      return "utm_source";
    case "medium":
      return "utm_medium";
    case "campaign":
      return "utm_campaign";
    case "term":
      return "utm_term";
    case "content":
      return "utm_content";
    case "id":
      return "utm_id";
  }
}

/*
 * Turns a run of whitespace into a single "-" and trims the ends.
 * Deliberately not a full slug: lib/tools/slug.ts transliterates the
 * non-ASCII letters of the Azerbaijani alphabet away because a URL *path*
 * has to be plain ASCII, but a query *value* does not — those letters are
 * legitimate UTF-8 bytes once percent-encoded, and stripping them here would
 * throw away the letters a real campaign name is actually written in.
 */
export function slugifyParam(value: string): string {
  return value.trim().replace(/\s+/g, "-");
}

export type UtmWarning = { field: keyof UtmFields; message: string; suggestion: string | null };

/*
 * Two checks, run over the six utm_* values only — never over the target
 * URL, whose own casing and spacing are somebody else's decision. Both catch
 * a mistake Google Analytics never rejects, it just quietly opens a second,
 * unmerged row next to the one the same campaign already has: two values
 * that differ only in letter case are two different values to a report that
 * groups by exact string match, and a literal space in a value gets
 * re-encoded differently by different layers on the way to the report.
 */
export function auditUtm(fields: UtmFields): UtmWarning[] {
  const warnings: UtmWarning[] = [];

  for (const { field } of UTM_PARAMS) {
    const value = fields[field];
    if (value.trim() === "") continue;

    if (value !== foldCase(value)) {
      warnings.push({
        field,
        message: `${fieldLabel(field)} böyük hərflə yazılıb — Google Analytics "Facebook" ilə "facebook"-u iki ayrı mənbə sayır, halbuki eyni kampaniyadır.`,
        suggestion: foldCase(value),
      });
    }

    if (/\s/.test(value)) {
      warnings.push({
        field,
        message: `${fieldLabel(field)} boşluq daşıyır — keçiddə "%20" və ya "+" kimi görünüb hesabatı çirkləndirir.`,
        suggestion: slugifyParam(value),
      });
    }
  }

  return warnings;
}

/*
 * Writes or overwrites the six utm_* parameters on fields.url and leaves
 * everything else — other query parameters, and the #fragment above all —
 * untouched. Mutating URL.searchParams in place rather than rebuilding
 * `search` by hand is what keeps the fragment last: URL.hash is serialised
 * into href independently of search, so there is no step here that could
 * move it ahead of the query string the way plain string concatenation
 * could.
 *
 * `.set()` replaces an existing utm_source (etc.) in place rather than
 * appending a second one — pasting an already-tagged link back into the
 * builder and re-tagging it does not leave the old value sitting next to the
 * new one.
 */
export function buildUtmUrl(fields: UtmFields): { url: string | null; error: string | null } {
  const rawUrl = fields.url.trim();
  if (rawUrl === "") {
    return { url: null, error: "Hədəf URL boşdur — kampaniyanın apardığı ünvanı yaz." };
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return {
      url: null,
      error: "Bu düzgün mütləq URL deyil — sxem daxil olmalıdır (https://…).",
    };
  }

  const missing = MANDATORY_FIELDS.filter((field) => fields[field].trim() === "");
  if (missing.length > 0) {
    return {
      url: null,
      error: `Məcburi sahə(lər) boşdur: ${missing.map((field) => fieldLabel(field)).join(", ")}.`,
    };
  }

  for (const { field, param } of UTM_PARAMS) {
    const value = fields[field].trim();
    if (value === "") {
      target.searchParams.delete(param);
    } else {
      target.searchParams.set(param, value);
    }
  }

  return { url: target.href, error: null };
}

/*
 * The inverse of buildUtmUrl: reads the six utm_* parameters back out of a
 * pasted link, and hands back everything else as `extras` — a non-UTM
 * parameter (fbclid, ref, a real filter) has to survive being read back, not
 * disappear the moment the link is inspected.
 *
 * fields.url is set to cleanUrl — the same URL with only the utm_*
 * parameters stripped, other parameters and the fragment left in place — so
 * that handing the returned `fields` straight back into buildUtmUrl re-adds
 * the same six values onto the same clean base and reconstructs an
 * equivalent link. That round trip, not a byte-identical string, is the
 * guarantee: URLSearchParams does not promise to keep an untouched
 * parameter in its original position once a sibling has been added.
 */
export function parseUtmUrl(raw: string): {
  fields: UtmFields;
  extras: [string, string][];
  cleanUrl: string;
  error: string | null;
} {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return {
      fields: EMPTY_UTM,
      extras: [],
      cleanUrl: "",
      error: "Boş sahə — hazır kampaniya linkini yapışdır.",
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      fields: EMPTY_UTM,
      extras: [],
      cleanUrl: "",
      error: "Bu düzgün mütləq URL deyil — sxem daxil olmalıdır (https://…).",
    };
  }

  const paramToField = new Map(UTM_PARAMS.map(({ field, param }) => [param, field]));
  const fields: UtmFields = { ...EMPTY_UTM };
  const extras: [string, string][] = [];

  // URLSearchParams.entries() already applies percent- and +-decoding, so a
  // value typed with a non-ASCII letter comes back exactly as typed — the
  // same guarantee lib/tools/url.ts relies on for the same reason.
  for (const [key, value] of url.searchParams.entries()) {
    const field = paramToField.get(key);
    if (field) {
      fields[field] = value;
    } else {
      extras.push([key, value]);
    }
  }

  const clean = new URL(url.href);
  for (const { param } of UTM_PARAMS) clean.searchParams.delete(param);
  fields.url = clean.href;

  return { fields, extras, cleanUrl: clean.href, error: null };
}
