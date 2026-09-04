import type { CheckSuite } from "./harness.mts";
import {
  decodeFormatInfo,
  decodeQrImage,
  decodeQrMatrix,
  formatCodewords,
  otsuThreshold,
  reedSolomonCorrect,
  toGrayscale,
} from "../lib/qr-oxuyucu";
import { encodeQr } from "../lib/qr";

/*
 * Where the reference values come from.
 *
 * A decoder that only agrees with the encoder next door proves half of what it
 * looks like it proves, so the anchors below come from outside both.
 *
 * - The three module grids are the ones `qr.mts` already carries: "HELLO
 *   WORLD" at 1-Q, "01234567" at 1-M and "Şəhər" at 1-M. They were produced by
 *   Project Nayuki's qrcodegen and read back with zxing-cpp, and the first is
 *   the standard's own worked example. Feeding them to this file's grid
 *   decoder tests the whole read side — format field, mask, codeword walk,
 *   Reed-Solomon, bit stream — against symbols neither module here produced.
 * - The block of twenty-six codewords is ISO/IEC 18004 Annex I: the sixteen
 *   data codewords of "01234567" at 1-M and its ten parity codewords, printed
 *   in the standard. Damaging it by hand and asking for it back pins the
 *   Reed-Solomon stage on its own, apart from any grid.
 * - The four format words are ISO/IEC 18004 Table C.1: 0x77C4 is L with mask
 *   0, 0x5412 is M with mask 0, 0x355F is Q with mask 0 and 0x083B is H with
 *   mask 7.
 *
 * The encoder is imported once, for the multi-block case only. Versions 1 to 6
 * carry a single Reed-Solomon block at every level, so the three reference
 * grids leave the de-interleave step — the one that reads the blocks column by
 * column — completely untested. Version 10 has four to nine blocks depending on
 * level, there is no published grid for it here, and `qr.ts` is itself held to
 * qrcodegen and to the standard's codeword vectors in its own file. Using it as
 * a source of symbols is therefore a step removed from circular: if the two
 * modules disagree about interleaving, this fails.
 */

/** "HELLO WORLD", version 1, level Q, mask 0. */
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

/** ISO/IEC 18004 Annex I: sixteen data codewords then ten parity codewords. */
const ISO_BLOCK_HEX =
  "10 20 0c 56 61 80 ec 11 ec 11 ec 11 ec 11 ec 11 a5 24 d4 c1 ed 36 c7 87 2c 55";
const ISO_PARITY_LENGTH = 10;

function parseGrid(block: string): boolean[][] {
  return block
    .trim()
    .split("\n")
    .map((line) => [...line.trim()].map((cell) => cell === "1"));
}

function parseHex(value: string): Uint8Array {
  return Uint8Array.from(value.split(" ").map((byte) => parseInt(byte, 16)));
}

/**
 * Paints a module grid into RGBA bytes the way a canvas would hand them over:
 * white ground, dark modules, a quiet zone of `quiet` modules on every side.
 * No DOM anywhere — this is a typed array and two loops.
 */
function renderToPixels(
  matrix: boolean[][],
  scale: number,
  quiet: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const size = matrix.length;
  const side = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (!matrix[row][column]) continue;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const px = (quiet + column) * scale + x;
          const py = (quiet + row) * scale + y;
          const offset = (py * side + px) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
        }
      }
    }
  }
  return { data, width: side, height: side };
}

function rotate180(matrix: boolean[][]): boolean[][] {
  return matrix.map((row) => [...row].reverse()).reverse();
}

function hammingDistance(a: number, b: number): number {
  let value = a ^ b;
  let count = 0;
  while (value !== 0) {
    value &= value - 1;
    count++;
  }
  return count;
}

/** A message that is present, in Azerbaijani, and long enough to say something. */
function isRealReason(value: string): boolean {
  return value.trim().length >= 40 && /[əıöüçşğİ]/i.test(value);
}

