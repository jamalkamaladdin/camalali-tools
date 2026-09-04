/**
 * Content-Security-Policy: building a policy string from a set of chosen
 * directives and sources, and reading an existing one back into the same
 * shape so it can be explained directive by directive.
 *
 * The one fact every hand-written CSP gets wrong somewhere is inheritance.
 * The "fetch directives" (`script-src`, `img-src`, `connect-src` and the
 * rest) fall back to `default-src` the moment they are left unset — but
 * `frame-ancestors`, `form-action` and `base-uri` never do, because the spec
 * scopes `default-src`'s fallback to fetch directives only. A policy author
 * who assumes `default-src 'self'` alone locks down framing or form
 * submission has written a policy that does neither. `resolveFetchDirectives`
 * and `isNonInheritingDirectiveSet` below exist to make that distinction
 * checkable rather than remembered.
 *
 * Directive order is fixed (`CSP_DIRECTIVE_ORDER`) rather than following
 * insertion order, both because a stable order makes the generated string
 * predictable to read and because it is what makes
 * `buildCspString(parseCspString(buildCspString(x)).directives)` a genuine
 * round-trip: the directive order coming out never depends on the order a
 * visitor happened to toggle checkboxes in.
 */
import { escapeHtmlAttribute } from "./meta";

export type CspDirective =
  | "default-src"
  | "script-src"
  | "style-src"
  | "img-src"
  | "font-src"
  | "connect-src"
  | "frame-src"
  | "frame-ancestors"
  | "form-action"
  | "base-uri"
  | "object-src"
  | "worker-src"
  | "manifest-src"
  | "upgrade-insecure-requests"
  | "report-uri"
  | "report-to";

/** Declaration order — also the order the generated policy string and the widget's directive list use. */
export const CSP_DIRECTIVE_ORDER: CspDirective[] = [
  "default-src",
  "script-src",
  "style-src",
  "img-src",
  "font-src",
  "connect-src",
  "frame-src",
  "frame-ancestors",
  "form-action",
  "base-uri",
  "object-src",
  "worker-src",
  "manifest-src",
  "upgrade-insecure-requests",
  "report-uri",
  "report-to",
];

/** The directives that fall back to `default-src` when left unset — CSP calls this group "fetch directives". */
export const FETCH_DIRECTIVES: CspDirective[] = [
  "default-src",
  "script-src",
  "style-src",
  "img-src",
  "font-src",
  "connect-src",
  "frame-src",
  "object-src",
  "worker-src",
  "manifest-src",
];

/** Directives the spec deliberately excludes from `default-src`'s fallback — left unset, they are entirely unrestricted. */
export const NON_INHERITING_DIRECTIVES: CspDirective[] = ["frame-ancestors", "form-action", "base-uri"];

/** What each directive controls, in the visitor's own language — used by both the builder's field labels and the explainer's breakdown. */
export const DIRECTIVE_LABELS: Record<CspDirective, string> = {
  "default-src": "Digər *-src direktivlərindən heç biri təyin olunmayanda tətbiq olunan defolt qayda",
  "script-src": "JavaScript-in hansı mənbədən icra oluna biləcəyi",
  "style-src": "CSS-in hansı mənbədən tətbiq oluna biləcəyi",
  "img-src": "Şəkillərin hansı mənbədən yüklənə biləcəyi",
  "font-src": "Veb şriftlərin hansı mənbədən yüklənə biləcəyi",
  "connect-src": "fetch, XHR, WebSocket və EventSource-un qoşula biləcəyi ünvanlar",
  "frame-src": "Səhifənin öz içinə hansı ünvanları `<iframe>` ilə yerləşdirə biləcəyi",
  "frame-ancestors": "Bu səhifəni hansı digər səhifələrin öz `<iframe>`-inə yerləşdirə biləcəyi — clickjacking qorunması",
  "form-action": "`<form>` göndərişinin icazəli olduğu ünvanlar",
  "base-uri": "`<base href>` teqinin icazəli olduğu ünvanlar",
  "object-src": "`<object>`, `<embed>`, `<applet>` ilə hansı mənbədən əlavə yüklənə biləcəyi",
  "worker-src": "Web Worker, Shared Worker və Service Worker skriptlərinin hansı mənbədən yüklənə biləcəyi",
  "manifest-src": "Veb tətbiq manifestinin (manifest.json) hansı mənbədən yüklənə biləcəyi",
  "upgrade-insecure-requests": "Bütün http:// sorğularını avtomatik https://-ə yüksəldən bayraq — mənbə siyahısı götürmür",
  "report-uri": "Pozuntu hesabatlarının POST ediləcəyi köhnə üslublu ünvan(lar)",
  "report-to": "Pozuntu hesabatlarının göndəriləcəyi Reporting API qrupunun adı",
};

