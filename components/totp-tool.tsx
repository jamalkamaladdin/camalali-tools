"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "./ui";
import {
  buildOtpAuthUri,
  computeHotp,
  computeTotpWindow,
  decodeBase32Secret,
  encodeBase32Secret,
  generateSecretBytes,
  TOTP_ALGORITHMS,
  type TotpAlgorithm,
  type TotpDigits,
  type TotpStep,
} from "../lib/totp";

const ALGORITHM_OPTIONS = TOTP_ALGORITHMS.map((algorithm) => ({ value: algorithm, label: algorithm }));

/* `ToolSegmented` is generic over `string` values, but `TotpDigits`/`TotpStep`
   are number unions — so the segmented control works in strings and the
   handlers below convert at the boundary. */
const DIGITS_OPTIONS = [
  { value: "6", label: "6" },
  { value: "8", label: "8" },
];
const STEP_OPTIONS = [
  { value: "30", label: "30 san" },
  { value: "60", label: "60 san" },
];

/* The exact ASCII secret from RFC 6238 Appendix B, in its Base32 form — a
   visitor who wants to see the tool work immediately gets a code that a
   spec-conformant vector actually predicts, not an arbitrary string. */
const SAMPLE_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

type WindowState =
  | { phase: "error"; message: string }
  | { phase: "ready"; previous: string; current: string; next: string; secondsRemaining: number };

type HotpState = { phase: "error"; message: string } | { phase: "ready"; code: string };

