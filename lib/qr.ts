/**
 * QR code generation to the ISO/IEC 18004 model 2 rules, written out in full
 * because the site carries no third-party code: encoding in all three data
 * modes, Reed-Solomon parity over GF(256), the eight mask patterns with the
 * penalty rule that picks between them, and the BCH-protected format and
 * version fields.
 *
 * Nothing here touches the DOM. The module grid is the product; SVG, a canvas
 * or a printout are all views of it, and the widget picks one.
 */

export type QrEcLevel = "L" | "M" | "Q" | "H";

/**
 * The three data modes model 2 defines for ordinary text. Kanji mode exists in
 * the standard too and is left out on purpose: it needs a Shift-JIS table this
 * site has no use for, and the byte mode below already carries any character
 * an Azerbaijani page will ever hold.
 */
export type QrMode = "numeric" | "alphanumeric" | "byte";

export type QrEncodeOptions = {
  ecLevel?: QrEcLevel;
  /** Left out means "the smallest mode the text fits in". */
  mode?: QrMode;
  /** Left out means "the mask with the lowest penalty", which is the rule. */
  mask?: number;
  /** Refuse anything below this version even if the text would fit. */
  minVersion?: number;
};

export type QrSymbol = {
  ok: true;
  version: number;
  /** Side length in modules, quiet zone excluded: 4 x version + 17. */
  size: number;
  ecLevel: QrEcLevel;
  mode: QrMode;
  mask: number;
  /**
   * The penalty each of the eight masks scored on this symbol, in mask order.
   * Kept rather than discarded so the choice is checkable from outside: the
   * chosen mask has to be the argmin of this list, and a test can say so.
   */
  penalties: number[];
  /** Row-major, `true` = dark. Quiet zone is not part of it. */
  modules: boolean[][];
  /**
   * The final codeword stream, data blocks then parity blocks, interleaved as
   * they were laid into the grid. Carried on the result rather than thrown
   * away because it is the layer the standard's worked examples are written
   * in: a matrix that disagrees with a reference can be traced to either the
   * encoder or the placement only if this is visible.
   */
  codewords: Uint8Array;
  darkModules: number;
  /** UTF-8 byte count of the input — what byte mode actually counts. */
  byteLength: number;
  /** Data codewords this version and level hold, and how many were used. */
  capacityBytes: number;
  usedBytes: number;
};

export type QrFailure = { ok: false; error: string };

export type QrResult = QrSymbol | QrFailure;

/**
 * Four modules of light margin on every side. The standard makes this part of
 * the symbol, not decoration: a scanner locates the finder patterns by the
 * light run around them, and a QR pasted flush against dark artwork reads as
 * often as not.
 */
export const QUIET_ZONE = 4;

const MIN_VERSION = 1;
const MAX_VERSION = 40;

/** Order used by the tables below; not the order the format field encodes. */
const EC_INDEX: Record<QrEcLevel, number> = { L: 0, M: 1, Q: 2, H: 3 };

/** The two bits the format field carries. L is 01 and M is 00 — not a typo. */
const EC_FORMAT_BITS: Record<QrEcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Roughly how much damage each level survives, for the widget to show. */
export const EC_RECOVERY: Record<QrEcLevel, number> = { L: 7, M: 15, Q: 25, H: 30 };

/* ---------- tables from ISO/IEC 18004 ---------- */

/*
 * Error correction codewords per block, indexed [level][version]. Index 0 is
 * padding so the version number indexes directly. Table 13-22 of the standard,
 * in the compact form every implementation reduces those tables to.
 */
const ECC_PER_BLOCK: number[][] = [
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

/** Number of error correction blocks, indexed [level][version]. */
const NUM_BLOCKS: number[][] = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [0, 1, 1, 2, 4, 4, 4, 5, 5, 8, 9, 9, 10, 12, 16, 12, 17, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77],
];

const ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/* ---------- geometry ---------- */

export function qrSize(version: number): number {
  return version * 4 + 17;
}

