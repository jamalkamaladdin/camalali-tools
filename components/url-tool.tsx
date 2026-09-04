"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { ToolSegmented } from "./tabs";
import {
  decodeWithStyle,
  encodeWithStyle,
  parseUrl,
  rebuildUrlWithParams,
  type EncodingStyle,
  type ParsedUrl,
} from "../lib/url";

type Direction = "encode" | "decode";

const DIRECTION_OPTIONS = [
  { value: "encode" as const, label: "Kodlaşdır" },
  { value: "decode" as const, label: "Aç" },
];

const STYLES: { style: EncodingStyle; label: string; hint: string }[] = [
  { style: "component", label: "encodeURIComponent", hint: "bir dəyər üçün" },
  { style: "uri", label: "encodeURI", hint: "bütöv URL üçün" },
  { style: "form", label: "form (+)", hint: "HTML forma göndərişi" },
];

const ENCODE_SAMPLE = "Salam dünya, necəsən? a=1&b=2";
// Already percent-encoded, so running the encode direction on it a second
// time demonstrates double encoding: every "%" becomes "%25".
const DECODE_SAMPLE = "Salam%20d%C3%BCnya%2C+nec%C9%99s%C9%99n%3F";

// A raw Unicode string, on purpose: `new URL(...)` — called inside
// `parseUrl` — does the punycode and percent-encoding itself, so the sample
// only needs to state intent (Cyrillic host, Azerbaijani query text, a
// repeated key, a valueless key) and let the tool it is demonstrating do the
// actual work.
const SAMPLE_URL =
  "https://user:parol@тест.рф:8443/axtarış?ad=Cəmran&ölkə=Azərbaycan&a=1&a=2&bos#bölmə-2";

export function UrlTool() {
  const [direction, setDirection] = useState<Direction>("encode");
  const [text, setText] = useState("");

  const rows = useMemo(
    () =>
      STYLES.map(({ style, label, hint }) => {
        if (direction === "encode") {
          return { style, label, hint, ok: true as const, value: encodeWithStyle(text, style) };
        }
        const decoded = decodeWithStyle(text, style);
        return decoded.ok
          ? { style, label, hint, ok: true as const, value: decoded.text }
          : { style, label, hint, ok: false as const, value: decoded.error };
      }),
    [direction, text],
  );

  const [urlInput, setUrlInput] = useState("");
  const parsed: ParsedUrl | null = useMemo(
    () => (urlInput.trim() === "" ? null : parseUrl(urlInput)),
    [urlInput],
  );

  const [draftKey, setDraftKey] = useState("");
  const [draftValue, setDraftValue] = useState("");

  /* The table has no state of its own — every edit reads the current pairs
     back out of `parsed`, changes one, and rewrites `urlInput`. That keeps
     the visible URL text and the table permanently in sync, at the cost of a
     full re-parse per keystroke — cheap enough for a query string. */
  const applyPairs = (pairs: [string, string][]) => {
    if (!parsed || !parsed.ok) return;
    const rebuilt = rebuildUrlWithParams(parsed.href, pairs);
    if (rebuilt) setUrlInput(rebuilt);
  };

  const updateKey = (index: number, key: string) => {
    if (!parsed || !parsed.ok) return;
    applyPairs(parsed.searchParams.map((pair, i) => (i === index ? [key, pair[1]] : pair)));
  };
  const updateValue = (index: number, value: string) => {
    if (!parsed || !parsed.ok) return;
    applyPairs(parsed.searchParams.map((pair, i) => (i === index ? [pair[0], value] : pair)));
  };
  const removeRow = (index: number) => {
    if (!parsed || !parsed.ok) return;
    applyPairs(parsed.searchParams.filter((_, i) => i !== index));
  };
  const addRow = () => {
    if (!parsed || !parsed.ok || draftKey.trim() === "") return;
    applyPairs([...parsed.searchParams, [draftKey, draftValue]]);
    setDraftKey("");
    setDraftValue("");
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Kodlaşdırma"
          action={
            <>
              <ToolSegmented
                label="İstiqamət"
                options={DIRECTION_OPTIONS}
                value={direction}
                onChange={setDirection}
              />
              <ToolButton
                size="chip"
                onClick={() => setText(direction === "encode" ? ENCODE_SAMPLE : DECODE_SAMPLE)}
              >
                Nümunə
              </ToolButton>
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <ToolField
            label={direction === "encode" ? "Adi mətn" : "Kodlaşdırılmış mətn"}
            htmlFor="url-text-input"
          >
            <ToolTextArea
              id="url-text-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                direction === "encode" ? "Kodlaşdırılacaq mətni yaz…" : "Salam%20d%C3%BCnya"
              }
              className="min-h-40!"
              spellCheck={false}
            />
          </ToolField>

          {/* Three rows, one per style, so the difference the FAQ talks about
              is a comparison on the same screen rather than a claim to take
              on trust. */}
          <div className="space-y-2">
            {rows.map((row) => (
              <ToolResultPanel
                key={row.style}
                title={row.label}
                hint={row.hint}
                action={row.ok ? <CopyButton value={row.value} label="kopyala" /> : undefined}
              >
                <div className="p-3">
                  {row.ok ? (
                    <ToolOutput className="break-all">{row.value || "—"}</ToolOutput>
                  ) : (
                    <ToolNote tone="accent" title="Bu qaydaya görə açılmadı">
                      {row.value}
                    </ToolNote>
                  )}
                </div>
              </ToolResultPanel>
            ))}
          </div>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="URL-i hissələrə ayır"
          action={
            <ToolButton size="chip" onClick={() => setUrlInput(SAMPLE_URL)}>
              Nümunə
            </ToolButton>
          }
        />

        <div className="space-y-5 p-4">
          <ToolField label="URL" htmlFor="url-parse-input">
            <ToolInput
              id="url-parse-input"
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              placeholder="https://misal.az/yol?a=1"
              spellCheck={false}
            />
          </ToolField>

          <ParsedUrlView
            parsed={parsed}
            draftKey={draftKey}
            draftValue={draftValue}
            onDraftKeyChange={setDraftKey}
            onDraftValueChange={setDraftValue}
            onAddRow={addRow}
            onUpdateKey={updateKey}
            onUpdateValue={updateValue}
            onRemoveRow={removeRow}
          />
        </div>
      </ToolPanel>
    </div>
  );
}

