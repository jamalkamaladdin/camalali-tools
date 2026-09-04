"use client";

import { useState } from "react";
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
  ToolSelect,
} from "./ui";
import {
  bcryptHash,
  bcryptVerify,
  bcryptRounds,
  passwordByteLength,
  BCRYPT_MIN_COST,
  BCRYPT_MAX_COST,
  BCRYPT_MAX_PASSWORD_BYTES,
} from "../lib/bcrypt";

/*
 * Two modes, the same shape `sifreleme-tool.tsx` uses for its own reversible
 * pair — except neither direction here is auto-triggered on every keystroke
 * the way `hmac-tool.tsx` computes on change. bcrypt's whole design is that
 * one hash is deliberately expensive: recomputing it per keypress would make
 * typing a password feel broken at any cost above the low single digits. So
 * both directions wait for an explicit button and show a busy state in
 * between, which is the one thing `eksBlowfishSetup`'s event-loop yields in
 * `bcrypt.ts` actually make possible.
 */
type Mode = "hash" | "verify";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "hash", label: "Hashla" },
  { value: "verify", label: "Yoxla" },
];

const COST_OPTIONS = Array.from(
  { length: BCRYPT_MAX_COST - BCRYPT_MIN_COST + 1 },
  (_, index) => BCRYPT_MIN_COST + index,
);

const SAMPLE_PASSWORD = "at-kopru-2026!";
const SAMPLE_VERIFY_PASSWORD = "passw0rd";
/* A known-answer pair from `scripts/tools-checks/bcrypt.mts` — cost 4, so the
   sample verifies almost instantly instead of making a first-time visitor
   wait on the tool's own default cost. */
const SAMPLE_HASH = "$2b$04$18AF8aAUBJtfWTOqKoPg/.yLK9G5DWCdVFmhwbGQ1ndR0vkcFpfsC";

type HashState =
  | { phase: "computing" }
  | { phase: "done"; hash: string; elapsedMs: number }
  | { phase: "error"; message: string };

type VerifyState =
  | { phase: "computing" }
  | { phase: "done"; matches: boolean; cost: number; version: string; elapsedMs: number }
  | { phase: "error"; message: string };

