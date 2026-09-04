/*
 * SPF grammar, DNS-lookup counting and the audit rules from RFC 7208 — all of
 * it away from the resolver.
 *
 * RFC 7208 §4.6.4 caps one SPF evaluation at 10 DNS-querying mechanisms and,
 * inside that, at 2 "void" answers (NXDOMAIN or no data). A record can be
 * written correctly and still do nothing the day the eleventh `include` is
 * added, and nobody is told — that count is the entire reason this tool
 * exists, so it has to be right, and it has to be checkable without a
 * network.
 *
 * The split is what makes that possible: `expandSpf` takes a resolver as a
 * parameter rather than reaching for `node:dns` itself, so
 * `scripts/tools-checks/spf-yoxlayici.mts` can hand it a fake one — a plain
 * function from domain to TXT records — and prove the recursion, the cycle
 * guard, the depth cap and the query budget with no DNS involved at all. The
 * real resolver lives in `src/app/api/alet/spf-yoxlayici/route.ts` and is
 * nothing more than an adapter to this same function.
 *
 * Two counters are kept apart on purpose and are easy to conflate:
 *   - `spfLookups` is the RFC arithmetic — every `include`, `a`, `mx`, `ptr`,
 *     `exists` and `redirect=` costs one, `ip4`/`ip6`/`all` cost nothing, and
 *     this is what is compared against the 10-lookup limit.
 *   - `dnsQueries` is this tool's own safety valve — the number of TXT
 *     lookups it actually performed while expanding `include`/`redirect`
 *     chains, capped well above 10 (30 by default) so a chain that is merely
 *     long still gets a real count instead of being cut off at the first
 *     sign of trouble, while a chain built to be endless still terminates.
 * A record can therefore report `15/10` lookups (over the RFC limit, still
 * fully counted) while `dnsQueries` stayed under its own budget the whole
 * time — those are different questions and the fields say so separately.
 *
 * What is deliberately NOT done: `a`, `mx`, `ptr` and `exists` are counted as
 * the one lookup RFC 7208 charges them, but their own targets are never
 * resolved — this tool has no A/MX/PTR engine, only a TXT one, so it cannot
 * judge whether *those* queries would be void. Only `include` and `redirect`
 * targets, which this tool does fetch, are checked for a void answer. That is
 * a narrower void count than a full SPF evaluator would produce, and it is
 * narrower in the safe direction: it never over-counts.
 *
 * Cycle detection uses one visited-domains set for the whole expansion, not
 * a per-branch ancestor chain. That is what the task asks for and what stops
 * `a.com` → `b.com` → `a.com` cold, but it has a side effect worth naming: a
 * domain reached a second time from an unrelated branch (two vendors that
 * both happen to `include` the same relay — a real, legitimate pattern) is
 * also treated as "already expanded" and is not walked a second time, even
 * though it is not actually a loop. Its own `include`/`redirect` mechanism
 * still spends its one lookup either way; only the re-walk of its subtree is
 * skipped. Under-counting a legitimate diamond is the safer failure than
 * building a parser that has to tell the two cases apart.
 */

export const SPF_LOOKUP_LIMIT = 10;
export const SPF_VOID_LIMIT = 2;

const DEFAULT_QUERY_BUDGET = 30;
const DEFAULT_DEPTH_CAP = 10;

/** The mechanisms RFC 7208 §4.6.4 charges one DNS lookup each. `redirect=` is a modifier and is counted alongside them, separately below. */
const LOOKUP_MECHANISMS = new Set(["include", "a", "mx", "ptr", "exists"]);

const MECHANISM_NAMES = new Set(["all", "include", "a", "mx", "ptr", "ip4", "ip6", "exists"]);

const QUALIFIERS: Record<string, SpfQualifier> = { "+": "+", "-": "-", "~": "~", "?": "?" };

/** What a resolver would answer "v=spf1 ..." to, case-insensitively, as the start of the whole record. */
const SPF_PREFIX = /^v=spf1(\s|$)/i;

export type SpfQualifier = "+" | "-" | "~" | "?";

export type SpfTerm =
  | { form: "mechanism"; qualifier: SpfQualifier; name: string; argument: string; raw: string }
  | { form: "modifier"; name: string; value: string; raw: string };