/**
 * Modules a symbol has left for data once the function patterns are drawn.
 * The closed form is the standard's own: the square minus the finders and
 * timing lines, minus the alignment patterns that appear from version 2, minus
 * the version field that appears from version 7.
 */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignCount = Math.floor(version / 7) + 2;
    result -= (25 * alignCount - 10) * alignCount - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Data codewords available, parity already subtracted. */
export function dataCodewordCount(version: number, ecLevel: QrEcLevel): number {
  const ec = EC_INDEX[ecLevel];
  return (
    Math.floor(rawDataModules(version) / 8) -
    ECC_PER_BLOCK[ec][version] * NUM_BLOCKS[ec][version]
  );
}

/**
 * Row and column centres of the alignment patterns. Version 32 is the one
 * exception the standard hard-codes: its spacing does not come out of the
 * general formula.
 */
function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (let pos = version * 4 + 10; positions.length < count; pos -= step) {
    positions.splice(1, 0, pos);
  }
  return positions;
}

/* ---------- Galois field GF(256) ---------- */

/*
 * Reed-Solomon here works over GF(256) with the primitive polynomial
 * x^8 + x^4 + x^3 + x^2 + 1 (0x11d), which is the one the standard names.
 * Exponent and log tables turn every multiplication into two lookups and an
 * addition; the exponent table is doubled in length so the addition never has
 * to be reduced modulo 255 at the call site.
 */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** The divisor polynomial (x - a^0)(x - a^1)...(x - a^(degree-1)), monic. */
function rsGenerator(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

/** The remainder of data / generator — the parity codewords, in order. */
function rsRemainder(data: Uint8Array, generator: Uint8Array): Uint8Array {
  const result = new Uint8Array(generator.length);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < result.length; i++) {
      result[i] ^= gfMultiply(generator[i], factor);
    }
  }
  return result;
}

/* ---------- bit buffer ---------- */

class BitBuffer {
  readonly bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }

  get length(): number {
    return this.bits.length;
  }
}

/* ---------- mode choice and segment sizing ---------- */

function isNumeric(text: string): boolean {
  return text.length > 0 && /^[0-9]+$/.test(text);
}

function isAlphanumeric(text: string): boolean {
  for (const char of text) {
    if (!ALPHANUMERIC_CHARSET.includes(char)) return false;
  }
  return text.length > 0;
}

/**
 * The smallest mode that can carry the text. Numeric packs three digits into
 * ten bits and alphanumeric two characters into eleven, so the same string can
 * land two versions apart depending on which one is legal — "1234567890" is
 * 34 bits as digits and 80 as bytes.
 */
export function chooseMode(text: string): QrMode {
  if (isNumeric(text)) return "numeric";
  if (isAlphanumeric(text)) return "alphanumeric";
  return "byte";
}

export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Bits in the character count field — it widens twice as versions grow. */
function characterCountBits(mode: QrMode, version: number): number {
  const tier = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  if (mode === "numeric") return [10, 12, 14][tier];
  if (mode === "alphanumeric") return [9, 11, 13][tier];
  return [8, 16, 16][tier];
}

const MODE_INDICATOR: Record<QrMode, number> = {
  numeric: 0b0001,
  alphanumeric: 0b0010,
  byte: 0b0100,
};

/** How many units the character count field reports: characters, or bytes. */
function unitCount(mode: QrMode, text: string, bytes: Uint8Array): number {
  return mode === "byte" ? bytes.length : [...text].length;
}

function segmentBitLength(mode: QrMode, count: number, version: number): number {
  const header = 4 + characterCountBits(mode, version);
  if (mode === "numeric") {
    const remainder = count % 3;
    return header + 10 * Math.floor(count / 3) + (remainder === 0 ? 0 : remainder === 1 ? 4 : 7);
  }
  if (mode === "alphanumeric") {
    return header + 11 * Math.floor(count / 2) + (count % 2 === 1 ? 6 : 0);
  }
  return header + 8 * count;
}

/**
 * Characters (byte mode: bytes) that still fit at this version and level.
 * Exported because the widget shows the headroom left, and because the check
 * suite needs a number to walk one past.
 */
