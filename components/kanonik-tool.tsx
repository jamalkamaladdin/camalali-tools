"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolLabel,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolTextArea,
} from "./ui";
import {
  buildCanonicalTag,
  canonicalise,
  CANON_RULE_LABELS,
  CANON_RULES,
  groupDuplicates,
  type CanonResult,
  type CanonRule,
} from "../lib/kanonik";

/*
 * Three URLs written to demonstrate the tool's one job: all three normalise
 * to the same canonical form despite looking different on the page — a
 * tracking parameter, a bare trailing slash and an explicit `index.html` all
 * point at the same place. The fourth line has nothing in common with the
 * others and stays its own group of one, which is the "not every URL is a
 * duplicate" half of the same demonstration.
 */
const SAMPLE_URLS = `https://WWW.Example.AZ:443/mehsul/telefon/?utm_source=instagram
https://example.az/mehsul/telefon
https://example.az/mehsul/telefon/index.html
https://example.az/haqqimizda`;

function ruleSetFrom(rules: Iterable<CanonRule>): Set<CanonRule> {
  return new Set(rules);
}

export function KanonikTool() {
  const [urlsText, setUrlsText] = useState(SAMPLE_URLS);
  const [enabledRules, setEnabledRules] = useState<Set<CanonRule>>(() => ruleSetFrom(CANON_RULES));

  const toggleRule = (rule: CanonRule) => {
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

  const lines = useMemo(
    () => urlsText.split("\n").map((line) => line.trim()).filter((line) => line !== ""),
    [urlsText],
  );

  const results: CanonResult[] = useMemo(
    () => lines.map((line) => canonicalise(line, enabledRules)),
    [lines, enabledRules],
  );

  const duplicateGroups = useMemo(() => groupDuplicates(results), [results]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Qaydalar"
          hint={`${enabledRules.size}/${CANON_RULES.length} aktiv`}
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2 p-4">
          {CANON_RULES.map((rule) => (
            <label key={rule} className="flex items-start gap-2 font-ui text-xs text-muted">
              <input
                type="checkbox"
                checked={enabledRules.has(rule)}
                onChange={() => toggleRule(rule)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
              />
              <span>{CANON_RULE_LABELS[rule]}</span>
            </label>
          ))}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="URL siyahısı"
          hint="hər sətirdə bir URL"
          action={
            <ToolButton size="chip" onClick={() => setUrlsText(SAMPLE_URLS)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="URL-lər" htmlFor="kanonik-urls">
            <ToolTextArea
              id="kanonik-urls"
              value={urlsText}
              onChange={(event) => setUrlsText(event.target.value)}
              rows={6}
              className="font-mono"
              spellCheck={false}
              placeholder="https://sayt.com/yol/"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {results.length > 0 && (
        <ToolResultPanel title="Nəticə" hint={`${results.length} sətir`}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-ui text-xs">
              <thead>
                <tr className="border-b border-result-rule text-left text-muted">
                  <th scope="col" className="p-2 font-normal">
                    Orijinal
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    Kanonik
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    Tətbiq olunan qaydalar
                  </th>
                  <th scope="col" className="p-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {results.map((result, index) => (
                  <tr key={index} className="border-b border-result-rule align-top last:border-0">
                    <td className="max-w-64 p-2 font-mono break-all">{result.input || "—"}</td>
                    {result.error ? (
                      <td className="p-2 text-accent-text" colSpan={2}>
                        {result.error}
                      </td>
                    ) : (
                      <>
                        <td className="max-w-64 p-2 font-mono break-all">{result.canonical}</td>
                        <td className="p-2">
                          {result.applied.length === 0 ? (
                            <span className="text-muted">dəyişiklik yoxdur</span>
                          ) : (
                            <span className="flex flex-col gap-0.5">
                              {result.applied.map((rule) => (
                                <span key={rule}>{CANON_RULE_LABELS[rule]}</span>
                              ))}
                            </span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="p-2">
                      {result.canonical && (
                        <CopyButton value={buildCanonicalTag(result.canonical)} label="teq kopyala" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolResultPanel>
      )}

      {duplicateGroups.length > 0 && (
        <ToolPanel>
          <ToolPanelHeader
            title="Eyni səhifəyə düşənlər"
            hint={`${duplicateGroups.length} qrup`}
          />
          <div className="space-y-3 p-4">
            {duplicateGroups.map((group) => (
              <div key={group.canonical} className="rounded border border-rule p-3">
                <ToolLabel>Kanonik</ToolLabel>
                <p className="mt-1 font-mono text-sm break-all">{group.canonical}</p>
                <ToolLabel className="mt-3">
                  {group.inputs.length} URL bu formaya düşür
                </ToolLabel>
                <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted">
                  {group.inputs.map((input, index) => (
                    <li key={index} className="break-all">
                      {input}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ToolPanel>
      )}

      {results.length === 0 && (
        <ToolNote tone="info">Yoxlamaq üçün ən azı bir URL yaz.</ToolNote>
      )}
    </div>
  );
}