export function BcryptTool() {
  const [mode, setMode] = useState<Mode>("hash");

  const [password, setPassword] = useState("");
  const [cost, setCost] = useState(10);
  const [hashState, setHashState] = useState<HashState | null>(null);

  const [verifyPassword, setVerifyPassword] = useState("");
  const [existingHash, setExistingHash] = useState("");
  const [verifyState, setVerifyState] = useState<VerifyState | null>(null);

  const byteLength = passwordByteLength(password);
  const overLimit = byteLength > BCRYPT_MAX_PASSWORD_BYTES;

  const runHash = async () => {
    setHashState({ phase: "computing" });
    const result = await bcryptHash(password, cost);
    setHashState(
      result.ok
        ? { phase: "done", hash: result.hash, elapsedMs: result.elapsedMs }
        : { phase: "error", message: result.error },
    );
  };

  const runVerify = async () => {
    setVerifyState({ phase: "computing" });
    const result = await bcryptVerify(verifyPassword, existingHash);
    setVerifyState(
      result.ok
        ? {
            phase: "done",
            matches: result.matches,
            cost: result.cost,
            version: result.version,
            elapsedMs: result.elapsedMs,
          }
        : { phase: "error", message: result.error },
    );
  };

  const hashBusy = hashState?.phase === "computing";
  const verifyBusy = verifyState?.phase === "computing";

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title={mode === "hash" ? "Parol" : "Parol və hash"}
          action={
            <>
              <ToolSegmented label="Rejim" options={MODE_OPTIONS} value={mode} onChange={setMode} />
              <ToolButton
                size="chip"
                onClick={() => {
                  if (mode === "hash") {
                    setPassword(SAMPLE_PASSWORD);
                    setCost(10);
                    setHashState(null);
                  } else {
                    setVerifyPassword(SAMPLE_VERIFY_PASSWORD);
                    setExistingHash(SAMPLE_HASH);
                    setVerifyState(null);
                  }
                }}
              >
                Nümunə
              </ToolButton>
              <ToolButton
                size="chip"
                onClick={() => {
                  if (mode === "hash") {
                    setPassword("");
                    setHashState(null);
                  } else {
                    setVerifyPassword("");
                    setExistingHash("");
                    setVerifyState(null);
                  }
                }}
              >
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="space-y-4 p-4">
          {mode === "hash" ? (
            <>
              <ToolField
                label="Hashlanacaq parol"
                htmlFor="bcrypt-password"
                hint={`${byteLength} / ${BCRYPT_MAX_PASSWORD_BYTES} bayt`}
              >
                <ToolInput
                  id="bcrypt-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setHashState(null);
                  }}
                  placeholder="parol"
                  spellCheck={false}
                  autoComplete="off"
                />
              </ToolField>

              {overLimit && (
                <ToolNote tone="accent" title="72 bayt limiti aşıldı">
                  Parol {byteLength} bayt: bcrypt yalnız ilk {BCRYPT_MAX_PASSWORD_BYTES} baytı hesablamaya
                  qatır, qalanı sükutla atır. Azərbaycan hərfləri (ə, ş, ğ, ç, ö, ü, İ) UTF-8-də 2 bayt
                  tutduğu üçün bu hədd belə hərflərlə yazılmış parolda təxminən yarıya, 36 simvola düşür.
                </ToolNote>
              )}

              <ToolField
                label="Cost"
                htmlFor="bcrypt-cost"
                note={`2^${cost} = ${bcryptRounds(cost)} raund. Cost bir vahid artanda hesablama vaxtı təxminən iki qat olur.`}
              >
                <ToolSelect
                  id="bcrypt-cost"
                  value={String(cost)}
                  onChange={(event) => {
                    setCost(Number(event.target.value));
                    setHashState(null);
                  }}
                  className="max-w-24"
                >
                  {COST_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </ToolSelect>
              </ToolField>

              <ToolButton onClick={runHash} disabled={password === "" || hashBusy}>
                {hashBusy ? "Hesablanır…" : "Hashla"}
              </ToolButton>
            </>
          ) : (
            <>
              <ToolField label="Parol" htmlFor="bcrypt-verify-password">
                <ToolInput
                  id="bcrypt-verify-password"
                  value={verifyPassword}
                  onChange={(event) => {
                    setVerifyPassword(event.target.value);
                    setVerifyState(null);
                  }}
                  placeholder="parol"
                  spellCheck={false}
                  autoComplete="off"
                />
              </ToolField>

              <ToolField
                label="Mövcud hash"
                htmlFor="bcrypt-existing-hash"
                note="$2a$, $2b$ və ya $2y$ prefiksli bcrypt hash."
              >
                <ToolInput
                  id="bcrypt-existing-hash"
                  value={existingHash}
                  onChange={(event) => {
                    setExistingHash(event.target.value);
                    setVerifyState(null);
                  }}
                  placeholder="$2b$10$..."
                  spellCheck={false}
                  autoComplete="off"
                  className="font-mono text-sm"
                />
              </ToolField>

              <ToolButton
                onClick={runVerify}
                disabled={verifyPassword === "" || existingHash === "" || verifyBusy}
              >
                {verifyBusy ? "Hesablanır…" : "Yoxla"}
              </ToolButton>
            </>
          )}
        </div>
      </ToolPanel>

      {mode === "hash" && hashState?.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {hashState.message}
        </ToolNote>
      )}

      {mode === "hash" && hashState?.phase === "done" && (
        <ToolResultPanel
          title="Hash"
          hint={`${Math.round(hashState.elapsedMs)} ms`}
          action={<CopyButton value={hashState.hash} label="Kopyala" className="shrink-0" />}
        >
          <ToolOutput className="m-3 break-all">{hashState.hash}</ToolOutput>
        </ToolResultPanel>
      )}

      {mode === "verify" && verifyState?.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {verifyState.message}
        </ToolNote>
      )}

      {mode === "verify" && verifyState?.phase === "done" && (
        <ToolNote
          tone={verifyState.matches ? "info" : "accent"}
          title={verifyState.matches ? "Uyğundur" : "Uyğun deyil"}
        >
          {verifyState.matches ? "Parol bu hash-a uyğundur." : "Parol bu hash-a uyğun deyil."} Cost{" "}
          {verifyState.cost}, versiya {verifyState.version}, {Math.round(verifyState.elapsedMs)} ms.
        </ToolNote>
      )}
    </div>
  );
}
