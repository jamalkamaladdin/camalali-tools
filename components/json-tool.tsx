"use client";

import { useMemo, useState, type ReactNode } from "react";
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
  ToolSelect,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { formatBytes, formatNumber } from "../shared/format";
import {
  analyseJson,
  byteLength,
  compareSize,
  findDuplicateKeys,
  formatJson,
  LARGE_INPUT_BYTES,
  type IndentOption,
  type JsonError,
  type JsonStats,
  type SizeChange,
} from "../lib/json";

/*
 * Structure kept from the source tool (camalali-dev's json-tool.tsx): a mode
 * switch, an indent/sort-keys toolbar, input and output side by side. Only the
 * dress changed — every surface and control below comes from
 * `src/components/tools/ui.tsx` and `tabs.tsx`, which is what makes this a
 * system field and a system segmented control rather than a generic rectangle.
 */

type Mode = "pretty" | "minify" | "validate";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "pretty", label: "Formatla" },
  { value: "minify", label: "Sıxışdır" },
  { value: "validate", label: "Yoxla" },
];

type ToolResult = {
  output: string;
  error: JsonError | null;
  stats: JsonStats | null;
  /** Measured against the text on screen, so no mode can advertise another's saving. */
  size: SizeChange | null;
  /** Keys `JSON.parse` collapsed — the tool's output cannot show they existed. */
  duplicateKeys: string[];
};

const SAMPLE_TEXT =
  '{"ad":"Cəmalı","dil":"Azərbaycan","xüsusiyyətlər":["sürətli","sadə","oxunaqlı"],"versiya":1.2,"aktiv":true,"qeyd":null}';


/**
 * Kept outside the component so `useMemo` only has to call one pure function.
 * "Yoxla" has no formatting mode of its own in src/lib — it reuses "pretty"
 * for the ok/error/stats triple and the UI simply chooses not to display the
 * reformatted text, only the validity and the shape it found.
 */
function computeResult(
  input: string,
  mode: Mode,
  indent: IndentOption,
  sortKeys: boolean,
): ToolResult {
  if (input.trim() === "") {
    return { output: "", error: null, stats: null, size: null, duplicateKeys: [] };
  }

  const formatted = formatJson(input, {
    mode: mode === "minify" ? "minify" : "pretty",
    indent,
    sortKeys,
  });
  if (!formatted.ok) {
    return {
      output: "",
      error: formatted.error,
      stats: null,
      size: null,
      duplicateKeys: [],
    };
  }

  return {
    output: formatted.output,
    error: null,
    stats: analyseJson(formatted.value, input),
    size: compareSize(input, formatted.output),
    // Only meaningful once the parse succeeded: the scan walks known-good JSON.
    duplicateKeys: findDuplicateKeys(input),
  };
}

const emptyHintClass =
  "flex min-h-64 flex-1 items-center justify-center rounded border border-dashed " +
  "border-rule px-4 text-center font-ui text-sm text-muted";

