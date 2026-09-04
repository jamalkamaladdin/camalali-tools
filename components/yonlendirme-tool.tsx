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
import { ToolSegmented, ToolTabs, type ToolTabItem } from "./tabs";
import {
  generateAll,
  parseRedirectInput,
  type OutputFormat,
  type RedirectStatus,
} from "../lib/yonlendirme";

/*
 * The widget's only job is to read a text box and hand its lines to
 * `yonlendirme.ts`. Parsing, escaping and the four config dialects are all
 * pure string work and live there so the check suite can pin every one of
 * them down without a DOM.
 */

type StatusOption = "301" | "302";

const STATUS_OPTIONS: { value: StatusOption; label: string }[] = [
  { value: "301", label: "301 (daimi)" },
  { value: "302", label: "302 (müvəqqəti)" },
];

const FORMAT_LABELS: Record<OutputFormat, string> = {
  nginx: "nginx",
  apache: "Apache (.htaccess)",
  caddy: "Caddy",
  nextjs: "Next.js",
};

const SAMPLE_TEXT = ["/kohne-sehife  /yeni-sehife", "/bloq/*  /yazi/*"].join("\n");

const EMPTY_HINT =
  "Sol tərəfə köhnə və yeni ünvan cütlərini yaz — konfiqurasiya burada görünəcək.";

export function YonlendirmeTool() {
  const [inputText, setInputText] = useState("");
  const [statusOption, setStatusOption] = useState<StatusOption>("301");
  const [normalizeSlash, setNormalizeSlash] = useState(false);

  const status: RedirectStatus = statusOption === "301" ? 301 : 302;

  const parsed = useMemo(
    () => parseRedirectInput(inputText, { normalizeTrailingSlash: normalizeSlash }),
    [inputText, normalizeSlash],
  );

  const outputs = useMemo(
    () => generateAll(parsed.rules, status),
    [parsed.rules, status],
  );

  const tabs: ToolTabItem[] = (Object.keys(FORMAT_LABELS) as OutputFormat[]).map((format) => ({
    id: format,
    label: FORMAT_LABELS[format],
    content: <OutputPane text={outputs[format]} />,
  }));

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Yönləndirmə"
          action={
            <>
              <ToolSegmented
                label="Kod"
                options={STATUS_OPTIONS}
                value={statusOption}
                onChange={setStatusOption}
              />
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                <input
                  type="checkbox"
                  checked={normalizeSlash}
                  onChange={(event) => setNormalizeSlash(event.target.checked)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                Sondakı /-i normallaşdır
              </label>
              <ToolButton size="chip" onClick={() => setInputText(SAMPLE_TEXT)}>
                Nümunə
              </ToolButton>
              <ToolButton
                size="chip"
                onClick={() => setInputText("")}
                disabled={inputText === ""}
              >
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-2">
          <div>
            <ToolField
              label="Köhnə → yeni ünvan"
              htmlFor="yonlendirme-input"
              hint={<span className="tabular-nums">{parsed.rules.length} qayda</span>}
              note="Hər sətirdə bir cüt, aralarında boşluq və ya tab: /kohne  /yeni. Joker üçün sonuna * qoy: /bloq/* /yazi/*"
            >
              <ToolTextArea
                id="yonlendirme-input"
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                placeholder="/kohne-sehife  /yeni-sehife"
                spellCheck={false}
                className="min-h-56!"
              />
            </ToolField>

            {parsed.errors.length > 0 && (
              <ToolNote tone="accent" title="Bu sətirlər oxunmadı" className="mt-4">
                <ul className="space-y-1">
                  {parsed.errors.map((error) => (
                    <li key={error.line}>
                      Sətir {error.line}: {error.message}{" "}
                      <span className="text-muted">(«{error.raw.trim()}»)</span>
                    </li>
                  ))}
                </ul>
              </ToolNote>
            )}
          </div>

          <ToolTabs idPrefix="yonlendirme" items={tabs} />
        </div>
      </ToolPanel>
    </div>
  );
}

function OutputPane({ text }: { text: string }) {
  if (text === "") {
    return (
      <div className="flex min-h-56 items-center justify-center rounded border border-dashed border-rule px-4 text-center font-ui text-sm text-muted">
        {EMPTY_HINT}
      </div>
    );
  }

  return (
    <ToolResultPanel
      title="Konfiqurasiya"
      action={<CopyButton value={text} label="kopyala" doneLabel="kopyalandı" />}
    >
      <ToolOutput className="m-3 max-h-96 overflow-y-auto">{text}</ToolOutput>
    </ToolResultPanel>
  );
}
