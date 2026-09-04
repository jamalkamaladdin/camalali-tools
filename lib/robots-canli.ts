/**
 * Reading a robots.txt that is already live, rather than one being written.
 *
 * The matching is not written here. `robots.ts` already implements RFC 9309
 * §2.2.2 - `*` as a run of anything, `$` as an end anchor, longest pattern
 * wins, a tie goes to Allow - and `pathMatchesRule` is imported from it rather
 * than copied. Two matchers in one codebase drift apart within a release and
 * then the builder and the checker disagree about the same file, which is
 * exactly the bug a visitor would never think to suspect.
 *
 * The parser IS written here, and for one reason: this tool has to answer
 * "which line did that" and `parseRobotsTxt` does not carry line numbers. That
 * answer is the whole value of the tool - "blocked" is a fact anybody can
 * observe, "blocked by line 14" is the thing that gets fixed - so the group
 * boundary logic is repeated with a line counter attached. The precedence
 * logic, which is the part that is easy to get subtly wrong, is not repeated.
 */
import { pathMatchesRule } from "./robots";

export type RobotsGroup = {
  /** As written in the file, so the table shows the file's own casing. Comparison lowercases. */
  agents: string[];
  rules: { kind: "allow" | "disallow"; path: string; line: number }[];
  crawlDelay: number | null;
};

export type RobotsDocument = {
  groups: RobotsGroup[];
  sitemaps: { url: string; line: number }[];
  /** Lines that carry no allow/disallow meaning: unrecognised directives, junk,
      and rules written before any `User-agent` line to attach them to. */
  unknown: { line: number; text: string }[];
};

/** U+FEFF. Written as an escape because a literal one is invisible in a diff. */
const BYTE_ORDER_MARK = "\uFEFF";

/** `#` opens a comment that runs to the end of the line, wherever it appears. */
function stripComment(line: string): string {
  const index = line.indexOf("#");
  return index === -1 ? line : line.slice(0, index);
}

/**
 * Reads the file into groups, sitemaps and leftovers, keeping every line number.
 *
 * Group boundaries follow the same rule `robots.ts` documents: consecutive
 * `User-agent:` lines share one rule set, and a `User-agent:` line seen *after*
 * a rule opens a new group. `awaitingRules` is which side of that boundary the
 * parser is on.
 *
 * A byte order mark is stripped before anything else. Left in place it becomes
 * part of the first directive's name, so `<BOM>user-agent` matches nothing and
 * the whole first group silently disappears - a file that looks correct in
 * every editor and is ignored by the crawler.
 */
export function parseRobotsText(text: string): RobotsDocument {
  const groups: RobotsGroup[] = [];
  const sitemaps: { url: string; line: number }[] = [];
  const unknown: { line: number; text: string }[] = [];

  const body = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;

  let current: RobotsGroup | null = null;
  let awaitingRules = false;
  let line = 0;

  for (const rawLine of body.split(/\r\n|\r|\n/)) {
    line += 1;
    const trimmed = stripComment(rawLine).trim();
    if (trimmed === "") continue;

    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      unknown.push({ line, text: trimmed });
      continue;
    }

    const directive = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();

    if (directive === "sitemap") {
      if (value !== "") sitemaps.push({ url: value, line });
      continue;
    }

    if (directive === "user-agent") {
      if (current === null || awaitingRules) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
        awaitingRules = false;
      }
      current.agents.push(value);
      continue;
    }

    if (directive === "allow" || directive === "disallow") {
      if (current === null) {
        /* A rule with no group above it belongs to nobody. Recorded rather than
           dropped: a visitor who wrote it needs to see that it does nothing. */
        unknown.push({ line, text: trimmed });
        continue;
      }
      awaitingRules = true;
      /* An empty value is kept as a rule with an empty pattern so the group
         table still shows the line the author wrote. It can never win a
         precedence fight: `pathMatchesRule` treats "" as "not a rule" rather
         than as "matches everything", which is what makes a bare `Disallow:`
         mean "block nothing". */
      current.rules.push({ kind: directive, path: value, line });
      continue;
    }

    if (directive === "crawl-delay") {
      if (current === null) {
        unknown.push({ line, text: trimmed });
        continue;
      }
      awaitingRules = true;
      const seconds = Number(value);
      if (value !== "" && Number.isFinite(seconds)) current.crawlDelay = seconds;
      else unknown.push({ line, text: trimmed });
      continue;
    }

    unknown.push({ line, text: trimmed });
  }

  return { groups, sitemaps, unknown };
}

