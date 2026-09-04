/*
 * What is actually at risk in a SQL formatter is not the layout — a wrong
 * indent is visible — but the two places where a naive implementation
 * silently rewrites text it was supposed to carry: inside string literals and
 * inside comments. Those come first below. After them sit the cases that make
 * the output untrustworthy in a different way: a round trip that does not
 * settle, a keyword recased when it was a column name, and a literal the
 * lexer never closes.
 */
import type { CheckSuite } from "./harness.mts";
import {
  DEFAULT_SQL_OPTIONS,
  formatSql,
  minifySql,
  tokenizeSql,
  type SqlFormatOptions,
} from "../lib/sql";

function format(source: string, options: Partial<SqlFormatOptions> = {}): string | null {
  const result = formatSql(source, { ...DEFAULT_SQL_OPTIONS, ...options });
  return result.ok ? result.output : null;
}

function minify(source: string, options: Partial<SqlFormatOptions> = {}): string | null {
  const result = minifySql(source, { ...DEFAULT_SQL_OPTIONS, ...options });
  return result.ok ? result.output : null;
}

export const checks: CheckSuite = (check) => {
  /* ---------- the trap: literals and comments are carried, not read ---------- */

  const inString = format("select a from t where note = 'select * from users'");
  check(
    "sql: setir deyerindeki acar soz toxunulmaz qalir",
    inString !== null && inString.includes("'select * from users'"),
    `alindi ${JSON.stringify(inString)}`,
  );

  const doubled = format("select 'it''s' as a from t");
  check(
    "sql: setirdeki qosa dirnaq (it''s) setiri baglamir",
    doubled !== null && doubled.includes("'it''s'") && doubled.includes("AS a"),
    `alindi ${JSON.stringify(doubled)}`,
  );

  const backslash = format("select 'it\\'s' as a from t");
  check(
    "sql: mysql tersli qacis (it\\'s) setiri baglamir",
    backslash !== null && backslash.includes("'it\\'s'"),
    `alindi ${JSON.stringify(backslash)}`,
  );

  const lineComment = format("select a -- select from where\nfrom t");
  check(
    "sql: setir serhindeki acar sozler formatlanmir",
    lineComment !== null && lineComment.includes("-- select from where"),
    `alindi ${JSON.stringify(lineComment)}`,
  );

  const lineCommentEnds = format("select a, -- qeyd\nb from t");
  check(
    "sql: setir serhinden sonra setir mutleq bitir",
    lineCommentEnds !== null && /-- qeyd\n/.test(lineCommentEnds),
    `alindi ${JSON.stringify(lineCommentEnds)}`,
  );

  const blockComment = format("select /* order by id */ a from t");
  check(
    "sql: blok serhi oldugu kimi kocurulur",
    blockComment !== null && blockComment.includes("/* order by id */"),
    `alindi ${JSON.stringify(blockComment)}`,
  );

  const azString = format("select * from t where ad = 'Şəhər ölçüsü ığ İç'");
  check(
    "sql: azerbaycan herfli setir deyeri pozulmur",
    azString !== null && azString.includes("'Şəhər ölçüsü ığ İç'"),
    `alindi ${JSON.stringify(azString)}`,
  );

  const quotedName = format('select "select", `from` from t');
  check(
    "sql: dirnaqli ad acar soz kimi qebul edilmir",
    quotedName !== null &&
      quotedName.includes('"select"') &&
      quotedName.includes("`from`"),
    `alindi ${JSON.stringify(quotedName)}`,
  );

  /* ---------- layout against a hand-written reference ---------- */

  const joined = format(
    "select u.id, u.name from users u inner join orders o on o.user_id = u.id where u.aktiv = true and o.mebleg > 10",
  );
  const joinedExpected = [
    "SELECT",
    "  u.id,",
    "  u.name",
    "FROM users u",
    "INNER JOIN orders o",
    "  ON o.user_id = u.id",
    "WHERE u.aktiv = TRUE",
    "  AND o.mebleg > 10",
  ].join("\n");
  check(
    "sql: join/on/and etalon yerlesimi ile ust-uste dusur",
    joined === joinedExpected,
    `alindi ${JSON.stringify(joined)}`,
  );

  const nested = format("select id from t where id in (select user_id from bans where aktiv = true)");
  const nestedExpected = [
    "SELECT",
    "  id",
    "FROM t",
    "WHERE id IN (",
    "  SELECT",
    "    user_id",
    "  FROM bans",
    "  WHERE aktiv = TRUE",
    ")",
  ].join("\n");
  check(
    "sql: ic-ice sorgu girintili ve baglayici mote'rize oz setrinde",
    nested === nestedExpected,
    `alindi ${JSON.stringify(nested)}`,
  );

  const caseWhen = format(
    "select case when a > 1 then 'cox' else 'az' end as olcu from t",
    { indent: "4" },
  );
  const caseExpected = [
    "SELECT",
    "    CASE",
    "        WHEN a > 1 THEN 'cox'",
    "        ELSE 'az'",
    "    END AS olcu",
    "FROM t",
  ].join("\n");
  check(
    "sql: case/when/else/end pillesi 4 bosluqla etalona uygundur",
    caseWhen === caseExpected,
    `alindi ${JSON.stringify(caseWhen)}`,
  );

  const between = format("select a from t where b between 1 and 10 and c = 2");
  check(
    "sql: between-in and-i setir basina kecmir, serti ayiran and kecir",
    between !== null &&
      between.includes("BETWEEN 1 AND 10") &&
      /\n\s+AND c = 2/.test(between),
    `alindi ${JSON.stringify(between)}`,
  );

  /* ---------- round trip ---------- */

  const source =
    "select u.id, coalesce(u.ad, 'yoxdur') as ad, case when u.yas > 18 then 'boyuk' else 'usaq' end as qrup " +
    "from users u left join orders o on o.user_id = u.id -- qeyd\n" +
    "where u.ad like '%from%' and u.yas between 1 and 99 group by u.id, u.ad order by u.id desc limit 5";
  const once = format(source);
  const cycled = once === null ? null : format(minify(once) ?? "");
  check(
    "sql: formatla -> sixisdir -> formatla eyni neticeni verir",
    once !== null && cycled === once,
    `ferq var: ${JSON.stringify(cycled)}`,
  );

  const twice = once === null ? null : format(once);
  check(
    "sql: ikinci defe formatlamaq neticeni deyismir",
    once !== null && twice === once,
    `ferq var: ${JSON.stringify(twice)}`,
  );

  const minified = minify("select  a ,\n  b\nfrom   t\nwhere a = 1");
  check(
    "sql: sixisdirma tek setir verir",
    minified === "SELECT a, b FROM t WHERE a = 1",
    `alindi ${JSON.stringify(minified)}`,
  );

  const minifiedComment = minify("select a -- qeyd\nfrom t");
  check(
    "sql: sixisdirmada setir serhinden sonra setir sonu saxlanilir",
    minifiedComment === "SELECT a -- qeyd\nFROM t",
    `alindi ${JSON.stringify(minifiedComment)}`,
  );

  /* ---------- keyword casing ---------- */

  const lower = format("SELECT Ad FROM Istifadeciler WHERE Id = 1", { keywordCase: "lower" });
  check(
    "sql: kicik herf rejimi yalniz acar sozlere tetbiq olunur",
    lower === "select\n  Ad\nfrom Istifadeciler\nwhere Id = 1",
    `alindi ${JSON.stringify(lower)}`,
  );

  const preserved = format("SeLeCt a FrOm t", { keywordCase: "preserve" });
  check(
    "sql: saxla rejimi herf boyuklugune toxunmur",
    preserved === "SeLeCt\n  a\nFrOm t",
    `alindi ${JSON.stringify(preserved)}`,
  );

  const countColumn = format("select count from stats");
  const countCall = format("select count(*) from stats");
  check(
    "sql: count sutun adidir, count( ise funksiyadir",
    countColumn !== null &&
      countColumn.includes("  count") &&
      countCall !== null &&
      countCall.includes("COUNT(*)"),
    `alindi ${JSON.stringify(countColumn)} / ${JSON.stringify(countCall)}`,
  );

  const leftCall = format("select left(ad, 3) from t");
  check(
    "sql: left( funksiyasi join kimi setire bolunmur",
    leftCall !== null && leftCall.includes("LEFT(ad, 3)") && !leftCall.includes("\nLEFT"),
    `alindi ${JSON.stringify(leftCall)}`,
  );

  const groupColumn = format("select id from t order by id");
  check(
    "sql: order by cut kimi taninir",
    groupColumn === "SELECT\n  id\nFROM t\nORDER BY id",
    `alindi ${JSON.stringify(groupColumn)}`,
  );

  /* ---------- edge cases ---------- */

  const empty = formatSql("", DEFAULT_SQL_OPTIONS);
  check(
    "sql: bos giris bos netice ve sifir ifade verir",
    empty.ok && empty.output === "" && empty.stats.statements === 0,
    `alindi ${JSON.stringify(empty)}`,
  );

  const onlyComment = formatSql("-- yalniz qeyd", DEFAULT_SQL_OPTIONS);
  check(
    "sql: yalniz serh ifade sayilmir",
    onlyComment.ok &&
      onlyComment.output === "-- yalniz qeyd" &&
      onlyComment.stats.statements === 0 &&
      onlyComment.stats.comments === 1,
    `alindi ${JSON.stringify(onlyComment)}`,
  );

  const unterminated = formatSql("select 'acik qaldi from t", DEFAULT_SQL_OPTIONS);
  check(
    "sql: baglanmamis setir deyeri xeta kimi qaytarilir",
    !unterminated.ok && unterminated.error.line === 1 && unterminated.error.column === 8,
    `alindi ${JSON.stringify(unterminated)}`,
  );

  const unterminatedBlock = formatSql("select a /* acik\nfrom t", DEFAULT_SQL_OPTIONS);
  check(
    "sql: baglanmamis blok serhi xeta kimi qaytarilir",
    !unterminatedBlock.ok && unterminatedBlock.error.line === 1,
    `alindi ${JSON.stringify(unterminatedBlock)}`,
  );

  const dollar = format("create function f() returns text as $$ select 'it''s -- not a comment' $$ language sql");
  check(
    "sql: dollar dirnaqli govde bir token kimi saxlanilir",
    dollar !== null && dollar.includes("$$ select 'it''s -- not a comment' $$"),
    `alindi ${JSON.stringify(dollar)}`,
  );

  const twoStatements = formatSql(
    "select a from t; select b from u;",
    DEFAULT_SQL_OPTIONS,
  );
  check(
    "sql: iki ifade sayilir ve aralarinda bos setir qalir",
    twoStatements.ok &&
      twoStatements.stats.statements === 2 &&
      twoStatements.output.includes(";\n\nSELECT"),
    `alindi ${JSON.stringify(twoStatements)}`,
  );

  const deep = formatSql(
    "select a from (select b from (select c from t) x) y",
    DEFAULT_SQL_OPTIONS,
  );
  check(
    "sql: maks. yuva derinliyi olculur",
    deep.ok && deep.stats.maxDepth === 2,
    `alindi ${JSON.stringify(deep.ok ? deep.stats : deep)}`,
  );

  const signs = format("select -1, a - 1 from t");
  check(
    "sql: menfi reqem ile cixma emeliyyati ayird edilir",
    signs !== null && signs.includes("-1,") && signs.includes("a - 1"),
    `alindi ${JSON.stringify(signs)}`,
  );

  const insertSpacing = format("insert into t (a, b) values (1, 2)");
  check(
    "sql: cedvel adindan sonraki bosluq saxlanilir, funksiya adindan sonraki yox",
    insertSpacing === "INSERT INTO t (a, b)\nVALUES (1, 2)",
    `alindi ${JSON.stringify(insertSpacing)}`,
  );

  const tokens = tokenizeSql("select 'a' /* c */ -- d\nfrom t");
  check(
    "sql: leksik tehlil serh ve setir tokenlerini ayrica sayir",
    tokens.ok &&
      tokens.tokens.filter((token) => token.type === "blockComment").length === 1 &&
      tokens.tokens.filter((token) => token.type === "lineComment").length === 1 &&
      tokens.tokens.filter((token) => token.type === "string").length === 1,
    `alindi ${tokens.ok ? tokens.tokens.length : "xeta"}`,
  );

  const tabIndent = format("select a, b from t", { indent: "tab" });
  check(
    "sql: tab girintisi secilende sutunlar tab ile girintilenir",
    tabIndent === "SELECT\n\ta,\n\tb\nFROM t",
    `alindi ${JSON.stringify(tabIndent)}`,
  );
};
