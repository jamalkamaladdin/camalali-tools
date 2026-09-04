/*
 * EXIF reading and stripping — the pure half. No `window`, no `document`, no
 * `File`/`Image`/`canvas`: everything here takes the raw bytes of a JPEG or
 * PNG a visitor picked and returns plain data (or new bytes) back out. That
 * split is what lets the same code run both inside the browser widget
 * (`exif-tool.tsx`, which only reads a `File` into an `ArrayBuffer` and turns
 * the result back into a downloadable `Blob`) and inside the Node-based check
 * suite with no DOM shim.
 *
 * What is worth checking here is the byte arithmetic, not the domain facts:
 * a TIFF offset table is unforgiving — one wrong endianness read and every
 * field after it points somewhere else in the file, which is why the check
 * suite builds real TIFF/JPEG/PNG byte sequences rather than trusting a
 * hand-typed hex dump to be right. `stripExif` is checked the same way, by a
 * property rather than a fixture: the bytes from the JPEG's SOS marker
 * onward — the actual compressed pixels — must come out byte-for-byte
 * identical to the input, because this file never touches a canvas and never
 * re-encodes anything. It only decides which marker segments to keep.
 */

export type ExifData = {
  make?: string;
  model?: string;
  orientation?: number;
  software?: string;
  dateTime?: string;
  dateTimeOriginal?: string;
  iso?: number;
  fNumber?: number;
  /** Seconds — 0.008 for a 1/125s shutter, not the fraction itself. */
  exposureTime?: number;
  /** Millimetres. */
  focalLength?: number;
  gpsLatitude?: number;
  gpsLongitude?: number;
};

export type ExifParseResult =
  | { ok: true; hasGps: boolean; data: ExifData }
  | { ok: false; error: string };

export type StripResult =
  | { ok: true; bytes: Uint8Array; removedBytes: number }
  | { ok: false; error: string };

/**
 * What EXIF's `Orientation` tag (0x0112) actually means, in the visitor's own
 * language: a flag the camera writes instead of rotating the pixels, which
 * the viewer showing the photo is supposed to read and act on. A viewer that
 * ignores it — an old image tool, a raw `<img>` fed the un-rotated bytes — is
 * why some photos come out sideways even though nothing about the pixels
 * changed.
 */
export const ORIENTATION_LABELS: Record<number, string> = {
  1: "normal",
  2: "üfüqi güzgülənib",
  3: "180° çevrilib",
  4: "şaquli güzgülənib",
  5: "şaquli güzgü + saat əqrəbi istiqamətində 90°",
  6: "saat əqrəbi istiqamətində 90°",
  7: "şaquli güzgü + saat əqrəbinin əksinə 90°",
  8: "saat əqrəbinin əksinə 90°",
};

/**
 * Degrees/minutes/seconds, as EXIF's GPS IFD stores a coordinate, converted
 * to the single signed decimal number every map actually wants.
 * `40°26'46"N` → `≈40.446111`; a `S` or `W` reference negates it.
 */
export function dmsToDecimal(
  degrees: number,
  minutes: number,
  seconds: number,
  ref: "N" | "S" | "E" | "W",
): number {
  const magnitude = degrees + minutes / 60 + seconds / 3600;
  return ref === "S" || ref === "W" ? -magnitude : magnitude;
}

/* ---------- low-level byte readers ---------- */

type ByteOrder = "LE" | "BE";

function readU16(bytes: Uint8Array, offset: number, order: ByteOrder): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new RangeError("readU16 out of bounds");
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  return order === "LE" ? b0 | (b1 << 8) : (b0 << 8) | b1;
}

function readU32(bytes: Uint8Array, offset: number, order: ByteOrder): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new RangeError("readU32 out of bounds");
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  const b3 = bytes[offset + 3];
  return order === "LE"
    ? ((b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0)
    : ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
}

function readI32(bytes: Uint8Array, offset: number, order: ByteOrder): number {
  return readU32(bytes, offset, order) | 0;
}

/* ---------- TIFF/IFD parsing (shared by JPEG's APP1 and PNG's eXIf) ---------- */

/** Byte size of one value of a TIFF field type, for the types EXIF actually uses. */
const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