export function qrCapacity(version: number, ecLevel: QrEcLevel, mode: QrMode): number {
  const capacityBits = dataCodewordCount(version, ecLevel) * 8;
  const header = 4 + characterCountBits(mode, version);
  const payload = capacityBits - header;
  if (payload < 0) return 0;
  if (mode === "byte") return Math.floor(payload / 8);
  if (mode === "alphanumeric") {
    const pairs = Math.floor(payload / 11);
    return payload % 11 >= 6 ? pairs * 2 + 1 : pairs * 2;
  }
  const triples = Math.floor(payload / 10);
  const spare = payload % 10;
  return triples * 3 + (spare >= 7 ? 2 : spare >= 4 ? 1 : 0);
}

/* ---------- data encoding ---------- */

function writeSegment(
  buffer: BitBuffer,
  mode: QrMode,
  text: string,
  bytes: Uint8Array,
  version: number,
): void {
  const characters = [...text];
  buffer.push(MODE_INDICATOR[mode], 4);
  buffer.push(unitCount(mode, text, bytes), characterCountBits(mode, version));

  if (mode === "numeric") {
    for (let i = 0; i < characters.length; i += 3) {
      const group = characters.slice(i, i + 3).join("");
      buffer.push(Number(group), group.length * 3 + 1);
    }
    return;
  }

  if (mode === "alphanumeric") {
    for (let i = 0; i < characters.length; i += 2) {
      const first = ALPHANUMERIC_CHARSET.indexOf(characters[i]);
      if (i + 1 === characters.length) {
        buffer.push(first, 6);
      } else {
        buffer.push(first * 45 + ALPHANUMERIC_CHARSET.indexOf(characters[i + 1]), 11);
      }
    }
    return;
  }

  for (const byte of bytes) buffer.push(byte, 8);
}

/**
 * Pad the message out to the version's data capacity: up to four terminator
 * zeros, zeros to the next byte boundary, then 0xec and 0x11 alternating. The
 * two pad bytes are fixed by the standard, not arbitrary filler.
 */
function toDataCodewords(buffer: BitBuffer, capacityBytes: number): Uint8Array {
  const capacityBits = capacityBytes * 8;
  const bits = buffer.bits.slice();
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = new Uint8Array(capacityBytes);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) codewords[i >>> 3] |= 0x80 >>> (i & 7);
  }
  for (let i = bits.length / 8, pad = 0xec; i < capacityBytes; i++, pad ^= 0xec ^ 0x11) {
    codewords[i] = pad;
  }
  return codewords;
}

/**
 * Split into blocks, add parity to each, then read the blocks column by column.
 * The interleave is the whole point of the exercise: a scratch that destroys
 * twenty consecutive codewords on the printed symbol lands as a few codewords
 * in each block, and every block stays inside what its parity can repair.
 */
function interleave(data: Uint8Array, version: number, ecLevel: QrEcLevel): Uint8Array {
  const ec = EC_INDEX[ecLevel];
  const blockCount = NUM_BLOCKS[ec][version];
  const ecPerBlock = ECC_PER_BLOCK[ec][version];
  const totalCodewords = Math.floor(rawDataModules(version) / 8);

  const shortBlockCount = blockCount - (totalCodewords % blockCount);
  const shortBlockLength = Math.floor(totalCodewords / blockCount);
  const generator = rsGenerator(ecPerBlock);

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < blockCount; i++) {
    const length = shortBlockLength - ecPerBlock + (i < shortBlockCount ? 0 : 1);
    const block = data.subarray(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    ecBlocks.push(rsRemainder(block, generator));
  }

  const result = new Uint8Array(totalCodewords);
  let cursor = 0;
  const longestData = shortBlockLength - ecPerBlock + 1;
  for (let i = 0; i < longestData; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) result[cursor++] = block[i];
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of ecBlocks) result[cursor++] = block[i];
  }
  return result;
}

/* ---------- matrix ---------- */

type Grid = {
  size: number;
  modules: boolean[][];
  /** Function patterns are immune to masking, so they are tracked apart. */
  reserved: boolean[][];
};

