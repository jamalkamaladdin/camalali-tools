/**
 * robots.txt building and checking: templates that produce a valid file,
 * a parser that reads one back, and a matcher that answers "is this path
 * blocked for this bot" the way real crawlers do.
 *
 * The matcher is the point of this tool. robots.txt looks like a list of
 * lines a human reads top to bottom, but the actual rule (RFC 9309 section
 * 2.2.2, and Google's own documentation of the same algorithm) is: collect
 * every rule that matches the path, and the one written with the *longest*
 * pattern wins regardless of where it sits in the file or which directive
 * came first. A rule near the bottom of the file can silently override one
 * near the top, which is exactly the mistake this tool exists to catch.
 */

export type RuleType = "allow" | "disallow";

export type RobotsRule = { type: RuleType; path: string };

export type RobotsGroup = {
  /** Lowercased — matching against a declared user-agent is case-insensitive. */
  userAgents: string[];
  rules: RobotsRule[];
  crawlDelay: number | null;
};

export type ParsedRobots = {
  groups: RobotsGroup[];
  sitemaps: string[];
};

/** `#` starts a comment that runs to the end of the line, wherever it appears — even after a directive's value. */
function stripComment(line: string): string {
  const index = line.indexOf("#");
  return index === -1 ? line : line.slice(0, index);
}

/**
 * Groups are consecutive `User-agent:` lines that share the rules following
 * them, up to the next `User-agent:` line. The subtlety is *which* next one
 * starts a fresh group: a `User-agent:` line seen before any rule extends the
 * current group (several bots sharing one rule set), while one seen after a
 * rule closes the current group and opens a new one. `awaitingRules` tracks
 * which side of that boundary the parser is on.
 */
export function parseRobotsTxt(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];

  let current: RobotsGroup | null = null;
  let awaitingRules = false;

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = stripComment(rawLine).trim();
    if (line === "") continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue; // not "directive: value" — real files carry stray lines, skip rather than throw

    const directive = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (directive === "sitemap") {
      if (value !== "") sitemaps.push(value);
      continue;
    }

    if (directive === "user-agent") {
      if (current === null || awaitingRules) {
        current = { userAgents: [], rules: [], crawlDelay: null };
        groups.push(current);
        awaitingRules = false;
      }
      current.userAgents.push(value.toLowerCase());
      continue;
    }

    if (current === null) continue; // a rule before any user-agent has nothing to attach to

    if (directive === "allow" || directive === "disallow") {
      awaitingRules = true;
      // "Disallow:" with nothing after it is explicitly defined as "block
      // nothing" — recorded as no rule at all rather than as a rule that
      // happens to match everything, so it can never win a precedence fight.
      if (directive === "disallow" && value === "") continue;
      current.rules.push({ type: directive, path: value });
      continue;
    }

    if (directive === "crawl-delay") {
      awaitingRules = true;
      const seconds = Number(value);
      if (Number.isFinite(seconds)) current.crawlDelay = seconds;
      continue;
    }

    // Vendor extensions such as "Host:" or "Clean-param:" are read by some
    // crawlers but carry no allow/disallow meaning — nothing to do with them.
  }

  return { groups, sitemaps };
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `*` matches any run of characters (including none); `$` anchors the end of
 * the URL when it is the pattern's last character, otherwise it is a literal.
 * Everything else is a plain prefix match — a pattern with no wildcard still
 * matches any path that merely *starts* with it, which is what makes
 * `Disallow: /` block an entire site with one character.
 */
function patternToRegExp(pattern: string): RegExp {
  const endAnchored = pattern.endsWith("$");
  const body = endAnchored ? pattern.slice(0, -1) : pattern;
  const source = body.split("*").map(escapeRegExpLiteral).join(".*");
  return new RegExp(`^${source}${endAnchored ? "$" : ""}`);
}

/** Path matching is case-sensitive — `/Secret` and `/secret` are different URLs, unlike the directive names around them. */
export function pathMatchesRule(path: string, pattern: string): boolean {
  if (pattern === "") return false; // an empty pattern is not "matches everything", it is "not a rule"
  return patternToRegExp(pattern).test(path);
}

export type RobotsCheckResult = {
  allowed: boolean;
  /** The rule that decided the outcome, or null when nothing matched — the default for an unlisted path is allow. */
  matchedRule: { type: RuleType; path: string; userAgents: string[] } | null;
  /** True when no group named this bot specifically and the `*` group was used instead. */
  usedWildcardFallback: boolean;
};

/**
 * A named bot ("Googlebot") only ever obeys a group that names it — it does
 * not also read the `*` group on top of its own. The `*` group is read only
 * when no group names the bot at all. Within whichever set of groups applies,
 * every matching rule is compared by pattern length, and a tie goes to
 * `allow` — both of these are the literal RFC 9309 precedence rule, not a
 * house convention.
 */
