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
  ToolSelect,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { formatBytes, formatNumber } from "../shared/format";
import {
  byteLength,
  formatSql,
  LARGE_INPUT_BYTES,
  minifySql,
  type SqlFormatResult,
  type SqlIndentOption,
  type SqlKeywordCase,
} from "../lib/sql";

type Mode = "format" | "minify";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "format", label: "Formatla" },
  { value: "minify", label: "Sıxışdır" },
];

/*
 * The sample is not decoration: it carries a string literal that contains the
 * words SELECT and FROM, a line comment, a CASE and a sub-query, so the first
 * click shows what the tool promises — that those four survive untouched —
 * instead of a query that would also survive a find-and-replace.
 */
const SAMPLE_TEXT =
  "select u.id, u.ad, coalesce(o.mebleg, 0) as mebleg, case when o.veziyyet = 'odenilib' " +
  "then 'ödənilib' else 'gözləyir' end as status from istifadeciler u " +
  "left join sifarisler o on o.istifadeci_id = u.id and o.silinib = false " +
  "-- axtarış sətrinin özündə də açar sözlər var\n" +
  "where u.aktiv = true and u.ad like '%select * from%' " +
  "and u.id in (select istifadeci_id from abunelikler where bitis_tarixi > now()) " +
  "order by mebleg desc limit 20";

/** Kept outside the component so the memo below is one call and no algorithm. */
function computeResult(
  input: string,
  mode: Mode,
  keywordCase: SqlKeywordCase,
  indent: SqlIndentOption,
): SqlFormatResult | null {
  if (input.trim() === "") return null;
  const options = { keywordCase, indent };
  return mode === "minify" ? minifySql(input, options) : formatSql(input, options);
}

const emptyHintClass =
  "flex min-h-64 flex-1 items-center justify-center rounded border border-dashed " +
  "border-rule px-4 text-center font-ui text-sm text-muted";

export function SqlTool() {
  const [mode, setMode] = useState<Mode>("format");
  const [keywordCase, setKeywordCase] = useState<SqlKeywordCase>("upper");
  const [indent, setIndent] = useState<SqlIndentOption>("2");
  const [input, setInput] = useState("");

  const result = useMemo(
    () => computeResult(input, mode, keywordCase, indent),
    [input, mode, keywordCase, indent],
  );

  const stats = result?.ok ? result.stats : null;
  /* Measured against the text on screen, so neither mode can advertise the
     other's saving — formatting nearly always makes the query bigger. */
  const change =
    stats && stats.inputBytes > 0
      ? ((stats.inputBytes - stats.outputBytes) / stats.inputBytes) * 100
      : null;

  return (
    <div className="mt-8">
      <ToolSegmented label="Rejim" options={MODE_OPTIONS} value={mode} onChange={setMode} />

      <ToolPanel className="mt-3">
        <ToolPanelHeader
          title="SQL"
          action={
            <>
              <label className="flex items-center gap-1.5 font-ui text-[11px] text-muted">
                Açar sözlər
                <ToolSelect
                  id="sql-case"
                  value={keywordCase}
                  onChange={(event) =>
                    setKeywordCase(event.target.value as SqlKeywordCase)
                  }
                >
                  <option value="upper">BÖYÜK</option>
                  <option value="lower">kiçik</option>
                  <option value="preserve">Olduğu kimi</option>
                </ToolSelect>
              </label>

              {/* Indent is meaningless in the minified output, so it is not
                  offered there rather than offered and ignored. */}
              {mode === "format" && (
                <label className="flex items-center gap-1.5 font-ui text-[11px] text-muted">
                  Girinti
                  <ToolSelect
                    id="sql-indent"
                    value={indent}
                    onChange={(event) => setIndent(event.target.value as SqlIndentOption)}
                  >
                    <option value="2">2 boşluq</option>
                    <option value="4">4 boşluq</option>
                    <option value="tab">Tab</option>
                  </ToolSelect>
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
              label="Sorğu"
              htmlFor="sql-input"
              hint={
                <span className="tabular-nums">
                  {input.length} simvol · {formatBytes(byteLength(input))}
                </span>
              }
            >
              <ToolTextArea
                id="sql-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="select id, ad from istifadeciler where aktiv = true"
                className="min-h-64!"
                spellCheck={false}
              />
            </ToolField>

            {byteLength(input) > LARGE_INPUT_BYTES && (
              <ToolNote tone="info" title="Böyük giriş" className="mt-4">
                Sorğu {formatBytes(byteLength(input))} ölçüsündədir: emal davam edir, amma bu
                qədər böyük mətndə brauzer bir az yavaşlaya bilər.
              </ToolNote>
            )}

            {/* A lexical error is the only thing the tool refuses to work
                around: an unclosed quote makes every token after it a guess. */}
            {result && !result.ok && (
              <ToolNote
                tone="accent"
                title={`Sətir ${result.error.line}, sütun ${result.error.column}`}
                className="mt-4"
              >
                {result.error.message}
              </ToolNote>
            )}

            <ToolNote tone="info" title="Nəyə toxunulmur" className="mt-4">
              Dırnaq içindəki mətn və şərhlər olduğu kimi köçürülür: orada yazılmış
              açar söz formatlanmır. Sorğu brauzerdə emal olunur, serverə göndərilmir.
            </ToolNote>
          </div>

          <ToolResultPanel
            title={mode === "minify" ? "Sıxışdırılmış" : "Formatlanmış"}
            action={
              <CopyButton
                value={result?.ok ? result.output : ""}
                label="nəticəni kopyala"
                doneLabel="kopyalandı"
                disabled={!result?.ok}
                className="shrink-0"
              />
            }
            className="flex flex-col"
          >
            <div className="flex min-w-0 flex-1 flex-col p-3">
              {result?.ok ? (
                <>
                  <ToolOutput className="min-h-64 flex-1">{result.output}</ToolOutput>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <ToolStat label="İfadə sayı" value={formatNumber(result.stats.statements)} />
                    <ToolStat label="Sətir sayı" value={formatNumber(result.stats.lines)} />
                    <ToolStat
                      label="Maks. yuva dərinliyi"
                      value={formatNumber(result.stats.maxDepth)}
                      note={result.stats.maxDepth > 2 ? "dərin iç-içə sorğu" : undefined}
                      tone={result.stats.maxDepth > 2 ? "warning" : "default"}
                    />
                    <ToolStat label="İlkin ölçü" value={formatBytes(result.stats.inputBytes)} />
                    <ToolStat label="Nəticə ölçüsü" value={formatBytes(result.stats.outputBytes)} />
                    {change !== null && (
                      <ToolStat
                        label={change < 0 ? "Artım" : "Qazanc"}
                        value={`${formatNumber(Math.abs(change), 1)}%`}
                        tone={change > 0 ? "accent" : "default"}
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className={emptyHintClass}>
                  {result
                    ? "Giriş düzəldikdən sonra nəticə burada görünəcək."
                    : "Sol tərəfə SQL sorğusu yapışdır."}
                </div>
              )}
            </div>
          </ToolResultPanel>
        </div>
      </ToolPanel>
    </div>
  );
}
