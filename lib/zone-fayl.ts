/**
 * A BIND-style zone file, read into a table and written back out — the only
 * tool in this batch with no network route, because everything it needs is
 * already sitting in the text the visitor pastes.
 *
 * The parser is deliberately narrower than a real nameserver's: it handles
 * `$ORIGIN`/`$TTL`, comments, parenthesised multi-line records and the eight
 * record types this tool shows, and it reads a record's name, TTL and class
 * with the same optional-in-either-order rule BIND itself uses. What it does
 * not do is resolve a relative name against `$ORIGIN` into a fully-qualified
 * one — a name is kept exactly as written, because that is what makes
 * `parseZoneFile` and `buildZoneFile` exact inverses of each other, which is
 * the property `scripts/tools-checks/zone-fayl.mts` proves with a
 * parse-build-parse round trip.
 */

export const ZONE_RECORD_TYPES = ["A", "AAAA", "CNAME", "NS", "MX", "TXT", "SRV", "CAA", "SOA"] as const;

export type ZoneRecordType = (typeof ZONE_RECORD_TYPES)[number];

const RECORD_TYPE_SET = new Set<string>(ZONE_RECORD_TYPES);

type CommonFields = { name: string; ttl: number | null };

export type ARecord = CommonFields & { type: "A"; address: string };
export type AaaaRecord = CommonFields & { type: "AAAA"; address: string };
export type CnameRecord = CommonFields & { type: "CNAME"; target: string };
export type NsRecord = CommonFields & { type: "NS"; target: string };
export type MxRecord = CommonFields & { type: "MX"; priority: number; target: string };
export type TxtRecord = CommonFields & { type: "TXT"; value: string };
export type SrvRecord = CommonFields & { type: "SRV"; priority: number; weight: number; port: number; target: string };
export type CaaRecord = CommonFields & { type: "CAA"; flag: number; tag: string; value: string };
export type SoaRecord = CommonFields & {
  type: "SOA";
  mname: string;
  rname: string;
  serial: number;
  refresh: number;
  retry: number;
  expire: number;
  minimum: number;
};

export type ZoneRecord =
  | ARecord
  | AaaaRecord
  | CnameRecord
  | NsRecord
  | MxRecord
  | TxtRecord
  | SrvRecord
  | CaaRecord
  | SoaRecord;

export type ZoneIssueSeverity = "xeta" | "xeberdarliq" | "melumat";

export type ZoneIssue = { severity: ZoneIssueSeverity; line: number | null; message: string };

/** A fresh row for the "add record" control — sane placeholder values, never a fabricated real one. */
export function emptyRecord(type: ZoneRecordType, name: string): ZoneRecord {
  const common = { name, ttl: null as number | null };
  switch (type) {
    case "A":
      return { ...common, type, address: "0.0.0.0" };
    case "AAAA":
      return { ...common, type, address: "::" };
    case "CNAME":
      return { ...common, type, target: "" };
    case "NS":
      return { ...common, type, target: "" };
    case "MX":
      return { ...common, type, priority: 10, target: "" };
    case "TXT":
      return { ...common, type, value: "" };
    case "SRV":
      return { ...common, type, priority: 10, weight: 5, port: 443, target: "" };
    case "CAA":
      return { ...common, type, flag: 0, tag: "issue", value: "" };
    case "SOA":
      return {
        ...common,
        type,
        mname: "",
        rname: "",
        serial: 1,
        refresh: 3600,
        retry: 900,
        expire: 1_209_600,
        minimum: 300,
      };
  }
}

/* ---------- tokenising ---------- */

/** Strips an unquoted `;` comment and pulls the paren characters out, reporting how much they nested this line. */
function processLine(rawLine: string): { content: string; parenDelta: number } {
  let content = "";
  let inQuotes = false;
  let parenDelta = 0;

  for (const ch of rawLine) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      content += ch;
      continue;
    }
    if (!inQuotes && ch === ";") break;
    if (!inQuotes && ch === "(") {
      parenDelta += 1;
      continue;
    }
    if (!inQuotes && ch === ")") {
      parenDelta -= 1;
      continue;
    }
    content += ch;
  }

  return { content, parenDelta };
}

export type LogicalLine = { raw: string; line: number };

