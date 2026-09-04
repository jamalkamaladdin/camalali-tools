"use client";

import { useMemo, useState } from "react";
import { ToolSegmented } from "./tabs";
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
import { byteLength, decodeBase64, encodeBase64 } from "../lib/base64";

/*
 * Structure kept from the source tool (camalali-dev's base64-tool.tsx): one
 * mode switch, one input surface, one output surface — never two duplicated
 * panels. Only the skin changed; every surface and control below comes from
 * `src/components/tools/ui.tsx` and `tabs.tsx`.
 */

type Mode = "encode" | "decode";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "encode", label: "Kodla" },
  { value: "decode", label: "Dekodla" },
];

const SAMPLE_TEXT = "Salam, dünya! Əlaqə: +994 77 505 44 45";

/*
 * `src/lib/tools/base64.ts` turns "-" and "_" into "+" and "/" before it
 * checks the alphabet, so URL-safe input — a JWT segment, most often — decodes
 * fine. Its message names the standard alphabet only, which tells that visitor
 * their perfectly legal "-" is illegal. The sentence is corrected where it is
 * shown, because the decoder module is outside this change.
 */
const STANDARD_ALPHABET = "(A–Z, a–z, 0–9, +, /)";
const ACCEPTED_ALPHABET = "(A–Z, a–z, 0–9, + və /, URL-safe formada - və _)";

/*
 * The decoder returns one sentence per cause and the panel used to head every
 * one of them "Dekod alınmadı" — which the UTF-8 case contradicts in its own
 * body text: those bytes did decode, they simply are not text.
 */
function describeError(error: string): { title: string; text: string } {
  return {
    title: /UTF-8/.test(error) ? "Baytlar mətn deyil" : "Dekod alınmadı",
    text: error.replace(STANDARD_ALPHABET, ACCEPTED_ALPHABET),
  };
}


export function Base64Tool() {
  const [mode, setMode] = useState<Mode>("encode");
  const [input, setInput] = useState("");
  const [urlSafe, setUrlSafe] = useState(false);
  const [padding, setPadding] = useState(true);

  const result = useMemo(() => {
    if (mode === "encode") {
      return {
        output: encodeBase64(input, { urlSafe, padding }),
        error: null as string | null,
        bytes: byteLength(input),
      };
    }

    if (input.trim() === "") {
      return { output: "", error: null, bytes: 0 };
    }

    const decoded = decodeBase64(input);
    return decoded.ok
      ? { output: decoded.text, error: null, bytes: decoded.bytes }
      : { output: "", error: decoded.error, bytes: 0 };
  }, [mode, input, urlSafe, padding]);

  const swap = () => {
    // Swapping keeps the produced value in the box — the common next move is to
    // decode what you just encoded and check it round-trips.
    if (result.output) setInput(result.output);
    setMode(mode === "encode" ? "decode" : "encode");
  };

  return (
    <div className="mt-8">
      <ToolSegmented label="Rejim" options={MODE_OPTIONS} value={mode} onChange={setMode} />

      <ToolPanel className="mt-3">
        {/* URL-safe and padding only mean anything while encoding — decode
            already accepts both alphabets and either padding state. */}
        <ToolPanelHeader
          title="Base64"
          action={
            <>
              {mode === "encode" && (
                <>
                  <label className="flex items-center gap-1.5 font-ui text-[11px] text-muted">
                    <input
                      type="checkbox"
                      checked={urlSafe}
                      onChange={(event) => setUrlSafe(event.target.checked)}
                      className="size-3.5 accent-[var(--color-accent)]"
                    />
                    URL-safe (-, _)
                  </label>
                  <label className="flex items-center gap-1.5 font-ui text-[11px] text-muted">
                    <input
                      type="checkbox"
                      checked={padding}
                      onChange={(event) => setPadding(event.target.checked)}
                      className="size-3.5 accent-[var(--color-accent)]"
                    />
                    Padding (=)
                  </label>
                </>
              )}

              {/* In "Dekodla" the sample has to be Base64: loading plain text
                  there made the button meant to demonstrate the tool produce an
                  instant "Dekod alınmadı". */}
              <ToolButton
                size="chip"
                onClick={() =>
                  setInput(
                    mode === "encode"
                      ? SAMPLE_TEXT
                      : encodeBase64(SAMPLE_TEXT, { urlSafe: false, padding: true }),
                  )
                }
              >
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setInput("")} disabled={input === ""}>
                Təmizlə
              </ToolButton>
            </>
          }
        />

        {/* One panel, two columns — the brief's "not two duplicated panels"
            rules out a separate encode panel and decode panel, not a
            side-by-side layout; this mirrors the json tool's grid. */}
        <div className="grid gap-5 p-4 lg:grid-cols-2">
          <ToolField
            label={mode === "encode" ? "Mətn" : "Base64"}
            htmlFor="b64-input"
            /* `hint` shares the label's line and is `shrink-0`, so it holds a
               count, not a sentence — the decode hint went to `note`, which has
               the row under the control to itself. */
            hint={
              mode === "encode" ? (
                <span className="tabular-nums">
                  {input.length} simvol · {byteLength(input)} bayt
                </span>
              ) : undefined
            }
            note={mode === "decode" ? "Sətir sonu və boşluqlar avtomatik atılır." : undefined}
          >
            <ToolTextArea
              id="b64-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={mode === "encode" ? "Kodlanacaq mətni yaz…" : "U2FsYW0="}
              className="min-h-64!"
            />
          </ToolField>

          {/* Only the produced side changes ground. The textarea beside it and
              the URL-safe / padding switches in the header are input and stay
              on the input surface. */}
          <ToolResultPanel
            title={mode === "encode" ? "Base64" : "Mətn"}
            action={
              <>
                <ToolButton size="chip" onClick={swap} disabled={!result.output}>
                  Yerini dəyiş
                </ToolButton>
                <CopyButton
                  value={result.output}
                  label={mode === "encode" ? "base64-ü kopyala" : "mətni kopyala"}
                  doneLabel="kopyalandı"
                  className="shrink-0"
                />
              </>
            }
            className="flex flex-col"
          >
            <div className="flex min-w-0 flex-1 flex-col p-3">
              {result.error ? (
                <ToolNote tone="accent" title={describeError(result.error).title}>
                  {describeError(result.error).text}
                </ToolNote>
              ) : (
                <>
                  <ToolOutput className="min-h-64 break-all tabular-nums">
                    {result.output || "Nəticə burada görünəcək."}
                  </ToolOutput>
                  <p className="mt-2 font-ui text-xs text-muted">
                    {result.output === "" ? (
                      "Sol tərəfə nə isə yaz."
                    ) : (
                      <span className="tabular-nums">
                        {result.output.length} simvol
                        {mode === "decode" ? ` · ${result.bytes} bayt` : ""}
                      </span>
                    )}
                  </p>
                </>
              )}
            </div>
          </ToolResultPanel>
        </div>
      </ToolPanel>
    </div>
  );
}
