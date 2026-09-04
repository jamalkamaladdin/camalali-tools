/*
 * The zone file parser and builder, proven against text fixtures rather than
 * a nameserver — this tool never talks to one, so its whole correctness is
 * this file: parsing must read a well-formed zone the way BIND would, and
 * `parseZoneFile(buildZoneFile(records))` must return the same records it
 * started from, or the tool would silently corrupt whatever a visitor pastes
 * through it.
 */
import type { CheckSuite } from "./harness.mts";
import {
  buildZoneFile,
  parseZoneFile,
  splitTxtChunks,
  tokenizeLogical,
  type SoaRecord,
} from "../lib/zone-fayl";

const FIXTURE = `
$ORIGIN example.com.
$TTL 3600
@       IN SOA  ns1.example.com. hostmaster.example.com. (
                2026090401 ; serial
                3600       ; refresh
                900        ; retry
                1209600    ; expire
                300 )      ; minimum
@       IN NS   ns1.example.com.
@       IN A    93.184.216.34
www     IN CNAME @
mail    600 IN A 93.184.216.35
        IN MX 10 mail.example.com.
`;

export const checks: CheckSuite = (check) => {
  /* ---- a well-formed zone ---- */

  const parsed = parseZoneFile(FIXTURE);

  check(
    "zone-fayl: alti qeyd ve direktivler duzgun oxunur, xeta yoxdur",
    parsed.origin === "example.com." &&
      parsed.ttl === 3600 &&
      parsed.records.length === 6 &&
      parsed.issues.length === 0,
    `alindi origin=${parsed.origin} ttl=${parsed.ttl} qeyd=${parsed.records.length} issues=${JSON.stringify(parsed.issues)}`,
  );

  {
    const soa = parsed.records[0] as SoaRecord;
    check(
      "zone-fayl: mötərizeli cox setirli SOA tek qeyd kimi birlesir",
      soa.type === "SOA" && soa.serial === 2026090401 && soa.refresh === 3600 && soa.minimum === 300,
      `alindi ${JSON.stringify(soa)}`,
    );
  }

  check(
    "zone-fayl: ad yazilmayan sətir evvelki addan miras alir",
    parsed.records[5].name === "mail" && parsed.records[5].type === "MX" && parsed.records[5].ttl === null,
    `alindi ${JSON.stringify(parsed.records[5])}`,
  );

  /* ---- round trip ---- */

  {
    const rebuilt = buildZoneFile(parsed.records, { origin: parsed.origin, ttl: parsed.ttl });
    const reparsed = parseZoneFile(rebuilt);
    check(
      "zone-fayl: parse->qur->parse eyni qeydleri qaytarir",
      JSON.stringify(reparsed.records) === JSON.stringify(parsed.records) && reparsed.issues.length === 0,
      `alindi ${rebuilt}`,
    );
  }

  /* ---- validations ---- */

  {
    const result = parseZoneFile('dup IN CNAME target.example.com.\ndup IN TXT "hello"\n');
    check(
      "zone-fayl: CNAME basqa qeydle yanasi olanda xeta verir",
      result.issues.some((issue) => issue.severity === "xeta" && issue.message.includes("CNAME") && issue.message.includes("dup")),
      `alindi ${JSON.stringify(result.issues)}`,
    );
  }

  {
    const result = parseZoneFile("bad IN MX ten mail.example.com.\n");
    check(
      "zone-fayl: MX prioriteti tam eded olmayanda qeyd atilir, throw olmur",
      result.records.length === 0 && result.issues.some((issue) => issue.severity === "xeta" && issue.message.includes("MX")),
      `alindi ${JSON.stringify(result)}`,
    );
  }

  {
    const result = parseZoneFile(`over IN TXT "${"a".repeat(300)}"\n`);
    check(
      "zone-fayl: 255 baytdan uzun tek TXT sətri xeberdarliq alir, yene de saxlanilir",
      result.records.length === 1 &&
        result.issues.some((issue) => issue.severity === "xeberdarliq" && issue.message.includes("300 bayt")),
      `alindi ${JSON.stringify(result.issues)}`,
    );
  }

  {
    const built = buildZoneFile([{ type: "TXT", name: "long", ttl: null, value: "b".repeat(300) }]);
    const reparsed = parseZoneFile(built);
    check(
      "zone-fayl: qurucu 300 baytliq TXT-i qaydaya uygun bolur, geri oxuyanda deyer eyni qalir",
      reparsed.records.length === 1 &&
        (reparsed.records[0] as { value: string }).value === "b".repeat(300) &&
        !reparsed.issues.some((issue) => issue.severity === "xeberdarliq"),
      `alindi ${built}`,
    );
  }

  {
    const result = parseZoneFile("@ IN SOA ns1.example.com. host.example.com. 4294967296 3600 900 1209600 300\n");
    check(
      "zone-fayl: 32 bit heddini asan SOA seriyasi xeta verir",
      result.records.length === 0 && result.issues.some((issue) => issue.message.includes("aralığından kənardır")),
      `alindi ${JSON.stringify(result.issues)}`,
    );
  }

  {
    const result = parseZoneFile("@ IN SOA ns1.example.com. host.example.com. 12345 3600 900 1209600 300\n");
    check(
      "zone-fayl: konvensiyaya uymayan SOA seriyasi qeyd kimi bildirilir, xeta sayilmir",
      result.records.length === 1 && result.issues.some((issue) => issue.severity === "melumat"),
      `alindi ${JSON.stringify(result.issues)}`,
    );
  }

  {
    const result = parseZoneFile("weird IN FOO bar\n");
    check(
      "zone-fayl: naməlum qeyd tipi xeta verir, throw olmur",
      result.records.length === 0 && result.issues.some((issue) => issue.message.includes("FOO")),
      `alindi ${JSON.stringify(result.issues)}`,
    );
  }

  check(
    "zone-fayl: dirnaq icindeki nöqtəli-vergül serh kimi kesilmir",
    parseZoneFile('note IN TXT "value with ; semicolon inside"\n').records[0]?.type === "TXT" &&
      (parseZoneFile('note IN TXT "value with ; semicolon inside"\n').records[0] as { value: string }).value ===
        "value with ; semicolon inside",
    "dirnaq daxili nöqtəli-vergül sehven kesildi",
  );

  /* ---- tokenising ---- */

  check(
    "zone-fayl: dirnaqli hisse ferqli sozlerle bir token qalir",
    (() => {
      const tokens = tokenizeLogical('CAA 0 issue "letsencrypt.org; extra"');
      return tokens.length === 4 && tokens[3] === '"letsencrypt.org; extra"';
    })(),
    `alindi ${JSON.stringify(tokenizeLogical('CAA 0 issue "letsencrypt.org; extra"'))}`,
  );

  check(
    "zone-fayl: 255 bayt sinirinda bolunmur, 256-da bolunur",
    splitTxtChunks("a".repeat(255)).length === 1 && splitTxtChunks("a".repeat(256)).length === 2,
    `alindi ${splitTxtChunks("a".repeat(255)).length} / ${splitTxtChunks("a".repeat(256)).length}`,
  );
};
