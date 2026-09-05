/**
 * URL canonicalisation: turning the many strings that all point at the same
 * page — `http`/`https`, `www`/bare, a trailing `?utm_source=...`, a stray
 * `../` — into the one string a search engine should treat as authoritative,
 * and grouping the inputs that land on the same one.
 *
 * Deliberately not built on `new URL(...).href`: the platform's own URL
 * parser already resolves `.`/`..` segments and lower-cases the host the
 * moment it parses a string, which is correct for a browser but wrong for a
 * tool whose whole point is to let a visitor turn each rule off one at a
 * time and see what it was doing. So this file decomposes a URL with its own
 * regular expression, keeping every raw piece exactly as typed, and applies
 * each rule as an independent, skippable step over that decomposition.
 */
import { escapeHtmlAttribute } from "./meta.js";

export type CanonRule =
  | "scheme"
  | "host-case"
  | "www"
  | "default-port"
  | "dot-segments"
  | "trailing-slash"
  | "index-file"
  | "fragment"
  | "tracking-params"
  | "sort-params"
  | "percent-case";

/** Declaration order — also the order the applied-rules list and the widget's checkbox column use. */
export const CANON_RULES: CanonRule[] = [
  "scheme",
  "host-case",
  "www",
  "default-port",
  "dot-segments",
  "trailing-slash",
  "index-file",
  "fragment",
  "tracking-params",
  "sort-params",
  "percent-case",
];

export const CANON_RULE_LABELS: Record<CanonRule, string> = {
  scheme: "Sxem https-ə gətirilir",
  "host-case": "Host kiçik hərfə salınır, sondakı nöqtə atılır",
  www: "«www.» prefiksi atılır",
  "default-port": "Defolt port (:80, :443) atılır",
  "dot-segments": "Yol seqmentlərində . və .. həll olunur, təkrarlanan pillə ayırıcıları birləşdirilir",
  "trailing-slash": "Sondakı / atılır (kök ünvan istisna)",
  "index-file": "index.html, index.php, default.aspx atılır",
  fragment: "Fraqment (#...) atılır",
  "tracking-params": "İzləmə parametrləri (utm_*, gclid və s.) atılır",
  "sort-params": "Qalan sorğu parametrləri əlifba sırasına düzülür",
  "percent-case": "Faiz kodlaşdırması böyük hərfə salınır (%2f → %2F)",
};

/*
 * The exact, literal parameter names this tool strips. `utm_*` is not on this
 * list because it is a prefix, not a name — `utm_source`, `utm_id`,
 * `utm_source_platform` and whatever GA4 invents next all match without the
 * list needing an update. `isTrackingParam` below is what actually applies
 * both the prefix and this list; this export exists so a caller (or a check
 * file) can see the literal set without duplicating it.
 */
export const TRACKING_PARAMS: string[] = [
  "gclid",
  "fbclid",
  "yclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "ref",
  "source",
];

function isTrackingParam(key: string): boolean {
  return key.startsWith("utm_") || TRACKING_PARAMS.includes(key);
}

export type CanonResult = {
  input: string;
  /** `null` exactly when `error` is set. */
  canonical: string | null;
  /** The enabled rules that actually changed this specific input — an enabled rule with nothing to do here is left out. */
  applied: CanonRule[];
  error: string | null;
};

/*
 * A generic-syntax decomposition (RFC 3986 appendix B, restricted to
 * `scheme://authority`): every piece kept as the raw substring it was typed
 * as, none of it percent-decoded or dot-resolved yet. `host` also accepts a
 * bracketed IPv6 literal so a `[::1]:8080` authority does not get its colon
 * mistaken for the port separator.
 */
const URL_PATTERN =
  /^(?<scheme>[A-Za-z][A-Za-z0-9+.-]*):\/\/(?:[^@/?#]*@)?(?<host>\[[^\]]*\]|[^:/?#]*)(?::(?<port>\d*))?(?<path>[^?#]*)(?:\?(?<query>[^#]*))?(?:#(?<fragment>.*))?$/;

function defaultPortFor(scheme: string): string {
  return scheme.toLowerCase() === "https" ? "443" : "80";
}

/**
 * RFC 3986 §5.2.4's remove_dot_segments, worked segment-by-segment rather
 * than character-by-character: split on the path separator, drop a `.`
 * segment outright, let a `..` segment pop the last real segment (never past
 * an empty one, which is what keeps a leading separator a leading
 * separator), keep everything else. Run after collapsing repeated
 * separators, so `a` + sep + sep + `../b` and `a/../b` resolve identically.
 */
function normalizeDotSegments(path: string): string {
  const collapsed = path.replace(/\/{2,}/g, "/");
  const segments = collapsed.split("/");
  const output: string[] = [];
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (output.length > 0 && output[output.length - 1] !== "") output.pop();
      continue;
    }
    output.push(segment);
  }
  return output.join("/");
}

const INDEX_FILE = /\/(?:index\.html|index\.php|default\.aspx)$/i;

type QueryPair = { key: string; raw: string };

/** Splits on `&` without percent-decoding — a value is only ever compared or re-emitted, never interpreted. */
function parseQueryPairs(query: string): QueryPair[] {
  if (query === "") return [];
  return query
    .split("&")
    .filter((segment) => segment !== "")
    .map((segment) => {
      const equals = segment.indexOf("=");
      return { key: equals === -1 ? segment : segment.slice(0, equals), raw: segment };
    });
}

function upperPercentEncoding(text: string): string {
  return text.replace(/%[0-9a-fA-F]{2}/g, (sequence) => sequence.toUpperCase());
}

