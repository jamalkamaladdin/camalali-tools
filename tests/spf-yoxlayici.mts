/*
 * The SPF expander's arithmetic, checked with a fake resolver — no DNS
 * involved anywhere in this file.
 *
 * Everything here is a plain domain-to-TXT-records lookup table, which is
 * exactly the seam `expandSpf` was built around: it takes the resolver as a
 * parameter rather than reaching for `node:dns` itself, so the recursion,
 * the cycle guard, the two caps and every finding can be proven against
 * known-answer fixtures instead of a live zone that could change under the
 * test.
 *
 * `CheckSuite` is a synchronous `(check) => void`, and `verify-tools.mts`
 * calls it without awaiting — so the async work happens at module load time
 * instead, via top-level await (`.mts` is always ESM, which supports it).
 * The dynamic `import()` that loads this file already awaits the whole
 * module body, `check()` calls included, so every fixture below is fully
 * resolved before the exported `checks` function ever runs.
 */
import type { CheckSuite } from "./harness.mts";
import { expandSpf, type SpfResolver } from "../lib/spf-yoxlayici";

/* One shared table for every fixture that does not need to be endless. Each
   entry is exactly what `resolver.resolveTxt` would return: one array per
   TXT record, each an array of that record's own chunks. */
const RECORDS: Record<string, string[][]> = {
  "ip4only.example": [["v=spf1 ip4:1.2.3.4 -all"]],
  "threeterm.example": [["v=spf1 a mx include:x.example -all"]],
  "x.example": [["v=spf1 -all"]],
  "level0.example": [["v=spf1 include:level1.example -all"]],
  "level1.example": [["v=spf1 include:level2.example -all"]],
  "level2.example": [["v=spf1 a -all"]],
  "ten.example": [["v=spf1 a a a a a a a a a a -all"]],
  "eleven.example": [["v=spf1 a a a a a a a a a a a -all"]],
  "a.loop": [["v=spf1 include:b.loop -all"]],
  "b.loop": [["v=spf1 include:a.loop -all"]],
  "dupe.example": [["v=spf1 -all"], ["v=spf1 a -all"]],
  "plusall.example": [["v=spf1 +all"]],
  "minusall.example": [["v=spf1 -all"]],
  "noall.example": [["v=spf1 include:sub.example"]],
  "sub.example": [["v=spf1 -all"]],
  "ptrtest.example": [["v=spf1 ptr -all"]],
  "redirtest.example": [["v=spf1 redirect=other.example -all"]],
  "chunktest.example": [["v=spf1 inc", "lude:x.example -all"]],
  /* v1/v2/v3.example are deliberately absent — an empty answer for a domain
     nobody defined is exactly the "void lookup" RFC 7208 §4.6.4 counts. */
  "voidtest.example": [["v=spf1 include:v1.example include:v2.example include:v3.example -all"]],
  "badterm.example": [["v=spf1 frobnicate -all"]],
};

const staticResolver: SpfResolver = (domain) => RECORDS[domain.toLowerCase()] ?? [];

/* An include chain with no natural end, for the depth cap and the query
   budget — each one is given a small enough limit to hit its own cap long
   before reaching this ceiling, so the two tests stay isolated from each
   other and from the fixture's own length. */
const CHAIN_CEILING = 20;
const chainResolver: SpfResolver = (domain) => {
  const match = /^d(\d+)\.chain$/.exec(domain);
  if (!match) return [];
  const level = Number(match[1]);
  if (level >= CHAIN_CEILING) return [["v=spf1 -all"]];
  return [[`v=spf1 include:d${level + 1}.chain -all`]];
};

const ip4Only = await expandSpf("ip4only.example", staticResolver);
const threeTerm = await expandSpf("threeterm.example", staticResolver);
const chain3 = await expandSpf("level0.example", staticResolver);
const exactlyTen = await expandSpf("ten.example", staticResolver);
const exactlyEleven = await expandSpf("eleven.example", staticResolver);
const cyclic = await expandSpf("a.loop", staticResolver);
const depthCapped = await expandSpf("d0.chain", chainResolver, { maxDepth: 3 });
const budgetCapped = await expandSpf("d0.chain", chainResolver, { maxQueries: 3 });
const duplicate = await expandSpf("dupe.example", staticResolver);
const plusAll = await expandSpf("plusall.example", staticResolver);
const minusAll = await expandSpf("minusall.example", staticResolver);
const missingAll = await expandSpf("noall.example", staticResolver);
const ptrCase = await expandSpf("ptrtest.example", staticResolver);
const redirectCase = await expandSpf("redirtest.example", staticResolver);
const chunkCase = await expandSpf("chunktest.example", staticResolver);
const voidCase = await expandSpf("voidtest.example", staticResolver);
const malformed = await expandSpf("badterm.example", staticResolver);

function titles(findings: { title: string }[]): string[] {
  return findings.map((finding) => finding.title);
}

