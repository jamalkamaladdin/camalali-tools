/*
 * What is worth checking here: the three representations of a mode agree with
 * what `ls -l` and `chmod` actually print, the special bits land in the right
 * triad and change case when there is no execute bit under them, every one of
 * the 4096 possible modes survives a round trip through both text forms,
 * malformed input comes back as null rather than as a guess, the Azerbaijani
 * sentence says what the mode means, the warnings fire on the dangerous modes
 * and stay silent on the correct ones, and the reference table passes the
 * shared audit.
 *
 * The round trip is the load-bearing case. Both parsers and both renderers are
 * hand-written character tables, and a table with one wrong entry is exactly
 * the kind of defect a handful of spot checks walks straight past.
 */
import type { CheckSuite } from "./harness.mts";
import {
  chmodCommand,
  chmodRows,
  chmodSections,
  describeMode,
  EMPTY_MODE,
  modeWarnings,
  parseOctal,
  parseSymbolic,
  toOctal,
  toSymbolic,
  type ChmodMode,
} from "../lib/chmod";
import { auditReference, filterReference } from "../lib/reference";

/** Every mode there is: three permission digits plus the three special bits. */
const ALL_MODES = 8 * 8 * 8 * 8;

function modeOf(octal: string): ChmodMode {
  const parsed = parseOctal(octal);
  if (parsed === null) throw new Error(`chmod checks: '${octal}' parse edilmedi`);
  return parsed;
}

function same(left: ChmodMode, right: ChmodMode): boolean {
  return toOctal(left) === toOctal(right) && toSymbolic(left) === toSymbolic(right);
}

