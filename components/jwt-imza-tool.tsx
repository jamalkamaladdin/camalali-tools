"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolSegmented } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import {
  JWT_ALGORITHMS,
  signJwt,
  verifyJwt,
  type JwtAlgorithm,
} from "../lib/jwt-imza";

/*
 * One mode switch, one input surface, one output surface — the same shape as
 * `base64-tool.tsx` beside this file, not two panels stacked on top of each
 * other for sign and verify.
 */
type Mode = "imzala" | "yoxla";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "imzala", label: "İmzala" },
  { value: "yoxla", label: "Yoxla" },
];

const ALGORITHM_OPTIONS = JWT_ALGORITHMS.map((algorithm) => ({ value: algorithm, label: algorithm }));

const SAMPLE_HEADER = `{
  "alg": "HS256",
  "typ": "JWT"
}`;
const SAMPLE_PAYLOAD = `{
  "sub": "1234567890",
  "name": "Elvin Məmmədov",
  "iat": 1735689600
}`;
const SAMPLE_SECRET = "cox-gizli-acar-2026";

type SignState =
  | { phase: "error"; message: string }
  | { phase: "ready"; token: string; header: Record<string, unknown> };

type VerifyState =
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      signatureValid: boolean;
      algorithmMatches: boolean;
      expired: boolean | null;
      notYetValid: boolean | null;
      header: Record<string, unknown>;
      payload: Record<string, unknown>;
    };

