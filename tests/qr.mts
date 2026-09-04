import type { CheckSuite } from "./harness.mts";
import {
  contrastRatio,
  encodeQr,
  maskPenalty,
  qrCapacity,
  qrPathData,
  qrToSvg,
  readabilityWarning,
  type QrResult,
  type QrSymbol,
  // Two levels up: this file sits in `scripts/tools-checks/`, while the
  // long-standing `scripts/verify-tools.mts` reaches the same folder with one.
} from "../lib/qr";

/*
 * Where the reference values come from.
 *
 * A QR encoder that only agrees with itself proves nothing, so nothing below
 * was produced by the module under test.
 *
 * - The codeword vectors are the worked example printed in ISO/IEC 18004
 *   Annex I: "01234567" at version 1, level M. The standard lists both the
 *   sixteen data codewords and the ten parity codewords, which pins the
 *   encoder and the Reed-Solomon stage separately from anything to do with
 *   the grid.
 * - The module grids and the penalty vectors were produced with Project
 *   Nayuki's qrcodegen (Python, v1.8), the reference implementation the
 *   published walkthroughs of the format are written against:
 *     uv run --with qrcodegen python -c "from qrcodegen import QrCode,
 *       QrSegment; q = QrCode.encode_segments(QrSegment.make_segments(TEXT),
 *       ECL, mask=MASK, boostecl=False); ..."
 *   `boostecl=False` matters: left on, qrcodegen quietly raises the error
 *   correction level whenever the text would still fit, and then the grid it
 *   prints is not the grid for the level that was asked for.
 * - The first grid, "HELLO WORLD" at version 1 level Q, is the standard's own
 *   example and segno 1.6 produces it identically, so two implementations
 *   agree on it.
 *
 * One place the references disagree with each other, and it is worth naming
 * because it decided how this tool behaves. The penalty score is computed here
 * over the finished symbol, format bits included — which is what qrcodegen and
 * ZXing both do. segno deliberately scores the grid before the format field is
 * written, and therefore picks a different mask for the same input. Both make
 * a symbol every scanner reads; only one number can be in a test, and it is
 * the one the two most widely deployed encoders produce. Every grid below was
 * additionally read back with zxing-cpp and decoded to the original text.
 */

/** "HELLO WORLD", version 1, level Q, mask 0 — qrcodegen and segno agree. */
const HELLO_WORLD_Q = `
111111101100001111111
100000101001001000001
101110101001101011101
101110101000001011101
101110101010001011101
100000100010001000001
111111101010101111111
000000001000000000000
011010110000101011111
010000001111000010001
001101110110001011000
011011010011010101110
100010101011101110101
000000001101001000101
111111101010000101100
100000100101101101000
101110101010001111111
101110100101010100010
101110101001011101001
100000101011110001011
111111100001011100001`;

/** "01234567", version 1, level M, mask 0 — the standard's numeric example. */
const NUMERIC_01234567_M = `
111111100011101111111
100000101110001000001
101110100110001011101
101110100101101011101
101110101101101011101
100000100001001000001
111111101010101111111
000000000000000000000
101010100010100010010
110100001011010100010
000110111011011101110
110011010101110110010
001001110111011100001
000000001010001000010
111111100000100010001
100000100010001001011
101110101110101011101
101110100101010101110
101110101101011100101
100000100001110111000
111111101001011100101`;

/** "Şəhər" — five characters, eight UTF-8 bytes — version 1, level M, mask 2. */
const AZ_SEHER_M = `
111111100101001111111
100000100011101000001
101110101100101011101
101110101010101011101
101110101001101011101
100000101000101000001
111111101010101111111
000000001001100000000
101111100010101111100
010011001000100011010
010110101001001000001
101000010100000001010
000010110011000110110
000000001111111000000
111111100010101111111
100000101001111000000
101110101100100111101
101110101000100100000
101110101111010011100
100000100000000101100
111111101001010110010`;