/**
 * Joins the physical lines of a parenthesised record into one logical line,
 * comments and the parentheses themselves already removed.
 *
 * `unterminatedGroup` is true when the text ends with an open `(` that never
 * closed — the caller turns that into a warning rather than silently
 * dropping the trailing content.
 */
export function splitLogicalLines(text: string): { lines: LogicalLine[]; unterminatedGroup: boolean } {
  const rawLines = text.split(/\r?\n/);
  const lines: LogicalLine[] = [];
  let buffer = "";
  let bufferStart = 0;
  let depth = 0;

  rawLines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const { content, parenDelta } = processLine(rawLine);
    const trimmed = content.trim();

    if (buffer === "" && trimmed !== "") bufferStart = lineNumber;
    if (trimmed !== "") buffer += (buffer === "" ? "" : " ") + trimmed;

    depth += parenDelta;
    if (depth <= 0) {
      if (buffer.trim() !== "") lines.push({ raw: buffer.trim(), line: bufferStart });
      buffer = "";
      depth = 0;
    }
  });

  const unterminatedGroup = buffer.trim() !== "";
  if (unterminatedGroup) lines.push({ raw: buffer.trim(), line: bufferStart });

  return { lines, unterminatedGroup };
}

/** Splits one logical line into tokens, keeping a quoted span — spaces included — as a single token. */
export function tokenizeLogical(raw: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    if (i >= raw.length) break;

    if (raw[i] === '"') {
      let j = i + 1;
      let token = '"';
      while (j < raw.length && raw[j] !== '"') {
        token += raw[j];
        j += 1;
      }
      if (j < raw.length) {
        token += '"';
        j += 1;
      }
      tokens.push(token);
      i = j;
      continue;
    }

    let j = i;
    while (j < raw.length && !/\s/.test(raw[j])) j += 1;
    tokens.push(raw.slice(i, j));
    i = j;
  }

  return tokens;
}

function unquote(token: string): string {
  if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) return token.slice(1, -1);
  return token;
}

const isNumericToken = (token: string): boolean => /^\d+$/.test(token);
const isClassToken = (token: string): boolean => /^(IN|CH|HS)$/i.test(token);
const isTypeToken = (token: string): boolean => RECORD_TYPE_SET.has(token.toUpperCase());

const MAX_U32 = 4_294_967_295;