export type SpfParse = { ok: true; terms: SpfTerm[] } | { ok: false; error: string };

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Parses one term — everything between two spaces in the record body — into
 * a mechanism or a modifier, or says exactly which term does not parse.
 *
 * The `=` character never appears in mechanism syntax (mechanisms use `:`
 * and `/`), so an unqualified term containing one is unambiguously a
 * modifier — the same rule `dns.ts`'s `describeSpf` uses, made strict here
 * instead of lenient: an unrecognised mechanism name, a missing required
 * domain-spec on `include`/`exists`/`ip4`/`ip6`, or a bare qualifier with
 * nothing after it all return an error rather than being silently skipped.
 */
function parseTerm(raw: string): { ok: true; term: SpfTerm } | { ok: false; error: string } {
  if (raw === "") return { ok: false, error: "Boş şərt tapıldı." };

  const qualifier = QUALIFIERS[raw[0]] ?? null;
  const body = qualifier === null ? raw : raw.slice(1);
  if (body === "") return { ok: false, error: `Yarımçıq şərt: "${raw}"` };

  const equalsIndex = body.indexOf("=");
  if (qualifier === null && equalsIndex !== -1) {
    const name = body.slice(0, equalsIndex).toLowerCase();
    const value = body.slice(equalsIndex + 1);
    if (!/^[a-z][a-z0-9_.-]*$/i.test(name) || value === "") {
      return { ok: false, error: `Modifikator oxunmadı: "${raw}"` };
    }
    return { ok: true, term: { form: "modifier", name, value, raw } };
  }

  const colonIndex = body.indexOf(":");
  const slashIndex = body.indexOf("/");
  const boundaries = [colonIndex, slashIndex].filter((index) => index >= 0);
  const nameEnd = boundaries.length > 0 ? Math.min(...boundaries) : body.length;
  const name = body.slice(0, nameEnd).toLowerCase();
  const rest = body.slice(nameEnd);
  const argument = rest.startsWith(":") ? rest.slice(1) : rest;

  if (!MECHANISM_NAMES.has(name)) {
    return { ok: false, error: `Naməlum mexanizm: "${raw}"` };
  }
  if (name === "all" && rest !== "") {
    return { ok: false, error: `"all" arqument qəbul etmir: "${raw}"` };
  }
  if ((name === "include" || name === "exists") && (!rest.startsWith(":") || argument === "")) {
    return { ok: false, error: `"${name}" domen tələb edir: "${raw}"` };
  }
  if ((name === "ip4" || name === "ip6") && (!rest.startsWith(":") || argument === "")) {
    return { ok: false, error: `"${name}" ünvan tələb edir: "${raw}"` };
  }

  return { ok: true, term: { form: "mechanism", qualifier: qualifier ?? "+", name, argument, raw } };
}

/**
 * Parses a whole record body, `v=spf1` prefix included, into its terms.
 *
 * The record itself is trusted to already be the one true `v=spf1` string for
 * its name — picking that one out of several TXT records, or rejecting a
 * name with more than one, happens in `expandSpf`, not here, because that
 * decision needs the whole TXT answer set and this function only ever sees
 * one string.
 */
export function parseSpfRecord(text: string): SpfParse {
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter((token) => token !== "");

  if (tokens.length === 0 || tokens[0].toLowerCase() !== "v=spf1") {
    return { ok: false, error: `Qeyd "v=spf1" ilə başlamır: "${text.slice(0, 60)}"` };
  }

  const terms: SpfTerm[] = [];
  for (const token of tokens.slice(1)) {
    const parsed = parseTerm(token);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    terms.push(parsed.term);
  }
  return { ok: true, terms };
}

/**
 * One domain's answer to a TXT query, as `node:dns/promises`'
 * `resolver.resolveTxt` returns it: one entry per TXT record, each an array
 * of the record's own string chunks. A record split across chunks is joined
 * with **no separator** — `["v=spf1 inc", "lude:x.com -all"]` is the one
 * string `"v=spf1 include:x.com -all"`, exactly as a long DKIM key arrives in
 * several pieces that only mean something concatenated.
 *
 * May return a promise or a plain array: the real resolver is async, the
 * fake one the checks use is a plain function, and `expandSpf` awaits either.
 */
