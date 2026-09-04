/*
 * QR decoding to the ISO/IEC 18004 model 2 rules, versions 1 to 10, written
 * out in full because the site carries no third-party code.
 *
 * This is the read side of `qr.ts` and it is deliberately a separate module
 * rather than an inverse bolted onto the encoder. An encoder that reads back
 * its own output proves nothing: the two files are held to the same outside
 * reference symbols independently, so a shared mistake in the table of
 * constants would show up as a disagreement rather than as two files agreeing
 * with each other and with nobody else.
 *
 * Nothing here touches the DOM. The entry point takes the RGBA bytes a canvas
 * hands over — `ImageData.data`, width, height — and returns either text or a
 * reason it could not be read. The widget owns the canvas; this file owns
 * every decision from the first pixel to the last character.
 *
 * What it does not do, stated once here and repeated to the visitor on the
 * page: it assumes the symbol is square-on to the frame. A photograph taken at
 * an angle needs a perspective transform to undo, and rather than sample such
 * an image approximately and hand back plausible-looking wrong text, this
 * refuses it by name. Rotation by a whole quarter turn is fine — the three
 * finder patterns say which way is up — but a tilted camera is not.
 */

export type QrDecodeEcLevel = "L" | "M" | "Q" | "H";
export type QrDecodeMode = "numeric" | "alphanumeric" | "byte";

export type QrDecodeSegment = {
  mode: QrDecodeMode;
  /** Units the symbol declared: characters, or bytes in byte mode. */
  count: number;
  text: string;
};

export type QrDecodeSuccess = {
  ok: true;
  text: string;
  version: number;
  /** Side length in modules, quiet zone excluded. */
  size: number;
  ecLevel: QrDecodeEcLevel;
  mask: number;
  segments: QrDecodeSegment[];
  /** Codewords Reed-Solomon had to repair. Zero means the read was clean. */
  correctedCodewords: number;
  /** Pixels per module, when the result came from an image rather than a grid. */
  moduleSize: number | null;
};

/**
 * Which stage gave up. The visitor is shown `error`; the check suite asserts
 * on `stage`, so a message can be reworded without rewriting a test, and a
 * failure that moves from one stage to another is caught rather than hidden
 * behind a string comparison.
 */
export type QrDecodeStage =
  | "image"
  | "finder"
  | "geometry"
  | "version"
  | "format"
  | "correction"
  | "content";

export type QrDecodeFailure = { ok: false; stage: QrDecodeStage; error: string };

export type QrDecodeResult = QrDecodeSuccess | QrDecodeFailure;

/**
 * Versions 1 to 10 — 21x21 up to 57x57. The cut is not arbitrary: from version
 * 7 the symbol carries a BCH-protected version field, and above 10 the
 * character count fields widen and the alignment grid thickens. Everything up
 * to 10 is read from the measured module count alone, which is the part that
 * can be proven right against a reference symbol. Beyond it, this file says so
 * rather than guessing.
 */
const MAX_SUPPORTED_VERSION = 10;
const MIN_VERSION = 1;
/** Above this the symbol is legal QR, just not something this tool reads. */
const MAX_QR_VERSION = 40;

/** The smallest symbol is 21 modules, so an image under that cannot hold one. */
const MIN_IMAGE_SIDE = 21;

/** BCH(15,5) has minimum distance 7, so three flipped bits are still repairable. */
const MAX_FORMAT_DISTANCE = 3;

const failure = (stage: QrDecodeStage, error: string): QrDecodeFailure => ({
  ok: false,
  stage,
  error,
});

/* ---------- tables from ISO/IEC 18004 ---------- */

/** Table order for the two arrays below; not the order the format field uses. */
const EC_INDEX: Record<QrDecodeEcLevel, number> = { L: 0, M: 1, Q: 2, H: 3 };

/** The two bits the format field carries. L is 01 and M is 00 — not a typo. */
const EC_FORMAT_BITS: Record<QrDecodeEcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

const EC_LEVELS: QrDecodeEcLevel[] = ["L", "M", "Q", "H"];

/*
 * Error correction codewords per block and block count, indexed
 * [level][version], versions 1-10 only. Index 0 is padding so the version
 * number indexes directly. These are the standard's own Tables 13-22 reduced
 * to the form every implementation reduces them to, truncated to the range
 * this file supports — published constants, not an implementation.
 */
const ECC_PER_BLOCK: number[][] = [
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
];

const NUM_BLOCKS: number[][] = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  [0, 1, 1, 2, 4, 4, 4, 5, 5, 8, 9],
];

const ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

const MODE_TERMINATOR = 0b0000;
const MODE_NUMERIC = 0b0001;
const MODE_ALPHANUMERIC = 0b0010;
const MODE_STRUCTURED_APPEND = 0b0011;
const MODE_BYTE = 0b0100;
const MODE_FNC1_FIRST = 0b0101;
const MODE_ECI = 0b0111;
const MODE_KANJI = 0b1000;
const MODE_FNC1_SECOND = 0b1001;

/* ---------- geometry ---------- */

export function qrSizeForVersion(version: number): number {
  return version * 4 + 17;
}

export function qrVersionForSize(size: number): number {
  return (size - 17) / 4;
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

/** Row and column centres of the alignment patterns. */
function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (let pos = version * 4 + 10; positions.length < count; pos -= step) {
    positions.splice(1, 0, pos);
  }
  return positions;
}

/* ---------- Galois field GF(256) ---------- */

/*
 * The same field the encoder works in — primitive polynomial
 * x^8 + x^4 + x^3 + x^2 + 1 (0x11d), which is the one the standard names —
 * built here rather than imported, because a decoder that borrows the
 * encoder's arithmetic cannot disagree with it, and disagreeing is the point
 * of having two implementations. The exponent table is doubled so a sum of two
 * logs never needs reducing at the call site.
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

function gfDivide(a: number, b: number): number {
  if (a === 0) return 0;
  return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255];
}

function gfPower(base: number, exponent: number): number {
  if (base === 0) return 0;
  return GF_EXP[(GF_LOG[base] * exponent) % 255];
}

/** a^-i, the field element Chien search and Forney evaluate at. */
function gfInverseExp(exponent: number): number {
  return GF_EXP[(255 - (exponent % 255)) % 255];
}