/** True for the RFC-1912 convention (`YYYYMMDDnn`) most zone editors use — informational only, never required. */
function looksLikeConventionalSerial(serial: number): boolean {
  const text = String(serial);
  if (text.length !== 10) return false;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  return year >= 1970 && year <= 2199 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/* ---------- parsing one record ---------- */

function parseRecordLine(
  tokens: string[],
  line: number,
  currentName: { value: string | null },
  issues: ZoneIssue[],
): ZoneRecord | null {
  let idx = 0;
  const head = tokens[0];

  let name: string;
  if (head !== undefined && !isTypeToken(head) && !isClassToken(head) && !isNumericToken(head)) {
    name = head;
    idx = 1;
  } else if (currentName.value !== null) {
    name = currentName.value;
  } else {
    issues.push({ severity: "xeta", line, message: "Qeydin adı yoxdur və əvvəlki sətirdən miras alınacaq ad da yoxdur." });
    return null;
  }
  currentName.value = name;

  let ttl: number | null = null;
  for (let step = 0; step < 2; step += 1) {
    const token = tokens[idx];
    if (token === undefined) break;
    if (isNumericToken(token)) {
      ttl = Number(token);
      idx += 1;
      continue;
    }
    if (isClassToken(token)) {
      idx += 1;
      continue;
    }
    break;
  }

  const typeToken = tokens[idx];
  idx += 1;
  if (typeToken === undefined || !isTypeToken(typeToken)) {
    issues.push({ severity: "xeta", line, message: `Naməlum qeyd tipi: "${typeToken ?? "(boş)"}".` });
    return null;
  }
  const type = typeToken.toUpperCase() as ZoneRecordType;
  const rest = tokens.slice(idx);
  const common = { name, ttl };

  switch (type) {
    case "A":
    case "AAAA": {
      if (rest[0] === undefined) {
        issues.push({ severity: "xeta", line, message: `${type} qeydinin ünvanı yoxdur.` });
        return null;
      }
      return { ...common, type, address: rest[0] };
    }
    case "CNAME":
    case "NS": {
      if (rest[0] === undefined) {
        issues.push({ severity: "xeta", line, message: `${type} qeydinin hədəfi yoxdur.` });
        return null;
      }
      return { ...common, type, target: rest[0] };
    }
    case "MX": {
      const priority = Number(rest[0]);
      if (!Number.isInteger(priority) || rest[1] === undefined) {
        issues.push({ severity: "xeta", line, message: `MX prioriteti tam ədəd olmalıdır: "${rest[0] ?? ""}" belə deyil.` });
        return null;
      }
      return { ...common, type, priority, target: rest[1] };
    }
    case "TXT": {
      if (rest.length === 0) {
        issues.push({ severity: "xeta", line, message: "TXT qeydinin mətni yoxdur." });
        return null;
      }
      for (const chunk of rest) {
        const bytes = new TextEncoder().encode(unquote(chunk)).length;
        if (bytes > 255) {
          issues.push({
            severity: "xeberdarliq",
            line,
            message: `TXT sətri ${bytes} bayt: tək simvol-sətri 255 baytdan uzun ola bilməz, bölünməlidir.`,
          });
        }
      }
      return { ...common, type, value: rest.map(unquote).join("") };
    }
    case "SRV": {
      const priority = Number(rest[0]);
      const weight = Number(rest[1]);
      const port = Number(rest[2]);
      if (![priority, weight, port].every(Number.isInteger) || rest[3] === undefined) {
        issues.push({ severity: "xeta", line, message: "SRV qeydinin prioritet/çəki/port sahələrindən biri tam ədəd deyil." });
        return null;
      }
      return { ...common, type, priority, weight, port, target: rest[3] };
    }
    case "CAA": {
      const flag = Number(rest[0]);
      const tag = rest[1];
      if (!Number.isInteger(flag) || tag === undefined || rest[2] === undefined) {
        issues.push({ severity: "xeta", line, message: "CAA qeydinin bayraq/tağ/dəyər sahələrindən biri yoxdur." });
        return null;
      }
      return { ...common, type, flag, tag, value: unquote(rest[2]) };
    }
    case "SOA": {
      const [mname, rname, serialRaw, refreshRaw, retryRaw, expireRaw, minimumRaw] = rest;
      const serial = Number(serialRaw);
      const refresh = Number(refreshRaw);
      const retry = Number(retryRaw);
      const expire = Number(expireRaw);
      const minimum = Number(minimumRaw);
      if (
        mname === undefined ||
        rname === undefined ||
        ![serial, refresh, retry, expire, minimum].every(Number.isInteger)
      ) {
        issues.push({ severity: "xeta", line, message: "SOA qeydinin yeddi sahəsindən biri yoxdur və ya ədəd deyil." });
        return null;
      }
      if (serial < 0 || serial > MAX_U32) {
        issues.push({ severity: "xeta", line, message: `SOA seriyası 0-${MAX_U32} aralığından kənardır (${serial}).` });
        return null;
      }
      if (!looksLikeConventionalSerial(serial)) {
        issues.push({
          severity: "melumat",
          line,
          message: `SOA seriyası (${serial}) YYYYMMDDnn konvensiyasına uymur: bu, xəta deyil, sadəcə adət fərqlidir.`,
        });
      }
      return { ...common, type, mname, rname, serial, refresh, retry, expire, minimum };
    }
  }
}

/** CNAME may never share a name with any other record — RFC 1034 §3.6.2. */
function checkCnameCoexistence(records: readonly ZoneRecord[], issues: ZoneIssue[]) {
  const byName = new Map<string, ZoneRecord[]>();
  for (const record of records) {
    const key = record.name.toLowerCase();
    const list = byName.get(key) ?? [];
    list.push(record);
    byName.set(key, list);
  }
  for (const [name, list] of byName) {
    if (list.length > 1 && list.some((record) => record.type === "CNAME")) {
      issues.push({
        severity: "xeta",
        line: null,
        message: `"${name}" adında CNAME başqa qeydlə yanaşı var: CNAME olan ad başqa heç bir qeyd daşıya bilməz.`,
      });
    }
  }
}

export type ZoneParseResult = {
  origin: string | null;
  ttl: number | null;
  records: ZoneRecord[];
  issues: ZoneIssue[];
};

export function parseZoneFile(text: string): ZoneParseResult {
  const { lines, unterminatedGroup } = splitLogicalLines(text);
  const issues: ZoneIssue[] = [];
  const records: ZoneRecord[] = [];
  const currentName: { value: string | null } = { value: null };
  let origin: string | null = null;
  let ttl: number | null = null;

  for (const { raw, line } of lines) {
    const tokens = tokenizeLogical(raw);
    if (tokens.length === 0) continue;

    const head = tokens[0].toUpperCase();
    if (head === "$ORIGIN") {
      origin = tokens[1] ?? null;
      continue;
    }
    if (head === "$TTL") {
      const value = Number(tokens[1]);
      if (tokens[1] === undefined || !Number.isInteger(value) || value < 0) {
        issues.push({ severity: "xeta", line, message: "$TTL üçün düzgün, mənfi olmayan ədəd yoxdur." });
      } else {
        ttl = value;
      }
      continue;
    }
    if (head.startsWith("$")) {
      issues.push({ severity: "melumat", line, message: `Tanınmayan direktiv "${tokens[0]}" nəzərə alınmadı.` });
      continue;
    }

    const record = parseRecordLine(tokens, line, currentName, issues);
    if (record) records.push(record);
  }

  if (unterminatedGroup) {
    issues.push({ severity: "xeberdarliq", line: null, message: "Fayl açıq «(» ilə bitir: mötərizə bağlanmayıb." });
  }

  checkCnameCoexistence(records, issues);

  return { origin, ttl, records, issues };
}

/* ---------- building ---------- */

const MAX_TXT_CHUNK_BYTES = 255;

/** Splits text into character-string chunks no DNS message could reject for length — never breaking a multi-byte character. */
export function splitTxtChunks(value: string): string[] {
  if (value === "") return [""];

  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const char of value) {
    const charBytes = new TextEncoder().encode(char).length;
    if (currentBytes + charBytes > MAX_TXT_CHUNK_BYTES) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current !== "" || chunks.length === 0) chunks.push(current);

  return chunks;
}