export function TotpTool() {
  const [secretText, setSecretText] = useState("");
  const [algorithm, setAlgorithm] = useState<TotpAlgorithm>("SHA-1");
  const [digits, setDigits] = useState<TotpDigits>(6);
  const [step, setStep] = useState<TotpStep>(30);
  const [label, setLabel] = useState("hesab");
  const [issuer, setIssuer] = useState("camalali");
  const [counterText, setCounterText] = useState("0");
  const [nowMs, setNowMs] = useState(() => Date.now());

  /* The live part: a second-resolution clock the window recomputes against,
     so the current code and the countdown both flip exactly on the
     30/60-second boundary rather than only when the visitor touches a field. */
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  /* Decoding is synchronous, so an invalid secret is read straight from this
     value at render time — only the actual TOTP/HOTP computation below (real
     async `crypto.subtle` work) goes through an effect and state. */
  const decoded = useMemo(() => decodeBase32Secret(secretText), [secretText]);
  const secretIsEmpty = secretText.trim() === "";
  const epochSeconds = Math.floor(nowMs / 1000);

  const [windowState, setWindowState] = useState<WindowState | null>(null);

  useEffect(() => {
    if (!decoded.ok) return;
    let cancelled = false;
    computeTotpWindow(decoded.bytes, epochSeconds, step, digits, algorithm).then((result) => {
      if (cancelled) return;
      setWindowState(
        result.ok
          ? {
              phase: "ready",
              previous: result.previous,
              current: result.current,
              next: result.next,
              secondsRemaining: result.secondsRemaining,
            }
          : { phase: "error", message: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [decoded, epochSeconds, step, digits, algorithm]);

  const counter = (() => {
    try {
      const value = BigInt(counterText.trim() === "" ? "0" : counterText.trim());
      return value >= 0n ? value : null;
    } catch {
      return null;
    }
  })();

  const [hotpState, setHotpState] = useState<HotpState | null>(null);

  useEffect(() => {
    if (!decoded.ok || counter === null) return;
    let cancelled = false;
    computeHotp(decoded.bytes, counter, digits, algorithm).then((result) => {
      if (cancelled) return;
      setHotpState(result.ok ? { phase: "ready", code: result.code } : { phase: "error", message: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [decoded, counter, digits, algorithm]);

  const otpAuthUri = decoded.ok
    ? buildOtpAuthUri({
        label: label.trim() === "" ? "hesab" : label.trim(),
        issuer: issuer.trim(),
        secretBase32: encodeBase32Secret(decoded.bytes),
        algorithm,
        digits,
        step,
      })
    : null;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Gizli açar"
          action={
            <>
              <ToolSegmented label="Alqoritm" options={ALGORITHM_OPTIONS} value={algorithm} onChange={setAlgorithm} />
              <ToolSegmented
                label="Rəqəm sayı"
                options={DIGITS_OPTIONS}
                value={String(digits)}
                onChange={(value) => setDigits(Number(value) as TotpDigits)}
              />
              <ToolSegmented
                label="Pəncərə"
                options={STEP_OPTIONS}
                value={String(step)}
                onChange={(value) => setStep(Number(value) as TotpStep)}
              />
            </>
          }
        />

        <div className="space-y-4 p-4">
          <ToolField
            label="Base32 gizli açar"
            htmlFor="totp-secret"
            note="Autentifikator tətbiqinin QR kodunda daşıdığı sətirdir: boşluqlar və kiçik hərflər problem deyil."
          >
            <div className="flex items-center gap-2">
              <ToolInput
                id="totp-secret"
                value={secretText}
                onChange={(event) => setSecretText(event.target.value)}
                placeholder="JBSWY3DPEHPK3PXP"
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-sm"
              />
              <ToolButton size="chip" onClick={() => setSecretText(SAMPLE_SECRET)}>
                Nümunə
              </ToolButton>
              <ToolButton
                size="chip"
                onClick={() => setSecretText(encodeBase32Secret(generateSecretBytes()))}
              >
                Yarat
              </ToolButton>
            </div>
          </ToolField>
        </div>
      </ToolPanel>

      {secretIsEmpty && <ToolNote tone="info">Kodu görmək üçün Base32 gizli açar yaz.</ToolNote>}

      {!secretIsEmpty && !decoded.ok && (
        <ToolNote tone="accent" title="Alınmadı">
          {decoded.error}
        </ToolNote>
      )}

      {decoded.ok && windowState?.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {windowState.message}
        </ToolNote>
      )}

      {decoded.ok && windowState?.phase === "ready" && (
        <ToolResultPanel
          title="Cari kod"
          hint={`${windowState.secondsRemaining} saniyə qalır`}
          action={<CopyButton value={windowState.current} label="Kopyala" className="shrink-0" />}
        >
          <div className="grid gap-4 p-4 sm:grid-cols-3">
            <ToolStat label="Əvvəlki pəncərə" value={windowState.previous} />
            <ToolStat label="Cari" value={windowState.current} tone="accent" />
            <ToolStat label="Növbəti pəncərə" value={windowState.next} />
          </div>
        </ToolResultPanel>
      )}

      {otpAuthUri && (
        <ToolResultPanel
          title="otpauth:// ünvanı"
          hint="QR koda çevirmək üçün"
          action={<CopyButton value={otpAuthUri} label="Kopyala" className="shrink-0" />}
        >
          <div className="space-y-3 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <ToolField label="Xidmət/hesab adı" htmlFor="totp-label">
                <ToolInput id="totp-label" value={label} onChange={(event) => setLabel(event.target.value)} />
              </ToolField>
              <ToolField label="İssuer" htmlFor="totp-issuer" hint="opsional">
                <ToolInput id="totp-issuer" value={issuer} onChange={(event) => setIssuer(event.target.value)} />
              </ToolField>
            </div>
            <ToolOutput className="break-all">{otpAuthUri}</ToolOutput>
          </div>
        </ToolResultPanel>
      )}

      <ToolPanel>
        <ToolPanelHeader title="HOTP: sayğac əsaslı kod" hint="RFC 4226" />
        <div className="space-y-3 p-4">
          <ToolField
            label="Sayğac"
            htmlFor="totp-counter"
            note="TOTP-dən fərqli olaraq vaxtdan asılı deyil: hər istifadədən sonra əl ilə (və ya serverdə) bir vahid artırılır."
          >
            <ToolInput
              id="totp-counter"
              value={counterText}
              onChange={(event) => setCounterText(event.target.value)}
              inputMode="numeric"
              spellCheck={false}
              className="max-w-40 tabular-nums"
            />
          </ToolField>

          {decoded.ok && counter === null && (
            <p className="text-ios-subhead text-muted">Sayğac mənfi olmayan tam ədəd olmalıdır.</p>
          )}
          {decoded.ok && counter !== null && hotpState?.phase === "error" && (
            <p className="text-ios-subhead text-muted">{hotpState.message}</p>
          )}
          {decoded.ok && counter !== null && hotpState?.phase === "ready" && (
            <ToolStat label={`Sayğac ${counterText}`} value={hotpState.code} tone="accent" />
          )}
        </div>
      </ToolPanel>
    </div>
  );
}