export type SpfResolver = (domain: string) => string[][] | Promise<string[][]>;

export type SpfChild = { via: "include" | "redirect"; node: SpfNode };

export type SpfNode = {
  domain: string;
  /** The joined `v=spf1 ...` text, or `null` when nothing usable came back. */
  record: string | null;
  /** The record's own TXT chunks, unjoined — kept for the 255-byte-per-string check. */
  chunks: string[];
  terms: SpfTerm[];
  /** Lookups this node's own terms spend — `include`/`redirect` included, their children's cost is not. */
  ownLookups: number;
  children: SpfChild[];
  /** True when the TXT query answered with no records at all (NXDOMAIN or empty NOERROR) — the RFC's "void" case. */
  isVoid: boolean;
  /** Why `record` is `null`: duplicate records, a parse error, a cycle, a capped branch. `null` when a record was read. */
  error: string | null;
};

export type SpfVerdict = "ok" | "thin" | "permerror";

export type SpfFinding = { tone: "info" | "accent"; title: string; text: string };

export type SpfExpansion = {
  root: SpfNode;
  /** RFC 7208 §4.6.4's count — compared against `SPF_LOOKUP_LIMIT`. */
  totalLookups: number;
  /** Void answers among the `include`/`redirect` targets this tool actually resolved — compared against `SPF_VOID_LIMIT`. */
  voidLookups: number;
  /** `totalLookups` read against the limit: `ok` under 8, `thin` at 8–10, `permerror` over 10. */
  verdict: SpfVerdict;
  /** True once the depth cap stopped at least one branch from expanding. */
  depthExceeded: boolean;
  /** True once the query budget stopped at least one branch from expanding. */
  budgetExceeded: boolean;
  /** Domains where the visited-set closed a loop, in the order they were hit. */
  cycles: string[];
  findings: SpfFinding[];
};

type ExpandState = {
  maxQueries: number;
  maxDepth: number;
  visited: Set<string>;
  dnsQueries: number;
  spfLookups: number;
  voidLookups: number;
  depthExceeded: boolean;
  budgetExceeded: boolean;
  cycleDomains: string[];
};

function emptyNode(domain: string, error: string | null): SpfNode {
  return { domain, record: null, chunks: [], terms: [], ownLookups: 0, children: [], isVoid: false, error };
}

type Answer = { ok: true; record: string; chunks: string[] } | { ok: false; node: SpfNode };

/** Runs one TXT query, spends one query from the budget, and picks out the single SPF record — or explains why there is not exactly one. */
async function resolveOne(domain: string, resolve: SpfResolver, state: ExpandState): Promise<Answer> {
  state.dnsQueries += 1;
  const raw = await resolve(domain);
  const candidates = raw.filter((chunks) => SPF_PREFIX.test(chunks.join("").trim()));

  if (candidates.length > 1) {
    return {
      ok: false,
      node: emptyNode(
        domain,
        `Bu adda birdən çox SPF qeydi var (${candidates.length} ədəd): RFC 7208-ə görə bu, permerror sayılır və SPF tamamilə nəzərə alınmır.`,
      ),
    };
  }
  if (candidates.length === 0) {
    /* No TXT records at all is the RFC's "void" answer; TXT records that just
       are not SPF is a plain, non-void "no SPF here". */
    const isVoid = raw.length === 0;
    if (isVoid) state.voidLookups += 1;
    return {
      ok: false,
      node: { ...emptyNode(domain, isVoid ? null : "Bu domendə v=spf1 ilə başlayan qeyd yoxdur."), isVoid },
    };
  }

  const chunks = candidates[0];
  return { ok: true, record: chunks.join(""), chunks };
}