/* ---------- testing paths against the document ---------- */

export type PathVerdict = {
  /** The path as it was actually tested, after a pasted full URL was reduced to its path. */
  path: string;
  allowed: boolean;
  /** The line that decided it, or null when nothing matched - an unlisted path defaults to allowed. */
  rule: { kind: "allow" | "disallow"; path: string; line: number } | null;
};

/**
 * Reduces whatever the visitor typed to the path a crawler would compare.
 *
 * A pasted address is the common case and it carries a host the rules never
 * see, so it is cut down to path plus query. A bare `bloq/xeber` gets the
 * leading slash it is missing rather than being silently tested as nothing.
 */
function normalizePath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "/";

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      /* Not parseable as a URL after all - fall through and treat it as a path. */
    }
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Answers "may this bot fetch this path", and names the line that decided.
 *
 * A named bot reads only the groups that name it; the `*` group is a fallback
 * for bots nobody wrote a group for, not an extra layer on top of one. Within
 * the groups that apply, the longest matching pattern wins and an equal-length
 * Allow beats a Disallow - both are the RFC's precedence rule, and both come
 * from `pathMatchesRule` and the comparison below rather than from file order.
 */
export function testPaths(doc: RobotsDocument, agent: string, paths: string[]): PathVerdict[] {
  const wanted = agent.trim().toLowerCase();
  const named = doc.groups.filter((group) =>
    group.agents.some((candidate) => candidate.trim().toLowerCase() === wanted),
  );
  const applicable =
    named.length > 0
      ? named
      : doc.groups.filter((group) => group.agents.some((candidate) => candidate.trim() === "*"));

  return paths.map((raw) => {
    const path = normalizePath(raw);
    let best: { kind: "allow" | "disallow"; path: string; line: number } | null = null;

    for (const group of applicable) {
      for (const rule of group.rules) {
        if (!pathMatchesRule(path, rule.path)) continue;
        if (best === null || rule.path.length > best.path.length) {
          best = rule;
        } else if (
          rule.path.length === best.path.length &&
          rule.kind === "allow" &&
          best.kind === "disallow"
        ) {
          best = rule;
        }
      }
    }

    return { path, allowed: best === null || best.kind === "allow", rule: best };
  });
}

/* ---------- what is wrong with the file ---------- */

export type RobotsIssue = {
  severity: "xeta" | "xeberdarliq" | "melumat";
  message: string;
  line: number | null;
};

/** Google stops reading a robots.txt after this many bytes; the rest is invisible. */
const GOOGLE_BYTE_LIMIT = 500 * 1024;

/** A garbage file can carry hundreds of stray lines; the list stays readable. */
const MAX_UNKNOWN_ISSUES = 5;

/** U+0000. A file full of these was almost certainly saved as UTF-16. */
const NUL = "\u0000";

/**
 * Reads the fetched file for the faults that actually cost traffic.
 *
 * `text` is optional and carries the raw body when the caller has it: the
 * encoding faults - a byte order mark, a file saved as UTF-16 - are invisible
 * once the document is parsed, because parsing is what removes them.
 */
