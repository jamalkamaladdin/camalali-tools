/**
 * Base64 encoding and decoding. Pure functions, no React and no DOM beyond the
 * TextEncoder/TextDecoder pair, so `pnpm test` can prove the behaviour that the
 * page only displays.
 */

const encoder = new TextEncoder();
// `fatal` makes an invalid byte sequence throw instead of silently producing
// U+FFFD — a decoder that never fails would report broken input as success.
const decoder = new TextDecoder("utf-8", { fatal: true });

export type Base64Options = {
  /** `+` and `/` become `-` and `_` — the form that survives a URL or a JWT. */
  urlSafe: boolean;
  /** Trailing `=` kept. Most decoders accept both; some strict ones do not. */
  padding: boolean;
};

export type DecodeResult =
  | { ok: true; text: string; bytes: number }
  | { ok: false; error: string };

/** Chunked so a large input does not blow the argument limit of `fromCharCode`. */
function bytesToBinary(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

export function encodeBase64(text: string, options: Base64Options): string {
  if (text === "") return "";

  const bytes = encoder.encode(text);
  let out = btoa(bytesToBinary(bytes));

  if (options.urlSafe) out = out.replaceAll("+", "-").replaceAll("/", "_");
  if (!options.padding) out = out.replace(/=+$/, "");

  return out;
}

export function decodeBase64(value: string): DecodeResult {
  // Pasted Base64 is usually wrapped across lines; whitespace is never data.
  const cleaned = value.replace(/\s+/g, "");
  if (cleaned === "") {
    return { ok: false, error: "Boş sahə — Base64 mətnini yapışdır." };
  }

  let normalised = cleaned.replaceAll("-", "+").replaceAll("_", "/");

  const remainder = normalised.length % 4;
  if (remainder === 1) {
    return {
      ok: false,
      error: "Uzunluq yanlışdır: Base64 sətrinin uzunluğu 4-ün qatı olmalıdır.",
    };
  }
  if (remainder !== 0) normalised += "=".repeat(4 - remainder);

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalised)) {
    return {
      ok: false,
      error: "Base64 əlifbasına aid olmayan simvol var (A–Z, a–z, 0–9, +, /).",
    };
  }

  try {
    const binary = atob(normalised);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return { ok: true, text: decoder.decode(bytes), bytes: bytes.length };
  } catch {
    return {
      ok: false,
      error: "Dekod alındı, amma nəticə düzgün UTF-8 mətn deyil.",
    };
  }
}

/** Byte length, not character length — `ə` is two bytes, `€` is three. */
export function byteLength(text: string): number {
  return encoder.encode(text).length;
}
