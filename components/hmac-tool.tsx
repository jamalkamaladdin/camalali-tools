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
  ToolTextArea,
} from "./ui";
import {
  computeHmac,
  verifyHmac,
  HMAC_ALGORITHMS,
  type HmacAlgorithm,
  type HmacDigest,
  type KeyEncoding,
} from "../lib/hmac";

/* A webhook-shaped example rather than an RFC vector: the visitor arriving
   here is almost always checking a signature a real service sent, and this
   is what that payload actually looks like. */
const SAMPLE_MESSAGE = "sifariş=1042&mebla=59.90";
const SAMPLE_KEY = "webhook-sirri-2026";

const KEY_ENCODING_OPTIONS = [
  { value: "text" as const, label: "Mətn" },
  { value: "hex" as const, label: "Hex" },
];

const ALGORITHM_OPTIONS = HMAC_ALGORITHMS.map((algorithm) => ({
  value: algorithm,
  label: algorithm,
}));

type ComputeState =
  | { phase: "result"; digest: HmacDigest }
  | { phase: "verified"; digest: HmacDigest; matches: boolean }
  | { phase: "error"; message: string };

export function HmacTool() {
  const [message, setMessage] = useState("");
  const [key, setKey] = useState("");
  const [keyEncoding, setKeyEncoding] = useState<KeyEncoding>("text");
  const [algorithm, setAlgorithm] = useState<HmacAlgorithm>("SHA-256");
  const [expected, setExpected] = useState("");
  /* `null` means "no key yet" — checked from `key` directly at render time
     rather than stored here, so the guard below never has to set state
     synchronously from the effect body (only the async branch does). */
  const [state, setState] = useState<ComputeState | null>(null);

  useEffect(() => {
    if (key.trim() === "") return;

    let cancelled = false;

    (async () => {
      if (expected.trim() === "") {
        const result = await computeHmac(message, key, keyEncoding, algorithm);
        if (cancelled) return;
        setState(result.ok ? { phase: "result", digest: result.digest } : { phase: "error", message: result.error });
      } else {
        const result = await verifyHmac(message, key, keyEncoding, algorithm, expected);
        if (cancelled) return;
        setState(
          result.ok
            ? { phase: "verified", digest: result.digest, matches: result.matches }
            : { phase: "error", message: result.error },
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [message, key, keyEncoding, algorithm, expected]);

  const keyIsEmpty = key.trim() === "";
  const digest =
    !keyIsEmpty && state && (state.phase === "result" || state.phase === "verified") ? state.digest : null;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Mətn və açar"
          action={
            <>
              <ToolSegmented
                label="Alqoritm"
                options={ALGORITHM_OPTIONS}
                value={algorithm}
                onChange={setAlgorithm}
              />
              <ToolButton
                size="chip"
                onClick={() => {
                  setMessage(SAMPLE_MESSAGE);
                  setKey(SAMPLE_KEY);
                  setKeyEncoding("text");
                }}
              >
                Nümunə
              </ToolButton>
              <ToolButton
                size="chip"
                onClick={() => {
                  setMessage("");
                  setKey("");
                  setExpected("");
                }}
                disabled={message === "" && key === "" && expected === ""}
              >
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="space-y-4 p-4">
          <ToolField label="HMAC hesablanacaq mətn" htmlFor="hmac-message">
            <ToolTextArea
              id="hmac-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Mətni bura yaz və ya yapışdır…"
              spellCheck={false}
            />
          </ToolField>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <ToolField
              label="Açar"
              htmlFor="hmac-key"
              note={
                keyEncoding === "hex"
                  ? "Cüt sayda hex simvol (0-9, a-f), məsələn Stripe kimi xidmətlərin verdiyi açar formatı."
                  : "Adi mətn: hər hərf öz UTF-8 baytına çevrilir."
              }
            >
              <ToolInput
                id="hmac-key"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder={keyEncoding === "hex" ? "0b0b0b0b…" : "gizli-açar"}
                spellCheck={false}
                autoComplete="off"
              />
            </ToolField>
            <div className="sm:self-end">
              <ToolSegmented
                label="Açarın formatı"
                options={KEY_ENCODING_OPTIONS}
                value={keyEncoding}
                onChange={setKeyEncoding}
              />
            </div>
          </div>

          <ToolField
            label="Gözlənilən HMAC"
            htmlFor="hmac-expected"
            hint="opsional"
            note="Bura bir dəyər yazsan, hesablanan HMAC onunla sabit vaxtlı müsaidə ilə tutuşdurulur (hex və Base64 hər ikisi qəbul edilir)."
          >
            <ToolInput
              id="hmac-expected"
              value={expected}
              onChange={(event) => setExpected(event.target.value)}
              placeholder="Yoxlamaq üçün HMAC-i bura yapışdır…"
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-sm"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {keyIsEmpty && <ToolNote tone="info">Nəticəni görmək üçün ən azı bir açar yaz.</ToolNote>}

      {!keyIsEmpty && state?.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {state.message}
        </ToolNote>
      )}

      {!keyIsEmpty && state?.phase === "verified" && (
        <ToolNote tone={state.matches ? "info" : "accent"} title={state.matches ? "Uyğundur" : "Uyğun deyil"}>
          {state.matches
            ? "Hesablanan HMAC yazdığın gözlənilən dəyərlə eynidir."
            : "Hesablanan HMAC yazdığın gözlənilən dəyərdən fərqlidir: açar, alqoritm və ya mətn səhv ola bilər."}
        </ToolNote>
      )}

      {digest && (
        <div className="grid gap-4 sm:grid-cols-2">
          <ToolResultPanel
            title="Hex"
            action={<CopyButton value={digest.hex} label="Kopyala" className="shrink-0" />}
          >
            <ToolOutput className="m-3 break-all">{digest.hex}</ToolOutput>
          </ToolResultPanel>
          <ToolResultPanel
            title="Base64"
            action={<CopyButton value={digest.base64} label="Kopyala" className="shrink-0" />}
          >
            <ToolOutput className="m-3 break-all">{digest.base64}</ToolOutput>
          </ToolResultPanel>
        </div>
      )}
    </div>
  );
}
