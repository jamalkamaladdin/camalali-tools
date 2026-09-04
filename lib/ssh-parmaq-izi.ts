/**
 * SSH public key inspection: the fingerprint OpenSSH prints, the key's real
 * strength and the `authorized_keys` options attached to it — all read from
 * the wire-format blob itself, never from the surrounding text.
 *
 * That last point is the reason this file exists apart from the widget. The
 * line a visitor pastes — `ssh-rsa AAAA... user@host` — carries a type name
 * twice: once as the first word on the line, and once more, length-prefixed,
 * inside the Base64 blob itself. A hand-edited or truncated key can disagree
 * with itself on that point while still looking like a normal line, and the
 * only way to catch it is to decode the blob and compare. Same story for an
 * RSA key's bit length: the string `AAAAB3NzaC1yc2E...` gives no honest answer
 * to "how many bits", because Base64 length tracks the DER encoding's byte
 * count, not the modulus — a key can gain or lose a leading zero byte in `n`
 * without changing its actual size by a single bit. So this module speaks the
 * wire format directly: `uint32 length` + that many bytes, repeated, exactly
 * as RFC 4253 §6.6 defines it, and both fingerprints are the digest of that
 * decoded blob, not of the line that carried it.
 */

import { md5Bytes, sha256Bytes } from "./hash";

export type SshKeyType =
  | "ssh-ed25519"
  | "ecdsa-sha2-nistp256"
  | "ecdsa-sha2-nistp384"
  | "ecdsa-sha2-nistp521"
  | "ssh-rsa"
  | "ssh-dss";

/** Declaration order — also the order the unsupported-type error message lists them in. */
export const KNOWN_KEY_TYPES: SshKeyType[] = [
  "ssh-ed25519",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
  "ssh-rsa",
  "ssh-dss",
];

export type SshKeyOption = {
  /** Exactly as written, quotes and all — what the widget shows next to the note. */
  raw: string;
  name: string;
  /** `null` for a bare flag such as `no-pty`; unquoted for a quoted value such as `command="..."`. */
  value: string | null;
  note: string;
};

export type SshPublicKeyInfo = {
  type: SshKeyType;
  /** Display label, e.g. "Ed25519" or "RSA (2048 bit)" — what the panel title shows. */
  typeLabel: string;
  /** Modulus / curve bit length. `null` only when the blob could not be measured. */
  bits: number | null;
  /** Whether this key is still considered fit for new use, today. */
  adequate: boolean;
  /** One sentence explaining the `adequate` verdict, shown to the visitor. */
  adequacyNote: string;
  comment: string;
  options: SshKeyOption[];
  /** The unparsed options field, or `null` when the line carried none. */
  optionsRaw: string | null;
  /** A sentence naming what the key is restricted to, or `null` when it is unrestricted. */
  restriction: string | null;
  /** `SHA256:` + unpadded Base64 of the SHA-256 digest of the decoded blob — the form `ssh-keygen -lf` prints since OpenSSH 6.8. */
  sha256Fingerprint: string;
  /** `MD5:` + colon-hex of the MD5 digest of the decoded blob — the form every OpenSSH before 6.8 printed, and `-E md5` still does. */
  md5Fingerprint: string;
};

export type SshLineResult =
  | { input: string; ok: true; key: SshPublicKeyInfo }
  | { input: string; ok: false; error: string };

export type SshInspection =
  | { refused: true; reason: string }
  | { refused: false; results: SshLineResult[] };

/*
 * Every private-key PEM header OpenSSH and OpenSSL still write —
 * `OPENSSH PRIVATE KEY` for the modern format, `RSA`/`EC`/`DSA PRIVATE KEY`
 * for the old PKCS#1 ones, and the bare `PRIVATE KEY` PKCS#8 wraps. All of
 * them start the line the same way, so one pattern catches all of them. This
 * runs before the input is split into lines or touched in any other way —
 * "refuse before parsing" only means something if refusal is the first thing
 * that happens.
 */
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;

/*
 * Explanations for the handful of `authorized_keys` options a visitor is
 * likely to actually paste. Modelled on `STANDARD_CLAIM_NOTES` in
 * `src/lib/tools/jwt.ts`: a fixed vocabulary, keyed by the lowercase option
 * name, with an honest fallback sentence for anything not in it rather than
 * a blank cell.
 */
