/**
 * Reading a `security.txt` file the way RFC 9116 defines it: a short list of
 * `Field: value` lines, two of them mandatory, that tells a security
 * researcher who to contact before they post a vulnerability to Twitter
 * instead — the entire reason the RFC exists is that "who do I email about
 * this bug" used to have no standard answer anywhere on a site.
 *
 * Parsing and evaluation are kept apart on purpose. `parseSecurityTxt` only
 * knows the line syntax and never sees the network; `evaluateSecurityTxt`
 * judges an already-parsed document against the RFC's requirements, given
 * "now" as an explicit argument rather than reading the clock itself — the
 * expiry check is the one piece of this file that is otherwise untestable
 * without a fake clock.
 */

export type SecurityTxtField =
  | "Contact"
  | "Expires"
  | "Encryption"
  | "Acknowledgments"
  | "Policy"
  | "Preferred-Languages"
  | "Canonical";

export const SECURITY_TXT_FIELDS: SecurityTxtField[] = [
  "Contact",
  "Expires",
  "Encryption",
  "Acknowledgments",
  "Policy",
  "Preferred-Languages",
  "Canonical",
];

const REQUIRED_FIELDS = new Set<SecurityTxtField>(["Contact", "Expires"]);

const FIELD_PURPOSE: Record<SecurityTxtField, string> = {
  Contact: "Zəiflik tapan kəsin necə əlaqə saxlayacağı: e-poçt, telefon və ya forma ünvanı. Bir neçə dəfə yazıla bilər, sıra ilə üstünlük göstərir.",
  Expires: "Faylın nə vaxta qədər etibarlı sayılacağı. Bu tarix keçəndə skanerlər faylı köhnəlmiş sayır və nəzərə almır.",
  Encryption: "Şifrələnmiş məlumat göndərmək üçün açıq açarın ünvanı (adətən bir OpenPGP açarı).",
  Acknowledgments: "Bildirilmiş zəiflikləri kimin aşkarladığını sadalayan səhifənin ünvanı.",
  Policy: "Məsuliyyətli açıqlama qaydalarının (hansı testlər icazəlidir, cavab müddəti) yazıldığı sənəd.",
  "Preferred-Languages": "Əlaqə üçün üstünlük verilən dillərin vergüllə ayrılmış siyahısı.",
  Canonical: "Bu faylın özünün rəsmi ünvanı: güzgülənmiş bir nüsxədə oxunanda əslinə yönləndirir.",
};

export type SecurityTxtDoc = {
  /** Every recognised field, values in file order. An absent field is an empty array, not a missing key. */
  fields: Record<SecurityTxtField, string[]>;
  /** True when a PGP cleartext-signature armour wraps the document. */
  signed: boolean;
  /** Lines that are neither blank, a comment, nor a recognised `Field: value` pair. */
  unknownLines: { line: number; text: string }[];
  lineCount: number;
};

const FIELD_LOOKUP = new Map<string, SecurityTxtField>(
  SECURITY_TXT_FIELDS.map((field) => [field.toLowerCase(), field]),
);

const FIELD_LINE = /^([A-Za-z-]+):\s*(.*)$/;

/**
 * Splits a security.txt body into its recognised fields, tolerant of the
 * things real files do: comments, blank lines, a PGP cleartext-signature
 * wrapper, and — inside that wrapper — a `Hash:` armour header that looks
 * exactly like a field line but is not one.
 */