function newGrid(size: number): Grid {
  return {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

function setFunction(grid: Grid, row: number, col: number, dark: boolean): void {
  if (row < 0 || col < 0 || row >= grid.size || col >= grid.size) return;
  grid.modules[row][col] = dark;
  grid.reserved[row][col] = true;
}

/** The 7x7 eye: rings at Chebyshev distance 0-1 and 3 are dark, 2 and 4 light. */
function drawFinder(grid: Grid, row: number, col: number): void {
  for (let dr = -4; dr <= 4; dr++) {
    for (let dc = -4; dc <= 4; dc++) {
      const ring = Math.max(Math.abs(dr), Math.abs(dc));
      setFunction(grid, row + dr, col + dc, ring !== 2 && ring !== 4);
    }
  }
}

function drawAlignment(grid: Grid, row: number, col: number): void {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      setFunction(grid, row + dr, col + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
}

/**
 * Fifteen bits: five of payload (level and mask) and ten of BCH(15,5) parity,
 * masked with 0x5412 so that an all-zero payload still produces a pattern a
 * scanner can lock onto. Written twice, since the copy beside the top-left
 * finder is destroyed by any damage that takes that corner.
 */
function drawFormat(grid: Grid, ecLevel: QrEcLevel, mask: number): void {
  const payload = (EC_FORMAT_BITS[ecLevel] << 3) | mask;
  let remainder = payload;
  for (let i = 0; i < 10; i++) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  const bits = ((payload << 10) | remainder) ^ 0x5412;
  const bit = (index: number) => ((bits >>> index) & 1) !== 0;

  for (let i = 0; i <= 5; i++) setFunction(grid, i, 8, bit(i));
  setFunction(grid, 7, 8, bit(6));
  setFunction(grid, 8, 8, bit(7));
  setFunction(grid, 8, 7, bit(8));
  for (let i = 9; i < 15; i++) setFunction(grid, 8, 14 - i, bit(i));

  for (let i = 0; i < 8; i++) setFunction(grid, 8, grid.size - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) setFunction(grid, grid.size - 15 + i, 8, bit(i));

  // The one module that is dark in every symbol ever made.
  setFunction(grid, grid.size - 8, 8, true);
}

/**
 * Eighteen bits — six of version and twelve of BCH(18,6) parity — repeated in
 * the two corners that hold no finder. Only from version 7: below that the
 * scanner counts modules instead.
 */
function drawVersion(grid: Grid, version: number): void {
  if (version < 7) return;
  let remainder = version;
  for (let i = 0; i < 12; i++) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  const bits = (version << 12) | remainder;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) !== 0;
    const near = grid.size - 11 + (i % 3);
    const far = Math.floor(i / 3);
    setFunction(grid, far, near, dark);
    setFunction(grid, near, far, dark);
  }
}

function drawFunctionPatterns(grid: Grid, version: number, ecLevel: QrEcLevel): void {
  for (let i = 0; i < grid.size; i++) {
    setFunction(grid, 6, i, i % 2 === 0);
    setFunction(grid, i, 6, i % 2 === 0);
  }

  drawFinder(grid, 3, 3);
  drawFinder(grid, 3, grid.size - 4);
  drawFinder(grid, grid.size - 4, 3);

  const positions = alignmentPositions(version);
  const last = positions.length - 1;
  for (let i = 0; i < positions.length; i++) {
    for (let j = 0; j < positions.length; j++) {
      // The three corners already carry a finder pattern.
      const onFinder =
        (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
      if (!onFinder) drawAlignment(grid, positions[i], positions[j]);
    }
  }

  // Mask 0 is a placeholder: the real format field is written once the mask
  // is known, but the modules have to be reserved before data is placed.
  drawFormat(grid, ecLevel, 0);
  drawVersion(grid, version);
}

/**
 * Codewords are laid in two-module-wide columns walking right to left,
 * alternating upward and downward. Column 6 is skipped whole — it is the
 * vertical timing line — and the walk steps over every reserved module.
 */
function drawCodewords(grid: Grid, codewords: Uint8Array): void {
  let bitIndex = 0;
  const totalBits = codewords.length * 8;

  for (let right = grid.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < grid.size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? grid.size - 1 - vertical : vertical;
        if (!grid.reserved[row][col] && bitIndex < totalBits) {
          const byte = codewords[bitIndex >>> 3];
          grid.modules[row][col] = ((byte >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex++;
        }
      }
    }
  }
}

/** The eight mask conditions, in the order the format field numbers them. */
const MASK_CONDITIONS: ((row: number, col: number) => boolean)[] = [
  (row, col) => (row + col) % 2 === 0,
  (row) => row % 2 === 0,
  (_row, col) => col % 3 === 0,
  (row, col) => (row + col) % 3 === 0,
  (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
  (row, col) => ((row * col) % 2) + ((row * col) % 3) === 0,
  (row, col) => (((row * col) % 2) + ((row * col) % 3)) % 2 === 0,
  (row, col) => (((row + col) % 2) + ((row * col) % 3)) % 2 === 0,
];

function applyMask(grid: Grid, mask: number): void {
  const condition = MASK_CONDITIONS[mask];
  for (let row = 0; row < grid.size; row++) {
    for (let col = 0; col < grid.size; col++) {
      if (!grid.reserved[row][col] && condition(row, col)) {
        grid.modules[row][col] = !grid.modules[row][col];
      }
    }
  }
}

/* ---------- penalty ---------- */

const PENALTY_RUN = 3; // N1: a run of five or more same-coloured modules
const PENALTY_BLOCK = 3; // N2: a 2x2 block of one colour
const PENALTY_FINDER_LOOK_ALIKE = 40; // N3: the 1:1:3:1:1 finder ratio in the data
const PENALTY_BALANCE = 10; // N4: dark share drifting away from half

/**
 * Counts 1:1:3:1:1 sequences with a light run of four on one side — the
 * pattern a scanner reads as a finder. The history holds the last seven runs;
 * a hit needs the middle five to be in ratio and one flank to be wide enough.
 */
function countFinderLookAlikes(history: number[]): number {
  const unit = history[1];
  const core =
    unit > 0 &&
    history[2] === unit &&
    history[3] === unit * 3 &&
    history[4] === unit &&
    history[5] === unit;
  return (
    (core && history[0] >= unit * 4 && history[6] >= unit ? 1 : 0) +
    (core && history[6] >= unit * 4 && history[0] >= unit ? 1 : 0)
  );
}

function pushRun(history: number[], length: number, size: number): void {
  // The quiet zone counts as light, so the first run of a line behaves as if
  // a full symbol width of light preceded it.
  const value = history[0] === 0 ? length + size : length;
  history.pop();
  history.unshift(value);
}

function finishLine(history: number[], darkRun: boolean, length: number, size: number): number {
  let run = length;
  if (darkRun) {
    pushRun(history, run, size);
    run = 0;
  }
  pushRun(history, run + size, size);
  return countFinderLookAlikes(history);
}

/**
 * The score the standard uses to rank masks: lower is better, and the four
 * rules are weighted so that a symbol which merely looks busy never beats one
 * that carries a false finder pattern.
 */
export function maskPenalty(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;

  for (let pass = 0; pass < 2; pass++) {
    const byRow = pass === 0;
    for (let outer = 0; outer < size; outer++) {
      const history = [0, 0, 0, 0, 0, 0, 0];
      let runColor = false;
      let runLength = 0;
      for (let inner = 0; inner < size; inner++) {
        const dark = byRow ? modules[outer][inner] : modules[inner][outer];
        if (dark === runColor) {
          runLength++;
          if (runLength === 5) score += PENALTY_RUN;
          else if (runLength > 5) score++;
        } else {
          pushRun(history, runLength, size);
          if (!runColor) score += countFinderLookAlikes(history) * PENALTY_FINDER_LOOK_ALIKE;
          runColor = dark;
          runLength = 1;
        }
      }
      score += finishLine(history, runColor, runLength, size) * PENALTY_FINDER_LOOK_ALIKE;
    }
  }

  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const color = modules[row][col];
      if (
        color === modules[row][col + 1] &&
        color === modules[row + 1][col] &&
        color === modules[row + 1][col + 1]
      ) {
        score += PENALTY_BLOCK;
      }
    }
  }

  const total = size * size;
  const dark = countDark(modules);
  // Smallest k with the dark share inside 50% +- (5k)%.
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  score += k * PENALTY_BALANCE;

  return score;
}

function countDark(modules: boolean[][]): number {
  let dark = 0;
  for (const row of modules) {
    for (const cell of row) if (cell) dark++;
  }
  return dark;
}

/* ---------- the encoder ---------- */

const EMPTY_MODE: QrMode = "byte";

function modeFits(mode: QrMode, text: string): boolean {
  if (text === "") return true;
  if (mode === "numeric") return isNumeric(text);
  if (mode === "alphanumeric") return isAlphanumeric(text);
  return true;
}

const MODE_LABELS: Record<QrMode, string> = {
  numeric: "rəqəm",
  alphanumeric: "alfanumerik",
  byte: "bayt",
};

export function encodeQr(text: string, options: QrEncodeOptions = {}): QrResult {
  const ecLevel = options.ecLevel ?? "M";
  const mode = options.mode ?? (text === "" ? EMPTY_MODE : chooseMode(text));
  const minVersion = Math.max(MIN_VERSION, options.minVersion ?? MIN_VERSION);

  if (!modeFits(mode, text)) {
    return {
      ok: false,
      error:
        mode === "numeric"
          ? "Rəqəm rejimi yalnız 0–9 qəbul edir. Mətndə başqa simvol var."
          : "Alfanumerik rejim yalnız 0–9, A–Z və $ % * + - . / : boşluq simvollarını qəbul edir. Kiçik hərf də bura girmir.",
    };
  }

  const bytes = utf8Bytes(text);
  const count = unitCount(mode, text, bytes);

  let version = 0;
  let capacityBytes = 0;
  for (let candidate = minVersion; candidate <= MAX_VERSION; candidate++) {
    const capacity = dataCodewordCount(candidate, ecLevel);
    if (segmentBitLength(mode, count, candidate) <= capacity * 8) {
      version = candidate;
      capacityBytes = capacity;
      break;
    }
  }

  if (version === 0) {
    const limit = qrCapacity(MAX_VERSION, ecLevel, mode);
    const unit = mode === "byte" ? "bayt" : "simvol";
    return {
      ok: false,
      error: `Mətn sığmır: ${MODE_LABELS[mode]} rejimində ${ecLevel} səviyyəsi ilə ən böyük QR ${limit} ${unit} saxlayır, sənin mətnin ${count} ${unit}. Mətni qısalt və ya xəta düzəltmə səviyyəsini aşağı sal.`,
    };
  }

  const buffer = new BitBuffer();
  writeSegment(buffer, mode, text, bytes, version);
  const codewords = interleave(toDataCodewords(buffer, capacityBytes), version, ecLevel);

  const size = qrSize(version);
  const base = newGrid(size);
  drawFunctionPatterns(base, version, ecLevel);
  drawCodewords(base, codewords);

  /*
   * All eight masks are built and scored even when one is asked for, because
   * the penalties are part of the result: the widget shows why this mask won
   * and the check suite proves the winner is the minimum. Eight passes over a
   * grid that is at most 177 modules a side is not worth optimising away.
   */
  const penalties: number[] = [];
  const candidates: boolean[][][] = [];
  for (let candidate = 0; candidate < 8; candidate++) {
    const grid: Grid = {
      size,
      modules: base.modules.map((row) => row.slice()),
      reserved: base.reserved,
    };
    applyMask(grid, candidate);
    drawFormat(grid, ecLevel, candidate);
    penalties.push(maskPenalty(grid.modules));
    candidates.push(grid.modules);
  }

  let mask = options.mask ?? 0;
  if (options.mask === undefined) {
    for (let candidate = 1; candidate < 8; candidate++) {
      if (penalties[candidate] < penalties[mask]) mask = candidate;
    }
  }

  const modules = candidates[mask];
  return {
    ok: true,
    version,
    size,
    ecLevel,
    mode,
    mask,
    penalties,
    modules,
    codewords,
    darkModules: countDark(modules),
    byteLength: bytes.length,
    capacityBytes,
    usedBytes: Math.ceil(buffer.length / 8),
  };
}

/* ---------- views ---------- */

/**
 * One path covering every dark module, horizontal runs merged. A rect per
 * module is the obvious shape and it is also 30k of markup for a version 10
 * symbol; a merged path holds the same picture in a fraction of that, and both
 * scale without any of the seams a bitmap gets.
 */
export function qrPathData(modules: boolean[][], quietZone: number = QUIET_ZONE): string {
  const parts: string[] = [];
  for (let row = 0; row < modules.length; row++) {
    let col = 0;
    while (col < modules.length) {
      if (!modules[row][col]) {
        col++;
        continue;
      }
      let run = 0;
      while (col + run < modules.length && modules[row][col + run]) run++;
      parts.push(`M${col + quietZone} ${row + quietZone}h${run}v1h-${run}z`);
      col += run;
    }
  }
  return parts.join("");
}

export type QrSvgOptions = {
  dark?: string;
  light?: string;
  /** Pixels per module. Left out, the SVG carries no width and scales freely. */
  scale?: number;
  quietZone?: number;
};

export function qrToSvg(symbol: QrSymbol, options: QrSvgOptions = {}): string {
  const dark = options.dark ?? "#000000";
  const light = options.light ?? "#ffffff";
  const quietZone = options.quietZone ?? QUIET_ZONE;
  const side = symbol.size + quietZone * 2;
  const scale = options.scale;
  const dimensions = scale ? ` width="${side * scale}" height="${side * scale}"` : "";

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}"${dimensions} shape-rendering="crispEdges">`,
    `<rect width="${side}" height="${side}" fill="${light}"/>`,
    `<path fill="${dark}" d="${qrPathData(symbol.modules, quietZone)}"/>`,
    `</svg>`,
  ].join("");
}

