/**
 * Reading a pasted email's raw headers the way a mail administrator does —
 * everything runs in the visitor's own browser, so this file has no network
 * import and none of the SSRF fencing the routed tools need.
 *
 * Three things about the wire format are easy to get quietly wrong, and each
 * has its own function so a wrong edit breaks a named test instead of an
 * unnoticed one:
 *
 *   - RFC 5322 §2.2.3 lets a header value continue onto the next line if that
 *     line starts with whitespace — "folding". A parser that splits on `\n`
 *     alone reads the continuation as a header of its own, with no colon and
 *     no name, and either drops it or crashes. `unfoldHeaders` joins those
 *     lines back before anything else runs.
 *   - `Received` headers are written newest-first — the header closest to the
 *     top of the file is the *last* hop, added by the server that most
 *     recently accepted the message. A visitor reading top-to-bottom sees the
 *     chain backwards; `extractReceivedChain` reverses it so index 0 is the
 *     first server the message actually touched.
 *   - `Authentication-Results` (RFC 8601) packs three independent verdicts —
 *     SPF, DKIM, DMARC — into one semicolon-separated line, each with its own
 *     optional comment in parentheses. `parseAuthenticationResults` reads
 *     each `method=result` pair on its own regex pass rather than splitting
 *     naively on `;`, because a comment can itself contain a semicolon.
 */

export type ParsedHeader = { name: string; value: string };

/**
 * Joins a folded header value back onto one line. RFC 5322's rule: any line
 * beginning with a space or a tab is a continuation of the previous header,
 * not a header of its own. The fold is replaced with a single space rather
 * than deleted outright, so two words that were split across the fold do not
 * run together.
 */
export function unfoldHeaders(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ");
}

/**
 * Splits unfolded header text into ordered `name: value` pairs. Duplicate
 * names (every real message has more than one `Received`) are kept as
 * separate entries in the order they appeared — a map would silently keep
 * only the last one.
 */
export function parseHeaders(raw: string): ParsedHeader[] {
  const unfolded = unfoldHeaders(raw);
  const headers: ParsedHeader[] = [];

  for (const line of unfolded.split("\n")) {
    if (line.trim() === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue; // Not a header line — a stray line the visitor pasted along with the headers.
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (name === "") continue;
    headers.push({ name, value });
  }

  return headers;
}

/** Every header whose name matches `name`, case-insensitively, in the order it appeared. */
export function headersNamed(headers: readonly ParsedHeader[], name: string): string[] {
  const lower = name.toLowerCase();
  return headers.filter((header) => header.name.toLowerCase() === lower).map((header) => header.value);
}

/** The first header whose name matches `name`, case-insensitively, or `null`. */
export function headerValue(headers: readonly ParsedHeader[], name: string): string | null {
  const found = headersNamed(headers, name);
  return found.length > 0 ? found[0] : null;
}

/* ---------- Received chain ---------- */

export type ReceivedHop = {
  raw: string;
  from: string | null;
  by: string | null;
  withProtocol: string | null;
  id: string | null;
  /** Milliseconds since epoch, or `null` when the trailing date could not be read — never a guessed number. */
  timestamp: number | null;
  /** How long this hop took to reach the next one, in milliseconds — `null` when either hop's date is unreadable. Set by `extractReceivedChain`, which is the only place that sees both neighbours. */
  delayMs: number | null;
};

/**
 * Strips a trailing `(comment)` — most `Received` dates end with a time zone
 * name in parentheses that `Date.parse` does not expect — and reads what is
 * left as an RFC 5322 date. Returns `null` rather than a wrong number when
 * the text does not parse; a guessed timestamp would be worse than an honest
 * gap in a chain the visitor is trying to time.
 */
function parseReceivedDate(dateText: string): number | null {
  const withoutComment = dateText.replace(/\([^)]*\)/g, "").trim();
  if (withoutComment === "") return null;
  const parsed = Date.parse(withoutComment);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Reads one `Received` header's value into its named clauses. The grammar
 * (RFC 5321 §4.4) is a loose sequence of `from`/`by`/`via`/`with`/`id`/`for`
 * clauses followed by `; <date>` — loose enough in practice that this reads
 * each clause up to the next known keyword rather than a strict grammar,
 * which is what lets it survive the small variations real mail servers write.
 */
function parseReceivedClauses(value: string): {
  from: string | null;
  by: string | null;
  withProtocol: string | null;
  id: string | null;
  dateText: string | null;
} {
  const semicolon = value.lastIndexOf(";");
  const clauseText = semicolon === -1 ? value : value.slice(0, semicolon);
  const dateText = semicolon === -1 ? null : value.slice(semicolon + 1).trim();

  const KEYWORDS = ["from", "by", "via", "with", "id", "for"];
  const pattern = new RegExp(`\\b(${KEYWORDS.join("|")})\\s+`, "g");

  /* `matchIndex` (where the keyword itself starts) and `contentStart` (where
     its clause's text starts) are kept apart on purpose: using `contentStart`
     plus an assumed one-space gap to find the *next* clause's boundary breaks
     the moment two keywords are separated by more than one space — which a
     folded header, unfolded to a single space, can still produce next to an
     already-present trailing space. Slicing up to the next keyword's own
     `matchIndex` needs no such assumption. */
  const positions: { keyword: string; matchIndex: number; contentStart: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(clauseText)) !== null) {
    positions.push({ keyword: match[1], matchIndex: match.index, contentStart: match.index + match[0].length });
  }

  const clauses: Record<string, string> = {};
  positions.forEach((position, index) => {
    const end = index + 1 < positions.length ? positions[index + 1].matchIndex : clauseText.length;
    const text = clauseText.slice(position.contentStart, end).trim();
    if (!(position.keyword in clauses)) clauses[position.keyword] = text;
  });

  return {
    from: clauses.from ?? null,
    by: clauses.by ?? null,
    withProtocol: clauses.with ?? null,
    id: clauses.id ?? null,
    dateText: dateText && dateText !== "" ? dateText : null,
  };
}