const OPTION_NOTES: Record<string, string> = {
  command:
    "Bu açarla girişdə istənilən əmr əvəzinə YALNIZ bu əmr işə salınır: istifadəçinin öz seçdiyi heç nə işləmir.",
  restrict:
    "Bütün əlavə imkanlar (port yönləndirmə, agent yönləndirmə, X11, pty, istifadəçi rc) qabaqcadan söndürülür. Sonra yalnız açıq şəkildə icazə verilən qayıdır.",
  from: "Bu açarla yalnız göstərilən host və ya şəbəkədən bağlanmaq mümkündür, başqa ünvandan gələn cəhd rədd edilir.",
  "no-pty": "Terminal (pty) ayrılmır: bu açarla interaktiv seans açıla bilmir.",
  "no-port-forwarding": "Port yönləndirməsi bu açarla qadağandır.",
  "no-x11-forwarding": "X11 yönləndirməsi bu açarla qadağandır.",
  "no-agent-forwarding": "SSH agent yönləndirməsi bu açarla qadağandır.",
  "no-user-rc": "Girişdə istifadəçinin öz `~/.ssh/rc` faylı işə salınmır.",
  permitopen: "Port yönləndirməsi yalnız göstərilən host və porta icazəlidir, qalanı rədd edilir.",
  permitlisten: "Uzaq port yönləndirməsi yalnız göstərilən portda dinləməyə icazəlidir.",
  environment: "Girişdə seansa əlavə bir mühit dəyişəni ötürülür.",
  "expiry-time": "Açarın son istifadə tarixi göstərilib: bu tarixdən sonra server açarı qəbul etmir.",
  tunnel: "Bu açarla tun cihazı yönləndirməsinə icazə verilir.",
};

/** Bytes as ASCII — the type and curve-name fields inside a key blob are always ASCII per RFC 4251 §5. */
function bytesToAscii(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Raw-byte Base64, kept apart from `src/lib/tools/base64.ts` on purpose: that
 * file's decoder runs the result through a UTF-8 `TextDecoder` because its job
 * is recovering text, and a key blob is not text — most of its bytes are not
 * valid UTF-8 at all, so that decoder would reject a perfectly good key. This
 * one stops at bytes, which is as far as a key blob ever needs to go.
 */
function base64ToBytes(value: string): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  const cleaned = value.trim();
  if (cleaned === "") {
    return { ok: false, error: "Base64 blok boşdur." };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
    return { ok: false, error: "Base64 blokunda əlifbaya aid olmayan simvol var." };
  }

  const remainder = cleaned.length % 4;
  if (remainder === 1) {
    return {
      ok: false,
      error: "Base64 blokunun uzunluğu yanlışdır: kopyalama zamanı kəsilmiş ola bilər.",
    };
  }
  const padded = remainder === 0 ? cleaned : cleaned + "=".repeat(4 - remainder);

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { ok: true, bytes };
  } catch {
    return { ok: false, error: "Base64 dekodlaşdırılmadı: blok zədələnmiş ola bilər." };
  }
}

/** Chunked so a large blob does not blow `String.fromCharCode`'s argument limit — mirrors `base64.ts`'s own chunking. */
function bytesToBase64(bytes: Uint8Array, padding: boolean): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  let out = btoa(binary);
  if (!padding) out = out.replace(/=+$/, "");
  return out;
}

function colonHex(hex: string): string {
  const pairs: string[] = [];
  for (let i = 0; i < hex.length; i += 2) pairs.push(hex.slice(i, i + 2));
  return pairs.join(":");
}

type FieldRead = { ok: true; value: Uint8Array; next: number } | { ok: false; error: string };