type IfdEntry = {
  tag: number;
  type: number;
  count: number;
  /** Absolute position of the entry's 4-byte value/offset field. */
  valuePos: number;
};

function readIfdEntries(
  bytes: Uint8Array,
  ifdOffset: number,
  order: ByteOrder,
): { entries: IfdEntry[]; nextIfdOffset: number } {
  const count = readU16(bytes, ifdOffset, order);
  const entries: IfdEntry[] = [];
  for (let i = 0; i < count; i++) {
    const entryPos = ifdOffset + 2 + i * 12;
    entries.push({
      tag: readU16(bytes, entryPos, order),
      type: readU16(bytes, entryPos + 2, order),
      count: readU32(bytes, entryPos + 4, order),
      valuePos: entryPos + 8,
    });
  }
  const nextIfdOffset = readU32(bytes, ifdOffset + 2 + count * 12, order);
  return { entries, nextIfdOffset };
}

function findEntry(entries: IfdEntry[], tag: number): IfdEntry | undefined {
  return entries.find((entry) => entry.tag === tag);
}

/**
 * Where a field's value actually lives: inline in the 4-byte slot when it
 * fits, otherwise the slot holds an offset from the TIFF header start.
 */
function resolveValuePos(bytes: Uint8Array, entry: IfdEntry, tiffStart: number, order: ByteOrder): number {
  const typeSize = TYPE_SIZES[entry.type] ?? 1;
  const totalSize = typeSize * entry.count;
  if (totalSize <= 4) return entry.valuePos;
  return tiffStart + readU32(bytes, entry.valuePos, order);
}

function readAsciiValue(bytes: Uint8Array, entry: IfdEntry, tiffStart: number, order: ByteOrder): string | undefined {
  if (entry.type !== 2 || entry.count === 0) return undefined;
  const pos = resolveValuePos(bytes, entry, tiffStart, order);
  if (pos < 0 || pos + entry.count > bytes.length) return undefined;
  let end = entry.count;
  while (end > 0 && bytes[pos + end - 1] === 0) end--;
  let text = "";
  for (let i = 0; i < end; i++) text += String.fromCharCode(bytes[pos + i]);
  return text;
}

function readShortValue(bytes: Uint8Array, entry: IfdEntry, tiffStart: number, order: ByteOrder): number | undefined {
  if (entry.type !== 3 || entry.count === 0) return undefined;
  return readU16(bytes, resolveValuePos(bytes, entry, tiffStart, order), order);
}

function readLongValue(bytes: Uint8Array, entry: IfdEntry, tiffStart: number, order: ByteOrder): number | undefined {
  if (entry.type !== 4 || entry.count === 0) return undefined;
  return readU32(bytes, resolveValuePos(bytes, entry, tiffStart, order), order);
}

function readRationalValue(bytes: Uint8Array, entry: IfdEntry, tiffStart: number, order: ByteOrder): number | undefined {
  if ((entry.type !== 5 && entry.type !== 10) || entry.count === 0) return undefined;
  const pos = resolveValuePos(bytes, entry, tiffStart, order);
  const numerator = entry.type === 5 ? readU32(bytes, pos, order) : readI32(bytes, pos, order);
  const denominator = entry.type === 5 ? readU32(bytes, pos + 4, order) : readI32(bytes, pos + 4, order);
  return denominator === 0 ? 0 : numerator / denominator;
}

/** GPS latitude/longitude: three consecutive RATIONALs — degrees, minutes, seconds. */
function readRationalTriplet(
  bytes: Uint8Array,
  entry: IfdEntry,
  tiffStart: number,
  order: ByteOrder,
): [number, number, number] | undefined {
  if (entry.type !== 5 || entry.count < 3) return undefined;
  const pos = resolveValuePos(bytes, entry, tiffStart, order);
  const parts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const numerator = readU32(bytes, pos + i * 8, order);
    const denominator = readU32(bytes, pos + i * 8 + 4, order);
    parts.push(denominator === 0 ? 0 : numerator / denominator);
  }
  return [parts[0], parts[1], parts[2]];
}

