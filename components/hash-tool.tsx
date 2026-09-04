"use client";

import { useMemo, useState } from "react";
import { formatDigest, hashAll } from "../lib/hash";
import { formatNumber } from "../shared/format";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolTextArea,
} from "./ui";
import { ToolSegmented } from "./tabs";

type Casing = "lower" | "upper";

const CASE_OPTIONS = [
  { value: "lower" as const, label: "abc" },
  { value: "upper" as const, label: "ABC" },
];

/*
 * The order is oldest to newest, which is also weakest to strongest, so the
 * column a visitor reads last is the one they should be using.
 */
const ALGORITHMS = [
  { key: "md5", label: "MD5", note: "128 bit · sınıq" },
  { key: "sha1", label: "SHA-1", note: "160 bit · sınıq" },
  { key: "sha256", label: "SHA-256", note: "256 bit · etibarlı" },
] as const;

/*
 * Measured on this machine: all three digests over 200 000 characters take
 * 82 ms, and over a million they take 335 ms. The second figure is per
 * keystroke, which drops typed characters — so past the first figure the tool
 * stops recomputing and says why, instead of freezing the field.
 */
const MAX_INPUT_CHARACTERS = 200000;

/* A word whose character count and byte count disagree, which is the point. */
const SAMPLE = "əşya";

export function HashTool() {
  const [text, setText] = useState("");
  const [casing, setCasing] = useState<Casing>("lower");

  const tooLong = text.length > MAX_INPUT_CHARACTERS;

  /* One call, three digests: the visitor typed once. */
  const result = useMemo(() => (tooLong ? null : hashAll(text)), [text, tooLong]);

  const uppercase = casing === "upper";
  const multibyte = result !== null && result.bytes > result.characters;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Mətn"
          hint={
            result === null
              ? `${formatNumber(text.length)} simvol`
              : `${formatNumber(result.characters)} simvol · ${formatNumber(result.bytes)} bayt`
          }
          action={
            <>
              <ToolSegmented
                label="Nəticənin hərf ölçüsü"
                options={CASE_OPTIONS}
                value={casing}
                onChange={setCasing}
              />
              <ToolButton size="chip" onClick={() => setText(SAMPLE)}>
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setText("")} disabled={text === ""}>
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="p-4">
          <ToolField
            label="Hash-lənəcək mətn"
            htmlFor="hash-input"
            note="Yazdıqca hesablanır. Sətir sonu, boşluq və gözə görünməyən simvollar da nəticəyə daxildir."
          >
            <ToolTextArea
              id="hash-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Mətni bura yaz və ya yapışdır…"
              spellCheck={false}
              className="min-h-32"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {tooLong && (
        <ToolNote tone="accent" title="Mətn çox uzundur">
          {formatNumber(MAX_INPUT_CHARACTERS)} simvoldan uzun mətn hər düymə
          basılışında yenidən hesablanarsa, yazı ləngiyir. Mətni qısalt — və ya
          fayl üçün əməliyyat sistemindəki alətdən istifadə et:{" "}
          <code className="font-mono">sha256sum fayl.txt</code>.
        </ToolNote>
      )}

      {result !== null && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {ALGORITHMS.map((algorithm) => {
              const digest = formatDigest(result[algorithm.key], uppercase);
              return (
                <ToolResultPanel
                  key={algorithm.key}
                  title={algorithm.label}
                  hint={algorithm.note}
                  action={
                    <CopyButton
                      value={digest}
                      label="Kopyala"
                      className="shrink-0"
                    />
                  }
                  className="min-w-0"
                >
                  {/* `break-all` rather than the panel's own word breaking: a
                      digest is one 64-character word with nowhere to break,
                      and without this it overflows its column. */}
                  <ToolOutput className="m-3 break-all">{digest}</ToolOutput>
                </ToolResultPanel>
              );
            })}
          </div>

          {text === "" && (
            <ToolNote title="Boş mətn">
              Yuxarıdakılar boş sətrin hash-idir — bu, etibarlı nəticədir və
              alqoritmlərin spesifikasiyasında yazılan sabitdir. Mətn yazan kimi
              dəyişəcək.
            </ToolNote>
          )}

          {multibyte && (
            <ToolNote tone="accent" title="Simvol sayı ilə bayt sayı fərqlidir">
              {formatNumber(result.characters)} simvol,{" "}
              {formatNumber(result.bytes)} bayt. Hash hərflərin özündən yox,
              onların UTF-8 baytlarından hesablanır: «ə», «ğ», «ş» kimi hərflərin
              hər biri iki bayt tutur. Başqa alət eyni mətn üçün fərqli nəticə
              verirsə, əvvəlcə həmin alətin bayt sayına bax.
            </ToolNote>
          )}
        </>
      )}
    </div>
  );
}