/**
 * The `Received` chain in the order the message actually travelled —
 * sender's outgoing server first, recipient's own server last — with the
 * time each hop took to reach the next one. Headers arrive newest-first, so
 * this reverses them before anything else is computed.
 */
export function extractReceivedChain(headers: readonly ParsedHeader[]): ReceivedHop[] {
  const raw = headersNamed(headers, "received");
  const oldestFirst = [...raw].reverse();

  const hops: Omit<ReceivedHop, "delayMs">[] = oldestFirst.map((value) => {
    const clauses = parseReceivedClauses(value);
    return {
      raw: value,
      from: clauses.from,
      by: clauses.by,
      withProtocol: clauses.withProtocol,
      id: clauses.id,
      timestamp: clauses.dateText ? parseReceivedDate(clauses.dateText) : null,
    };
  });

  return hops.map((hop, index) => {
    const next = hops[index + 1];
    const delayMs =
      next && hop.timestamp !== null && next.timestamp !== null ? next.timestamp - hop.timestamp : null;
    return { ...hop, delayMs };
  });
}

/* ---------- From / Return-Path / Reply-To ---------- */

export type MailAddress = { name: string | null; address: string | null };

/** Reads `"Display Name" <user@domain>` or a bare `user@domain`. Neither half is invented when absent. */
export function parseAddressField(raw: string): MailAddress {
  const trimmed = raw.trim();
  if (trimmed === "") return { name: null, address: null };

  const angled = /^(.*?)<([^<>]+)>\s*$/.exec(trimmed);
  if (angled) {
    const name = angled[1].trim().replace(/^"(.*)"$/, "$1");
    return { name: name === "" ? null : name, address: angled[2].trim() || null };
  }

  return { name: null, address: trimmed };
}

/** The domain half of an address, lower-cased — `null` when there is no `@`. */
export function addressDomain(address: string | null): string | null {
  if (address === null) return null;
  const at = address.lastIndexOf("@");
  return at === -1 ? null : address.slice(at + 1).toLowerCase().replace(/\.$/, "");
}

export type SenderComparison = {
  from: MailAddress | null;
  returnPath: MailAddress | null;
  replyTo: MailAddress | null;
  /** True when `From` and `Return-Path` name different domains — the classic spoofing signal. */
  fromReturnPathMismatch: boolean;
  /** True when `Reply-To` names a domain neither `From` nor `Return-Path` uses. */
  replyToMismatch: boolean;
};