const IFD0_MAKE = 0x010f;
const IFD0_MODEL = 0x0110;
const IFD0_ORIENTATION = 0x0112;
const IFD0_SOFTWARE = 0x0131;
const IFD0_DATETIME = 0x0132;
const IFD0_EXIF_IFD_POINTER = 0x8769;
const IFD0_GPS_IFD_POINTER = 0x8825;

const EXIF_DATETIME_ORIGINAL = 0x9003;
const EXIF_ISO = 0x8827;
const EXIF_FNUMBER = 0x829d;
const EXIF_EXPOSURE_TIME = 0x829a;
const EXIF_FOCAL_LENGTH = 0x920a;

const GPS_LATITUDE_REF = 0x0001;
const GPS_LATITUDE = 0x0002;
const GPS_LONGITUDE_REF = 0x0003;
const GPS_LONGITUDE = 0x0004;

/**
 * Reads the TIFF structure at `tiffStart` (relative to `bytes`, which is
 * where every internal offset it contains is anchored). Used for both a
 * JPEG's APP1 payload (after the 6-byte `"Exif\0\0"` marker) and a PNG's
 * `eXIf` chunk — the two containers differ, the TIFF bytes inside do not.
 */
function parseTiffAt(bytes: Uint8Array, tiffStart: number): { data: ExifData; hasGps: boolean } {
  const b0 = bytes[tiffStart];
  const b1 = bytes[tiffStart + 1];
  let order: ByteOrder;
  if (b0 === 0x49 && b1 === 0x49) order = "LE";
  else if (b0 === 0x4d && b1 === 0x4d) order = "BE";
  else throw new Error("unrecognised TIFF byte order mark");

  if (readU16(bytes, tiffStart + 2, order) !== 42) throw new Error("unrecognised TIFF magic number");

  const ifd0Offset = tiffStart + readU32(bytes, tiffStart + 4, order);
  const { entries: ifd0 } = readIfdEntries(bytes, ifd0Offset, order);

  const data: ExifData = {};

  const makeEntry = findEntry(ifd0, IFD0_MAKE);
  if (makeEntry) data.make = readAsciiValue(bytes, makeEntry, tiffStart, order);
  const modelEntry = findEntry(ifd0, IFD0_MODEL);
  if (modelEntry) data.model = readAsciiValue(bytes, modelEntry, tiffStart, order);
  const orientationEntry = findEntry(ifd0, IFD0_ORIENTATION);
  if (orientationEntry) data.orientation = readShortValue(bytes, orientationEntry, tiffStart, order);
  const softwareEntry = findEntry(ifd0, IFD0_SOFTWARE);
  if (softwareEntry) data.software = readAsciiValue(bytes, softwareEntry, tiffStart, order);
  const dateTimeEntry = findEntry(ifd0, IFD0_DATETIME);
  if (dateTimeEntry) data.dateTime = readAsciiValue(bytes, dateTimeEntry, tiffStart, order);

  const exifPointerEntry = findEntry(ifd0, IFD0_EXIF_IFD_POINTER);
  if (exifPointerEntry) {
    const exifOffset = readLongValue(bytes, exifPointerEntry, tiffStart, order);
    if (exifOffset !== undefined) {
      const { entries: exifIfd } = readIfdEntries(bytes, tiffStart + exifOffset, order);

      const dateOriginalEntry = findEntry(exifIfd, EXIF_DATETIME_ORIGINAL);
      if (dateOriginalEntry) data.dateTimeOriginal = readAsciiValue(bytes, dateOriginalEntry, tiffStart, order);
      const isoEntry = findEntry(exifIfd, EXIF_ISO);
      if (isoEntry) data.iso = readShortValue(bytes, isoEntry, tiffStart, order);
      const fNumberEntry = findEntry(exifIfd, EXIF_FNUMBER);
      if (fNumberEntry) data.fNumber = readRationalValue(bytes, fNumberEntry, tiffStart, order);
      const exposureEntry = findEntry(exifIfd, EXIF_EXPOSURE_TIME);
      if (exposureEntry) data.exposureTime = readRationalValue(bytes, exposureEntry, tiffStart, order);
      const focalLengthEntry = findEntry(exifIfd, EXIF_FOCAL_LENGTH);
      if (focalLengthEntry) data.focalLength = readRationalValue(bytes, focalLengthEntry, tiffStart, order);
    }
  }

  let hasGps = false;
  const gpsPointerEntry = findEntry(ifd0, IFD0_GPS_IFD_POINTER);
  if (gpsPointerEntry) {
    const gpsOffset = readLongValue(bytes, gpsPointerEntry, tiffStart, order);
    if (gpsOffset !== undefined) {
      const { entries: gpsIfd } = readIfdEntries(bytes, tiffStart + gpsOffset, order);
      const latRefEntry = findEntry(gpsIfd, GPS_LATITUDE_REF);
      const latEntry = findEntry(gpsIfd, GPS_LATITUDE);
      const lonRefEntry = findEntry(gpsIfd, GPS_LONGITUDE_REF);
      const lonEntry = findEntry(gpsIfd, GPS_LONGITUDE);

      if (latRefEntry && latEntry && lonRefEntry && lonEntry) {
        const latRef = readAsciiValue(bytes, latRefEntry, tiffStart, order);
        const lonRef = readAsciiValue(bytes, lonRefEntry, tiffStart, order);
        const latDms = readRationalTriplet(bytes, latEntry, tiffStart, order);
        const lonDms = readRationalTriplet(bytes, lonEntry, tiffStart, order);
        if (
          latDms &&
          lonDms &&
          (latRef === "N" || latRef === "S") &&
          (lonRef === "E" || lonRef === "W")
        ) {
          data.gpsLatitude = dmsToDecimal(latDms[0], latDms[1], latDms[2], latRef);
          data.gpsLongitude = dmsToDecimal(lonDms[0], lonDms[1], lonDms[2], lonRef);
          hasGps = true;
        }
      }
    }
  }

  return { data, hasGps };
}

