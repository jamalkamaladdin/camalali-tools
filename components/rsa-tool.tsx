"use client";

import { useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolSegmented } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import {
  generateRsaKeyPair,
  exportPublicKeyPem,
  exportPrivateKeyPem,
  exportPublicKeyJwk,
  exportPrivateKeyJwk,
  importPublicKeyPem,
  importPrivateKeyPem,
  importPublicKeyJwk,
  importPrivateKeyJwk,
  describeKey,
  maxOaepPlaintextBytes,
  encryptWithPublicKey,
  decryptWithPrivateKey,
  signWithPrivateKey,
  verifyWithPublicKey,
  RSA_KEY_SIZES,
  RSA_HASHES,
  RSA_SIGN_ALGORITHMS,
  type RsaKeySize,
  type RsaPurpose,
  type RsaHash,
  type RsaSignAlgorithm,
  type RsaKeyDescription,
} from "../lib/rsa";

const SIZE_OPTIONS = RSA_KEY_SIZES.map((size) => ({ value: size, label: `${size} bit` }));
const PURPOSE_OPTIONS: { value: RsaPurpose; label: string }[] = [
  { value: "sifrele", label: "Şifrələmə" },
  { value: "imzala", label: "İmza" },
];
const SIGN_ALGORITHM_OPTIONS = RSA_SIGN_ALGORITHMS.map((algorithm) => ({
  value: algorithm,
  label: algorithm === "RSASSA-PKCS1-v1_5" ? "PKCS1-v1_5" : "PSS",
}));
const HASH_OPTIONS = RSA_HASHES.map((hash) => ({ value: hash, label: hash }));
const FORMAT_OPTIONS: { value: "pem" | "jwk"; label: string }[] = [
  { value: "pem", label: "PEM" },
  { value: "jwk", label: "JWK" },
];
const KEY_KIND_OPTIONS: { value: "public" | "private"; label: string }[] = [
  { value: "public", label: "Açıq açar" },
  { value: "private", label: "Gizli açar" },
];

