/*
 * Redirect generator checks. The load-bearing risk here is escaping — a
 * character each format's own grammar treats specially (space, quote, `$`,
 * `;`) has to survive into a config that still parses, and a wildcard rule
 * has to translate into each format's own backreference/placeholder syntax
 * correctly. Both are exercised across all four formats below.
 */
import type { CheckSuite } from "./harness.mts";
import {
  escapeRegExpLiteral,
  generateApache,
  generateCaddy,
  generateNextjs,
  generateNginx,
  normalizeTrailingSlash,
  parseRedirectInput,
  type RedirectRule,
} from "../lib/yonlendirme";

const pair = (from: string, to: string): RedirectRule[] => [{ from, to }];

export const checks: CheckSuite = (check) => {
  // ---------- simple pair, one per format ----------
  check(
    "yonlendirme: nginx sade cut - melum cixis",
    generateNginx(pair("/kohne", "/yeni"), 301) ===
      "location = /kohne {\n    return 301 /yeni;\n}",
    `alindi ${JSON.stringify(generateNginx(pair("/kohne", "/yeni"), 301))}`,
  );
  check(
    "yonlendirme: apache sade cut - melum cixis",
    generateApache(pair("/kohne", "/yeni"), 301) === "Redirect 301 /kohne /yeni",
    `alindi ${JSON.stringify(generateApache(pair("/kohne", "/yeni"), 301))}`,
  );
  check(
    "yonlendirme: caddy sade cut - melum cixis",
    generateCaddy(pair("/kohne", "/yeni"), 301) === "redir /kohne /yeni 301",
    `alindi ${JSON.stringify(generateCaddy(pair("/kohne", "/yeni"), 301))}`,
  );
  check(
    "yonlendirme: nextjs sade cut - source/destination/permanent gorunur",
    generateNextjs(pair("/kohne", "/yeni"), 301).includes(
      'source: "/kohne", destination: "/yeni", permanent: true',
    ),
    `alindi ${generateNextjs(pair("/kohne", "/yeni"), 301)}`,
  );

  // ---------- wildcard, one per format ----------
  check(
    "yonlendirme: nginx joker - regex ve $1 geri istinadi",
    generateNginx(pair("/bloq/*", "/yazi/*"), 301) === "rewrite ^/bloq/(.*)$ /yazi/$1 permanent;",
    `alindi ${JSON.stringify(generateNginx(pair("/bloq/*", "/yazi/*"), 301))}`,
  );
  {
    const output = generateApache(pair("/bloq/*", "/yazi/*"), 301);
    check(
      "yonlendirme: apache joker - RewriteEngine ve $1 geri istinadi",
      output.includes("RewriteEngine On") &&
        output.includes("RewriteRule ^bloq/(.*)$ /yazi/$1 [R=301,L]"),
      `alindi ${output}`,
    );
  }
  {
    const output = generateCaddy(pair("/bloq/*", "/yazi/*"), 301);
    check(
      "yonlendirme: caddy joker - path_regexp matcher ve {re.} yerdeyisen",
      output.includes("path_regexp") && output.includes("{re.redir0.1}"),
      `alindi ${output}`,
    );
  }
  {
    const output = generateNextjs(pair("/bloq/*", "/yazi/*"), 301);
    check(
      "yonlendirme: nextjs joker - :path* parametri her iki terefde",
      output.includes('source: "/bloq/:path*"') && output.includes('destination: "/yazi/:path*"'),
      `alindi ${output}`,
    );
  }

  // ---------- query string in the target survives untouched ----------
  {
    const rules = pair("/kohne", "/yeni?ref=kohne");
    const nginxOut = generateNginx(rules, 301);
    const apacheOut = generateApache(rules, 301);
    const caddyOut = generateCaddy(rules, 301);
    const nextjsOut = generateNextjs(rules, 301);
    check(
      "yonlendirme: sorgu setri hedefde her 4 formatda qorunur",
      nginxOut.includes("/yeni?ref=kohne") &&
        apacheOut.includes("/yeni?ref=kohne") &&
        caddyOut.includes("/yeni?ref=kohne") &&
        nextjsOut.includes("/yeni?ref=kohne"),
      `nginx=${nginxOut} apache=${apacheOut} caddy=${caddyOut} nextjs=${nextjsOut}`,
    );
  }

  // ---------- special characters: space and quote need per-format escaping ----------
  {
    const rules = pair('/kohne yer "qeyd"', "/yeni");
    const nginxOut = generateNginx(rules, 301);
    const apacheOut = generateApache(rules, 301);
    check(
      "yonlendirme: bosluqlu ve dirnaqli URL nginx-de dirnaqlanir ve qaciriliir",
      nginxOut.includes('"/kohne yer \\"qeyd\\""'),
      `alindi ${nginxOut}`,
    );
    check(
      "yonlendirme: bosluqlu ve dirnaqli URL apache-de dirnaqlanir ve qaciriliir",
      apacheOut.includes('"/kohne yer \\"qeyd\\""'),
      `alindi ${apacheOut}`,
    );
  }

  // ---------- dollar sign: nginx must escape it, apache must not ----------
  {
    const rules = pair("/kohne", "/yeni$dollar");
    const nginxOut = generateNginx(rules, 301);
    const apacheOut = generateApache(rules, 301);
    check(
      "yonlendirme: dollar isareti nginx-de \\$ kimi qaciriliir",
      nginxOut.includes("/yeni\\$dollar"),
      `alindi ${nginxOut}`,
    );
    check(
      "yonlendirme: dollar isareti apache-de xüsusi menasi olmadigi ucun deyismir",
      apacheOut.includes("/yeni$dollar"),
      `alindi ${apacheOut}`,
    );
  }

  // ---------- blank input ----------
  {
    const result = parseRedirectInput("");
    check(
      "yonlendirme: bos giris - sifir qayda, sifir xeta",
      result.rules.length === 0 && result.errors.length === 0,
      `alindi ${JSON.stringify(result)}`,
    );
    check(
      "yonlendirme: bos qayda siyahisi her formatda bos setir verir",
      generateNginx([], 301) === "" &&
        generateApache([], 301) === "" &&
        generateCaddy([], 301) === "" &&
        generateNextjs([], 301) === "",
      "bir format bos setirden basqa sey qaytardi",
    );
  }

  // ---------- one-sided line: a clear, structured error ----------
  {
    const result = parseRedirectInput("/tek-teref");
    check(
      "yonlendirme: yalniz bir terefi olan setir aydin xeta verir",
      result.rules.length === 0 &&
        result.errors.length === 1 &&
        result.errors[0].line === 1 &&
        result.errors[0].message.includes("Yalnız bir tərəf"),
      `alindi ${JSON.stringify(result)}`,
    );
  }

  // ---------- 301 vs 302 differ in every format's output ----------
  {
    const rules = pair("/kohne", "/yeni");
    check(
      "yonlendirme: nginx 301 ve 302 cixisi ferqlidir",
      generateNginx(rules, 301) !== generateNginx(rules, 302) &&
        generateNginx(rules, 302).includes("return 302"),
      `301=${generateNginx(rules, 301)} 302=${generateNginx(rules, 302)}`,
    );
    check(
      "yonlendirme: apache 301 ve 302 cixisi ferqlidir",
      generateApache(rules, 301) !== generateApache(rules, 302) &&
        generateApache(rules, 302).includes("Redirect 302"),
      `301=${generateApache(rules, 301)} 302=${generateApache(rules, 302)}`,
    );
    check(
      "yonlendirme: nextjs 301 ve 302 permanent bayragini deyisir",
      generateNextjs(rules, 301).includes("permanent: true") &&
        generateNextjs(rules, 302).includes("permanent: false"),
      `301=${generateNextjs(rules, 301)} 302=${generateNextjs(rules, 302)}`,
    );
  }

  // ---------- full URL target (redirect to another domain) passes through ----------
  {
    const rules = pair("/kohne", "https://yeni-sayt.com/salam?ref=x");
    const nginxOut = generateNginx(rules, 301);
    const nextjsOut = generateNextjs(rules, 301);
    check(
      "yonlendirme: basqa domene tam URL deyismeden kecir",
      nginxOut.includes("https://yeni-sayt.com/salam?ref=x") &&
        nextjsOut.includes('"https://yeni-sayt.com/salam?ref=x"'),
      `nginx=${nginxOut} nextjs=${nextjsOut}`,
    );
  }

  // ---------- normalizeTrailingSlash: known reference values ----------
  check(
    "yonlendirme: sondaki / silinir - /kohne/ -> /kohne",
    normalizeTrailingSlash("/kohne/") === "/kohne",
    `alindi ${normalizeTrailingSlash("/kohne/")}`,
  );
  check(
    "yonlendirme: kok / deyismir",
    normalizeTrailingSlash("/") === "/",
    `alindi ${normalizeTrailingSlash("/")}`,
  );
  check(
    "yonlendirme: joker sonu * oldugu ucun deyismir",
    normalizeTrailingSlash("/bloq/*") === "/bloq/*",
    `alindi ${normalizeTrailingSlash("/bloq/*")}`,
  );

  // ---------- regex-escape: known reference value ----------
  check(
    "yonlendirme: regex metaharflerin qaciriliimasi - melum qiymet",
    escapeRegExpLiteral("a.b+c") === "a\\.b\\+c",
    `alindi ${escapeRegExpLiteral("a.b+c")}`,
  );
};
