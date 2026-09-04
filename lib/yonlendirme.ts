/**
 * Redirect rule generator — turns old-URL/new-URL pairs into working nginx,
 * Apache (.htaccess), Caddy and Next.js config. The whole point of this tool
 * is the trap named in the brief: a URL that reaches a config file carries
 * characters (space, quote, `$`, `;`) that each format's own syntax gives a
 * different meaning to, and getting that wrong produces a config that looks
 * right and refuses to start the server. Every escaping decision below is
 * commented with which format's grammar forced it.
 *
 * An empty rule list produces an empty string in every format rather than a
 * placeholder comment — the widget owns the "nothing to show yet" message,
 * so the copy button never hands a visitor a config file with a stray line
 * they have to notice and delete.
 */

export type RedirectStatus = 301 | 302;
export type OutputFormat = "nginx" | "apache" | "caddy" | "nextjs";

export type RedirectRule = {
  from: string;
  to: string;
};

export type ParseError = {
  /** 1-based, so it matches the line number a visitor counts by eye. */
  line: number;
  raw: string;
  message: string;
};

export type ParseResult = {
  rules: RedirectRule[];
  errors: ParseError[];
};

/**
 * One trailing slash is the only difference between a rule that looks
 * duplicated across two lines and one that is not, and it is the kind of
 * thing a pasted spreadsheet carries inconsistently. Left alone for the bare
 * root and for a wildcard rule, where the slash is structural rather than
 * decorative — stripping it from "/bloq/*" would change what the pattern
 * matches.
 */
export function normalizeTrailingSlash(value: string): string {
  if (value === "/" || value.endsWith("*")) return value;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * Reads "old  new" pairs, one per line. A line is exactly two whitespace-run
 * separated tokens — that is deliberately strict: a line with only one token
 * is missing its destination and has to fail loudly rather than silently
 * producing a rule that redirects a page to itself, and a line with more than
 * two is more likely a malformed paste (a URL with an accidental space in it)
 * than a third field this tool has anywhere to put.
 */
export function parseRedirectInput(
  text: string,
  options: { normalizeTrailingSlash: boolean } = { normalizeTrailingSlash: false },
): ParseResult {
  const rules: RedirectRule[] = [];
  const errors: ParseError[] = [];

  const lines = text.split(/\r\n|\r|\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    // Blank lines and lines led by "#" are the two things a hand-edited list
    // of redirects accumulates, and neither is a rule to reject.
    if (line === "" || line.startsWith("#")) return;

    const match = line.match(/^(\S+)\s+(\S+)$/);
    if (!match) {
      const hasWhitespace = /\s/.test(line);
      errors.push({
        line: index + 1,
        raw,
        message: hasWhitespace
          ? "İki sahə gözlənilir (köhnə və yeni ünvan) — bu sətirdə daha çoxu var."
          : "Yalnız bir tərəf var — yeni ünvan yoxdur.",
      });
      return;
    }

    const from = options.normalizeTrailingSlash ? normalizeTrailingSlash(match[1]) : match[1];
    const to = options.normalizeTrailingSlash ? normalizeTrailingSlash(match[2]) : match[2];
    rules.push({ from, to });
  });

  return { rules, errors };
}

/** A rule is a wildcard rule by its source ending in "*" — the one wildcard shape every format below knows how to translate. */
export function isWildcardRule(rule: RedirectRule): boolean {
  return rule.from.endsWith("*");
}

/** Splits "prefix*" into its prefix; null when there is no trailing "*". */
function splitWildcard(value: string): { prefix: string } | null {
  return value.endsWith("*") ? { prefix: value.slice(0, -1) } : null;
}

/**
 * Escapes the characters that are regex metacharacters wherever this prefix
 * is dropped into a `^prefix(.*)$` pattern (nginx `rewrite`, Apache
 * `RewriteRule`, Caddy `path_regexp` all build one). A literal "." or "+" in
 * a URL — both legal path characters — would otherwise be read as "any
 * character" or "one-or-more" by the regex engine, matching URLs the visitor
 * never listed.
 */
export function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ---------- nginx ---------- */