export const checks: CheckSuite = (check) => {
  /* ---- the three reference grids, decoded end to end ---- */

  const hello = decodeQrMatrix(parseGrid(HELLO_WORLD_Q));
  check(
    "qr-oxuyucu: HELLO WORLD 1-Q etalon matrisi metne qayidir",
    hello.ok &&
      hello.text === "HELLO WORLD" &&
      hello.version === 1 &&
      hello.ecLevel === "Q" &&
      hello.mask === 0 &&
      hello.correctedCodewords === 0 &&
      hello.segments.length === 1 &&
      hello.segments[0].mode === "alphanumeric",
    hello.ok ? `alindi «${hello.text}», v${hello.version}-${hello.ecLevel}, maska ${hello.mask}` : hello.error,
  );

  const numeric = decodeQrMatrix(parseGrid(NUMERIC_01234567_M));
  check(
    "qr-oxuyucu: 01234567 1-M numerik etalonu duzgun oxunur",
    numeric.ok &&
      numeric.text === "01234567" &&
      numeric.ecLevel === "M" &&
      numeric.segments[0]?.mode === "numeric",
    numeric.ok ? `alindi «${numeric.text}», ${numeric.segments[0]?.mode}` : numeric.error,
  );

  const azeri = decodeQrMatrix(parseGrid(AZ_SEHER_M));
  check(
    "qr-oxuyucu: byte rejimi UTF-8 azerbaycan herflerini berpa edir",
    azeri.ok &&
      azeri.text === "Şəhər" &&
      azeri.mask === 2 &&
      azeri.segments[0]?.mode === "byte" &&
      azeri.segments[0]?.count === 8,
    azeri.ok ? `alindi «${azeri.text}», ${azeri.segments[0]?.count} bayt` : azeri.error,
  );

  /* ---- format field ---- */

  const table = formatCodewords();
  let minimumDistance = 15;
  for (let i = 0; i < table.length; i++) {
    for (let j = i + 1; j < table.length; j++) {
      minimumDistance = Math.min(minimumDistance, hammingDistance(table[i].bits, table[j].bits));
    }
  }
  const formatAnchors: [number, string, number][] = [
    [0x77c4, "L", 0],
    [0x5412, "M", 0],
    [0x355f, "Q", 0],
    [0x083b, "H", 7],
  ];
  const anchorsOk = formatAnchors.every(([bits, level, mask]) => {
    const decoded = decodeFormatInfo(bits);
    return decoded !== null && decoded.ecLevel === level && decoded.mask === mask && decoded.distance === 0;
  });
  check(
    "qr-oxuyucu: 32 format sozu var, en kicik mesafe 7-dir, ve ISO Table C.1 lengerleri dogru (seviyye,maska) cutunu verir",
    table.length === 32 &&
      new Set(table.map((entry) => entry.bits)).size === 32 &&
      minimumDistance === 7 &&
      anchorsOk,
    `${table.length} soz, en kicik Hemminq mesafesi ${minimumDistance}, lengerler ${anchorsOk ? "dogru" : "sehv"}`,
  );

  check(
    "qr-oxuyucu: format sahesinde 3 bit zedeni BCH duzeldir, 5 biti duzeltmir",
    (() => {
      const threeBits = decodeFormatInfo(0x083b ^ 0b1000000000101);
      const fiveBits = decodeFormatInfo(0x083b ^ 0b1010101010101);
      return (
        threeBits !== null &&
        threeBits.ecLevel === "H" &&
        threeBits.mask === 7 &&
        threeBits.distance === 3 &&
        fiveBits === null
      );
    })(),
    "uc bitlik zede berpa olunmadi ve ya bes bitlik zede sessizce qebul edildi",
  );

  /* ---- Reed-Solomon, apart from any grid ---- */

  const isoBlock = parseHex(ISO_BLOCK_HEX);
  const clean = reedSolomonCorrect(isoBlock, ISO_PARITY_LENGTH);

  const damaged = isoBlock.slice();
  damaged[0] ^= 0xff;
  damaged[3] ^= 0x0f;
  damaged[9] ^= 0x81;
  damaged[20] ^= 0x33;
  damaged[25] ^= 0x01;
  const repaired = reedSolomonCorrect(damaged, ISO_PARITY_LENGTH);

  check(
    "qr-oxuyucu: ISO Annex I bloku temiz oxunur (sifir duzelis) ve 10 paritet bayti 5 zedeli kodsozu berpa edir",
    clean !== null &&
      clean.corrected === 0 &&
      clean.data.length === 16 &&
      [...clean.data].every((byte, index) => byte === isoBlock[index]) &&
      repaired !== null &&
      repaired.corrected === 5 &&
      [...repaired.data].every((byte, index) => byte === isoBlock[index]),
    `temiz: ${clean === null ? "redd edildi" : `${clean.corrected} duzelis, ${clean.data.length} bayt`}; zedeli: ${repaired === null ? "berpa alinmadi" : `${repaired.corrected} kodsoz duzeldildi`}`,
  );

  const wrecked = isoBlock.slice();
  for (let i = 0; i < 8; i++) wrecked[i] ^= 0xa5;
  check(
    "qr-oxuyucu: hedden artiq zede sessizce 'duzeldilmir' - null qayidir",
    reedSolomonCorrect(wrecked, ISO_PARITY_LENGTH) === null,
    "8 zedeli kodsoz 5 duzelis hedini asir, buna baxmayaraq netice qaytarildi",
  );

  /* ---- pixels ---- */

  check(
    "qr-oxuyucu: boz cevirmesi Rec.601 cekilerini isledir, Otsu heddi iki yigin arasina dusur",
    (() => {
      const gray = toGrayscale(
        Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255]),
      );
      const grayOk = gray[0] === 76 && gray[1] === 150 && gray[2] === 29 && gray[3] === 255 && gray[4] === 0;

      const histogram = new Uint8ClampedArray(200);
      for (let i = 0; i < 100; i++) {
        histogram[i] = 20;
        histogram[i + 100] = 220;
      }
      const threshold = otsuThreshold(histogram);
      return grayOk && threshold > 20 && threshold < 220;
    })(),
    "boz deyerleri (gozlenilen 76/150/29/255/0) ve ya Otsu heddi (20-220 arasi gozlenilirdi) kenara cixdi",
  );

  /* ---- the pixel pipeline, end to end ---- */

  const helloGrid = parseGrid(HELLO_WORLD_Q);
  const upright = renderToPixels(helloGrid, 6, 4);
  const fromPixels = decodeQrImage(upright.data, upright.width, upright.height);

  const turned = renderToPixels(rotate180(helloGrid), 6, 4);
  const fromTurned = decodeQrImage(turned.data, turned.width, turned.height);

  check(
    "qr-oxuyucu: piksellerden tam boru xetti - dik ve 180 derece cevrilmis sekil ikisi de HELLO WORLD-u berpa edir",
    fromPixels.ok &&
      fromPixels.text === "HELLO WORLD" &&
      fromPixels.moduleSize === 6 &&
      fromTurned.ok &&
      fromTurned.text === "HELLO WORLD",
    `dik: ${fromPixels.ok ? `«${fromPixels.text}», modul ${fromPixels.moduleSize}px` : fromPixels.error}; 180°: ${fromTurned.ok ? `«${fromTurned.text}»` : fromTurned.error}`,
  );

  const blank = new Uint8ClampedArray(120 * 120 * 4).fill(255);
  const empty = decodeQrImage(blank, 120, 120);

  const tiny = decodeQrImage(new Uint8ClampedArray(10 * 10 * 4).fill(255), 10, 10);

  check(
    "qr-oxuyucu: QR olmayan boz sekil 'finder' sebebi ile, 21 pikselden kicik sekil olculmezden evvel redd olunur",
    !empty.ok &&
      empty.stage === "finder" &&
      isRealReason(empty.error) &&
      !tiny.ok &&
      tiny.stage === "image" &&
      tiny.error.includes("21"),
    `boz: ${empty.ok ? `«${empty.text}» qaytardi` : `${empty.stage}: ${empty.error.slice(0, 50)}`}; kicik: ${tiny.ok ? "netice verdi" : `${tiny.stage}: ${tiny.error.slice(0, 50)}`}`,
  );

  /* ---- damage, and the line between repairing and guessing ---- */

  const scratched = helloGrid.map((row) => [...row]);
  for (const [row, column] of [
    [10, 10],
    [10, 11],
    [11, 10],
    [11, 11],
  ]) {
    scratched[row][column] = !scratched[row][column];
  }
  const healed = decodeQrMatrix(scratched);
  check(
    "qr-oxuyucu: dord zedeli modul Q seviyyesinde berpa olunur ve sayilir",
    healed.ok && healed.text === "HELLO WORLD" && healed.correctedCodewords > 0,
    healed.ok ? `${healed.correctedCodewords} kodsoz duzeldildi` : healed.error,
  );

  const shredded = helloGrid.map((row) => [...row]);
  for (let row = 9; row <= 12; row++) {
    for (let column = 0; column < 21; column++) shredded[row][column] = !shredded[row][column];
  }
  const lost = decodeQrMatrix(shredded);
  check(
    "qr-oxuyucu: dort setirlik zede sehv metn yox, adli xeta verir",
    !lost.ok && lost.stage === "correction" && isRealReason(lost.error),
    lost.ok ? `sehv metn qaytardi: «${lost.text}»` : `${lost.stage}: ${lost.error.slice(0, 50)}`,
  );

  check(
    "qr-oxuyucu: 61x61 sebeke versiya 11 kimi taninir ve 1-10 heddi adlanir",
    (() => {
      const oversized = Array.from({ length: 61 }, () => new Array<boolean>(61).fill(false));
      const result = decodeQrMatrix(oversized);
      return !result.ok && result.stage === "version" && result.error.includes("1–10");
    })(),
    "boyuk sebeke ya oxundu, ya da hedd mesajsiz redd edildi",
  );

  /* ---- interleaving, which only a multi-block version exercises ---- */

  check(
    "qr-oxuyucu: cox blokli v10 simvollari her dord seviyyede acilir",
    (() => {
      const text = "b".repeat(60);
      return (["L", "M", "Q", "H"] as const).every((ecLevel) => {
        const encoded = encodeQr(text, { ecLevel, minVersion: 10 });
        if (!encoded.ok || encoded.version !== 10) return false;
        const decoded = decodeQrMatrix(encoded.modules);
        return decoded.ok && decoded.text === text && decoded.ecLevel === ecLevel;
      });
    })(),
    "en azi bir v10 seviyyesi geri oxunmadi - blok deinterleave sehvdir",
  );
};