/* ---------- format information ---------- */

export type QrFormatInfo = {
  ecLevel: QrDecodeEcLevel;
  mask: number;
  /** How many bits had to be corrected to reach this codeword. */
  distance: number;
};

/**
 * The thirty-two 15-bit words the format field can legally hold, one per
 * (level, mask) pair, built once from the BCH(15,5) code and the 0x5412 mask
 * the standard fixes.
 *
 * A decoder needs them as a list rather than as an encoder. The field arrives
 * damaged — it sits in the corner a thumb covers and a label peels from — and
 * the answer wanted is the nearest legal word, not the one that happens to
 * divide cleanly. Since the code's minimum distance is 7, a word within three
 * bits of one entry is within three bits of no other, so "nearest" is never
 * ambiguous inside the range this trusts.
 */
const FORMAT_TABLE: { bits: number; ecLevel: QrDecodeEcLevel; mask: number }[] = (() => {
  const table: { bits: number; ecLevel: QrDecodeEcLevel; mask: number }[] = [];
  for (const ecLevel of EC_LEVELS) {
    for (let mask = 0; mask < 8; mask++) {
      const payload = (EC_FORMAT_BITS[ecLevel] << 3) | mask;
      let remainder = payload;
      for (let i = 0; i < 10; i++) {
        remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
      }
      table.push({ bits: ((payload << 10) | remainder) ^ 0x5412, ecLevel, mask });
    }
  }
  return table;
})();

/** Exposed so the check suite can hold the derived table to the printed one. */
export function formatCodewords(): readonly { bits: number; ecLevel: QrDecodeEcLevel; mask: number }[] {
  return FORMAT_TABLE;
}

function popcount(value: number): number {
  let remaining = value;
  let count = 0;
  while (remaining !== 0) {
    remaining &= remaining - 1;
    count++;
  }
  return count;
}

/**
 * The nearest legal format word to `bits`, or null when nothing is near enough
 * to be trusted. Three bits is the guarantee the code gives; a word four bits
 * away from its nearest neighbour is as likely to be a different word four
 * bits the other way, and this returns null rather than pick one.
 */
export function decodeFormatInfo(bits: number): QrFormatInfo | null {
  const masked = bits & 0x7fff;
  let best: QrFormatInfo | null = null;
  for (const entry of FORMAT_TABLE) {
    const distance = popcount(masked ^ entry.bits);
    if (best === null || distance < best.distance) {
      best = { ecLevel: entry.ecLevel, mask: entry.mask, distance };
    }
  }
  if (best === null || best.distance > MAX_FORMAT_DISTANCE) return null;
  return best;
}

/* ---------- pixels ---------- */

/*
 * Rec. 601 luma. Any of the three common weightings separates dark modules
 * from light paper; this one is named because a check can only assert an exact
 * grey if it knows which formula produced it.
 */
const LUMA_RED = 0.299;
const LUMA_GREEN = 0.587;
const LUMA_BLUE = 0.114;

export function toGrayscale(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(rgba.length >>> 2);
  for (let pixel = 0, offset = 0; pixel < gray.length; pixel++, offset += 4) {
    gray[pixel] = LUMA_RED * rgba[offset] + LUMA_GREEN * rgba[offset + 1] + LUMA_BLUE * rgba[offset + 2];
  }
  return gray;
}

/**
 * Otsu's threshold: the grey level that maximises the variance between the two
 * groups it splits the histogram into. A printed QR is about as bimodal as an
 * image gets, which is why one global threshold is enough here and adaptive
 * tiling is not needed.
 *
 * The maximum is usually a plateau — with pure black and pure white there is
 * nothing at all between the two peaks, so every level in the gap scores
 * identically — and the middle of that plateau is returned rather than its
 * first level. Taking the first would put the threshold flush against the dark
 * cluster, where a single noisy pixel flips a module.
 */
export function otsuThreshold(gray: ArrayLike<number>): number {
  const histogram = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;
  const total = gray.length;
  if (total === 0) return 128;

  let weightedTotal = 0;
  for (let level = 0; level < 256; level++) weightedTotal += level * histogram[level];

  let weightBelow = 0;
  let sumBelow = 0;
  let bestVariance = -1;
  let plateauStart = 0;
  let plateauEnd = 0;

  for (let level = 0; level < 256; level++) {
    weightBelow += histogram[level];
    sumBelow += level * histogram[level];
    if (weightBelow === 0) continue;
    const weightAbove = total - weightBelow;
    if (weightAbove === 0) break;
    const meanBelow = sumBelow / weightBelow;
    const meanAbove = (weightedTotal - sumBelow) / weightAbove;
    const variance = weightBelow * weightAbove * (meanBelow - meanAbove) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      plateauStart = level;
      plateauEnd = level;
    } else if (variance === bestVariance) {
      plateauEnd = level;
    }
  }

  if (bestVariance < 0) return 128;
  return (plateauStart + plateauEnd) >> 1;
}

/**
 * One byte per pixel, 1 for dark. A `Uint8Array` rather than the `boolean[]`
 * the rest of this file uses for module grids: a photograph is up to a million
 * pixels and a boxed boolean each is eight bytes of heap for one bit of answer,
 * while a module grid is at most 57x57 and reads better as booleans.
 */
export function binarize(gray: ArrayLike<number>, threshold: number, invert = false): Uint8Array {
  const dark = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const isDark = gray[i] <= threshold;
    dark[i] = (invert ? !isDark : isDark) ? 1 : 0;
  }
  return dark;
}

/* ---------- finder patterns ---------- */

export type QrFinderPattern = {
  x: number;
  y: number;
  /** Pixels per module, as this pattern's own 7-module width measured it. */
  moduleSize: number;
  /** Scan lines that landed on this pattern — confidence, roughly. */
  count: number;
};

