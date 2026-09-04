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
import {
  HTML_MINIFY_RULE_LABELS,
  HTML_MINIFY_RULES,
  minifyHtml,
  type HtmlMinifyRule,
} from "../lib/html-sixisdirici";

/*
 * Written to demonstrate every rule at once: a dropped comment next to a
 * preserved conditional one, a safely-unquotable attribute next to one
 * that must stay quoted, a boolean attribute, an inline <style> block, and
 * a <pre> block whose internal spacing must survive untouched.
 */
const SAMPLE_HTML = `<!-- drop me -->
<!--[if IE]><p>old browser</p><![endif]-->
<div class="card" title="salam dünya">
  <input type="checkbox" checked="checked">
  <style>.card { color: #ffffff; }</style>
  <pre>  line one
  line two  </pre>
</div>
`;

function ruleSetFrom(rules: Iterable<HtmlMinifyRule>): Set<HtmlMinifyRule> {
  return new Set(rules);
}

export function HtmlSixisdiriciTool() {
  const [source, setSource] = useState(SAMPLE_HTML);
  const [enabledRules, setEnabledRules] = useState<Set<HtmlMinifyRule>>(() =>
    ruleSetFrom(HTML_MINIFY_RULES),
  );

  const toggleRule = (rule: HtmlMinifyRule) => {
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

  const result = useMemo(() => minifyHtml(source, enabledRules), [source, enabledRules]);

  const savingsLabel =
    result.inputBytes > 0
      ? `${result.savingsPercent >= 0 ? "-" : "+"}${Math.abs(result.savingsPercent).toFixed(1)}%`
      : "";

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Qaydalar"
          hint={`${enabledRules.size}/${HTML_MINIFY_RULES.length} aktiv`}
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-2 p-4">
          {HTML_MINIFY_RULES.map((rule) => (
            <label key={rule} className="flex items-start gap-2 font-ui text-xs text-muted">
              <input
                type="checkbox"
                checked={enabledRules.has(rule)}
                onChange={() => toggleRule(rule)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
              />
              <span>{HTML_MINIFY_RULE_LABELS[rule]}</span>
            </label>
          ))}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Mənbə HTML"
          action={
            <ToolButton size="chip" onClick={() => setSource(SAMPLE_HTML)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="HTML mətni" htmlFor="html-sixisdirici-source">
            <ToolTextArea
              id="html-sixisdirici-source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              rows={12}
              spellCheck={false}
              placeholder="<div>...</div>"
            />
          </ToolField>
        </div>
      </ToolPanel>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ToolStat label="Əvvəl" value={formatBytes(result.inputBytes)} />
        <ToolStat label="Sonra" value={formatBytes(result.outputBytes)} tone="accent" />
        <ToolStat label="Qazanc" value={savingsLabel} tone="accent" />
        <ToolStat
          label="Teq sayı"
          value={`${result.tagCountAfter}/${result.tagCountBefore}`}
          note="əvvəl/sonra sayı eynidirsə heç bir teq itməyib"
        />
      </div>

      <ToolResultPanel
        title="Nəticə"
        hint={`${result.applied.length} qayda tətbiq olundu`}
        action={<CopyButton value={result.output} label="HTML-i kopyala" />}
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
                      <td className="p-1.5">{HTML_MINIFY_RULE_LABELS[entry.rule]}</td>
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
        HTML heç yerə göndərilmir: <code>{"<style>"}</code>/<code>{"<script>"}</code> içinin
        sıxılması daxil, hər şey brauzerin öz yaddaşında işləyir.{" "}
        <code>{"<pre>"}</code>, <code>{"<textarea>"}</code> və <code>{"<code>"}</code> içi heç bir
        qaydadan toxunulmur.
      </ToolNote>
    </div>
  );
}
