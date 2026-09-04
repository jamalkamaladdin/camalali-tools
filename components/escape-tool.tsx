"use client";

import { useMemo, useState } from "react";
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
import {
  decodeBase64Text,
  decodeCsvCell,
  decodeHtmlEntities,
  decodeJsonString,
  decodeJsString,
  decodeRegex,
  decodeShellSingleQuote,
  decodeSqlString,
  decodeUrl,
  decodeXml,
  encodeBase64Text,
  encodeCsvCell,
  encodeHtmlEntities,
  encodeJsonString,
  encodeJsString,
  encodeRegex,
  encodeShellSingleQuote,
  encodeSqlString,
  encodeUrl,
  encodeXml,
  ESCAPE_MODE_LABELS,
  ESCAPE_MODE_WHY,
  ESCAPE_MODES,
  type EscapeModeId,
  type JsQuoteChar,
  type SqlEscapeDialect,
  type UrlEscapeStyle,
} from "../lib/escape";

type Direction = "encode" | "decode";
type Outcome = { ok: true; text: string } | { ok: false; error: string };

const SAMPLE_TEXT = 'O\'Brien dedi: "Bu, <mətn> həm sətir, həm də URL üçündür, 5€ dəyərində."';

export function EscapeTool() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [mode, setMode] = useState<EscapeModeId>("json");
  const [direction, setDirection] = useState<Direction>("encode");
  const [urlStyle, setUrlStyle] = useState<UrlEscapeStyle>("component");
  const [sqlDialect, setSqlDialect] = useState<SqlEscapeDialect>("standard");
  const [base64UrlSafe, setBase64UrlSafe] = useState(false);
  const [base64Padding, setBase64Padding] = useState(true);
  const [jsQuote, setJsQuote] = useState<JsQuoteChar>("'");
  const [jsForceUnicode, setJsForceUnicode] = useState(false);

  const outcome: Outcome = useMemo(() => {
    switch (mode) {
      case "json":
        return direction === "encode" ? { ok: true, text: encodeJsonString(text) } : decodeJsonString(text);
      case "html":
        return direction === "encode" ? { ok: true, text: encodeHtmlEntities(text) } : decodeHtmlEntities(text);
      case "xml":
        return direction === "encode" ? { ok: true, text: encodeXml(text) } : decodeXml(text);
      case "url":
        return direction === "encode"
          ? { ok: true, text: encodeUrl(text, urlStyle) }
          : decodeUrl(text, urlStyle);
      case "sql":
        return direction === "encode"
          ? { ok: true, text: encodeSqlString(text, sqlDialect) }
          : decodeSqlString(text, sqlDialect);
      case "shell":
        return direction === "encode"
          ? { ok: true, text: encodeShellSingleQuote(text) }
          : decodeShellSingleQuote(text);
      case "regex":
        return direction === "encode" ? { ok: true, text: encodeRegex(text) } : decodeRegex(text);
      case "csv":
        return direction === "encode" ? { ok: true, text: encodeCsvCell(text) } : decodeCsvCell(text);
      case "base64": {
        if (direction === "encode") {
          return { ok: true, text: encodeBase64Text(text, { urlSafe: base64UrlSafe, padding: base64Padding }) };
        }
        const result = decodeBase64Text(text);
        return result.ok ? { ok: true, text: result.text } : { ok: false, error: result.error };
      }
      case "js":
        return direction === "encode"
          ? { ok: true, text: encodeJsString(text, jsQuote, jsForceUnicode) }
          : decodeJsString(text);
      default:
        return { ok: false, error: "Naməlum rejim." };
    }
  }, [mode, direction, text, urlStyle, sqlDialect, base64UrlSafe, base64Padding, jsQuote, jsForceUnicode]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Rejim" />
        <div className="flex flex-wrap gap-2 p-4">
          {ESCAPE_MODES.map((candidate) => (
            <ToolButton
              key={candidate}
              size="chip"
              selected={candidate === mode}
              onClick={() => setMode(candidate)}
            >
              {ESCAPE_MODE_LABELS[candidate]}
            </ToolButton>
          ))}
        </div>
        <div className="border-t border-rule px-4 py-3">
          <p className="text-ios-footnote text-muted">{ESCAPE_MODE_WHY[mode]}</p>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Mətn"
          action={
            <>
              <ToolSegmented
                label="İstiqamət"
                value={direction}
                onChange={setDirection}
                options={[
                  { value: "encode", label: "Qaçır" },
                  { value: "decode", label: "Geri aç" },
                ]}
              />
              <ToolButton size="chip" onClick={() => setText(SAMPLE_TEXT)}>
                Nümunə
              </ToolButton>
            </>
          }
        />

        {mode === "url" && (
          <div className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3">
            <ToolSegmented
              label="URL forması"
              value={urlStyle}
              onChange={setUrlStyle}
              options={[
                { value: "component", label: "Komponent" },
                { value: "full", label: "Tam URL" },
              ]}
            />
          </div>
        )}

        {mode === "sql" && (
          <div className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3">
            <ToolSegmented
              label="Baza qaydası"
              value={sqlDialect}
              onChange={setSqlDialect}
              options={[
                { value: "standard", label: "Standart (PostgreSQL, SQLite)" },
                { value: "mysql", label: "MySQL" },
              ]}
            />
          </div>
        )}

        {mode === "base64" && (
          <div className="flex flex-wrap items-center gap-4 border-b border-rule px-4 py-3 font-ui text-xs text-muted">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={base64UrlSafe}
                onChange={(event) => setBase64UrlSafe(event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              URL-safe (+/ əvəzinə -_)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={base64Padding}
                onChange={(event) => setBase64Padding(event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Padding (=)
            </label>
          </div>
        )}

        {mode === "js" && (
          <div className="flex flex-wrap items-center gap-4 border-b border-rule px-4 py-3">
            <ToolSegmented
              label="Dırnaq"
              value={jsQuote}
              onChange={setJsQuote}
              options={[
                { value: "'", label: "Tək dırnaq" },
                { value: '"', label: "Qoşa dırnaq" },
              ]}
            />
            <label className="flex items-center gap-2 font-ui text-xs text-muted">
              <input
                type="checkbox"
                checked={jsForceUnicode}
                onChange={(event) => setJsForceUnicode(event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              ASCII-dən kənar hər simvolu \u ilə yaz
            </label>
          </div>
        )}

        <div className="p-4">
          <ToolField label={direction === "encode" ? "Xam mətn" : "Qaçırılmış mətn"} htmlFor="escape-input">
            <ToolTextArea
              id="escape-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              className="font-mono"
              placeholder={direction === "encode" ? "Qaçırılacaq mətni yaz…" : "Geri açılacaq mətni yapışdır…"}
            />
          </ToolField>
        </div>
      </ToolPanel>

      {outcome.ok ? (
        <ToolResultPanel
          title="Nəticə"
          hint={ESCAPE_MODE_LABELS[mode]}
          action={<CopyButton value={outcome.text} label="nəticəni kopyala" />}
        >
          <div className="p-4">
            <ToolOutput>{outcome.text || ""}</ToolOutput>
          </div>
        </ToolResultPanel>
      ) : (
        <ToolNote tone="accent" title="Alınmadı">
          {outcome.error}
        </ToolNote>
      )}
    </div>
  );
}