export function compareSenderFields(headers: readonly ParsedHeader[]): SenderComparison {
  const fromRaw = headerValue(headers, "from");
  const returnPathRaw = headerValue(headers, "return-path");
  const replyToRaw = headerValue(headers, "reply-to");

  const from = fromRaw !== null ? parseAddressField(fromRaw) : null;
  // Return-Path is conventionally written as a bare `<addr>`, which `parseAddressField` still reads correctly.
  const returnPath = returnPathRaw !== null ? parseAddressField(returnPathRaw) : null;
  const replyTo = replyToRaw !== null ? parseAddressField(replyToRaw) : null;

  const fromDomain = addressDomain(from?.address ?? null);
  const returnPathDomain = addressDomain(returnPath?.address ?? null);
  const replyToDomain = addressDomain(replyTo?.address ?? null);

  const fromReturnPathMismatch =
    fromDomain !== null && returnPathDomain !== null && fromDomain !== returnPathDomain;

  const replyToMismatch =
    replyToDomain !== null &&
    fromDomain !== null &&
    replyToDomain !== fromDomain &&
    (returnPathDomain === null || replyToDomain !== returnPathDomain);

  return { from, returnPath, replyTo, fromReturnPathMismatch, replyToMismatch };
}

/* ---------- Authentication-Results ---------- */

export type AuthMethod = "spf" | "dkim" | "dmarc";
export type AuthResult = { result: string; detail: string | null };

/**
 * Reads the `spf=`/`dkim=`/`dmarc=` tokens out of an `Authentication-Results`
 * value (RFC 8601). Matched with one pass per method rather than a full
 * grammar: the field allows free-form comments between tokens, and a strict
 * parser would need to understand every mail server's own comment style to
 * avoid tripping over one.
 */
export function parseAuthenticationResults(raw: string | null): Record<AuthMethod, AuthResult | null> {
  const out: Record<AuthMethod, AuthResult | null> = { spf: null, dkim: null, dmarc: null };
  if (raw === null || raw.trim() === "" || raw.trim().toLowerCase() === "none") return out;

  for (const method of ["spf", "dkim", "dmarc"] as AuthMethod[]) {
    const pattern = new RegExp(`\\b${method}=([a-zA-Z-]+)(\\s*\\(([^)]*)\\))?`, "i");
    const match = pattern.exec(raw);
    if (match) {
      out[method] = { result: match[1].toLowerCase(), detail: match[3] ?? null };
    }
  }

  return out;
}

/* ---------- the whole analysis ---------- */

export type MailAnalysis = {
  headerCount: number;
  receivedChain: ReceivedHop[];
  totalDelayMs: number | null;
  sender: SenderComparison;
  auth: Record<AuthMethod, AuthResult | null>;
  messageId: string | null;
  spamHeaders: ParsedHeader[];
};

export type MailAnalysisResult = { ok: true; analysis: MailAnalysis } | { ok: false; error: string };

/** Sums every hop's delay; `null` the moment one hop's delay is unknown rather than silently skipping it. */
function sumDelays(hops: readonly ReceivedHop[]): number | null {
  let total = 0;
  for (const hop of hops) {
    if (hop.delayMs === null) continue;
    total += hop.delayMs;
  }
  const known = hops.some((hop) => hop.delayMs !== null);
  return known ? total : null;
}

/**
 * The whole pipeline: unfold, split, and read every section this tool shows.
 * Never throws — an empty paste or text with no `name: value` lines comes
 * back as `{ ok: false }` with a sentence the widget shows as written.
 */
export function buildMailAnalysis(raw: string): MailAnalysisResult {
  if (raw.trim() === "") {
    return { ok: false, error: "Boş sahə — e-poçt başlıqlarını yapışdır." };
  }

  const headers = parseHeaders(raw);
  if (headers.length === 0) {
    return { ok: false, error: "Bu mətndə «ad: dəyər» formatında heç bir başlıq tapılmadı." };
  }

  const receivedChain = extractReceivedChain(headers);
  const authRaw = headerValue(headers, "authentication-results");
  const spamHeaders = headers.filter((header) => header.name.toLowerCase().startsWith("x-spam"));

  return {
    ok: true,
    analysis: {
      headerCount: headers.length,
      receivedChain,
      totalDelayMs: sumDelays(receivedChain),
      sender: compareSenderFields(headers),
      auth: parseAuthenticationResults(authRaw),
      messageId: headerValue(headers, "message-id"),
      spamHeaders,
    },
  };
}