/**
 * Normalises one URL under the given rule set, and says exactly which of
 * those rules changed something. A rule left out of `enabled` never runs; a
 * rule in `enabled` that had nothing to do for this particular input (no
 * `www.` to strip, no tracking param present) is run but left out of
 * `applied` — the table column is "what this rule did here", not "what was
 * turned on".
 */
export function canonicalise(raw: string, enabled: Set<CanonRule>): CanonResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { input: raw, canonical: null, applied: [], error: "Boş sətir." };
  }

  const match = URL_PATTERN.exec(trimmed);
  if (!match?.groups) {
    return {
      input: raw,
      canonical: null,
      applied: [],
      error: "Bu mütləq URL-ə oxşamır: sxem (https://) daxil olmalıdır.",
    };
  }

  const groups = match.groups;
  const originalScheme = groups.scheme ?? "";
  if (!/^https?$/i.test(originalScheme)) {
    return {
      input: raw,
      canonical: null,
      applied: [],
      error: `"${originalScheme}:" sxemi dəstəklənmir: yalnız http və https URL-ləri kanonikləşdirilir.`,
    };
  }

  try {
    // A second, stricter pass through the platform's own parser — catches a
    // broken authority or an illegal character this file's lax generic-syntax
    // regex would otherwise wave through.
    new URL(trimmed);
  } catch {
    return { input: raw, canonical: null, applied: [], error: "Bu düzgün URL deyil." };
  }

  const changed = new Set<CanonRule>();

  const scheme = enabled.has("scheme") ? "https" : originalScheme;
  if (enabled.has("scheme") && scheme !== originalScheme) changed.add("scheme");

  let host = groups.host ?? "";
  if (enabled.has("host-case")) {
    const lowered = host.toLowerCase().replace(/\.+$/, "");
    if (lowered !== host) changed.add("host-case");
    host = lowered;
  }

  if (enabled.has("www") && /^www\./i.test(host)) {
    const stripped = host.slice(4);
    if (stripped !== host) changed.add("www");
    host = stripped;
  }

  let port = groups.port ?? "";
  if (enabled.has("default-port") && port !== "" && port === defaultPortFor(scheme)) {
    port = "";
    changed.add("default-port");
  }

  let path = groups.path ?? "";
  if (enabled.has("dot-segments")) {
    const normalized = normalizeDotSegments(path);
    if (normalized !== path) changed.add("dot-segments");
    path = normalized;
  }

  // Run before the trailing-slash rule on purpose: stripping "/index.html"
  // leaves a bare "/blog/" behind, and that new trailing slash is exactly
  // what the next rule should still get a chance to remove.
  if (enabled.has("index-file")) {
    const stripped = path.replace(INDEX_FILE, "/");
    if (stripped !== path) changed.add("index-file");
    path = stripped;
  }

  if (enabled.has("trailing-slash") && path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
    changed.add("trailing-slash");
  }

  let fragment = groups.fragment ?? "";
  if (enabled.has("fragment") && fragment !== "") {
    fragment = "";
    changed.add("fragment");
  }

  let pairs = parseQueryPairs(groups.query ?? "");
  if (enabled.has("tracking-params")) {
    const filtered = pairs.filter((pair) => !isTrackingParam(pair.key));
    if (filtered.length !== pairs.length) changed.add("tracking-params");
    pairs = filtered;
  }
  if (enabled.has("sort-params")) {
    const before = pairs.map((pair) => pair.raw).join("&");
    const sorted = [...pairs].sort((a, b) => a.key.localeCompare(b.key, "en"));
    if (sorted.map((pair) => pair.raw).join("&") !== before) changed.add("sort-params");
    pairs = sorted;
  }

  // A URL constructed with no path at all is the root — rendered with the
  // separator a browser always shows for it, regardless of the
  // trailing-slash rule, which only ever removes a separator it was given.
  let finalPath = path === "" ? "/" : path;
  let finalQuery = pairs.map((pair) => pair.raw).join("&");

  if (enabled.has("percent-case")) {
    const upPath = upperPercentEncoding(finalPath);
    const upQuery = upperPercentEncoding(finalQuery);
    const upFragment = upperPercentEncoding(fragment);
    if (upPath !== finalPath || upQuery !== finalQuery || upFragment !== fragment) {
      changed.add("percent-case");
    }
    finalPath = upPath;
    finalQuery = upQuery;
    fragment = upFragment;
  }

  let canonical = `${scheme}://${host}`;
  if (port !== "") canonical += `:${port}`;
  canonical += finalPath;
  if (finalQuery !== "") canonical += `?${finalQuery}`;
  if (fragment !== "") canonical += `#${fragment}`;

  return {
    input: raw,
    canonical,
    applied: CANON_RULES.filter((rule) => changed.has(rule)),
    error: null,
  };
}

/**
 * The results that landed on the same canonical form — the duplicate-content
 * groups the whole tool exists to surface. A result that errored has no
 * canonical to group under and is silently absent, same as a singleton
 * canonical with nothing else pointing at it: neither is a duplicate.
 */
export function groupDuplicates(
  results: CanonResult[],
): { canonical: string; inputs: string[] }[] {
  const order: string[] = [];
  const byCanonical = new Map<string, string[]>();

  for (const result of results) {
    if (result.canonical === null) continue;
    let inputs = byCanonical.get(result.canonical);
    if (!inputs) {
      inputs = [];
      byCanonical.set(result.canonical, inputs);
      order.push(result.canonical);
    }
    inputs.push(result.input);
  }

  return order
    .map((canonical) => ({ canonical, inputs: byCanonical.get(canonical) ?? [] }))
    .filter((group) => group.inputs.length > 1);
}

export function buildCanonicalTag(url: string): string {
  return `<link rel="canonical" href="${escapeHtmlAttribute(url)}" />`;
}