/** One `uint32 length` + that many bytes — the one repeated shape the whole wire format is built from. */
function readLengthPrefixed(bytes: Uint8Array, offset: number, fieldName: string): FieldRead {
  if (offset + 4 > bytes.length) {
    return {
      ok: false,
      error: `Blok yarımçıqdır: "${fieldName}" sahəsinin uzunluq başlığı üçün bayt qalmayıb.`,
    };
  }
  const length =
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  const start = offset + 4;
  const end = start + length;
  if (end > bytes.length) {
    return {
      ok: false,
      error: `Blok yarımçıqdır: "${fieldName}" sahəsi ${length} bayt elan edir, amma yalnız ${bytes.length - start} bayt qalıb.`,
    };
  }
  return { ok: true, value: bytes.subarray(start, end), next: end };
}

/*
 * An mpint's true bit length. The wire format prefixes a positive number with
 * one extra 0x00 byte whenever the most significant bit of the real value
 * would otherwise land in the sign position — that guard byte has to be
 * dropped before counting, or every RSA-2048 key would measure 2056. What is
 * left after that is counted bit by bit rather than assumed byte-aligned:
 * a real key's true size is whatever `ssh-keygen -lf` reports, and that is
 * not always a round number.
 */
function mpintBits(value: Uint8Array): number {
  let bytes = value;
  if (bytes.length > 1 && bytes[0] === 0x00) {
    bytes = bytes.subarray(1);
  }
  if (bytes.length === 0) return 0;

  let topBits = 0;
  let top = bytes[0];
  while (top > 0) {
    topBits++;
    top >>= 1;
  }
  if (topBits === 0) topBits = 1;

  return (bytes.length - 1) * 8 + topBits;
}

type BlobParse = { ok: true; bits: number | null } | { ok: false; error: string };

/** Walks the declared type's fields and reports the one number worth showing — bit length, where the type has one. */
function parseKeyBlob(declaredType: SshKeyType, bytes: Uint8Array): BlobParse {
  const typeField = readLengthPrefixed(bytes, 0, "tip");
  if (!typeField.ok) return typeField;

  const innerType = bytesToAscii(typeField.value);
  if (innerType !== declaredType) {
    return {
      ok: false,
      error: `Struktur uyğunsuzluğu: sətirdə "${declaredType}" yazılıb, amma blokun daxilindəki tip sahəsi "${innerType}". Açar zədələnmiş və ya əl ilə redaktə edilib.`,
    };
  }

  const offset = typeField.next;

  switch (declaredType) {
    case "ssh-ed25519": {
      const pub = readLengthPrefixed(bytes, offset, "açıq açar nöqtəsi");
      if (!pub.ok) return pub;
      return { ok: true, bits: 256 };
    }

    case "ecdsa-sha2-nistp256":
    case "ecdsa-sha2-nistp384":
    case "ecdsa-sha2-nistp521": {
      const curve = readLengthPrefixed(bytes, offset, "əyri adı");
      if (!curve.ok) return curve;

      const point = readLengthPrefixed(bytes, curve.next, "əyri nöqtəsi");
      if (!point.ok) return point;

      const expectedCurve = declaredType.slice("ecdsa-sha2-".length);
      const curveName = bytesToAscii(curve.value);
      if (curveName !== expectedCurve) {
        return {
          ok: false,
          error: `Struktur uyğunsuzluğu: açar növü "${declaredType}" elan edir, amma blokun daxilindəki əyri adı "${curveName}".`,
        };
      }

      const bits = declaredType === "ecdsa-sha2-nistp256" ? 256 : declaredType === "ecdsa-sha2-nistp384" ? 384 : 521;
      return { ok: true, bits };
    }

    case "ssh-rsa": {
      const e = readLengthPrefixed(bytes, offset, "e (ictimai eksponent)");
      if (!e.ok) return e;
      const n = readLengthPrefixed(bytes, e.next, "n (modul)");
      if (!n.ok) return n;
      return { ok: true, bits: mpintBits(n.value) };
    }

    case "ssh-dss": {
      const p = readLengthPrefixed(bytes, offset, "p");
      if (!p.ok) return p;
      const q = readLengthPrefixed(bytes, p.next, "q");
      if (!q.ok) return q;
      const g = readLengthPrefixed(bytes, q.next, "g");
      if (!g.ok) return g;
      const y = readLengthPrefixed(bytes, g.next, "y (açıq dəyər)");
      if (!y.ok) return y;
      return { ok: true, bits: mpintBits(p.value) };
    }
  }
}