export function auditRobots(
  doc: RobotsDocument,
  opts: { status: number; contentType: string | null; byteLength: number; text?: string },
): RobotsIssue[] {
  const issues: RobotsIssue[] = [];

  if (opts.status === 404 || opts.status === 410) {
    issues.push({
      severity: "melumat",
      line: null,
      message:
        "Bu ünvanda robots.txt yoxdur. Bu, xəta deyil: faylı olmayan sayt botlara tam açıq sayılır və hər səhifə oxuna bilər. Nəyisə bağlamaq lazımdırsa əvvəlcə fayl yaradılmalıdır.",
    });
  } else if (opts.status >= 400) {
    issues.push({
      severity: "xeberdarliq",
      line: null,
      message: `Server robots.txt üçün ${opts.status} qaytardı. Botlar 5xx cavabını «müvəqqəti bağlıdır» kimi oxuyur və bəziləri həmin müddətdə saytı ümumiyyətlə gəzmir — fayl ya 200, ya da 404 qaytarmalıdır.`,
    });
  } else if (opts.status >= 300) {
    issues.push({
      severity: "xeberdarliq",
      line: null,
      message: `robots.txt ${opts.status} ilə yönləndirir. Bir yönləndirməni əsas botlar izləyir, amma zəncir uzanarsa fayl oxunmamış qalır — faylı öz domenində birbaşa vermək daha etibarlıdır.`,
    });
  }

  const type = (opts.contentType ?? "").toLowerCase();
  if (opts.status < 300 && type !== "" && !type.includes("text/plain")) {
    issues.push({
      severity: "xeberdarliq",
      line: null,
      message: `Cavabın növü «${opts.contentType}» — «text/plain» deyil. Ən çox rast gəlinən tələ budur: sayt olmayan fayl üçün 404 əvəzinə HTML səhifə qaytarır, həmin səhifə 200 ilə gəlir və mətn kimi oxunur. Aşağıdakı məzmun robots.txt-ə oxşamırsa, səbəb budur.`,
    });
  }

  if (opts.byteLength > GOOGLE_BYTE_LIMIT) {
    issues.push({
      severity: "xeta",
      line: null,
      message: `Fayl ${Math.round(opts.byteLength / 1024)} KB-dır. Google ilk 500 KB-ı oxuyur və qalanını görmür — həddən sonrakı qaydalar mövcud deyil kimidir.`,
    });
  }

  const raw = opts.text;
  if (raw !== undefined) {
    if (raw.startsWith(BYTE_ORDER_MARK)) {
      issues.push({
        severity: "xeberdarliq",
        line: 1,
        message:
          "Fayl BOM (byte order mark) ilə başlayır. Google bunu bağışlayır, amma bütün botlar bağışlamır: BOM birinci direktivin adına yapışır və həmin qrup tamamilə gözdən qaçır. Faylı «UTF-8 (BOM-suz)» kimi yenidən yadda saxla.",
      });
    }
    if (raw.includes(NUL)) {
      issues.push({
        severity: "xeta",
        line: null,
        message:
          "Faylda NUL baytları var — bu, adətən UTF-16 kodlaşdırma deməkdir. robots.txt UTF-8 mətn olmalıdır; UTF-16 fayl botlar üçün oxunmaz zibildir və bütün qaydalar itir.",
      });
    }
  }

  if (doc.groups.length === 0) {
    issues.push({
      severity: "xeberdarliq",
      line: null,
      message:
        "Faylda heç bir «User-agent» qrupu yoxdur. Qrupsuz yazılmış Allow/Disallow sətirləri heç bir bota aid deyil və nəzərə alınmır — ən azı bir «User-agent: *» sətri lazımdır.",
    });
  }

  for (const group of doc.groups) {
    const blockAll = group.rules.find((rule) => rule.kind === "disallow" && rule.path === "/");
    if (!blockAll) continue;
    const everyone = group.agents.some((agent) => agent.trim() === "*");
    issues.push({
      severity: "xeta",
      line: blockAll.line,
      message: everyone
        ? "«Disallow: /» bütün botlara yazılıb — bu sətir saytın hamısını axtarış sistemlərinə bağlayır. Sınaq mühitindən köçürülmüş fayl bu sətirlə canlıya çıxanda sayt indeksdən tamamilə düşür. Qəsdən deyilsə, sətri dərhal sil."
        : `«Disallow: /» bu qrupa yazılıb (${group.agents.join(", ")}) — həmin botlar üçün saytın hamısı bağlıdır.`,
    });
  }

  if (doc.sitemaps.length === 0) {
    issues.push({
      severity: "melumat",
      line: null,
      message:
        "«Sitemap:» sətri yoxdur. Məcburi deyil, amma sayt xəritəsini burada elan etmək botun onu tapmasının ən ucuz yoludur — xüsusən Search Console-a əlavə edilməmiş saytlarda.",
    });
  }

  for (const sitemap of doc.sitemaps) {
    if (/^https?:\/\//i.test(sitemap.url)) continue;
    issues.push({
      severity: "xeta",
      line: sitemap.line,
      message: `«Sitemap: ${sitemap.url}» nisbi ünvandır. Bu sətir mütləq ünvan tələb edir — «https://sayt.com/sitemap.xml» kimi. Nisbi yazılan sətir sadəcə nəzərə alınmır.`,
    });
  }

  if (doc.groups.some((group) => group.crawlDelay !== null)) {
    issues.push({
      severity: "melumat",
      line: null,
      message:
        "«Crawl-delay» yazılıb. Google bu direktivi oxumur — gəzmə sürəti Search Console-dan idarə olunur. Bing və Yandex isə nəzərə alır, ona görə sətri silmək məcburi deyil.",
    });
  }

  for (const entry of doc.unknown.slice(0, MAX_UNKNOWN_ISSUES)) {
    issues.push({
      severity: "melumat",
      line: entry.line,
      message: `Tanınmayan sətir: «${entry.text}». Bu sətir qayda kimi sayılmır — nə icazə verir, nə bağlayır. Direktivin adı səhv yazılıbsa (məsələn «Dissalow»), qayda sadəcə işləmir.`,
    });
  }

  if (doc.unknown.length > MAX_UNKNOWN_ISSUES) {
    issues.push({
      severity: "melumat",
      line: null,
      message: `Daha ${doc.unknown.length - MAX_UNKNOWN_ISSUES} tanınmayan sətir var. Bu qədər çox olması adətən faylın robots.txt olmadığını göstərir.`,
    });
  }

  return issues;
}

/* ---------- the bots worth offering ---------- */

/**
 * The tokens these crawlers actually publish for themselves. Not a guess at a
 * naming pattern and not exhaustive - the field accepts anything typed into it,
 * this list is only the short way to the common cases.
 */
export const KNOWN_BOTS: { id: string; label: string }[] = [
  { id: "*", label: "Bütün botlar (*)" },
  { id: "Googlebot", label: "Googlebot — Google axtarışı" },
  { id: "Googlebot-Image", label: "Googlebot-Image — Google şəkillər" },
  { id: "Bingbot", label: "Bingbot — Bing" },
  { id: "YandexBot", label: "YandexBot — Yandex" },
  { id: "GPTBot", label: "GPTBot — OpenAI" },
  { id: "ClaudeBot", label: "ClaudeBot — Anthropic" },
  { id: "PerplexityBot", label: "PerplexityBot — Perplexity" },
];

/** What the endpoint hands the widget. */
export type RobotsLiveReport = {
  /** The robots.txt address that was actually fetched, after any redirect. */
  url: string;
  status: number;
  contentType: string | null;
  byteLength: number;
  text: string;
  /** True when the body was longer than the budget and was cut. */
  truncated: boolean;
  doc: RobotsDocument;
  issues: RobotsIssue[];
  checkedAt: string;
};