export function JsonTool() {
  const [mode, setMode] = useState<Mode>("pretty");
  const [indent, setIndent] = useState<IndentOption>("2");
  const [sortKeys, setSortKeys] = useState(false);
  const [input, setInput] = useState("");

  const result = useMemo(
    () => computeResult(input, mode, indent, sortKeys),
    [input, mode, indent, sortKeys],
  );

  const statGrid = result.stats && (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <ToolStat label="Açar sayı" value={formatNumber(result.stats.keyCount)} />
      <ToolStat label="Maks. dərinlik" value={formatNumber(result.stats.maxDepth)} />
      <ToolStat label="Massiv elementi" value={formatNumber(result.stats.arrayItemCount)} />
    </div>
  );

  let outputContent: ReactNode;
  if (result.error) {
    outputContent = (
      <div className={emptyHintClass}>Giriş düzəldikdən sonra nəticə burada görünəcək.</div>
    );
  } else if (mode === "validate") {
    outputContent = result.stats ? (
      <div className="space-y-4">
        <ToolNote tone="info" title="JSON etibarlıdır">
          Sintaksis düzgündür, giriş uğurla təhlil olundu.
        </ToolNote>
        {statGrid}
      </div>
    ) : (
      <div className={emptyHintClass}>Yoxlamaq üçün sol tərəfə JSON yaz.</div>
    );
  } else {
    outputContent = (
      <>
        <ToolOutput className="min-h-64 flex-1 tabular-nums">
          {result.output || "Nəticə burada görünəcək."}
        </ToolOutput>
        {result.stats && result.size && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ToolStat label="Açar sayı" value={formatNumber(result.stats.keyCount)} />
            <ToolStat label="Maks. dərinlik" value={formatNumber(result.stats.maxDepth)} />
            <ToolStat label="Massiv elementi" value={formatNumber(result.stats.arrayItemCount)} />
            <ToolStat label="İlkin ölçü" value={formatBytes(result.stats.originalBytes)} />
            {/* The size of the text beside these numbers. It used to be the
                minified size in every mode, so "Formatla" — which always makes
                the file bigger — reported a smaller file than it had produced. */}
            <ToolStat label="Nəticə ölçüsü" value={formatBytes(result.size.outputBytes)} />
            {/* Accent is for a win. Formatting is not one, and saying so is the
                point: the visitor gets the direction, not just a percentage. */}
            <ToolStat
              label={result.size.grew ? "Artım" : "Qazanc"}
              value={`${formatNumber(result.size.changePercent, 1)}%`}
              tone={result.size.grew ? "default" : "accent"}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="mt-8">
      <ToolSegmented label="Rejim" options={MODE_OPTIONS} value={mode} onChange={setMode} />

      <ToolPanel className="mt-3">
        {/* Indent and sort-keys live in the panel header row per the brief;
            mode has its own segmented control above the panel. */}
        <ToolPanelHeader
          title="JSON"
          action={
            <>
              {mode === "pretty" && (
                <label className="flex items-center gap-1.5 font-ui text-[11px] text-muted">
                  Girinti
                  <ToolSelect
                    id="json-indent"
                    value={indent}
                    onChange={(event) => setIndent(event.target.value as IndentOption)}
                  >
                    <option value="2">2 boşluq</option>
                    <option value="4">4 boşluq</option>
                    <option value="tab">Tab</option>
                  </ToolSelect>
                </label>
              )}

              {mode !== "validate" && (
                <label className="flex items-center gap-1.5 font-ui text-[11px] text-muted">
                  <input
                    type="checkbox"
                    checked={sortKeys}
                    onChange={(event) => setSortKeys(event.target.checked)}
                    className="size-3.5 accent-[var(--color-accent)]"
                  />
                  Əlifba sırası
                </label>
              )}

              <ToolButton size="chip" onClick={() => setInput(SAMPLE_TEXT)}>
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setInput("")} disabled={input === ""}>
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-2">
          <div>
            <ToolField
              label="JSON"
              htmlFor="json-input"
              hint={
                <span className="tabular-nums">
                  {input.length} simvol · {formatBytes(byteLength(input))}
                </span>
              }
            >
              <ToolTextArea
                id="json-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder='{"açar": "dəyər"}'
                className="min-h-64!"
              />
            </ToolField>

            {byteLength(input) > LARGE_INPUT_BYTES && (
              <ToolNote tone="info" title="Böyük giriş" className="mt-4">
                Giriş {formatBytes(byteLength(input))} ölçüsündədir — emal davam edir, amma bu
                qədər böyük mətndə brauzer bir az yavaşlaya bilər.
              </ToolNote>
            )}

            {/* A repeated key is not a syntax error, so it cannot ride on the
                error branch: the document parses, and the output simply no
                longer contains what was dropped. Same place as the error, so
                every mode shows it — including "Yoxla", which otherwise reports
                nothing but "JSON etibarlıdır". */}
            {result.duplicateKeys.length > 0 && (
              <ToolNote tone="accent" title="Təkrarlanan açar" className="mt-4">
                Bu açarlar eyni obyektdə birdən çox dəfə yazılıb:{" "}
                <strong className="font-semibold text-ink">
                  {result.duplicateKeys.join(", ")}
                </strong>
                . JSON oxunanda yalnız sonuncu dəyər saxlanılır, əvvəlkilər itir — nəticədə
                onlar görünməyəcək.
              </ToolNote>
            )}

            {/* Error stays inline under the input in every mode — the right
                column is reserved for a successful result. */}
            {result.error && (
              <div className="mt-4 space-y-3">
                <ToolNote
                  tone="accent"
                  title={`Sətir ${result.error.line}, sütun ${result.error.column}`}
                >
                  {result.error.message}
                </ToolNote>
                <ToolOutput className="tabular-nums">{result.error.snippet}</ToolOutput>
              </div>
            )}
          </div>

          {/* The right column is the only thing here the tool produced, so it
              is the only thing that leaves the input surface. The textarea and
              the header's indent/sort-keys controls stay where they were. */}
          <ToolResultPanel
            title={mode === "validate" ? "Nəticə" : "Çıxış"}
            action={
              mode === "validate" ? undefined : (
                <CopyButton
                  value={result.output}
                  label="çıxışı kopyala"
                  doneLabel="kopyalandı"
                  className="shrink-0"
                />
              )
            }
            className="flex flex-col"
          >
            <div className="flex min-w-0 flex-1 flex-col p-3">{outputContent}</div>
          </ToolResultPanel>
        </div>
      </ToolPanel>
    </div>
  );
}
