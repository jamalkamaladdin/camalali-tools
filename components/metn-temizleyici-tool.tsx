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
import {
  cleanupText,
  CLEANUP_RULE_LABELS,
  CLEANUP_RULES,
  type CleanupRuleId,
} from "../lib/metn-temizleyici";

/*
 * Carries one of every rule this tool finds: a zero-width space hidden mid
 * word, a non-breaking space, curly quotes, a long dash, a doubled space, a
 * trailing space at the end of a line, and a run of four blank lines. Typed
 * as escapes in this file's own source for the same reason the library file
 * gives — a literal invisible character here would risk being silently lost
 * on the way into the page.
 */
const SAMPLE_TEXT =
  "Bu m\u0259tnd\u0259 bir s\u00f6z\u00fcn ortas\u0131nda g\u200B\u00f6r\u00fcnm\u0259z bo\u015fluq var, bir q\u0131r\u0131lmayan\u00a0bo\u015fluq da.\n" +
  "A\u011f\u0131ll\u0131 d\u0131rnaqlar: \u201csalam\u201d v\u0259 \u2018d\u00fcnya\u2019 \u2014 uzun tire il\u0259.\n" +
  "\u0130ki  bo\u015fluq  burada,   s\u0259tir sonunda da bo\u015fluq var.   \n\n\n\n\n" +
  "Be\u015f bo\u015f s\u0259tird\u0259n sonra bu s\u0259tir g\u0259lir.";

function ruleSetFrom(rules: Iterable<CleanupRuleId>): Set<CleanupRuleId> {
  return new Set(rules);
}

export function MetnTemizleyiciTool() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [enabledRules, setEnabledRules] = useState<Set<CleanupRuleId>>(() => ruleSetFrom(CLEANUP_RULES));

  const toggleRule = (rule: CleanupRuleId) => {
    setEnabledRules((prev) => {
      const next = new Set(prev);
      if (next.has(rule)) next.delete(rule);
      else next.add(rule);
      return next;
    });
  };

  const result = useMemo(() => cleanupText(text, enabledRules), [text, enabledRules]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Qaydalar" hint={`${enabledRules.size}/${CLEANUP_RULES.length} aktiv`} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-2 p-4">
          {CLEANUP_RULES.map((rule) => (
            <label key={rule} className="flex items-start gap-2 font-ui text-xs text-muted">
              <input
                type="checkbox"
                checked={enabledRules.has(rule)}
                onChange={() => toggleRule(rule)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
              />
              <span>
                {CLEANUP_RULE_LABELS[rule]}
                {result.countsByRule[rule] > 0 && (
                  <span className="ml-1 tabular-nums text-accent-text">({result.countsByRule[rule]})</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Mətn"
          hint="yapışdır və ya yaz"
          action={
            <ToolButton size="chip" onClick={() => setText(SAMPLE_TEXT)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="Mətn" htmlFor="metn-temizleyici-input">
            <ToolTextArea
              id="metn-temizleyici-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              placeholder="Təmizlənəcək mətni yapışdır…"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {result.findings.length > 0 ? (
        <ToolResultPanel title="Tapılanlar" hint={`${result.findings.length} yer`}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-ui text-xs">
              <thead>
                <tr className="border-b border-result-rule text-left text-muted">
                  <th scope="col" className="p-2 font-normal">
                    Qayda
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    Sətir:sütun
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    Nə tapıldı
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.findings.map((finding, index) => (
                  <tr key={index} className="border-b border-result-rule last:border-0">
                    <td className="p-2">{CLEANUP_RULE_LABELS[finding.rule]}</td>
                    <td className="p-2 font-mono tabular-nums text-muted">
                      {finding.line}:{finding.column}
                    </td>
                    <td className="p-2 font-mono">{finding.display}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolResultPanel>
      ) : (
        <ToolNote tone="info">Aktiv qaydalara uyğun heç nə tapılmadı.</ToolNote>
      )}

      <ToolResultPanel
        title="Təmizlənmiş mətn"
        hint={result.output === text ? "dəyişiklik yoxdur" : "dəyişdirildi"}
        action={<CopyButton value={result.output} label="mətni kopyala" />}
      >
        <div className="p-4">
          <ToolOutput>{result.output || ""}</ToolOutput>
        </div>
      </ToolResultPanel>
    </div>
  );
}