function describeKeyType(type: SshKeyType, bits: number | null): { label: string; adequate: boolean; note: string } {
  switch (type) {
    case "ssh-ed25519":
      return {
        label: "Ed25519",
        adequate: true,
        note: "Ed25519 hazırkı defolt və tövsiyə olunan açar növüdür: sabit 256 bit təhlükəsizlik səviyyəsi verir və tətbiqi RSA-dan qat-qat sürətlidir.",
      };
    case "ecdsa-sha2-nistp256":
    case "ecdsa-sha2-nistp384":
    case "ecdsa-sha2-nistp521":
      return {
        label: `ECDSA P-${bits}`,
        adequate: true,
        note: `${bits} bitlik NIST əyrisi: bu gün üçün etibarlı sayılır, yeni açar üçün isə adətən Ed25519 tövsiyə olunur.`,
      };
    case "ssh-rsa": {
      const safeBits = bits ?? 0;
      const adequate = safeBits >= 2048;
      return {
        label: bits !== null ? `RSA (${bits} bit)` : "RSA",
        adequate,
        note: adequate
          ? `${bits} bitlik modul 2048 bit həddini keçir: hələ də qəbul ediləndir, yeni açar üçün isə Ed25519 seçilməlidir.`
          : `${bits} bitlik modul 2048 bit həddindən aşağıdır: bu açar zəif sayılır və dəyişdirilməlidir.`,
      };
    }
    case "ssh-dss":
      return {
        label: bits !== null ? `DSA (${bits} bit)` : "DSA",
        adequate: false,
        note: "DSA artıq etibarlı sayılmır: OpenSSH 7.0-dan (2015) bəri defolt olaraq söndürülüb və bir çox server onu ümumiyyətlə qəbul etmir.",
      };
  }
}

/*
 * Tokenises a line the way `authorized_keys` itself has to be read: split on
 * unquoted whitespace, keeping a quoted run (an option's quoted value, which
 * can contain spaces and commas) as one token. Writing this by hand rather
 * than a plain whitespace split is the whole reason a quoted value containing
 * spaces does not fall apart into several tokens.
 */
function tokenizeLine(line: string): string[] {
  const tokens: string[] = [];
  const n = line.length;
  let i = 0;

  while (i < n) {
    while (i < n && (line[i] === " " || line[i] === "\t")) i++;
    if (i >= n) break;

    const start = i;
    let inQuotes = false;
    while (i < n && (inQuotes || (line[i] !== " " && line[i] !== "\t"))) {
      const ch = line[i];
      if (ch === "\\" && inQuotes && i + 1 < n) {
        i += 2;
        continue;
      }
      if (ch === '"') inQuotes = !inQuotes;
      i++;
    }
    tokens.push(line.slice(start, i));
  }

  return tokens;
}

/** Splits an options field on unquoted commas — the same quote-awareness `tokenizeLine` uses for whitespace. */
function splitOptions(raw: string): string[] {
  const tokens: string[] = [];
  const n = raw.length;
  let i = 0;

  while (i < n) {
    if (raw[i] === ",") {
      i++;
      continue;
    }
    const start = i;
    let inQuotes = false;
    while (i < n && (inQuotes || raw[i] !== ",")) {
      const ch = raw[i];
      if (ch === "\\" && inQuotes && i + 1 < n) {
        i += 2;
        continue;
      }
      if (ch === '"') inQuotes = !inQuotes;
      i++;
    }
    const token = raw.slice(start, i);
    if (token !== "") tokens.push(token);
  }

  return tokens;
}

function parseSingleOption(token: string): SshKeyOption {
  const equals = token.indexOf("=");
  if (equals === -1) {
    const name = token.toLowerCase();
    return { raw: token, name, value: null, note: OPTION_NOTES[name] ?? "Bu seçimin izahı bu alətin lüğətində yoxdur." };
  }

  const name = token.slice(0, equals).toLowerCase();
  let value = token.slice(equals + 1);
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
  }
  return { raw: token, name, value, note: OPTION_NOTES[name] ?? "Bu seçimin izahı bu alətin lüğətində yoxdur." };
}

function parseOptions(raw: string): SshKeyOption[] {
  return splitOptions(raw).map(parseSingleOption);
}

