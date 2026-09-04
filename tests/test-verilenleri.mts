/*
 * The one number here that has to be real, not merely plausible, is the IBAN
 * checksum — anyone can type two digits that look like a check code, only
 * MOD-97 tells you whether they are. So the verifier is checked first,
 * against a known-valid IBAN independent of this file's own generator and
 * against a deliberately corrupted one, before it is trusted to vouch for
 * what `generateIban` produces. The rest covers the seed making generation
 * replayable, the row cap refusing rather than freezing, and CSV/SQL
 * escaping a value that contains the character that would otherwise break
 * the format.
 */
import type { CheckSuite } from "./harness.mts";
import {
  ALL_FIELDS,
  MAX_ROWS,
  generateDataset,
  generateIban,
  toCsv,
  toJson,
  toSqlInsert,
  verifyIbanChecksum,
  type DataRow,
} from "../lib/test-verilenleri";

function seededRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const checks: CheckSuite = (check) => {
  const runA = generateDataset(5, ALL_FIELDS, 42);
  const runB = generateDataset(5, ALL_FIELDS, 42);
  const runC = generateDataset(5, ALL_FIELDS, 43);
  check(
    "test-verilenleri: eyni toxumla (seed) eyni cədvəl alınır",
    runA.ok && runB.ok && JSON.stringify(runA.rows) === JSON.stringify(runB.rows),
    "runA != runB",
  );
  check(
    "test-verilenleri: fərqli toxumla fərqli cədvəl alınır",
    runA.ok && runC.ok && JSON.stringify(runA.rows) !== JSON.stringify(runC.rows),
    "runA == runC",
  );

  const oneRow = generateDataset(1, ["ad"], 1);
  check("test-verilenleri: tək sətir sərhəddi işləyir", oneRow.ok && oneRow.rows.length === 1, JSON.stringify(oneRow));

  const tooMany = generateDataset(MAX_ROWS + 1, ["ad"], 1);
  check(`test-verilenleri: ${MAX_ROWS}-dən çox sətir throw etmir, error qaytarır`, tooMany.ok === false, JSON.stringify(tooMany));

  const zeroRows = generateDataset(0, ["ad"], 1);
  check("test-verilenleri: 0 sətir throw etmir, error qaytarır", zeroRows.ok === false, JSON.stringify(zeroRows));

  const noFields = generateDataset(3, [], 1);
  check("test-verilenleri: sahə seçilməyəndə throw etmir, error qaytarır", noFields.ok === false, JSON.stringify(noFields));

  const rng = seededRng(7);
  const ownIban = generateIban(rng);
  check("test-verilenleri: qurulan IBAN öz MOD-97 yoxlamasından keçir", verifyIbanChecksum(ownIban), ownIban);

  const knownValidIban = "GB82 WEST 12345698765432"; // the standard ISO 13616 documentation example
  check("test-verilenleri: bilinən düzgün IBAN yoxlamadan keçir", verifyIbanChecksum(knownValidIban), knownValidIban);

  // Shifting the check digits by exactly 1 (mod 97, the algorithm's own
  // modulus) is derived, not guessed: it is mathematically guaranteed to
  // land on a residue that fails verification, unlike overwriting with a
  // fixed guess such as "00" — which up to two out of every hundred real
  // IBANs would legitimately carry.
  const correctCheck = Number(ownIban.slice(2, 4));
  const wrongCheck = ((correctCheck + 1) % 97).toString().padStart(2, "0");
  const corrupted = `${ownIban.slice(0, 2)}${wrongCheck}${ownIban.slice(4)}`;
  check(
    "test-verilenleri: pozulmuş yoxlama rəqəmi olan IBAN rədd olunur",
    corrupted !== ownIban && verifyIbanChecksum(corrupted) === false,
    corrupted,
  );

  const commaRow = { metn: 'Salam, "dünya"!' } as DataRow;
  const csv = toCsv([commaRow], ["metn"]);
  check(
    "test-verilenleri: vergül və dırnaq olan dəyər CSV-də düzgün qaçırılır",
    csv.includes('"Salam, ""dünya""!"'),
    csv,
  );

  const quoteRow = { ad: "O'Brien" } as DataRow;
  const sql = toSqlInsert([quoteRow], ["ad"], "istifadeciler");
  check("test-verilenleri: tək dırnaq SQL-də ikiqat dırnaqla qaçırılır", sql.includes("'O''Brien'"), sql);

  const unsafeTable = toSqlInsert([quoteRow], ["ad"], "users; DROP TABLE users;--");
  check("test-verilenleri: etibarsız cədvəl adı defolt ada düşür", unsafeTable.includes("INSERT INTO test_data"), unsafeTable);

  const mobileRun = generateDataset(20, ["mobil"], 99);
  check(
    "test-verilenleri: mobil nömrə həmişə real operator prefiksi ilə başlayır",
    mobileRun.ok && mobileRun.rows.every((row) => /^\+994 \((50|51|55|70|77|99)\) \d{3} \d{2} \d{2}$/.test(row.mobil)),
    mobileRun.ok ? mobileRun.rows.map((r) => r.mobil).join(", ") : mobileRun.error,
  );

  const jsonRun = generateDataset(2, ["ad", "soyad"], 5);
  const jsonText = jsonRun.ok ? toJson(jsonRun.rows, ["ad", "soyad"]) : "";
  const reparsed = jsonRun.ok ? (JSON.parse(jsonText) as { ad: string; soyad: string }[]) : [];
  check(
    "test-verilenleri: JSON çıxışı etibarlı JSON-dur və eyni sətirləri verir",
    jsonRun.ok && reparsed.length === 2 && reparsed[0].ad === jsonRun.rows[0].ad,
    jsonText,
  );
};