export function JwtImzaTool() {
  const [mode, setMode] = useState<Mode>("imzala");
  const [algorithm, setAlgorithm] = useState<JwtAlgorithm>("HS256");
  const [secret, setSecret] = useState("");

  const [headerJson, setHeaderJson] = useState(SAMPLE_HEADER);
  const [payloadJson, setPayloadJson] = useState(SAMPLE_PAYLOAD);
  /* `null` means "nothing computed yet" — the guard for *why* (wrong mode,
     empty secret) is read straight from `mode`/`secret` at render time, so
     the effect below only ever sets state from its async continuation. */
  const [signState, setSignState] = useState<SignState | null>(null);

  const [token, setToken] = useState("");
  const [verifyState, setVerifyState] = useState<VerifyState | null>(null);

  useEffect(() => {
    if (mode !== "imzala" || secret === "") return;
    let cancelled = false;
    signJwt(headerJson, payloadJson, secret, algorithm).then((result) => {
      if (cancelled) return;
      setSignState(
        result.ok ? { phase: "ready", token: result.token, header: result.header } : { phase: "error", message: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [mode, headerJson, payloadJson, secret, algorithm]);

  useEffect(() => {
    if (mode !== "yoxla" || secret === "" || token.trim() === "") return;
    let cancelled = false;
    verifyJwt(token, secret, algorithm).then((result) => {
      if (cancelled) return;
      setVerifyState(
        result.ok
          ? {
              phase: "ready",
              signatureValid: result.signatureValid,
              algorithmMatches: result.algorithmMatches,
              expired: result.expired,
              notYetValid: result.notYetValid,
              header: result.header,
              payload: result.payload,
            }
          : { phase: "error", message: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [mode, token, secret, algorithm]);

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="info" title="Ayrı alət, ayrı iş">
        Saytdakı <span className="font-mono text-xs">jwt</span> aləti yalnız token-i oxuyur, imzaya
        toxunmur. Bu alət isə açarla işləyir: yeni token imzalayır və ya mövcud token-in imzasını
        həmin açarla yoxlayır.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title={mode === "imzala" ? "Header və payload" : "Token"}
          action={
            <>
              <ToolSegmented label="Rejim" options={MODE_OPTIONS} value={mode} onChange={setMode} />
              <ToolSegmented label="Alqoritm" options={ALGORITHM_OPTIONS} value={algorithm} onChange={setAlgorithm} />
            </>
          }
        />

        <div className="space-y-4 p-4">
          {mode === "imzala" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <ToolField label="Header (JSON)" htmlFor="jwt-imza-header" note="alg sahəsi seçilmiş alqoritmə görə yenidən yazılır.">
                <ToolTextArea
                  id="jwt-imza-header"
                  value={headerJson}
                  onChange={(event) => setHeaderJson(event.target.value)}
                  rows={6}
                  spellCheck={false}
                />
              </ToolField>
              <ToolField label="Payload (JSON)" htmlFor="jwt-imza-payload">
                <ToolTextArea
                  id="jwt-imza-payload"
                  value={payloadJson}
                  onChange={(event) => setPayloadJson(event.target.value)}
                  rows={6}
                  spellCheck={false}
                />
              </ToolField>
            </div>
          ) : (
            <ToolField label="JWT token" htmlFor="jwt-imza-token" note="Üç hissə nöqtə (.) ilə ayrılır: header.payload.imza.">
              <ToolTextArea
                id="jwt-imza-token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                rows={4}
                spellCheck={false}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
              />
            </ToolField>
          )}

          <ToolField
            label="Gizli açar"
            htmlFor="jwt-imza-secret"
            note="HMAC-in özündə işlədilir, heç yerə göndərilmir."
          >
            <div className="flex items-center gap-2">
              <ToolInput
                id="jwt-imza-secret"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder="gizli açar"
                spellCheck={false}
                autoComplete="off"
                className="max-w-80"
              />
              {mode === "imzala" && secret === "" && (
                <ToolButton size="chip" onClick={() => setSecret(SAMPLE_SECRET)}>
                  Nümunə açar
                </ToolButton>
              )}
            </div>
          </ToolField>
        </div>
      </ToolPanel>

      {mode === "imzala" && secret === "" && (
        <ToolNote tone="info">Token qurmaq üçün gizli açar yaz.</ToolNote>
      )}
      {mode === "imzala" && secret !== "" && signState?.phase === "error" && (
        <ToolNote tone="accent" title="İmzalanmadı">
          {signState.message}
        </ToolNote>
      )}
      {mode === "imzala" && secret !== "" && signState?.phase === "ready" && (
        <ToolResultPanel
          title="İmzalanmış token"
          action={<CopyButton value={signState.token} label="Kopyala" className="shrink-0" />}
        >
          <ToolOutput className="m-4 break-all">{signState.token}</ToolOutput>
        </ToolResultPanel>
      )}

      {mode === "yoxla" && (secret === "" || token.trim() === "") && (
        <ToolNote tone="info">Yoxlamaq üçün token və gizli açar yaz.</ToolNote>
      )}
      {mode === "yoxla" && secret !== "" && token.trim() !== "" && verifyState?.phase === "error" && (
        <ToolNote tone="accent" title="Yoxlanmadı">
          {verifyState.message}
        </ToolNote>
      )}
      {mode === "yoxla" && secret !== "" && token.trim() !== "" && verifyState?.phase === "ready" && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <ToolStat
              label="İmza"
              value={verifyState.signatureValid ? "Doğrudur" : "Yanlışdır"}
              tone={verifyState.signatureValid ? "default" : "warning"}
            />
            <ToolStat
              label="alg sahəsi"
              value={verifyState.algorithmMatches ? "Uyğundur" : "Uyğun deyil"}
              tone={verifyState.algorithmMatches ? "default" : "warning"}
            />
            <ToolStat
              label="Vaxt"
              value={
                verifyState.expired
                  ? "Bitib"
                  : verifyState.notYetValid
                    ? "Hələ qüvvədə deyil"
                    : "Etibarlıdır"
              }
              tone={verifyState.expired || verifyState.notYetValid ? "warning" : "default"}
            />
          </div>

          {!verifyState.signatureValid && (
            <ToolNote tone="accent" title="İmza uyğun gəlmədi">
              Bu, ya səhv açar, ya seçilmiş alqoritmin token-in özündəkindən fərqli olması, ya da
              token-in imzalandıqdan sonra dəyişdirilməsi deməkdir.
            </ToolNote>
          )}

          <ToolResultPanel title="Payload (JSON)">
            <ToolOutput className="m-4 tabular-nums">{JSON.stringify(verifyState.payload, null, 2)}</ToolOutput>
          </ToolResultPanel>

          <ToolResultPanel title="Header (JSON)">
            <ToolOutput className="m-4 tabular-nums">{JSON.stringify(verifyState.header, null, 2)}</ToolOutput>
          </ToolResultPanel>
        </div>
      )}
    </div>
  );
}