/** The 1:1:3:1:1 run ratio a finder pattern cuts out of any line through it. */
function matchesFinderRatio(counts: ArrayLike<number>): boolean {
  let total = 0;
  for (let i = 0; i < 5; i++) {
    if (counts[i] === 0) return false;
    total += counts[i];
  }
  if (total < 7) return false;
  const moduleSize = total / 7;
  const tolerance = moduleSize / 2;
  return (
    Math.abs(moduleSize - counts[0]) < tolerance &&
    Math.abs(moduleSize - counts[1]) < tolerance &&
    Math.abs(moduleSize * 3 - counts[2]) < tolerance * 3 &&
    Math.abs(moduleSize - counts[3]) < tolerance &&
    Math.abs(moduleSize - counts[4]) < tolerance
  );
}

/** Centre of the middle run, given the coordinate one past its last pixel. */
function centreFromEnd(counts: ArrayLike<number>, end: number): number {
  return end - counts[4] - counts[3] - counts[2] / 2;
}

/**
 * Confirms a horizontal hit by cutting the same 1:1:3:1:1 ratio vertically
 * through it. Without this every dashed line, barcode and table rule in the
 * photograph reports a finder pattern; with it, only something that is dark in
 * both directions in the right proportions survives.
 */
function crossCheckVertical(
  dark: Uint8Array,
  width: number,
  height: number,
  centreX: number,
  startY: number,
  horizontalTotal: number,
): number | null {
  const at = (y: number) => dark[y * width + centreX] === 1;
  if (startY < 0 || startY >= height || !at(startY)) return null;

  const limit = horizontalTotal;
  const counts = [0, 0, 0, 0, 0];

  let y = startY;
  while (y >= 0 && at(y) && counts[2] <= limit) {
    counts[2]++;
    y--;
  }
  if (y < 0 || counts[2] > limit) return null;
  while (y >= 0 && !at(y) && counts[1] <= limit) {
    counts[1]++;
    y--;
  }
  if (y < 0 || counts[1] > limit) return null;
  while (y >= 0 && at(y) && counts[0] <= limit) {
    counts[0]++;
    y--;
  }
  if (counts[0] === 0 || counts[0] > limit) return null;

  y = startY + 1;
  while (y < height && at(y) && counts[2] <= limit) {
    counts[2]++;
    y++;
  }
  if (y >= height || counts[2] > limit) return null;
  while (y < height && !at(y) && counts[3] <= limit) {
    counts[3]++;
    y++;
  }
  if (y >= height || counts[3] > limit) return null;
  while (y < height && at(y) && counts[4] <= limit) {
    counts[4]++;
    y++;
  }
  if (counts[4] === 0 || counts[4] > limit) return null;

  const verticalTotal = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
  // A finder pattern is square, so the two measurements have to be near each
  // other. A tall dark bar crossed by a light gap passes the ratio test on one
  // axis only, and this is what rejects it.
  if (verticalTotal * 2 < horizontalTotal || verticalTotal > horizontalTotal * 2) return null;
  if (!matchesFinderRatio(counts)) return null;

  return centreFromEnd(counts, y);
}

function mergeCandidate(list: QrFinderPattern[], x: number, y: number, moduleSize: number): void {
  for (const candidate of list) {
    const reach = Math.max(1, candidate.moduleSize);
    if (
      Math.abs(candidate.x - x) <= reach &&
      Math.abs(candidate.y - y) <= reach &&
      Math.abs(candidate.moduleSize - moduleSize) <= Math.max(1, candidate.moduleSize / 2)
    ) {
      const next = candidate.count + 1;
      candidate.x = (candidate.x * candidate.count + x) / next;
      candidate.y = (candidate.y * candidate.count + y) / next;
      candidate.moduleSize = (candidate.moduleSize * candidate.count + moduleSize) / next;
      candidate.count = next;
      return;
    }
  }
  list.push({ x, y, moduleSize, count: 1 });
}

/**
 * Every place in the image where a finder pattern was seen from both axes,
 * clustered so one pattern reports once rather than once per scan line.
 */
export function findFinderPatterns(dark: Uint8Array, width: number, height: number): QrFinderPattern[] {
  const found: QrFinderPattern[] = [];
  const counts = [0, 0, 0, 0, 0];

  const consider = (end: number, y: number) => {
    if (!matchesFinderRatio(counts)) return;
    const total = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
    // Floor, not round: a run covering pixel indices 4..10 has its centre at
    // the coordinate 7.5 in the edge-space these run lengths are measured in,
    // and the pixel holding that coordinate is 7. Rounding lands on 8, which
    // is a whole module out when a module is one pixel wide.
    const centreX = Math.floor(centreFromEnd(counts, end));
    if (centreX < 0 || centreX >= width) return;
    const centreY = crossCheckVertical(dark, width, height, centreX, y, total);
    if (centreY === null) return;
    mergeCandidate(found, centreFromEnd(counts, end), centreY, total / 7);
  };

  for (let y = 0; y < height; y++) {
    counts.fill(0);
    let state = 0;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (dark[row + x] === 1) {
        if ((state & 1) === 1) state++;
        counts[state]++;
      } else if ((state & 1) === 0) {
        if (state === 4) {
          consider(x, y);
          counts[0] = counts[2];
          counts[1] = counts[3];
          counts[2] = counts[4];
          counts[3] = 1;
          counts[4] = 0;
          state = 3;
        } else {
          state++;
          counts[state]++;
        }
      } else {
        counts[state]++;
      }
    }
    if (state === 4) consider(width, y);
  }

  return found;
}

/* ---------- symbol geometry ---------- */

type Point = { x: number; y: number };

type SymbolGeometry = {
  topLeft: QrFinderPattern;
  topRight: QrFinderPattern;
  bottomLeft: QrFinderPattern;
};

function squaredDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Picks the three candidates whose mutual geometry is most like the right
 * isosceles triangle the three finder patterns of a QR always form: two equal
 * sides and a third that is the diagonal.
 *
 * The busy-image case is real — a page with two QR codes on it, or a logo with
 * concentric squares in it, hands this five or six candidates — so the triple
 * is scored rather than assumed, and the module sizes have to agree too, which
 * is what stops one pattern from a small QR being paired with two from a large
 * one.
 */