/** Parses an already-fetched record and recurses into every `include`/`redirect` it names. */
async function finishNode(
  domain: string,
  record: string,
  chunks: string[],
  resolve: SpfResolver,
  state: ExpandState,
  depth: number,
): Promise<SpfNode> {
  const parsed = parseSpfRecord(record);
  if (!parsed.ok) {
    return { domain, record, chunks, terms: [], ownLookups: 0, children: [], isVoid: false, error: parsed.error };
  }

  const hasAll = parsed.terms.some((term) => term.form === "mechanism" && term.name === "all");
  let ownLookups = 0;
  const children: SpfChild[] = [];

  for (const term of parsed.terms) {
    if (term.form === "mechanism" && LOOKUP_MECHANISMS.has(term.name)) {
      ownLookups += 1;
      state.spfLookups += 1;
      if (term.name === "include") {
        children.push({ via: "include", node: await fetchNode(term.argument, resolve, state, depth + 1) });
      }
      continue;
    }
    if (term.form === "modifier" && term.name === "redirect") {
      ownLookups += 1;
      state.spfLookups += 1;
      /* `redirect=` is only ever reached by real SPF evaluation once every
         mechanism has failed to match — and `all` always matches, so an
         `all` anywhere in the same record means `redirect=` is dead text.
         Its lookup is still charged (that is what this tool is told to
         assert) but its target is not walked, because real evaluation would
         never get there either. */
      if (!hasAll) {
        children.push({ via: "redirect", node: await fetchNode(term.value, resolve, state, depth + 1) });
      }
    }
  }

  return { domain, record, chunks, terms: parsed.terms, ownLookups, children, isVoid: false, error: null };
}

/** Resolves and expands one `include`/`redirect` target, after the cycle, depth and budget guards. */
async function fetchNode(domain: string, resolve: SpfResolver, state: ExpandState, depth: number): Promise<SpfNode> {
  const key = domain.toLowerCase();

  if (state.visited.has(key)) {
    state.cycleDomains.push(domain);
    return emptyNode(domain, "Bu domen artıq zəncirdə var: dövr aşkarlandı, budaq təkrar genişləndirilmədi.");
  }
  if (depth > state.maxDepth) {
    state.depthExceeded = true;
    return emptyNode(domain, "Dərinlik həddi aşıldığı üçün bu budaq genişləndirilmədi.");
  }
  if (state.dnsQueries >= state.maxQueries) {
    state.budgetExceeded = true;
    return emptyNode(domain, "Sorğu büdcəsi bitdiyi üçün bu budaq genişləndirilmədi.");
  }

  state.visited.add(key);
  const answer = await resolveOne(domain, resolve, state);
  if (!answer.ok) return answer.node;
  return finishNode(domain, answer.record, answer.chunks, resolve, state, depth);
}

function verdictOf(totalLookups: number): SpfVerdict {
  if (totalLookups > SPF_LOOKUP_LIMIT) return "permerror";
  if (totalLookups >= SPF_LOOKUP_LIMIT - 2) return "thin";
  return "ok";
}

function walk(node: SpfNode, visit: (node: SpfNode) => void) {
  visit(node);
  for (const child of node.children) walk(child.node, visit);
}

type ExpansionBase = Omit<SpfExpansion, "verdict" | "findings">;

/**
 * The visitor-facing findings, worst first. Findings read the whole tree
 * (`ptr`, `redirect=`+`all`) but the byte-length and missing-`all` checks
 * read only the root — that is the record actually governing the domain
 * being audited, not an included vendor's own.
 *
 * `sourcedFromText` is separate from `expansion` on purpose: it describes
 * where the root came from, not a fact about the tree, and folding it into
 * `ExpansionBase` would leak a field the public `SpfExpansion` type does not
 * have into the object `expandSpf` returns.
 */
