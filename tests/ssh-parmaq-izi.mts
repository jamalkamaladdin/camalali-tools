/*
 * What is worth checking here: the two fingerprint forms against real
 * `ssh-keygen` output (measured on this machine, not invented — see the
 * generation command in the comment beside each expected value), an RSA
 * key's bit length read from the modulus rather than guessed from the
 * Base64 string, the structural check that catches a hand-edited or
 * truncated key, a private key refused before any parsing happens, an
 * `authorized_keys` option correctly parsed and explained, multi-line input
 * producing one result per line with blanks and `#` comments skipped, and
 * the new byte-input hash functions agreeing with the existing string ones.
 */
import type { CheckSuite } from "./harness.mts";
import { md5, md5Bytes, sha256, sha256Bytes, utf8Bytes } from "../lib/hash";
import { inspectSshInput, parseSshKeyLine } from "../lib/ssh-parmaq-izi";

/*
 * Generated for this check file with:
 *   ssh-keygen -t ed25519 -f /tmp/alet-dalga/k -N '' -C 'demo@nomune'
 *   ssh-keygen -lf /tmp/alet-dalga/k.pub
 *   ssh-keygen -E md5 -lf /tmp/alet-dalga/k.pub
 * The key files were deleted immediately after; only the public line and the
 * fingerprints `ssh-keygen` itself printed for it are kept here.
 */
const ED25519_LINE =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJZqW9aRfNslhr387cPQ0LT6IBLGgSMOQ+kGO6uBV/wC demo@nomune";
const ED25519_SHA256 = "SHA256:b4pAoaFSHQox9fLd5VOuh/xVPf9xg5Hr7Y7uHmZ3M4M";
const ED25519_MD5 = "MD5:2a:7d:33:32:a8:b3:05:bc:7e:ee:a9:3f:c1:dd:50:35";

/*
 * Generated the same way with `ssh-keygen -t rsa -b 2048`. `ssh-keygen -lf`
 * reported "2048 SHA256:... (RSA)" for this key — both figures below come
 * from that output, not from counting the Base64 string.
 */
const RSA_LINE =
  "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCt0I9922cEjuKOXgQvGdJOyuSKygJV5QACYICtX7A4M1hnXbz1zw+3l6lu5c2D3aFhKt4b0HHDQjLNoDBDL3ZC9Bqc6/c/lM624YyCVdpl7z0Z3cp+Cp0Fo8dxkI4XMjaepBJfNGTJEMIL+u3HPZFsZBxI3vciUPim6TgTnrf3ZPSGbMNPYXCjROHgH1MtKNkRUrt64FDomrhaWg058Vlt97tKbGv/BbqKRJnw5A2I/M5/4uwjkkka8hKBAa1Ou4SP/iESzYaMscmTgneuMrRJxWEuBQh8Cj5ecEBP/nH8eGPZpJCTfB14w2b/D5JreeKappyeXcgm97jpYSZhHid9 demo-rsa@nomune";
const RSA_SHA256 = "SHA256:j+VEUeQ2Y3WlmNYA0FbbhoMju+aEOzYj5+VShnbTyTs";
const RSA_MD5 = "MD5:c5:ff:18:7b:90:e5:bd:df:82:11:52:6e:92:c5:06:0c";

const RESTRICTED_LINE = `command="/usr/bin/rsync --server -vlogDtprze.iLsfxC . /home/backup",no-pty,no-port-forwarding ${RSA_LINE}`;

