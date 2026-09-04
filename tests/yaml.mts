import type { CheckSuite } from "./harness.mts";
import {
  extractFrontmatter,
  jsonToYaml,
  parseYaml,
  stringifyYaml,
  yamlToJson,
} from "../lib/yaml";

/** The converted value, or a marker object no expectation can match. */
function value(yaml: string): unknown {
  const result = yamlToJson(yaml);
  return result.ok ? result.value : { conversionFailed: result.error.message };
}

function warnings(yaml: string): string[] {
  const result = yamlToJson(yaml);
  return result.ok ? result.warnings.map((item) => item.text) : [];
}

function failure(yaml: string): { line: number; column: number; message: string } | null {
  const result = yamlToJson(yaml);
  return result.ok ? null : result.error;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const show = (a: unknown) => JSON.stringify(a);

export const checks: CheckSuite = (check) => {
  /* --- every supported scalar type in one document --- */
  {
    const got = value(
      ["ad: Camal", 'sitat: "iki: nokte"', "yas: 30", "nisbet: 1.5", "aktiv: true", "sonmus: false", "bos:", "yox: ~"].join("\n"),
    );
    check(
      "yaml: string, number, float, bool, empty and tilde resolve to their JSON types",
      same(got, {
        ad: "Camal",
        sitat: "iki: nokte",
        yas: 30,
        nisbet: 1.5,
        aktiv: true,
        sonmus: false,
        bos: null,
        yox: null,
      }),
      `got ${show(got)}`,
    );
  }

  /* --- lists, nesting, and the flush-with-the-key list every CI file uses --- */
  {
    const got = value(
      ["servis:", "  ad: veb", "  portlar:", "    - 80", "    - 443", "  etiketler:", "  - a", "  - b"].join("\n"),
    );
    check(
      "yaml: nested map, indented list and list flush with its key all parse",
      same(got, { servis: { ad: "veb", portlar: [80, 443], etiketler: ["a", "b"] } }),
      `got ${show(got)}`,
    );
  }

  {
    const got = value(["- ad: Ali", "  yas: 20", "- ad: Vali", "  yas: 30"].join("\n"));
    check(
      "yaml: compact mapping inside a sequence entry keeps both keys",
      same(got, [
        { ad: "Ali", yas: 20 },
        { ad: "Vali", yas: 30 },
      ]),
      `got ${show(got)}`,
    );
  }

  /* --- known reference 1: YAML 1.2 spec, Example 2.5 --- */
  {
    const got = value(
      ["- [name        , hr, avg]", "- [Mark McGwire, 65, 0.278]", "- [Sammy Sosa  , 63, 0.288]"].join("\n"),
    );
    check(
      "yaml: spec example 2.5 (sequence of flow sequences) matches the published result",
      same(got, [
        ["name", "hr", "avg"],
        ["Mark McGwire", 65, 0.278],
        ["Sammy Sosa", 63, 0.288],
      ]),
      `got ${show(got)}`,
    );
  }

  /* --- known reference 2: YAML 1.2 spec, Example 2.16 --- */
  {
    const got = value(
      [
        "name: Mark McGwire",
        "accomplishment: >",
        "  Mark set a major league",
        "  home run record in 1998.",
        "stats: |",
        "  65 Home Runs",
        "  0.278 Batting Average",
      ].join("\n"),
    );
    check(
      "yaml: spec example 2.16 folds and keeps the two block scalars as published",
      same(got, {
        name: "Mark McGwire",
        accomplishment: "Mark set a major league home run record in 1998.\n",
        stats: "65 Home Runs\n0.278 Batting Average\n",
      }),
      `got ${show(got)}`,
    );
  }

  /* --- block scalar chomping and the explicit indentation digit --- */
  {
    const clip = value(["a: |", "  bir", "  iki", "", "b: 1"].join("\n"));
    const strip = value(["a: |-", "  bir", "  iki", "", "b: 1"].join("\n"));
    const keep = value(["a: |+", "  bir", "", "", "b: 1"].join("\n"));
    const explicit = value(["a: |2", "    iki bosluq", "b: 1"].join("\n"));
    check(
      "yaml: clip, strip, keep and the indentation digit each end the block differently",
      same(clip, { a: "bir\niki\n", b: 1 }) &&
        same(strip, { a: "bir\niki", b: 1 }) &&
        same(keep, { a: "bir\n\n\n", b: 1 }) &&
        same(explicit, { a: "  iki bosluq\n", b: 1 }),
      `clip ${show(clip)} strip ${show(strip)} keep ${show(keep)} explicit ${show(explicit)}`,
    );
  }

  /* --- a tab in the indentation is refused, with the line it is on --- */
  {
    const error = failure("ad: x\n\tyas: 3");
    check(
      "yaml: a tab used as indentation fails on line 2 and says so",
      error !== null && error.line === 2 && error.message.includes("tab"),
      `got ${show(error)}`,
    );
  }

  /* --- YAML 1.2 core: yes/no/on/off are strings, and the visitor is told --- */
  {
    const got = value("a: yes\nb: no\nc: on\nd: off");
    const notes = warnings("a: yes\nb: no\nc: on\nd: off");
    check(
      "yaml: yes/no/on/off stay strings (1.2 core) and each raises a warning",
      same(got, { a: "yes", b: "no", c: "on", d: "off" }) && notes.length === 4,
      `got ${show(got)} with ${notes.length} warnings`,
    );
  }

  /* --- a leading zero is a string here, and 1.1 would have made it octal --- */
  {
    const got = value("kod: 01\nicaze: 0755\nadi: 10");
    const notes = warnings("kod: 01\nicaze: 0755\nadi: 10");
    check(
      "yaml: zero-prefixed numbers stay strings and warn, plain numbers do not",
      same(got, { kod: "01", icaze: "0755", adi: 10 }) && notes.length === 2,
      `got ${show(got)} with ${notes.length} warnings`,
    );
  }

  /* --- azerbaijani letters survive in keys, values and quoted text --- */
  {
    const got = value(['başlıq: Şəhər çiçəkləri', 'qeyd: "ölçü: 3 ədəd"', "günəş: İşıq"].join("\n"));
    check(
      "yaml: azerbaijani letters pass through keys, plain and quoted values",
      same(got, {
        "başlıq": "Şəhər çiçəkləri",
        qeyd: "ölçü: 3 ədəd",
        "günəş": "İşıq",
      }),
      `got ${show(got)}`,
    );
  }

  /* --- an empty document and an empty input are null, not a crash --- */
  {
    const empty = value("");
    const comments = value("# yalniz serh\n\n# ikinci");
    check(
      "yaml: empty input and a comments-only document both convert to null",
      empty === null && comments === null,
      `empty ${show(empty)} comments ${show(comments)}`,
    );
  }

  /* --- a colon inside quotes is text, a colon after a key is structure --- */
  {
    const got = value(['url: "http://camalali.com:8080/a?b=1"', "saat: 12:30", "acar: deyer: ikinci"].join("\n"));
    const notes = warnings("saat: 12:30");
    check(
      "yaml: a quoted colon stays in the value and 12:30 warns about 1.1 sexagesimals",
      same(got, {
        url: "http://camalali.com:8080/a?b=1",
        saat: "12:30",
        acar: "deyer: ikinci",
      }) && notes.length === 1,
      `got ${show(got)} with ${notes.length} warnings`,
    );
  }

  /* --- every construct outside the subset refuses by name --- */
  {
    const cases: [string, string, string][] = [
      ["anchor", "defaults: &def\n  a: 1", "Anchor"],
      ["alias", "b: *def", "Alias"],
      ["tag", "b: !!str 5", "Teq"],
      ["merge key", "a:\n  <<: *def", "<<"],
      ["complex key", "? [a, b]\n: 1", "açar"],
      ["directive", "%YAML 1.2\n---\na: 1", "Direktiv"],
      ["multi-line flow", "a: [1,\n  2]", "çoxsətirli"],
      ["multi-line quote", 'a: "acilib', "Dırnaq"],
      ["infinity", "a: .inf", "JSON"],
    ];
    const missed = cases.filter(([, yaml, needle]) => {
      const error = failure(yaml);
      return error === null || !error.message.includes(needle);
    });
    check(
      "yaml: anchor, alias, tag, merge, complex key, directive, split flow, split quote and .inf all refuse by name",
      missed.length === 0,
      `not refused clearly: ${missed.map(([label]) => label).join(", ")}`,
    );
  }

  /* --- a repeated key is data loss, so it stops rather than keeping one --- */
  {
    const error = failure("a: 1\nb: 2\na: 3");
    check(
      "yaml: a repeated key fails on the second one instead of silently dropping a value",
      error !== null && error.line === 3 && error.message.includes("Təkrarlanan"),
      `got ${show(error)}`,
    );
  }

  /* --- over-indentation is reported where the eye is looking --- */
  {
    const error = failure("a: 1\n   b: 2");
    check(
      "yaml: an over-indented key reports line 2 with the expected indentation",
      error !== null && error.line === 2 && error.message.includes("Girinti"),
      `got ${show(error)}`,
    );
  }

  /* --- flow collections, including the trailing comma the grammar allows --- */
  {
    const got = value("a: [1, 2, ]\nb: {x: 1, y: [2, 3]}\nc: []\nd: {}");
    const nospace = failure("a: {b:1}");
    check(
      "yaml: flow collections nest, tolerate a trailing comma, and {b:1} names the missing space",
      same(got, { a: [1, 2], b: { x: 1, y: [2, 3] }, c: [], d: {} }) &&
        nospace !== null &&
        nospace.message.includes("boşluq"),
      `got ${show(got)} nospace ${show(nospace)}`,
    );
  }

  /* --- several documents become an array; nothing is dropped --- */
  {
    const got = value("a: 1\n---\nb: 2\n---\n- 3");
    const single = yamlToJson("a: 1");
    check(
      "yaml: three documents come out as an array of three, one document stays itself",
      same(got, [{ a: 1 }, { b: 2 }, [3]]) && single.ok && single.documents === 1,
      `got ${show(got)}`,
    );
  }

  /* --- a file pasted from Windows must not carry CR into the text --- */
  {
    const got = value("ad: x\r\nmetn: |\r\n  bir\r\n  iki\r\n");
    check(
      "yaml: CRLF line endings leave no carriage return inside a block scalar",
      same(got, { ad: "x", metn: "bir\niki\n" }),
      `got ${show(got)}`,
    );
  }

  /* --- an id longer than 2^53 loses digits as a number, so it stays text --- */
  {
    const got = value("id: 12345678901234567890\nkicik: 9007199254740991");
    const notes = warnings("id: 12345678901234567890");
    check(
      "yaml: an integer past the safe range is kept as a string with a warning",
      same(got, { id: "12345678901234567890", kicik: 9007199254740991 }) && notes.length === 1,
      `got ${show(got)}`,
    );
  }

  /* --- the round trip is the promise the whole tool rests on --- */
  {
    const source = JSON.stringify({
      ad: "Cəmalı",
      siyahi: [1, "01", true, null, { ic: "dəyər" }],
      matris: [
        [1, 2],
        [3],
      ],
      metn: "birinci sətir\nikinci sətir\n",
      bosluqlu: "  kənarda boşluq  ",
      bos: "",
      "acar: iki nokteli": "#deyil-serh",
      "yes": "no",
      obyekt: {},
      massiv: [],
    });
    const yaml = jsonToYaml(source);
    const back = yaml.ok ? yamlToJson(yaml.output) : null;
    check(
      "yaml: JSON to YAML and back returns the identical document",
      yaml.ok && back !== null && back.ok && same(JSON.parse(source), back.value),
      yaml.ok ? `came back as ${back && back.ok ? show(back.value) : show(back)}` : "conversion failed",
    );
  }

  /* --- the emitter has to quote whatever would come back as another type --- */
  {
    const out = stringifyYaml({ a: "yes", b: "01", c: "", d: "- x", e: "true", f: "sade" });
    check(
      "yaml: the emitter quotes yes, 01, empty, dash and true, and leaves plain text alone",
      out === 'a: "yes"\nb: "01"\nc: ""\nd: "- x"\ne: "true"\nf: sade\n',
      `got ${show(out)}`,
    );
  }

  /* --- frontmatter: the header is read, the prose is not, lines still match --- */
  {
    const file = ["---", 'title: "Salam"', "tags: [a, b]", "---", "", "# Başlıq", "mətn"].join("\n");
    const split = extractFrontmatter(file);
    const converted = yamlToJson(split.frontmatter, "2", {
      source: file,
      lineOffset: split.lineOffset,
    });
    const broken = ["---", "title: A", "\ttag: b", "---", "gövdə"].join("\n");
    const brokenSplit = extractFrontmatter(broken);
    const brokenResult = yamlToJson(brokenSplit.frontmatter, "2", {
      source: broken,
      lineOffset: brokenSplit.lineOffset,
    });
    check(
      "yaml: frontmatter is split off, converted, and its error line counts from the whole file",
      split.status === "found" &&
        converted.ok &&
        same(converted.value, { title: "Salam", tags: ["a", "b"] }) &&
        !brokenResult.ok &&
        brokenResult.error.line === 3,
      `status ${split.status} value ${converted.ok ? show(converted.value) : "-"} broken line ${
        brokenResult.ok ? "none" : brokenResult.error.line
      }`,
    );
  }

  /* --- a file with no header is reported as such, not parsed as YAML --- */
  {
    const none = extractFrontmatter("# Başlıq\nmətn");
    const open = extractFrontmatter("---\ntitle: A\nmətn");
    check(
      "yaml: a missing and an unclosed frontmatter block are told apart",
      none.status === "missing" && open.status === "unterminated",
      `none ${none.status} open ${open.status}`,
    );
  }

  /* --- a document deeper than the guard stops instead of blowing the stack --- */
  {
    const deep = Array.from({ length: 260 }, (_, k) => `${" ".repeat(k * 2)}a${k === 259 ? ": 1" : ":"}`).join("\n");
    const error = failure(deep);
    check(
      "yaml: nesting past the depth guard fails with a message instead of a stack overflow",
      error !== null && error.message.includes("200"),
      `got ${show(error)}`,
    );
  }

  /* --- a __proto__ key is data, not a way into the prototype --- */
  {
    const parsed = parseYaml("__proto__: 1\nb: 2");
    const document = parsed.ok ? parsed.documents[0] : null;
    /* Written as text rather than as an object literal on purpose: an object
       literal with a `__proto__` key sets the prototype instead of a property,
       which is the very confusion this case exists to rule out. On an ordinary
       object the assignment would be dropped and the key lost. */
    check(
      "yaml: a __proto__ key becomes an ordinary property instead of being lost",
      document !== null &&
        show(document) === '{"__proto__":1,"b":2}' &&
        Object.prototype.hasOwnProperty.call(document, "__proto__"),
      `got ${show(document)}`,
    );
  }

  /* --- comments are structure to a parser and noise to the result --- */
  {
    const got = value(["# ust serh", "ad: Camal # yan serh", "", "# ara serh", "yas: 3", "metn: 'a # b'"].join("\n"));
    check(
      "yaml: comments are removed everywhere except inside a quoted value",
      same(got, { ad: "Camal", yas: 3, metn: "a # b" }),
      `got ${show(got)}`,
    );
  }
};
