/*
 * AES-GCM with a PBKDF2-derived key has no fixed known-answer vector here,
 * because both the salt and the IV are drawn fresh from
 * `crypto.getRandomValues` on every call by design — the whole point of a
 * random salt is that the same password never derives the same key twice.
 * So what is checked is what a random-by-design function can still prove:
 * round-trip (encrypt, then decrypt, recovers the original text), tamper
 * detection (GCM's authentication tag catches a single changed byte), every
 * malformed-input path returning a message instead of throwing, and the
 * package's own shape (three Base64 fields, salt and IV at their fixed
 * lengths).
 *
 * Top-level await resolves every async fixture before `checks` runs — see
 * `spf-yoxlayici.mts` for why that is safe under a synchronous `CheckSuite`.
 */
import type { CheckSuite } from "./harness.mts";
import { decryptText, encryptText } from "../lib/sifreleme";

const PLAINTEXT = "Bu mətn şifrələnir — əşya, ğərib, İşıq.";
const PASSWORD = "at-kopru-2026";

const encrypted = await encryptText(PLAINTEXT, PASSWORD);
const roundTripped = encrypted.ok && (await decryptText(encrypted.package, PASSWORD));

const emptyEncrypted = await encryptText("", PASSWORD);
const emptyRoundTripped = emptyEncrypted.ok && (await decryptText(emptyEncrypted.package, PASSWORD));

const wrongPassword = encrypted.ok && (await decryptText(encrypted.package, "yanlis-parol"));

const tamperedPackage = encrypted.ok
  ? encrypted.package.slice(0, -1) + (encrypted.package.slice(-1) === "A" ? "B" : "A")
  : "";
const tamperedResult = tamperedPackage !== "" && (await decryptText(tamperedPackage, PASSWORD));

const malformedParts = await decryptText("onlyonepart", PASSWORD);
const malformedBase64 = await decryptText("not-base64!.also-not.still-not!", PASSWORD);

const shortIvPackage = "AAAA.AAAA.AAAA"; // three valid but wrong-length Base64 fields
const shortIv = await decryptText(shortIvPackage, PASSWORD);

const emptyPasswordEncrypt = await encryptText(PLAINTEXT, "");
const emptyPasswordDecrypt = encrypted.ok && (await decryptText(encrypted.package, ""));

const secondEncryption = await encryptText(PLAINTEXT, PASSWORD);

export const checks: CheckSuite = (check) => {
  check(
    "sifreleme: encrypting then decrypting with the same password recovers the original text",
    roundTripped !== false && roundTripped.ok && roundTripped.plaintext === PLAINTEXT,
    encrypted.ok ? `round-trip result: ${JSON.stringify(roundTripped)}` : `encrypt refused: ${encrypted.error}`,
  );

  check(
    "sifreleme: an empty plaintext round-trips to an empty string",
    emptyRoundTripped !== false && emptyRoundTripped.ok && emptyRoundTripped.plaintext === "",
    emptyEncrypted.ok ? `round-trip result: ${JSON.stringify(emptyRoundTripped)}` : `encrypt refused: ${emptyEncrypted.error}`,
  );

  check(
    "sifreleme: decrypting with the wrong password fails with a message, not an exception",
    wrongPassword !== false && !wrongPassword.ok && wrongPassword.error.length > 0,
    encrypted.ok ? `result: ${JSON.stringify(wrongPassword)}` : `encrypt refused: ${encrypted.error}`,
  );

  check(
    "sifreleme: a package with one changed character fails the GCM authentication tag, not an exception",
    tamperedResult !== false && !tamperedResult.ok && tamperedResult.error.length > 0,
    tamperedPackageNote(tamperedResult),
  );

  check(
    "sifreleme: a package without exactly three parts is refused with a message",
    !malformedParts.ok && malformedParts.error.length > 0,
    malformedParts.ok ? "a one-part package was accepted" : "no message",
  );

  check(
    "sifreleme: a package with non-Base64 fields is refused with a message",
    !malformedBase64.ok && malformedBase64.error.length > 0,
    malformedBase64.ok ? "a non-Base64 package was accepted" : "no message",
  );

  check(
    "sifreleme: an IV of the wrong length is refused, naming the expected length",
    !shortIv.ok && shortIv.error.includes("12"),
    shortIv.ok ? "a short IV was accepted" : `error: ${shortIv.error}`,
  );

  check(
    "sifreleme: an empty password is refused on encryption",
    !emptyPasswordEncrypt.ok && emptyPasswordEncrypt.error.length > 0,
    emptyPasswordEncrypt.ok ? "an empty password was accepted" : "no message",
  );

  check(
    "sifreleme: an empty password is refused on decryption",
    emptyPasswordDecrypt !== false && !emptyPasswordDecrypt.ok && emptyPasswordDecrypt.error.length > 0,
    encrypted.ok ? `result: ${JSON.stringify(emptyPasswordDecrypt)}` : `encrypt refused: ${encrypted.error}`,
  );

  check(
    "sifreleme: two encryptions of the same text and password produce different packages",
    encrypted.ok && secondEncryption.ok && encrypted.package !== secondEncryption.package,
    encrypted.ok && secondEncryption.ok
      ? "two packages were identical — salt or IV is not actually random"
      : `refused: ${encrypted.ok ? secondEncryption.ok ? "" : secondEncryption.error : encrypted.error}`,
  );

  check(
    "sifreleme: the package is three Base64 fields with salt and IV at their fixed byte lengths",
    encrypted.ok && packageFieldLengths(encrypted.package) !== null,
    encrypted.ok ? `field lengths: ${JSON.stringify(packageFieldLengths(encrypted.package))}` : `refused: ${encrypted.error}`,
  );
};

function tamperedPackageNote(result: { ok: true; plaintext: string } | { ok: false; error: string } | false): string {
  if (result === false) return "no encrypted package to tamper with";
  return `result: ${JSON.stringify(result)}`;
}

/** `null` unless the package is exactly three Base64 fields with a 16-byte salt and a 12-byte IV. */
function packageFieldLengths(pkg: string): { salt: number; iv: number } | null {
  const parts = pkg.split(".");
  if (parts.length !== 3) return null;
  const [saltPart, ivPart] = parts;
  try {
    const salt = atob(saltPart).length;
    const iv = atob(ivPart).length;
    return salt === 16 && iv === 12 ? { salt, iv } : null;
  } catch {
    return null;
  }
}
