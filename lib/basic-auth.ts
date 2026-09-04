/**
 * HTTP Basic Auth (RFC 7617): turning a username and a password into the
 * `Authorization: Basic <base64>` header, and the reverse — pulling the pair
 * back out of a header a visitor pasted.
 *
 * RFC 7617 says the `username:password` pair is UTF-8 before it is
 * Base64'd. Plenty of servers still written against the older RFC 2617
 * assume ISO-8859-1 (Latin-1) instead, because that was the de-facto default
 * before RFC 7617 existed. For an ASCII-only pair the two agree byte for
 * byte; the moment the password carries a non-ASCII letter they diverge, and
 * a codepoint above U+00FF cannot be represented in Latin-1 at all — this
 * file says so rather than inventing a byte sequence nobody's server would
 * actually produce.
 *
 * Deliberately not built on `src/lib/tools/base64.ts`: that file's decoder
 * always assumes the bytes underneath are UTF-8, which is correct for a
 * generic Base64 tool but wrong here — parsing a pasted header has to try
 * UTF-8 first and fall back to a byte-for-byte Latin-1 reading when that
 * fails, a case `base64.ts` has no reason to support. `hmac.ts`,
 * `jwt-imza.ts` and `sifreleme.ts` each carry their own small Base64/byte
 * helpers for the same reason; this file does the same rather than reaching
 * across.
 *
 * What this file does NOT do: compute a bcrypt or APR1-MD5 hash for a
 * server's own credential store. Those are salted, iterated constructions a
 * hand-written implementation would be an easy place to get subtly wrong,
 * and the widget says exactly that — it shows the command that computes the
 * real hash rather than a plausible-looking one this file made up.
 */

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function bytesToBinary(bytes: Uint8Array<ArrayBuffer>): string {
  const chunk = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  return btoa(bytesToBinary(bytes));
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  const cleaned = value.trim().replace(/\s+/g, "");
  if (cleaned === "") return null;
  const remainder = cleaned.length % 4;
  if (remainder === 1) return null;
  const padded = remainder === 0 ? cleaned : cleaned + "=".repeat(4 - remainder);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) return null;
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Wraps a value as a POSIX single-quoted shell argument, escaping any embedded quote mark. */
function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export type UsernameCheck = { ok: true } | { ok: false; error: string };

/**
 * The first colon in the decoded pair is the separator RFC 7617 uses to
 * split username from password — a username that contains one would
 * silently steal the first slice of the password on every server that
 * decodes the header.
 */
export function validateUsername(username: string): UsernameCheck {
  if (username === "") return { ok: false, error: "İstifadəçi adı boşdur." };
  if (username.includes(":")) {
    return {
      ok: false,
      error:
        "İstifadəçi adında `:` ola bilməz — RFC 7617-də dekodlanmış mətndəki İLK `:` ayırıcı sayılır, ad özü `:` daşısa parolun bir hissəsi adın içinə düşər.",
    };
  }
  return { ok: true };
}

export type EncodedCredential = { base64: string; header: string };

function encodeUtf8(username: string, password: string): EncodedCredential {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  const base64 = bytesToBase64(bytes);
  return { base64, header: `Basic ${base64}` };
}

export type Latin1Result = { ok: true; base64: string; header: string } | { ok: false; error: string };

function encodeLatin1(username: string, password: string): Latin1Result {
  const combined = `${username}:${password}`;
  for (const char of combined) {
    const point = char.codePointAt(0) ?? 0;
    if (point > 0xff) {
      const hex = point.toString(16).toUpperCase().padStart(4, "0");
      return {
        ok: false,
        error: `"${char}" hərfi Latin-1-də yoxdur (kod nöqtəsi U+${hex}) — Latin-1 gözləyən köhnə server bu parolu ümumiyyətlə kodlaşdıra bilməz, UTF-8 isə bilər.`,
      };
    }
  }
  const bytes = Uint8Array.from(combined, (c) => c.charCodeAt(0));
  const base64 = bytesToBase64(bytes);
  return { ok: true, base64, header: `Basic ${base64}` };
}

