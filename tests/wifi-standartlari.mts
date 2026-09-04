/*
 * What is worth checking here: the audit is clean, the table holds the 40+
 * rows the task promised, the two names IEEE and marketing use for Wi-Fi 5/6
 * cross-reference correctly, a search finds a row from an IEEE label as well
 * as from its plain-English name, the WEP row is honest about being broken,
 * the WPA3 row actually names SAE, folding tolerates a missing diacritic,
 * a two-word query is an AND and not an OR, and — the whole point of the
 * `nesil` section — every generation row carries the realistic throughput
 * next to the theoretical one, not just the theoretical number alone.
 */
import type { CheckSuite } from "./harness.mts";
import { auditReference, filterReference } from "../lib/reference";
import { wifiStandartlariRows, wifiStandartlariSections } from "../lib/wifi-standartlari";

export const checks: CheckSuite = (check) => {
  const problems = auditReference(wifiStandartlariRows, wifiStandartlariSections);
  check(
    "wifi-standartlari: auditReference finds nothing wrong with the rows",
    problems.length === 0,
    `got: ${JSON.stringify(problems)}`,
  );

  check(
    "wifi-standartlari: the table holds at least 40 rows",
    wifiStandartlariRows.length >= 40,
    `got: ${wifiStandartlariRows.length}`,
  );

  const wifi6 = wifiStandartlariRows.find((row) => row.term === "Wi-Fi 6");
  check(
    "wifi-standartlari: Wi-Fi 6's IEEE label is 802.11ax",
    wifi6?.label === "802.11ax",
    `got: ${JSON.stringify(wifi6)}`,
  );

  const wifi5 = wifiStandartlariRows.find((row) => row.term === "Wi-Fi 5");
  check(
    "wifi-standartlari: Wi-Fi 5's IEEE label is 802.11ac",
    wifi5?.label === "802.11ac",
    `got: ${JSON.stringify(wifi5)}`,
  );

  const byIeeeLabel = filterReference(wifiStandartlariRows, { query: "802.11n" });
  check(
    "wifi-standartlari: searching the IEEE label 802.11n finds the Wi-Fi 4 row",
    byIeeeLabel.some((row) => row.term === "Wi-Fi 4"),
    `got: ${JSON.stringify(byIeeeLabel.map((row) => row.term))}`,
  );

  const twoDotFour = wifiStandartlariRows.find((row) => row.term === "2.4 GHz");
  check(
    "wifi-standartlari: the 2.4 GHz row names channels 1, 6 and 11",
    twoDotFour !== undefined && twoDotFour.note.includes("1, 6 və 11"),
    `got: ${JSON.stringify(twoDotFour)}`,
  );

  const wep = wifiStandartlariRows.find((row) => row.term === "WEP");
  check(
    "wifi-standartlari: the WEP row's note marks it as broken",
    wep !== undefined && wep.note.startsWith("Qırılıb"),
    `got: ${JSON.stringify(wep)}`,
  );

  const wpa3 = wifiStandartlariRows.find((row) => row.term === "WPA3");
  check(
    "wifi-standartlari: the WPA3 row names SAE",
    wpa3 !== undefined && wpa3.note.includes("SAE"),
    `got: ${JSON.stringify(wpa3)}`,
  );

  const bySae = filterReference(wifiStandartlariRows, { query: "sae" });
  check(
    "wifi-standartlari: searching sae finds the same WPA3 row — the lookup works both directions",
    bySae.some((row) => row.term === "WPA3"),
    `got: ${JSON.stringify(bySae.map((row) => row.term))}`,
  );

  const byDbm = filterReference(wifiStandartlariRows, { query: "dbm" });
  check(
    "wifi-standartlari: searching dbm finds the RSSI row",
    byDbm.some((row) => row.term === "RSSI"),
    `got: ${JSON.stringify(byDbm.map((row) => row.term))}`,
  );

  const byOfdma = filterReference(wifiStandartlariRows, { query: "ofdma" });
  check(
    "wifi-standartlari: searching ofdma finds its own row",
    byOfdma.some((row) => row.term === "OFDMA"),
    `got: ${JSON.stringify(byOfdma.map((row) => row.term))}`,
  );

  const nesilRows = wifiStandartlariRows.filter((row) => row.section === "nesil");
  check(
    "wifi-standartlari: every row in the nesil section carries an example (the realistic throughput)",
    nesilRows.length > 0 && nesilRows.every((row) => row.example !== undefined && row.example.length > 0),
    `got: ${JSON.stringify(nesilRows.map((row) => ({ term: row.term, hasExample: row.example !== undefined })))}`,
  );

  const diacriticFree = filterReference(wifiStandartlariRows, { query: "tehlukesizlik" });
  check(
    "wifi-standartlari: a diacritic-free query (tehlukesizlik) still finds a row written with təhlükəsizlik",
    diacriticFree.length > 0,
    `got: ${JSON.stringify(diacriticFree.map((row) => row.term))}`,
  );

  const bothWords = filterReference(wifiStandartlariRows, { query: "sae wep" });
  check(
    "wifi-standartlari: a two-word query requires both words — no row is both about SAE and WEP",
    bothWords.length === 0,
    `got: ${JSON.stringify(bothWords.map((row) => row.term))}`,
  );
};
