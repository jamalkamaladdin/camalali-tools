/*
 * The claims worth checking here: the suffix stripper matches the two
 * examples the brief names exactly (a stacked plural + case suffix strips
 * down to the right root, a root already too short is left alone), the
 * volume column is read from either a comma or a tab, a single keyword with
 * no shared stem never becomes a one-member cluster, and a group with a
 * real shared stem actually forms with that stem attached.
 */
import type { CheckSuite } from "./harness.mts";
import {
  clusterKeywords,
  clustersToCsv,
  parseKeywordList,
  stemAz,
  type KeywordInput,
} from "../lib/acar-soz-qruplasdirma";

export const checks: CheckSuite = (check) => {
  check(
    "acar-soz-qruplasdirma: a stacked plural + case suffix strips down to the bare root",
    stemAz("saytların") === "sayt",
    `got: ${stemAz("saytların")}`,
  );
  check(
    "acar-soz-qruplasdirma: a root shorter than the minimum keeps its suffix",
    stemAz("ev") === "ev",
    `got: ${stemAz("ev")}`,
  );
  check(
    "acar-soz-qruplasdirma: a plain plural still strips on its own",
    stemAz("kitablar") === "kitab",
    `got: ${stemAz("kitablar")}`,
  );

  const commaParsed = parseKeywordList("seo aləti,1200\nkeyword tool,300\ntək söz");
  check(
    "acar-soz-qruplasdirma: a comma-separated second column is read as volume",
    commaParsed.items[0]?.keyword === "seo aləti" && commaParsed.items[0]?.volume === 1200,
    `got: ${JSON.stringify(commaParsed.items[0])}`,
  );
  check(
    "acar-soz-qruplasdirma: a line with no second column reports a null volume",
    commaParsed.items[2]?.keyword === "tək söz" && commaParsed.items[2]?.volume === null,
    `got: ${JSON.stringify(commaParsed.items[2])}`,
  );

  const tabParsed = parseKeywordList("seo aləti\t1500");
  check(
    "acar-soz-qruplasdirma: a tab-separated second column is read as volume",
    tabParsed.items[0]?.keyword === "seo aləti" && tabParsed.items[0]?.volume === 1500,
    `got: ${JSON.stringify(tabParsed.items[0])}`,
  );

  const single: KeywordInput[] = [{ keyword: "seo alətləri", volume: null }];
  const soloResult = clusterKeywords(single, { minSize: 2 });
  check(
    "acar-soz-qruplasdirma: a single keyword never forms a cluster on its own",
    soloResult.clusters.length === 0 && soloResult.orphans.length === 1,
    `got: ${JSON.stringify(soloResult)}`,
  );

  const shared: KeywordInput[] = [
    { keyword: "seo aləti", volume: 500 },
    { keyword: "pulsuz seo alətləri", volume: 300 },
    { keyword: "seo alətlərinin siyahısı", volume: 200 },
    { keyword: "bişirmə resepti", volume: 50 },
  ];
  const grouped = clusterKeywords(shared, { minSize: 2 });
  check(
    "acar-soz-qruplasdirma: three keywords sharing a stem form one cluster",
    grouped.clusters.length === 1 && grouped.clusters[0]?.items.length === 3,
    `got: ${JSON.stringify(grouped.clusters)}`,
  );
  check(
    "acar-soz-qruplasdirma: the unrelated keyword is left in orphans, not forced into the cluster",
    grouped.orphans.some((item) => item.keyword === "bişirmə resepti"),
    `orphans: ${JSON.stringify(grouped.orphans)}`,
  );
  check(
    "acar-soz-qruplasdirma: a cluster's weight sums its members' volume when volume data exists",
    grouped.clusters[0]?.weight === 1000,
    `got weight: ${grouped.clusters[0]?.weight}`,
  );

  const csv = clustersToCsv(grouped.clusters, grouped.orphans);
  check(
    "acar-soz-qruplasdirma: the CSV export carries every keyword from both clusters and orphans",
    shared.every((item) => csv.includes(item.keyword)),
    `csv: ${csv}`,
  );
  check(
    "acar-soz-qruplasdirma: the CSV export starts with a header row naming its three columns",
    csv.startsWith("qrup,acar_soz,hecm"),
    `csv head: ${csv.split("\r\n")[0]}`,
  );
};
