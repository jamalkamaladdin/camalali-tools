/*
 * `rsa.ts` wraps `crypto.subtle`, so what needs proving is the wrapper, not
 * RSA's own arithmetic: the PEM envelope (hand-rolled, no WebCrypto
 * counterpart), the OAEP byte-budget calculation, and that export/import
 * round-trips actually reconnect to a working key rather than a
 * same-looking but unusable one.
 *
 * `CheckSuite` is synchronous, so every value needing `await` is resolved at
 * module load time via top-level await, same pattern `hmac.mts` documents.
 */
import type { CheckSuite } from "./harness.mts";
import {
  derToPem,
  pemToDer,
  maxOaepPlaintextBytes,
  generateRsaKeyPair,
  describeKey,
  exportPublicKeyPem,
  exportPrivateKeyPem,
  exportPrivateKeyJwk,
  importPublicKeyPem,
  importPrivateKeyJwk,
  encryptWithPublicKey,
  decryptWithPrivateKey,
  signWithPrivateKey,
  verifyWithPublicKey,
} from "../lib/rsa";

/* ---------- pure PEM round-trip (no crypto.subtle involved) ---------- */

const randomDer = Uint8Array.from({ length: 300 }, (_, i) => (i * 37 + 11) % 256);
const pem = derToPem(randomDer, "PUBLIC KEY");
const pemLines = pem.split("\n");
const bodyLines = pemLines.slice(1, -1);
const decoded = pemToDer(pem);

const malformedPem = pemToDer("this is not a PEM file at all");

/* ---------- OAEP byte budget ---------- */

const oaepLimit2048Sha256 = maxOaepPlaintextBytes(2048, "SHA-256");

/* ---------- key generation + description ---------- */

const encryptKeyPair = await generateRsaKeyPair(2048, "sifrele", "SHA-256");
const publicDescription = encryptKeyPair.ok ? describeKey(encryptKeyPair.publicKey) : null;
const privateDescription = encryptKeyPair.ok ? describeKey(encryptKeyPair.privateKey) : null;

/* ---------- encrypt / decrypt round trip, and the over-budget refusal ---------- */

const shortMessage = "salam, bu qisa metndir";
const encrypted = encryptKeyPair.ok ? await encryptWithPublicKey(encryptKeyPair.publicKey, shortMessage) : null;
const decrypted =
  encryptKeyPair.ok && encrypted?.ok
    ? await decryptWithPrivateKey(encryptKeyPair.privateKey, encrypted.ciphertextBase64)
    : null;

const tooLongMessage = "x".repeat(300);
const overBudget = encryptKeyPair.ok ? await encryptWithPublicKey(encryptKeyPair.publicKey, tooLongMessage) : null;

/* ---------- PEM export -> import -> real operation still works ---------- */

const exportedPublicPem = encryptKeyPair.ok ? await exportPublicKeyPem(encryptKeyPair.publicKey) : null;
const reimportedPublicKey =
  exportedPublicPem?.ok ? await importPublicKeyPem(exportedPublicPem.pem, "sifrele", "SHA-256") : null;
const encryptedWithReimported =
  reimportedPublicKey?.ok ? await encryptWithPublicKey(reimportedPublicKey.key, shortMessage) : null;
const decryptedFromReimported =
  encryptKeyPair.ok && encryptedWithReimported?.ok
    ? await decryptWithPrivateKey(encryptKeyPair.privateKey, encryptedWithReimported.ciphertextBase64)
    : null;

/* Feeding a private key's PEM to the public importer must fail cleanly. */
const exportedPrivatePem = encryptKeyPair.ok ? await exportPrivateKeyPem(encryptKeyPair.privateKey) : null;
const wrongLabelImport =
  exportedPrivatePem?.ok ? await importPublicKeyPem(exportedPrivatePem.pem, "sifrele", "SHA-256") : null;

/* ---------- sign / verify, JWK round trip, RSA-PSS, and a tampered message ---------- */

const signKeyPair = await generateRsaKeyPair(2048, "imzala", "SHA-256", "RSASSA-PKCS1-v1_5");
const exportedPrivateJwk = signKeyPair.ok ? await exportPrivateKeyJwk(signKeyPair.privateKey) : null;
const reimportedPrivateKey =
  exportedPrivateJwk?.ok
    ? await importPrivateKeyJwk(JSON.stringify(exportedPrivateJwk.jwk), "imzala", "SHA-256", "RSASSA-PKCS1-v1_5")
    : null;
const signature = reimportedPrivateKey?.ok ? await signWithPrivateKey(reimportedPrivateKey.key, shortMessage) : null;
const verified =
  signKeyPair.ok && signature?.ok
    ? await verifyWithPublicKey(signKeyPair.publicKey, shortMessage, signature.signatureBase64)
    : null;
const verifiedTamperedMessage =
  signKeyPair.ok && signature?.ok
    ? await verifyWithPublicKey(signKeyPair.publicKey, shortMessage + "!", signature.signatureBase64)
    : null;

