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
  auditHreflang,
  buildHttpHeader,
  buildLinkTags,
  buildSitemapBlock,
  checkLanguageCode,
  parseHreflangHtml,
  type HreflangEntry,
  type HreflangIssue,
} from "../lib/hreflang";

type Mode = "qur" | "yoxla";
type OutputForm = "html" | "header" | "sitemap";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "qur", label: "Qurucu" },
  { value: "yoxla", label: "Yoxlayıcı" },
];

const OUTPUT_OPTIONS: { value: OutputForm; label: string }[] = [
  { value: "html", label: "HTML" },
  { value: "header", label: "HTTP başlıq" },
  { value: "sitemap", label: "Sitemap" },
];

const SAMPLE_SELF_URL = "https://sayt.com/az/";
const SAMPLE_ENTRIES: HreflangEntry[] = [
  { code: "az", url: "https://sayt.com/az/" },
  { code: "en", url: "https://sayt.com/en/" },
  { code: "ru", url: "https://sayt.com/ru/" },
  { code: "x-default", url: "https://sayt.com/" },
];

/*
 * Written to fail two audit checks on purpose: the second entry's language
 * code is the Britain trap, and the third entry's address is relative. A
 * clean sample here would demonstrate nothing about the audit mode.
 */
const SAMPLE_HTML = `<link rel="alternate" hreflang="en" href="https://sayt.com/en/" />
<link rel="alternate" hreflang="uk" href="https://sayt.com/gb/" />
<link rel="alternate" hreflang="ru" href="/ru/" />`;
const SAMPLE_CHECK_SELF_URL = "https://sayt.com/az/";

function IssueList({ issues }: { issues: HreflangIssue[] }) {
  if (issues.length === 0) {
    return <ToolNote tone="info">Tapılan problem yoxdur.</ToolNote>;
  }
  return (
    <div className="space-y-2">
      {issues.map((issue, index) => (
        <ToolNote
          key={index}
          tone={issue.severity === "xeta" ? "accent" : "info"}
          title={issue.severity === "xeta" ? "Xəta" : "Xəbərdarlıq"}
        >
          {issue.message}
        </ToolNote>
      ))}
    </div>
  );
}