function buildSpfFindings(expansion: ExpansionBase, sourcedFromText: boolean): SpfFinding[] {
  const { root, totalLookups, voidLookups, depthExceeded, budgetExceeded, cycles } = expansion;

  /* `terms` is only ever populated by a successful parse, so its absence
     covers all four ways the root could not be evaluated — a duplicate
     record, no record at all, a void answer, and a record that WAS read but
     did not parse (which still carries the raw text in `record`, so testing
     that field alone would miss exactly this case and swallow the parse
     error without ever showing it). */
  if (root.terms.length === 0) {
    return [
      {
        tone: "accent",
        title: root.isVoid ? "SPF sorğusuna cavab gəlmədi" : "SPF qeydi oxunmadı",
        text: root.isVoid
          ? "TXT sorğusu bu ad üçün heç nə qaytarmadı: domen mövcud deyil, ya da bu adda ümumiyyətlə TXT qeydi yoxdur."
          : (root.error ?? "Bu domendə v=spf1 ilə başlayan etibarlı qeyd tapılmadı."),
      },
    ];
  }

  const findings: SpfFinding[] = [];

  /* `terms.length > 0` already proved `record` came from a successful parse,
     which only ever runs on a non-null string — this is that fact spelled
     out for the type checker, not a real fallback. */
  const recordText = root.record ?? "";

  const allTerm = root.terms.find((term) => term.form === "mechanism" && term.name === "all");
  if (allTerm && allTerm.form === "mechanism" && allTerm.qualifier === "+") {
    findings.push({
      tone: "accent",
      title: "«+all»: istənilən server bu domenin adından yaza bilər",
      text: "Bu, SPF-i mənasız edir: siyahıda olmayan istənilən göndərən də «pass» qiyməti alır, yəni siyahının özü heç nəyi süzmür. «-all» (rədd) və ya ən azı «~all» (softfail) ilə əvəz et.",
    });
  }

  if (totalLookups > SPF_LOOKUP_LIMIT) {
    findings.push({
      tone: "accent",
      title: `DNS sorğu limiti aşılıb (${totalLookups}/${SPF_LOOKUP_LIMIT})`,
      text: "RFC 7208 §4.6.4 SPF qiymətləndirməsini 10 sorğuya qədər buraxır. Bundan çoxu permerror sayılır: qəbuledicilərin əksəriyyəti nəticədə bu qeydi elə sanki heç yazılmayıb kimi görməzdən gəlir.",
    });
  } else if (totalLookups >= SPF_LOOKUP_LIMIT - 2) {
    findings.push({
      tone: "info",
      title: `Sərhəd nazikdir (${totalLookups}/${SPF_LOOKUP_LIMIT})`,
      text: "Növbəti əlavə olunan bir include limiti aşacaq. Yeni inteqrasiya qoşmazdan əvvəl köhnə include-lardan birini çıxarmaq lazım gələ bilər.",
    });
  }

  if (voidLookups > SPF_VOID_LIMIT) {
    findings.push({
      tone: "accent",
      title: `Boş axtarış limiti aşılıb (${voidLookups}/${SPF_VOID_LIMIT})`,
      text: "RFC 7208 §4.6.4 cavabsız (NXDOMAIN və ya boş) axtarışları 2-də məhdudlaşdırır: bundan artığı da permerror sayılır, elə limitin özü aşılmasa belə.",
    });
  }

  if (cycles.length > 0) {
    findings.push({
      tone: "accent",
      title: "Dövr aşkarlandı",
      text: `${cycles.join(", ")} zəncirin özünə qayıdır: həmin budaqda genişləndirmə dayandırıldı ki, sonsuz dövrə düşməsin.`,
    });
  }

  let hasPtr = false;
  let redirectWithAllDomain: string | null = null;
  walk(root, (node) => {
    if (node.terms.some((term) => term.form === "mechanism" && term.name === "ptr")) hasPtr = true;
    const nodeHasAll = node.terms.some((term) => term.form === "mechanism" && term.name === "all");
    const nodeHasRedirect = node.terms.some((term) => term.form === "modifier" && term.name === "redirect");
    if (nodeHasAll && nodeHasRedirect && redirectWithAllDomain === null) redirectWithAllDomain = node.domain;
  });

  if (redirectWithAllDomain !== null) {
    findings.push({
      tone: "info",
      title: "«redirect=» «all» ilə birlikdə yazılıb",
      text: `${redirectWithAllDomain} qeydində hər ikisi var: «all» mövcud olduğu üçün qiymətləndirmə heç vaxt ora çatmır, «redirect=» tamamilə nəzərə alınmır.`,
    });
  }

  if (hasPtr) {
    findings.push({
      tone: "info",
      title: "«ptr» mexanizmi köhnəlib",
      text: "RFC 7208 §5.5 «ptr»-i yavaş və etibarsız elan edir və istifadəsini tövsiyə etmir, üstəlik hər hərəkəti bir DNS sorğusuna mal olur.",
    });
  }

  if (!allTerm) {
    findings.push({
      tone: "info",
      title: "«all» yoxdur",
      text: "Qeyd heç bir defolt qayda göstərmir. Bu, örtülü «?all» (neytral) kimi işlənir: siyahıdan kənar göndərən nə rədd, nə də təsdiq edilir.",
    });
  }

  if (!sourcedFromText && root.chunks.some((chunk) => byteLength(chunk) > 255)) {
    findings.push({
      tone: "info",
      title: "TXT sətri 255 baytdan uzundur",
      text: "Hər TXT character-string 255 baytdan uzun ola bilməz. Bu zonada ən azı bir sətir bu həddi keçib: bəzi köhnə tərtibatlar belə qeydi düzgün oxumaya bilər.",
    });
  }

  if (byteLength(recordText) > 512) {
    findings.push({
      tone: "info",
      title: "Qeyd 512 baytdan uzundur",
      text: `Ümumi uzunluq ${byteLength(recordText)} bayt. Köhnə UDP cavabları bunu daşımır və sorğu TCP-yə keçməli olur: hər DNS server bunu dəstəkləmir.`,
    });
  }

  if (depthExceeded) {
    findings.push({
      tone: "info",
      title: "Dərinlik həddi aşıldı",
      text: "Include zənciri ayrılmış dərinlikdən uzun idi, bəzi budaqlar genişləndirilmədi, aşağıdakı say tam olmaya bilər.",
    });
  }

  if (budgetExceeded) {
    findings.push({
      tone: "info",
      title: "Sorğu büdcəsi bitdi",
      text: "Genişləndirmə üçün ayrılmış sorğu sayı bitdiyi üçün dayandırıldı: aşağıdakı say tam olmaya bilər.",
    });
  }

  return findings;
}