export const SOURCE_KEYWORDS = ["'self'", "'none'", "'unsafe-inline'", "'unsafe-eval'", "'strict-dynamic'"] as const;
export type SourceKeyword = (typeof SOURCE_KEYWORDS)[number];

export const SCHEME_SOURCES = ["https:", "data:", "blob:"] as const;
export type SchemeSource = (typeof SCHEME_SOURCES)[number];

/** A directive's source list, in the order the visitor entered them. Absent key means the directive is not set at all. `[]` means the directive is set with zero sources — valid but unusual. */
export type CspDirectiveMap = Partial<Record<CspDirective, string[]>>;

/** Renders the map as one policy string, in `CSP_DIRECTIVE_ORDER` regardless of the map's own key order. A directive with an empty value list is emitted bare (correct for `upgrade-insecure-requests`). */
export function buildCspString(directives: CspDirectiveMap): string {
  const parts: string[] = [];
  for (const name of CSP_DIRECTIVE_ORDER) {
    const values = directives[name];
    if (values === undefined) continue;
    parts.push(values.length === 0 ? name : `${name} ${values.join(" ")}`);
  }
  return parts.join("; ");
}

export function buildCspHeaderLine(directives: CspDirectiveMap): string {
  return `Content-Security-Policy: ${buildCspString(directives)}`;
}

/** Directives a `<meta http-equiv="Content-Security-Policy">` tag cannot carry — the spec restricts these to the real HTTP header. */
const META_UNSUPPORTED_DIRECTIVES: CspDirective[] = ["frame-ancestors", "report-uri"];

export type CspMetaTagResult = { tag: string; droppedDirectives: CspDirective[] };

/** Same policy, minus the directives `<meta>` delivery cannot express — dropped rather than emitted wrong, and named so the widget can say what got left out. */
export function buildCspMetaTag(directives: CspDirectiveMap): CspMetaTagResult {
  const dropped: CspDirective[] = [];
  const filtered: CspDirectiveMap = {};
  for (const name of CSP_DIRECTIVE_ORDER) {
    const values = directives[name];
    if (values === undefined) continue;
    if (META_UNSUPPORTED_DIRECTIVES.includes(name)) {
      dropped.push(name);
      continue;
    }
    filtered[name] = values;
  }
  const content = buildCspString(filtered);
  return {
    tag: `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(content)}" />`,
    droppedDirectives: dropped,
  };
}

export type ParsedDirective = { name: string; values: string[] };

export type ParseCspResult =
  | { ok: true; directives: CspDirectiveMap; parsed: ParsedDirective[]; unknownDirectives: string[] }
  | { ok: false; error: string };

const KNOWN_DIRECTIVES = new Set<string>(CSP_DIRECTIVE_ORDER);

