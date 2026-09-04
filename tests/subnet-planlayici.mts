/*
 * The VLSM planner's whole job is arithmetic a person gets subtly wrong under
 * time pressure, so the cases below are exactly those traps: the "usable
 * hosts, not raw block size" rule at its boundary (50 needs a /26, 62 just
 * fits a /26, 63 does not), the two prefixes where the normal "minus two"
 * rule is replaced by RFC 3021 and the single-host special case, whether
 * packing blocks largest-first really does leave zero gap between them, and
 * whether a request that cannot fit is reported honestly rather than
 * truncated. The overlap property test exists because an off-by-one in the
 * alignment step is the one bug that would not show up in any single
 * hand-picked example — it only appears once block sizes vary enough that an
 * unaligned offset becomes possible.
 */
import type { CheckSuite } from "./harness.mts";
import {
  minimalPrefixForHosts,
  parseRequirements,
  planVlsm,
  splitByCount,
  type Segment,
} from "../lib/subnet-planlayici";

function ipToNumber(text: string): number {
  return text.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);
}

/** Deterministic PRNG (mulberry32) — the property test must fail the same way every run, not flake. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const checks: CheckSuite = (check) => {
  /* ---------- textbook VLSM ---------- */

  const textbook = planVlsm("192.168.1.0/24", [
    { name: "ofis", hosts: 100 },
    { name: "anbar", hosts: 50 },
    { name: "qonaq", hosts: 25 },
    { name: "server", hosts: 10 },
  ]);

  check(
    "subnet-planlayici: 100/50/25/10 -> /25 /26 /27 /28 duzgun ofsetlerde",
    textbook.ok &&
      textbook.rows.map((r) => r.cidr).join(",") ===
        "192.168.1.0/25,192.168.1.128/26,192.168.1.192/27,192.168.1.224/28",
    !textbook.ok ? textbook.error : `alindi: ${textbook.rows.map((r) => r.cidr).join(",")}`,
  );

  check(
    "subnet-planlayici: bos qalan yer tek aliqnli CIDR kimi cixir",
    textbook.ok &&
      textbook.freeAddresses === 16 &&
      textbook.freeBlocks.length === 1 &&
      textbook.freeBlocks[0].cidr === "192.168.1.240/28",
    !textbook.ok ? textbook.error : `alindi: ${JSON.stringify(textbook.freeBlocks)}`,
  );

  /* ---------- the "usable hosts, not block size" boundary ---------- */

  check(
    "subnet-planlayici: 50 host -> /26, 62 host -> /26, 63 host -> /25",
    minimalPrefixForHosts(50) === 26 && minimalPrefixForHosts(62) === 26 && minimalPrefixForHosts(63) === 25,
    `alindi: ${minimalPrefixForHosts(50)}, ${minimalPrefixForHosts(62)}, ${minimalPrefixForHosts(63)}`,
  );

  const fiftyHosts = planVlsm("10.0.0.0/24", [{ name: "ofis", hosts: 50 }]);
  check(
    "subnet-planlayici: 50 hostluq seqmentde usableHosts 62, itki 12",
    fiftyHosts.ok && fiftyHosts.rows[0].usableHosts === 62 && fiftyHosts.rows[0].wasted === 12,
    !fiftyHosts.ok ? fiftyHosts.error : `alindi: ${JSON.stringify(fiftyHosts.rows[0])}`,
  );

  /* ---------- /31 and /32 edge rules ---------- */

  const pointToPoint = planVlsm("10.0.0.0/24", [{ name: "link", hosts: 2 }]);
  check(
    "subnet-planlayici: 2 host -> /31, 2 usable, broadcast yoxdur (RFC 3021)",
    pointToPoint.ok &&
      pointToPoint.rows[0].prefix === 31 &&
      pointToPoint.rows[0].usableHosts === 2 &&
      pointToPoint.rows[0].broadcast === null &&
      pointToPoint.rows[0].firstHost !== pointToPoint.rows[0].lastHost,
    !pointToPoint.ok ? pointToPoint.error : `alindi: ${JSON.stringify(pointToPoint.rows[0])}`,
  );

  const singleHost = planVlsm("10.0.0.0/24", [{ name: "loopback", hosts: 1 }]);
  check(
    "subnet-planlayici: 1 host -> /32, 1 usable, broadcast yoxdur",
    singleHost.ok &&
      singleHost.rows[0].prefix === 32 &&
      singleHost.rows[0].usableHosts === 1 &&
      singleHost.rows[0].broadcast === null &&
      singleHost.rows[0].firstHost === singleHost.rows[0].lastHost &&
      singleHost.rows[0].firstHost === singleHost.rows[0].network,
    !singleHost.ok ? singleHost.error : `alindi: ${JSON.stringify(singleHost.rows[0])}`,
  );

  /* ---------- does not fit ---------- */

  const tooBig = planVlsm("192.168.1.0/28", [
    { name: "ofis", hosts: 100 },
    { name: "anbar", hosts: 50 },
  ]);
  check(
    "subnet-planlayici: sigmayan tələb kesilmeden xeta verir",
    !tooBig.ok &&
      tooBig.failedSegment === "ofis" &&
      tooBig.shortfallAddresses !== null &&
      tooBig.shortfallAddresses > 0 &&
      tooBig.suggestedPrefix !== null &&
      tooBig.suggestedPrefix < 28,
    tooBig.ok ? "gozlenmeden uğur qaytardi" : `alindi: ${tooBig.error}`,
  );

  /* ---------- alignment across mixed block sizes, no gap ---------- */

  const mixed = planVlsm("10.0.0.0/22", [
    { name: "ofis", hosts: 500 },
    { name: "wifi", hosts: 200 },
    { name: "server", hosts: 30 },
    { name: "link", hosts: 2 },
  ]);
  const mixedRows = mixed.ok ? mixed.rows : [];
  const mixedCidrs = mixedRows.map((r) => r.cidr).join(",");
  const mixedContiguous = mixedRows.every((row, index) => {
    if (index === 0) return true;
    const previous = mixedRows[index - 1];
    const previousStart = ipToNumber(previous.network);
    const previousSize = 2 ** (32 - previous.prefix);
    return ipToNumber(row.network) === previousStart + previousSize;
  });
  check(
    "subnet-planlayici: qarisiq olculerde bloklar arasinda bosluq yoxdur",
    mixed.ok && mixedCidrs === "10.0.0.0/23,10.0.2.0/24,10.0.3.0/27,10.0.3.32/31" && mixedContiguous,
    !mixed.ok ? mixed.error : `alindi: ${mixedCidrs}`,
  );

  /* ---------- equal split ---------- */

  const equalFour = splitByCount("10.0.0.0/24", 4);
  check(
    "subnet-planlayici: /24-u 4 hisseye bolmek 4x/26 verir",
    equalFour.ok &&
      equalFour.newPrefix === 26 &&
      equalFour.parts.map((p) => p.cidr).join(",") ===
        "10.0.0.0/26,10.0.0.64/26,10.0.0.128/26,10.0.0.192/26",
    !equalFour.ok ? equalFour.error : `alindi: ${equalFour.parts.map((p) => p.cidr).join(",")}`,
  );

  const equalFive = splitByCount("10.0.0.0/24", 5);
  check(
    "subnet-planlayici: 5 istense de CIDR yalniz 2-nin qüvvetini verir - 8 alinir, deyisiklik acig yazilir",
    equalFive.ok && equalFive.requestedCount === 5 && equalFive.actualCount === 8 && equalFive.newPrefix === 27,
    !equalFive.ok ? equalFive.error : `alindi: ${equalFive.actualCount}`,
  );

  /* ---------- non-overlap property over generated cases ---------- */

  const rand = mulberry32(20260903);
  let trialsChecked = 0;
  let overlapFound = false;
  for (let trial = 0; trial < 40 && !overlapFound; trial++) {
    const count = 2 + Math.floor(rand() * 10);
    const segments: Segment[] = Array.from({ length: count }, (_, i) => ({
      name: `seg-${trial}-${i}`,
      hosts: 1 + Math.floor(rand() * 300),
    }));
    const totalNeeded = segments.reduce((sum, s) => sum + 2 ** (32 - minimalPrefixForHosts(s.hosts)), 0);
    let prefix = 32;
    while (prefix > 0 && 2 ** (32 - prefix) < totalNeeded) prefix -= 1;

    const result = planVlsm(`10.${trial}.0.0/${prefix}`, segments);
    if (!result.ok) continue;
    trialsChecked += 1;

    const ranges = result.rows.map((row) => {
      const start = ipToNumber(row.network);
      return { start, end: start + 2 ** (32 - row.prefix) };
    });
    for (let i = 0; i < ranges.length && !overlapFound; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        if (ranges[i].start < ranges[j].end && ranges[j].start < ranges[i].end) overlapFound = true;
      }
    }
  }
  check(
    "subnet-planlayici: 40 tesadufi seqment setinde hec bir blok ust-uste dusmur",
    trialsChecked > 0 && !overlapFound,
    `yoxlanan sinaq: ${trialsChecked}, ust-uste dusme: ${overlapFound}`,
  );

  /* ---------- malformed input: never throws, always explains ---------- */

  const badNetwork = planVlsm("999.1.1.1/24", [{ name: "ofis", hosts: 10 }]);
  check(
    "subnet-planlayici: yalnis IPv4 sebeke atmadan xeta qaytarir",
    !badNetwork.ok && badNetwork.error.length > 0,
    badNetwork.ok ? "gozlenmeden uğur qaytardi" : `alindi: ${badNetwork.error}`,
  );

  const zeroHostLine = parseRequirements("wifi 0");
  check(
    "subnet-planlayici: 0 hostluq setir tehlukesiz redd edilir",
    zeroHostLine.requirements.length === 0 && zeroHostLine.issues.length === 1,
    `alindi: ${JSON.stringify(zeroHostLine)}`,
  );

  // "Server" vs "server", not an I/İ pair on purpose: az-locale lower-casing
  // sends ASCII "I" to dotless "ı" rather than "i" ("OFIS" -> "ofıs", not
  // "ofis"), so a duplicate check built on that pair would silently pass two
  // segments that read as the same name to a visitor. A name with no I at
  // all keeps this test about case-folding and not about that locale rule.
  const duplicateName = planVlsm("10.0.0.0/24", [
    { name: "server", hosts: 10 },
    { name: "Server", hosts: 5 },
  ]);
  const tooManySegments = parseRequirements(
    Array.from({ length: 65 }, (_, i) => `s${i} 2`).join("\n"),
  );
  check(
    "subnet-planlayici: tekrarlanan ad ve 64-den cox seqment redd edilir",
    !duplicateName.ok &&
      duplicateName.failedSegment === "Server" &&
      tooManySegments.issues.some((issue) => issue.line === 0),
    `duplicate: ${duplicateName.ok}, cox-seqment: ${JSON.stringify(tooManySegments.issues.find((i) => i.line === 0))}`,
  );
};