export type ExpandSpfOptions = {
  /** Safety valve on the actual TXT queries this run performs — not the RFC's 10-lookup limit. Default 30. */
  maxQueries?: number;
  /** How many `include`/`redirect` levels deep the tree may go. Default 10. */
  maxDepth?: number;
  /**
   * A record the visitor pasted directly, instead of a domain to look up.
   * `domain` is then only a label for the tree's root — no TXT query is made
   * for it, though every `include`/`redirect` it names still is.
   */
  rootRecord?: string;
};

/**
 * Expands one domain's SPF record — or a pasted record for one — into the
 * full tree, counting every lookup RFC 7208 charges along the way.
 *
 * `resolve` is the one seam between this and the network: the route hands it
 * a function backed by `node:dns/promises`, and the checks hand it a plain
 * object lookup with no DNS involved at all.
 */
export async function expandSpf(
  domain: string,
  resolve: SpfResolver,
  options: ExpandSpfOptions = {},
): Promise<SpfExpansion> {
  const state: ExpandState = {
    maxQueries: options.maxQueries ?? DEFAULT_QUERY_BUDGET,
    maxDepth: options.maxDepth ?? DEFAULT_DEPTH_CAP,
    visited: new Set([domain.toLowerCase()]),
    dnsQueries: 0,
    spfLookups: 0,
    voidLookups: 0,
    depthExceeded: false,
    budgetExceeded: false,
    cycleDomains: [],
  };

  let root: SpfNode;
  if (options.rootRecord !== undefined) {
    root = await finishNode(domain, options.rootRecord, [options.rootRecord], resolve, state, 0);
  } else {
    const answer = await resolveOne(domain, resolve, state);
    root = answer.ok ? await finishNode(domain, answer.record, answer.chunks, resolve, state, 0) : answer.node;
  }

  const base: ExpansionBase = {
    root,
    totalLookups: state.spfLookups,
    voidLookups: state.voidLookups,
    depthExceeded: state.depthExceeded,
    budgetExceeded: state.budgetExceeded,
    cycles: [...new Set(state.cycleDomains)],
  };
  const sourcedFromText = options.rootRecord !== undefined;

  return { ...base, verdict: verdictOf(base.totalLookups), findings: buildSpfFindings(base, sourcedFromText) };
}