function chooseTriple(candidates: QrFinderPattern[]): SymbolGeometry | null {
  if (candidates.length < 3) return null;

  // Strongest first, and only the strongest few: the triple search is cubic
  // and a photograph of a printed page can produce dozens of weak candidates.
  const ranked = [...candidates].sort((a, b) => b.count - a.count).slice(0, 10);

  let best: { score: number; trio: QrFinderPattern[] } | null = null;
  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      for (let k = j + 1; k < ranked.length; k++) {
        const trio = [ranked[i], ranked[j], ranked[k]];
        const sizes = trio.map((pattern) => pattern.moduleSize);
        const spread = Math.max(...sizes) / Math.min(...sizes);
        if (spread > 1.6) continue;

        const distances = [
          squaredDistance(trio[0], trio[1]),
          squaredDistance(trio[0], trio[2]),
          squaredDistance(trio[1], trio[2]),
        ].sort((a, b) => a - b);
        if (distances[0] <= 0) continue;

        // Two equal legs and a hypotenuse of twice their squared length.
        const legs = Math.abs(distances[1] - distances[0]) / distances[1];
        const hypotenuse = Math.abs(distances[2] - 2 * distances[0]) / distances[2];
        const score = legs + hypotenuse;
        if (best === null || score < best.score) best = { score, trio };
      }
    }
  }

  // 0.4 is loose enough for a hand-held photograph and tight enough that three
  // unrelated squares in a line do not read as a symbol.
  if (best === null || best.score > 0.4) return null;

  const trio = best.trio;
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  let longest = pairs[0];
  let longestDistance = -1;
  for (const pair of pairs) {
    const distance = squaredDistance(trio[pair[0]], trio[pair[1]]);
    if (distance > longestDistance) {
      longestDistance = distance;
      longest = pair;
    }
  }
  // The corner with the right angle is the one the hypotenuse does not touch.
  const cornerIndex = [0, 1, 2].find((index) => index !== longest[0] && index !== longest[1]);
  if (cornerIndex === undefined) return null;

  const topLeft = trio[cornerIndex];
  const others = trio.filter((_, index) => index !== cornerIndex);

  /*
   * Which of the two arms is the top edge and which is the left edge, decided
   * by the sign of the cross product rather than by which one is higher up the
   * image. The sign survives a quarter turn, so a symbol photographed sideways
   * or upside down still names its own arms correctly, and only the sampling
   * vectors change.
   */
  const first = { x: others[0].x - topLeft.x, y: others[0].y - topLeft.y };
  const second = { x: others[1].x - topLeft.x, y: others[1].y - topLeft.y };
  const cross = first.x * second.y - first.y * second.x;

  return cross > 0
    ? { topLeft, topRight: others[0], bottomLeft: others[1] }
    : { topLeft, topRight: others[1], bottomLeft: others[0] };
}

/** How far off an axis an arm may lean before the symbol counts as tilted. */
const AXIS_TOLERANCE = 0.18;

function isAxisAligned(from: Point, to: Point): boolean {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  return Math.min(dx, dy) <= AXIS_TOLERANCE * Math.max(dx, dy);
}

/* ---------- sampling ---------- */

/**
 * Reads the module grid out of the binarised image, given where the three
 * finder centres sit.
 *
 * A finder centre is 3.5 modules in from the symbol's corner, and module
 * (r, c) has its centre at (c + 0.5, r + 0.5) modules from that same corner —
 * so the offset from the top-left finder centre is exactly (c - 3, r - 3)
 * modules, along the two arm directions. Working in arm vectors rather than in
 * image x and y is what lets a quarter-turned symbol be sampled by the same
 * arithmetic.
 */
function sampleGrid(
  dark: Uint8Array,
  width: number,
  height: number,
  geometry: SymbolGeometry,
  size: number,
): boolean[][] | null {
  const { topLeft, topRight, bottomLeft } = geometry;
  const spanModules = size - 7;

  const columnLength = Math.sqrt(squaredDistance(topLeft, topRight));
  const rowLength = Math.sqrt(squaredDistance(topLeft, bottomLeft));
  if (columnLength <= 0 || rowLength <= 0) return null;

  const columnUnit = {
    x: (topRight.x - topLeft.x) / columnLength,
    y: (topRight.y - topLeft.y) / columnLength,
  };
  const rowUnit = {
    x: (bottomLeft.x - topLeft.x) / rowLength,
    y: (bottomLeft.y - topLeft.y) / rowLength,
  };
  const columnStep = columnLength / spanModules;
  const rowStep = rowLength / spanModules;

  // Below a module of roughly three pixels a single sample is all there is;
  // above it, five samples and a majority vote absorb print noise and JPEG
  // ringing without smearing neighbouring modules together.
  const inset = Math.min(columnStep, rowStep) * 0.3;
  const multiSample = Math.min(columnStep, rowStep) >= 3;

  const modules: boolean[][] = [];
  for (let row = 0; row < size; row++) {
    const line: boolean[] = [];
    for (let column = 0; column < size; column++) {
      const alongColumn = (column - 3) * columnStep;
      const alongRow = (row - 3) * rowStep;
      const centreX = topLeft.x + columnUnit.x * alongColumn + rowUnit.x * alongRow;
      const centreY = topLeft.y + columnUnit.y * alongColumn + rowUnit.y * alongRow;

      const offsets: [number, number][] = multiSample
        ? [
            [0, 0],
            [-inset, 0],
            [inset, 0],
            [0, -inset],
            [0, inset],
          ]
        : [[0, 0]];

      let votes = 0;
      let taken = 0;
      for (const [dx, dy] of offsets) {
        const px = Math.floor(centreX + dx);
        const py = Math.floor(centreY + dy);
        if (px < 0 || py < 0 || px >= width || py >= height) {
          // A module centre outside the picture means the symbol is cropped,
          // and a guessed value there would be a guessed character later.
          return null;
        }
        taken++;
        if (dark[py * width + px] === 1) votes++;
      }
      line.push(votes * 2 > taken);
    }
    modules.push(line);
  }
  return modules;
}

/* ---------- function patterns and the codeword walk ---------- */