export const checks: CheckSuite = (check) => {
  /* ---- the plain modes, as `ls -l` prints them ---- */

  const plain: [string, string][] = [
    ["755", "rwxr-xr-x"],
    ["644", "rw-r--r--"],
    ["600", "rw-------"],
    ["777", "rwxrwxrwx"],
    ["000", "---------"],
  ];
  for (const [octal, symbolic] of plain) {
    check(
      `chmod: ${octal} simvolik formada ${symbolic} kimi yazilir`,
      toSymbolic(modeOf(octal)) === symbolic,
      `got: ${toSymbolic(modeOf(octal))}`,
    );
  }

  check(
    "chmod: toOctal hemise dord reqem qaytarir, xususi bitler ucun yer saxlayir",
    toOctal(modeOf("755")) === "0755" && toOctal(modeOf("4755")) === "4755",
    `got: ${toOctal(modeOf("755"))} / ${toOctal(modeOf("4755"))}`,
  );

  check(
    "chmod: EMPTY_MODE 0000 ve butov defis setridir",
    toOctal(EMPTY_MODE) === "0000" && toSymbolic(EMPTY_MODE) === "---------",
    `got: ${toOctal(EMPTY_MODE)} / ${toSymbolic(EMPTY_MODE)}`,
  );

  /* ---- the special bits, including the capital-letter cases ---- */

  const special: [string, string][] = [
    ["4755", "rwsr-xr-x"],
    ["2755", "rwxr-sr-x"],
    ["1777", "rwxrwxrwt"],
    ["4644", "rwSr--r--"],
    ["1666", "rw-rw-rwT"],
  ];
  for (const [octal, symbolic] of special) {
    check(
      `chmod: ${octal} xususi biti dogru triadada ve dogru registrde gosterir (${symbolic})`,
      toSymbolic(modeOf(octal)) === symbolic,
      `got: ${toSymbolic(modeOf(octal))}`,
    );
  }

  /* ---- the round trip, over every mode that exists ---- */

  let octalBroken: string | null = null;
  let symbolicBroken: string | null = null;
  for (let value = 0; value < ALL_MODES; value += 1) {
    const source = modeOf(value.toString(8));

    const viaOctal = parseOctal(toOctal(source));
    if (viaOctal === null || !same(source, viaOctal)) {
      octalBroken ??= toOctal(source);
    }

    const viaSymbolic = parseSymbolic(toSymbolic(source));
    if (viaSymbolic === null || !same(source, viaSymbolic)) {
      symbolicBroken ??= `${toOctal(source)} -> ${toSymbolic(source)}`;
    }
  }
  check(
    `chmod: 0-7777 arasindaki ${ALL_MODES} rejimin hamisi sekkizlik gedis-gelisden deyismeden cixir`,
    octalBroken === null,
    `ilk pozulan: ${octalBroken}`,
  );
  check(
    `chmod: eyni ${ALL_MODES} rejim simvolik gedis-gelisden de deyismeden cixir`,
    symbolicBroken === null,
    `ilk pozulan: ${symbolicBroken}`,
  );

  /* ---- refusals ---- */

  const badOctal = ["888", "abc", "", "99999", "7.5", "-1", "rwx"];
  check(
    "chmod: sekkizlik olmayan giris null qaytarir, tehmin etmir",
    badOctal.every((input) => parseOctal(input) === null),
    `qebul edilen: ${badOctal.filter((input) => parseOctal(input) !== null).join(", ")}`,
  );

  const badSymbolic = ["rwxrwxrw", "abc", "", "rwxrwxrwxx", "rwxr-xr-y", "xwrxwrxwr"];
  check(
    "chmod: sehv uzunluqda ve sehv herfli rwx setri null qaytarir",
    badSymbolic.every((input) => parseSymbolic(input) === null),
    `qebul edilen: ${badSymbolic.filter((input) => parseSymbolic(input) !== null).join(", ")}`,
  );

  /* ---- the two deliberate tolerances ---- */

  check(
    "chmod: qisa sekkizlik forma bas sifirla tamamlanir - chmod-un ozu kimi",
    JSON.stringify(parseOctal("75")) === JSON.stringify(parseOctal("075")) &&
      toSymbolic(modeOf("75")) === "---rwxr-x",
    `got: ${toSymbolic(modeOf("75"))}`,
  );

  const pastedFile = parseSymbolic("-rwxr-xr-x");
  const pastedDir = parseSymbolic("drwxr-xr-x");
  check(
    "chmod: ls -l setrindeki bas fayl-tipi herfi kesilir, on simvol redd edilmir",
    pastedFile !== null &&
      pastedDir !== null &&
      toOctal(pastedFile) === "0755" &&
      toOctal(pastedDir) === "0755",
    `fayl: ${JSON.stringify(pastedFile)}, qovluq: ${JSON.stringify(pastedDir)}`,
  );

  /* ---- the sentence ---- */

  const described755 = describeMode(modeOf("755"));
  check(
    "chmod: 755 ucun cumle sahibi qalanlardan ayirir ve 'yalniz' ile mehdudlasdirir",
    described755 ===
      "Sahib oxuya, yaza və icra edə bilər; qrup və digərləri yalnız oxuya və icra edə bilər.",
    `got: ${described755}`,
  );

  const described644 = describeMode(modeOf("644"));
  check(
    "chmod: 644 ucun cumle icra felini isletmir",
    described644 ===
      "Sahib oxuya və yaza bilər; qrup və digərləri yalnız oxuya bilər." &&
      !described644.includes("icra"),
    `got: ${described644}`,
  );

  const described000 = describeMode(EMPTY_MODE);
  check(
    "chmod: bos rejim uc eyni bendi 'hami' kimi birlesdirir",
    described000 === "Hamı heç nə edə bilmir.",
    `got: ${described000}`,
  );

  const described4755 = describeMode(modeOf("4755"));
  check(
    "chmod: setuid rejimin cumlesine ayrica izah elave olunur",
    described4755.includes("Setuid"),
    `got: ${described4755}`,
  );

  /* ---- the warnings ---- */

  check(
    "chmod: 777 xeberdarliq verir, 644 vermir",
    modeWarnings(modeOf("777")).length > 0 && modeWarnings(modeOf("644")).length === 0,
    `777: ${modeWarnings(modeOf("777")).length}, 644: ${modeWarnings(modeOf("644")).length}`,
  );

  check(
    "chmod: 666 icra bayragi olmadan da xeberdarliq verir",
    modeWarnings(modeOf("666")).length > 0,
    `got: ${JSON.stringify(modeWarnings(modeOf("666")))}`,
  );

  check(
    "chmod: setuid ile birlikde o+w en azi iki ayri xeberdarliq dogurur",
    modeWarnings(modeOf("4757")).length >= 2,
    `got: ${JSON.stringify(modeWarnings(modeOf("4757")))}`,
  );

  check(
    "chmod: icra bayragi olmayan setuid faydasiz bit kimi isarelenir",
    modeWarnings(modeOf("4644")).some((warning) => warning.includes("Setuid")),
    `got: ${JSON.stringify(modeWarnings(modeOf("4644")))}`,
  );

  check(
    "chmod: 755 ve 600 kimi dogru rejimlerde xeberdarliq yoxdur",
    modeWarnings(modeOf("755")).length === 0 && modeWarnings(modeOf("600")).length === 0,
    `755: ${JSON.stringify(modeWarnings(modeOf("755")))}, 600: ${JSON.stringify(modeWarnings(modeOf("600")))}`,
  );

  /* ---- the command ---- */

  check(
    "chmod: emr xususi bit yoxdursa uc reqemli, varsa dord reqemli yazilir",
    chmodCommand(modeOf("755"), "fayl.sh") === "chmod 755 fayl.sh" &&
      chmodCommand(modeOf("4755"), "/usr/bin/alet") === "chmod 4755 /usr/bin/alet",
    `got: ${chmodCommand(modeOf("755"), "fayl.sh")} / ${chmodCommand(modeOf("4755"), "/usr/bin/alet")}`,
  );

  check(
    "chmod: bosluqlu fayl adi dirnaga alinir, bos ad defolt ada duşur",
    chmodCommand(modeOf("644"), "mənim fayl.txt") === "chmod 644 'mənim fayl.txt'" &&
      chmodCommand(modeOf("644"), "   ") === "chmod 644 fayl",
    `got: ${chmodCommand(modeOf("644"), "mənim fayl.txt")} / ${chmodCommand(modeOf("644"), "   ")}`,
  );

  /* ---- the reference table ---- */

  const problems = auditReference(chmodRows, chmodSections);
  check(
    "chmod: arayis cedveli ortaq auditden problemsiz kecir",
    problems.length === 0,
    `problemler: ${problems.join(" | ")}`,
  );

  check(
    "chmod: cedvel en azi 30 setirdir ve bes bolmenin hamisi doludur",
    chmodRows.length >= 30 &&
      chmodSections.every((section) => chmodRows.some((row) => row.section === section.id)),
    `setir: ${chmodRows.length}, bolme: ${chmodSections.length}`,
  );

  const sshRows = filterReference(chmodRows, { query: "ssh" });
  check(
    "chmod: 'ssh' axtarisi gizli acar ucun 600 setrini tapir",
    sshRows.some((row) => row.term.includes("600")),
    `tapilan: ${sshRows.map((row) => row.term).join(", ")}`,
  );

  const tmpRows = filterReference(chmodRows, { query: "tmp" });
  check(
    "chmod: 'tmp' axtarisi sticky bit setrini (1777) tapir",
    tmpRows.some((row) => row.term === "1777"),
    `tapilan: ${tmpRows.map((row) => row.term).join(", ")}`,
  );

  const wrongSection = filterReference(chmodRows, { section: "tele" });
  check(
    "chmod: bolme filtri yalniz oz setirlerini qaytarir",
    wrongSection.length > 0 && wrongSection.every((row) => row.section === "tele"),
    `got: ${wrongSection.length} setir`,
  );

  check(
    "chmod: bos example sahesi olan setir yoxdur",
    chmodRows.every((row) => row.example === undefined || row.example.trim().length > 0),
    "bos example sahesi var",
  );
};