export const checks: CheckSuite = (check) => {
  const ed25519 = parseSshKeyLine(ED25519_LINE);
  check(
    "ssh-parmaq-izi: Ed25519 SHA256 fingerprint matches ssh-keygen -lf exactly",
    ed25519.ok && ed25519.key.sha256Fingerprint === ED25519_SHA256,
    `got: ${JSON.stringify(ed25519)}`,
  );

  check(
    "ssh-parmaq-izi: Ed25519 legacy MD5 colon fingerprint matches ssh-keygen -E md5 -lf exactly",
    ed25519.ok && ed25519.key.md5Fingerprint === ED25519_MD5,
    `got: ${JSON.stringify(ed25519)}`,
  );

  const rsa = parseSshKeyLine(RSA_LINE);
  check(
    "ssh-parmaq-izi: RSA modulus bit length is read from the blob, not guessed from Base64 length — matches ssh-keygen -lf's 2048",
    rsa.ok && rsa.key.bits === 2048 && rsa.key.adequate === true,
    `got: ${JSON.stringify(rsa)}`,
  );

  check(
    "ssh-parmaq-izi: RSA SHA256 fingerprint matches ssh-keygen -lf exactly",
    rsa.ok && rsa.key.sha256Fingerprint === RSA_SHA256,
    `got: ${JSON.stringify(rsa)}`,
  );

  check(
    "ssh-parmaq-izi: RSA legacy MD5 colon fingerprint matches ssh-keygen -E md5 -lf exactly",
    rsa.ok && rsa.key.md5Fingerprint === RSA_MD5,
    `got: ${JSON.stringify(rsa)}`,
  );

  check(
    "ssh-parmaq-izi: the SHA256 fingerprint carries no '=' padding — the detail everyone gets wrong",
    ed25519.ok && !ed25519.key.sha256Fingerprint.includes("="),
    `got: ${ed25519.ok ? ed25519.key.sha256Fingerprint : JSON.stringify(ed25519)}`,
  );

  const mismatched = parseSshKeyLine(`ssh-ed25519 ${RSA_LINE.split(" ")[1]} mismatch@nomune`);
  check(
    "ssh-parmaq-izi: declaring ssh-ed25519 over an ssh-rsa blob is caught as a type/blob mismatch",
    mismatched.ok === false && /uyğunsuzl/.test(mismatched.error),
    `got: ${JSON.stringify(mismatched)}`,
  );

  let truncatedThrew = false;
  let truncatedResult: ReturnType<typeof parseSshKeyLine> | null = null;
  try {
    const shortBlob = ED25519_LINE.split(" ")[1].slice(0, 12);
    truncatedResult = parseSshKeyLine(`ssh-ed25519 ${shortBlob} kesik@nomune`);
  } catch {
    truncatedThrew = true;
  }
  check(
    "ssh-parmaq-izi: a truncated Base64 blob comes back as an error, not a thrown exception",
    !truncatedThrew && truncatedResult !== null && truncatedResult.ok === false,
    `threw: ${truncatedThrew}, got: ${JSON.stringify(truncatedResult)}`,
  );

  const fakePrivateKey =
    "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAAB\n-----END OPENSSH PRIVATE KEY-----";
  const refused = inspectSshInput(fakePrivateKey);
  check(
    "ssh-parmaq-izi: a private key is refused outright — never reaches the parser",
    refused.refused === true && refused.reason.length > 0,
    `got: ${JSON.stringify(refused)}`,
  );

  const restricted = parseSshKeyLine(RESTRICTED_LINE);
  check(
    "ssh-parmaq-izi: an authorized_keys command= option is parsed with its value and flagged as a restriction",
    restricted.ok &&
      restricted.key.options.some(
        (option) => option.name === "command" && option.value === "/usr/bin/rsync --server -vlogDtprze.iLsfxC . /home/backup",
      ) &&
      restricted.key.restriction !== null,
    `got: ${JSON.stringify(restricted)}`,
  );

  const multiLine = inspectSshInput(`${ED25519_LINE}\n${RSA_LINE}`);
  check(
    "ssh-parmaq-izi: a multi-line authorized_keys input returns one result per line",
    multiLine.refused === false &&
      multiLine.results.length === 2 &&
      multiLine.results.every((result) => result.ok),
    `got: ${JSON.stringify(multiLine)}`,
  );

  const withNoise = inspectSshInput(`# a comment line\n\n${ED25519_LINE}\n\n`);
  check(
    "ssh-parmaq-izi: a blank line and a # comment line are skipped rather than producing errors",
    withNoise.refused === false && withNoise.results.length === 1 && withNoise.results[0].ok,
    `got: ${JSON.stringify(withNoise)}`,
  );

  const unknownType = parseSshKeyLine("ssh-foo AAAAC3NzaC1mb28= nomune@host");
  check(
    "ssh-parmaq-izi: an unrecognised key type returns an error naming the supported types",
    unknownType.ok === false && /dəstəklənən növlər/.test(unknownType.error),
    `got: ${JSON.stringify(unknownType)}`,
  );

  const sample = "kilogram və ədəd";
  check(
    "ssh-parmaq-izi: the new sha256Bytes agrees with the existing string sha256 on the same ASCII input",
    sha256Bytes(utf8Bytes(sample)) === sha256(sample),
    `bytes: ${sha256Bytes(utf8Bytes(sample))}, string: ${sha256(sample)}`,
  );

  check(
    "ssh-parmaq-izi: the new md5Bytes agrees with the existing string md5 on the same ASCII input",
    md5Bytes(utf8Bytes(sample)) === md5(sample),
    `bytes: ${md5Bytes(utf8Bytes(sample))}, string: ${md5(sample)}`,
  );
};
