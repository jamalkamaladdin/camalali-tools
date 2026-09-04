"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { formatBytes } from "../shared/format";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import {
  optimizeSvg,
  SVG_OPTIMIZE_RULE_LABELS,
  SVG_OPTIMIZE_RULES,
  type SvgOptimizeRule,
} from "../lib/svg-optimallasdirici";

const SAMPLE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Created with an editor -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 100.000 100.000" inkscape:version="1.0">
  <metadata><rdf:RDF /></metadata>
  <title>Nümunə ikon</title>
  <g>
    <g></g>
    <path id="itaq-1" d="M 10.500 20.000 L 0.500 0.100 Z" fill="#ffffff" opacity="1" />
    <circle id="merkez" cx="50.000" cy="50.000" r="10.000" fill="rgb(255, 0, 0)" stroke-opacity="1" />
    <use href="#merkez" x="0" y="0" />
  </g>
</svg>`;

function ruleSetFrom(rules: Iterable<SvgOptimizeRule>): Set<SvgOptimizeRule> {
  return new Set(rules);
}

export function SvgOptimallasdiriciTool() {
  const [source, setSource] = useState(SAMPLE_SVG);
  const [enabledRules, setEnabledRules] = useState<Set<SvgOptimizeRule>>(() =>
    ruleSetFrom(SVG_OPTIMIZE_RULES),
  );
  const [precision, setPrecision] = useState(2);

  const toggleRule = (rule: SvgOptimizeRule) => {
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

  const result = useMemo(
    () => optimizeSvg(source, enabledRules, precision),
    [source, enabledRules, precision],
  );

  const savingsLabel =
    result.inputBytes > 0
      ? `${result.savingsPercent >= 0 ? "-" : "+"}${Math.abs(result.savingsPercent).toFixed(1)}%`
      : "";

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Qaydalar"
          hint={`${enabledRules.size}/${SVG_OPTIMIZE_RULES.length} aktiv`}
          action={
            <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
              Dəqiqlik
              <ToolInput
                type="number"
                min={0}
                max={6}
                value={precision}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isNaN(next)) return;
                  setPrecision(Math.min(6, Math.max(0, Math.round(next))));
                }}
                className="h-8 w-16 px-2 text-xs"
              />
              onluq
            </label>
          }
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-2 p-4">
          {SVG_OPTIMIZE_RULES.map((rule) => (
            <label key={rule} className="flex items-start gap-2 font-ui text-xs text-muted">
              <input
                type="checkbox"
                checked={enabledRules.has(rule)}
                onChange={() => toggleRule(rule)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
              />
              <span>{SVG_OPTIMIZE_RULE_LABELS[rule]}</span>
            </label>
          ))}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Mənbə SVG"
          action={
            <ToolButton size="chip" onClick={() => setSource(SAMPLE_SVG)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="SVG mətni" htmlFor="svg-opt-source">
            <ToolTextArea
              id="svg-opt-source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              rows={10}
              spellCheck={false}
              placeholder="<svg ...>...</svg>"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {!result.wellFormed && source.trim() !== "" && (
        <ToolNote tone="accent" title="SVG kimi tanınmadı">
          Mətndə etibarlı bir `&lt;svg&gt;` tapılmadı: heç bir qayda tətbiq olunmadı.
        </ToolNote>
      )}

      {result.wellFormed && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ToolStat label="Əvvəl" value={formatBytes(result.inputBytes)} />
            <ToolStat label="Sonra" value={formatBytes(result.outputBytes)} tone="accent" />
            <ToolStat label="Qazanc" value={savingsLabel} tone="accent" />
            <ToolStat
              label="Qrafik elementlər"
              value={`${result.elementCountAfter}/${result.elementCountBefore}`}
              note="əvvəl/sonra sayı eynidirsə heç nə itməyib"
            />
          </div>

          <ToolResultPanel
            title="Nəticə"
            hint={`${result.applied.length} qayda tətbiq olundu`}
            action={<CopyButton value={result.output} label="SVG-ni kopyala" />}
          >
            <div className="space-y-3 p-4">
              <ToolOutput className="max-h-64 overflow-y-auto">{result.output}</ToolOutput>

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
                        <td className="p-1.5">{SVG_OPTIMIZE_RULE_LABELS[entry.rule]}</td>
                        <td className="p-1.5 text-right tabular-nums">
                          {entry.bytesSaved > 0 ? `-${formatBytes(entry.bytesSaved)}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </ToolResultPanel>
        </>
      )}

      <ToolNote>
        SVG heç yerə göndərilmir: bütün qaydalar mətn üzərində, brauzerin öz yaddaşında işləyir.
      </ToolNote>
    </div>
  );
}