export type BuildResult =
  | {
      ok: true;
      utf8: EncodedCredential;
      latin1: Latin1Result;
      /** True only when the Latin-1 encoding succeeded and landed on a different Base64 string than UTF-8. */
      differs: boolean;
    }
  | { ok: false; error: string };

/**
 * Both encodings computed at once, because the point of this tool is showing
 * a visitor that they are not automatically the same string. RFC 7617's own
 * worked example (Aladdin / open sesame) is ASCII-only, so it is the
 * known-answer this function is checked against; the two encodings agree
 * exactly there, which is itself part of what the test proves.
 */
export function buildBasicAuthHeader(username: string, password: string): BuildResult {
  const usernameCheck = validateUsername(username);
  if (!usernameCheck.ok) return usernameCheck;
  if (password === "") return { ok: false, error: "Parol boşdur." };

  const utf8 = encodeUtf8(username, password);
  const latin1 = encodeLatin1(username, password);

  return { ok: true, utf8, latin1, differs: latin1.ok && latin1.base64 !== utf8.base64 };
}

export type ParseResult =
  | { ok: true; username: string; password: string; encoding: "utf-8" | "latin1-fallback" }
  | { ok: false; error: string };

/**
 * The reverse direction: accepts either the full `Basic <base64>` header or
 * just the Base64 part. UTF-8 is tried first, since it is what RFC 7617
 * itself produces; a byte sequence that is not valid UTF-8 is re-read one
 * byte per character instead — which is exactly what a Latin-1 sender
 * actually produced, and the only honest way to recover it without knowing
 * in advance which encoding was used.
 */
export function parseBasicAuthHeader(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: "Boş sahə — `Authorization` başlığını və ya onun Base64 hissəsini yapışdır." };
  }

  const withoutScheme = trimmed.replace(/^basic\s+/i, "").trim();
  const bytes = base64ToBytes(withoutScheme);
  if (bytes === null) {
    return { ok: false, error: "Bu düzgün Base64 deyil — «Basic » sözündən sonrakı hissəni yapışdır." };
  }

  let text: string;
  let encoding: "utf-8" | "latin1-fallback";
  try {
    text = UTF8_DECODER.decode(bytes);
    encoding = "utf-8";
  } catch {
    text = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    encoding = "latin1-fallback";
  }

  const colonIndex = text.indexOf(":");
  if (colonIndex === -1) {
    return { ok: false, error: "Dekodlanmış mətndə `:` yoxdur — bu düzgün istifadəçi_adı:parol cütü deyil." };
  }

  return { ok: true, username: text.slice(0, colonIndex), password: text.slice(colonIndex + 1), encoding };
}

export type ServerSnippets = { curl: string; caddy: string; nginx: string; apache: string };

/**
 * Config text for the four places a visitor actually pastes this: a curl
 * call, and the directive block for the three servers that ship Basic Auth
 * natively. Caddy's `basic_auth` and the `.htpasswd` line nginx/Apache read
 * both need a hashed password, not the plaintext one this file has — that
 * hash is left as a placeholder and the widget names the exact command that
 * computes it, rather than this file guessing at bcrypt or APR1-MD5.
 */
export function buildServerSnippets(username: string, password: string, url: string): ServerSnippets {
  const target = url.trim() === "" ? "https://sayt.com/qorunan-yol" : url.trim();
  return {
    curl: `curl -u ${shellSingleQuote(`${username}:${password}`)} ${shellSingleQuote(target)}`,
    caddy: `sayt.com {\n    basic_auth {\n        ${username} <bcrypt-hash-buraya>\n    }\n}`,
    nginx: `location /qorunan {\n    auth_basic "Qorunan sahə";\n    auth_basic_user_file /etc/nginx/.htpasswd;\n}`,
    apache: `AuthType Basic\nAuthName "Qorunan sahə"\nAuthUserFile /etc/apache2/.htpasswd\nRequire user ${username}`,
  };
}