/** Reads a pasted policy string (with or without a leading `Content-Security-Policy:` label) back into a `CspDirectiveMap`, keeping any directive this tool does not model in `unknownDirectives` rather than dropping it silently. */
export function parseCspString(raw: string): ParseCspResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: "Boş sətir — CSP başlığını və ya `content` dəyərini yapışdır." };
  }

  const segments = trimmed
    .replace(/^content-security-policy\s*:\s*/i, "")
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");

  if (segments.length === 0) {
    return { ok: false, error: "Heç bir direktiv tapılmadı — yalnız `;` işarələri var idi." };
  }

  const directives: CspDirectiveMap = {};
  const parsed: ParsedDirective[] = [];
  const unknownDirectives: string[] = [];

  for (const segment of segments) {
    const tokens = segment.split(/\s+/).filter((token) => token !== "");
    const [name, ...values] = tokens;
    if (name === undefined) continue;
    parsed.push({ name, values });
    if (KNOWN_DIRECTIVES.has(name)) {
      directives[name as CspDirective] = values;
    } else if (!unknownDirectives.includes(name)) {
      unknownDirectives.push(name);
    }
  }

  return { ok: true, directives, parsed, unknownDirectives };
}

export type EffectiveFetchDirective = {
  directive: CspDirective;
  /** The sources actually in force here after inheritance — `[]` means nothing restricts this resource type at all. */
  effectiveValues: string[];
  /** True when this directive has no explicit sources of its own and is running on `default-src`'s instead. */
  inherited: boolean;
};

/** Every fetch directive except `default-src` itself, resolved against it. */
export function resolveFetchDirectives(directives: CspDirectiveMap): EffectiveFetchDirective[] {
  const fallback = directives["default-src"];
  return FETCH_DIRECTIVES.filter((directive) => directive !== "default-src").map((directive) => {
    const own = directives[directive];
    if (own !== undefined) return { directive, effectiveValues: own, inherited: false };
    return { directive, effectiveValues: fallback ?? [], inherited: fallback !== undefined };
  });
}

function effectiveFetchValues(directives: CspDirectiveMap, directive: CspDirective): string[] {
  return directives[directive] ?? directives["default-src"] ?? [];
}

/** For a non-inheriting directive: whether it is restricted at all. Unlike a fetch directive, `default-src` never helps here. */
export function isNonInheritingDirectiveSet(directives: CspDirectiveMap, directive: CspDirective): boolean {
  return directives[directive] !== undefined;
}

export type CspWeakness = { directive: CspDirective; message: string };

/**
 * The weaknesses a policy author introduces most often, checked against the
 * *effective* value where inheritance applies — a `default-src` that carries
 * `'unsafe-inline'` weakens `script-src` exactly as much as writing it there
 * directly would, so the check reads the resolved value rather than only the
 * directive's own.
 */
