"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
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
  ToolStat,
  ToolTextArea,
} from "./ui";
import { ToolSegmented, ToolTabs, type ToolTabItem } from "./tabs";
import {
  buildSitemap,
  buildSitemapIndex,
  CHANGE_FREQ_VALUES,
  MAX_URLS_PER_FILE,
  parseUrlList,
  splitEntries,
  type ChangeFreq,
  type SitemapDefaults,
} from "../lib/sitemap-qurucu";

/*
 * The "write nothing" choice has to sit alongside the seven real
 * change-frequencies and the two lastmod modes below, and none of those are
 * spellable inside `ChangeFreq` itself — a control value that can also mean
 * "no default" needs a string the type doesn't already claim.
 */
const SKIP_VALUE = "yazma";

const CHANGE_FREQ_LABELS: Record<ChangeFreq, string> = {
  always: "Həmişə",
  hourly: "Saatda bir",
  daily: "Gündə bir",
  weekly: "Həftədə bir",
  monthly: "Ayda bir",
  yearly: "İldə bir",
  never: "Heç vaxt",
};

type LastmodMode = "bu-gun" | "el-ile" | typeof SKIP_VALUE;

const LASTMOD_MODE_OPTIONS: { value: LastmodMode; label: string }[] = [
  { value: "bu-gun", label: "Bu gün" },
  { value: "el-ile", label: "Əl ilə" },
  { value: SKIP_VALUE, label: "Yazma" },
];

/* A worked example rather than a blank box: one root URL, one with a
   `lastmod` column, one with a query string whose `&` is the textbook case
   for XML escaping, and one with an Azerbaijani letter to show the
   percent-encoding this tool does on its own. */
const SAMPLE_URL_LIST = `https://sayt.com/
https://sayt.com/bloq/websocket-nedir,2026-01-15
https://sayt.com/axtar?kateqoriya=api&sirala=tarix
https://sayt.com/haqqımızda`;

const MAX_LISTED_ISSUES = 200;