/** Every module the standard writes for the scanner rather than for the data. */
function buildFunctionMap(size: number, version: number): Uint8Array {
  const reserved = new Uint8Array(size * size);
  const mark = (row: number, column: number) => {
    if (row < 0 || column < 0 || row >= size || column >= size) return;
    reserved[row * size + column] = 1;
  };

  for (let i = 0; i < size; i++) {
    mark(6, i);
    mark(i, 6);
  }

  // The 7x7 eye plus the light separator around it, which is the 9x9 square.
  for (const [row, column] of [
    [3, 3],
    [3, size - 4],
    [size - 4, 3],
  ]) {
    for (let dr = -4; dr <= 4; dr++) {
      for (let dc = -4; dc <= 4; dc++) mark(row + dr, column + dc);
    }
  }

  const positions = alignmentPositions(version);
  const last = positions.length - 1;
  for (let i = 0; i < positions.length; i++) {
    for (let j = 0; j < positions.length; j++) {
      const onFinder = (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
      if (onFinder) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) mark(positions[i] + dr, positions[j] + dc);
      }
    }
  }

  for (let i = 0; i <= 5; i++) mark(i, 8);
  mark(7, 8);
  mark(8, 8);
  mark(8, 7);
  for (let i = 9; i < 15; i++) mark(8, 14 - i);
  for (let i = 0; i < 8; i++) mark(8, size - 1 - i);
  for (let i = 8; i < 15; i++) mark(size - 15 + i, 8);
  mark(size - 8, 8);

  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const near = size - 11 + (i % 3);
      const far = Math.floor(i / 3);
      mark(far, near);
      mark(near, far);
    }
  }

  return reserved;
}

/** The copy beside the top-left finder, read back in the order it was written. */
function readFormatNearTopLeft(modules: boolean[][]): number {
  let bits = 0;
  const set = (index: number, dark: boolean) => {
    if (dark) bits |= 1 << index;
  };
  for (let i = 0; i <= 5; i++) set(i, modules[i][8]);
  set(6, modules[7][8]);
  set(7, modules[8][8]);
  set(8, modules[8][7]);
  for (let i = 9; i < 15; i++) set(i, modules[8][14 - i]);
  return bits;
}

/** The second copy, split between the other two corners. */
function readFormatSplit(modules: boolean[][], size: number): number {
  let bits = 0;
  for (let i = 0; i < 8; i++) if (modules[8][size - 1 - i]) bits |= 1 << i;
  for (let i = 8; i < 15; i++) if (modules[size - 15 + i][8]) bits |= 1 << i;
  return bits;
}

/** The eight mask conditions, in the order the format field numbers them. */
const MASK_CONDITIONS: ((row: number, column: number) => boolean)[] = [
  (row, column) => (row + column) % 2 === 0,
  (row) => row % 2 === 0,
  (_row, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
  (row, column) => ((row * column) % 2) + ((row * column) % 3) === 0,
  (row, column) => (((row * column) % 2) + ((row * column) % 3)) % 2 === 0,
  (row, column) => (((row + column) % 2) + ((row * column) % 3)) % 2 === 0,
];

/**
 * Walks the two-module-wide columns right to left, alternating direction, and
 * pulls the bits back out — the write of `qr.ts` read backwards. Column 6 is
 * skipped whole because it is the vertical timing line, and the mask is undone
 * as each module is read, since XOR is its own inverse and a second pass over
 * the grid would buy nothing.
 */
function readCodewords(
  modules: boolean[][],
  reserved: Uint8Array,
  size: number,
  mask: number,
  total: number,
): Uint8Array {
  const condition = MASK_CONDITIONS[mask];
  const codewords = new Uint8Array(total);
  const totalBits = total * 8;
  let bitIndex = 0;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const column = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vertical : vertical;
        if (reserved[row * size + column] === 1) continue;
        if (bitIndex >= totalBits) continue;
        const dark = condition(row, column) ? !modules[row][column] : modules[row][column];
        if (dark) codewords[bitIndex >>> 3] |= 0x80 >>> (bitIndex & 7);
        bitIndex++;
      }
    }
  }
  return codewords;
}

/**
 * Undoes the interleave. The encoder reads the blocks column by column so that
 * a scratch across the printed symbol lands as a few codewords in each block
 * rather than as a hole in one; this puts each block back together.
 */
function deinterleave(
  stream: Uint8Array,
  version: number,
  ecLevel: QrDecodeEcLevel,
): { data: Uint8Array; parity: Uint8Array }[] {
  const ec = EC_INDEX[ecLevel];
  const blockCount = NUM_BLOCKS[ec][version];
  const parityPerBlock = ECC_PER_BLOCK[ec][version];
  const total = Math.floor(rawDataModules(version) / 8);

  const shortBlockCount = blockCount - (total % blockCount);
  const shortBlockLength = Math.floor(total / blockCount);

  const dataLengths: number[] = [];
  for (let i = 0; i < blockCount; i++) {
    dataLengths.push(shortBlockLength - parityPerBlock + (i < shortBlockCount ? 0 : 1));
  }

  const blocks = dataLengths.map((length) => ({
    data: new Uint8Array(length),
    parity: new Uint8Array(parityPerBlock),
  }));

  let cursor = 0;
  const longestData = shortBlockLength - parityPerBlock + 1;
  for (let i = 0; i < longestData; i++) {
    for (let b = 0; b < blockCount; b++) {
      if (i < dataLengths[b]) blocks[b].data[i] = stream[cursor++];
    }
  }
  for (let i = 0; i < parityPerBlock; i++) {
    for (let b = 0; b < blockCount; b++) blocks[b].parity[i] = stream[cursor++];
  }
  return blocks;
}

/* ---------- Reed-Solomon decoding ---------- */

export type RsCorrection = { data: Uint8Array; corrected: number };

/**
 * Repairs one block and returns its data codewords, or null when the damage is
 * past what the parity can carry.
 *
 * The four stages are the textbook ones and each answers a different question.
 * Syndromes say whether anything is wrong at all: the received word evaluated
 * at each of the generator's roots, which is zero everywhere for a clean block
 * because the generator divides it. Berlekamp-Massey turns those syndromes
 * into the error locator polynomial, the shortest recurrence that produces
 * them. Chien search finds that polynomial's roots by trying every element of
 * the field, and the inverse of each root is a position. Forney computes what
 * to subtract at each position.
 *
 * The last step is not textbook and matters more than any of them: the
 * syndromes are recomputed on the repaired block, and a block that still does
 * not check is thrown away rather than returned. Reed-Solomon beyond its
 * distance does not fail loudly — it produces a different, entirely valid
 * codeword — and that is exactly the failure mode that would hand a visitor
 * confident, wrong text.
 */