export const checks: CheckSuite = (check) => {
  check(
    "spf: ip4 ve all sorgu xerclemir",
    ip4Only.totalLookups === 0,
    `alindi ${ip4Only.totalLookups}`,
  );

  check(
    "spf: a+mx+include ozu 3 sorgu xercleyir, include genislenmesinden evvel",
    threeTerm.root.ownLookups === 3,
    `alindi ${threeTerm.root.ownLookups}`,
  );

  check(
    "spf: uc seviyyeli include zenciri dogru cem ve agac formasi verir",
    chain3.totalLookups === 3 &&
      chain3.root.children[0]?.node.domain === "level1.example" &&
      chain3.root.children[0]?.node.children[0]?.node.domain === "level2.example",
    `cem ${chain3.totalLookups}, birinci sevive ${chain3.root.children[0]?.node.domain}`,
  );

  check(
    "spf: tam 10 sorgu limiti asmir",
    exactlyTen.totalLookups === 10 && !titles(exactlyTen.findings).some((t) => t.startsWith("DNS sorğu limiti")),
    `cem ${exactlyTen.totalLookups}, tapintilar ${JSON.stringify(titles(exactlyTen.findings))}`,
  );

  check(
    "spf: tam 11 sorgu permerror tapintisi verir",
    exactlyEleven.totalLookups === 11 &&
      titles(exactlyEleven.findings).some((t) => t.startsWith("DNS sorğu limiti")),
    `cem ${exactlyEleven.totalLookups}, tapintilar ${JSON.stringify(titles(exactlyEleven.findings))}`,
  );

  check(
    "spf: a->b->a dovresi yiginla cokmeden kesilir ve tapinti kimi bildirilir",
    cyclic.cycles.length === 1 && cyclic.cycles[0] === "a.loop" && titles(cyclic.findings).includes("Dövr aşkarlandı"),
    `dovreler ${JSON.stringify(cyclic.cycles)}`,
  );

  check(
    "spf: derinlik heddi oz tapintisini verir",
    depthCapped.depthExceeded && titles(depthCapped.findings).includes("Dərinlik həddi aşıldı"),
    `depthExceeded ${depthCapped.depthExceeded}, budgetExceeded ${depthCapped.budgetExceeded}`,
  );

  check(
    "spf: sorgu budcesi oz tapintisini verir",
    budgetCapped.budgetExceeded && titles(budgetCapped.findings).includes("Sorğu büdcəsi bitdi"),
    `budgetExceeded ${budgetCapped.budgetExceeded}, depthExceeded ${budgetCapped.depthExceeded}`,
  );

  check(
    "spf: eyni adda iki qeyd permerror kimi bildirilir",
    duplicate.root.record === null &&
      duplicate.root.terms.length === 0 &&
      titles(duplicate.findings).includes("SPF qeydi oxunmadı"),
    `xeta ${duplicate.root.error}`,
  );

  check(
    "spf: +all en yuxari tapintidir, -all hec bir tapinti vermir",
    plusAll.findings[0]?.title === "«+all» — istənilən server bu domenin adından yaza bilər" &&
      minusAll.findings.length === 0,
    `+all tapintilari ${JSON.stringify(titles(plusAll.findings))}, -all tapintilari ${JSON.stringify(titles(minusAll.findings))}`,
  );

  check(
    "spf: all yoxdursa neytral defolt tapintisi verilir",
    titles(missingAll.findings).includes("«all» yoxdur"),
    `tapintilar ${JSON.stringify(titles(missingAll.findings))}`,
  );

  check(
    "spf: ptr kohnelme tapintisi verir ve ozu bir sorgu kimi sayilir",
    ptrCase.totalLookups === 1 && titles(ptrCase.findings).includes("«ptr» mexanizmi köhnəlib"),
    `cem ${ptrCase.totalLookups}, tapintilar ${JSON.stringify(titles(ptrCase.findings))}`,
  );

  check(
    "spf: redirect bir sorgu kimi sayilir ve all varken nezerden qacdigi bildirilir",
    redirectCase.totalLookups === 1 &&
      titles(redirectCase.findings).includes("«redirect=» «all» ilə birlikdə yazılıb"),
    `cem ${redirectCase.totalLookups}, tapintilar ${JSON.stringify(titles(redirectCase.findings))}`,
  );

  check(
    'spf: TXT parcalari ayiricisiz birlesir — "v=spf1 inc"+"lude:x.example -all" = include:x.example',
    chunkCase.root.record === "v=spf1 include:x.example -all" && chunkCase.root.children.length === 1,
    `qeyd ${JSON.stringify(chunkCase.root.record)}`,
  );

  check(
    "spf: uc bos axtaris bos-axtaris limiti tapintisi verir",
    voidCase.voidLookups === 3 && titles(voidCase.findings).some((t) => t.startsWith("Boş axtarış limiti")),
    `bos axtaris ${voidCase.voidLookups}, tapintilar ${JSON.stringify(titles(voidCase.findings))}`,
  );

  check(
    "spf: sintaksisi yanlis termin xeta qaytarir, atilmir (throw etmir) ve tapinti kimi gorunur",
    malformed.root.record !== null &&
      malformed.root.error !== null &&
      malformed.root.terms.length === 0 &&
      titles(malformed.findings).includes("SPF qeydi oxunmadı"),
    `xeta ${malformed.root.error}`,
  );
};
