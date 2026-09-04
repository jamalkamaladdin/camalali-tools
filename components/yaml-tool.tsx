"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolSegmented } from "./tabs";
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
import { formatNumber } from "../shared/format";
import {
  extractFrontmatter,
  jsonToYaml,
  summarise,
  yamlToJson,
  type IndentOption,
  type YamlIssue,
  type YamlSummary,
  type YamlWarning,
} from "../lib/yaml";

type Mode = "yaml-json" | "json-yaml" | "frontmatter";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "yaml-json", label: "YAML → JSON" },
  { value: "json-yaml", label: "JSON → YAML" },
  { value: "frontmatter", label: "Frontmatter" },
];

type ToolResult = {
  output: string;
  error: YamlIssue | null;
  warnings: YamlWarning[];
  summary: YamlSummary | null;
  /** How many YAML documents the input held; only the YAML side sets it. */
  documents: number;
  /** A sentence about the input itself, not about a failure. */
  note: string | null;
};

const EMPTY: ToolResult = {
  output: "",
  error: null,
  warnings: [],
  summary: null,
  documents: 0,
  note: null,
};

const YAML_SAMPLE = [
  "# nümunə konfiqurasiya",
  "servis: ödəniş-api",
  "versiya: 2",
  "aktiv: true",
  "portlar: [80, 443]",
  "mühit:",
  "  region: eu-central",
  "  replika: 3",
  "komanda:",
  "  - ad: Cəmalı",
  "    rol: backend",
  "  - ad: Aygün",
  "    rol: infra",
  "qeyd: |",
  "  Bu blok olduğu kimi saxlanılır.",
  "  İkinci sətir də daxil.",
].join("\n");

const JSON_SAMPLE = JSON.stringify(
  {
    servis: "ödəniş-api",
    versiya: 2,
    aktiv: true,
    portlar: [80, 443],
    "mühit": { region: "eu-central", replika: 3 },
    qeyd: "birinci sətir\nikinci sətir\n",
  },
  null,
  2,
);

const FRONTMATTER_SAMPLE = [
  "---",
  'title: "WebSocket nədir"',
  "slug: websocket-nedir",
  "tags: [şəbəkə, realtime]",
  "publishedAt: 2026-09-03",
  "draft: no",
  "---",
  "",
  "# WebSocket nədir",
  "",
  "Mətn burada başlayır və çevrilməyə qatılmır.",
].join("\n");

const SAMPLES: Record<Mode, string> = {
  "yaml-json": YAML_SAMPLE,
  "json-yaml": JSON_SAMPLE,
  frontmatter: FRONTMATTER_SAMPLE,
};

const INPUT_LABEL: Record<Mode, string> = {
  "yaml-json": "YAML",
  "json-yaml": "JSON",
  frontmatter: "Markdown faylı",
};

const OUTPUT_LABEL: Record<Mode, string> = {
  "yaml-json": "JSON",
  "json-yaml": "YAML",
  frontmatter: "Frontmatter → JSON",
};

/**
 * Kept outside the component so the memo only has to call one pure function.
 * Every branch returns the same shape, because the panel below draws one
 * layout and a mode that returned a different set of fields would need its
 * own.
 */
function computeResult(input: string, mode: Mode, indent: IndentOption): ToolResult {
  if (input.trim() === "") return EMPTY;

  if (mode === "json-yaml") {
    const converted = jsonToYaml(input);
    if (!converted.ok) return { ...EMPTY, error: converted.error };
    return {
      ...EMPTY,
      output: converted.output,
      summary: summarise(converted.value),
    };
  }

  if (mode === "frontmatter") {
    const split = extractFrontmatter(input);

    if (split.status === "missing") {
      return {
        ...EMPTY,
        note: "Faylın başında «---» ilə açılan blok tapılmadı — frontmatter ilk sətirdən başlamalıdır.",
      };
    }
    if (split.status === "unterminated") {
      return {
        ...EMPTY,
        note: "«---» ilə açılan blok bağlanmayıb — başlığın sonuna ikinci «---» sətrini əlavə et.",
      };
    }

    /* The slice is what gets parsed, but the visitor is looking at the whole
       file, so the offset moves every reported line back onto their own
       numbering. */
    const converted = yamlToJson(split.frontmatter, indent, {
      source: input,
      lineOffset: split.lineOffset,
    });
    const bodyLines = split.body.trim() === "" ? 0 : split.body.trim().split("\n").length;
    const note = `Gövdə toxunulmadı: ${formatNumber(bodyLines)} sətir mətn çevirmədən kənarda qaldı.`;

    if (!converted.ok) return { ...EMPTY, error: converted.error, note };
    return {
      output: converted.output,
      error: null,
      warnings: converted.warnings,
      summary: summarise(converted.value),
      documents: converted.documents,
      note,
    };
  }

  const converted = yamlToJson(input, indent);
  if (!converted.ok) return { ...EMPTY, error: converted.error };
  return {
    output: converted.output,
    error: null,
    warnings: converted.warnings,
    summary: summarise(converted.value),
    documents: converted.documents,
    note:
      converted.documents > 1
        ? `Sənəddə «---» ilə ayrılmış ${formatNumber(converted.documents)} hissə var — JSON-da onlar bir massivə yığıldı.`
        : null,
  };
}

/** Beyond this the list of warnings stops being a list and becomes a wall. */
const SHOWN_WARNINGS = 5;