export function reedSolomonCorrect(block: Uint8Array, parityLength: number): RsCorrection | null {
  const length = block.length;
  if (parityLength <= 0 || parityLength >= length) return null;

  const syndromes = new Uint8Array(parityLength);
  let faulty = false;
  for (let j = 0; j < parityLength; j++) {
    const point = GF_EXP[j];
    let value = 0;
    for (let k = 0; k < length; k++) value = gfMultiply(value, point) ^ block[k];
    syndromes[j] = value;
    if (value !== 0) faulty = true;
  }

  const dataLength = length - parityLength;
  if (!faulty) return { data: block.slice(0, dataLength), corrected: 0 };

  // Berlekamp-Massey. Polynomials here are low-degree-first, so index i holds
  // the coefficient of x^i and the constant term of the locator stays 1.
  let locator = new Uint8Array(parityLength + 1);
  locator[0] = 1;
  let previous = new Uint8Array(parityLength + 1);
  previous[0] = 1;
  let locatorDegree = 0;
  let shift = 1;
  let previousDiscrepancy = 1;

  for (let round = 0; round < parityLength; round++) {
    let discrepancy = syndromes[round];
    for (let i = 1; i <= locatorDegree; i++) {
      discrepancy ^= gfMultiply(locator[i], syndromes[round - i]);
    }
    if (discrepancy === 0) {
      shift++;
      continue;
    }
    const scale = gfDivide(discrepancy, previousDiscrepancy);
    const updated = locator.slice();
    for (let i = 0; i + shift < updated.length; i++) {
      updated[i + shift] ^= gfMultiply(scale, previous[i]);
    }
    if (2 * locatorDegree <= round) {
      previous = locator;
      previousDiscrepancy = discrepancy;
      locatorDegree = round + 1 - locatorDegree;
      shift = 1;
    } else {
      shift++;
    }
    locator = updated;
  }

  if (locatorDegree === 0 || locatorDegree * 2 > parityLength) return null;

  // Chien search: a root at a^-i means the codeword at exponent i is wrong.
  const positions: number[] = [];
  for (let exponent = 0; exponent < length; exponent++) {
    const point = gfInverseExp(exponent);
    let value = 0;
    for (let degree = locatorDegree; degree >= 0; degree--) {
      value = gfMultiply(value, point) ^ locator[degree];
    }
    if (value === 0) positions.push(exponent);
  }
  if (positions.length !== locatorDegree) return null;

  // Error evaluator: syndromes times locator, truncated at x^parityLength.
  const evaluator = new Uint8Array(parityLength);
  for (let i = 0; i < parityLength; i++) {
    let value = 0;
    for (let j = 0; j <= Math.min(i, locatorDegree); j++) {
      value ^= gfMultiply(syndromes[i - j], locator[j]);
    }
    evaluator[i] = value;
  }

  const repaired = block.slice();
  let corrected = 0;
  for (const exponent of positions) {
    const inverse = gfInverseExp(exponent);

    let evaluated = 0;
    for (let degree = parityLength - 1; degree >= 0; degree--) {
      evaluated = gfMultiply(evaluated, inverse) ^ evaluator[degree];
    }

    // Formal derivative in characteristic two: the even-degree terms vanish.
    let derivative = 0;
    for (let degree = 1; degree <= locatorDegree; degree += 2) {
      derivative ^= gfMultiply(locator[degree], gfPower(inverse, degree - 1));
    }
    if (derivative === 0) return null;

    // The generator's first root is a^0, so Forney's magnitude carries one
    // factor of the error position.
    const magnitude = gfMultiply(GF_EXP[exponent % 255], gfDivide(evaluated, derivative));
    const index = length - 1 - exponent;
    if (index < 0 || index >= length) return null;
    repaired[index] ^= magnitude;
    if (magnitude !== 0) corrected++;
  }

  for (let j = 0; j < parityLength; j++) {
    const point = GF_EXP[j];
    let value = 0;
    for (let k = 0; k < length; k++) value = gfMultiply(value, point) ^ repaired[k];
    if (value !== 0) return null;
  }

  return { data: repaired.slice(0, dataLength), corrected };
}

/* ---------- the bit stream ---------- */

class BitReader {
  private index = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get remaining(): number {
    return this.bytes.length * 8 - this.index;
  }

  read(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byte = this.bytes[this.index >>> 3];
      value = (value << 1) | ((byte >>> (7 - (this.index & 7))) & 1);
      this.index++;
    }
    return value;
  }
}

/** Bits in the character count field — it widens twice as versions grow. */
function characterCountBits(mode: QrDecodeMode, version: number): number {
  const tier = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  if (mode === "numeric") return [10, 12, 14][tier];
  if (mode === "alphanumeric") return [9, 11, 13][tier];
  return [8, 16, 16][tier];
}

/*
 * Byte mode carries bytes, not characters, and the standard's own default is
 * ISO-8859-1 while every generator written this century emits UTF-8. So UTF-8
 * is tried strictly first and Latin-1 is the fallback — that way a symbol
 * holding «Şəhər» comes back as «Şəhər» and one holding a Latin-1 payload
 * comes back as text rather than as replacement characters.
 */
function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    let text = "";
    for (const byte of bytes) text += String.fromCharCode(byte);
    return text;
  }
}

const TRUNCATED =
  "Məlumat axını yarımçıq bitdi — QR oxundu, amma içindəki uzunluq sahəsi qalan bitlərdən çox simvol vəd edir.";