export function HreflangTool() {
  const [mode, setMode] = useState<Mode>("qur");

  const [selfUrl, setSelfUrl] = useState(SAMPLE_SELF_URL);
  const [entries, setEntries] = useState<HreflangEntry[]>(SAMPLE_ENTRIES);
  const [outputForm, setOutputForm] = useState<OutputForm>("html");

  const validEntries = useMemo(
    () => entries.filter((entry) => entry.code.trim() !== "" && entry.url.trim() !== ""),
    [entries],
  );

  const trimmedSelfUrl = selfUrl.trim();

  const output = useMemo(() => {
    if (outputForm === "html") return buildLinkTags(validEntries);
    if (outputForm === "header") return buildHttpHeader(validEntries);
    return buildSitemapBlock(trimmedSelfUrl === "" ? "https://sayt.com/" : trimmedSelfUrl, validEntries);
  }, [outputForm, validEntries, trimmedSelfUrl]);

  const buildIssues = useMemo(
    () => auditHreflang(validEntries, trimmedSelfUrl === "" ? null : trimmedSelfUrl),
    [validEntries, trimmedSelfUrl],
  );

  const updateEntry = (index: number, patch: Partial<HreflangEntry>) =>
    setEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  const removeEntry = (index: number) => setEntries((prev) => prev.filter((_, i) => i !== index));
  const addEntry = () => setEntries((prev) => [...prev, { code: "", url: "" }]);
  const loadSample = () => {
    setSelfUrl(SAMPLE_SELF_URL);
    setEntries(SAMPLE_ENTRIES);
  };

  const [pasteText, setPasteText] = useState(SAMPLE_HTML);
  const [checkSelfUrl, setCheckSelfUrl] = useState(SAMPLE_CHECK_SELF_URL);

  const parsedEntries = useMemo(() => parseHreflangHtml(pasteText), [pasteText]);
  const trimmedCheckSelfUrl = checkSelfUrl.trim();
  const checkIssues = useMemo(
    () => auditHreflang(parsedEntries, trimmedCheckSelfUrl === "" ? null : trimmedCheckSelfUrl),
    [parsedEntries, trimmedCheckSelfUrl],
  );

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="hreflang"
          action={<ToolSegmented label="Rejim" options={MODE_OPTIONS} value={mode} onChange={setMode} />}
        />

        {mode === "qur" ? (
          <div className="space-y-4 p-4">
            <div className="flex items-end gap-2">
              <ToolField
                label="Bu səhifənin öz URL-i"
                hint="özünə istinad üçün"
                htmlFor="hreflang-self"
                className="flex-1"
              >
                <ToolInput
                  id="hreflang-self"
                  value={selfUrl}
                  onChange={(event) => setSelfUrl(event.target.value)}
                  placeholder="https://sayt.com/az/"
                />
              </ToolField>
              <ToolButton size="chip" onClick={loadSample}>
                Nümunə
              </ToolButton>
            </div>

            <div className="space-y-2">
              {entries.map((entry, index) => {
                const check = entry.code.trim() === "" ? null : checkLanguageCode(entry.code);
                return (
                  <div key={index} className="rounded border border-rule p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <ToolField label="Dil kodu" hint="ISO 639-1" className="w-32">
                        <ToolInput
                          value={entry.code}
                          onChange={(event) => updateEntry(index, { code: event.target.value })}
                          placeholder="az"
                          className="font-mono"
                          aria-label={`${index + 1}-ci sətrin dil kodu`}
                        />
                      </ToolField>
                      <ToolField label="URL" className="min-w-48 flex-1">
                        <ToolInput
                          value={entry.url}
                          onChange={(event) => updateEntry(index, { url: event.target.value })}
                          placeholder="https://sayt.com/az/"
                          className="font-mono"
                          aria-label={`${index + 1}-ci sətrin URL-i`}
                        />
                      </ToolField>
                      <ToolButton size="chip" onClick={() => updateEntry(index, { code: "x-default" })}>
                        x-default et
                      </ToolButton>
                      <ToolButton size="chip" onClick={() => removeEntry(index)}>
                        Sil
                      </ToolButton>
                    </div>
                    {check && (
                      <p
                        className={`mt-2 font-ui text-[11px]/5 ${check.ok ? "text-muted" : "text-accent-text"}`}
                      >
                        {check.ok ? check.label : check.problem}
                      </p>
                    )}
                  </div>
                );
              })}
              <ToolButton size="chip" onClick={addEntry}>
                Yeni sətir
              </ToolButton>
            </div>

            <div>
              <ToolLabel>Yoxlama</ToolLabel>
              <div className="mt-2">
                <IssueList issues={buildIssues} />
              </div>
            </div>

            <ToolResultPanel
              title="Nəticə"
              action={
                <>
                  <ToolSegmented
                    label="Çıxış forması"
                    options={OUTPUT_OPTIONS}
                    value={outputForm}
                    onChange={setOutputForm}
                  />
                  <CopyButton value={output} label="kopyala" />
                </>
              }
            >
              <ToolOutput className="m-3 break-all">{output || "—"}</ToolOutput>
            </ToolResultPanel>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="flex items-end gap-2">
              <ToolField label="hreflang teq bloku" htmlFor="hreflang-paste" className="flex-1">
                <ToolTextArea
                  id="hreflang-paste"
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  rows={6}
                  className="font-mono"
                  spellCheck={false}
                />
              </ToolField>
              <ToolButton size="chip" onClick={() => setPasteText(SAMPLE_HTML)}>
                Nümunə
              </ToolButton>
            </div>

            <ToolField
              label="Bu səhifənin öz URL-i"
              hint="özünə istinad üçün, opsional"
              htmlFor="hreflang-check-self"
            >
              <ToolInput
                id="hreflang-check-self"
                value={checkSelfUrl}
                onChange={(event) => setCheckSelfUrl(event.target.value)}
                placeholder="https://sayt.com/az/"
              />
            </ToolField>

            <ToolStat label="Tapılan sətir" value={parsedEntries.length} />

            <IssueList issues={checkIssues} />
          </div>
        )}
      </ToolPanel>
    </div>
  );
}