function ParsedUrlView({
  parsed,
  draftKey,
  draftValue,
  onDraftKeyChange,
  onDraftValueChange,
  onAddRow,
  onUpdateKey,
  onUpdateValue,
  onRemoveRow,
}: {
  parsed: ParsedUrl | null;
  draftKey: string;
  draftValue: string;
  onDraftKeyChange: (value: string) => void;
  onDraftValueChange: (value: string) => void;
  onAddRow: () => void;
  onUpdateKey: (index: number, key: string) => void;
  onUpdateValue: (index: number, value: string) => void;
  onRemoveRow: (index: number) => void;
}) {
  if (!parsed) {
    return (
      <p className="font-ui text-sm text-muted">
        URL yapışdır — sxem, host, port, yol, sorğu və fraqment burada görünəcək.
      </p>
    );
  }

  if (!parsed.ok) {
    return (
      <ToolNote tone="accent" title="Düzgün URL deyil">
        {parsed.error}
      </ToolNote>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ToolStat label="Sxem" value={parsed.protocol.replace(/:$/, "")} />
        <ToolStat
          label="Host"
          value={parsed.hostname}
          note={parsed.hostnameUnicode ? `Açılmış: ${parsed.hostnameUnicode}` : undefined}
        />
        <ToolStat label="Port" value={parsed.port || "— (defolt)"} />
        <ToolStat label="Yol" value={parsed.pathname || "/"} />
        <ToolStat label="Sorğu" value={parsed.search || "—"} />
        <ToolStat label="Fraqment" value={parsed.hash || "—"} />
      </div>

      {(parsed.username !== "" || parsed.password !== "") && (
        <ToolNote tone="info" title="URL-də istifadəçi məlumatı var">
          İstifadəçi adı: {parsed.username || "—"}, parol: {parsed.password ? "●●●●" : "—"}.
        </ToolNote>
      )}

      <ToolField label="Normallaşdırılmış URL" htmlFor="url-normalized-output">
        <div className="flex items-center gap-2">
          <ToolInput
            id="url-normalized-output"
            readOnly
            value={parsed.href}
            className="font-mono"
          />
          <CopyButton value={parsed.href} label="url-i kopyala" />
        </div>
      </ToolField>

      <div>
        <ToolLabel>Sorğu parametrləri</ToolLabel>
        <div className="mt-2 space-y-2">
          {parsed.searchParams.length === 0 && (
            <p className="font-ui text-xs text-muted">Sorğu parametri yoxdur.</p>
          )}

          {parsed.searchParams.map(([key, value], index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <ToolInput
                value={key}
                onChange={(event) => onUpdateKey(index, event.target.value)}
                aria-label={`Açar ${index + 1}`}
                className="h-8 text-xs"
              />
              <ToolInput
                value={value}
                onChange={(event) => onUpdateValue(index, event.target.value)}
                aria-label={`Dəyər ${index + 1}`}
                className="h-8 text-xs"
              />
              <ToolButton size="chip" onClick={() => onRemoveRow(index)}>
                Sil
              </ToolButton>
            </div>
          ))}

          {/* Held here rather than written straight into the URL, because the
              rule above that drops an empty-key row would otherwise erase this
              one the instant it appeared, before its key could be typed. */}
          <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <ToolInput
              value={draftKey}
              onChange={(event) => onDraftKeyChange(event.target.value)}
              placeholder="yeni açar"
              aria-label="Yeni parametrin açarı"
              className="h-8 text-xs"
            />
            <ToolInput
              value={draftValue}
              onChange={(event) => onDraftValueChange(event.target.value)}
              placeholder="yeni dəyər"
              aria-label="Yeni parametrin dəyəri"
              className="h-8 text-xs"
            />
            <ToolButton size="chip" onClick={onAddRow} disabled={draftKey.trim() === ""}>
              Əlavə et
            </ToolButton>
          </div>
        </div>
      </div>
    </div>
  );
}