function decodeSegments(
  data: Uint8Array,
  version: number,
): { segments: QrDecodeSegment[]; text: string } | QrDecodeFailure {
  const reader = new BitReader(data);
  const segments: QrDecodeSegment[] = [];

  while (reader.remaining >= 4) {
    const mode = reader.read(4);
    if (mode === MODE_TERMINATOR) break;

    if (mode === MODE_ECI) {
      return failure(
        "content",
        "Bu QR ECI rejimi ilə kodlaşdırılıb — yəni içində ayrıca kodlaşdırma göstəricisi var. Alət üç əsas rejimi oxuyur: rəqəm, alfanumerik və bayt.",
      );
    }
    if (mode === MODE_KANJI) {
      return failure(
        "content",
        "Bu QR kanji rejimindədir və Shift-JIS cədvəli tələb edir. Alət rəqəm, alfanumerik və bayt rejimlərini oxuyur.",
      );
    }
    if (mode === MODE_STRUCTURED_APPEND) {
      return failure(
        "content",
        "Bu, bölünmüş QR-in bir parçasıdır — mətn bir neçə simvola paylanıb və tək başına oxunmur.",
      );
    }
    if (mode === MODE_FNC1_FIRST || mode === MODE_FNC1_SECOND) {
      return failure(
        "content",
        "Bu QR FNC1 rejimindədir — GS1 ticarət kodlarında işlənən sahə ayırıcısı ilə. Alət adi mətn QR-lərini oxuyur.",
      );
    }

    const decodeMode: QrDecodeMode | null =
      mode === MODE_NUMERIC
        ? "numeric"
        : mode === MODE_ALPHANUMERIC
          ? "alphanumeric"
          : mode === MODE_BYTE
            ? "byte"
            : null;

    if (decodeMode === null) {
      return failure(
        "content",
        `Tanınmayan rejim göstəricisi (${mode.toString(2).padStart(4, "0")}). Bu, standartda mətn üçün təyin olunmuş dörd dəyərdən biri deyil.`,
      );
    }

    const countBits = characterCountBits(decodeMode, version);
    if (reader.remaining < countBits) return failure("content", TRUNCATED);
    const count = reader.read(countBits);

    let text = "";
    if (decodeMode === "numeric") {
      let left = count;
      while (left >= 3) {
        if (reader.remaining < 10) return failure("content", TRUNCATED);
        const value = reader.read(10);
        if (value > 999) return failure("content", TRUNCATED);
        text += String(value).padStart(3, "0");
        left -= 3;
      }
      if (left === 2) {
        if (reader.remaining < 7) return failure("content", TRUNCATED);
        const value = reader.read(7);
        if (value > 99) return failure("content", TRUNCATED);
        text += String(value).padStart(2, "0");
      } else if (left === 1) {
        if (reader.remaining < 4) return failure("content", TRUNCATED);
        const value = reader.read(4);
        if (value > 9) return failure("content", TRUNCATED);
        text += String(value);
      }
    } else if (decodeMode === "alphanumeric") {
      let left = count;
      while (left >= 2) {
        if (reader.remaining < 11) return failure("content", TRUNCATED);
        const value = reader.read(11);
        if (value >= 45 * 45) return failure("content", TRUNCATED);
        text += ALPHANUMERIC_CHARSET[Math.floor(value / 45)] + ALPHANUMERIC_CHARSET[value % 45];
        left -= 2;
      }
      if (left === 1) {
        if (reader.remaining < 6) return failure("content", TRUNCATED);
        const value = reader.read(6);
        if (value >= 45) return failure("content", TRUNCATED);
        text += ALPHANUMERIC_CHARSET[value];
      }
    } else {
      if (reader.remaining < count * 8) return failure("content", TRUNCATED);
      const bytes = new Uint8Array(count);
      for (let i = 0; i < count; i++) bytes[i] = reader.read(8);
      text = decodeBytes(bytes);
    }

    segments.push({ mode: decodeMode, count, text });
  }

  if (segments.length === 0) {
    return failure(
      "content",
      "QR düzgün oxundu, amma içində heç bir mətn seqmenti yoxdur — bu, boş simvoldur.",
    );
  }

  return { segments, text: segments.map((segment) => segment.text).join("") };
}

/* ---------- the grid decoder ---------- */

/**
 * Decodes an already-sampled module grid: row-major, `true` = dark, quiet zone
 * not included.
 *
 * This is the half of the tool that can be proven. Handed a reference symbol
 * whose text is known from outside, everything from the format field to the
 * last character either comes back right or comes back as a named failure, and
 * no camera is involved in saying which.
 */
export function decodeQrMatrix(modules: boolean[][], moduleSize: number | null = null): QrDecodeResult {
  const size = modules.length;
  if (size === 0 || modules.some((row) => row.length !== size)) {
    return failure("geometry", "Modul şəbəkəsi kvadrat deyil — QR həmişə kvadratdır.");
  }

  const version = qrVersionForSize(size);
  if (!Number.isInteger(version) || version < MIN_VERSION || version > MAX_QR_VERSION) {
    return failure(
      "geometry",
      `Ölçülən şəbəkə ${size} moduldur. QR-in tərəfi 21, 25, 29 … 177 ola bilər (4 × versiya + 17), bu isə onların heç biri deyil — deməli şəbəkə səhv yerdən ölçülüb.`,
    );
  }
  if (version > MAX_SUPPORTED_VERSION) {
    return failure(
      "version",
      `Bu QR versiya ${version}-dir (${size}×${size} modul). Alət 1–10 versiyalarını oxuyur, yəni 21×21-dən 57×57-yə qədər. Daha böyük simvol üçün başqa oxuyucu lazımdır.`,
    );
  }

  const first = decodeFormatInfo(readFormatNearTopLeft(modules));
  const second = decodeFormatInfo(readFormatSplit(modules, size));
  const format =
    first === null
      ? second
      : second === null
        ? first
        : first.distance <= second.distance
          ? first
          : second;

  if (format === null) {
    return failure(
      "format",
      "Format sahəsi oxunmadı. Bu 15 bit hansı maskanın və hansı xəta düzəltmə səviyyəsinin işlədildiyini deyir; hər iki nüsxəsi də zədəlidir. Adətən səbəb sol yuxarı küncün kölgədə, əyri və ya örtülü qalmasıdır.",
    );
  }

  const reserved = buildFunctionMap(size, version);
  const totalCodewords = Math.floor(rawDataModules(version) / 8);
  const stream = readCodewords(modules, reserved, size, format.mask, totalCodewords);
  const blocks = deinterleave(stream, version, format.ecLevel);

  const parityPerBlock = ECC_PER_BLOCK[EC_INDEX[format.ecLevel]][version];
  const parts: Uint8Array[] = [];
  let corrected = 0;
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const joined = new Uint8Array(block.data.length + block.parity.length);
    joined.set(block.data, 0);
    joined.set(block.parity, block.data.length);
    const repaired = reedSolomonCorrect(joined, parityPerBlock);
    if (repaired === null) {
      return failure(
        "correction",
        `Xəta düzəlişi bərpa edə bilmədi: ${blocks.length > 1 ? `${index + 1}-ci blokda ` : ""}zədə xəta düzəltmə payından çoxdur. QR-in bir hissəsi örtülü, cırıq, bulanıq və ya kölgədədir — şəkli daha aydın çək və yenidən yoxla.`,
      );
    }
    corrected += repaired.corrected;
    parts.push(repaired.data);
  }

  const data = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.length;
  }

  const content = decodeSegments(data, version);
  if ("ok" in content) return content;

  return {
    ok: true,
    text: content.text,
    version,
    size,
    ecLevel: format.ecLevel,
    mask: format.mask,
    segments: content.segments,
    correctedCodewords: corrected,
    moduleSize,
  };
}

