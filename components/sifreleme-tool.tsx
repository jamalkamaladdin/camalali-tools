"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolSegmented } from "./tabs";
import {
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolTextArea,
} from "./ui";
import { decryptText, encryptText } from "../lib/sifreleme";

/*
 * One mode switch, one input surface, one output surface — the same shape as
 * `base64-tool.tsx` beside this file: encrypt/decrypt is the same kind of
 * reversible pair encode/decode already is, so it gets the same layout
 * rather than two panels stacked on top of each other.
 */
type Mode = "sifrele" | "desifrele";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "sifrele", label: "Şifrələ" },
  { value: "desifrele", label: "Deşifrələ" },
];

const SAMPLE_TEXT = "Bu mətn brauzerdən çıxmadan şifrələnir.";
const SAMPLE_PASSWORD = "at-kopru-2026";

type State = { phase: "error"; message: string } | { phase: "ready"; value: string };

export function SifrelemeTool() {
  const [mode, setMode] = useState<Mode>("sifrele");
  const [plaintext, setPlaintext] = useState("");
  const [pkg, setPkg] = useState("");
  const [password, setPassword] = useState("");
  /* `null` means "nothing to show yet" — whether that is because the mode's
     required fields are still empty is read straight from them at render
     time, so the guard below never sets state synchronously. */
  const [state, setState] = useState<State | null>(null);

  const input = mode === "sifrele" ? plaintext : pkg;
  const inputsReady = password !== "" && input !== "";

  useEffect(() => {
    if (!inputsReady) return;

    let cancelled = false;
    const run = mode === "sifrele" ? encryptText(plaintext, password) : decryptText(pkg, password);
    run.then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({ phase: "error", message: result.error });
        return;
      }
      const value = "package" in result ? result.package : result.plaintext;
      setState({ phase: "ready", value });
    });
    return () => {
      cancelled = true;
    };
  }, [mode, plaintext, pkg, password, inputsReady]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title={mode === "sifrele" ? "Açıq mətn" : "Şifrələnmiş paket"}
          action={<ToolSegmented label="Rejim" options={MODE_OPTIONS} value={mode} onChange={setMode} />}
        />

        <div className="space-y-4 p-4">
          {mode === "sifrele" ? (
            <ToolField label="Şifrələnəcək mətn" htmlFor="sifreleme-plaintext">
              <ToolTextArea
                id="sifreleme-plaintext"
                value={plaintext}
                onChange={(event) => setPlaintext(event.target.value)}
                rows={5}
                spellCheck={false}
                placeholder="Mətni bura yaz və ya yapışdır…"
              />
            </ToolField>
          ) : (
            <ToolField
              label="Paket"
              htmlFor="sifreleme-package"
              note="Şifrələmə nəticəsi olan üç hissəli sətir: duz.iv.şifrmətn."
            >
              <ToolTextArea
                id="sifreleme-package"
                value={pkg}
                onChange={(event) => setPkg(event.target.value)}
                rows={5}
                spellCheck={false}
                placeholder="Base64.Base64.Base64"
              />
            </ToolField>
          )}

          <ToolField
            label="Parol"
            htmlFor="sifreleme-password"
            note="PBKDF2 ilə 210 000 təkrarla açara çevrilir, heç yerə göndərilmir."
          >
            <ToolInput
              id="sifreleme-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="parol"
              spellCheck={false}
              autoComplete="off"
              className="max-w-80"
            />
          </ToolField>

          {mode === "sifrele" && plaintext === "" && password === "" && (
            <ToolNote tone="info">
              Sınamaq üçün, məsələn: <span className="font-mono text-xs">{SAMPLE_TEXT}</span> mətnini
              parol <span className="font-mono text-xs">{SAMPLE_PASSWORD}</span> ilə şifrələ.
            </ToolNote>
          )}
        </div>
      </ToolPanel>

      {!inputsReady && (
        <ToolNote tone="info">
          {mode === "sifrele" ? "Nəticəni görmək üçün mətn və parol yaz." : "Nəticəni görmək üçün paket və parol yaz."}
        </ToolNote>
      )}

      {inputsReady && state?.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {state.message}
        </ToolNote>
      )}

      {inputsReady && state?.phase === "ready" && (
        <ToolResultPanel
          title={mode === "sifrele" ? "Şifrələnmiş paket" : "Açıq mətn"}
          action={<CopyButton value={state.value} label="Kopyala" className="shrink-0" />}
        >
          <ToolOutput className="m-4 break-all">{state.value}</ToolOutput>
        </ToolResultPanel>
      )}
    </div>
  );
}
