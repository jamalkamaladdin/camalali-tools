"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { formatBytes } from "../shared/format";
import {
  ToolButton,
  ToolField,
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
  beautifyCss,
  CSS_MINIFY_RULE_LABELS,
  CSS_MINIFY_RULES,
  minifyCss,
  type CssMinifyRule,
} from "../lib/css-sixisdirici";

/*
 * Written to demonstrate all eight rules at once: a comment that must go, a
 * `/*!`-style rule is not included here on purpose (the checkbox grid below
 * already explains it), an `@media` condition whose `0px` must survive next
 * to a declaration whose `0px` must not, a colour long enough to shorten,
 * and a trailing semicolon before the closing brace.
 */
const SAMPLE_CSS = `/* card component */
.card  {
  color:   #ffffff;
  margin: 0px  0.5em;
  border: 1px solid   red;
}

@media (min-width: 0px) {
  .card { padding: 0px; }
}
`;

function ruleSetFrom(rules: Iterable<CssMinifyRule>): Set<CssMinifyRule> {
  return new Set(rules);
}

export function CssSixisdiriciTool() {
  const [source, setSource] = useState(SAMPLE_CSS);
  const [enabledRules, setEnabledRules] = useState<Set<CssMinifyRule>>(() =>
    ruleSetFrom(CSS_MINIFY_RULES),
  );
  const [mode, setMode] = useState<"sixisdir" | "gozellesdir">("sixisdir");

  const toggleRule = (rule: CssMinifyRule) => {
    setEnabledRules((prev) => {
      const next = new Set(prev);
      if (next.has(rule)) {
        next.delete(rule);
      } else {
        next.add(rule);
      }
      return next;
    });
  };

  const minifyResult = useMemo(
    () => minifyCss(source, enabledRules),
    [source, enabledRules],
  );
  const beautified = useMemo(() => beautifyCss(source), [source]);

  const output = mode === "sixisdir" ? minifyResult.output : beautified;
  const savingsLabel =
    minifyResult.inputBytes > 0
      ? `${minifyResult.savingsPercent >= 0 ? "-" : "+"}${Math.abs(minifyResult.savingsPercent).toFixed(1)}%`
      : "";

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Rejim"
          action={
            <ToolSegmented
              label="Rejim"
              value={mode}
              onChange={setMode}
              options={[
                { value: "sixisdir", label: "Sıxışdır" },
                { value: "gozellesdir", label: "Gözəlləşdir" },
              ]}
            />
          }
        />
        {mode === "sixisdir" && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2 p-4">
            {CSS_MINIFY_RULES.map((rule) => (
              <label key={rule} className="flex items-start gap-2 font-ui text-xs text-muted">
                <input
                  type="checkbox"
                  checked={enabledRules.has(rule)}
                  onChange={() => toggleRule(rule)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span>{CSS_MINIFY_RULE_LABELS[rule]}</span>
              </label>
            ))}
          </div>
        )}
        {mode === "gozellesdir" && (
          <div className="p-4">
            <ToolNote>
              Gözəlləşdirmə hər bəyanatı öz sətrinə çıxarır və girinti qoyur: heç bir bayt
              silinmir, yalnız yenidən formatlanır.
            </ToolNote>
          </div>
        )}
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Mənbə CSS"
          action={
            <ToolButton size="chip" onClick={() => setSource(SAMPLE_CSS)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="CSS mətni" htmlFor="css-sixisdirici-source">
            <ToolTextArea
              id="css-sixisdirici-source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              rows={12}
              spellCheck={false}
              placeholder=".sinif { xassə: dəyər; }"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {mode === "sixisdir" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ToolStat label="Əvvəl" value={formatBytes(minifyResult.inputBytes)} />
          <ToolStat label="Sonra" value={formatBytes(minifyResult.outputBytes)} tone="accent" />
          <ToolStat label="Qazanc" value={savingsLabel} tone="accent" />
          <ToolStat
            label="Bəyanat sayı"
            value={`${minifyResult.declarationCountAfter}/${minifyResult.declarationCountBefore}`}
            note="əvvəl/sonra sayı eynidirsə heç nə itməyib"
          />
        </div>
      )}

      {mode === "sixisdir" && !minifyResult.braceBalanced && source.trim() !== "" && (
        <ToolNote tone="accent" title="Mötərizə balanslaşmır">
          Girişdə açılan və bağlanan <code>{"{"}</code>/<code>{"}"}</code> sayı bərabər deyil:
          nəticə yenə göstərilir, amma etibarlı CSS olmaya bilər.
        </ToolNote>
      )}

      <ToolResultPanel
        title="Nəticə"
        hint={mode === "sixisdir" ? `${minifyResult.applied.length} qayda tətbiq olundu` : "yenidən formatlandı"}
        action={<CopyButton value={output} label="CSS-i kopyala" />}
      >
        <div className="space-y-3 p-4">
          <ToolOutput className="max-h-72 overflow-y-auto">{output || ""}</ToolOutput>

          {mode === "sixisdir" && minifyResult.ruleSavings.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full font-ui text-xs">
                <thead>
                  <tr className="border-b border-result-rule text-left text-muted">
                    <th scope="col" className="p-1.5 font-normal">
                      Qayda
                    </th>
                    <th scope="col" className="p-1.5 text-right font-normal">
                      Qazanc
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {minifyResult.ruleSavings.map((entry) => (
                    <tr key={entry.rule} className="border-b border-result-rule last:border-0">
                      <td className="p-1.5">{CSS_MINIFY_RULE_LABELS[entry.rule]}</td>
                      <td className="p-1.5 text-right tabular-nums">
                        {entry.bytesSaved > 0 ? `-${formatBytes(entry.bytesSaved)}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ToolResultPanel>

      <ToolNote>
        CSS heç yerə göndərilmir: bütün qaydalar mətn üzərində, brauzerin öz yaddaşında işləyir.
        Rəng, sıfır vahid və aparıcı sıfır qaydaları yalnız bəyanat gövdəsinə toxunur: seçici və{" "}
        <code>@media</code> şərti hər zaman toxunulmaz qalır.
      </ToolNote>
    </div>
  );
}