/* ---------- the image decoder ---------- */

function decodeBinarised(dark: Uint8Array, width: number, height: number): QrDecodeResult {
  const candidates = findFinderPatterns(dark, width, height);
  if (candidates.length < 3) {
    return failure(
      "finder",
      `Şəkildə QR-in üç künc kvadratı tapılmadı (${candidates.length} tapıldı, 3 lazımdır). QR-i kadrın ortasına al, ətrafındakı ağ haşiyəni kəsmə, kölgə salma və şəkli düz — kadra paralel — çək.`,
    );
  }

  const geometry = chooseTriple(candidates);
  if (geometry === null) {
    return failure(
      "finder",
      `Şəkildə ${candidates.length} kvadrat tapıldı, amma onlardan üçü QR-in künc üçbucağını qurmur. Kadrda bir dənə QR olsun və şəkil tam onu tutsun.`,
    );
  }

  if (
    !isAxisAligned(geometry.topLeft, geometry.topRight) ||
    !isAxisAligned(geometry.topLeft, geometry.bottomLeft)
  ) {
    return failure(
      "geometry",
      "Üç künc kvadratı düzbucaqlı düzülməyib — QR bucaq altından çəkilib və ya əyilib. Bu alət perspektivi düzəltmir: şəkli QR-in müstəvisinə paralel, düz yuxarıdan çək.",
    );
  }

  const columnLength = Math.sqrt(squaredDistance(geometry.topLeft, geometry.topRight));
  const rowLength = Math.sqrt(squaredDistance(geometry.topLeft, geometry.bottomLeft));
  const measured =
    (geometry.topLeft.moduleSize + geometry.topRight.moduleSize + geometry.bottomLeft.moduleSize) / 3;

  if (measured < 1) {
    return failure(
      "image",
      `Modul ölçüsü ${measured.toFixed(2)} piksel çıxdı — bir pikseldən kiçik. Şəkil çox kiçik və ya çox bulanıqdır; daha yüksək həlledicilikdə çək və ya QR-i böyüt.`,
    );
  }

  const dimension = Math.round(((columnLength + rowLength) / 2 / measured) + 7);
  const version = Math.round((dimension - 17) / 4);
  if (version < MIN_VERSION) {
    return failure(
      "geometry",
      `Ölçülən şəbəkə ${dimension} modul çıxdı — ən kiçik QR 21 moduldur. Künc kvadratları tapıldı, amma aralarındakı məsafə QR-ə uyğun gəlmir.`,
    );
  }
  if (version > MAX_SUPPORTED_VERSION) {
    return failure(
      "version",
      `Ölçülən şəbəkə ${qrSizeForVersion(version)} modul, yəni versiya ${version}. Alət 1–10 versiyalarını (21×21 … 57×57) oxuyur.`,
    );
  }

  const size = qrSizeForVersion(version);
  const modules = sampleGrid(dark, width, height, geometry, size);
  if (modules === null) {
    return failure(
      "geometry",
      "QR-in bir hissəsi şəkildən kənarda qalır. Sakit zona — ətrafdakı 4 modulluq boş haşiyə — də kadra düşməlidir; şəkli bir az geniş kəs.",
    );
  }

  return decodeQrMatrix(modules, (columnLength + rowLength) / 2 / (size - 7));
}

/**
 * The entry point: RGBA bytes as a canvas hands them over, and either the text
 * or a reason.
 *
 * The whole pipeline is run twice when the first pass fails, the second time
 * with the black and white swapped. A QR printed light-on-dark is a real thing
 * a visitor will hold up to this — plenty of posters use it — and the retry
 * costs one more pass over an image that is already small. The reason reported
 * is the first pass's, because that is the ordinary case and its message is
 * the one that helps.
 */
export function decodeQrImage(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): QrDecodeResult {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return failure("image", "Şəklin ölçüləri oxunmadı — en və hündürlük müsbət tam ədəd olmalıdır.");
  }
  if (pixels.length !== width * height * 4) {
    return failure(
      "image",
      `Piksel massivi ölçüyə uyğun gəlmir: ${pixels.length} bayt gəldi, ${width}×${height} üçün ${width * height * 4} gözlənilirdi.`,
    );
  }
  if (width < MIN_IMAGE_SIDE || height < MIN_IMAGE_SIDE) {
    return failure(
      "image",
      `Şəkil çox kiçikdir: ${width}×${height}. Ən kiçik QR 21×21 moduldur, yəni şəkil ən azı 21×21 piksel olmalıdır — praktikada 200 pikseldən böyük lazımdır.`,
    );
  }

  const gray = toGrayscale(pixels);
  const threshold = otsuThreshold(gray);

  const straight = decodeBinarised(binarize(gray, threshold, false), width, height);
  if (straight.ok) return straight;

  const inverted = decodeBinarised(binarize(gray, threshold, true), width, height);
  if (inverted.ok) return inverted;

  return straight;
}