/* ---------- format detection ---------- */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  return PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
}

function matchesExifHeader(bytes: Uint8Array, pos: number): boolean {
  if (pos + 6 > bytes.length) return false;
  return EXIF_HEADER.every((byte, i) => bytes[pos + i] === byte);
}

const JPEG_APP1 = 0xe1;
const JPEG_EOI = 0xd9;
const JPEG_SOS = 0xda;
/** Markers with no length field: TEM (0x01) and the restart markers RST0–RST7. */
function isLengthlessMarker(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

/* ---------- JPEG: parse ---------- */

function parseJpegExif(bytes: Uint8Array): ExifParseResult {
  let offset = 2; // past SOI
  let tiffStart: number | undefined;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return { ok: false, error: "JPEG marker strukturu zədələnib — fayl korlanmış ola bilər." };
    }
    // Some encoders pad a marker with extra 0xFF fill bytes before it; skip them.
    let markerPos = offset + 1;
    while (markerPos < bytes.length && bytes[markerPos] === 0xff) markerPos++;
    if (markerPos >= bytes.length) {
      return { ok: false, error: "JPEG faylı qısa kəsilib." };
    }
    const marker = bytes[markerPos];
    offset = markerPos + 1;

    if (marker === JPEG_EOI || marker === JPEG_SOS) break;
    if (isLengthlessMarker(marker)) continue;

    if (offset + 2 > bytes.length) {
      return { ok: false, error: "JPEG faylı qısa kəsilib — marker uzunluğu oxunmur." };
    }
    const segmentLength = readU16(bytes, offset, "BE");
    if (segmentLength < 2) {
      return { ok: false, error: "JPEG marker uzunluğu etibarsızdır." };
    }
    const payloadStart = offset + 2;
    const payloadEnd = payloadStart + (segmentLength - 2);
    if (payloadEnd > bytes.length) {
      return { ok: false, error: "JPEG faylı qısa kəsilib — seqment gövdəsi tam deyil." };
    }

    if (marker === JPEG_APP1 && tiffStart === undefined && matchesExifHeader(bytes, payloadStart)) {
      tiffStart = payloadStart + 6;
    }

    offset = payloadEnd;
  }

  if (tiffStart === undefined) return { ok: true, hasGps: false, data: {} };

  try {
    const { data, hasGps } = parseTiffAt(bytes, tiffStart);
    return { ok: true, hasGps, data };
  } catch {
    // The JPEG's own marker structure was fine; the EXIF payload inside it
    // was not. That is not the same failure as a corrupt JPEG, so this is
    // still reported as "no EXIF found" rather than an error.
    return { ok: true, hasGps: false, data: {} };
  }
}