export function parseSecurityTxt(text: string): SecurityTxtDoc {
  const fields = Object.fromEntries(SECURITY_TXT_FIELDS.map((field) => [field, [] as string[]])) as Record<
    SecurityTxtField,
    string[]
  >;
  const unknownLines: { line: number; text: string }[] = [];

  const signed = text.includes("-----BEGIN PGP SIGNED MESSAGE-----") && text.includes("-----BEGIN PGP SIGNATURE-----");

  const lines = text.split(/\r\n|\r|\n/);
  let insideArmourHeader = false;
  let insideSignatureBlock = false;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNumber = index + 1;

    if (line === "") {
      /* A blank line ends the PGP armour's own header block (the `Hash:` line
         that precedes the signed body), so what follows is ordinary content
         again. */
      insideArmourHeader = false;
      return;
    }
    if (line.startsWith("#")) return;

    if (line === "-----BEGIN PGP SIGNED MESSAGE-----") {
      insideArmourHeader = true;
      return;
    }
    if (insideArmourHeader) return; // e.g. "Hash: SHA256"
    if (line === "-----BEGIN PGP SIGNATURE-----") {
      insideSignatureBlock = true;
      return;
    }
    if (insideSignatureBlock) {
      if (line === "-----END PGP SIGNATURE-----") insideSignatureBlock = false;
      return;
    }

    const match = FIELD_LINE.exec(line);
    if (!match) {
      unknownLines.push({ line: lineNumber, text: line });
      return;
    }

    const field = FIELD_LOOKUP.get(match[1].toLowerCase());
    if (!field) {
      /* A syntactically valid line naming a field this table does not know —
         an extension field, or a typo. Either way it is not a parse failure,
         so it is not treated as an unknown line, just left uncounted. */
      return;
    }
    fields[field].push(match[2].trim());
  });

  return { fields, signed, unknownLines, lineCount: lines.length };
}

export type SecurityTxtFinding = {
  field: SecurityTxtField;
  required: boolean;
  present: boolean;
  values: string[];
  purpose: string;
};

export type SecurityTxtEvaluation = {
  findings: SecurityTxtFinding[];
  missingRequired: SecurityTxtField[];
  /** Null when Expires is absent or its value does not parse as a date. */
  expired: boolean | null;
  /** Whole days until expiry; negative once it has passed. Null alongside `expired`. */
  expiresInDays: number | null;
  signed: boolean;
  /** A coarse read for the summary line: every required field present and unexpired, some of it, or none. */
  completeness: "tam" | "yarimciq" | "boş";
};

/**
 * Judges an already-parsed document against the RFC's two requirements
 * (`Contact`, `Expires`) and the expiry date, given `now` explicitly so the
 * clock is a parameter and not a hidden dependency.
 */
export function evaluateSecurityTxt(doc: SecurityTxtDoc, now: Date): SecurityTxtEvaluation {
  const findings: SecurityTxtFinding[] = SECURITY_TXT_FIELDS.map((field) => ({
    field,
    required: REQUIRED_FIELDS.has(field),
    present: doc.fields[field].length > 0,
    values: doc.fields[field],
    purpose: FIELD_PURPOSE[field],
  }));

  const missingRequired = findings.filter((f) => f.required && !f.present).map((f) => f.field);

  const expiresValue = doc.fields.Expires[0];
  let expired: boolean | null = null;
  let expiresInDays: number | null = null;
  if (expiresValue) {
    const parsed = new Date(expiresValue);
    if (!Number.isNaN(parsed.getTime())) {
      const msLeft = parsed.getTime() - now.getTime();
      expiresInDays = Math.floor(msLeft / 86_400_000);
      expired = msLeft < 0;
    }
  }

  const anyPresent = findings.some((f) => f.present);
  const completeness: SecurityTxtEvaluation["completeness"] =
    missingRequired.length === 0 && expired !== true ? "tam" : anyPresent ? "yarimciq" : "boş";

  return { findings, missingRequired, expired, expiresInDays, signed: doc.signed, completeness };
}

export type SecurityTxtLiveReport = {
  /** Every location tried, well-known first, in the order RFC 9116 gives it priority. */
  tried: { url: string; status: number | null }[];
  foundAt: "well-known" | "root" | null;
  url: string | null;
  status: number | null;
  text: string;
  truncated: boolean;
  doc: SecurityTxtDoc | null;
  evaluation: SecurityTxtEvaluation | null;
  checkedAt: string;
};