/**
 * nginx's config lexer treats an unescaped "$" as the start of a variable
 * name everywhere a value is read — including inside a `return` argument —
 * so a literal dollar sign in a URL has to be backslash-escaped or nginx
 * silently substitutes an (empty) variable for it instead of keeping the
 * character. Backslash comes first so escaping "$" cannot re-escape a
 * backslash the URL already had.
 */
function nginxEscapeChars(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\$/g, "\\$").replace(/"/g, '\\"');
}

/** Whitespace or ";" inside an nginx token ends it early (";" is nginx's directive terminator) unless the whole value is quoted. */
function nginxNeedsQuoting(raw: string): boolean {
  return /[\s";]/.test(raw);
}

export function escapeNginxValue(value: string): string {
  const escaped = nginxEscapeChars(value);
  return nginxNeedsQuoting(value) ? `"${escaped}"` : escaped;
}

export function generateNginx(rules: RedirectRule[], status: RedirectStatus): string {
  if (rules.length === 0) return "";

  // "permanent" and "redirect" are the two flags nginx's `rewrite` directive
  // accepts for a 301/302; `return 301|302` needs no flag at all, so the
  // exact-match branch below writes the status straight into `return`.
  const flag = status === 301 ? "permanent" : "redirect";

  const blocks = rules.map((rule) => {
    const wildcard = splitWildcard(rule.from);
    if (wildcard) {
      const pattern = `^${escapeRegExpLiteral(wildcard.prefix)}(.*)$`;
      const destWildcard = splitWildcard(rule.to);
      // "$1" is nginx's own capture-group backreference, appended after the
      // destination prefix is escaped — escaping the combined string
      // afterwards would turn this "$1" into a literal "\$1" and break the
      // substitution, so only the prefix the visitor typed goes through
      // `nginxEscapeChars`.
      const target = destWildcard
        ? `${nginxEscapeChars(destWildcard.prefix)}$1`
        : escapeNginxValue(rule.to);
      const quotedPattern = nginxNeedsQuoting(wildcard.prefix) ? `"${pattern}"` : pattern;
      const quotedTarget =
        destWildcard && nginxNeedsQuoting(destWildcard.prefix) ? `"${target}"` : target;
      return `rewrite ${quotedPattern} ${quotedTarget} ${flag};`;
    }

    return [
      `location = ${escapeNginxValue(rule.from)} {`,
      `    return ${status} ${escapeNginxValue(rule.to)};`,
      `}`,
    ].join("\n");
  });

  return blocks.join("\n\n");
}

/* ---------- Apache (.htaccess) ---------- */

/**
 * Apache's config parser splits a directive's arguments on whitespace and
 * treats an unescaped '"' as a quote delimiter, the same two rules nginx
 * uses — but Apache gives no meaning to "$" outside of a `RewriteRule`
 * substitution's own backreferences, so unlike nginx this escape never has
 * to touch it.
 */
function apacheEscapeChars(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function apacheNeedsQuoting(raw: string): boolean {
  return /\s|"/.test(raw);
}

export function escapeApacheValue(value: string): string {
  const escaped = apacheEscapeChars(value);
  return apacheNeedsQuoting(value) ? `"${escaped}"` : escaped;
}

export function generateApache(rules: RedirectRule[], status: RedirectStatus): string {
  if (rules.length === 0) return "";

  const wildcardRules = rules.filter(isWildcardRule);
  const exactRules = rules.filter((rule) => !isWildcardRule(rule));
  const lines: string[] = [];

  if (wildcardRules.length > 0) {
    // mod_rewrite patterns in a directory-scoped .htaccess match relative to
    // that directory, so a leading "/" in the pattern (as opposed to the
    // substitution target) would never match anything and is stripped.
    lines.push("RewriteEngine On");
    for (const rule of wildcardRules) {
      const wildcard = splitWildcard(rule.from);
      if (!wildcard) continue;
      const relativePrefix = wildcard.prefix.startsWith("/")
        ? wildcard.prefix.slice(1)
        : wildcard.prefix;
      const pattern = `^${escapeRegExpLiteral(relativePrefix)}(.*)$`;
      const destWildcard = splitWildcard(rule.to);
      // Same reasoning as nginx: "$1" is mod_rewrite's backreference and must
      // not go through the generic escaper, which would double its backslash.
      const target = destWildcard
        ? `${apacheEscapeChars(destWildcard.prefix)}$1`
        : escapeApacheValue(rule.to);
      lines.push(`RewriteRule ${pattern} ${target} [R=${status},L]`);
    }
  }

  for (const rule of exactRules) {
    // mod_alias's `Redirect` directive is the idiomatic form for a plain
    // path-to-path redirect and, unlike RewriteRule, needs no regex escaping.
    lines.push(`Redirect ${status} ${escapeApacheValue(rule.from)} ${escapeApacheValue(rule.to)}`);
  }

  return lines.join("\n");
}

/* ---------- Caddy (Caddyfile) ---------- */

function caddyEscapeChars(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function caddyNeedsQuoting(raw: string): boolean {
  return /\s|"/.test(raw);
}

export function escapeCaddyValue(value: string): string {
  const escaped = caddyEscapeChars(value);
  return caddyNeedsQuoting(value) ? `"${escaped}"` : escaped;
}

export function generateCaddy(rules: RedirectRule[], status: RedirectStatus): string {
  if (rules.length === 0) return "";

  const lines: string[] = [];
  rules.forEach((rule, index) => {
    const wildcard = splitWildcard(rule.from);
    if (wildcard) {
      // Caddy has no bare "*" path matcher with capture — the documented way
      // to carry the matched tail into the destination is a named
      // `path_regexp` matcher, referenced back as "{re.<name>.<group>}".
      // Unlike nginx/Apache's "$1", this placeholder shares no character
      // with Caddy's own escape set ('\' and '"'), so it can be concatenated
      // before escaping without needing to be protected from it.
      const name = `redir${index}`;
      const pattern = `^${escapeRegExpLiteral(wildcard.prefix)}(.*)$`;
      const quotedPattern = caddyNeedsQuoting(wildcard.prefix)
        ? `"${pattern.replace(/"/g, '\\"')}"`
        : pattern;
      lines.push(`@${name} path_regexp ${name} ${quotedPattern}`);

      const destWildcard = splitWildcard(rule.to);
      const target = destWildcard ? `${destWildcard.prefix}{re.${name}.1}` : rule.to;
      lines.push(`redir @${name} ${escapeCaddyValue(target)} ${status}`);
      return;
    }

    lines.push(`redir ${escapeCaddyValue(rule.from)} ${escapeCaddyValue(rule.to)} ${status}`);
  });

  return lines.join("\n");
}

/* ---------- Next.js (next.config.js `redirects()`) ---------- */

export function generateNextjs(rules: RedirectRule[], status: RedirectStatus): string {
  if (rules.length === 0) return "";

  const permanent = status === 301;

  const entries = rules.map((rule) => {
    const wildcard = splitWildcard(rule.from);
    let source = rule.from;
    let destination = rule.to;

    if (wildcard) {
      // Next.js has no bare "*" either — path-to-regexp's named
      // zero-or-more segment, ":path*", is the documented substitute, and it
      // only forwards into the destination when the same param name repeats
      // there.
      const destWildcard = splitWildcard(rule.to);
      source = `${wildcard.prefix}:path*`;
      destination = destWildcard ? `${destWildcard.prefix}:path*` : rule.to;
    }

    // `JSON.stringify` is the escape here — this value lands inside a JS
    // object literal, and it already knows how to quote every character
    // (space, `"`, backslash, control characters) that can appear in a URL.
    return `      { source: ${JSON.stringify(source)}, destination: ${JSON.stringify(destination)}, permanent: ${permanent} }`;
  });

  return [
    "/** @type {import('next').NextConfig} */",
    "module.exports = {",
    "  async redirects() {",
    "    return [",
    entries.join(",\n"),
    "    ];",
    "  },",
    "};",
  ].join("\n");
}

export function generateAll(
  rules: RedirectRule[],
  status: RedirectStatus,
): Record<OutputFormat, string> {
  return {
    nginx: generateNginx(rules, status),
    apache: generateApache(rules, status),
    caddy: generateCaddy(rules, status),
    nextjs: generateNextjs(rules, status),
  };
}