/* ---------- PNG: eXIf chunk + tEXt/iTXt ---------- */

type PngChunk = { type: string; dataStart: number; length: number };

function* iteratePngChunks(bytes: Uint8Array): Generator<PngChunk> {
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = readU32(bytes, offset, "BE");
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;
    if (dataStart + length + 4 > bytes.length) return; // truncated — stop rather than throw
    yield { type, dataStart, length };
    if (type === "IEND") return;
    offset = dataStart + length + 4;
  }
}

function parsePngExif(bytes: Uint8Array): ExifParseResult {
  for (const chunk of iteratePngChunks(bytes)) {
    if (chunk.type === "eXIf") {
      try {
        const { data, hasGps } = parseTiffAt(bytes, chunk.dataStart);
        return { ok: true, hasGps, data };
      } catch {
        return { ok: true, hasGps: false, data: {} };
      }
    }
  }
  return { ok: true, hasGps: false, data: {} };
}

function findNul(bytes: Uint8Array, start: number, end: number): number {
  for (let i = start; i < end; i++) {
    if (bytes[i] === 0) return i;
  }
  return -1;
}

/** Every byte is its own code point in Latin-1 — no table needed, unlike UTF-8. */
function decodeLatin1(bytes: Uint8Array, start: number, end: number): string {
  let text = "";
  for (let i = start; i < end; i++) text += String.fromCharCode(bytes[i]);
  return text;
}

/**
 * PNG's `tEXt`/`iTXt` chunks — the keyword/value pairs some editors and AI
 * tools embed (`Software`, `parameters`, `Comment`…). Independent of
 * `parseExif`: a PNG carries no JPEG-style EXIF by default, this is the
 * metadata a PNG actually tends to have.
 */
export function parsePngTextChunks(bytes: Uint8Array): { keyword: string; text: string }[] {
  if (!isPng(bytes)) return [];
  const results: { keyword: string; text: string }[] = [];

  for (const chunk of iteratePngChunks(bytes)) {
    const start = chunk.dataStart;
    const end = chunk.dataStart + chunk.length;

    if (chunk.type === "tEXt") {
      const separator = findNul(bytes, start, end);
      if (separator === -1) continue;
      results.push({
        keyword: decodeLatin1(bytes, start, separator),
        text: decodeLatin1(bytes, separator + 1, end),
      });
    } else if (chunk.type === "iTXt") {
      // keyword\0 compressionFlag(1) compressionMethod(1) languageTag\0 translatedKeyword\0 text
      const keywordEnd = findNul(bytes, start, end);
      if (keywordEnd === -1) continue;
      const keyword = decodeLatin1(bytes, start, keywordEnd);
      let pos = keywordEnd + 1;
      if (pos + 2 > end) continue;
      const compressionFlag = bytes[pos];
      pos += 2;
      const languageEnd = findNul(bytes, pos, end);
      if (languageEnd === -1) continue;
      pos = languageEnd + 1;
      const translatedEnd = findNul(bytes, pos, end);
      if (translatedEnd === -1) continue;
      pos = translatedEnd + 1;

      if (compressionFlag === 1) {
        // Decompression is out of scope — noting that rather than guessing at it.
        results.push({ keyword, text: "(sıxılmış mətn, açılmadı)" });
        continue;
      }
      results.push({ keyword, text: new TextDecoder("utf-8").decode(bytes.subarray(pos, end)) });
    }
  }
  return results;
}

/* ---------- public entry point ---------- */

/**
 * Never throws. A truncated/corrupt file, a photo with no EXIF at all (a
 * screenshot, an already-stripped file — `ok: true` with empty fields, not an
 * error) and a file that is neither JPEG nor PNG all resolve to a normal
 * return value the widget can render without a try/catch of its own.
 */
export function parseExif(bytes: Uint8Array): ExifParseResult {
  try {
    if (isJpeg(bytes)) return parseJpegExif(bytes);
    if (isPng(bytes)) return parsePngExif(bytes);
    return {
      ok: false,
      error: "Bu fayl JPEG və ya PNG formatında deyil — EXIF yalnız bu iki formatdan oxunur.",
    };
  } catch {
    return { ok: false, error: "Fayl oxunarkən gözlənilməz xəta baş verdi — fayl zədəli ola bilər." };
  }
}

