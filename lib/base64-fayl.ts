/**
 * File-to-Base64 and Base64-to-file, plus the arithmetic a visitor cannot see
 * just by looking at a base64 blob: how much bigger it got, and what kind of
 * file it actually is.
 *
 * `lib/base64` already encodes and decodes text; this file is
 * separate rather than an extension of it because text and bytes take a
 * genuinely different decode path. Text base64 round-trips through
 * `TextDecoder`, which is right for a JWT payload and wrong for a PNG — a
 * decoder set to UTF-8 throws on most binary files, and one left permissive
 * silently mangles them (U+FFFD replacement characters baked into what
 * should have been raw bytes). Everything here stays at the byte level and
 * never asks what encoding the bytes are in.
 *
 * MIME detection is the other reason this earns its own file: a file's
 * extension is what the visitor (or whoever renamed the file before them)
 * chose to call it, and a magic-byte signature is what the file's own first
 * bytes say it is. The two disagree often enough — a renamed `.jpg` that is
 * actually a PNG, a `.bin` that is actually a PDF — that reporting only one
 * of them would be reporting the less trustworthy one as though it were fact.
 */

/* Content magic-byte signatures for the formats this tool recognises without
   guessing. Order matters only in that each check is exclusive on its own
   leading bytes, so no signature can shadow another. */
export function detectMimeFromMagicBytes(bytes: Uint8Array): string | null {
  const b = bytes;

  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  // "%PDF"
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return "application/pdf";
  }
  // "GIF87a" or "GIF89a"
  if (
    b.length >= 6 &&
    b[0] === 0x47 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) &&
    b[5] === 0x61
  ) {
    return "image/gif";
  }
  // RIFF....WEBP
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return "image/webp";
  }
  // "BM"
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) {
    return "image/bmp";
  }
  // ICO directory header
  if (b.length >= 4 && b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) {
    return "image/x-icon";
  }
  // ZIP local-file, central-directory or end-of-central-directory signatures
  if (
    b.length >= 4 &&
    b[0] === 0x50 &&
    b[1] === 0x4b &&
    (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) &&
    (b[3] === 0x04 || b[3] === 0x06 || b[3] === 0x08)
  ) {
    return "application/zip";
  }

  return null;
}

/* A short, deliberately unsurprising extension list — the fallback for when
   the bytes themselves gave no signal (a text format has none), never the
   first thing consulted when the bytes did. */
const EXTENSION_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  zip: "application/zip",
  svg: "image/svg+xml",
  txt: "text/plain",
  json: "application/json",
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  wav: "audio/wav",
};

export function detectMimeFromExtension(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot === -1 || dot === filename.length - 1) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXTENSION_MIME[ext] ?? null;
}

export type MimeSource = "magic-bytes" | "extension" | "naməlum";

export type MimeResolution = {
  mime: string;
  source: MimeSource;
  /** True when the extension named a different, also-recognised type than the bytes did. */
  mismatch: boolean;
};

/**
 * The bytes are trusted over the name: a signature found in the file's own
 * first bytes wins even when the extension disagrees, and disagreement
 * itself is reported rather than silently dropped — a `.jpg` that is really
 * a PNG is exactly the case a visitor reaching for this tool wants to catch.
 */
export function resolveMime(filename: string, bytes: Uint8Array): MimeResolution {
  const fromBytes = detectMimeFromMagicBytes(bytes);
  const fromExtension = detectMimeFromExtension(filename);

  if (fromBytes) {
    return { mime: fromBytes, source: "magic-bytes", mismatch: fromExtension !== null && fromExtension !== fromBytes };
  }
  if (fromExtension) {
    return { mime: fromExtension, source: "extension", mismatch: false };
  }
  return { mime: "application/octet-stream", source: "naməlum", mismatch: false };
}

/* ---------- byte <-> base64, at the byte level ---------- */

/** Chunked so a large file does not blow the argument limit of `fromCharCode`. */
const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export type Base64ToBytesResult = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

export function base64ToBytes(value: string): Base64ToBytesResult {
  const cleaned = value.replace(/\s+/g, "");
  if (cleaned === "") {
    return { ok: false, error: "Boş sahə: Base64 mətnini yapışdır." };
  }

  const normalised = cleaned.replaceAll("-", "+").replaceAll("_", "/");

  const remainder = normalised.length % 4;
  if (remainder === 1) {
    return { ok: false, error: "Uzunluq yanlışdır: Base64 sətrinin uzunluğu 4-ün qatı olmalıdır." };
  }
  const padded = remainder === 0 ? normalised : normalised + "=".repeat(4 - remainder);

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) {
    return { ok: false, error: "Base64 əlifbasına aid olmayan simvol var (A–Z, a–z, 0–9, +, /)." };
  }

  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return { ok: true, bytes };
  } catch {
    return { ok: false, error: "Base64 dekodlanmadı: mətn pozulmuş ola bilər." };
  }
}

/* ---------- size arithmetic ---------- */

/** The exact base64 output length for a given byte count — three bytes become four characters, and a partial group is padded up to the next four. */
export function base64ByteLength(inputBytes: number): number {
  return Math.ceil(inputBytes / 3) * 4;
}

/** How much bigger the base64 form is, as a percentage of the original — 0 for an empty file rather than a division-by-zero `NaN`. */
export function growthPercent(inputBytes: number): number {
  if (inputBytes === 0) return 0;
  return ((base64ByteLength(inputBytes) - inputBytes) / inputBytes) * 100;
}

/** The line budget past which the tool warns before reading a file at all — 5 MB of source becomes 6.7 MB of base64 text, which is already an uncomfortable amount to hold in a textarea. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function exceedsLimit(byteLength: number): boolean {
  return byteLength > MAX_FILE_BYTES;
}

/* ---------- ready-to-paste forms ---------- */

export function buildDataUri(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`;
}

export function buildImgTagSnippet(dataUri: string): string {
  return `<img src="${dataUri}" alt="" />`;
}

export function buildCssUrlSnippet(dataUri: string): string {
  return `background-image: url(${dataUri});`;
}

/**
 * Breaks a base64 string into fixed-width lines — the RFC 2045 (MIME)
 * convention of wrapping encoded content at 76 characters, offered as an
 * option because a data URI wants one unbroken line and a `.b64` file wants
 * the opposite.
 */
export function wrapBase64(base64: string, lineLength = 76): string {
  if (lineLength <= 0) return base64;
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += lineLength) {
    lines.push(base64.slice(i, i + lineLength));
  }
  return lines.join("\n");
}

/**
 * Strips a `data:<mime>;base64,` prefix when the pasted text has one, so the
 * decode field accepts either a bare base64 blob or a full data URI without
 * the visitor having to trim it by hand. Text without the prefix passes
 * through unchanged, with `mime` reported `null` rather than guessed.
 */
export function stripDataUriPrefix(value: string): { mime: string | null; base64: string } {
  const trimmed = value.trim();
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(trimmed);
  if (match) {
    return { mime: match[1] ?? null, base64: match[2] ?? "" };
  }
  return { mime: null, base64: trimmed };
}