function restrictionSummary(options: SshKeyOption[]): string | null {
  const command = options.find((option) => option.name === "command");
  if (command && command.value) {
    return `Bu açar yalnız bir əmri işə sala bilər: \`${command.value}\`. Sahibi bu açarla başqa heç nə edə bilməz.`;
  }
  if (options.some((option) => option.name === "restrict")) {
    return "Bu açar `restrict` seçimi ilə minimuma endirilib: port yönləndirmə, agent, X11, pty və istifadəçi rc-si söndürülüb.";
  }
  if (options.length > 0) {
    return "Bu açara giriş şərtləri əlavə olunub: aşağıdakı seçimlərə bax.";
  }
  return null;
}

/** One `authorized_keys` line, already known to be non-blank and not a `#` comment. */
export function parseSshKeyLine(line: string): SshLineResult {
  const tokens = tokenizeLine(line);
  if (tokens.length === 0) {
    return { input: line, ok: false, error: "Boş sətir." };
  }

  let optionsRaw: string | null = null;
  let typeToken: string | undefined;
  let blobToken: string | undefined;
  let commentTokens: string[];

  if ((KNOWN_KEY_TYPES as string[]).includes(tokens[0])) {
    typeToken = tokens[0];
    blobToken = tokens[1];
    commentTokens = tokens.slice(2);
  } else {
    optionsRaw = tokens[0];
    typeToken = tokens[1];
    blobToken = tokens[2];
    commentTokens = tokens.slice(3);
  }

  if (typeToken === undefined || !(KNOWN_KEY_TYPES as string[]).includes(typeToken)) {
    return {
      input: line,
      ok: false,
      error: `Açar növü tanınmadı${typeToken ? ` ("${typeToken}")` : ""}, dəstəklənən növlər: ${KNOWN_KEY_TYPES.join(", ")}.`,
    };
  }
  if (blobToken === undefined || blobToken === "") {
    return { input: line, ok: false, error: "Base64 blok tapılmadı: sətir yarımçıqdır." };
  }

  const decoded = base64ToBytes(blobToken);
  if (!decoded.ok) {
    return { input: line, ok: false, error: decoded.error };
  }

  const type = typeToken as SshKeyType;
  const parsed = parseKeyBlob(type, decoded.bytes);
  if (!parsed.ok) {
    return { input: line, ok: false, error: parsed.error };
  }

  const options = optionsRaw !== null ? parseOptions(optionsRaw) : [];
  const comment = commentTokens.join(" ");
  const { label, adequate, note } = describeKeyType(type, parsed.bits);

  const sha256Hex = sha256Bytes(decoded.bytes);
  const md5Hex = md5Bytes(decoded.bytes);

  const key: SshPublicKeyInfo = {
    type,
    typeLabel: label,
    bits: parsed.bits,
    adequate,
    adequacyNote: note,
    comment,
    options,
    optionsRaw,
    restriction: restrictionSummary(options),
    sha256Fingerprint: `SHA256:${bytesToBase64(hexToBytes(sha256Hex), false)}`,
    md5Fingerprint: `MD5:${colonHex(md5Hex)}`,
  };

  return { input: line, ok: true, key };
}

/**
 * The whole pasted field: one line, or a multi-line `authorized_keys` file.
 * Private-key detection runs first and unconditionally — a match returns
 * before a single line is split out or a single byte is decoded, which is
 * the guarantee "refused, not parsed" actually rests on.
 */
export function inspectSshInput(rawInput: string): SshInspection {
  if (PRIVATE_KEY_PATTERN.test(rawInput)) {
    return {
      refused: true,
      reason:
        "Bu, açıq (public) açar deyil. Özəl (private) açar görünür. Özəl açar heç vaxt bir veb səhifəyə yapışdırılmamalıdır: yapışdırdığın an mətn bu səhifənin brauzer yaddaşına düşür. Bu alət onu oxumayıb, emal etmədi. Ehtiyat üçün isə həmin açarı sil və ya yenisi ilə əvəz et (rotate et).",
    };
  }

  const results: SshLineResult[] = [];
  for (const rawLine of rawInput.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    results.push(parseSshKeyLine(line));
  }

  return { refused: false, results };
}
