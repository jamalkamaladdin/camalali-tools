/*
 * `exif.ts` reads and rewrites raw TIFF/JPEG/PNG bytes by hand, so a fixture
 * built from a real file would hide exactly the offset-arithmetic bugs this
 * needs to catch. Instead this file assembles the bytes itself: a small
 * `buildTiff` two-pass layout (compute where every IFD and every oversized
 * value lands, then serialize) and a `buildJpeg` wrapper around it, so a case
 * can say "Make is Canon, FNumber is 8/1" and get correct offsets without
 * anyone computing them by hand.
 */
import type { CheckSuite } from "./harness.mts";
import { dmsToDecimal, parseExif, parsePngTextChunks, stripExif } from "../lib/exif";

type ByteOrder = "LE" | "BE";

type FieldSpec =
  | { tag: number; type: 2; ascii: string }
  | { tag: number; type: 3; shorts: number[] }
  | { tag: number; type: 4; longs: number[] }
  | { tag: number; type: 5; rationals: [number, number][] };

function pushU16(arr: number[], value: number, order: ByteOrder) {
  const b0 = value & 0xff;
  const b1 = (value >> 8) & 0xff;
  if (order === "LE") arr.push(b0, b1);
  else arr.push(b1, b0);
}

function pushU32(arr: number[], value: number, order: ByteOrder) {
  const b0 = value & 0xff;
  const b1 = (value >>> 8) & 0xff;
  const b2 = (value >>> 16) & 0xff;
  const b3 = (value >>> 24) & 0xff;
  if (order === "LE") arr.push(b0, b1, b2, b3);
  else arr.push(b3, b2, b1, b0);
}

function fieldByteLength(field: FieldSpec): number {
  switch (field.type) {
    case 2:
      return field.ascii.length + 1;
    case 3:
      return field.shorts.length * 2;
    case 4:
      return field.longs.length * 4;
    case 5:
      return field.rationals.length * 8;
  }
}

function fieldCount(field: FieldSpec): number {
  switch (field.type) {
    case 2:
      return field.ascii.length + 1;
    case 3:
      return field.shorts.length;
    case 4:
      return field.longs.length;
    case 5:
      return field.rationals.length;
  }
}

function pushFieldBytes(arr: number[], field: FieldSpec, order: ByteOrder) {
  switch (field.type) {
    case 2:
      for (const ch of field.ascii) arr.push(ch.charCodeAt(0));
      arr.push(0);
      break;
    case 3:
      for (const v of field.shorts) pushU16(arr, v, order);
      break;
    case 4:
      for (const v of field.longs) pushU32(arr, v, order);
      break;
    case 5:
      for (const [num, den] of field.rationals) {
        pushU32(arr, num, order);
        pushU32(arr, den, order);
      }
      break;
  }
}

/** Builds a standalone TIFF byte buffer (IFD0, optionally an ExifIFD and a GPS IFD hung off it) with every offset computed rather than typed in by hand. */
function buildTiff(
  order: ByteOrder,
  opts: { ifd0: FieldSpec[]; exif?: FieldSpec[]; gps?: FieldSpec[] },
): Uint8Array {
  const ifd0Fields = [...opts.ifd0];
  if (opts.exif) ifd0Fields.push({ tag: 0x8769, type: 4, longs: [0] });
  if (opts.gps) ifd0Fields.push({ tag: 0x8825, type: 4, longs: [0] });

  const ifdSize = (fields: FieldSpec[]) => 2 + fields.length * 12 + 4;

  const ifd0Start = 8;
  const exifStart = ifd0Start + ifdSize(ifd0Fields);
  const gpsStart = exifStart + (opts.exif ? ifdSize(opts.exif) : 0);
  const dataStart = gpsStart + (opts.gps ? ifdSize(opts.gps) : 0);

  if (opts.exif) {
    const pointer = ifd0Fields.find((f) => f.tag === 0x8769) as Extract<FieldSpec, { type: 4 }>;
    pointer.longs = [exifStart];
  }
  if (opts.gps) {
    const pointer = ifd0Fields.find((f) => f.tag === 0x8825) as Extract<FieldSpec, { type: 4 }>;
    pointer.longs = [gpsStart];
  }

  let dataCursor = dataStart;
  const dataBytes: number[] = [];
  type Resolved = { tag: number; type: number; count: number; inline?: number[]; offset?: number };

  function resolve(fields: FieldSpec[]): Resolved[] {
    return fields.map((field) => {
      const byteLength = fieldByteLength(field);
      const count = fieldCount(field);
      if (byteLength <= 4) {
        const inline: number[] = [];
        pushFieldBytes(inline, field, order);
        while (inline.length < 4) inline.push(0);
        return { tag: field.tag, type: field.type, count, inline };
      }
      const offset = dataCursor;
      const bytes: number[] = [];
      pushFieldBytes(bytes, field, order);
      dataBytes.push(...bytes);
      dataCursor += bytes.length;
      return { tag: field.tag, type: field.type, count, offset };
    });
  }

  const resolvedIfd0 = resolve(ifd0Fields);
  const resolvedExif = opts.exif ? resolve(opts.exif) : [];
  const resolvedGps = opts.gps ? resolve(opts.gps) : [];

  const out: number[] = [];
  if (order === "LE") out.push(0x49, 0x49);
  else out.push(0x4d, 0x4d);
  pushU16(out, 42, order);
  pushU32(out, ifd0Start, order);

  function writeIfd(entries: Resolved[]) {
    pushU16(out, entries.length, order);
    for (const entry of entries) {
      pushU16(out, entry.tag, order);
      pushU16(out, entry.type, order);
      pushU32(out, entry.count, order);
      if (entry.inline) out.push(...entry.inline);
      else pushU32(out, entry.offset!, order);
    }
    pushU32(out, 0, order); // no next IFD
  }

  writeIfd(resolvedIfd0);
  if (opts.exif) writeIfd(resolvedExif);
  if (opts.gps) writeIfd(resolvedGps);
  out.push(...dataBytes);

  return Uint8Array.from(out);
}