type GeneratedKeyPair = {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  purpose: RsaPurpose;
  hash: RsaHash;
  modulusBits: number;
  publicExponentDecimal: string;
  pemPublic: string;
  pemPrivate: string;
  jwkPublic: string;
  jwkPrivate: string;
};

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function RsaTool() {
  /* ---------- generation ---------- */
  const [genSize, setGenSize] = useState<RsaKeySize>(2048);
  const [genPurpose, setGenPurpose] = useState<RsaPurpose>("sifrele");
  const [genSignAlgorithm, setGenSignAlgorithm] = useState<RsaSignAlgorithm>("RSASSA-PKCS1-v1_5");
  const [genHash, setGenHash] = useState<RsaHash>("SHA-256");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [keyPair, setKeyPair] = useState<GeneratedKeyPair | null>(null);
  const [exportFormat, setExportFormat] = useState<"pem" | "jwk">("pem");

  /* ---------- encrypt / decrypt (only relevant when keyPair.purpose === "sifrele") ---------- */
  const [cryptMode, setCryptMode] = useState<"sifrele" | "desifrele">("sifrele");
  const [plaintext, setPlaintext] = useState("");
  const [ciphertext, setCiphertext] = useState("");
  const [cryptState, setCryptState] = useState<{ phase: "error"; message: string } | { phase: "done"; value: string } | null>(
    null,
  );
  const [cryptBusy, setCryptBusy] = useState(false);

  /* ---------- sign / verify (only relevant when keyPair.purpose === "imzala") ---------- */
  const [signOpMode, setSignOpMode] = useState<"imzala" | "yoxla">("imzala");
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [signState, setSignState] = useState<{ phase: "error"; message: string } | { phase: "done"; value: string } | null>(
    null,
  );
  const [verifyState, setVerifyState] = useState<{ phase: "error"; message: string } | { phase: "done"; valid: boolean } | null>(
    null,
  );
  const [signBusy, setSignBusy] = useState(false);

  /* ---------- import ---------- */
  const [importText, setImportText] = useState("");
  const [importKind, setImportKind] = useState<"public" | "private">("public");
  const [importPurpose, setImportPurpose] = useState<RsaPurpose>("sifrele");
  const [importSignAlgorithm, setImportSignAlgorithm] = useState<RsaSignAlgorithm>("RSASSA-PKCS1-v1_5");
  const [importHash, setImportHash] = useState<RsaHash>("SHA-256");
  const [importResult, setImportResult] = useState<
    { phase: "error"; message: string } | { phase: "done"; description: RsaKeyDescription } | null
  >(null);
  const [importBusy, setImportBusy] = useState(false);

  const runGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    const result = await generateRsaKeyPair(genSize, genPurpose, genHash, genSignAlgorithm);
    if (!result.ok) {
      setGenError(result.error);
      setKeyPair(null);
      setGenerating(false);
      return;
    }
    const [pemPub, pemPriv, jwkPub, jwkPriv] = await Promise.all([
      exportPublicKeyPem(result.publicKey),
      exportPrivateKeyPem(result.privateKey),
      exportPublicKeyJwk(result.publicKey),
      exportPrivateKeyJwk(result.privateKey),
    ]);
    const description = describeKey(result.publicKey);
    setKeyPair({
      publicKey: result.publicKey,
      privateKey: result.privateKey,
      purpose: genPurpose,
      hash: genHash,
      modulusBits: description.modulusBits,
      publicExponentDecimal: description.publicExponentDecimal,
      pemPublic: pemPub.ok ? pemPub.pem : "",
      pemPrivate: pemPriv.ok ? pemPriv.pem : "",
      jwkPublic: jwkPub.ok ? JSON.stringify(jwkPub.jwk, null, 2) : "",
      jwkPrivate: jwkPriv.ok ? JSON.stringify(jwkPriv.jwk, null, 2) : "",
    });
    setPlaintext("");
    setCiphertext("");
    setCryptState(null);
    setMessage("");
    setSignature("");
    setSignState(null);
    setVerifyState(null);
    setGenerating(false);
  };

  const oaepLimit = keyPair ? maxOaepPlaintextBytes(keyPair.modulusBits, keyPair.hash) : null;
  const plaintextBytes = utf8ByteLength(plaintext);

  const runCrypt = async () => {
    if (!keyPair) return;
    setCryptBusy(true);
    const result =
      cryptMode === "sifrele"
        ? await encryptWithPublicKey(keyPair.publicKey, plaintext)
        : await decryptWithPrivateKey(keyPair.privateKey, ciphertext);
    if (!result.ok) {
      setCryptState({ phase: "error", message: result.error });
    } else {
      const value = "ciphertextBase64" in result ? result.ciphertextBase64 : result.plaintext;
      setCryptState({ phase: "done", value });
      if (cryptMode === "sifrele") setCiphertext(value);
    }
    setCryptBusy(false);
  };

  const runSign = async () => {
    if (!keyPair) return;
    setSignBusy(true);
    if (signOpMode === "imzala") {
      const result = await signWithPrivateKey(keyPair.privateKey, message);
      if (!result.ok) {
        setSignState({ phase: "error", message: result.error });
      } else {
        setSignState({ phase: "done", value: result.signatureBase64 });
        setSignature(result.signatureBase64);
      }
    } else {
      const result = await verifyWithPublicKey(keyPair.publicKey, message, signature);
      setVerifyState(result.ok ? { phase: "done", valid: result.valid } : { phase: "error", message: result.error });
    }
    setSignBusy(false);
  };

  const runImport = async () => {
    setImportBusy(true);
    const isPem = importText.trim().startsWith("-----BEGIN");
    const result = isPem
      ? importKind === "public"
        ? await importPublicKeyPem(importText, importPurpose, importHash, importSignAlgorithm)
        : await importPrivateKeyPem(importText, importPurpose, importHash, importSignAlgorithm)
      : importKind === "public"
        ? await importPublicKeyJwk(importText, importPurpose, importHash, importSignAlgorithm)
        : await importPrivateKeyJwk(importText, importPurpose, importHash, importSignAlgorithm);
    setImportResult(
      result.ok ? { phase: "done", description: describeKey(result.key) } : { phase: "error", message: result.error },
    );
    setImportBusy(false);
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Açar cütü qurma" />
        <div className="space-y-4 p-4">
          <ToolField label="Ölçü" htmlFor="rsa-size">
            <ToolSegmented label="Ölçü" options={SIZE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))} value={String(genSize)} onChange={(v) => setGenSize(Number(v) as RsaKeySize)} />
          </ToolField>

          <ToolField label="Məqsəd" htmlFor="rsa-purpose">
            <ToolSegmented label="Məqsəd" options={PURPOSE_OPTIONS} value={genPurpose} onChange={setGenPurpose} />
          </ToolField>

          {genPurpose === "imzala" && (
            <ToolField label="İmza sxemi" htmlFor="rsa-sign-algorithm">
              <ToolSegmented
                label="İmza sxemi"
                options={SIGN_ALGORITHM_OPTIONS}
                value={genSignAlgorithm}
                onChange={setGenSignAlgorithm}
              />
            </ToolField>
          )}

          <ToolField label="Hash" htmlFor="rsa-hash">
            <ToolSegmented label="Hash" options={HASH_OPTIONS} value={genHash} onChange={setGenHash} />
          </ToolField>

          <ToolButton onClick={runGenerate} disabled={generating}>
            {generating ? "Qurulur…" : "Açar cütü qur"}
          </ToolButton>
        </div>
      </ToolPanel>

      {genError && (
        <ToolNote tone="accent" title="Alınmadı">
          {genError}
        </ToolNote>
      )}

      {keyPair && (
        <ToolResultPanel
          title="Açar cütü hazırdır"
          action={<ToolSegmented label="Format" options={FORMAT_OPTIONS} value={exportFormat} onChange={setExportFormat} />}
        >
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ToolStat label="Bit uzunluğu" value={keyPair.modulusBits} />
              <ToolStat label="Eksponent" value={keyPair.publicExponentDecimal} />
              <ToolStat label="Hash" value={keyPair.hash} />
              <ToolStat label="Məqsəd" value={keyPair.purpose === "sifrele" ? "Şifrələmə" : "İmza"} />
            </div>

            <ToolField
              label="Açıq açar"
              htmlFor="rsa-public-export"
              note="Paylaşıla bilər — başqası bununla sənə şifrələnmiş mətn göndərə və ya imzanı yoxlaya bilər."
              suffix={
                <CopyButton
                  value={exportFormat === "pem" ? keyPair.pemPublic : keyPair.jwkPublic}
                  label="Kopyala"
                />
              }
            >
              <ToolOutput className="max-h-56 overflow-y-auto">
                {exportFormat === "pem" ? keyPair.pemPublic : keyPair.jwkPublic}
              </ToolOutput>
            </ToolField>

            <ToolField
              label="Gizli açar"
              htmlFor="rsa-private-export"
              note="Paylaşma — bununla deşifrələ və ya imzala edilir."
              suffix={
                <CopyButton
                  value={exportFormat === "pem" ? keyPair.pemPrivate : keyPair.jwkPrivate}
                  label="Kopyala"
                />
              }
            >
              <ToolOutput className="max-h-56 overflow-y-auto">
                {exportFormat === "pem" ? keyPair.pemPrivate : keyPair.jwkPrivate}
              </ToolOutput>
            </ToolField>
          </div>
        </ToolResultPanel>
      )}

      {keyPair && keyPair.purpose === "sifrele" && (
        <ToolPanel>
          <ToolPanelHeader
            title={cryptMode === "sifrele" ? "Açıq mətn" : "Şifrmətn"}
            action={
              <ToolSegmented
                label="Əməliyyat"
                options={[
                  { value: "sifrele" as const, label: "Şifrələ" },
                  { value: "desifrele" as const, label: "Deşifrələ" },
                ]}
                value={cryptMode}
                onChange={setCryptMode}
              />
            }
          />
          <div className="space-y-4 p-4">
            {cryptMode === "sifrele" ? (
              <ToolField
                label="Şifrələnəcək mətn"
                htmlFor="rsa-plaintext"
                hint={oaepLimit !== null ? `${plaintextBytes} / ${oaepLimit} bayt` : undefined}
              >
                <ToolTextArea
                  id="rsa-plaintext"
                  value={plaintext}
                  onChange={(event) => setPlaintext(event.target.value)}
                  rows={4}
                  spellCheck={false}
                  placeholder="Mətni bura yaz…"
                />
              </ToolField>
            ) : (
              <ToolField label="Şifrmətn (Base64)" htmlFor="rsa-ciphertext">
                <ToolTextArea
                  id="rsa-ciphertext"
                  value={ciphertext}
                  onChange={(event) => setCiphertext(event.target.value)}
                  rows={4}
                  spellCheck={false}
                  placeholder="Base64 şifrmətni bura yapışdır…"
                />
              </ToolField>
            )}

            <ToolButton
              onClick={runCrypt}
              disabled={cryptBusy || (cryptMode === "sifrele" ? plaintext === "" : ciphertext === "")}
            >
              {cryptBusy ? "Hesablanır…" : cryptMode === "sifrele" ? "Şifrələ" : "Deşifrələ"}
            </ToolButton>
          </div>
        </ToolPanel>
      )}

      {keyPair && keyPair.purpose === "sifrele" && cryptState?.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {cryptState.message}
        </ToolNote>
      )}

      {keyPair && keyPair.purpose === "sifrele" && cryptState?.phase === "done" && (
        <ToolResultPanel
          title={cryptMode === "sifrele" ? "Şifrmətn" : "Açıq mətn"}
          action={<CopyButton value={cryptState.value} label="Kopyala" className="shrink-0" />}
        >
          <ToolOutput className="m-3 break-all">{cryptState.value}</ToolOutput>
        </ToolResultPanel>
      )}

      {keyPair && keyPair.purpose === "imzala" && (
        <ToolPanel>
          <ToolPanelHeader
            title="Mətn"
            action={
              <ToolSegmented
                label="Əməliyyat"
                options={[
                  { value: "imzala" as const, label: "İmzala" },
                  { value: "yoxla" as const, label: "Yoxla" },
                ]}
                value={signOpMode}
                onChange={setSignOpMode}
              />
            }
          />
          <div className="space-y-4 p-4">
            <ToolField label="İmzalanacaq mətn" htmlFor="rsa-message">
              <ToolTextArea
                id="rsa-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={4}
                spellCheck={false}
                placeholder="Mətni bura yaz…"
              />
            </ToolField>

            {signOpMode === "yoxla" && (
              <ToolField label="İmza (Base64)" htmlFor="rsa-signature">
                <ToolTextArea
                  id="rsa-signature"
                  value={signature}
                  onChange={(event) => setSignature(event.target.value)}
                  rows={3}
                  spellCheck={false}
                  placeholder="Base64 imzanı bura yapışdır…"
                />
              </ToolField>
            )}

            <ToolButton
              onClick={runSign}
              disabled={signBusy || message === "" || (signOpMode === "yoxla" && signature === "")}
            >
              {signBusy ? "Hesablanır…" : signOpMode === "imzala" ? "İmzala" : "Yoxla"}
            </ToolButton>
          </div>
        </ToolPanel>
      )}

      {keyPair && keyPair.purpose === "imzala" && signOpMode === "imzala" && signState?.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {signState.message}
        </ToolNote>
      )}

      {keyPair && keyPair.purpose === "imzala" && signOpMode === "imzala" && signState?.phase === "done" && (
        <ToolResultPanel title="İmza" action={<CopyButton value={signState.value} label="Kopyala" className="shrink-0" />}>
          <ToolOutput className="m-3 break-all">{signState.value}</ToolOutput>
        </ToolResultPanel>
      )}

      {keyPair && keyPair.purpose === "imzala" && signOpMode === "yoxla" && verifyState?.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {verifyState.message}
        </ToolNote>
      )}

      {keyPair && keyPair.purpose === "imzala" && signOpMode === "yoxla" && verifyState?.phase === "done" && (
        <ToolNote tone={verifyState.valid ? "info" : "accent"} title={verifyState.valid ? "Uyğundur" : "Uyğun deyil"}>
          {verifyState.valid ? "İmza bu mətnə və açıq açara uyğundur." : "İmza bu mətnə uyğun deyil."}
        </ToolNote>
      )}

      <ToolPanel>
        <ToolPanelHeader title="Açar idxalı" />
        <div className="space-y-4 p-4">
          <ToolField label="PEM və ya JWK" htmlFor="rsa-import-text" note="Format avtomatik tanınır — `-----BEGIN` ilə başlayan PEM, qalanı JWK sayılır.">
            <ToolTextArea
              id="rsa-import-text"
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportResult(null);
              }}
              rows={5}
              spellCheck={false}
              placeholder="-----BEGIN PUBLIC KEY-----… və ya {&quot;kty&quot;:&quot;RSA&quot;,…}"
            />
          </ToolField>

          <div className="grid gap-4 sm:grid-cols-2">
            <ToolField label="Hansı açar" htmlFor="rsa-import-kind">
              <ToolSegmented label="Hansı açar" options={KEY_KIND_OPTIONS} value={importKind} onChange={setImportKind} />
            </ToolField>
            <ToolField label="Məqsəd" htmlFor="rsa-import-purpose">
              <ToolSegmented label="Məqsəd" options={PURPOSE_OPTIONS} value={importPurpose} onChange={setImportPurpose} />
            </ToolField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {importPurpose === "imzala" && (
              <ToolField label="İmza sxemi" htmlFor="rsa-import-sign-algorithm">
                <ToolSegmented
                  label="İmza sxemi"
                  options={SIGN_ALGORITHM_OPTIONS}
                  value={importSignAlgorithm}
                  onChange={setImportSignAlgorithm}
                />
              </ToolField>
            )}
            <ToolField label="Hash" htmlFor="rsa-import-hash">
              <ToolSegmented label="Hash" options={HASH_OPTIONS} value={importHash} onChange={setImportHash} />
            </ToolField>
          </div>

          <ToolButton onClick={runImport} disabled={importBusy || importText.trim() === ""}>
            {importBusy ? "Oxunur…" : "İdxal et"}
          </ToolButton>
        </div>
      </ToolPanel>

      {importResult?.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {importResult.message}
        </ToolNote>
      )}

      {importResult?.phase === "done" && (
        <ToolResultPanel title="Açarın parametrləri">
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <ToolStat label="Tip" value={importResult.description.type === "public" ? "Açıq" : "Gizli"} />
            <ToolStat label="Bit uzunluğu" value={importResult.description.modulusBits} />
            <ToolStat label="Eksponent" value={importResult.description.publicExponentDecimal} />
            <ToolStat label="Hash" value={importResult.description.hash} />
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}