const emptyHintClass =
  "flex min-h-64 flex-1 items-center justify-center rounded border border-dashed " +
  "border-rule px-4 text-center font-ui text-sm text-muted";

export function YamlTool() {
  const [mode, setMode] = useState<Mode>("yaml-json");
  const [indent, setIndent] = useState<IndentOption>("2");
  const [input, setInput] = useState("");

  const result = useMemo(() => computeResult(input, mode, indent), [input, mode, indent]);

  const lineCount = input === "" ? 0 : input.split("\n").length;
  const shown = result.warnings.slice(0, SHOWN_WARNINGS);
  const hidden = result.warnings.length - shown.length;

  return (
    <div className="mt-8">
      <ToolSegmented label="İstiqamət" options={MODE_OPTIONS} value={mode} onChange={setMode} />

      {/* The promise the tool makes, before anything is typed: this is a
          subset, and the parts outside it stop rather than guess. */}
      <ToolNote tone="accent" title="Dəstəklənən YAML" className="mt-3">
        Sənəd ayırıcısı (<code>---</code>), xəritə, siyahı, girinti, dırnaqlı və dırnaqsız mətn,
        şərh, <code>|</code> və <code>&gt;</code> blokları, bir sətirlik <code>[a, b]</code> və{" "}
        <code>{"{a: 1}"}</code> çevrilir. Anchor (<code>&amp;</code>), alias (<code>*</code>), teq (
        <code>!</code>), <code>&lt;&lt;</code> birləşdirmə açarı, mürəkkəb açar (<code>?</code>) və{" "}
        <code>%</code> direktivi çevrilmir — alət onları tanıyır və sətir nömrəsi ilə xəta verir,
        səssizcə yanlış nəticə vermir. Dəyər tipləri YAML 1.2 core sxeminə görə oxunur:{" "}
        <code>yes</code> və <code>no</code> mətndir, <code>true</code> və <code>false</code> buldur.
      </ToolNote>

      <ToolPanel className="mt-3">
        <ToolPanelHeader
          title={INPUT_LABEL[mode]}
          action={
            <>
              {mode !== "json-yaml" && (
                <label className="flex items-center gap-1.5 font-ui text-[11px] text-muted">
                  Girinti
                  <ToolSelect
                    id="yaml-indent"
                    value={indent}
                    onChange={(event) => setIndent(event.target.value as IndentOption)}
                  >
                    <option value="2">2 boşluq</option>
                    <option value="4">4 boşluq</option>
                    <option value="tab">Tab</option>
                  </ToolSelect>
                </label>
              )}

              <ToolButton size="chip" onClick={() => setInput(SAMPLES[mode])}>
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
              label={INPUT_LABEL[mode]}
              htmlFor="yaml-input"
              hint={
                <span className="tabular-nums">
                  {formatNumber(lineCount)} sətir · {formatNumber(input.length)} simvol
                </span>
              }
            >
              <ToolTextArea
                id="yaml-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={mode === "json-yaml" ? '{"açar": "dəyər"}' : "açar: dəyər"}
                className="min-h-64!"
                spellCheck={false}
              />
            </ToolField>

            {result.note && (
              <ToolNote tone="info" className="mt-4">
                {result.note}
              </ToolNote>
            )}

            {/* A warning is not a failure: the document converted, but one of
                its values would mean something else to a YAML 1.1 reader, and
                that difference is invisible in the output. */}
            {shown.length > 0 && (
              <ToolNote tone="accent" title="Oxunuşu dəyişə bilən dəyər" className="mt-4">
                <ul className="space-y-1.5">
                  {shown.map((warning) => (
                    <li key={`${warning.line}-${warning.text}`}>
                      <span className="font-ui text-xs tabular-nums text-muted">Sətir {warning.line}:</span>{" "}
                      {warning.text}
                    </li>
                  ))}
                </ul>
                {hidden > 0 && (
                  <p className="mt-2 font-ui text-[11px] tabular-nums text-muted">
                    Daha {formatNumber(hidden)} xəbərdarlıq var.
                  </p>
                )}
              </ToolNote>
            )}

            {/* The error stays under the input, where the text it points at is,
                and the right column keeps showing only produced output. */}
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

          <ToolResultPanel
            title={OUTPUT_LABEL[mode]}
            hint={
              result.documents > 1 ? (
                <span className="tabular-nums">{formatNumber(result.documents)} sənəd</span>
              ) : undefined
            }
            action={
              <CopyButton
                value={result.output}
                label="çıxışı kopyala"
                doneLabel="kopyalandı"
                className="shrink-0"
              />
            }
            className="flex flex-col"
          >
            <div className="flex min-w-0 flex-1 flex-col p-3">
              {result.output === "" ? (
                <div className={emptyHintClass}>
                  {result.error
                    ? "Giriş düzəldikdən sonra nəticə burada görünəcək."
                    : "Nəticə burada görünəcək."}
                </div>
              ) : (
                <ToolOutput className="min-h-64 flex-1 tabular-nums">{result.output}</ToolOutput>
              )}

              {result.summary && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <ToolStat label="Açar sayı" value={formatNumber(result.summary.keys)} />
                  <ToolStat label="Siyahı elementi" value={formatNumber(result.summary.items)} />
                  <ToolStat label="Maks. dərinlik" value={formatNumber(result.summary.maxDepth)} />
                </div>
              )}
            </div>
          </ToolResultPanel>
        </div>
      </ToolPanel>
    </div>
  );
}