const pssKeyPair = await generateRsaKeyPair(2048, "imzala", "SHA-256", "RSA-PSS");
const pssSignature = pssKeyPair.ok ? await signWithPrivateKey(pssKeyPair.privateKey, shortMessage) : null;
const pssVerified =
  pssKeyPair.ok && pssSignature?.ok
    ? await verifyWithPublicKey(pssKeyPair.publicKey, shortMessage, pssSignature.signatureBase64)
    : null;

const wrongKtyJwk = await importPrivateKeyJwk(JSON.stringify({ kty: "EC" }), "imzala", "SHA-256");

export const checks: CheckSuite = (check) => {
  check(
    "rsa: derToPem -> pemToDer recovers the exact original bytes",
    decoded.ok && decoded.der.length === randomDer.length && decoded.der.every((b, i) => b === randomDer[i]),
    decoded.ok ? `decoded ${decoded.der.length} bytes` : `refused: ${decoded.error}`,
  );

  check(
    "rsa: PEM body wraps at 64 columns per line (last line may be shorter)",
    bodyLines.slice(0, -1).every((line) => line.length === 64) && bodyLines.at(-1)!.length <= 64,
    `line lengths: ${bodyLines.map((l) => l.length).join(",")}`,
  );

  check(
    "rsa: a malformed PEM is refused with a message, not thrown",
    !malformedPem.ok && malformedPem.error.length > 0,
    malformedPem.ok ? "a malformed PEM was accepted" : "no message",
  );

  check(
    "rsa: RSA-OAEP byte budget for a 2048-bit key with SHA-256 is 190 bytes (RFC 8017 §7.1.1)",
    oaepLimit2048Sha256 === 190,
    `got: ${oaepLimit2048Sha256}`,
  );

  check(
    "rsa: a generated key pair reports its own modulus size and the standard public exponent 65537",
    publicDescription !== null &&
      publicDescription.modulusBits === 2048 &&
      publicDescription.publicExponentDecimal === "65537" &&
      privateDescription !== null &&
      privateDescription.type === "private",
    encryptKeyPair.ok ? `public=${JSON.stringify(publicDescription)}` : `refused: ${encryptKeyPair.error}`,
  );

  check(
    "rsa: encrypting then decrypting with the matching private key recovers the original text",
    decrypted !== null && decrypted.ok && decrypted.plaintext === shortMessage,
    encrypted?.ok ? `decrypted: ${JSON.stringify(decrypted)}` : `encrypt refused: ${encrypted?.ok === false ? encrypted.error : "no key"}`,
  );

  check(
    "rsa: a plaintext past the OAEP budget is refused with a message naming the limit, not thrown",
    overBudget !== null && !overBudget.ok && overBudget.error.includes("190"),
    overBudget?.ok ? "an over-budget plaintext was accepted" : `error: ${overBudget?.ok === false ? overBudget.error : "no key"}`,
  );

  check(
    "rsa: a public key exported to PEM and re-imported still encrypts something the original private key can decrypt",
    decryptedFromReimported !== null && decryptedFromReimported.ok && decryptedFromReimported.plaintext === shortMessage,
    reimportedPublicKey?.ok
      ? `decrypted: ${JSON.stringify(decryptedFromReimported)}`
      : `import refused: ${reimportedPublicKey?.ok === false ? reimportedPublicKey.error : "no export"}`,
  );

  check(
    "rsa: feeding a private key's PEM to the public-key importer is refused with a message, not thrown",
    wrongLabelImport !== null && !wrongLabelImport.ok && wrongLabelImport.error.length > 0,
    wrongLabelImport?.ok ? "a private-key PEM was accepted as a public key" : "no message",
  );

  check(
    "rsa: a private key exported to JWK and re-imported still produces a signature the original public key accepts",
    verified !== null && verified.ok && verified.valid,
    signature?.ok ? `verified: ${JSON.stringify(verified)}` : `sign refused: ${signature?.ok === false ? signature.error : "no key"}`,
  );

  check(
    "rsa: verifying a signature against a tampered message is rejected, not thrown",
    verifiedTamperedMessage !== null && verifiedTamperedMessage.ok && !verifiedTamperedMessage.valid,
    verifiedTamperedMessage?.ok ? `valid=${verifiedTamperedMessage.valid}` : `refused: ${verifiedTamperedMessage?.ok === false ? verifiedTamperedMessage.error : "n/a"}`,
  );

  check(
    "rsa: RSA-PSS sign/verify round-trips to valid, independently of the RSASSA-PKCS1-v1_5 path above",
    pssVerified !== null && pssVerified.ok && pssVerified.valid,
    pssSignature?.ok ? `verified: ${JSON.stringify(pssVerified)}` : `refused: ${pssKeyPair.ok ? "n/a" : pssKeyPair.error}`,
  );

  check(
    "rsa: importing a JWK whose kty is not RSA is refused with a message, not thrown",
    !wrongKtyJwk.ok && wrongKtyJwk.error.length > 0,
    wrongKtyJwk.ok ? "a non-RSA JWK was accepted" : "no message",
  );
};