/* ---------- stripping ---------- */

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

/**
 * Rebuilds the JPEG marker by marker, dropping only the APP1 segments whose
 * payload is `"Exif\0\0"` — an APP1 carrying XMP instead is a different
 * payload and is left alone. Once SOS is reached the rest of the file (the
 * entropy-coded scan, i.e. the actual pixels) is copied through as one
 * `subarray`, never touched — that byte-for-byte pass-through is the whole
 * reason this splices bytes instead of redrawing through a canvas, which
 * would recompress the image and throw quality away for no reason.
 */
function stripJpegExif(bytes: Uint8Array): StripResult {
  const chunks: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return { ok: false, error: "JPEG marker strukturu zədələnib — fayl təmizlənə bilmədi." };
    }
    let markerPos = offset + 1;
    while (markerPos < bytes.length && bytes[markerPos] === 0xff) markerPos++;
    if (markerPos >= bytes.length) {
      return { ok: false, error: "JPEG faylı qısa kəsilib." };
    }
    const marker = bytes[markerPos];
    const markerStart = offset;
    offset = markerPos + 1;

    if (marker === JPEG_SOS) {
      chunks.push(bytes.subarray(markerStart, bytes.length));
      offset = bytes.length;
      break;
    }
    if (marker === JPEG_EOI) {
      chunks.push(bytes.subarray(markerStart, offset));
      break;
    }
    if (isLengthlessMarker(marker)) {
      chunks.push(bytes.subarray(markerStart, offset));
      continue;
    }

    if (offset + 2 > bytes.length) {
      return { ok: false, error: "JPEG faylı qısa kəsilib." };
    }
    const segmentLength = readU16(bytes, offset, "BE");
    if (segmentLength < 2) {
      return { ok: false, error: "JPEG marker uzunluğu etibarsızdır." };
    }
    const payloadStart = offset + 2;
    const segmentEnd = payloadStart + (segmentLength - 2);
    if (segmentEnd > bytes.length) {
      return { ok: false, error: "JPEG faylı qısa kəsilib." };
    }

    const isExifApp1 = marker === JPEG_APP1 && matchesExifHeader(bytes, payloadStart);
    if (!isExifApp1) chunks.push(bytes.subarray(markerStart, segmentEnd));

    offset = segmentEnd;
  }

  const out = concatChunks(chunks);
  return { ok: true, bytes: out, removedBytes: bytes.length - out.length };
}

const PNG_TEXT_CHUNK_TYPES = new Set(["tEXt", "iTXt", "zTXt", "eXIf"]);

/** Same idea for PNG: keep every chunk except the text/EXIF ones, byte-exact. */
function stripPngExif(bytes: Uint8Array): StripResult {
  const chunks: Uint8Array[] = [bytes.subarray(0, 8)]; // signature
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = readU32(bytes, offset, "BE");
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const chunkEnd = offset + 8 + length + 4;
    if (chunkEnd > bytes.length) {
      return { ok: false, error: "PNG faylı qısa kəsilib." };
    }
    if (!PNG_TEXT_CHUNK_TYPES.has(type)) chunks.push(bytes.subarray(offset, chunkEnd));
    offset = chunkEnd;
    if (type === "IEND") break;
  }

  const out = concatChunks(chunks);
  return { ok: true, bytes: out, removedBytes: bytes.length - out.length };
}

/**
 * A pure byte transform — no canvas, no re-encoding, no pixel touched.
 * Throws only never: unsupported input comes back as `ok: false` like every
 * other result here, so the widget has one shape to render either way.
 */
export function stripExif(bytes: Uint8Array): StripResult {
  try {
    if (isJpeg(bytes)) return stripJpegExif(bytes);
    if (isPng(bytes)) return stripPngExif(bytes);
    return { ok: false, error: "Bu fayl JPEG və ya PNG formatında deyil." };
  } catch {
    return { ok: false, error: "Fayl təmizlənərkən gözlənilməz xəta baş verdi." };
  }
}