export function findWeaknesses(directives: CspDirectiveMap): CspWeakness[] {
  const weaknesses: CspWeakness[] = [];

  const scriptEffective = effectiveFetchValues(directives, "script-src");
  const styleEffective = effectiveFetchValues(directives, "style-src");
  const scriptHasUnsafeInline = scriptEffective.includes("'unsafe-inline'");
  const styleHasUnsafeInline = styleEffective.includes("'unsafe-inline'");

  if (scriptHasUnsafeInline || styleHasUnsafeInline) {
    const where =
      scriptHasUnsafeInline && styleHasUnsafeInline
        ? "`script-src` və `style-src`"
        : scriptHasUnsafeInline
          ? "`script-src`"
          : "`style-src`";
    weaknesses.push({
      directive: "script-src",
      message: `${where} daxilində \`'unsafe-inline'\` var — bu, CSP-nin XSS-ə qarşı verdiyi əsas qorunmanı ləğv edir, çünki səhifəyə yeridilən istənilən inline skript və ya stil maneəsiz işə düşür.`,
    });
  }

  if (scriptEffective.includes("'unsafe-eval'")) {
    weaknesses.push({
      directive: "script-src",
      message:
        "`script-src` daxilində `'unsafe-eval'` var — `eval()`, `new Function()` və oxşar dinamik kod icrasına icazə verir, bu da CSP-nin bloklamaq istədiyi vektorlardan biridir.",
    });
  }

  for (const { directive, effectiveValues } of resolveFetchDirectives(directives)) {
    if (effectiveValues.includes("*")) {
      weaknesses.push({
        directive,
        message: `\`${directive}\` daxilində \`*\` joker işarəsi var — istənilən domendən yüklənməyə icazə verir, direktivi demək olar mənasız edir.`,
      });
    }
  }

  if (scriptEffective.includes("data:")) {
    weaknesses.push({
      directive: "script-src",
      message:
        "`script-src` daxilində `data:` var — `data:` URI-lə yeridilən skript CSP-nin qarşısını almağa çalışdığı inline koda çox yaxın bir vektordir.",
    });
  }

  if (effectiveFetchValues(directives, "object-src").length === 0) {
    weaknesses.push({
      directive: "object-src",
      message:
        "`object-src` təyin edilməyib (nə özü, nə `default-src` var) — `<object>`/`<embed>` ilə yüklənən köhnə plagin məzmunu heç bir qaydaya tabe deyil.",
    });
  }

  if (!isNonInheritingDirectiveSet(directives, "base-uri")) {
    weaknesses.push({
      directive: "base-uri",
      message:
        "`base-uri` təyin edilməyib — `default-src`-dən miras almır, ona görə səhifəyə yeridilən bir `<base href>` teqi bütün nisbi linkləri başqa domenə yönləndirə bilər.",
    });
  }

  if (!isNonInheritingDirectiveSet(directives, "frame-ancestors")) {
    weaknesses.push({
      directive: "frame-ancestors",
      message:
        "`frame-ancestors` təyin edilməyib — başqa bir sayt bu səhifəni öz `<iframe>`-inə yerləşdirib clickjacking hücumu qura bilər.",
    });
  }

  if (directives["default-src"] === undefined) {
    const openDirectives = resolveFetchDirectives(directives).filter(
      (entry) => directives[entry.directive] === undefined,
    );
    if (openDirectives.length > 0) {
      const names = openDirectives.map((entry) => `\`${entry.directive}\``).join(", ");
      weaknesses.push({
        directive: "default-src",
        message: `\`default-src\` təyin edilməyib — miras üçün heç bir baza yoxdur, ona görə açıq təyin olunmamış hər *-src direktivi (${names}) tamamilə məhdudiyyətsiz qalır.`,
      });
    }
  }

  return weaknesses;
}

export type CspPreset = { id: string; label: string; description: string; directives: CspDirectiveMap };

/** Four starting points a visitor is likely to actually need, each built on the strict base rather than invented from scratch. */
export const CSP_PRESETS: CspPreset[] = [
  {
    id: "sert",
    label: "Sərt (yalnız 'self')",
    description: "Ən sərt başlanğıc nöqtəsi — hər şey öz domenindən, heç bir xarici mənbə yoxdur.",
    directives: {
      "default-src": ["'self'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'none'"],
    },
  },
  {
    id: "google-analytics",
    label: "Google Analytics ilə",
    description: "Sərt bazaya GA4-ün skript, əlaqə və şəkil mənbələri əlavə olunur.",
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "https://www.googletagmanager.com"],
      "connect-src": ["'self'", "https://www.google-analytics.com", "https://analytics.google.com"],
      "img-src": ["'self'", "https://www.google-analytics.com"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'none'"],
    },
  },
  {
    id: "youtube",
    label: "YouTube yerləşdirmə ilə",
    description: "Sərt bazaya YouTube-un iframe və şəkil mənbələri əlavə olunur.",
    directives: {
      "default-src": ["'self'"],
      "frame-src": ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
      "img-src": ["'self'", "https://i.ytimg.com"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'none'"],
    },
  },
  {
    id: "inline-stil",
    label: "Inline stil tələb edən sayt",
    description: "Sərt bazaya, üslub kitabxanasının inline style yazdığı hallar üçün 'unsafe-inline' əlavə olunur.",
    directives: {
      "default-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'none'"],
    },
  },
];