function downloadXml(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SitemapQurucuTool() {
  const [text, setText] = useState(SAMPLE_URL_LIST);
  const [changefreqMode, setChangefreqMode] = useState<ChangeFreq | typeof SKIP_VALUE>(SKIP_VALUE);
  const [priorityText, setPriorityText] = useState("");
  const [lastmodMode, setLastmodMode] = useState<LastmodMode>(SKIP_VALUE);
  const [lastmodManual, setLastmodManual] = useState("");
  const [baseUrlText, setBaseUrlText] = useState("");

  const defaults: SitemapDefaults = useMemo(() => {
    const changefreq = changefreqMode === SKIP_VALUE ? null : changefreqMode;

    const priorityNumber = priorityText.trim() === "" ? null : Number(priorityText);
    const priority = priorityNumber !== null && Number.isFinite(priorityNumber) ? priorityNumber : null;

    /* `new Date()` only runs once the visitor has actively switched away
       from the default skip mode, so the first render — server and client
       alike — never depends on the clock. Everything after that switch is a
       client-only re-render, where the browser's own date is the correct
       one to read. */
    let lastmod: string | null = null;
    if (lastmodMode === "bu-gun") lastmod = todayIsoDate();
    else if (lastmodMode === "el-ile") lastmod = lastmodManual.trim() === "" ? null : lastmodManual.trim();

    return { changefreq, priority, lastmod };
  }, [changefreqMode, priorityText, lastmodMode, lastmodManual]);

  const parsed = useMemo(() => parseUrlList(text, defaults), [text, defaults]);
  const chunks = useMemo(() => splitEntries(parsed.entries), [parsed.entries]);
  const needsSplit = chunks.length > 1;

  const files = useMemo(() => {
    if (!needsSplit) return [{ name: "sitemap.xml", content: buildSitemap(parsed.entries) }];
    return chunks.map((chunk, index) => ({
      name: `sitemap-${index + 1}.xml`,
      content: buildSitemap(chunk),
    }));
  }, [needsSplit, chunks, parsed.entries]);

  const derivedBase = useMemo(() => {
    const first = parsed.entries[0];
    if (!first) return "";
    try {
      return new URL(first.loc).origin;
    } catch {
      return "";
    }
  }, [parsed.entries]);

  const effectiveBase = (baseUrlText.trim() === "" ? derivedBase : baseUrlText.trim()).replace(/\/+$/, "");

  const indexFile = useMemo(() => {
    if (!needsSplit || effectiveBase === "") return null;
    return {
      name: "sitemap-index.xml",
      content: buildSitemapIndex(files.map((file) => file.name), effectiveBase, defaults.lastmod),
    };
  }, [needsSplit, effectiveBase, files, defaults.lastmod]);

  const allFiles = indexFile ? [indexFile, ...files] : files;

  const robotsLine =
    effectiveBase === ""
      ? null
      : `Sitemap: ${effectiveBase}/${indexFile ? indexFile.name : files[0].name}`;

  const errorCount = parsed.issues.filter((issue) => issue.severity === "xeta").length;
  const warningCount = parsed.issues.filter((issue) => issue.severity === "xeberdarliq").length;
  const listedIssues = parsed.issues.slice(0, MAX_LISTED_ISSUES);
  const hiddenIssueCount = parsed.issues.length - listedIssues.length;

  const tabs: ToolTabItem[] = allFiles.map((file) => ({
    id: file.name,
    label: file.name,
    hint: file.name === "sitemap-index.xml" ? undefined : String(file.content.split("<url>").length - 1),
    content: (
      <ToolResultPanel
        title={file.name}
        action={
          <div className="flex items-center gap-2">
            <CopyButton value={file.content} label="kopyala" />
            <ToolButton size="chip" onClick={() => downloadXml(file.name, file.content)}>
              endir
            </ToolButton>
          </div>
        }
      >
        <ToolOutput className="m-3 max-h-96 overflow-y-auto">{file.content}</ToolOutput>
      </ToolResultPanel>
    ),
  }));

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="sitemap.xml qurucusu" hint="URL siyahısı → sitemap.xml" />

        <div className="space-y-4 p-4">
          <div className="rounded border border-rule p-3">
            <p className="mb-3 font-ui text-[11px] text-muted">Ümumi ayarlar (bütün URL-lərə tətbiq olunur)</p>
            <div className="flex flex-wrap items-end gap-3">
              <ToolField label="changefreq" className="w-40">
                <ToolSelect
                  value={changefreqMode}
                  onChange={(event) => setChangefreqMode(event.target.value as ChangeFreq | typeof SKIP_VALUE)}
                >
                  <option value={SKIP_VALUE}>Yazma</option>
                  {CHANGE_FREQ_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {CHANGE_FREQ_LABELS[value]}
                    </option>
                  ))}
                </ToolSelect>
              </ToolField>

              <ToolField label="priority" hint="0.0–1.0" className="w-28">
                <ToolInput
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={priorityText}
                  onChange={(event) => setPriorityText(event.target.value)}
                  placeholder="yazma"
                />
              </ToolField>

              <ToolField label="lastmod" className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ToolSegmented options={LASTMOD_MODE_OPTIONS} value={lastmodMode} onChange={setLastmodMode} />
                  {lastmodMode === "el-ile" && (
                    <ToolInput
                      value={lastmodManual}
                      onChange={(event) => setLastmodManual(event.target.value)}
                      placeholder="2026-01-01"
                      className="w-36 font-mono"
                      aria-label="Əl ilə lastmod tarixi"
                    />
                  )}
                </div>
              </ToolField>
            </div>
          </div>

          <ToolField
            label="URL siyahısı"
            htmlFor="sitemap-urls"
            note="Hər sətirdə bir URL. İstəsən vergül və ya tab ilə ikinci sütunda lastmod tarixi yaz: https://sayt.com/,2026-01-01"
          >
            <ToolTextArea
              id="sitemap-urls"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={10}
              className="font-mono"
              spellCheck={false}
            />
          </ToolField>

          <ToolField
            label="Sitemap qovluğunun ünvanı"
            htmlFor="sitemap-base"
            hint="sitemap-index.xml və robots.txt sətri üçün"
          >
            <ToolInput
              id="sitemap-base"
              value={baseUrlText}
              onChange={(event) => setBaseUrlText(event.target.value)}
              placeholder={derivedBase || "https://sayt.com"}
              className="font-mono"
            />
          </ToolField>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ToolStat label="Keçərli URL" value={parsed.entries.length} />
            <ToolStat label="Atılan təkrar" value={parsed.duplicates} />
            <ToolStat label="Xəbərdarlıq" value={warningCount} tone={warningCount > 0 ? "warning" : "default"} />
            <ToolStat label="Xəta" value={errorCount} tone={errorCount > 0 ? "warning" : "default"} />
          </div>

          {parsed.issues.length > 0 && (
            <div className="rounded border border-rule p-3">
              <p className="mb-2 font-ui text-[11px] text-muted">Sətir-sətir qeydlər</p>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {listedIssues.map((issue, index) => (
                  <li
                    key={index}
                    className={`font-ui text-[11px]/5 ${
                      issue.severity === "xeta" ? "font-semibold text-accent-text" : "text-muted"
                    }`}
                  >
                    {issue.line === 0 ? "ayarlar" : `sətir ${issue.line}`}: {issue.message}
                  </li>
                ))}
              </ul>
              {hiddenIssueCount > 0 && (
                <p className="mt-2 font-ui text-[11px] text-muted">
                  + daha {hiddenIssueCount} qeyd (siyahı çox uzun olduğu üçün göstərilmir)
                </p>
              )}
            </div>
          )}

          {needsSplit && (
            <ToolNote tone="info" title="Fayl bölündü">
              {parsed.entries.length.toLocaleString("az-AZ")} URL {MAX_URLS_PER_FILE.toLocaleString("az-AZ")} URL
              həddini keçdiyi üçün {files.length} ayrı sitemap faylına bölündü (sitemaps.org protokolunun 50.000
              URL / 50 MB həddi). {indexFile ? "Hamısı sitemap-index.xml faylında sadalanıb." : "sitemap-index.xml üçün yuxarıda qovluq ünvanını doldur."}
            </ToolNote>
          )}

          {tabs.length > 0 && (
            <ToolTabs items={tabs} idPrefix="sitemap-output" />
          )}

          {robotsLine && (
            <ToolField label="robots.txt-ə əlavə et" hint="Sitemap:">
              <div className="flex items-center gap-2">
                <ToolOutput className="flex-1">{robotsLine}</ToolOutput>
                <CopyButton value={robotsLine} label="kopyala" />
              </div>
            </ToolField>
          )}

          <ToolNote tone="accent" title="priority və changefreq Google-da işləmir">
            Google özü açıq bildirib ki, sitemap-dəki <code>priority</code> və{" "}
            <code>changefreq</code> sahələrini nəzərə almır. Bu sahələr digər axtarış
            sistemləri üçün saxlanılır. Sitemap ümumiyyətlə indeksləşməni zəmanət etmir: botun səhifəni tapmasını
            asanlaşdırır, tapılmasını məcbur etmir. Yapışdırdığın heç nə serverə getmir, hamısı brauzerdə qurulur.
          </ToolNote>
        </div>
      </ToolPanel>
    </div>
  );
}