/* ---------- colour readability ---------- */

/** #rgb and #rrggbb only — the two forms a colour input can hand over. */
export function parseHexColor(value: string): [number, number, number] | null {
  const hex = value.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const first = parseHexColor(a);
  const second = parseHexColor(b);
  if (!first || !second) return 1;
  const light = Math.max(relativeLuminance(first), relativeLuminance(second));
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Two ways a colour pair breaks a scanner, and they are separate faults.
 *
 * Too little contrast is the obvious one; the threshold is 3:1, below which a
 * phone camera in ordinary indoor light stops separating the modules. The
 * other is inversion — light modules on a dark ground is perfectly readable to
 * a human and is rejected outright by a good share of scanners, which look for
 * dark-on-light and never try the negative.
 */
export function readabilityWarning(
  dark: string,
  light: string,
): { severity: "warn" | "bad"; message: string } | null {
  const ratio = contrastRatio(dark, light);
  if (ratio < 3) {
    return {
      severity: "bad",
      message: `Kontrast ${ratio.toFixed(1)}:1, QR oxunmayacaq. Modul və fon rəngləri arasında ən azı 3:1 lazımdır, qara/ağ isə 21:1 verir.`,
    };
  }

  const darkRgb = parseHexColor(dark);
  const lightRgb = parseHexColor(light);
  if (darkRgb && lightRgb && relativeLuminance(darkRgb) > relativeLuminance(lightRgb)) {
    return {
      severity: "warn",
      message:
        "Modullar fondan açıqdır: tərsinə QR. Kontrast kifayətdir, amma skanerlərin bir hissəsi yalnız açıq fonda tünd modul axtarır və bunu oxumur.",
    };
  }

  if (ratio < 7) {
    return {
      severity: "warn",
      message: `Kontrast ${ratio.toFixed(1)}:1, işıq zəif olanda və ya çap kiçik olanda oxunmaya bilər. 7:1-dən yuxarı daha etibarlıdır.`,
    };
  }

  return null;
}