/** Penalty of each of the eight masks, in mask order, from qrcodegen. */
const HELLO_WORLD_Q_PENALTIES = [1067, 1230, 1266, 1161, 1339, 1276, 1074, 1278];
const NUMERIC_01234567_M_PENALTIES = [1057, 1253, 1117, 1172, 1250, 1397, 1179, 1126];
const AZ_SEHER_M_PENALTIES = [1232, 1113, 1023, 1121, 1078, 1189, 1039, 1182];

/** ISO/IEC 18004 Annex I: the sixteen data codewords of "01234567" at 1-M. */
const ISO_DATA_CODEWORDS = "10 20 0c 56 61 80 ec 11 ec 11 ec 11 ec 11 ec 11";
/** ISO/IEC 18004 Annex I: the ten Reed-Solomon codewords for the same block. */
const ISO_EC_CODEWORDS = "a5 24 d4 c1 ed 36 c7 87 2c 55";

/**
 * Version information string for version 8 as printed in ISO/IEC 18004 Table
 * D.1, most significant bit first. The field is written only from version 7,
 * so nothing below that exercises the BCH(18,6) code at all.
 */
const VERSION_8_INFO_BITS = "001000010110111100";

function reference(block: string): string {
  return block.trim();
}

function render(modules: boolean[][]): string {
  return modules.map((row) => row.map((cell) => (cell ? "1" : "0")).join("")).join("\n");
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function symbolOf(result: QrResult): QrSymbol | null {
  return result.ok ? result : null;
}

/** Reads the 18 version bits back out of a built symbol, most significant first. */
function versionBits(symbol: QrSymbol): string {
  const bits: string[] = [];
  for (let i = 0; i < 18; i++) {
    bits.push(symbol.modules[Math.floor(i / 3)][symbol.size - 11 + (i % 3)] ? "1" : "0");
  }
  return bits.reverse().join("");
}

/** Smallest coordinate any path command starts at — the quiet zone offset. */
function smallestPathCoordinate(path: string): number {
  const moves = [...path.matchAll(/M(\d+) (\d+)/g)];
  return Math.min(...moves.flatMap((move) => [Number(move[1]), Number(move[2])]));
}

export const checks: CheckSuite = (check) => {
  /* ---- exact module grids against an outside implementation ---- */

  const hello = encodeQr("HELLO WORLD", { ecLevel: "Q" });
  const helloSymbol = symbolOf(hello);
  check(
    "qr: HELLO WORLD 1-Q matrisi ISO numunesi ile bire-bir uygundur",
    helloSymbol !== null &&
      helloSymbol.version === 1 &&
      helloSymbol.mode === "alphanumeric" &&
      helloSymbol.mask === 0 &&
      render(helloSymbol.modules) === reference(HELLO_WORLD_Q),
    helloSymbol
      ? `versiya ${helloSymbol.version}, rejim ${helloSymbol.mode}, maska ${helloSymbol.mask}`
      : "qurulmadi",
  );

  const numeric = encodeQr("01234567", { ecLevel: "M" });
  const numericSymbol = symbolOf(numeric);
  check(
    "qr: 01234567 1-M numerik matrisi etalonla uygundur",
    numericSymbol !== null &&
      numericSymbol.mode === "numeric" &&
      numericSymbol.mask === 0 &&
      render(numericSymbol.modules) === reference(NUMERIC_01234567_M),
    numericSymbol
      ? `rejim ${numericSymbol.mode}, maska ${numericSymbol.mask}`
      : "qurulmadi",
  );

  check(
    "qr: 01234567 1-M kodsozleri ISO Annex I numunesi ile eynidir",
    numericSymbol !== null &&
      hex(numericSymbol.codewords.subarray(0, 16)) === ISO_DATA_CODEWORDS &&
      hex(numericSymbol.codewords.subarray(16)) === ISO_EC_CODEWORDS,
    numericSymbol
      ? `alindi ${hex(numericSymbol.codewords)}`
      : "qurulmadi",
  );

  const azeri = encodeQr("Şəhər", { ecLevel: "M" });
  const azeriSymbol = symbolOf(azeri);
  check(
    "qr: azerbaycan metni Seher 1-M byte matrisi etalonla uygundur",
    azeriSymbol !== null &&
      azeriSymbol.mode === "byte" &&
      azeriSymbol.byteLength === 8 &&
      azeriSymbol.mask === 2 &&
      render(azeriSymbol.modules) === reference(AZ_SEHER_M),
    azeriSymbol
      ? `bayt ${azeriSymbol.byteLength}, maska ${azeriSymbol.mask}`
      : "qurulmadi",
  );

  /* ---- mode picks the smaller symbol ---- */

  const digits = "1".repeat(40);
  const asNumeric = encodeQr(digits, { ecLevel: "L", mode: "numeric" });
  const asAlnum = encodeQr(digits, { ecLevel: "L", mode: "alphanumeric" });
  const asByte = encodeQr(digits, { ecLevel: "L", mode: "byte" });
  check(
    "qr: eyni 40 reqem numerikde v1, alfanumerikde v2, byte-da v3 verir",
    asNumeric.ok &&
      asAlnum.ok &&
      asByte.ok &&
      asNumeric.version === 1 &&
      asAlnum.version === 2 &&
      asByte.version === 3,
    `numerik ${asNumeric.ok ? asNumeric.version : "xeta"}, alfanumerik ${asAlnum.ok ? asAlnum.version : "xeta"}, byte ${asByte.ok ? asByte.version : "xeta"}`,
  );

  check(
    "qr: avtomatik rejim 40 reqem ucun numeriki secir - v1 kifayetdir",
    (() => {
      const auto = encodeQr(digits, { ecLevel: "L" });
      return auto.ok && auto.mode === "numeric" && auto.version === 1;
    })(),
    "avtomatik rejim numerik/v1 vermedi",
  );

  check(
    "qr: kicik herf alfanumerik elifbada yoxdur - byte rejimine dusur",
    (() => {
      const lower = encodeQr("hello world", { ecLevel: "Q" });
      const forced = encodeQr("hello world", { ecLevel: "Q", mode: "alphanumeric" });
      return lower.ok && lower.mode === "byte" && !forced.ok && forced.error.length > 20;
    })(),
    "kicik herfli metn ya byte-a dusmedi, ya da mecburi alfanumerik xeta vermedi",
  );

  /* ---- edges ---- */

  const empty = encodeQr("", { ecLevel: "M" });
  check(
    "qr: bos setir xeta deyil - v1 byte simvolu qurulur",
    empty.ok && empty.version === 1 && empty.size === 21 && empty.mode === "byte",
    empty.ok ? `versiya ${empty.version}, olcu ${empty.size}` : `xeta: ${empty.error}`,
  );

  const maxBytes = qrCapacity(40, "L", "byte");
  const atLimit = encodeQr("a".repeat(maxBytes), { ecLevel: "L", mode: "byte" });
  const overLimit = encodeQr("a".repeat(maxBytes + 1), { ecLevel: "L", mode: "byte" });
  check(
    "qr: 40-L tutumu 2953 bayt - tam tutum isleyir, bir bayt artigi aydin xeta verir",
    maxBytes === 2953 &&
      atLimit.ok &&
      atLimit.version === 40 &&
      !overLimit.ok &&
      overLimit.error.includes("2953"),
    `tutum ${maxBytes}, hedde ${atLimit.ok ? "ok" : "xeta"}, artiq ${overLimit.ok ? "ok (sehv)" : "xeta"}`,
  );

  check(
    "qr: azerbaycan herfleri simvol yox, UTF-8 bayti kimi sayilir",
    (() => {
      // Nine schwas are 18 UTF-8 bytes; version 1-L holds 17 bytes, so the
      // same nine characters that would fit as ASCII must push to version 2.
      const nine = encodeQr("ə".repeat(9), { ecLevel: "L" });
      const ascii = encodeQr("a".repeat(9), { ecLevel: "L", mode: "byte" });
      return (
        nine.ok &&
        nine.byteLength === 18 &&
        nine.version === 2 &&
        ascii.ok &&
        ascii.byteLength === 9 &&
        ascii.version === 1
      );
    })(),
    "9 schwa 18 bayt/v2, 9 ascii 9 bayt/v1 gozlenilirdi",
  );

  check(
    "qr: eyni metn H seviyyesinde L-den boyuk versiya teleb edir",
    (() => {
      const text = "https://camalali.com/aletler/qr";
      const low = encodeQr(text, { ecLevel: "L" });
      const high = encodeQr(text, { ecLevel: "H" });
      return low.ok && high.ok && high.version > low.version;
    })(),
    "H versiyasi L-den boyuk cixmadi",
  );

  /* ---- mask choice, version field, quiet zone ---- */

  check(
    "qr: sekkiz maskanin cerime vektoru qrcodegen etalonu ile eynidir",
    helloSymbol !== null &&
      numericSymbol !== null &&
      azeriSymbol !== null &&
      helloSymbol.penalties.join(",") === HELLO_WORLD_Q_PENALTIES.join(",") &&
      numericSymbol.penalties.join(",") === NUMERIC_01234567_M_PENALTIES.join(",") &&
      azeriSymbol.penalties.join(",") === AZ_SEHER_M_PENALTIES.join(","),
    helloSymbol && numericSymbol && azeriSymbol
      ? `alindi ${helloSymbol.penalties.join(",")} | ${numericSymbol.penalties.join(",")} | ${azeriSymbol.penalties.join(",")}`
      : "qurulmadi",
  );

  check(
    "qr: secilen maska sekkiz variantin en asagi cerimelisidir",
    (() => {
      const samples = ["HELLO WORLD", "Şəhər", "01234567", "", "a".repeat(200)];
      return samples.every((text) => {
        const result = encodeQr(text, { ecLevel: "Q" });
        if (!result.ok) return false;
        const lowest = Math.min(...result.penalties);
        return (
          result.penalties.length === 8 &&
          result.penalties[result.mask] === lowest &&
          result.mask === result.penalties.indexOf(lowest)
        );
      });
    })(),
    "en azi bir numunede secilen maska minimum cerime deyil",
  );

  check(
    "qr: cerime hesabi qaytarilan matrisin ozunden yeniden alinir",
    helloSymbol !== null &&
      maskPenalty(helloSymbol.modules) === helloSymbol.penalties[helloSymbol.mask],
    helloSymbol
      ? `yeniden ${maskPenalty(helloSymbol.modules)}, siyahida ${helloSymbol.penalties[helloSymbol.mask]}`
      : "qurulmadi",
  );

  check(
    "qr: v8 versiya melumat bitleri ISO Table D.1 ile uygundur",
    (() => {
      const result = encodeQr("A", { ecLevel: "L", minVersion: 8 });
      return result.ok && result.version === 8 && versionBits(result) === VERSION_8_INFO_BITS;
    })(),
    `gozlenilen ${VERSION_8_INFO_BITS}`,
  );

  check(
    "qr: sakit zona 4 moduldur - SVG viewBox size+8, ilk modul (4,4)-den baslayir",
    helloSymbol !== null &&
      qrToSvg(helloSymbol).includes(
        `viewBox="0 0 ${helloSymbol.size + 8} ${helloSymbol.size + 8}"`,
      ) &&
      qrToSvg(helloSymbol).includes(`<rect width="${helloSymbol.size + 8}"`) &&
      smallestPathCoordinate(qrPathData(helloSymbol.modules)) === 4,
    "viewBox ve ya yol koordinatlari sakit zonani gostermir",
  );

  /* ---- colour readability ---- */

  check(
    "qr: kontrast xeberdarligi - eyni reng bloklanir, qara/ag temizdir",
    (() => {
      const identical = readabilityWarning("#222222", "#222222");
      const classic = readabilityWarning("#000000", "#ffffff");
      return (
        identical !== null &&
        identical.severity === "bad" &&
        classic === null &&
        Math.round(contrastRatio("#000000", "#ffffff")) === 21
      );
    })(),
    "eyni reng 'bad' vermedi ve ya qara/ag temiz cixmadi",
  );

  check(
    "qr: tersine QR - acig modul, tund fon kontrasti kecir amma xeberdarliq qalir",
    (() => {
      const inverted = readabilityWarning("#ffffff", "#000000");
      return inverted !== null && inverted.severity === "warn";
    })(),
    "tersine reng cutu xeberdarliq vermedi",
  );
};