/** Wraps a TIFF buffer in a minimal-but-real JPEG: SOI, one APP1 carrying it, SOS, arbitrary scan bytes, EOI. */
function buildJpegWithTiff(tiff: Uint8Array): Uint8Array {
  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
  const app1Payload = [...exifHeader, ...tiff];
  const app1Length = app1Payload.length + 2; // the length field counts itself
  const scan = [0xaa, 0xbb, 0xcc, 0xdd, 0xee]; // stand-in entropy-coded data

  return Uint8Array.from([
    0xff, 0xd8, // SOI
    0xff, 0xe1, (app1Length >> 8) & 0xff, app1Length & 0xff, ...app1Payload, // APP1
    0xff, 0xda, // SOS — everything after this is scan data
    ...scan,
    0xff, 0xd9, // EOI
  ]);
}

function buildJpegNoExif(): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x11, 0x22, 0x33, 0xff, 0xd9]);
}

function pngChunk(type: string, data: number[]): number[] {
  const length = data.length;
  const typeBytes = [...type].map((ch) => ch.charCodeAt(0));
  return [
    (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff,
    ...typeBytes,
    ...data,
    0, 0, 0, 0, // CRC — ignored by the reader
  ];
}

function buildPngWithText(keyword: string, text: string): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = pngChunk("IHDR", new Array(13).fill(0));
  const textData = [...keyword].map((ch) => ch.charCodeAt(0)).concat([0], [...text].map((ch) => ch.charCodeAt(0)));
  const text_ = pngChunk("tEXt", textData);
  const iend = pngChunk("IEND", []);
  return Uint8Array.from([...signature, ...ihdr, ...text_, ...iend]);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export const checks: CheckSuite = (check) => {
  const leJpeg = buildJpegWithTiff(
    buildTiff("LE", {
      ifd0: [
        { tag: 0x010f, type: 2, ascii: "Canon" },
        { tag: 0x0110, type: 2, ascii: "EOS R5" },
      ],
      exif: [{ tag: 0x829d, type: 5, rationals: [[8, 1]] }],
    }),
  );
  const leResult = parseExif(leJpeg);
  check(
    "exif: little-endian JPEG parses Make/Model and FNumber",
    leResult.ok && leResult.data.make === "Canon" && leResult.data.model === "EOS R5" && leResult.data.fNumber === 8,
    `got ${JSON.stringify(leResult)}`,
  );

  // Big-endian, with an ISO value whose bytes would decode to a wildly
  // different number if byte order were ignored (0x00C8 read as LE is 51200,
  // not 200) — this fails specifically when the endianness branch is wrong,
  // not just cosmetically.
  const beJpeg = buildJpegWithTiff(
    buildTiff("BE", {
      ifd0: [
        { tag: 0x010f, type: 2, ascii: "Nikon" },
        { tag: 0x0110, type: 2, ascii: "Z9" },
      ],
      exif: [{ tag: 0x8827, type: 3, shorts: [200] }],
    }),
  );
  const beResult = parseExif(beJpeg);
  check(
    "exif: big-endian JPEG parses correctly (endianness actually flips the read path)",
    beResult.ok && beResult.data.make === "Nikon" && beResult.data.iso === 200,
    `got ${JSON.stringify(beResult)}`,
  );

  check(
    "exif: dmsToDecimal matches a known real-world coordinate",
    Math.abs(dmsToDecimal(40, 26, 46, "N") - 40.446111) < 1e-4,
    `got ${dmsToDecimal(40, 26, 46, "N")}`,
  );

  check(
    "exif: dmsToDecimal negates for S/W references",
    dmsToDecimal(33, 53, 5, "S") < 0 && dmsToDecimal(151, 12, 36, "W") < 0,
    `got S=${dmsToDecimal(33, 53, 5, "S")} W=${dmsToDecimal(151, 12, 36, "W")}`,
  );

  const gpsJpeg = buildJpegWithTiff(
    buildTiff("LE", {
      ifd0: [{ tag: 0x010f, type: 2, ascii: "Apple" }],
      gps: [
        { tag: 0x0001, type: 2, ascii: "N" },
        { tag: 0x0002, type: 5, rationals: [[40, 1], [26, 1], [46, 1]] },
        { tag: 0x0003, type: 2, ascii: "W" },
        { tag: 0x0004, type: 5, rationals: [[73, 1], [59, 1], [8, 1]] },
      ],
    }),
  );
  const gpsResult = parseExif(gpsJpeg);
  check(
    "exif: JPEG with a GPS IFD reports hasGps and a correct decimal coordinate",
    gpsResult.ok &&
      gpsResult.hasGps &&
      Math.abs((gpsResult.data.gpsLatitude ?? 0) - 40.446111) < 1e-4 &&
      Math.abs((gpsResult.data.gpsLongitude ?? 0) - -73.985556) < 1e-4,
    `got ${JSON.stringify(gpsResult)}`,
  );

  const noGpsResult = parseExif(leJpeg);
  check(
    "exif: JPEG with no GPS IFD reports hasGps: false and ok: true",
    noGpsResult.ok && noGpsResult.hasGps === false,
    `got ${JSON.stringify(noGpsResult)}`,
  );

  const notAnImage = parseExif(Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]));
  check(
    "exif: a file that is neither JPEG nor PNG returns ok:false with a message, no throw",
    !notAnImage.ok && notAnImage.error.length > 0,
    `got ${JSON.stringify(notAnImage)}`,
  );

  const truncated = parseExif(Uint8Array.from([0xff, 0xd8, 0x00, 0x01, 0x02, 0x03]));
  check(
    "exif: a corrupted JPEG (magic bytes then garbage) returns ok:false, no throw",
    !truncated.ok,
    `got ${JSON.stringify(truncated)}`,
  );

  const png = buildPngWithText("Author", "Camal");
  const textChunks = parsePngTextChunks(png);
  check(
    "exif: PNG tEXt chunk keyword/value round-trip",
    textChunks.length === 1 && textChunks[0].keyword === "Author" && textChunks[0].text === "Camal",
    `got ${JSON.stringify(textChunks)}`,
  );

  // Locate SOS (0xFF 0xDA) the same way the lib does: the first such pair after the header.
  function findSos(bytes: Uint8Array): number {
    for (let i = 2; i < bytes.length - 1; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0xda) return i;
    }
    return -1;
  }

  const stripped = stripExif(leJpeg);
  const rescanned = stripped.ok ? parseExif(stripped.bytes) : null;
  const sosIndexOriginal = findSos(leJpeg);
  const sosIndexStripped = stripped.ok ? findSos(stripped.bytes) : -1;
  const scanTailMatches =
    stripped.ok &&
    sosIndexOriginal >= 0 &&
    sosIndexStripped >= 0 &&
    bytesEqual(leJpeg.subarray(sosIndexOriginal), stripped.bytes.subarray(sosIndexStripped));
  check(
    "exif: stripExif removes the Exif APP1 segment and leaves the SOS-onward bytes untouched",
    stripped.ok && rescanned !== null && rescanned.ok && !rescanned.hasGps &&
      rescanned.data.make === undefined && scanTailMatches,
    `stripped.ok=${stripped.ok} rescanned=${JSON.stringify(rescanned)} scanTailMatches=${scanTailMatches}`,
  );

  const noExifJpeg = buildJpegNoExif();
  const strippedNoExif = stripExif(noExifJpeg);
  check(
    "exif: stripping a JPEG with no EXIF to begin with returns it unchanged",
    strippedNoExif.ok && bytesEqual(strippedNoExif.bytes, noExifJpeg),
    `got ${strippedNoExif.ok ? JSON.stringify(Array.from(strippedNoExif.bytes)) : JSON.stringify(strippedNoExif)}`,
  );
};