export function checkUrl(parsed: ParsedRobots, userAgent: string, path: string): RobotsCheckResult {
  const agent = userAgent.trim().toLowerCase();
  const specific = parsed.groups.filter((group) => group.userAgents.includes(agent));
  const usedWildcardFallback = specific.length === 0;
  const applicable = usedWildcardFallback
    ? parsed.groups.filter((group) => group.userAgents.includes("*"))
    : specific;

  let best: { type: RuleType; path: string; userAgents: string[]; length: number } | null = null;

  for (const group of applicable) {
    for (const rule of group.rules) {
      if (!pathMatchesRule(path, rule.path)) continue;
      const length = rule.path.length;

      if (best === null || length > best.length) {
        best = { type: rule.type, path: rule.path, userAgents: group.userAgents, length };
      } else if (length === best.length && rule.type === "allow" && best.type === "disallow") {
        best = { type: rule.type, path: rule.path, userAgents: group.userAgents, length };
      }
    }
  }

  if (best === null) return { allowed: true, matchedRule: null, usedWildcardFallback };
  return {
    allowed: best.type === "allow",
    matchedRule: { type: best.type, path: best.path, userAgents: best.userAgents },
    usedWildcardFallback,
  };
}

/* ---------- builder ---------- */

export type RobotsBuilderConfig = {
  groups: RobotsGroup[];
  sitemaps: string[];
};

/** Renders back into the text format `parseRobotsTxt` reads — round-tripping the two is how the check file proves they agree on what a group is. */
export function buildRobotsTxt(config: RobotsBuilderConfig): string {
  const blocks = config.groups
    .map((group) => {
      const agents = group.userAgents.map((agent) => agent.trim()).filter((agent) => agent !== "");
      if (agents.length === 0) return null;

      const lines = agents.map((agent) => `User-agent: ${agent}`);
      for (const rule of group.rules) {
        lines.push(`${rule.type === "allow" ? "Allow" : "Disallow"}: ${rule.path}`);
      }
      if (group.crawlDelay !== null && Number.isFinite(group.crawlDelay)) {
        lines.push(`Crawl-delay: ${group.crawlDelay}`);
      }
      return lines.join("\n");
    })
    .filter((block): block is string => block !== null);

  const sitemapLines = config.sitemaps
    .map((sitemap) => sitemap.trim())
    .filter((sitemap) => sitemap !== "")
    .map((sitemap) => `Sitemap: ${sitemap}`);

  const sections = [...blocks];
  if (sitemapLines.length > 0) sections.push(sitemapLines.join("\n"));

  return sections.join("\n\n") + (sections.length > 0 ? "\n" : "");
}

/* ---------- ready-made templates ---------- */

/**
 * The bot tokens crawlers that train or answer from web text currently
 * identify themselves with. Not exhaustive and not static — new ones appear
 * — but these are the names actually published by their operators as of this
 * writing, not a guess at a naming pattern.
 */
export const AI_CRAWLER_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "CCBot",
  "Google-Extended",
  "PerplexityBot",
  "Bytespider",
  "Amazonbot",
];

export type RobotsTemplateId = "acig" | "bagli" | "admin-bagli" | "ai-bagli";

export const ROBOTS_TEMPLATES: { id: RobotsTemplateId; label: string }[] = [
  { id: "acig", label: "Hamıya açıq" },
  { id: "bagli", label: "Hamıya bağlı" },
  { id: "admin-bagli", label: "Yalnız admin bağlı" },
  { id: "ai-bagli", label: "AI botları bağlı" },
];

/** `sitemapUrl` is optional so a template can be previewed before the visitor has typed one. */
export function buildTemplateConfig(id: RobotsTemplateId, sitemapUrl: string): RobotsBuilderConfig {
  const sitemaps = sitemapUrl.trim() === "" ? [] : [sitemapUrl.trim()];

  switch (id) {
    case "acig":
      return {
        groups: [{ userAgents: ["*"], rules: [{ type: "allow", path: "/" }], crawlDelay: null }],
        sitemaps,
      };
    case "bagli":
      return {
        groups: [{ userAgents: ["*"], rules: [{ type: "disallow", path: "/" }], crawlDelay: null }],
        sitemaps,
      };
    case "admin-bagli":
      return {
        groups: [
          {
            userAgents: ["*"],
            rules: [
              { type: "disallow", path: "/admin" },
              { type: "disallow", path: "/api" },
            ],
            crawlDelay: null,
          },
        ],
        sitemaps,
      };
    case "ai-bagli":
      return {
        groups: [
          ...AI_CRAWLER_USER_AGENTS.map((agent) => ({
            userAgents: [agent],
            rules: [{ type: "disallow" as const, path: "/" }],
            crawlDelay: null,
          })),
          { userAgents: ["*"], rules: [{ type: "allow", path: "/" }], crawlDelay: null },
        ],
        sitemaps,
      };
  }
}