function quote(value: string): string {
  return `"${value}"`;
}

/** The rdata portion of one record's line — shared by `buildZoneFile` and the table's value column. */
export function formatRdata(record: ZoneRecord): string {
  switch (record.type) {
    case "A":
    case "AAAA":
      return record.address;
    case "CNAME":
    case "NS":
      return record.target;
    case "MX":
      return `${record.priority} ${record.target}`;
    case "TXT":
      return splitTxtChunks(record.value).map(quote).join(" ");
    case "SRV":
      return `${record.priority} ${record.weight} ${record.port} ${record.target}`;
    case "CAA":
      return `${record.flag} ${record.tag} ${quote(record.value)}`;
    case "SOA":
      return `${record.mname} ${record.rname} ${record.serial} ${record.refresh} ${record.retry} ${record.expire} ${record.minimum}`;
  }
}

function formatRecordLine(record: ZoneRecord): string {
  const ttlPart = record.ttl !== null ? String(record.ttl) : "";
  const head = [record.name, ttlPart, "IN", record.type].filter((part) => part !== "").join(" ");
  return `${head} ${formatRdata(record)}`;
}

/** The exact inverse of `parseZoneFile` for the fields it keeps — see the file header for what "exact" means here. */
export function buildZoneFile(records: readonly ZoneRecord[], options?: { origin?: string | null; ttl?: number | null }): string {
  const lines: string[] = [];
  if (options?.origin) lines.push(`$ORIGIN ${options.origin}`);
  if (options?.ttl !== undefined && options.ttl !== null) lines.push(`$TTL ${options.ttl}`);
  for (const record of records) lines.push(formatRecordLine(record));
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/** How many records of each type — a quick summary row for the table header. */
export function countByType(records: readonly ZoneRecord[]): Partial<Record<ZoneRecordType, number>> {
  const counts: Partial<Record<ZoneRecordType, number>> = {};
  for (const record of records) counts[record.type] = (counts[record.type] ?? 0) + 1;
  return counts;
}
