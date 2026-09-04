"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { formatBytes } from "../shared/format";
import {
  ToolField,
  ToolButton,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import {
  JS_MINIFY_RULE_LABELS,
  JS_MINIFY_RULES,
  minifyJs,
  type JsMinifyRule,
} from "../lib/js-sixisdirici";

/*
 * Written to demonstrate every rule at once: a comment that must go, a
 * preserved license comment, the division-vs-regex pair named in the
 * tool's own FAQ, and a `return` that must never be joined to the value
 * after it.
 */
const SAMPLE_JS = `// @license MIT
function ratio(a, b) {
  // plain comment, dropped
  const value = a / b;
  const pattern = /^\\d+$/;
  if (value > 0) {
    return
  }
  return value;
}
`;

function ruleSetFrom(rules: Iterable<JsMinifyRule>): Set<JsMinifyRule> {
  return new Set(rules);
}

export function JsSixisdiriciTool() {
  const [source, setSource] = useState(SAMPLE_JS);
  const [enabledRules, setEnabledRules] = useState<Set<JsMinifyRule>>(() =>
    ruleSetFrom(JS_MINIFY_RULES),
  );

  const toggleRule = (rule: JsMinifyRule) => {
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

  const result = useMemo(() => minifyJs(source, enabledRules), [source, enabledRules]);

  const savingsLabel =
    result.syntaxOk && result.inputBytes > 0
      ? `${result.savingsPercent >= 0 ? "-" : "+"}${Math.abs(result.savingsPercent).toFixed(1)}%`
      : "";

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Qaydalar"
          hint={`${enabledRules.size}/${JS_MINIFY_RULES.length} aktiv`}
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-2 p-4">
          {JS_MINIFY_RULES.map((rule) => (
            <label key={rule} className="flex items-start gap-2 font-ui text-xs text-muted">
              <input
                type="checkbox"
                checked={enabledRules.has(rule)}
                onChange={() => toggleRule(rule)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
              />
              <span>{JS_MINIFY_RULE_LABELS[rule]}</span>
            </label>
          ))}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Mənbə kod"
          action={
            <ToolButton size="chip" onClick={() => setSource(SAMPLE_JS)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="JavaScript mətni" htmlFor="js-sixisdirici-source">
            <ToolTextArea
              id="js-sixisdirici-source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              rows={12}
              spellCheck={false}
              placeholder="function f() { ... }"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {!result.syntaxOk && source.trim() !== "" && (
        <ToolNote tone="accent" title="Nəticə göstərilmədi">
          {result.syntaxError} Orijinal kod dəyişməz saxlanıldı.
        </ToolNote>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ToolStat label="Əvvəl" value={formatBytes(result.inputBytes)} />
        <ToolStat label="Sonra" value={formatBytes(result.outputBytes)} tone="accent" />
        <ToolStat label="Qazanc" value={savingsLabel} tone="accent" />
        <ToolStat
          label="Sintaksis"
          value={result.syntaxOk ? "keçdi" : "keçmədi"}
          note="new Function() ilə yoxlanılır, icra edilmir"
        />
      </div>

      <ToolResultPanel
        title="Nəticə"
        hint={`${result.applied.length} qayda tətbiq olundu`}
        action={<CopyButton value={result.output} label="Kodu kopyala" />}
      >
        <div className="space-y-3 p-4">
          <ToolOutput className="max-h-72 overflow-y-auto">{result.output || ""}</ToolOutput>

          {result.ruleSavings.length > 0 && (
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
                  {result.ruleSavings.map((entry) => (
                    <tr key={entry.rule} className="border-b border-result-rule last:border-0">
                      <td className="p-1.5">{JS_MINIFY_RULE_LABELS[entry.rule]}</td>
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
        Kod heç yerə göndərilmir: bütün qaydalar mətn üzərində, brauzerin öz yaddaşında işləyir.
        Dəyişən adları qısaldılmır: yalnız şərh və boşluq atılır, tam parser tələb edən mangling
        bu alətin əhatəsindən kənardır.
      </ToolNote>
    </div>
  );
}
